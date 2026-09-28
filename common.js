// ============================================================
// HELPER BERSAMA DAN STATUS MULTI-PAGE
// ============================================================
const $ = id => document.getElementById(id);

function rupiah(nilai) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0
  }).format(nilai);
}

function elemen(tag, kelas, teks) {
  const hasil = document.createElement(tag);
  if (kelas) hasil.className = kelas;
  if (teks !== undefined) hasil.textContent = teks;
  return hasil;
}

// ============================================================
// SISTEM KERANJANG PERSISTEN (LOCALSTORAGE)
// ============================================================
const STORAGE_KEY_CART = 'rm_cart_items';

function bacaKeranjang() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CART);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Gagal membaca keranjang:', e);
  }
  return {};
}

function simpanKeranjang(keranjang) {
  try {
    localStorage.setItem(STORAGE_KEY_CART, JSON.stringify(keranjang));
  } catch (e) {
    console.warn('Gagal menyimpan keranjang:', e);
  }
  updateBadgeKeranjang();
}

function updateBadgeKeranjang() {
  const badge = $('cart-count');
  if (!badge) return;
  const keranjang = bacaKeranjang();
  let totalBanyak = 0;
  for (const id in keranjang) {
    totalBanyak += keranjang[id] || 0;
  }
  badge.textContent = totalBanyak;
}

function ubahJumlahKeranjang(id, delta) {
  const keranjang = bacaKeranjang();
  const current = keranjang[id] || 0;
  const baru = Math.max(0, current + delta);
  if (baru === 0) {
    delete keranjang[id];
  } else {
    keranjang[id] = baru;
  }
  simpanKeranjang(keranjang);
  tampilIsiKeranjang();
}

function tambahKeKeranjang(id) {
  const keranjang = bacaKeranjang();
  keranjang[id] = (keranjang[id] || 0) + 1;
  simpanKeranjang(keranjang);
}

function tampilIsiKeranjang() {
  const wadah = $('cart-items');
  if (!wadah) return;
  wadah.replaceChildren();

  const keranjang = bacaKeranjang();
  const daftarProduk = typeof produkContoh !== 'undefined' ? produkContoh : [];
  let jumlah = 0;
  let total = 0;

  daftarProduk.forEach(item => {
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
    kurang.addEventListener('click', () => ubahJumlahKeranjang(item.id, -1));
    tambah.addEventListener('click', () => ubahJumlahKeranjang(item.id, 1));
    kontrol.append(kurang, elemen('span', '', banyak), tambah);
    baris.append(info, kontrol);
    wadah.append(baris);
  });

  if (!jumlah) {
    wadah.append(elemen('p', '', 'Tas masih kosong. Silakan pilih kain dari halaman koleksi.'));
  }

  if ($('cart-count')) $('cart-count').textContent = jumlah;
  if ($('cart-total')) $('cart-total').textContent = rupiah(total);
  if ($('checkout-button')) $('checkout-button').disabled = jumlah === 0;
  if ($('payment-panel') && !jumlah) $('payment-panel').hidden = true;
}

function initKeranjangDialog() {
  const tombolTas = $('cart-button');
  const dialogTas = $('cart-dialog');
  if (tombolTas && dialogTas) {
    tombolTas.addEventListener('click', () => {
      tampilIsiKeranjang();
      if ($('payment-panel')) $('payment-panel').hidden = true;
      dialogTas.showModal();
    });
  }

  const tombolCheckout = $('checkout-button');
  if (tombolCheckout) {
    tombolCheckout.addEventListener('click', () => {
      if ($('payment-panel')) {
        $('payment-panel').hidden = false;
        tampilPembayaranSimulasi();
      }
    });
  }

  const pilihanBayar = $('payment-method');
  if (pilihanBayar) {
    pilihanBayar.addEventListener('change', tampilPembayaranSimulasi);
  }
}

function tampilPembayaranSimulasi() {
  const select = $('payment-method');
  const desc = $('payment-description');
  if (!select || !desc) return;
  const cara = select.value;
  const penjelasan = {
    'QRIS': 'Pindai kode pembayaran resmi melalui aplikasi bank atau dompet digital.',
    'Transfer bank': 'Periksa nomor rekening, nama penerima, dan nominal sebelum transfer.',
    'Dompet digital': 'Periksa saldo, nama penerima, dan nominal dalam aplikasi Anda.'
  };
  desc.textContent = (penjelasan[cara] || '') + ' Ini simulasi; belum ada transaksi atau pembayaran nyata.';
}

// ============================================================
// HEADER & NAVIGASI STICKY BERSAMA
// ============================================================
function initNavigasiBersama() {
  // Mobile menu button
  const menuBtn = $('menu-button');
  const nav = $('navigation');
  if (menuBtn && nav) {
    menuBtn.addEventListener('click', () => {
      const terbuka = nav.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', String(terbuka));
    });
  }

  // Active navigation link detection
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('nav a').forEach(link => {
    const href = link.getAttribute('href');
    if (!href) return;
    const targetFile = href.split('#')[0];
    if (targetFile === currentPath || (currentPath === '' && targetFile === 'index.html')) {
      link.setAttribute('aria-current', 'page');
      link.classList.add('active');
    } else {
      link.removeAttribute('aria-current');
      link.classList.remove('active');
    }
  });

  // Tombol Akun / Masuk di Header
  const loginBtn = $('login-button');
  if (loginBtn && typeof Backend !== 'undefined') {
    const pengguna = Backend.penggunaAktif();
    pengguna.then(user => {
      if (user) {
        loginBtn.textContent = 'Akun (' + user.peran + ') ↗';
        loginBtn.onclick = () => { window.location.href = 'akun.html'; };
      } else {
        loginBtn.textContent = 'Masuk ↗';
        loginBtn.onclick = () => { window.location.href = 'login.html'; };
      }
    });
  }

  // Tombol tutup [data-close] untuk dialog
  document.querySelectorAll('[data-close]').forEach(tombol => {
    tombol.addEventListener('click', () => {
      const d = tombol.closest('dialog');
      if (d) d.close();
    });
  });

  // Scroll effect on sticky header
  const headerWrapper = document.querySelector('.header-wrapper');
  if (headerWrapper) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 15) {
        headerWrapper.classList.add('scrolled');
      } else {
        headerWrapper.classList.remove('scrolled');
      }
    }, { passive: true });
  }

  updateBadgeKeranjang();
  initKeranjangDialog();
}

document.addEventListener('DOMContentLoaded', initNavigasiBersama);
