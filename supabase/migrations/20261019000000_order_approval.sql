begin;
-- Existing orders keep their current status; approval applies to new checkouts.
alter table public.orders drop constraint orders_order_status_check;
alter table public.orders add constraint orders_order_status_check check
 (order_status in ('awaiting_approval','awaiting_payment','checking','packaging','shipping','delivered','completed','cancelled'));
alter table public.seller_fulfillments drop constraint seller_fulfillments_status_check;
alter table public.seller_fulfillments add constraint seller_fulfillments_status_check check
 (status in ('awaiting_approval','awaiting_payment','checking','packaging','shipping','delivered','completed','cancelled'));
alter table public.seller_fulfillments add column approved_at timestamptz;

create function public.order_approval_transition_allowed(p_order_id uuid, p_status text) returns boolean
language sql stable security definer set search_path = '' as $$
 select (public.is_admin() or exists(select 1 from public.seller_fulfillments f join public.profiles p on p.id=f.seller_id
   where f.order_id=p_order_id and f.seller_id=auth.uid() and p.role='seller'))
 and case p_status
   when 'awaiting_payment' then not exists(select 1 from public.seller_fulfillments where order_id=p_order_id and approved_at is null)
   when 'cancelled' then exists(select 1 from public.seller_fulfillments where order_id=p_order_id and status='cancelled')
   else false end;
$$;
revoke all on function public.order_approval_transition_allowed(uuid,text) from public,anon,authenticated;
grant execute on function public.order_approval_transition_allowed(uuid,text) to authenticated;
create or replace function public.protect_gateway_order()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.payment_provider = 'xendit' and coalesce(auth.role(), '') = 'authenticated' then
    if new.payment_status is distinct from old.payment_status then
      raise exception 'Status pembayaran Xendit diperbarui otomatis.';
    end if;
    if new.order_status is distinct from old.order_status then
      if not ((old.order_status = 'awaiting_approval' and old.payment_status = 'waiting' and public.order_approval_transition_allowed(old.id, new.order_status)) or (old.payment_status = 'confirmed' and (
        ((public.is_admin() or public.seller_transition_allowed(old.id, new.order_status))
          and (old.order_status, new.order_status) in
          (('checking','packaging'),('packaging','shipping'),('shipping','delivered')))
        or (old.buyer_id = auth.uid() and old.order_status = 'delivered' and new.order_status = 'completed')
      ))) then raise exception 'Perubahan status pesanan tidak diizinkan.'; end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.sync_seller_fulfillment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.order_status is distinct from old.order_status and (
    (old.order_status = 'awaiting_approval' and new.order_status = 'awaiting_payment') or new.order_status in ('cancelled','completed') or public.is_admin()
    or coalesce(auth.role(),'') <> 'authenticated'
    or (old.order_status = 'awaiting_payment' and new.order_status = 'checking')
  ) then
    update public.seller_fulfillments set status = new.order_status, updated_at = now()
    where order_id = new.id;
  end if;
  return new;
end;
$$;
create or replace function public.create_order(
  p_buyer_name text,
  p_phone text,
  p_shipping_address text,
  p_payment_method text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_product public.products%rowtype;
  v_item jsonb;
  v_product_id bigint;
  v_quantity integer;
  v_subtotal bigint := 0;
  v_buyer_id uuid := auth.uid();
begin
  if v_buyer_id is null then
    raise exception 'Silakan masuk untuk membuat pesanan.';
  end if;
  if length(trim(p_buyer_name)) < 2 or length(trim(p_buyer_name)) > 80 then
    raise exception 'Nama penerima harus 2-80 karakter.';
  end if;
  if length(trim(p_phone)) < 8 or length(trim(p_phone)) > 20 then
    raise exception 'Nomor telepon tidak valid.';
  end if;
  if length(trim(p_shipping_address)) < 10 or length(trim(p_shipping_address)) > 300 then
    raise exception 'Alamat pengiriman harus 10-300 karakter.';
  end if;
  if p_payment_method not in ('QRIS', 'Transfer bank', 'Dompet digital') then
    raise exception 'Metode pembayaran tidak valid.';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Pesanan tidak memiliki produk.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) as item(value) loop
    v_product_id := (v_item ->> 'product_id')::bigint;
    v_quantity := (v_item ->> 'quantity')::integer;
    if v_quantity < 1 then
      raise exception 'Jumlah produk tidak valid.';
    end if;

    select * into v_product
    from public.products
    where id = v_product_id and status = 'approved' and deleted_at is null
    for update;
    if not found then
      raise exception 'Salah satu produk sudah tidak tersedia.';
    end if;
    if v_product.stock < v_quantity then
      raise exception 'Stok % tidak mencukupi.', v_product.name;
    end if;

    update public.products set stock = stock - v_quantity, updated_at = now()
    where id = v_product.id;
    v_subtotal := v_subtotal + (v_product.price::bigint * v_quantity);
  end loop;

  insert into public.orders (
    buyer_id, buyer_name, phone, shipping_address, payment_method,
    payment_status, order_status, subtotal, shipping_cost, total
  ) values (
    v_buyer_id, trim(p_buyer_name), trim(p_phone), trim(p_shipping_address), p_payment_method,
    'waiting', 'awaiting_approval', v_subtotal, 0, v_subtotal
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) as item(value) loop
    v_product_id := (v_item ->> 'product_id')::bigint;
    v_quantity := (v_item ->> 'quantity')::integer;
    select * into v_product from public.products where id = v_product_id;
    insert into public.order_items (order_id, product_id, seller_id, item_name, unit_price, quantity, image_url)
    values (v_order_id, v_product.id, v_product.seller_id, v_product.name, v_product.price, v_quantity, v_product.image_url);
  end loop;

  return v_order_id;
end;
$$;



create function public.review_order(p_order_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype; v_admin boolean := public.is_admin();
begin
 if auth.uid() is null or p_approve is null then raise exception 'Sesi dan keputusan diperlukan.'; end if;
 select * into v_order from public.orders where id=p_order_id for update;
 if not found then raise exception 'Pesanan tidak ditemukan.'; end if;
 if not v_admin and not exists(select 1 from public.seller_fulfillments f join public.profiles p on p.id=f.seller_id
   where f.order_id=p_order_id and f.seller_id=auth.uid() and p.role='seller') then
   raise exception 'Pesanan bukan milik penjual ini.';
 end if;
 if v_order.order_status <> 'awaiting_approval' or v_order.payment_status <> 'waiting' then
   raise exception 'Pesanan sudah ditinjau atau ditutup.';
 end if;
 if not v_admin and exists(select 1 from public.seller_fulfillments where order_id=p_order_id and seller_id=auth.uid() and approved_at is not null) then
   return;
 end if;
 update public.seller_fulfillments set
   status=case when p_approve then 'awaiting_payment' else 'cancelled' end,
   approved_at=case when p_approve then now() else null end, updated_at=now()
 where order_id=p_order_id and (v_admin or seller_id=auth.uid());
 if not p_approve then
   -- Admin can reject legacy products without a seller fulfillment, too.
   if not exists(select 1 from public.seller_fulfillments where order_id=p_order_id) then
     raise exception 'Pesanan tidak memiliki penjual. Hubungi pengelola.';
   end if;
   update public.orders set order_status='cancelled' where id=p_order_id;
 elsif not exists(select 1 from public.seller_fulfillments where order_id=p_order_id and approved_at is null) then
   update public.orders set order_status='awaiting_payment' where id=p_order_id;
 end if;
end;
$$;
revoke all on function public.review_order(uuid,boolean) from public,anon,authenticated;
grant execute on function public.review_order(uuid,boolean) to authenticated;
create or replace function public.seller_orders() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.profiles where id = auth.uid() and role = 'seller') then
    raise exception 'Masuk sebagai penjual.';
  end if;
  return coalesce((select jsonb_agg(row_data order by created_at desc) from (
    select o.created_at, jsonb_build_object('id', o.id, 'buyer_name', o.buyer_name,
      'phone', o.phone, 'shipping_address', o.shipping_address, 'payment_status', o.payment_status,
      'order_status', f.status, 'overall_status', o.order_status, 'accepted_at', f.accepted_at, 'payment_mode', o.payment_mode,
      'created_at', o.created_at, 'total', (select sum(i.unit_price::bigint * i.quantity) from public.order_items i where i.order_id = o.id and i.seller_id = auth.uid()),
      'order_items', (select jsonb_agg(jsonb_build_object('product_id', i.product_id, 'item_name', i.item_name, 'quantity', i.quantity,
        'unit_price', i.unit_price, 'image_url', i.image_url)) from public.order_items i where i.order_id = o.id and i.seller_id = auth.uid())) as row_data
    from public.orders o join public.seller_fulfillments f on f.order_id = o.id
    where f.seller_id = auth.uid()
  ) rows_for_seller), '[]'::jsonb);
end;
$$;
commit;
