/*
  TITIK SAMBUNG BACKEND
  Saat ini semua fungsi memakai data DEMO dalam memori.
  Tidak ada SQL, localStorage, server, atau koneksi database.
  Refresh halaman = akun baru, profil, dan sesi demo hilang.

  Nanti ganti isi fungsi Backend dengan Firebase atau Supabase.
  Pertahankan nama fungsi dan bentuk hasilnya agar script.js tetap berjalan.
  Login di browser ini bukan pengamanan sungguhan. Jangan pakai untuk produksi.
*/
const STORAGE_KEY_AKUN = 'rm_akun_demo';
const STORAGE_KEY_SESI = 'rm_sesi_demo';

const defaultAkun = [
  { username: 'user', password: '123', peran: 'Pembeli', nama: 'User Demo' },
  { username: 'admin', password: '123', peran: 'Admin', nama: 'Admin Demo' },
  { username: 'penjual', password: '123', peran: 'Penjual', nama: 'Penjual Demo' }
];

function getStoredAkun() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_AKUN);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Gagal membaca akun demo dari localStorage:', e);
  }
  return defaultAkun.slice();
}

function saveStoredAkun(list) {
  try {
    localStorage.setItem(STORAGE_KEY_AKUN, JSON.stringify(list));
  } catch (e) {
    console.warn('Gagal menyimpan akun demo ke localStorage:', e);
  }
}

function getStoredSesi() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SESI);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Gagal membaca sesi demo dari localStorage:', e);
  }
  return null;
}

function saveStoredSesi(sesi) {
  try {
    if (sesi) {
      localStorage.setItem(STORAGE_KEY_SESI, JSON.stringify(sesi));
    } else {
      localStorage.removeItem(STORAGE_KEY_SESI);
    }
  } catch (e) {
    console.warn('Gagal menyimpan sesi demo ke localStorage:', e);
  }
}

const Backend = {
  akunDemo: getStoredAkun(),
  sesi: getStoredSesi(),

  // Hasil: array produk dengan id, nama, harga, posisi, dan deskripsi.
  async ambilProduk() {
    return typeof produkContoh !== 'undefined' ? produkContoh : [];
  },

  // Hasil login hanya profil. Jangan teruskan password ke komponen halaman.
  async masuk(username, password) {
    this.akunDemo = getStoredAkun();
    const akun = this.akunDemo.find(function (item) {
      return item.username.toLowerCase() === username.toLowerCase().trim() && item.password === password;
    });
    if (!akun) throw new Error('Username atau kata sandi salah.');
    this.sesi = { username: akun.username, nama: akun.nama, peran: akun.peran };
    saveStoredSesi(this.sesi);
    return this.sesi;
  },

  // Pendaftaran demo selalu Pembeli, tidak bisa memilih Admin.
  async daftar(username, password, namaLengkap) {
    username = username.toLowerCase().trim();
    if (!/^[a-z0-9_]{3,32}$/.test(username)) {
      throw new Error('Username: 3–32 huruf, angka, atau garis bawah.');
    }
    if (password.length < 6) throw new Error('Kata sandi akun baru minimal 6 karakter.');
    this.akunDemo = getStoredAkun();
    if (this.akunDemo.some(akun => akun.username.toLowerCase() === username)) {
      throw new Error('Username sudah dipakai. Pilih nama lain.');
    }
    const nama = namaLengkap && namaLengkap.trim().length >= 2 ? namaLengkap.trim() : username;
    const akunBaru = { username: username, password: password, peran: 'Pembeli', nama: nama };
    this.akunDemo.push(akunBaru);
    saveStoredAkun(this.akunDemo);
    return this.masuk(username, password);
  },

  async simpanProfil(nama) {
    if (!this.sesi) throw new Error('Silakan masuk terlebih dahulu.');
    nama = nama.trim();
    if (nama.length < 2 || nama.length > 80) throw new Error('Nama harus 2–80 karakter.');
    this.akunDemo = getStoredAkun();
    const akun = this.akunDemo.find(item => item.username.toLowerCase() === this.sesi.username.toLowerCase());
    if (akun) {
      akun.nama = nama;
      saveStoredAkun(this.akunDemo);
    }
    this.sesi.nama = nama;
    saveStoredSesi(this.sesi);
    return this.sesi;
  },

  async penggunaAktif() {
    this.sesi = getStoredSesi();
    return this.sesi;
  },

  async keluar() {
    this.sesi = null;
    saveStoredSesi(null);
  }
};
