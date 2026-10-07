begin;
-- A buyer may still open the cloth story from their paid order after unpublishing.
create policy "Buyers read purchased cloth details" on public.products
for select to authenticated using (
 exists(select 1 from public.order_items i join public.orders o on o.id=i.order_id
   where i.product_id=products.id and o.buyer_id=auth.uid() and o.payment_status='confirmed')
);
commit;
