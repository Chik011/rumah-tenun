# Rantai Mawar — HTML, CSS, dan JavaScript sederhana

Website HTML/CSS/JavaScript dengan Supabase Auth dan database. Upload foto seller memakai Cloudinary.

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
| `checkout.html` | Halaman checkout demo dengan data penerima dan metode pembayaran. |
| `style.css` | Styling desain, warna, tata letak, dan navbar sticky. |
| `common.js` | Helper navigasi, keranjang lokal, dan katalog dari Supabase. |
| `data.js` | Salinan data awal; katalog, materi, dan anggaran aktif dibaca dari Supabase. |
| `backend.js` | Adapter Supabase Auth, database, dan upload bertanda tangan Cloudinary. |
| `supabase/migrations/` | Skema, RLS, dan data awal. |
| `supabase/functions/` | Fungsi admin membuat seller dan tanda tangan upload Cloudinary. |
| `assets/` | Foto tenun dan favicon. |

## Supabase & Cloudinary

Migrasi database telah diterapkan dan dua Edge Function telah di-deploy ke project Supabase tertaut. Kunci publishable Supabase berada di kode browser dan memang dirancang untuk penggunaan publik; jangan pernah menaruh service-role key atau Cloudinary API secret di sana.

### Siapkan admin pertama

1. Buka `register.html` lewat server lokal dan buat akun memakai email admin. Konfirmasi email jika Supabase memintanya.
2. Buka `supabase/bootstrap-admin.example.sql`, ganti `REPLACE_WITH_ADMIN_EMAIL`, lalu jalankan SQL tersebut di Supabase SQL Editor sebagai pemilik project. Ini tindakan satu kali.
3. Masuk memakai email dan kata sandi admin. Dari dashboard, admin dapat membuat akun Penjual.

### Aktifkan upload Cloudinary

1. Di Cloudinary Dashboard, ambil API Key dan API Secret. Cloud name yang dikonfigurasi adalah `w7kqjyeq`.
2. Di Supabase Dashboard, buka Edge Functions Secrets dan tambahkan `CLOUDINARY_API_KEY` serta `CLOUDINARY_API_SECRET`. Jangan masukkan kedua nilai itu ke berkas aplikasi atau chat.
3. Seller masuk, lalu isi foto, nama, motif, ukuran, bahan, harga, stok, dan deskripsi. Foto diunggah ke folder `rumah-tenun/products`; produk menunggu review admin sebelum muncul di katalog.

Produk awal dan materi belajar tersimpan di tabel Supabase. Checkout membuat order dan item order, memvalidasi serta mengurangi stok secara atomik. Admin mengonfirmasi laporan pembayaran, memproses pemeriksaan, pengemasan, dan pengiriman; buyer mengonfirmasi barang diterima. Pilihan QRIS/transfer/dompet digital hanya mencatat metode. Pembayaran uang nyata dan integrasi gateway belum tersedia. Keranjang tetap lokal di browser.

Untuk perubahan skema berikutnya, buat migrasi baru dan jalankan `npx supabase db push --linked`. Untuk deploy ulang function gunakan `npx supabase functions deploy <nama-function> --project-ref lsewgdyamxfblzcjkwti`.

## Fitur yang sudah bisa dicoba

- Navigasi halaman dan menu ponsel.
- Koleksi, pencarian, detail produk, status review, stok, dan tas belanja.
- Order Supabase dengan status pembayaran/pengiriman, tanpa pemrosesan uang nyata.
- Login Supabase, pendaftaran pembeli, pembuatan akun penjual oleh admin, dan edit profil.
- Panduan belajar bertahap dan perbesar tulisan.

Proposal, kegiatan, katalog, serta profil koperasi adalah rancangan/contoh yang perlu dikonfirmasi. Paket ini adalah versi kode sederhana terpisah; tautan web sebelumnya tidak diubah.

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
