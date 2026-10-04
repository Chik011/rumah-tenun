document.addEventListener('DOMContentLoaded', async () => {
  const orderId = new URLSearchParams(location.search).get('order');
  let busy = false;
  let timer;
  let terminal = false;
  const title = $('payment-title');
  const description = $('payment-description');
  const refresh = $('payment-refresh');
  const pay = $('payment-pay');
  if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
    title.textContent = 'Pesanan tidak ditemukan.';
    description.textContent = 'Buka pesanan Anda dari dashboard akun.';
    return;
  }
  let user;
  try { user = await Backend.penggunaAktif(); } catch (_) {
    title.textContent = 'Akun belum dapat diperiksa.';
    description.textContent = 'Periksa koneksi Anda, lalu muat ulang halaman ini.';
    return;
  }
  if (!user || user.peran === 'Guest') {
    title.textContent = 'Masuk untuk melanjutkan.';
    description.textContent = 'Gunakan akun pembeli yang membuat pesanan ini.';
    const login = $('payment-login');
    login.href = 'login.html?next=' + encodeURIComponent('pembayaran.html?order=' + orderId);
    login.hidden = false;
    return;
  }
  $('payment-reference').textContent = 'Pesanan #' + orderId.slice(0, 8).toUpperCase();
  refresh.hidden = false;
  async function check() {
    if (busy) return;
    busy = true;
    refresh.disabled = true;
    $('payment-error').textContent = '';
    pay.hidden = true;
    try {
      let result = await Backend.pembayaranXendit('status', orderId);
      if (result.status === 'NOT_CREATED') result = await Backend.pembayaranXendit('create', orderId);
      $('payment-test').hidden = result.mode !== 'test';
      $('payment-symbol').textContent = result.status === 'COMPLETED' ? '✓' : result.status === 'EXPIRED' || result.status === 'CANCELED' ? '×' : '↗';
      terminal = ['COMPLETED', 'EXPIRED', 'CANCELED'].includes(result.status);
      if (result.status === 'COMPLETED') {
        title.textContent = 'Pembayaran diterima.';
        description.textContent = result.mode === 'test' ? 'Pembayaran uji coba berhasil. Tidak ada uang nyata yang diproses.' : 'Terima kasih. Pesanan Anda siap diperiksa oleh koperasi.';
        $('payment-expiry').textContent = '';
      } else if (terminal) {
        title.textContent = 'Pembayaran telah berakhir.';
        description.textContent = 'Pesanan dibatalkan dan stok dikembalikan. Pilih kembali kain Anda untuk membuat pesanan baru.';
        $('payment-expiry').textContent = '';
      } else if (result.status === 'CREATING') {
        title.textContent = 'Pembayaran sedang disiapkan.';
        description.textContent = 'Periksa lagi sebentar. Jika belum berubah, hubungi pengelola dengan nomor pesanan ini; jangan membuat pesanan ganda.';
      } else {
        title.textContent = 'Helai pilihan Anda menanti.';
        description.textContent = 'Pilih QRIS, virtual account, atau dompet digital yang tersedia di halaman pembayaran Xendit.';
        if (!validXenditUrl(result.paymentUrl)) throw new Error('Tautan pembayaran tidak valid. Hubungi pengelola.');
        pay.href = result.paymentUrl;
        pay.hidden = false;
        if (result.expiresAt) $('payment-expiry').textContent = 'Batas pembayaran: ' + new Date(result.expiresAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
      }
      const { data: order, error } = await supabaseClient.from('orders').select('total').eq('id', orderId).single();
      if (!error && order) {
        $('payment-total').textContent = rupiah(order.total);
        $('payment-total-row').hidden = false;
      }
      refresh.hidden = terminal;
    } catch (error) {
      title.textContent = 'Mari periksa pembayaran Anda.';
      description.textContent = 'Pesanan tetap tersimpan. Coba periksa kembali dari halaman ini.';
      $('payment-error').textContent = error.message || 'Status belum dapat dimuat.';
    } finally {
      busy = false;
      refresh.disabled = false;
    }
  }
  refresh.addEventListener('click', check);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !terminal) check(); });
  await check();
  let checks = 0;
  timer = setInterval(() => {
    if (terminal || ++checks > 30) return clearInterval(timer);
    if (!document.hidden) check();
  }, 10000);
  window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
});

function validXenditUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && ['xen.to', 'dev.xen.to', 'checkout.xendit.co', 'checkout-staging.xendit.co'].includes(url.hostname);
  } catch (_) { return false; }
}
