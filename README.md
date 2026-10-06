# Rantai Mawar — Rumah Tenun & Pembayaran Xendit

Website HTML/CSS/JavaScript dengan Supabase Auth dan database. Upload foto seller memakai Cloudinary.

Tampilan diperbarui dengan tema studio tenun, katalog responsif, dan checkout Xendit Payment Sessions. Migrasi, fungsi, secrets server, dan webhook sudah dipasang pada proyek Supabase tertaut dalam **mode Test**. Pembayaran saat ini merupakan simulasi, tanpa uang nyata. Panduan operasional: [XENDIT-SETUP.md](XENDIT-SETUP.md).

## Cara membuka

1. Jalankan website melalui Live Server atau server HTTP lain; Supabase Auth tidak berjalan dari `file://`.
2. Untuk mengedit, buka folder ini di VS Code.

Website memerlukan koneksi internet untuk Supabase dan Cloudinary.

## Mulai membaca kode dari sini

| File | Kegunaan |
| --- | --- |
| `index.html` | Halaman Beranda (Hero tenun, nilai koperasi, produk unggulan, banner). |
| `koleksi.html` | Halaman Koleksi Tenun (katalog produk lengkap, pencarian motif). |
| `belajar.html` | Halaman Ruang Belajar (panduan digital bertahap, perbesar font). |
| `tentang.html` | Halaman Tentang Kami (profil dan misi Koperasi Rantai Mawar). |
| `login.html` | Masuk dengan email Supabase Auth atau lanjut sebagai Guest. |
| `register.html` | Pendaftaran akun Pembeli. Akun Penjual dibuat oleh Admin. |
| `akun.html` | Dashboard, pembuatan akun seller oleh admin, upload produk seller. |
| `keranjang.html` | Halaman tas belanja dengan kontrol jumlah dan ringkasan. |
| `checkout.html` | Data penerima dan pembuatan pesanan sebelum pembayaran Xendit. |
| `pembayaran.html`, `payment.js` | Tautan checkout Xendit, mode uji coba, dan pemeriksaan status pembayaran. |
| `studio.css` | Tema studio tenun, katalog, formulir, dan tampilan ponsel. |
| `style.css` | Styling desain, warna, tata letak, dan navbar sticky. |
| `common.js` | Helper navigasi, keranjang lokal, dan katalog dari Supabase. |
| `data.js` | Salinan data awal; katalog, materi, dan anggaran aktif dibaca dari Supabase. |
| `backend.js` | Adapter Supabase Auth, database, dan upload bertanda tangan Cloudinary. |
| `supabase/migrations/` | Skema, RLS, dan data awal. |
| `supabase/functions/` | Fungsi admin membuat seller, tanda tangan upload Cloudinary, serta pembayaran dan webhook Xendit. |
| `assets/` | Foto tenun dan favicon. |

## Supabase & Cloudinary

Migrasi database dan Edge Functions telah diterapkan ke project Supabase tertaut. Produk dan pesanan Penjual menggunakan Supabase, sementara foto baru menggunakan Cloudinary. Kunci publishable Supabase berada di kode browser dan memang dirancang untuk penggunaan publik; service-role key dan Cloudinary API secret hanya disimpan di server.

### Siapkan admin pertama

1. Buka `register.html` lewat server lokal dan buat akun memakai email admin. Konfirmasi email jika Supabase memintanya.
2. Buka `supabase/bootstrap-admin.example.sql`, ganti `REPLACE_WITH_ADMIN_EMAIL`, lalu jalankan SQL tersebut di Supabase SQL Editor sebagai pemilik project. Ini tindakan satu kali.
3. Masuk memakai email dan kata sandi admin. Dari dashboard, admin dapat membuat akun Penjual.

### Upload Cloudinary

Konfigurasi server sudah aktif dan unggah foto serta edit harga/stok telah diverifikasi pada 6 Oktober 2026. Untuk pemasangan ulang:

1. Di Cloudinary Dashboard, ambil API Key dan API Secret. Cloud name yang dikonfigurasi adalah `w7kqjyeq`.
2. Di Supabase Dashboard, buka Edge Functions Secrets dan tambahkan `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, serta `CLOUDINARY_API_SECRET`. Jangan masukkan kunci rahasia ke berkas aplikasi atau chat.
3. Seller masuk, lalu isi foto, nama, motif, ukuran, bahan, harga, stok, dan deskripsi. Foto diunggah ke folder `rumah-tenun/products`; produk menunggu review admin sebelum muncul di katalog.

Produk awal dan materi belajar tersimpan di tabel Supabase. Checkout membuat order dan item order, memvalidasi serta mengurangi stok secara atomik. Pada pesanan Xendit, server memverifikasi pembayaran. Penjual menerima dan memproses pesanan barangnya sendiri, lalu menandai dikirim/tiba. Pesanan dari beberapa penjual memakai status pemenuhan terpisah; status pembeli mengikuti tahap paling awal yang belum selesai. Pembeli mengonfirmasi barang diterima. Keranjang tetap lokal di browser. Kunci development hanya memproses simulasi; pembayaran nyata memerlukan konfigurasi Live yang sesuai.

### Etalase Penjual

- Login Penjual langsung membuka Etalase Produk; menu hanya Etalase Produk dan Panduan Usaha.
- Dua tab: Produk saya dan Pesanan masuk. Dua belas produk awal yang belum memiliki penjual telah dikaitkan ke akun Penjual toko beserta item pesanan lamanya.
- Semua produk milik penjual dapat diedit, termasuk harga/stok. Foto lama dipertahankan jika tidak memilih foto baru. Produk yang diubah menunggu verifikasi ulang Admin.
- Pesanan dibaca melalui RPC yang membatasi akses ke barang penjual itu. Pesanan belum dibayar tidak dapat diterima/diproses; status pembayaran Xendit tidak bisa diubah manual.
- Login cepat Admin/Penjual memilih email akun asli. Penyimpanan login cepat aktif secara default setelah login pertama berhasil di perangkat itu; pengguna dapat menonaktifkannya dengan menghapus centang. Tidak ada kredensial Admin/Penjual di kode publik.
- Produk mempunyai kolom nama pembuat dan cerita tenun yang disimpan di Supabase serta bisa diisi/diedit oleh penjual. Informasi yang belum tersedia ditampilkan sebagai belum dicantumkan.
- Nama/foto produk di keranjang, pengiriman, etalase, dan pesanan masuk menaut ke halaman detail; tombol Informasi & cerita tenun menjelaskan tujuan tautan.

Untuk perubahan skema berikutnya, buat migrasi baru dan jalankan `npx supabase db push --linked`. Untuk deploy ulang function gunakan `npx supabase functions deploy <nama-function> --project-ref lsewgdyamxfblzcjkwti`.

## Fitur yang sudah bisa dicoba

- Navigasi halaman dan menu ponsel.
- Koleksi, pencarian, detail produk, status review, stok, dan tas belanja.
- Order Supabase dengan status pembayaran/pengiriman dan integrasi Xendit setelah aktivasi server.
- Login Supabase, pendaftaran pembeli, pembuatan akun penjual oleh admin, dan edit profil.
- Panduan belajar bertahap dan perbesar tulisan.

Proposal, kegiatan, katalog, serta profil koperasi adalah rancangan/contoh yang perlu dikonfirmasi. Paket ini adalah versi kode sederhana terpisah; tautan web sebelumnya tidak diubah.

## Pengujian

Jalankan `npm install` lalu `npm test`. Tes meliputi transaksi PostgreSQL lokal, pencegahan pesanan/session ganda, hak akses, verifikasi nilai pembayaran, webhook palsu, status pembayaran, pengembalian stok, serta pemeriksaan skrip halaman. Tes memakai respons Xendit tiruan; uji sandbox nyata dilakukan setelah server diaktifkan.

## Kredit foto

Foto: Meithyra Melviana Simatupang / Wikimedia Commons.
Sumber: https://commons.wikimedia.org/wiki/File:Kain_Tenun_Lombok_(Woven_Fabric_of_Lombok).jpg
Lisensi: https://creativecommons.org/licenses/by-sa/4.0/
Foto diperkecil, dikompres, dan dipotong dalam tampilan CSS. Foto hasil perubahan tetap CC BY-SA 4.0.

Latar foto: Suryasriyama / Wikimedia Commons.
Sumber: https://commons.wikimedia.org/wiki/File:Menenun_kain_khas_suku_Sasak.jpg
Lisensi: https://creativecommons.org/licenses/by-sa/4.0/

Motif Mega Mendung: Gunarta / Wikimedia Commons.
Sumber: https://commons.wikimedia.org/wiki/File:Batik_Mega_Mendung.jpg
Lisensi: https://creativecommons.org/licenses/by-sa/4.0/

Penjual dapat mengubah stok dengan tombol minus/plus atau Stok habis tanpa mengubah status verifikasi. Hapus produk menyimpan deleted_at di Supabase; produk tidak tampil di katalog dan ditolak saat checkout, sementara riwayat pesanan serta foto Cloudinary tetap tersedia. Produk dapat dipulihkan dari daftar Produk dihapus.
