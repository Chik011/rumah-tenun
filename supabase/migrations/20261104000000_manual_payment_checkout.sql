-- Migration: ganti create_checkout_order agar tidak memaksa payment_provider = 'xendit'
-- Semua pesanan baru menggunakan payment_provider = 'manual' (default kolom)
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
  -- Simpan request ID agar tidak terjadi duplikasi (payment_provider tetap 'manual')
  update public.orders set checkout_request_id = p_request_id,
    checkout_payload = v_payload where id = v_id;
  return v_id;
end;
$$;
revoke all on function public.create_checkout_order(uuid, text, text, text, text, jsonb) from public, anon;
grant execute on function public.create_checkout_order(uuid, text, text, text, text, jsonb) to authenticated;

-- Update panduan penjual dan pembeli: hapus referensi Xendit
update public.learning_materials set steps='["Buka Belanja Tenun. Pilih kain dan baca nama pembuat, motif, ukuran, bahan, cerita, harga, serta stok.","Masuk sebagai pembeli, tentukan jumlah kain, lalu buka tas belanja. Periksa barang dan alamat pengiriman, lalu pilih Ajukan pesanan.","Buka Tas belanja lalu Pengiriman. Tunggu persetujuan penjual. Setelah disetujui, pilih Lanjutkan pembayaran dan ikuti instruksi (QRIS, Transfer Bank, atau Dompet Digital). Jika ada beberapa penjual, semua penjual harus menyetujui terlebih dahulu.","Setelah pembayaran dikonfirmasi admin, pantau pesanan diproses, dikirim, dan tiba. Konfirmasi diterima hanya setelah kain benar-benar sampai."]'::jsonb where id=2;

update public.learning_materials set steps='["Buka Pesanan masuk. Pesanan baru menunggu persetujuan penjual. Admin dapat membantu menyetujui atau menolak seluruh pesanan setelah memeriksa ketersediaan dengan penjual.","Setelah pembeli mengirim bukti pembayaran, periksa bukti via WhatsApp atau notifikasi, lalu konfirmasi pembayaran melalui tombol Verifikasi Pembayaran di halaman pesanan.","Sesudah pembayaran dikonfirmasi, pilih Proses dan kemas pesanan. Cocokkan barang, jumlah, pembuat, alamat, dan kontak pembeli.","Sesudah diserahkan kepada pengiriman, pilih Tandai dikirim. Tandai tiba hanya setelah ada kepastian barang sampai. Pembeli mengonfirmasi penerimaan."]'::jsonb where id=5;

