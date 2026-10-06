begin;
alter table public.products
  add column maker_name text not null default '' check (length(maker_name) <= 160),
  add column story text not null default '' check (length(story) <= 4000);

create or replace function public.update_seller_product(p_product_id bigint, p_product jsonb) returns public.products
language plpgsql security definer set search_path = '' as $$
declare v_product public.products%rowtype; v_image text; v_maker text; v_story text;
begin
  if not exists(select 1 from public.profiles where id = auth.uid() and role = 'seller') then raise exception 'Masuk sebagai penjual.'; end if;
  select * into v_product from public.products where id = p_product_id and seller_id = auth.uid() for update;
  if not found then raise exception 'Produk bukan milik penjual ini.'; end if;
  v_maker := case when p_product ? 'maker_name' then trim(coalesce(p_product->>'maker_name','')) else v_product.maker_name end;
  v_story := case when p_product ? 'story' then trim(coalesce(p_product->>'story','')) else v_product.story end;
  if length(v_maker) > 160 or length(v_story) > 4000
    or length(trim(coalesce(p_product->>'name',''))) not between 2 and 120
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
    maker_name = v_maker, story = v_story,
    image_url = coalesce(v_image, v_product.image_url), status = 'pending', review_note = null, updated_at = now()
    where id = p_product_id returning * into v_product;
  return v_product;
end;
$$;
create or replace function public.seller_orders() returns jsonb
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
      'order_items', (select jsonb_agg(jsonb_build_object('product_id', i.product_id, 'item_name', i.item_name, 'quantity', i.quantity,
        'unit_price', i.unit_price, 'image_url', i.image_url)) from public.order_items i where i.order_id = o.id and i.seller_id = auth.uid())) as row_data
    from public.orders o join public.seller_fulfillments f on f.order_id = o.id
    where f.seller_id = auth.uid()
  ) rows_for_seller), '[]'::jsonb);
end;
$$;
commit;
