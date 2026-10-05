// ============================================================
// 1. VARIABEL DAN FUNGSI BANTU
// ============================================================
const $ = id => document.getElementById(id);
let produk = [];
let keranjang = {};
let produkDipilih = null;
let pengguna = null;
let modeDaftar = false;
let materiDipilih = 0;
let langkahAktif = 0;

function rupiah(nilai) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0
  }).format(nilai);
}

// Membuat elemen dengan textContent agar input tidak dianggap kode HTML.
function elemen(tag, kelas, teks) {
  const hasil = document.createElement(tag);
  if (kelas) hasil.className = kelas;
  if (teks !== undefined) hasil.textContent = teks;
  return hasil;
}

// ============================================================
// 2. NAVIGASI HALAMAN
// ============================================================
function tampilHalaman() {
  let tujuan = location.hash.slice(1) || 'beranda';
  const daftarHalaman = ['beranda', 'koleksi', 'belajar', 'tentang', 'akun'];
  if (!daftarHalaman.includes(tujuan)) tujuan = 'beranda';
  if (tujuan === 'akun' && !pengguna) {
    tujuan = 'beranda';
    bukaLogin();
  }
  document.querySelectorAll('.page').forEach(halaman => {
    halaman.hidden = halaman.id !== tujuan;
  });
  document.querySelectorAll('nav a').forEach(tautan => {
    if (tautan.hash === '#' + tujuan) tautan.setAttribute('aria-current', 'page');
    else tautan.removeAttribute('aria-current');
  });
  $('navigation').classList.remove('open');
  $('menu-button').setAttribute('aria-expanded', 'false');
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', tampilHalaman);
$('menu-button').addEventListener('click', () => {
  const terbuka = $('navigation').classList.toggle('open');
  $('menu-button').setAttribute('aria-expanded', String(terbuka));
});

// Tombol tutup dan Escape memakai perilaku bawaan <dialog>.
document.querySelectorAll('[data-close]').forEach(tombol => {
  tombol.addEventListener('click', () => tombol.closest('dialog').close());
});

// ============================================================
// 3. KATALOG DAN DETAIL PRODUK
// ============================================================
function tampilProduk(wadahId, daftar) {
  const wadah = $(wadahId);
  wadah.replaceChildren();
  daftar.forEach(item => {
    const kartu = elemen('button', 'product');
    const foto = elemen('div', 'product-photo');
    foto.style.backgroundPosition = item.posisi;
    foto.append(elemen('span', '', 'Tenun tradisional'));
    kartu.append(foto, elemen('h3', '', item.nama), elemen('strong', '', rupiah(item.harga)));
    kartu.addEventListener('click', () => bukaProduk(item));
    wadah.append(kartu);
  });
}
function bukaProduk(item) {
  produkDipilih = item;
  $('product-title').textContent = item.nama;
  $('product-description').textContent = item.deskripsi;
  $('product-price').textContent = rupiah(item.harga);
  $('product-photo').style.backgroundPosition = item.posisi;
  $('product-photo').setAttribute('aria-label', 'Ilustrasi ' + item.nama);
  $('product-dialog').showModal();
}
$('search').addEventListener('input', event => {
  const kata = event.target.value.toLowerCase().trim();
  const hasil = produk.filter(item => item.nama.toLowerCase().includes(kata));
  tampilProduk('catalog-products', hasil);
  $('search-empty').hidden = hasil.length > 0;
});

// ============================================================
// 4. KERANJANG DAN SIMULASI PEMBAYARAN
// ============================================================
function tampilKeranjang() {
  $('cart-items').replaceChildren();
  let jumlah = 0;
  let total = 0;
  produk.forEach(item => {
    const banyak = keranjang[item.id] || 0;
    if (!banyak) return;
    jumlah += banyak;
    total += banyak * item.harga;
    const baris = elemen('div', 'cart-row');
    const info = elemen('div');
    info.append(elemen('strong', '', item.nama), elemen('p', '', rupiah(item.harga)));
    const kontrol = elemen('div', 'quantity');
    const kurang = elemen('button', '', '−');
    const tambah = elemen('button', '', '+');
    kurang.setAttribute('aria-label', 'Kurangi ' + item.nama);
    tambah.setAttribute('aria-label', 'Tambah ' + item.nama);
    kurang.addEventListener('click', () => ubahJumlah(item.id, -1));
    tambah.addEventListener('click', () => ubahJumlah(item.id, 1));
    kontrol.append(kurang, elemen('span', '', banyak), tambah);
    baris.append(info, kontrol);
    $('cart-items').append(baris);
  });
  if (!jumlah) $('cart-items').append(elemen('p', '', 'Tas masih kosong. Pilih kain dari koleksi.'));
  $('cart-count').textContent = jumlah;
  $('cart-total').textContent = rupiah(total);
  $('checkout-button').disabled = jumlah === 0;
  if (!jumlah) $('payment-panel').hidden = true;
}
function ubahJumlah(id, perubahan) {
  keranjang[id] = Math.max(0, (keranjang[id] || 0) + perubahan);
  tampilKeranjang();
}
$('add-cart').addEventListener('click', () => {
  if (!produkDipilih) return;
  ubahJumlah(produkDipilih.id, 1);
  $('product-dialog').close();
  $('payment-panel').hidden = true;
  $('cart-dialog').showModal();
});
$('cart-button').addEventListener('click', () => {
  tampilKeranjang();
  $('payment-panel').hidden = true;
  $('cart-dialog').showModal();
});
function tampilPembayaran() {
  const cara = $('payment-method').value;
  const penjelasan = {
    'QRIS': 'Pindai kode pembayaran resmi melalui aplikasi bank atau dompet digital.',
    'Transfer bank': 'Periksa nomor rekening, nama penerima, dan nominal sebelum transfer.',
    'Dompet digital': 'Periksa saldo, nama penerima, dan nominal dalam aplikasi Anda.'
  };
  $('payment-description').textContent = penjelasan[cara] + ' Ini simulasi; belum ada transaksi atau pembayaran nyata.';
}
$('checkout-button').addEventListener('click', () => {
  $('payment-panel').hidden = false;
  tampilPembayaran();
});
$('payment-method').addEventListener('change', tampilPembayaran);

// ============================================================
// 5. LOGIN, DAFTAR, DAN PROFIL DEMO
// ============================================================
function aturFormLogin() {
  $('auth-form').reset();
  $('auth-error').textContent = '';
  $('auth-title').textContent = modeDaftar ? 'Mari tumbuh bersama.' : 'Selamat datang kembali.';
  $('auth-submit').textContent = modeDaftar ? 'Daftar akun demo' : 'Masuk';
  $('auth-switch').textContent = modeDaftar ? 'Sudah punya akun? Masuk' : 'Belum punya akun? Daftar demo';
  $('password').minLength = modeDaftar ? 6 : 1;
  $('password').autocomplete = modeDaftar ? 'new-password' : 'current-password';
  $('demo-hint').textContent = modeDaftar
    ? 'Akun baru menjadi Pembeli. Akun demo hilang saat halaman di-refresh.'
    : 'Akun: user, admin, penjual · kata sandi semua: 123';
}
function bukaLogin() {
  modeDaftar = false;
  aturFormLogin();
  if (!$('auth-dialog').open) $('auth-dialog').showModal();
}
$('login-button').addEventListener('click', () => {
  if (pengguna) { location.hash = 'akun'; tampilHalaman(); }
  else bukaLogin();
});
$('auth-switch').addEventListener('click', () => {
  modeDaftar = !modeDaftar;
  aturFormLogin();
});
$('auth-form').addEventListener('submit', async event => {
  event.preventDefault();
  $('auth-submit').disabled = true;
  $('auth-error').textContent = '';
  try {
    const username = $('username').value;
    const password = $('password').value;
    pengguna = modeDaftar
      ? await Backend.daftar(username, password)
      : await Backend.masuk(username, password);
    $('auth-dialog').close();
    $('auth-form').reset();
    tampilAkun();
    location.hash = 'akun';
    tampilHalaman();
  } catch (error) {
    $('auth-error').textContent = error.message;
  } finally {
    $('auth-submit').disabled = false;
  }
});
function tampilAkun() {
  $('login-button').textContent = pengguna ? 'Akun ' : 'Masuk ';
  if (!pengguna) return;
  $('account-title').textContent = 'Ruang ' + pengguna.peran.toLowerCase() + '.';
  $('account-info').textContent = 'Halo, ' + pengguna.nama + ' · ' + pengguna.username;
  $('profile-name').value = pengguna.nama;
  $('profile-message').textContent = '';
  const deskripsi = {
    Admin: 'Halaman demo admin. Pengelolaan pengguna dan katalog belum tersedia.',
    Penjual: 'Halaman demo penjual. Pengelolaan produk dan pesanan belum tersedia.',
    Pembeli: 'Jelajahi koleksi tenun dan ruang belajar dari menu utama.'
  };
  $('role-description').textContent = deskripsi[pengguna.peran] || '';
}
$('profile-form').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    pengguna = await Backend.simpanProfil($('profile-name').value);
    tampilAkun();
    $('profile-message').textContent = 'Profil demo diperbarui untuk halaman ini.';
  } catch (error) {
    $('profile-message').textContent = error.message;
  }
});
$('logout-button').addEventListener('click', async () => {
  try {
    await Backend.keluar();
    pengguna = null;
    $('profile-form').reset();
    tampilAkun();
    location.hash = 'beranda';
    tampilHalaman();
  } catch (error) {
    $('profile-message').textContent = 'Gagal keluar: ' + error.message;
  }
});

// ============================================================
// 6. MATERI BELAJAR DAN DOKUMEN
// ============================================================
function tampilLangkah() {
  const materi = materiBelajar[materiDipilih];
  $('lesson-title').textContent = materi.judul;
  $('lesson-progress').textContent = 'LANGKAH ' + (langkahAktif + 1) + ' DARI ' + materi.langkah.length;
  $('lesson-text').textContent = materi.langkah[langkahAktif];
  $('lesson-back').disabled = langkahAktif === 0;
  $('lesson-next').textContent = langkahAktif === materi.langkah.length - 1 ? 'Selesai ✓' : 'Lanjut →';
}
$('lesson-back').addEventListener('click', () => {
  if (langkahAktif > 0) langkahAktif--;
  tampilLangkah();
});
$('lesson-next').addEventListener('click', () => {
  if (langkahAktif === materiBelajar[materiDipilih].langkah.length - 1) $('lesson-dialog').close();
  else { langkahAktif++; tampilLangkah(); }
});
$('font-button').addEventListener('click', () => {
  const besar = document.body.classList.toggle('large-text');
  $('font-button').textContent = besar ? 'Aa · Tulisan biasa' : 'Aa · Perbesar tulisan';
  $('font-button').setAttribute('aria-pressed', String(besar));
});
$('letter-button').addEventListener('click', () => $('letter-dialog').showModal());
$('print-letter').addEventListener('click', () => window.print());

// ============================================================
// 7. JALANKAN SAAT HALAMAN SIAP
// ============================================================
async function mulai() {
  materiBelajar.forEach((materi, index) => {
    const kartu = elemen('button', 'lesson-card');
    kartu.append(
      elemen('span', 'eyebrow', 'PANDUAN 0' + (index + 1) + ' · ' + materi.durasi),
      elemen('h2', '', materi.judul),
      elemen('span', 'text-link', 'Mulai belajar →')
    );
    kartu.addEventListener('click', () => {
      materiDipilih = index;
      langkahAktif = 0;
      tampilLangkah();
      $('lesson-dialog').showModal();
    });
    $('lesson-list').append(kartu);
  });
  try {
    produk = await Backend.ambilProduk();
    tampilProduk('featured-products', produk);
    tampilProduk('catalog-products', produk);
    pengguna = await Backend.penggunaAktif();
    tampilAkun();
  } catch (error) {
    $('featured-products').textContent = 'Data belum bisa dimuat: ' + error.message;
    $('catalog-products').textContent = 'Data belum bisa dimuat. Muat ulang untuk mencoba lagi.';
  }
  tampilKeranjang();
  tampilHalaman();
}
mulai();
