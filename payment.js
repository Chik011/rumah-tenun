// payment.js — Sistem pembayaran manual terintegrasi database Supabase
// Metode pembayaran diatur oleh Admin di dashboard koperasi (QRIS, Bank, Dompet Digital)

const WHATSAPP_ADMIN = '6281234567890'; // Nomor WhatsApp pengelola koperasi

document.addEventListener('DOMContentLoaded', async () => {
  const orderId = new URLSearchParams(location.search).get('order');
  if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
    tampilkanPesan('Pesanan tidak ditemukan.', 'Buka pesanan Anda dari halaman akun.');
    return;
  }

  let user;
  try { user = await Backend.penggunaAktif(); } catch (_) {
    tampilkanPesan('Akun belum dapat diperiksa.', 'Periksa koneksi Anda, lalu muat ulang halaman.');
    return;
  }
  if (!user || user.peran === 'Guest') {
    tampilkanPesan('Masuk untuk melanjutkan.', 'Gunakan akun pembeli yang membuat pesanan ini.');
    const loginEl = $('payment-login');
    if (loginEl) { loginEl.href = 'login.html?next=' + encodeURIComponent('pembayaran.html?order=' + orderId); loginEl.hidden = false; }
    return;
  }

  // Ambil data order dari Supabase
  let order;
  try {
    const { data, error } = await supabaseClient
      .from('orders')
      .select('id, total, payment_method, payment_status, order_status, buyer_name, order_items(item_name, quantity, unit_price)')
      .eq('id', orderId)
      .single();
    if (error || !data) throw error || new Error('Pesanan tidak ditemukan.');
    order = data;
  } catch (err) {
    tampilkanPesan('Pesanan tidak dapat dimuat.', err.message || 'Coba muat ulang halaman.');
    return;
  }

  // Cek status pesanan
  if (order.order_status === 'cancelled') {
    tampilkanPesan('Pesanan dibatalkan.', 'Stok sudah dikembalikan. Silakan buat pesanan baru dari halaman koleksi.');
    return;
  }
  if (order.payment_status === 'confirmed') {
    tampilkanPesan('Pembayaran sudah diterima.', 'Terima kasih. Pesanan Anda sedang diproses oleh koperasi.');
    const link = document.querySelector('.payment-actions a.text-link');
    if (link) link.textContent = 'Pantau pengiriman →';
    return;
  }
  if (order.payment_status === 'submitted') {
    tampilkanPesan('Bukti pembayaran sedang diperiksa.', 'Admin koperasi sedang memverifikasi pembayaran Anda. Mohon tunggu.');
    renderTombolWA(order);
    return;
  }
  if (order.order_status === 'awaiting_approval') {
    tampilkanPesan('Menunggu persetujuan penjual.', 'Pesanan sudah diajukan. Instruksi pembayaran akan tersedia setelah semua penjual menyetujui.');
    return;
  }

  // Tampilkan halaman pembayaran
  const titleEl = $('payment-title');
  const descEl = $('payment-description');
  const refEl = $('payment-reference');
  if (titleEl) titleEl.textContent = 'Selesaikan pembayaran Anda.';
  if (descEl) descEl.textContent = 'Pilih metode pembayaran di bawah, transfer sesuai nominal, lalu klik konfirmasi.';
  if (refEl) refEl.textContent = 'Pesanan #' + orderId.slice(0, 8).toUpperCase();

  const totalRow = $('payment-total-row');
  const totalEl = $('payment-total');
  if (totalRow && totalEl) { totalEl.textContent = rupiah(order.total); totalRow.hidden = false; }

  // Ambil konfigurasi pembayaran dari database (diatur oleh Admin)
  let paymentSettings = [];
  try {
    paymentSettings = await Backend.ambilPengaturanPembayaran();
  } catch (_) {
    paymentSettings = [];
  }

  // Render tabs metode pembayaran
  renderTabsPembayaran(order, paymentSettings);
});

function tampilkanPesan(judul, deskripsi) {
  const titleEl = $('payment-title');
  const descEl = $('payment-description');
  if (titleEl) titleEl.textContent = judul;
  if (descEl) { descEl.textContent = deskripsi; descEl.removeAttribute('role'); }
}

function renderTabsPembayaran(order, settings) {
  const actionsEl = $('payment-actions') || document.querySelector('.payment-actions');
  if (!actionsEl) return;

  const qrisConfig = settings.find(s => s.category === 'qris' && s.is_active !== false);
  const bankAccounts = settings.filter(s => s.category === 'bank' && s.is_active !== false);
  const ewalletAccounts = settings.filter(s => s.category === 'ewallet' && s.is_active !== false);

  const defaultMethod = (order.payment_method || 'QRIS').toLowerCase();
  const tabs = [
    { id: 'tab-qris', label: 'QRIS', aktif: defaultMethod === 'qris' },
    { id: 'tab-bank', label: 'Transfer Bank', aktif: defaultMethod === 'transfer bank' },
    { id: 'tab-ewallet', label: 'Dompet Digital', aktif: defaultMethod === 'dompet digital' }
  ];

  const wrapper = document.createElement('div');
  wrapper.className = 'payment-manual-wrapper';

  const tabBar = document.createElement('div');
  tabBar.className = 'payment-tabs';
  tabBar.setAttribute('role', 'tablist');

  const panels = [];

  tabs.forEach((tab, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'payment-tab-btn' + (tab.aktif ? ' active' : '');
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', String(tab.aktif));
    btn.setAttribute('aria-controls', 'panel-' + tab.id);
    btn.id = tab.id;
    btn.textContent = tab.label;
    tabBar.append(btn);

    const panel = document.createElement('div');
    panel.id = 'panel-' + tab.id;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    panel.hidden = !tab.aktif;

    if (i === 0) panel.append(renderQRIS(order, qrisConfig));
    if (i === 1) panel.append(renderTransferBank(order, bankAccounts));
    if (i === 2) panel.append(renderDompetDigital(order, ewalletAccounts));

    panels.push(panel);
    btn.addEventListener('click', () => {
      tabs.forEach((_, j) => {
        tabBar.children[j].classList.toggle('active', j === i);
        tabBar.children[j].setAttribute('aria-selected', String(j === i));
        panels[j].hidden = j !== i;
      });
    });
  });

  wrapper.append(tabBar, ...panels);

  // Tombol aksi pembeli
  const divAksi = document.createElement('div');
  divAksi.className = 'payment-confirm-actions';

  const btnSudahBayar = document.createElement('button');
  btnSudahBayar.type = 'button';
  btnSudahBayar.className = 'primary';
  btnSudahBayar.textContent = 'Saya Sudah Membayar';
  btnSudahBayar.addEventListener('click', async () => {
    btnSudahBayar.disabled = true;
    btnSudahBayar.textContent = 'Mengirim konfirmasi…';
    try {
      await Backend.laporPembayaran(order.id);
      tampilkanPesan('Konfirmasi dikirim.', 'Admin koperasi akan memverifikasi pembayaran Anda. Mohon tunggu.');
      wrapper.remove();
      divAksi.remove();
      renderTombolWA(order);
    } catch (err) {
      btnSudahBayar.disabled = false;
      btnSudahBayar.textContent = 'Saya Sudah Membayar';
      const errEl = $('payment-error');
      if (errEl) errEl.textContent = err.message || 'Konfirmasi belum terkirim. Coba lagi.';
    }
  });

  const btnWA = renderTombolWA(order, true);
  divAksi.append(btnSudahBayar, btnWA);

  const existingLink = actionsEl.querySelector('a.text-link');
  actionsEl.insertBefore(wrapper, existingLink || null);
  actionsEl.insertBefore(divAksi, existingLink || null);
}

function renderQRIS(order, config) {
  const wrap = document.createElement('div');
  wrap.className = 'payment-qris';

  const qrisImgBox = document.createElement('div');
  qrisImgBox.className = 'qris-code-box';

  const merchantName = (config && config.account_name) || 'Koperasi Rantai Mawar Sambas';
  const instructions = (config && config.instructions) || 'Scan kode QRIS menggunakan GoPay, DANA, ShopeePay, OVO, atau m-Banking pilihan Anda.';

  if (config && config.image_url) {
    qrisImgBox.innerHTML = `
      <img src="${teksHTML(config.image_url)}" alt="QRIS ${teksHTML(merchantName)}" style="max-width: 240px; width: 100%; height: auto; display: block; margin: 0 auto; border-radius: 8px;">
    `;
  } else {
    // Placeholder jika admin belum upload file QR
    qrisImgBox.innerHTML = `
      <svg viewBox="0 0 200 200" width="200" height="200" xmlns="http://www.w3.org/2000/svg" aria-label="Kode QRIS ${teksHTML(merchantName)}">
        <rect width="200" height="200" fill="#fff"/>
        <rect x="10" y="10" width="60" height="60" fill="none" stroke="#222" stroke-width="4"/>
        <rect x="20" y="20" width="40" height="40" fill="#222"/>
        <rect x="130" y="10" width="60" height="60" fill="none" stroke="#222" stroke-width="4"/>
        <rect x="140" y="20" width="40" height="40" fill="#222"/>
        <rect x="10" y="130" width="60" height="60" fill="none" stroke="#222" stroke-width="4"/>
        <rect x="20" y="140" width="40" height="40" fill="#222"/>
        <text x="100" y="108" text-anchor="middle" font-size="9" font-family="monospace" fill="#444">SCAN UNTUK BAYAR</text>
        <text x="100" y="122" text-anchor="middle" font-size="8" font-family="monospace" fill="#777">Koperasi Rantai Mawar</text>
      </svg>
    `;
  }

  const info = document.createElement('div');
  info.className = 'qris-info';
  info.innerHTML = `
    <p><strong>${teksHTML(merchantName)}</strong></p>
    <p class="note">${teksHTML(instructions)}</p>
    <p style="margin-top: 14px;"><strong>Total yang harus dibayar:</strong><br><span class="payment-amount">${rupiah(order.total)}</span></p>
    <p class="note">Pastikan nominal transfer sesuai persis agar pesanan Anda dapat diverifikasi.</p>
  `;

  wrap.append(qrisImgBox, info);

  if (config && config.image_url) {
    const btnUnduh = document.createElement('a');
    btnUnduh.className = 'outline';
    btnUnduh.textContent = 'Unduh QRIS';
    btnUnduh.href = config.image_url;
    btnUnduh.download = 'QRIS-Koperasi-Rantai-Mawar.png';
    btnUnduh.target = '_blank';
    wrap.append(btnUnduh);
  }

  return wrap;
}

function renderTransferBank(order, bankAccounts) {
  const wrap = document.createElement('div');
  wrap.className = 'payment-bank';

  if (!bankAccounts || !bankAccounts.length) {
    const notice = document.createElement('p');
    notice.className = 'note';
    notice.textContent = 'Rekening transfer bank belum diatur oleh admin koperasi. Silakan gunakan metode QRIS atau hubungi admin via WhatsApp.';
    wrap.append(notice);
    return wrap;
  }

  const intro = document.createElement('p');
  intro.className = 'note';
  intro.textContent = 'Transfer ke salah satu rekening bank di bawah ini yang telah diverifikasi koperasi:';
  wrap.append(intro);

  bankAccounts.forEach(akun => {
    const card = document.createElement('div');
    card.className = 'bank-card';
    card.innerHTML = `
      <strong>${teksHTML(akun.provider)}</strong>
      <p class="note">a.n. ${teksHTML(akun.account_name || 'Koperasi Rantai Mawar')}</p>
      <div class="rekening-row">
        <code class="rekening-number">${teksHTML(akun.account_number)}</code>
        <button type="button" class="outline btn-salin" data-copy="${teksHTML(akun.account_number)}">Salin Rekening</button>
      </div>
    `;
    card.querySelector('.btn-salin').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      try {
        await navigator.clipboard.writeText(akun.account_number);
        btn.textContent = 'Tersalin!';
        setTimeout(() => btn.textContent = 'Salin Rekening', 2000);
      } catch (_) { btn.textContent = 'Gagal'; }
    });
    wrap.append(card);
  });

  const jumlah = document.createElement('div');
  jumlah.className = 'bank-total-row';
  jumlah.innerHTML = `<span>Total transfer:</span> <strong>${rupiah(order.total)}</strong>`;
  wrap.append(jumlah);

  return wrap;
}

function renderDompetDigital(order, ewalletAccounts) {
  const wrap = document.createElement('div');
  wrap.className = 'payment-ewallet';

  if (!ewalletAccounts || !ewalletAccounts.length) {
    const notice = document.createElement('p');
    notice.className = 'note';
    notice.textContent = 'Nomor dompet digital belum diatur oleh admin koperasi. Silakan gunakan QRIS atau hubungi admin via WhatsApp.';
    wrap.append(notice);
    return wrap;
  }

  const intro = document.createElement('p');
  intro.className = 'note';
  intro.textContent = 'Kirim ke nomor dompet digital resmi koperasi di bawah ini:';
  wrap.append(intro);

  ewalletAccounts.forEach(akun => {
    const card = document.createElement('div');
    card.className = 'bank-card';
    card.innerHTML = `
      <strong>${teksHTML(akun.provider)}</strong>
      <p class="note">a.n. ${teksHTML(akun.account_name || 'Koperasi Rantai Mawar')}</p>
      <div class="rekening-row">
        <code class="rekening-number">${teksHTML(akun.account_number)}</code>
        <button type="button" class="outline btn-salin" data-copy="${teksHTML(akun.account_number)}">Salin Nomor</button>
      </div>
    `;
    card.querySelector('.btn-salin').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      try {
        await navigator.clipboard.writeText(akun.account_number);
        btn.textContent = 'Tersalin!';
        setTimeout(() => btn.textContent = 'Salin Nomor', 2000);
      } catch (_) { btn.textContent = 'Gagal'; }
    });
    wrap.append(card);
  });

  const jumlah = document.createElement('div');
  jumlah.className = 'bank-total-row';
  jumlah.innerHTML = `<span>Total transfer:</span> <strong>${rupiah(order.total)}</strong>`;
  wrap.append(jumlah);

  return wrap;
}

function renderTombolWA(order, returnEl = false) {
  const orderId = order.id;
  const nomorPesanan = orderId.slice(0, 8).toUpperCase();
  const totalText = rupiah(order.total);
  const pesan = encodeURIComponent(
    `Halo Admin Koperasi Rantai Mawar,\n\nSaya ingin mengonfirmasi pembayaran pesanan:\n` +
    `Nomor pesanan: #${nomorPesanan}\n` +
    `Nama: ${order.buyer_name || 'Pembeli'}\n` +
    `Total: ${totalText}\n` +
    `Metode: ${order.payment_method}\n\n` +
    `Mohon dicek dan diverifikasi. Terima kasih.`
  );
  const waHref = `https://wa.me/${WHATSAPP_ADMIN}?text=${pesan}`;

  const btn = document.createElement('a');
  btn.className = 'outline';
  btn.href = waHref;
  btn.target = '_blank';
  btn.rel = 'noopener noreferrer';
  btn.textContent = 'Kirim bukti via WhatsApp';

  if (returnEl) return btn;

  const actionsEl = $('payment-actions') || document.querySelector('.payment-actions');
  if (actionsEl) {
    const existingLink = actionsEl.querySelector('a.text-link');
    actionsEl.insertBefore(btn, existingLink || null);
  }
  return btn;
}
