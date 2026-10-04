grant update (order_status) on public.orders to authenticated;

drop policy if exists "Buyers can confirm received orders" on public.orders;
create policy "Buyers can confirm received orders"
  on public.orders for update to authenticated
  using (
    buyer_id = auth.uid()
    and order_status = 'delivered'
    and payment_status = 'confirmed'
  )
  with check (
    buyer_id = auth.uid()
    and order_status = 'completed'
    and payment_status = 'confirmed'
  );
