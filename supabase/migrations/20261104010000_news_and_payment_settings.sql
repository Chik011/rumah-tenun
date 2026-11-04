-- Migration: Tabel Berita/Artikel dan Pengaturan Pembayaran Koperasi
-- Dibuat untuk menyimpan data artikel yang diinput admin serta pengaturan pembayaran (QRIS, Bank, Dompet Digital)

-- 1. TABEL ARTIKEL / BERITA
create table if not exists public.articles (
  id bigint generated always as identity primary key,
  title text not null check (length(trim(title)) >= 3),
  category text not null default 'Pustaka Tenun',
  summary text,
  content text not null,
  image_url text,
  author_name text default 'Admin Koperasi',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.articles enable row level security;

-- Publik (siapa pun) bisa membaca artikel
drop policy if exists "articles_select_all" on public.articles;
create policy "articles_select_all" on public.articles
  for select using (true);

-- Hanya admin koperasi yang bisa menambah, mengubah, atau menghapus artikel
drop policy if exists "articles_admin_insert" on public.articles;
create policy "articles_admin_insert" on public.articles
  for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

drop policy if exists "articles_admin_update" on public.articles;
create policy "articles_admin_update" on public.articles
  for update using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

drop policy if exists "articles_admin_delete" on public.articles;
create policy "articles_admin_delete" on public.articles
  for delete using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- 2. TABEL PENGATURAN PEMBAYARAN
-- Menyimpan QRIS, daftar bank aktif, dan daftar dompet digital aktif yang diatur oleh admin
create table if not exists public.payment_settings (
  id text primary key, -- 'qris', 'bank_bca', 'bank_mandiri', 'ewallet_dana', etc.
  category text not null check (category in ('qris', 'bank', 'ewallet')),
  provider text not null, -- 'QRIS', 'BCA', 'Mandiri', 'BRI', 'BNI', 'Bank Kalbar', 'DANA', 'GoPay', 'ShopeePay', 'OVO'
  account_number text, -- nomor rekening bank atau nomor HP dompet digital
  account_name text not null default 'Koperasi Rantai Mawar',
  image_url text, -- foto/gambar kode QRIS
  instructions text, -- catatan tambahan / NMID
  is_active boolean not null default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.payment_settings enable row level security;

-- Publik (siapa pun / pembeli) bisa membaca metode pembayaran yang aktif
drop policy if exists "payment_settings_select_all" on public.payment_settings;
create policy "payment_settings_select_all" on public.payment_settings
  for select using (true);

-- Hanya admin yang bisa mengelola metode pembayaran
drop policy if exists "payment_settings_admin_all" on public.payment_settings;
create policy "payment_settings_admin_all" on public.payment_settings
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Grant privileges
grant select on public.articles to anon, authenticated;
grant insert, update, delete on public.articles to authenticated;

grant select on public.payment_settings to anon, authenticated;
grant insert, update, delete on public.payment_settings to authenticated;

