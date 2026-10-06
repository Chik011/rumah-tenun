begin;
alter table public.products add column deleted_at timestamptz;
drop policy "Public can read approved products" on public.products;
create policy "Public can read approved products" on public.products
  for select to anon, authenticated using (status = 'approved' and deleted_at is null);

create function public.seller_product_stock(p_product_id bigint, p_action text) returns integer
language plpgsql security definer set search_path = '' as $$
declare item public.products%rowtype; next_stock integer;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='seller') then raise exception 'Masuk sebagai penjual.'; end if;
  select * into item from public.products where id=p_product_id and seller_id=auth.uid() and deleted_at is null for update;
  if not found then raise exception 'Produk bukan milik penjual ini atau sudah dihapus.'; end if;
  next_stock := case p_action when 'minus' then item.stock-1 when 'plus' then item.stock+1 when 'empty' then 0 else null end;
  if next_stock is null or next_stock < 0 then raise exception 'Perubahan stok tidak valid.'; end if;
  update public.products set stock=next_stock, updated_at=now() where id=item.id;
  return next_stock;
end;
$$;
create function public.seller_archive_product(p_product_id bigint, p_restore boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='seller') then raise exception 'Masuk sebagai penjual.'; end if;
  update public.products set deleted_at=case when p_restore then null else now() end, updated_at=now()
  where id=p_product_id and seller_id=auth.uid();
  if not found then raise exception 'Produk bukan milik penjual ini.'; end if;
end;
$$;
revoke all on function public.seller_product_stock(bigint,text), public.seller_archive_product(bigint,boolean) from public, anon;
grant execute on function public.seller_product_stock(bigint,text), public.seller_archive_product(bigint,boolean) to authenticated;
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
    'waiting', 'awaiting_payment', v_subtotal, 0, v_subtotal
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


create or replace function public.update_seller_product(p_product_id bigint, p_product jsonb) returns public.products
language plpgsql security definer set search_path = '' as $$
declare v_product public.products%rowtype; v_image text; v_maker text; v_story text;
begin
  if not exists(select 1 from public.profiles where id = auth.uid() and role = 'seller') then raise exception 'Masuk sebagai penjual.'; end if;
  select * into v_product from public.products where id = p_product_id and seller_id = auth.uid() and deleted_at is null for update;
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

commit;
