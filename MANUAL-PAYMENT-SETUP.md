# Panduan Pengaturan Pembayaran & Artikel — Benang-Mawar

## 1. Pengaturan Metode Pembayaran oleh Admin

Admin dapat mengatur seluruh metode pembayaran langsung dari antarmuka web melalui **Ruang Dashboard Admin → Menu Pengaturan Pembayaran** (`akun.html?view=payments`). Semua data tersimpan di tabel `payment_settings` di Supabase.

### A. QRIS (GoPay & Semua Bank / E-Wallet)
- Admin dapat mengunggah gambar kode QRIS (dari GoPay merchant atau bank koperasi) atau memasukkan URL gambar.
- Gambar QRIS ini langsung tampil di halaman pembayaran pembeli saat checkout.
- Admin dapat mengaktifkan atau menonaktifkan QRIS, serta mengisi nama merchant / NMID.

### B. Transfer Bank
- Admin dapat menambahkan rekening bank satu per satu dengan memilih nama bank dari dropdown (Bank Mandiri, Bank BCA, Bank BRI, Bank BNI, Bank Kalbar, BSI, CIMB Niaga, dll.).
- Admin memasukkan nomor rekening dan nama pemilik rekening.
- **Penting:** Pembeli hanya akan melihat bank yang telah didaftarkan oleh admin. Jika admin hanya memasukkan Bank Mandiri dan Bank BCA, maka di halaman pembeli hanya akan tampil pilihan Bank Mandiri dan Bank BCA.
- Admin dapat menghapus bank yang sudah tidak aktif kapan saja.

### C. Dompet Digital (E-Wallet)
- Admin dapat menambahkan nomor dompet digital dengan memilih provider (GoPay, DANA, ShopeePay, OVO, LinkAja).
- Admin memasukkan nomor HP dompet digital dan nama pemilik akun.
- **Penting:** Pembeli hanya akan melihat dompet digital yang telah didaftarkan oleh admin.
- Admin dapat menghapus dompet digital yang sudah tidak aktif kapan saja.

---

## 2. Pengelolaan Artikel & Berita oleh Admin

Admin dapat mengelola artikel dan berita langsung dari **Ruang Dashboard Admin → Menu Kelola Berita** (`akun.html?view=articles`). Semua data tersimpan di tabel `articles` di Supabase.

- **Membuat Artikel Baru:**
  1. Klik tombol **"+ Tulis Artikel Baru"**.
  2. Isi Judul Artikel.
  3. Pilih Kategori (Pustaka Tenun, Kegiatan Koperasi, Budaya & Tradisi, Pelatihan & Riset, Tokoh & Penenun, Wawasan, atau tulis kategori sendiri).
  4. Unggah foto sampul (file JPG/PNG/WebP) atau masukkan tautan URL gambar (dengan preview gambar langsung).
  5. Isi ringkasan singkat dan teks lengkap artikel.
  6. Klik **"Terbitkan Artikel"**.
- **Tampilan di Pembeli & Pengunjung:**
  - Tampil di **Beranda (`index.html`)** pada seksi *"Artikel Terbaru"* dengan tata letak editorial rapi sesuai desain referensi (foto di atas, garis aksen warna, kategori berwarna, dan judul tebal).
  - Tampil di **Halaman Berita (`berita.html`)** lengkap dengan filter kategori dinamis dan modal pembaca artikel.
- **Tampilan di Penjual:**
  - Penjual dapat membaca seluruh artikel koperasi melalui tab *"Kabar & Artikel"* di dashboard akun penjual.

---

## 3. Migration Database Supabase

Jalankan script SQL migration berikut di SQL Editor Supabase Anda:

1. `supabase/migrations/20261104000000_manual_payment_checkout.sql` (Checkout manual tanpa Xendit).
2. `supabase/migrations/20261104010000_news_and_payment_settings.sql` (Tabel `articles` dan `payment_settings` dengan RLS).
