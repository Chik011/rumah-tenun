-- Attach the store's original, unowned catalogue to its existing seller.
-- Never transfer products or order items already owned by another seller.
begin;
do $$
declare v_seller uuid;
begin
  select p.id into v_seller from public.profiles p join auth.users u on u.id = p.id
    where u.email = 'penjual@rumah-tenun.example' and p.role = 'seller';
  if v_seller is null then raise exception 'Akun penjual toko belum tersedia.'; end if;
  update public.products set seller_id = v_seller where seller_id is null and id between 1 and 12;
  update public.order_items i set seller_id = v_seller from public.products p
    where i.product_id = p.id and p.seller_id = v_seller and i.seller_id is null and p.id between 1 and 12;
  insert into public.seller_fulfillments(order_id, seller_id, status)
    select distinct i.order_id, i.seller_id, o.order_status
    from public.order_items i join public.orders o on o.id = i.order_id
    where i.seller_id = v_seller on conflict do nothing;
end;
$$;
commit;
