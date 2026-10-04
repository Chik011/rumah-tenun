-- Payment totals and stock always come from create_order, never from the browser.
alter table public.orders
  add column payment_provider text not null default 'manual' check (payment_provider in ('manual', 'xendit')),
  add column checkout_request_id uuid unique,
  add column checkout_payload jsonb,
  add column payment_url text,
  add column payment_expires_at timestamptz,
  add column payment_mode text check (payment_mode in ('test', 'live'));

create table public.payment_sessions (
  order_id uuid primary key references public.orders(id),
  reference_id text not null unique,
  session_id text unique,
  status text not null default 'CREATING' check (status in ('CREATING', 'ACTIVE', 'COMPLETED', 'EXPIRED', 'CANCELED')),
  payment_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.payment_sessions enable row level security;
revoke all on public.payment_sessions from anon, authenticated;
grant all on public.payment_sessions to service_role;

create or replace function public.create_checkout_order(
  p_request_id uuid, p_buyer_name text, p_phone text,
  p_shipping_address text, p_payment_method text, p_items jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_existing public.orders%rowtype;
  v_payload jsonb := jsonb_build_object('name', p_buyer_name, 'phone', p_phone,
    'address', p_shipping_address, 'method', p_payment_method, 'items', p_items);
begin
  if auth.uid() is null or p_request_id is null then raise exception 'Sesi login diperlukan.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into v_existing from public.orders where checkout_request_id = p_request_id;
  if found then
    if v_existing.buyer_id <> auth.uid() or v_existing.checkout_payload <> v_payload then
      raise exception 'Permintaan checkout tidak cocok. Mulai checkout baru.';
    end if;
    return v_existing.id;
  end if;
  v_id := public.create_order(p_buyer_name, p_phone, p_shipping_address, p_payment_method, p_items);
  update public.orders set payment_provider = 'xendit', checkout_request_id = p_request_id,
    checkout_payload = v_payload where id = v_id;
  return v_id;
end;
$$;
revoke all on function public.create_checkout_order(uuid, text, text, text, text, jsonb) from public, anon;
grant execute on function public.create_checkout_order(uuid, text, text, text, text, jsonb) to authenticated;

-- Serialize gateway creation across tabs and function instances. An uncertain
-- network result remains CREATING, rather than risk charging the customer twice.
create or replace function public.claim_payment_session(p_order_id uuid, p_buyer_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype; v_session public.payment_sessions%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.buyer_id <> p_buyer_id or v_order.payment_provider <> 'xendit' then
    raise exception 'Pesanan tidak ditemukan.';
  end if;
  if v_order.order_status <> 'awaiting_payment' or v_order.payment_status <> 'waiting' then
    raise exception 'Pesanan ini tidak dapat dibayar lagi.';
  end if;
  if v_order.total < 1 then raise exception 'Total pesanan tidak valid.'; end if;
  select * into v_session from public.payment_sessions where order_id = p_order_id;
  if found then return jsonb_build_object('claimed', false, 'order', to_jsonb(v_order), 'session', to_jsonb(v_session)); end if;
  insert into public.payment_sessions(order_id, reference_id)
    values (p_order_id, 'rm-' || p_order_id::text) returning * into v_session;
  return jsonb_build_object('claimed', true, 'order', to_jsonb(v_order), 'session', to_jsonb(v_session));
end;
$$;

create or replace function public.apply_xendit_status(
  p_session_id text, p_reference_id text, p_amount bigint, p_currency text,
  p_status text, p_payment_id text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype; v_session public.payment_sessions%rowtype;
begin
  -- Use the same order->session lock order as claim_payment_session.
  select o.* into v_order from public.orders o join public.payment_sessions s on s.order_id = o.id
    where s.session_id = p_session_id for update of o;
  if not found then raise exception 'Payment session belum tersimpan.'; end if;
  select * into v_session from public.payment_sessions where order_id = v_order.id for update;
  if v_session.reference_id is distinct from p_reference_id or v_order.total is distinct from p_amount or p_currency is distinct from 'IDR' then
    raise exception 'Payment session tidak cocok dengan pesanan.';
  end if;
  if v_session.status = 'COMPLETED' then return; end if;
  if p_status = 'COMPLETED' then
    if p_payment_id is null or length(p_payment_id) = 0 then raise exception 'Payment ID diperlukan.'; end if;
    if v_order.order_status = 'cancelled' then
      raise exception 'Pembayaran pesanan dibatalkan memerlukan rekonsiliasi.';
    end if;
    update public.orders set payment_status = 'confirmed', order_status = 'checking' where id = v_order.id;
  elsif p_status in ('EXPIRED', 'CANCELED') then
    if v_order.payment_status = 'confirmed' then return; end if;
    update public.orders set payment_status = 'rejected', order_status = 'cancelled' where id = v_order.id;
  elsif p_status <> 'ACTIVE' then raise exception 'Status payment session tidak dikenal.';
  end if;
  update public.payment_sessions set status = p_status, payment_id = p_payment_id, updated_at = now()
    where order_id = v_order.id;
end;
$$;

revoke all on function public.claim_payment_session(uuid, uuid) from public, anon, authenticated;
revoke all on function public.apply_xendit_status(text, text, bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_payment_session(uuid, uuid) to service_role;
grant execute on function public.apply_xendit_status(text, text, bigint, text, text, text) to service_role;

-- Neither a buyer nor an admin may mark a gateway payment as paid by editing
-- the orders table. Only the verified server path may change payment status.
create or replace function public.protect_gateway_order()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.payment_provider = 'xendit' and coalesce(auth.role(), '') = 'authenticated' then
    if new.payment_status is distinct from old.payment_status then
      raise exception 'Status pembayaran Xendit diperbarui otomatis.';
    end if;
    if new.order_status is distinct from old.order_status then
      if not (old.payment_status = 'confirmed' and (
        (public.is_admin() and (old.order_status, new.order_status) in
          (('checking','packaging'),('packaging','shipping'),('shipping','delivered')))
        or (old.buyer_id = auth.uid() and old.order_status = 'delivered' and new.order_status = 'completed')
      )) then raise exception 'Perubahan status pesanan tidak diizinkan.'; end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger protect_gateway_order before update on public.orders
  for each row execute function public.protect_gateway_order();

-- Fix restocking for carts containing repeated product entries.
create or replace function public.restore_stock_for_cancelled_order()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.order_status = 'cancelled' and old.order_status <> 'cancelled' then
    update public.products p set stock = p.stock + oi.quantity, updated_at = now()
    from (select product_id, sum(quantity)::integer as quantity from public.order_items
      where order_id = new.id group by product_id) oi where oi.product_id = p.id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
