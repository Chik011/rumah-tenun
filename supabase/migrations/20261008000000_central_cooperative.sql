begin;
-- One cooperative catalogue. Preserve product ownership and historical orders for audit.
drop policy if exists "Sellers can insert their own products" on public.products;
drop policy if exists "Sellers can update their own unapproved products" on public.products;
drop policy if exists "Sellers and admins can read their products" on public.products;
drop policy if exists "Owners can delete unapproved products" on public.products;
create policy "Cooperative admins insert products" on public.products for insert to authenticated with check(public.is_admin() and seller_id=auth.uid());
create policy "Cooperative admins read all products" on public.products for select to authenticated using(public.is_admin());
revoke execute on function public.seller_product_stock(bigint,text), public.seller_archive_product(bigint,boolean), public.update_seller_product(bigint,jsonb), public.seller_orders(), public.advance_seller_order(uuid,text) from authenticated, anon, public;
drop policy if exists "Sellers read own fulfillment" on public.seller_fulfillments;
create policy "Cooperative admins read fulfillment" on public.seller_fulfillments for select to authenticated using(public.is_admin());
create or replace function public.seller_transition_allowed(p_order_id uuid,p_status text) returns boolean language sql stable set search_path='' as $$ select false; $$;
create function public.cooperative_product_stock(p_product_id bigint, p_action text) returns integer
language plpgsql security definer set search_path = '' as $$
declare item public.products%rowtype; next_stock integer;
begin
  if not public.is_admin() then raise exception 'Akses admin koperasi diperlukan.'; end if;
  select * into item from public.products where id=p_product_id and deleted_at is null for update;
  if not found then raise exception 'Produk tidak ditemukan atau sudah dihapus.'; end if;
  next_stock := case p_action when 'minus' then item.stock-1 when 'plus' then item.stock+1 when 'empty' then 0 else null end;
  if next_stock is null or next_stock < 0 then raise exception 'Perubahan stok tidak valid.'; end if;
  update public.products set stock=next_stock, updated_at=now() where id=item.id;
  return next_stock;
end;
$$;
create function public.cooperative_archive_product(p_product_id bigint, p_restore boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Akses admin koperasi diperlukan.'; end if;
  update public.products set deleted_at=case when p_restore then null else now() end, updated_at=now()
  where id=p_product_id;
  if not found then raise exception 'Produk tidak ditemukan.'; end if;
end;
$$;
revoke all on function public.cooperative_product_stock(bigint,text), public.cooperative_archive_product(bigint,boolean) from public, anon;
grant execute on function public.cooperative_product_stock(bigint,text), public.cooperative_archive_product(bigint,boolean) to authenticated;

create or replace function public.cooperative_update_product(p_product_id bigint, p_product jsonb) returns public.products
language plpgsql security definer set search_path = '' as $$
declare v_product public.products%rowtype; v_image text; v_maker text; v_story text;
begin
  if not public.is_admin() then raise exception 'Akses admin koperasi diperlukan.'; end if;
  select * into v_product from public.products where id = p_product_id and deleted_at is null for update;
  if not found then raise exception 'Produk tidak ditemukan atau dihapus.'; end if;
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


revoke all on function public.cooperative_update_product(bigint,jsonb) from public,anon;
grant execute on function public.cooperative_update_product(bigint,jsonb) to authenticated;
-- Publication requires the evidence and descriptive fields promised in the proposal.
create function public.validate_cooperative_publication() returns trigger language plpgsql set search_path='' as $$
begin
 if new.status='approved' and (old.status is distinct from new.status) then
  if length(trim(new.maker_name))=0 or length(trim(new.story))=0 or length(trim(new.motif))=0
    or length(trim(new.size))=0 or length(trim(new.material))=0 or new.price<=0
    or coalesce(new.image_url,'') !~ '^https://res[.]cloudinary[.]com/' then
    raise exception 'Lengkapi pembuat, cerita, motif, ukuran, bahan, harga, dan foto Cloudinary sebelum menayangkan produk.';
  end if;
 end if;
 return new;
end; $$;
create trigger validate_cooperative_publication before update on public.products for each row execute function public.validate_cooperative_publication();
insert into public.learning_materials(id,title,duration,steps) values (1,'Mulai dari ponsel Anda','','["Hubungkan ponsel ke internet dan buka Benang-Mawar. Kenali menu Belanja Tenun, Ruang Belajar, dan Tentang Kami.","Anggota penenun tidak perlu membuat toko atau akun penjual. Serahkan data kain kepada admin koperasi.","Latihan bersama pendamping muda: buka satu panduan, baca langkahnya, lalu coba sendiri. Ulangi bila perlu."]'::jsonb) on conflict(id) do update set title=excluded.title,duration=excluded.duration,steps=excluded.steps;
insert into public.learning_materials(id,title,duration,steps) values (2,'Belanja tenun dan pantau pesanan','','["Buka Belanja Tenun. Pilih kain dan baca nama pembuat, motif, ukuran, bahan, cerita, harga, serta stok.","Masuk sebagai pembeli, tentukan jumlah kain, lalu buka tas belanja. Periksa barang dan alamat pengiriman.","Lanjutkan pembayaran melalui Xendit. Periksa jumlah dan status mode uji atau pembayaran nyata sebelum membayar. Jangan berikan PIN atau OTP.","Setelah pembayaran terkonfirmasi, buka Tas Belanja lalu Pengiriman. Pantau diproses, dikirim, dan tiba. Konfirmasi diterima hanya setelah kain benar-benar sampai."]'::jsonb) on conflict(id) do update set title=excluded.title,duration=excluded.duration,steps=excluded.steps;
insert into public.learning_materials(id,title,duration,steps) values (3,'Anggota: siapkan data kain','','["Siapkan nama pembuat dan nama produk. Catat motif, ukuran, bahan, harga, stok aktual, serta cerita tentang kain. Jangan mengarang makna motif.","Foto kain asli dengan cahaya alami dan latar polos. Sertakan tampilan penuh serta detail motif, tanpa filter yang mengubah warna.","Serahkan data dan foto kepada admin atau pendamping koperasi. Sampaikan perubahan stok dan harga segera agar katalog tetap benar."]'::jsonb) on conflict(id) do update set title=excluded.title,duration=excluded.duration,steps=excluded.steps;
insert into public.learning_materials(id,title,duration,steps) values (4,'Admin: kelola katalog dan stok','','["Masuk dengan akun admin koperasi, buka Kelola Koperasi lalu Katalog koperasi. Periksa data yang diserahkan anggota.","Pilih Tambah produk. Isi semua informasi, nama pembuat, cerita, dan foto kain asli. Foto disimpan di Cloudinary dan informasi produk di Supabase.","Simpan draf, periksa kembali data, lalu pilih Tayangkan. Gunakan Edit produk untuk memperbaiki data. Setiap perubahan perlu diperiksa dan ditayangkan kembali.","Gunakan tombol minus, plus, atau Stok habis untuk mencocokkan persediaan. Hapus produk jika tidak lagi dijual; produk dapat dipulihkan dan riwayat pesanan tetap ada."]'::jsonb) on conflict(id) do update set title=excluded.title,duration=excluded.duration,steps=excluded.steps;
insert into public.learning_materials(id,title,duration,steps) values (5,'Admin: pembayaran dan pengiriman','','["Buka Pesanan masuk dan periksa status pembayaran. Pembayaran Xendit harus terkonfirmasi otomatis sebelum barang diproses.","Pilih Terima & proses pesanan. Cocokkan barang, jumlah, pembuat, alamat, dan kontak pembeli; kemas dengan baik.","Sesudah diserahkan kepada pengiriman, pilih Tandai dikirim. Tandai tiba hanya setelah ada kepastian barang sampai. Pembeli mengonfirmasi penerimaan.","Jika pembayaran belum terkonfirmasi atau terjadi masalah, periksa dashboard Xendit dan hubungi pembeli melalui kontak pesanan. Jangan mengubah pembayaran menjadi lunas tanpa verifikasi."]'::jsonb) on conflict(id) do update set title=excluded.title,duration=excluded.duration,steps=excluded.steps;
insert into public.learning_materials(id,title,duration,steps) values (6,'SOP pendampingan dan keberlanjutan','','["Koperasi menunjuk admin dan dua hingga tiga pendamping muda. Catat penanggung jawab katalog, pencatatan stok, pesanan, dan pelatihan.","Dampingi anggota berlatih menggunakan ponsel, menyiapkan foto dan data produk, serta memahami pembayaran digital. Gunakan bahasa sederhana dan praktik berulang.","Setiap pekan, cocokkan stok dengan barang fisik dan tinjau pesanan bersama pengurus. Catat kendala serta tindak lanjut dalam pertemuan koperasi.","Simpan dokumentasi pelatihan, daftar hadir, hasil pendampingan, dan serah terima pengelolaan untuk evaluasi program. Koordinasikan pendampingan lanjutan dengan tim perguruan tinggi dan Disperindag Sambas."]'::jsonb) on conflict(id) do update set title=excluded.title,duration=excluded.duration,steps=excluded.steps;
select setval(pg_get_serial_sequence('public.learning_materials','id'),greatest(6,(select max(id) from public.learning_materials)));
-- Seed illustrations are retained as drafts until real partner information is supplied.
update public.products set status='pending',review_note='Lengkapi data kain asli Sambas, nama pembuat, cerita, ukuran, bahan, motif, dan foto sebelum ditayangkan.' where id between 1 and 12 and image_url is null and maker_name='';
commit;
