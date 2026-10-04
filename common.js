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
let katalogProduk = [];

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
  badge.style.display = totalBanyak > 0 ? 'inline-block' : 'none';
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
  renderKeranjangHalaman();
  renderRingkasanCheckout();
}

function tambahKeKeranjang(id) {
  const keranjang = bacaKeranjang();
  keranjang[id] = (keranjang[id] || 0) + 1;
  simpanKeranjang(keranjang);
}

function renderKeranjangHalaman() {
  const wadah = $('cart-page-items');
  if (!wadah) return;
  wadah.replaceChildren();

  const keranjang = bacaKeranjang();
  const daftarProduk = katalogProduk;
  let jumlah = 0;
  let total = 0;

  daftarProduk.forEach(item => {
    const banyak = keranjang[item.id] || 0;
    if (!banyak) return;
    jumlah += banyak;
    total += banyak * item.harga;

    const baris = elemen('article', 'cart-page-row');
    const foto = elemen('div', 'cart-page-photo');
    if (item.imageUrl) {
      foto.style.backgroundImage = `url("${item.imageUrl}")`;
      foto.style.backgroundSize = 'cover';
      foto.style.backgroundPosition = 'center';
    } else {
      foto.style.backgroundPosition = item.posisi;
    }
    foto.setAttribute('role', 'img');
    foto.setAttribute('aria-label', 'Ilustrasi ' + item.nama);

    const info = elemen('div', 'cart-page-info');
    info.append(elemen('h2', '', item.nama), elemen('p', '', rupiah(item.harga) + ' / kain'));
    if (item.sellerName) info.append(elemen('p', 'product-seller', 'Penjual: ' + item.sellerName));

    const kontrol = elemen('div', 'quantity cart-page-quantity');
    const kurang = elemen('button', '', '−');
    const tambah = elemen('button', '', '+');
    const hapus = elemen('button', 'cart-remove', 'Hapus');
    kurang.type = 'button';
    tambah.type = 'button';
    hapus.type = 'button';
    kurang.setAttribute('aria-label', 'Kurangi ' + item.nama);
    tambah.setAttribute('aria-label', 'Tambah ' + item.nama);
    kurang.addEventListener('click', () => ubahJumlahKeranjang(item.id, -1));
    tambah.addEventListener('click', () => ubahJumlahKeranjang(item.id, 1));
    hapus.addEventListener('click', () => ubahJumlahKeranjang(item.id, -banyak));
    kontrol.append(kurang, elemen('span', '', banyak), tambah, hapus);

    baris.append(foto, info, kontrol, elemen('strong', 'cart-page-line-total', rupiah(banyak * item.harga)));
    wadah.append(baris);
  });

  const kosong = $('cart-page-empty');
  const layout = $('cart-page-layout');
  if (kosong) kosong.hidden = jumlah > 0;
  if (layout) layout.hidden = jumlah === 0;
  if ($('cart-page-count')) $('cart-page-count').textContent = `${jumlah} kain`;
  if ($('cart-page-subtotal')) $('cart-page-subtotal').textContent = rupiah(total);
  if ($('cart-page-total')) $('cart-page-total').textContent = rupiah(total);
}

function renderRingkasanCheckout() {
  const wadah = $('checkout-items');
  if (!wadah) return;
  wadah.replaceChildren();

  const keranjang = bacaKeranjang();
  const daftarProduk = katalogProduk;
  let jumlah = 0;
  let total = 0;

  daftarProduk.forEach(item => {
    const banyak = keranjang[item.id] || 0;
    if (!banyak) return;
    jumlah += banyak;
    total += banyak * item.harga;
    const baris = elemen('div', 'checkout-item');
    baris.append(
      elemen('span', '', `${item.nama} × ${banyak}`),
      elemen('strong', '', rupiah(item.harga * banyak))
    );
    wadah.append(baris);
  });

  if ($('checkout-subtotal')) $('checkout-subtotal').textContent = rupiah(total);
  if ($('checkout-total')) $('checkout-total').textContent = rupiah(total);
  if ($('checkout-submit')) $('checkout-submit').disabled = jumlah === 0;
  if ($('checkout-empty')) $('checkout-empty').hidden = jumlah > 0;
  if ($('checkout-content')) $('checkout-content').hidden = jumlah === 0;
}

function initKeranjang() {
  const tombolTas = $('cart-button');
  if (tombolTas) {
    tombolTas.addEventListener('click', () => {
      window.location.href = 'keranjang.html';
    });
  }

  renderKeranjangHalaman();
  renderRingkasanCheckout();

  const checkoutForm = $('checkout-form');
  if (!checkoutForm) return;

  Backend.penggunaAktif().then(user => {
    const jumlahItem = Object.values(bacaKeranjang()).reduce((jumlah, banyak) => jumlah + banyak, 0);
    if (!jumlahItem) return;
    if (!user || user.peran === 'Guest') {
      $('checkout-login-required').hidden = false;
      $('checkout-content').hidden = true;
      return;
    }
    $('checkout-customer-name').value = user.nama;
    $('checkout-login-required').hidden = true;
    $('checkout-content').hidden = false;
    renderRingkasanCheckout();
  });

  checkoutForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!checkoutForm.reportValidity()) return;
    const submit = $('checkout-submit');
    const errorMessage = $('checkout-submit-error');
    submit.disabled = true;
    errorMessage.textContent = '';
    try {
      const orderId = await Backend.buatPesanan({
        nama: $('checkout-customer-name').value,
        telepon: $('checkout-phone').value,
        alamat: $('checkout-address').value,
        metode: checkoutForm.querySelector('input[name="payment-method"]:checked').value
      }, bacaKeranjang());
      $('checkout-order-number').textContent = 'Nomor pesanan: ' + orderId.slice(0, 8).toUpperCase();
      $('checkout-content').hidden = true;
      $('checkout-success').hidden = false;
      localStorage.removeItem(STORAGE_KEY_CART);
      updateBadgeKeranjang();
      renderKeranjangHalaman();
      renderRingkasanCheckout();
    } catch (error) {
      errorMessage.textContent = error.message || 'Pesanan gagal disimpan. Keranjang Anda tetap tersimpan.';
    } finally {
      submit.disabled = false;
    }
  });
}

// ============================================================
// HEADER & NAVIGASI STICKY BERSAMA (ICON TAS & ICON USER)
// ============================================================
async function initNavigasiBersama() {
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

  // RENDER TOMBOL AKSI HEADER (ICON TAS & ICON USER)
  setupHeaderActions();

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
}

async function setupHeaderActions() {
  const actionsContainer = document.querySelector('.header-actions');
  if (!actionsContainer) return;

  const user = await Backend.penggunaAktif();
  const navigation = $('navigation');
  const isStaff = user && ['Admin', 'Penjual'].includes(user.peran);
  if (navigation && isStaff) {
    const linksByRole = {
      Admin: [
        ['akun.html', 'Dashboard Admin'],
        ['koleksi.html', 'Katalog']
      ],
      Penjual: [
        ['akun.html', 'Dashboard Penjual'],
        ['koleksi.html', 'Etalase Produk'],
        ['belajar.html', 'Panduan Usaha']
      ]
    };
    const links = linksByRole[user.peran] || linksByRole.Pembeli;
    navigation.replaceChildren(...links.map(([href, label]) => {
      const link = elemen('a', '', label);
      link.href = href;
      return link;
    }));

    const footerColumns = document.querySelectorAll('.site-footer .footer-col');
    if (footerColumns.length >= 3) {
      footerColumns[1].querySelector('h4').textContent = user.peran === 'Admin' ? 'Menu Admin' : 'Menu Penjual';
      const footerList = footerColumns[1].querySelector('ul');
      footerList.replaceChildren();
      footerColumns[2].querySelector('ul').replaceChildren();
      links.forEach(([href, label]) => {
        const item = elemen('li');
        const link = elemen('a', '', label);
        link.href = href;
        item.append(link);
        footerList.append(item);
      });
      footerColumns[2].hidden = true;
    }
  }

  // 1. PASTIKAN TOMBOL TAS MENGGUNAKAN ICON TAS ELEGAN
  let cartBtn = $('cart-button');
  if (!cartBtn) {
    cartBtn = elemen('button', 'icon-btn');
    cartBtn.id = 'cart-button';
    actionsContainer.prepend(cartBtn);
  } else {
    cartBtn.className = 'icon-btn';
  }
  cartBtn.hidden = Boolean(isStaff);
  cartBtn.setAttribute('aria-label', 'Tas Belanja');
  cartBtn.setAttribute('title', 'Buka Tas Belanja');
  cartBtn.innerHTML = `
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
      <line x1="3" y1="6" x2="21" y2="6"></line>
      <path d="M16 10a4 4 0 0 1-8 0"></path>
    </svg>
    <span id="cart-count" class="cart-badge">0</span>
  `;

  // 2. KELOLA TOMBOL USER: JIKA BELUM LOGIN -> TOMBOL MASUK; JIKA SUDAH -> ICON USER DENGAN DROPDOWN INFO
  const existingLoginBtn = $('login-button');
  const existingUserWrapper = $('user-menu-wrapper');
  if (existingLoginBtn) existingLoginBtn.remove();
  if (existingUserWrapper) existingUserWrapper.remove();

  if (!user) {
    // Belum login: Tampilkan tombol Masuk
    const loginLink = elemen('a', 'primary', 'Masuk ↗');
    loginLink.id = 'login-button';
    loginLink.href = 'login.html';
    loginLink.style.cssText = 'padding: 8px 18px; min-height: 42px; font-size: 0.9rem;';
    actionsContainer.append(loginLink);
  } else {
    // Sudah login: Buat ICON USER dengan DROPDOWN MENU
    const inisial = (user.nama || user.username || 'U').charAt(0).toUpperCase();
    const roleClass = user.peran ? user.peran.toLowerCase() : 'pembeli';

    const userWrapper = elemen('div', 'user-menu-wrapper');
    userWrapper.id = 'user-menu-wrapper';

    userWrapper.innerHTML = `
      <button id="user-profile-button" class="user-avatar-btn" aria-haspopup="true" aria-expanded="false" title="Akun: ${user.nama} (${user.peran})">
        <span>${inisial}</span>
      </button>
      <div class="user-dropdown" id="user-dropdown" hidden>
        <div class="user-dropdown-header">
          <div class="user-dropdown-avatar">${inisial}</div>
          <div class="user-dropdown-details">
            <strong>${user.nama}</strong>
            <small>@${user.username}</small>
            <span class="role-badge ${roleClass}">${user.peran}</span>
          </div>
        </div>
        <div class="user-dropdown-links">
          <a href="akun.html" class="user-dropdown-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            Ruang Anggota
          </a>
          <a href="koleksi.html" class="user-dropdown-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <path d="M16 10a4 4 0 0 1-8 0"></path>
            </svg>
            Koleksi Tenun
          </a>
        </div>
        <div class="user-dropdown-footer">
          <button id="dropdown-logout" class="dropdown-logout-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            Keluar Akun
          </button>
        </div>
      </div>
    `;

    actionsContainer.append(userWrapper);

    // Toggle Dropdown
    const avatarBtn = $('user-profile-button');
    const dropdown = $('user-dropdown');
    if (avatarBtn && dropdown) {
      avatarBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = !dropdown.hidden;
        dropdown.hidden = isOpen;
        avatarBtn.setAttribute('aria-expanded', String(!isOpen));
      });

      // Tutup saat klik di luar
      document.addEventListener('click', (e) => {
        if (!userWrapper.contains(e.target)) {
          dropdown.hidden = true;
          avatarBtn.setAttribute('aria-expanded', 'false');
        }
      });
    }

    // Logout via Dropdown
    const logoutBtn = $('dropdown-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await Backend.keluar();
        window.location.href = 'index.html';
      });
    }
  }

  try {
    katalogProduk = await Backend.ambilProduk();
  } catch (error) {
    console.error('Gagal memuat katalog untuk keranjang:', error);
  }
  updateBadgeKeranjang();
  initKeranjang();
}

document.addEventListener('DOMContentLoaded', () => initNavigasiBersama());
