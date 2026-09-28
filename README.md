# Rantai Mawar — HTML, CSS, dan JavaScript sederhana

Versi 28 September 2026. Tanpa React, TypeScript, npm, SQL, atau framework.

## Cara membuka

1. Ekstrak ZIP.
2. Buka folder `rantai-mawar-html`.
3. Klik dua kali `index.html` untuk membuka website di browser modern.
4. Untuk mengedit, buka folder ini di VS Code. Live Server boleh digunakan, tetapi tidak wajib.

Semua gambar, CSS, dan JavaScript sudah ada di folder ini. Tidak perlu internet untuk mencoba demo.

## Mulai membaca kode dari sini

| File | Kegunaan |
| --- | --- |
| `index.html` | Halaman Beranda (Hero tenun, nilai koperasi, produk unggulan, banner). |
| `koleksi.html` | Halaman Koleksi Tenun (katalog produk lengkap, pencarian motif). |
| `belajar.html` | Halaman Ruang Belajar (panduan digital bertahap, perbesar font). |
| `tentang.html` | Halaman Tentang Kami (profil dan misi Koperasi Rantai Mawar). |
| `program.html` | Halaman Program Penelitian (timeline, rincian anggaran, cetak surat mitra). |
| `login.html` | Halaman Masuk dengan Akses Login Cepat (1-Klik) Admin, User, dan Penjual. |
| `register.html` | Halaman Pendaftaran Akun Demo Baru. |
| `akun.html` | Ruang Anggota & Dashboard sesuai peran (Admin, Penjual, Pembeli). |
| `style.css` | Styling desain, warna, tata letak, dan navbar sticky. |
| `common.js` | Helper navigasi sticky, sinkronisasi sesi & tas belanja di localStorage. |
| `data.js` | Produk contoh, panduan belajar, dan anggaran. |
| `backend.js` | Login, daftar, profil demo persisten di peramban. Siap disambungkan ke Firebase/Supabase. |
| `assets/` | Foto tenun dan favicon. |

## Akun Demo & Akses Login Cepat

Di halaman `login.html`, tersedia tombol **Akses Login Cepat (1-Klik)** untuk langsung mencoba masing-masing peran:

| Peran | Username | Kata Sandi | Kegunaan Demo |
| --- | --- | --- | --- |
| **Admin** | admin | 123 | Manajemen program, rancangan anggaran, dan pengawasan katalog. |
| **User (Pembeli)** | user | 123 | Menjelajahi katalog tenun dan simulasi tas belanja/checkout. |
| **Penjual** | penjual | 123 | Etalase karya tenun, panduan foto produk, dan simulasi pesanan. |

Sesi login dan tas belanja disimpan di `localStorage` peramban sehingga tidak hilang saat Anda berpindah-pindah halaman HTML. Sesi dapat direset kapan saja dengan menekan tombol **Keluar Akun** di `akun.html`.

Ini bukan autentikasi produksi: kode akun demo bisa dibaca dan keadaan halaman bisa diubah dari browser. Tidak ada data rahasia yang dilindungi oleh demo ini. Jangan masukkan data pribadi atau password asli. Peran admin dan penjual saat ini hanya membuka tampilan sesuai peran; fitur pengelolaan pengguna, produk, dan pesanan belum dibuat.

## Menyambungkan Firebase atau Supabase nanti

Paket ini BELUM terhubung ke layanan mana pun dan tidak berisi SDK atau konfigurasi akun layanan. Anda bisa memilih salah satu backend tanpa mengubah keseluruhan tampilan.

Semua akses data di `script.js` melalui objek `Backend` dari `backend.js`:

| Fungsi | Masukan | Hasil yang diharapkan |
| --- | --- | --- |
| `ambilProduk()` | Tidak ada | Array produk: id, nama, harga, posisi, deskripsi |
| `masuk(username, password)` | Kredensial | Profil: username, nama, peran |
| `daftar(username, password)` | Data akun baru | Profil: username, nama, peran |
| `penggunaAktif()` | Tidak ada | Profil atau null |
| `simpanProfil(nama)` | Nama tampilan | Profil terbaru |
| `keluar()` | Tidak ada | Sesi berakhir |

Langkah integrasi:

1. Buat proyek pada layanan yang dipilih.
2. Ganti implementasi demo di `backend.js` dengan autentikasi dan akses data layanan tersebut.
3. Pertahankan nama fungsi di atas; fungsi dapat memakai `await` dan melempar `Error` agar pesan muncul di halaman.
4. Jika memakai login email, ubah label, tipe input, dan validasi username pada `index.html` dan adapter Anda. Jangan menyimpan password di tabel/collection profil; gunakan layanan autentikasi.
5. Atur akses data pada backend. Peran Admin/Penjual harus ditetapkan dan diverifikasi secara tepercaya di backend, bukan ditentukan dari pilihan pengguna atau variabel JavaScript.
6. Jangan menaruh private key atau kunci administrator/service-role pada kode browser.
7. Setelah backend terpasang dan diuji, hapus akun demo, pemberitahuan demo, dan sesuaikan pesan penyimpanan profil.

Tidak ada SQL yang harus dijalankan untuk membuka paket ini. Konfigurasi database, autentikasi, dan izin pada layanan pilihan Anda tetap diperlukan saat integrasi nyata.

## Fitur yang sudah bisa dicoba

- Navigasi halaman dan menu ponsel.
- Koleksi, pencarian, detail produk, jumlah barang, dan total tas belanja.
- Simulasi pilihan pembayaran; tidak ada penagihan atau QRIS aktif.
- Login tiga peran, daftar demo, edit nama profil demo, dan logout.
- Panduan belajar bertahap dan perbesar tulisan.
- Rancangan anggaran Rp40 juta dan cetak draf surat mitra.

Proposal, kegiatan, katalog, serta profil koperasi adalah rancangan/contoh yang perlu dikonfirmasi. Paket ini adalah versi kode sederhana terpisah; tautan web sebelumnya tidak diubah.

## Kredit foto

Foto: Meithyra Melviana Simatupang / Wikimedia Commons.
Sumber: https://commons.wikimedia.org/wiki/File:Kain_Tenun_Lombok_(Woven_Fabric_of_Lombok).jpg
Lisensi: https://creativecommons.org/licenses/by-sa/4.0/
Foto diperkecil, dikompres, dan dipotong dalam tampilan CSS. Foto hasil perubahan tetap CC BY-SA 4.0.
