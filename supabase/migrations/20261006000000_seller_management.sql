begin;

create table public.seller_fulfillments (
  order_id uuid not null references public.orders(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment','checking','packaging','shipping','delivered','completed','cancelled')),
  accepted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (order_id, seller_id)
);
alter table public.seller_fulfillments enable row level security;
grant select on public.seller_fulfillments to authenticated;
create policy "Sellers read own fulfillment" on public.seller_fulfillments
  for select to authenticated using (seller_id = auth.uid() or public.is_admin());
insert into public.seller_fulfillments(order_id, seller_id, status)
select distinct oi.order_id, oi.seller_id, o.order_status
from public.order_items oi join public.orders o on o.id = oi.order_id
where oi.seller_id is not null;

create function public.seed_seller_fulfillment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.seller_id is not null then
    insert into public.seller_fulfillments(order_id, seller_id, status)
    select new.order_id, new.seller_id, o.order_status from public.orders o where o.id = new.order_id
    on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger seed_seller_fulfillment after insert on public.order_items
for each row execute function public.seed_seller_fulfillment();

create function public.sync_seller_fulfillment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.order_status is distinct from old.order_status and (
    new.order_status in ('cancelled','completed') or public.is_admin()
    or coalesce(auth.role(),'') <> 'authenticated'
    or (old.order_status = 'awaiting_payment' and new.order_status = 'checking')
  ) then
    update public.seller_fulfillments set status = new.order_status, updated_at = now()
    where order_id = new.id;
  end if;
  return new;
end;
$$;
create trigger sync_seller_fulfillment after update on public.orders
for each row execute function public.sync_seller_fulfillment();

create function public.seller_order_stage(p_order_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case min(case status when 'checking' then 1 when 'packaging' then 2
    when 'shipping' then 3 when 'delivered' then 4 when 'completed' then 5 else 0 end)
    when 1 then 'checking' when 2 then 'packaging' when 3 then 'shipping'
    when 4 then 'delivered' when 5 then 'completed' else 'awaiting_payment' end
  from public.seller_fulfillments where order_id = p_order_id;
$$;

create function public.seller_transition_allowed(p_order_id uuid, p_status text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.seller_fulfillments f join public.profiles p on p.id = f.seller_id
    where f.order_id = p_order_id and f.seller_id = auth.uid() and p.role = 'seller')
    and p_status = public.seller_order_stage(p_order_id);
$$;

create or replace function public.protect_gateway_order()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.payment_provider = 'xendit' and coalesce(auth.role(), '') = 'authenticated' then
    if new.payment_status is distinct from old.payment_status then
      raise exception 'Status pembayaran Xendit diperbarui otomatis.';
    end if;
    if new.order_status is distinct from old.order_status then
      if not (old.payment_status = 'confirmed' and (
        ((public.is_admin() or public.seller_transition_allowed(old.id, new.order_status))
          and (old.order_status, new.order_status) in
          (('checking','packaging'),('packaging','shipping'),('shipping','delivered')))
        or (old.buyer_id = auth.uid() and old.order_status = 'delivered' and new.order_status = 'completed')
      )) then raise exception 'Perubahan status pesanan tidak diizinkan.'; end if;
    end if;
  end if;
  return new;
end;
$$;

create function public.seller_orders() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.profiles where id = auth.uid() and role = 'seller') then
    raise exception 'Masuk sebagai penjual.';
  end if;
  return coalesce((select jsonb_agg(row_data order by created_at desc) from (
    select o.created_at, jsonb_build_object('id', o.id, 'buyer_name', o.buyer_name,
      'phone', o.phone, 'shipping_address', o.shipping_address, 'payment_status', o.payment_status,
      'order_status', f.status, 'accepted_at', f.accepted_at, 'payment_mode', o.payment_mode,
      'created_at', o.created_at, 'total', (select sum(i.unit_price::bigint * i.quantity) from public.order_items i where i.order_id = o.id and i.seller_id = auth.uid()),
      'order_items', (select jsonb_agg(jsonb_build_object('item_name', i.item_name, 'quantity', i.quantity,
        'unit_price', i.unit_price, 'image_url', i.image_url)) from public.order_items i where i.order_id = o.id and i.seller_id = auth.uid())) as row_data
    from public.orders o join public.seller_fulfillments f on f.order_id = o.id
    where f.seller_id = auth.uid()
  ) rows_for_seller), '[]'::jsonb);
end;
$$;

create function public.advance_seller_order(p_order_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype; v_status text; v_stage text;
begin
  if not exists(select 1 from public.profiles where id = auth.uid() and role = 'seller') then raise exception 'Masuk sebagai penjual.'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  select status into v_status from public.seller_fulfillments
    where order_id = p_order_id and seller_id = auth.uid() for update;
  if not found then raise exception 'Pesanan bukan milik penjual ini.'; end if;
  if v_order.payment_status <> 'confirmed' or v_order.order_status in ('cancelled','completed') then
    raise exception 'Pesanan belum dibayar atau sudah ditutup.';
  end if;
  if v_status = p_status then return; end if;
  if (v_status, p_status) not in (('checking','packaging'),('packaging','shipping'),('shipping','delivered')) then
    raise exception 'Urutan status pesanan tidak sesuai.';
  end if;
  update public.seller_fulfillments set status = p_status, updated_at = now(),
    accepted_at = case when p_status = 'packaging' then coalesce(accepted_at, now()) else accepted_at end
    where order_id = p_order_id and seller_id = auth.uid();
  v_stage := public.seller_order_stage(p_order_id);
  if v_stage <> v_order.order_status then update public.orders set order_status = v_stage where id = p_order_id; end if;
end;
$$;

create function public.update_seller_product(p_product_id bigint, p_product jsonb) returns public.products
language plpgsql security definer set search_path = '' as $$
declare v_product public.products%rowtype; v_image text;
begin
  if not exists(select 1 from public.profiles where id = auth.uid() and role = 'seller') then raise exception 'Masuk sebagai penjual.'; end if;
  select * into v_product from public.products where id = p_product_id and seller_id = auth.uid() for update;
  if not found then raise exception 'Produk bukan milik penjual ini.'; end if;
  if length(trim(coalesce(p_product->>'name',''))) not between 2 and 120
    or length(trim(coalesce(p_product->>'description',''))) not between 5 and 1000
    or length(trim(coalesce(p_product->>'motif',''))) not between 1 and 100
    or length(trim(coalesce(p_product->>'size',''))) not between 1 and 80
    or length(trim(coalesce(p_product->>'material',''))) not between 1 and 100
    or coalesce((p_product->>'price')::integer,0) <= 0
    or coalesce((p_product->>'stock')::integer,-1) < 0 then raise exception 'Data produk tidak sesuai.'; end if;
  v_image := p_product->>'image_url';
  if v_image is not null and v_image !~ '^https://res[.]cloudinary[.]com/' then raise exception 'Gunakan foto dari Cloudinary.'; end if;
  update public.products set name = trim(p_product->>'name'), price = (p_product->>'price')::integer,
    stock = (p_product->>'stock')::integer, description = trim(p_product->>'description'),
    motif = trim(p_product->>'motif'), size = trim(p_product->>'size'), material = trim(p_product->>'material'),
    image_url = coalesce(v_image, v_product.image_url), status = 'pending', review_note = null, updated_at = now()
    where id = p_product_id returning * into v_product;
  return v_product;
end;
$$;

revoke all on function public.seed_seller_fulfillment(), public.sync_seller_fulfillment(), public.seller_order_stage(uuid), public.seller_transition_allowed(uuid,text), public.seller_orders(), public.advance_seller_order(uuid,text), public.update_seller_product(bigint,jsonb) from public, anon, authenticated;
grant execute on function public.seller_transition_allowed(uuid,text), public.seller_orders(), public.advance_seller_order(uuid,text), public.update_seller_product(bigint,jsonb) to authenticated;
commit;
