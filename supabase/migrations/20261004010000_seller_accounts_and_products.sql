create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'buyer' check (role in ('admin', 'seller', 'buyer')),
  created_at timestamptz not null default now()
);

alter table public.products
  add column if not exists image_url text,
  add column if not exists seller_id uuid references public.profiles(id) on delete set null;

create index if not exists products_seller_id_idx on public.products(seller_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)),
    'buyer'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

grant execute on function public.is_admin() to anon, authenticated;

alter table public.profiles enable row level security;
drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists "Admins can read all profiles" on public.profiles;
create policy "Admins can read all profiles"
  on public.profiles for select to authenticated using (public.is_admin());
drop policy if exists "Public can read seller profiles" on public.profiles;
create policy "Public can read seller profiles"
  on public.profiles for select to anon, authenticated using (role = 'seller');
grant select on public.profiles to anon, authenticated;
grant update (display_name) on public.profiles to authenticated;
drop policy if exists "Users can update their own display name" on public.profiles;
create policy "Users can update their own display name"
  on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

alter table public.products enable row level security;
drop policy if exists "Public can read products" on public.products;
create policy "Public can read products"
  on public.products for select to anon, authenticated using (true);
drop policy if exists "Sellers can insert their own products" on public.products;
create policy "Sellers can insert their own products"
  on public.products for insert to authenticated
  with check (
    seller_id = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and role in ('seller', 'admin'))
  );
drop policy if exists "Sellers can update their own products" on public.products;
create policy "Sellers can update their own products"
  on public.products for update to authenticated
  using (seller_id = auth.uid() or public.is_admin())
  with check (seller_id = auth.uid() or public.is_admin());
drop policy if exists "Sellers can delete their own products" on public.products;
create policy "Sellers can delete their own products"
  on public.products for delete to authenticated
  using (seller_id = auth.uid() or public.is_admin());
grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;
