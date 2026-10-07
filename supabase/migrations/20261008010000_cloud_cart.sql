begin;
create table public.buyer_carts (
 buyer_id uuid primary key references public.profiles(id) on delete cascade,
 items jsonb not null default '{}'::jsonb check(jsonb_typeof(items)='object'),
 updated_at timestamptz not null default now()
);
alter table public.buyer_carts enable row level security;
grant select on public.buyer_carts to authenticated;
create policy "Buyers read own cart" on public.buyer_carts for select to authenticated using(buyer_id=auth.uid());
create function public.save_buyer_cart(p_items jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare entry record;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and role='buyer') then raise exception 'Masuk sebagai pembeli untuk menyimpan keranjang.'; end if;
 if jsonb_typeof(p_items) is distinct from 'object' or pg_column_size(p_items)>16000 then raise exception 'Keranjang tidak valid.'; end if;
 for entry in select * from jsonb_each_text(p_items) loop
  if entry.key !~ '^[0-9]{1,15}$' or entry.value !~ '^[0-9]{1,6}$' then raise exception 'Jumlah barang tidak valid.'; end if;
  if not exists(select 1 from public.products where id=entry.key::bigint and status='approved' and deleted_at is null and entry.value::integer between 1 and stock) then
   raise exception 'Produk tidak tersedia atau jumlah melebihi stok. Periksa kembali keranjang.';
  end if;
 end loop;
 insert into public.buyer_carts(buyer_id,items) values(auth.uid(),p_items)
 on conflict(buyer_id) do update set items=excluded.items,updated_at=now();
end; $$;
revoke all on function public.save_buyer_cart(jsonb) from public,anon;
grant execute on function public.save_buyer_cart(jsonb) to authenticated;
commit;
