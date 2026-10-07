document.addEventListener('DOMContentLoaded', async () => {
  const id = Number(new URLSearchParams(location.search).get('id'));
  const state = $('product-state');
  try {
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Produk tidak ditemukan. Silakan pilih kain dari koleksi.');
    const item = await Backend.ambilDetailProduk(id);
    if (!item) throw new Error('Produk tidak ditemukan atau belum tersedia. Silakan lihat koleksi lainnya.');
    document.title = item.nama + ' — Benang-Mawar';
    $('product-title').textContent = item.nama;
    $('product-breadcrumb').textContent = item.nama;
    $('product-price').textContent = rupiah(item.harga);
    $('product-description').textContent = item.deskripsi;
    $('product-description').hidden = !item.cerita;
    $('product-maker').textContent = item.pembuat ? 'Dibuat oleh ' + item.pembuat : '';
    $('product-maker').hidden = !item.pembuat;
    $('product-story-text').textContent = item.cerita || item.deskripsi || 'Cerita tenun belum ditambahkan oleh koperasi.';
    const sellerName = item.sellerName || 'Koperasi Rantai Mawar';
    $('product-seller').textContent = sellerName;
    $('product-seller-avatar').textContent = sellerName.split(/\s+/).slice(0,2).map(word => word[0]).join('').toUpperCase();
    const photo = $('product-photo');
    if (item.imageUrl) {
      photo.style.backgroundImage = `url("${item.imageUrl}")`;
      photo.style.backgroundSize = 'cover';
      $('product-caption').textContent = 'Foto ' + item.nama + ' dari koperasi.';
    }
    photo.style.backgroundPosition = item.imageUrl ? 'center' : item.posisi;
    photo.setAttribute('aria-label', (item.imageUrl ? 'Foto ' : 'Ilustrasi ') + item.nama);
    for (const [label, value] of [['Motif',item.motif],['Ukuran',item.ukuran],['Bahan',item.bahan]]) {
      if (value) $('product-specs').append(elemen('dt','',label), elemen('dd','',value));
    }
    const available = item.status === 'approved' && !item.deletedAt && item.stok > 0;
    const quantity = $('product-quantity');
    quantity.max = item.stok;
    quantity.disabled = !available;
    const minus = $('product-minus');
    const plus = $('product-plus');
    function syncQuantity() {
      minus.disabled = !available || Number(quantity.value) <= 1;
      plus.disabled = !available || Number(quantity.value) >= item.stok;
    }
    minus.addEventListener('click', () => { quantity.value = Math.max(1, Number(quantity.value) - 1); syncQuantity(); });
    plus.addEventListener('click', () => { quantity.value = Math.min(item.stok, Number(quantity.value) + 1); syncQuantity(); });
    syncQuantity();
    $('product-stock').textContent = available ? 'Tersedia ' + item.stok + ' kain' : 'Saat ini tidak tersedia untuk pembelian';
    async function add(buy) {
      $('product-add').disabled = $('product-buy').disabled = true;
      try {
      const account = await Backend.penggunaAktif();
      if (!account || account.peran !== 'Pembeli') { location.href = 'login.html'; return; }
      await muatKeranjangCloud();
      const cart = bacaKeranjang();
      const amount = Number(quantity.value);
      const current = Number(cart[item.id] || 0);
      if (!Number.isSafeInteger(amount) || amount < 1 || !Number.isSafeInteger(current) || current < 0 || current + amount > item.stok) {
        $('product-feedback').textContent = 'Periksa jumlah kain. Jumlah di tas dan pilihan Anda tidak boleh melebihi stok ' + item.stok + '.';
        return;
      }
      cart[item.id] = current + amount;
      await simpanKeranjang(cart);
      if (buy) { location.href = 'checkout.html'; return; }
      $('product-feedback').textContent = amount + ' kain ' + item.nama + ' ditambahkan ke tas.';
      $('product-cart-link').hidden = false;
      } catch(error) { $('product-feedback').textContent = error.message || 'Belum dapat menyimpan keranjang.'; }
      finally { $('product-add').disabled = $('product-buy').disabled = !available; }
    }
    $('product-add').disabled = $('product-buy').disabled = !available;
    $('product-add').addEventListener('click', () => add(false));
    $('product-buy').addEventListener('click', () => add(true));
    const user = await Backend.penggunaAktif();
    if (user && ['Penjual', 'Admin'].includes(user.peran)) {
      document.querySelector('.product-purchase').hidden = true;
      const manage = elemen('a', 'outline', 'Kelola di koperasi'); manage.href = 'akun.html';
      document.querySelector('.product-detail-info').append(manage);
    }
    state.hidden = true;
    $('product-detail').hidden = false;
  } catch (error) {
    state.textContent = error.message || 'Detail produk belum dapat dimuat. Coba muat ulang halaman.';
    state.append(document.createTextNode(' '), Object.assign(elemen('a','text-link','Lihat koleksi →'), { href: 'koleksi.html' }));
  }
});
