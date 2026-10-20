begin;
-- Admin supervises the marketplace; sellers own inventory operations.
drop policy if exists "Cooperative admins insert products" on public.products;
drop policy if exists "Admins can process orders" on public.orders;
revoke execute on function public.cooperative_product_stock(bigint,text), public.cooperative_archive_product(bigint,boolean), public.cooperative_update_product(bigint,jsonb) from authenticated,anon,public;
create function public.guard_admin_inventory() returns trigger language plpgsql set search_path='' as $$
begin
 if auth.role()='authenticated' and public.is_admin() and
   (to_jsonb(new)-array['status','review_note','updated_at']) is distinct from (to_jsonb(old)-array['status','review_note','updated_at']) then
   raise exception 'Admin hanya dapat memeriksa dan mengatur penayangan produk.';
 end if;
 return new;
end; $$;
create trigger guard_admin_inventory before update on public.products for each row execute function public.guard_admin_inventory();
create function public.seller_product_draft(p_product_id bigint) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and role='seller') then raise exception 'Akses penjual diperlukan.'; end if;
 update public.products set status='pending',updated_at=now() where id=p_product_id and seller_id=auth.uid() and deleted_at is null;
 if not found then raise exception 'Produk bukan milik penjual ini.'; end if;
end; $$;
revoke all on function public.seller_product_draft(bigint) from public,anon;
grant execute on function public.seller_product_draft(bigint) to authenticated;

alter table public.seller_fulfillments add column courier text not null default '' check(length(courier)<=80),
 add column tracking_number text not null default '' check(length(tracking_number)<=120),
 add column tracking_url text not null default '' check(length(tracking_url)<=1000);
create function public.save_shipment(p_order_id uuid,p_courier text,p_number text,p_url text,p_ship boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; f public.seller_fulfillments%rowtype;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and role='seller') then raise exception 'Akses penjual diperlukan.'; end if;
 select * into o from public.orders where id=p_order_id for update;
 select * into f from public.seller_fulfillments where order_id=p_order_id and seller_id=auth.uid() for update;
 if not found then raise exception 'Pesanan bukan milik penjual ini.'; end if;
 if o.payment_status<>'confirmed' or o.order_status in ('cancelled','completed') or f.status not in ('packaging','shipping','delivered') then raise exception 'Resi dapat diisi setelah pesanan dibayar dan diproses.'; end if;
 if length(trim(coalesce(p_courier,''))) not between 2 and 80 or length(trim(coalesce(p_number,''))) not between 3 and 120
   or length(coalesce(p_url,''))>1000 or coalesce(p_url,'') !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*([/:?#]|$)' or p_url ~ '[@[:space:]]' then
   raise exception 'Isi kurir, nomor resi, dan tautan pelacakan HTTPS yang valid.';
 end if;
 update public.seller_fulfillments set courier=trim(p_courier),tracking_number=trim(p_number),tracking_url=p_url,updated_at=now()
 where order_id=p_order_id and seller_id=auth.uid();
 if p_ship and f.status='packaging' then perform public.advance_seller_order(p_order_id,'shipping'); end if;
end; $$;
create function public.buyer_shipments() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('order_id',f.order_id,'seller_name',p.display_name,'courier',f.courier,
 'tracking_number',f.tracking_number,'tracking_url',f.tracking_url,'status',f.status)),'[]'::jsonb)
 from public.seller_fulfillments f join public.orders o on o.id=f.order_id join public.profiles p on p.id=f.seller_id
 where o.buyer_id=auth.uid() and f.tracking_number<>'';
$$;
revoke all on function public.save_shipment(uuid,text,text,text,boolean),public.buyer_shipments() from public,anon;
grant execute on function public.save_shipment(uuid,text,text,text,boolean),public.buyer_shipments() to authenticated;

create table public.order_notifications (
 id uuid primary key default gen_random_uuid(),recipient_id uuid not null references public.profiles(id) on delete cascade,
 order_id uuid not null references public.orders(id) on delete cascade,event_key text not null,title text not null,message text not null,
 read_at timestamptz,created_at timestamptz not null default now(),unique(recipient_id,event_key)
);
alter table public.order_notifications enable row level security;
grant select on public.order_notifications to authenticated;
create policy "Recipients read notifications" on public.order_notifications for select to authenticated using(recipient_id=auth.uid());
create index notification_recipient_unread on public.order_notifications(recipient_id,created_at desc) where read_at is null;
create function public.read_order_notification(p_id uuid default null) returns void language sql security definer set search_path='' as $$
 update public.order_notifications set read_at=now() where recipient_id=auth.uid() and read_at is null and (p_id is null or id=p_id);
$$;
revoke all on function public.read_order_notification(uuid) from public,anon;
grant execute on function public.read_order_notification(uuid) to authenticated;
create function public.notify_order_event() returns trigger language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; t text; m text;
begin
 if tg_table_name='seller_fulfillments' then
   select * into o from public.orders where id=new.order_id;
   if tg_op='INSERT' and new.status='awaiting_approval' then
     insert into public.order_notifications(recipient_id,order_id,event_key,title,message)
     values(new.seller_id,new.order_id,new.order_id||':new','Pesanan baru','Ada pesanan kain yang menunggu persetujuan Anda.') on conflict do nothing;
   elsif tg_op='UPDATE' and (new.tracking_number,new.tracking_url,new.courier) is distinct from (old.tracking_number,old.tracking_url,old.courier) and new.tracking_number<>'' then
     insert into public.order_notifications(recipient_id,order_id,event_key,title,message)
     values(o.buyer_id,o.id,o.id||':tracking:'||gen_random_uuid(),'Resi pengiriman tersedia','Penjual memperbarui resi. Buka pesanan untuk melihat kode dan tautan pelacakan.');
   end if;
 elsif tg_op='UPDATE' then
   if new.order_status is distinct from old.order_status then
     t:=case new.order_status when 'awaiting_payment' then 'Pesanan disetujui' when 'packaging' then 'Pesanan sedang dikemas'
       when 'shipping' then 'Pesanan sedang dikirim' when 'delivered' then 'Barang telah tiba' when 'cancelled' then 'Pesanan dibatalkan' end;
     m:=case new.order_status when 'awaiting_payment' then 'Penjual sudah menyetujui. Silakan lanjutkan pembayaran.'
       when 'cancelled' then 'Pesanan dibatalkan. Periksa rincian pesanan Anda.' else 'Ada perkembangan pesanan. Buka untuk melihat status terbaru.' end;
     if t is not null then insert into public.order_notifications(recipient_id,order_id,event_key,title,message)
       values(new.buyer_id,new.id,new.id||':status:'||new.order_status,t,m) on conflict do nothing; end if;
   end if;
   if new.payment_status='confirmed' and old.payment_status<>'confirmed' then
     insert into public.order_notifications(recipient_id,order_id,event_key,title,message)
     select f.seller_id,new.id,new.id||':paid','Pembayaran diterima','Pembeli sudah membayar. Pesanan siap diproses.' from public.seller_fulfillments f where f.order_id=new.id on conflict do nothing;
   end if;
 end if;
 return new;
end; $$;
create trigger notify_seller_order after insert or update on public.seller_fulfillments for each row execute function public.notify_order_event();
create trigger notify_buyer_order after update on public.orders for each row execute function public.notify_order_event();
insert into public.order_notifications(recipient_id,order_id,event_key,title,message)
 select buyer_id,id,id||':status:awaiting_payment','Pesanan siap dibayar','Buka pesanan untuk melanjutkan pembayaran.' from public.orders where order_status='awaiting_payment' and payment_status='waiting' on conflict do nothing;
insert into public.order_notifications(recipient_id,order_id,event_key,title,message)
 select seller_id,order_id,order_id||':new','Pesanan baru','Ada pesanan yang menunggu persetujuan Anda.' from public.seller_fulfillments where status='awaiting_approval' on conflict do nothing;

create table public.market_activity (
 id bigint generated always as identity primary key,actor_id uuid references public.profiles(id) on delete set null,
 entity text not null,entity_id text not null,action text not null,detail jsonb not null,created_at timestamptz not null default now()
);
alter table public.market_activity enable row level security;
grant select on public.market_activity to authenticated;
create policy "Admin reads activity" on public.market_activity for select to authenticated using(public.is_admin());
create function public.record_market_activity() returns trigger language plpgsql security definer set search_path='' as $$
declare a text; payload jsonb;
begin
 if tg_table_name='products' then
   if tg_op='UPDATE' and (new.name,new.price,new.stock,new.status,new.deleted_at,new.maker_name,new.story,new.image_url) is not distinct from (old.name,old.price,old.stock,old.status,old.deleted_at,old.maker_name,old.story,old.image_url) then return new; end if;
   a:=case when tg_op='INSERT' then 'Menambahkan produk' when new.deleted_at is not null then 'Mengarsipkan produk' when tg_op='UPDATE' and old.deleted_at is not null then 'Memulihkan produk' else 'Memperbarui produk' end;
   payload:=jsonb_build_object('name',new.name,'price',new.price,'stock',new.stock,'status',new.status,'seller_id',new.seller_id);
   insert into public.market_activity(actor_id,entity,entity_id,action,detail) values(auth.uid(),'product',new.id::text,a,payload);
 elsif tg_table_name='orders' then
   if tg_op='UPDATE' and (new.order_status,new.payment_status) is not distinct from (old.order_status,old.payment_status) then return new; end if;
   insert into public.market_activity(actor_id,entity,entity_id,action,detail) values(auth.uid(),'order',new.id::text,
     case when tg_op='INSERT' then 'Mengajukan pesanan' else 'Memperbarui pesanan' end,
     jsonb_build_object('buyer_id',new.buyer_id,'status',new.order_status,'payment',new.payment_status,'total',new.total));
 else
   if tg_op='UPDATE' and (new.status,new.tracking_number,new.tracking_url) is not distinct from (old.status,old.tracking_number,old.tracking_url) then return new; end if;
   insert into public.market_activity(actor_id,entity,entity_id,action,detail) values(auth.uid(),'fulfillment',new.order_id::text,'Memperbarui pemenuhan pesanan',jsonb_build_object('seller_id',new.seller_id,'status',new.status,'courier',new.courier,'tracking_number',new.tracking_number));
 end if;
 return new;
end; $$;
create trigger record_product_activity after insert or update on public.products for each row execute function public.record_market_activity();
create trigger record_order_activity after insert or update on public.orders for each row execute function public.record_market_activity();
create trigger record_fulfillment_activity after update on public.seller_fulfillments for each row execute function public.record_market_activity();
create function public.admin_overview() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Akses admin diperlukan.'; end if;
 return jsonb_build_object('people',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'role',p.role,
 'products',(select count(*) from public.products x where x.seller_id=p.id and x.deleted_at is null),
 'orders',(select count(*) from public.orders o where o.buyer_id=p.id)) order by p.display_name),'[]'::jsonb) from public.profiles p where p.role in ('seller','buyer')),
 'activity',(select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) from (select a.*,coalesce(p.display_name,'Sistem') as actor_name from public.market_activity a left join public.profiles p on p.id=a.actor_id order by a.created_at desc,a.id desc limit 150) a));
end; $$;
revoke all on function public.admin_overview() from public,anon;
grant execute on function public.admin_overview() to authenticated;
revoke all on function public.notify_order_event(),public.record_market_activity(),public.guard_admin_inventory() from public,anon,authenticated;
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='order_notifications') then
   alter publication supabase_realtime add table public.order_notifications;
 end if;
end; $$;
create or replace function public.review_order(p_order_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype; v_admin boolean := public.is_admin();
begin
 if public.is_admin() then raise exception 'Persetujuan pesanan dilakukan penjual.'; end if;
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
create or replace function public.seller_orders() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.profiles where id = auth.uid() and role = 'seller') then
    raise exception 'Masuk sebagai penjual.';
  end if;
  return coalesce((select jsonb_agg(row_data order by created_at desc) from (
    select o.created_at, jsonb_build_object('id', o.id, 'buyer_name', o.buyer_name,
      'phone', o.phone, 'shipping_address', o.shipping_address, 'payment_status', o.payment_status,
      'courier',f.courier,'tracking_number',f.tracking_number,'tracking_url',f.tracking_url,'order_status', f.status, 'overall_status', o.order_status, 'accepted_at', f.accepted_at, 'payment_mode', o.payment_mode,
      'created_at', o.created_at, 'total', (select sum(i.unit_price::bigint * i.quantity) from public.order_items i where i.order_id = o.id and i.seller_id = auth.uid()),
      'order_items', (select jsonb_agg(jsonb_build_object('product_id', i.product_id, 'item_name', i.item_name, 'quantity', i.quantity,
        'unit_price', i.unit_price, 'image_url', i.image_url)) from public.order_items i where i.order_id = o.id and i.seller_id = auth.uid())) as row_data
    from public.orders o join public.seller_fulfillments f on f.order_id = o.id
    where f.seller_id = auth.uid()
  ) rows_for_seller), '[]'::jsonb);
end;
$$;
commit;
