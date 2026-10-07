# Benang-Mawar — Koperasi Rantai Mawar

Marketplace terpusat untuk perempuan penenun di Dusun Semberang, Kabupaten Sambas. HTML/CSS/JavaScript, Supabase Auth/PostgreSQL, Cloudinary, dan Xendit Payment Sessions.

## Alur koperasi

- Anggota menyerahkan data kain dan foto kepada admin atau pendamping; tidak membuka toko masing-masing.
- Admin mengelola seluruh katalog, nama pembuat, cerita, motif, ukuran, bahan, foto, harga, stok, serta pesanan melalui akun.html.
- Produk baru/perubahan disimpan sebagai draf. Publikasi memerlukan kelengkapan data dan foto Cloudinary. Stok cepat, hapus, dan pemulihan tersedia.
- Pembeli melihat katalog, menyimpan keranjang di Supabase, membayar melalui Xendit, memantau pengiriman, dan mengonfirmasi barang diterima.
- Enam materi belajar dan SOP dibaca dari learning_materials di Supabase.

## Penyimpanan dan akses

Supabase menyimpan profil, produk, cerita, stok, keranjang per pembeli, pesanan, pembayaran, dan panduan. Cloudinary menyimpan foto produk serta ilustrasi situs; rahasia penandatanganan hanya berada di server Supabase.

Kebijakan database dan fungsi pengelolaan hanya mengizinkan admin. Endpoint pembuatan penjual lama dinonaktifkan. Akun penjual lama serta riwayat produk/pesanan dipertahankan.

Keranjang memerlukan akun pembeli dan dibaca ulang dari server pada setiap halaman. Browser tetap menyimpan sesi autentikasi dan kunci idempotensi checkout, bukan database produk atau pesanan.

## Status penerapan 8 Oktober 2026

Migrasi 20261008000000_central_cooperative.sql dan 20261008010000_cloud_cart.sql diterapkan pada proyek Supabase terhubung. cloudinary-signature membatasi unggahan kepada admin; create-seller mengembalikan status 410.

12 produk ilustrasi lama yang belum memiliki data pembuat/foto asli disimpan sebagai draf. Data tidak dihapus. Admin perlu melengkapi minimal 10 produk autentik sesuai proposal. Ilustrasi grafis situs tidak diklaim sebagai dokumentasi mitra atau motif autentik Sambas.

Xendit masih menggunakan mode Test. Aktivasi Live memerlukan akun merchant yang siap dan kunci produksi koperasi. Jangan memasukkan secret key ke Git atau halaman publik. Akses cepat admin yang sudah ada perlu dinonaktifkan dan kredensial diganti sebelum operasi produksi dengan data nyata.

Dokumentasi pelatihan, penunjukan 2–3 pendamping, artikel, berita, video, dan luaran program perlu disiapkan tim pelaksana; website tidak membuktikan kegiatan tersebut sudah terlaksana.

## Validasi

npm test menguji autentikasi/peran, pembayaran, webhook, stok, checkout idempoten, migrasi model penjual ke koperasi, larangan akses penjual lama, validasi publikasi, dan isolasi keranjang pembeli. Tes PostgreSQL memakai PGlite dan tidak melakukan pembayaran nyata.

Push ke main memicu deployment Vercel. Berkas akun pribadi dan rahasia server tidak disimpan dalam repository.

## Pembaruan tiga peran

Atas permintaan pemilik, User/Pembeli, Penjual, dan Admin tersedia kembali. Admin mengelola seluruh produk dan pesanan; penjual hanya mengelola produk serta pemenuhan pesanan miliknya. Data dan keranjang tetap tersimpan di Supabase, foto produk di Cloudinary. Menu dan logo staff mengarah ke ruang pengelolaan, bukan beranda belanja. Migrasi 20261008030000_restore_three_roles.sql mengembalikan akses toko milik penjual tanpa memberi hak admin.

Koleksi awal (12 produk) yang sebelumnya tayang telah dipulihkan melalui migrasi 20261008050000_restore_published_collection.sql. Pemulihan hanya berlaku pada produk yang diubah menjadi draf oleh migrasi proposal; draf baru penjual serta produk dihapus tidak ditayangkan otomatis. Harga, stok, dan riwayat pesanan tidak diubah.
