begin;
create policy "Sellers read their products" on public.products for select to authenticated using(seller_id=auth.uid());
create policy "Sellers insert their products" on public.products for insert to authenticated with check(seller_id=auth.uid() and exists(select 1 from public.profiles where id=auth.uid() and role='seller'));
create policy "Sellers update their draft products" on public.products for update to authenticated using(seller_id=auth.uid() and status in ('pending','needs_revision')) with check(seller_id=auth.uid() and status in ('pending','needs_revision'));
create policy "Sellers read own fulfillment" on public.seller_fulfillments for select to authenticated using(seller_id=auth.uid());
grant execute on function public.seller_product_stock(bigint,text), public.seller_archive_product(bigint,boolean), public.update_seller_product(bigint,jsonb), public.seller_orders(), public.advance_seller_order(uuid,text) to authenticated;
create or replace function public.seller_transition_allowed(p_order_id uuid, p_status text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.seller_fulfillments f join public.profiles p on p.id = f.seller_id
    where f.order_id = p_order_id and f.seller_id = auth.uid() and p.role = 'seller')
    and p_status = public.seller_order_stage(p_order_id);
$$;
commit;
