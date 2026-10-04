# Aktivasi pembayaran Xendit

Implementasi menggunakan Payment Sessions (`POST /sessions`) dengan halaman checkout yang dihosting Xendit. Total diambil dari database, bukan dari browser.

Status pemasangan 5 Oktober 2026: migrasi Xendit dan kedua fungsi sudah dipasang di proyek Supabase `lsewgdyamxfblzcjkwti`; secret key Test, token webhook, dan `SITE_URL=https://rumah-tenun.vercel.app` sudah disimpan di server. Webhook Completed dan Expired mode Test diarahkan ke fungsi webhook. API Xendit sudah diuji dengan membuat, membaca, dan membatalkan satu session diagnostik tanpa membayar atau mengubah stok toko. Pengujian dashboard hanya mengakui contoh event, bukan bukti suatu pesanan telah lunas.

## Konfigurasi server

Di Supabase → Edge Functions → Secrets, simpan:

| Nama | Isi |
| --- | --- |
| `XENDIT_SECRET_KEY` | Secret API key baru dari Xendit. Jangan taruh di HTML/JavaScript browser atau commit Git. |
| `XENDIT_MODE` | `test` untuk kunci development; `live` untuk kunci production. |
| `XENDIT_WEBHOOK_TOKEN` | Verification token dari pengaturan webhook Xendit untuk lingkungan yang sama. |
| `SITE_URL` | URL HTTPS situs, tanpa query/hash. Contoh: `https://toko.example.com`. Boleh tidak disetel saat pengembangan; pembeli harus kembali ke dashboard sendiri. |

Supabase menyediakan `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` untuk fungsi server. Jangan pindahkan service-role key ke browser.

Kunci yang pernah dibagikan dalam chat sebaiknya dicabut dan diganti di Xendit. Simpan penggantinya langsung sebagai secret Supabase.

## Pasang perubahan server

Setelah pemilik menyetujui perubahan database online:

```sh
npx supabase link --project-ref lsewgdyamxfblzcjkwti
npx supabase db push --linked
npx supabase functions deploy xendit-payment --project-ref lsewgdyamxfblzcjkwti
npx supabase functions deploy xendit-webhook --project-ref lsewgdyamxfblzcjkwti
```

Kedua fungsi memakai `verify_jwt = false` pada gateway Supabase. `xendit-payment` memvalidasi sendiri bearer token memakai `auth.getUser`; `xendit-webhook` memvalidasi `x-callback-token` dan membaca ulang session dari API Xendit. Pembeli hanya dapat mengakses pembayaran miliknya.

## Webhook Xendit

Di dashboard Xendit, pilih mode Test dan atur notifikasi **Payment Session Completed** serta **Payment Session Expired** ke:

```text
https://lsewgdyamxfblzcjkwti.supabase.co/functions/v1/xendit-webhook
```

Simpan verification token mode Test sebagai `XENDIT_WEBHOOK_TOKEN`. Kanal QRIS, virtual account, dan dompet digital yang tampil mengikuti aktivasi/kelayakan akun Xendit; pilihan checkout toko adalah preferensi, bukan jaminan bahwa kanal tertentu tersedia.

## Uji sebelum menerima pembayaran nyata

1. Jalankan `npm install` dan `npm test` untuk pengujian transaksi PostgreSQL lokal.
2. Buka situs lewat server HTTP, masuk sebagai pembeli, pilih produk, lalu checkout.
3. Pastikan halaman pembayaran menampilkan **MODE UJI COBA**, total benar, dan tombol menuju domain checkout Xendit.
4. Selesaikan simulasi pada halaman Xendit. Periksa bahwa pesanan menjadi `confirmed / checking` tanpa laporan pembayaran manual.
5. Periksa pengiriman webhook di Xendit. Kirim ulang event yang sama: stok dan status tidak boleh berubah dua kali.
6. Uji session kedaluwarsa: pesanan menjadi `cancelled`, stok kembali satu kali.
7. Uji dua tab/klik berulang, koneksi terputus, serta akun lain yang mencoba membuka pesanan. Tidak boleh terjadi session pembayaran ganda.

Pengujian lokal memeriksa idempotensi pesanan, hak akses, pemalsuan status, nilai pembayaran, urutan status, dan pengembalian stok. Pengujian tersebut belum membuktikan kanal Xendit atau webhook akun Anda berfungsi; lakukan uji sandbox setelah deployment.

## Ketentuan dan pemulihan

- Ongkir yang ditagihkan saat ini **Rp0**; total gateway hanya harga produk. Biaya pengiriman lain harus disepakati sebelum pembayaran. Belum ada tarif kurir otomatis.
- Pembeli tidak dapat menandai pembayaran Xendit sebagai lunas. Admin hanya melanjutkan proses pengemasan/pengiriman setelah pembayaran terverifikasi.
- Pesanan manual lama tetap dapat diproses memakai alur sebelumnya.
- Penutupan halaman Xendit bukan pembatalan pesanan; tunggu event kedaluwarsa atau status terminal dari API.
- Bila request pembuatan session terputus setelah terkirim, record tetap `CREATING` agar retry tidak membuat pembayaran kedua. Cari session dengan reference `rm-<UUID pesanan>` di Xendit dan cocokkan total/currency. Pengelola harus merekonsiliasi session itu sebelum melepas record; jangan menghapus claim tanpa memastikan tidak ada session aktif/berbayar.
- Jika webhook datang sebelum session tersimpan, server mengembalikan 503 agar Xendit mengirim ulang. Halaman status juga membaca ulang API Xendit saat dibuka dan secara berkala selama lima menit.
- Format session ID `payment_session_id` dan `id` didukung. Event dari contoh dashboard atau aplikasi lain pada akun yang sama diakui tanpa mengubah pesanan toko. Event pesanan toko yang belum tersimpan tetap diminta untuk dikirim ulang.
- Untuk beralih ke Live, selesaikan semua session Test terlebih dahulu, lalu ganti key, mode, token webhook, dan konfigurasi webhook Live bersama-sama. Kunci Test dan Live tidak boleh dipakai bergantian untuk session yang sama.
- Refund, pembatalan session oleh admin, rekonsiliasi massal, dan penjadwalan pembersihan pesanan tanpa session belum tersedia. Jangan aktifkan uang nyata sebelum proses operasional ini disepakati.

## Referensi resmi

- [Create a session](https://docs.xendit.co/apidocs/create-session)
- [Get the status of a session](https://docs.xendit.co/apidocs/get-session)
- [One Time Payment](https://docs.xendit.co/docs/payment-1)
- [Payment Session webhook](https://docs.xendit.co/apidocs/webhook-notification-sent-defined-webhook-url-updates-payment-session)
