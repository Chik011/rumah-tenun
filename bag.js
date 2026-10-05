const BAG_ORDER_LABELS = { awaiting_payment:'Menunggu pembayaran', checking:'Pesanan diperiksa', packaging:'Sedang dikemas', shipping:'Dalam pengiriman', delivered:'Barang tiba', completed:'Pesanan selesai', cancelled:'Dibatalkan' };
const BAG_PAYMENT_LABELS = { waiting:'Belum dibayar', submitted:'Menunggu verifikasi', confirmed:'Pembayaran diterima', rejected:'Pembayaran ditolak', expired:'Pembayaran berakhir' };

document.addEventListener('DOMContentLoaded', () => {
  const tabs = [$('bag-cart-tab'), $('bag-shipping-tab')];
  const panels = [$('bag-cart-panel'), $('bag-shipping-panel')];
  const message = $('shipment-message');
  const host = $('shipment-orders');
  const refresh = $('shipment-refresh');
  const params = new URLSearchParams(location.search);
  const requestedOrder = params.get('order');
  let shipping = false;
  let busy = false;
  let highlighted = false;
  async function load() {
    if (busy) return;
    busy = true;
    refresh.disabled = true;
    try {
      const user = await Backend.penggunaAktif();
      if (!user || user.peran === 'Guest') {
        host.replaceChildren();
        message.replaceChildren(document.createTextNode('Masuk untuk melihat barang pesanan dan status pengiriman Anda. '));
        const login = elemen('a','text-link','Masuk ke akun →'); login.href = 'login.html'; message.append(login);
        message.hidden = false;
        return;
      }
      const orders = await Backend.pengirimanSaya();
      const cards = orders.map(order => {
        const card = elemen('article','shipment-card');
        card.id = 'order-' + order.id;
        if (order.id === requestedOrder) card.classList.add('shipment-selected');
        const heading = elemen('div','shipment-card-heading');
        heading.append(elemen('strong','','Pesanan #' + order.id.slice(0,8).toUpperCase()), elemen('span','workflow-status',BAG_ORDER_LABELS[order.order_status] || 'Status sedang diperbarui'));
        card.append(heading, elemen('p','note',new Date(order.created_at).toLocaleDateString('id-ID',{dateStyle:'medium'})));
        for (const item of order.order_items || []) {
          const row = elemen('div','shipment-item');
          const image = elemen('div','shipment-thumb');
          if (item.image_url) image.style.backgroundImage = `url("${item.image_url}")`;
          image.setAttribute('role','img'); image.setAttribute('aria-label',item.item_name);
          const info = elemen('div');
          const name = elemen('a','text-link',item.item_name);
          if (Number.isSafeInteger(Number(item.product_id)) && Number(item.product_id)>0) name.href = 'produk.html?id=' + encodeURIComponent(item.product_id);
          info.append(name,elemen('p','note',item.quantity + ' kain × ' + rupiah(item.unit_price)));
          row.append(image,info,elemen('strong','',rupiah(item.quantity * item.unit_price)));
          card.append(row);
        }
        card.append(elemen('p','shipment-payment',BAG_PAYMENT_LABELS[order.payment_status] || 'Pembayaran sedang diperiksa'));
        if (order.payment_mode === 'test') card.append(elemen('p','payment-test','Pesanan uji coba · Tanpa uang nyata'));
        if (order.order_status !== 'cancelled') {
          const steps = ['checking','packaging','shipping','delivered','completed'];
          const progress = elemen('ol','shipment-progress');
          progress.setAttribute('aria-label','Perjalanan pesanan');
          const active = steps.indexOf(order.order_status);
          steps.forEach((step,index) => {
            const li = elemen('li',index <= active ? 'reached' : '',BAG_ORDER_LABELS[step]);
            if (index === active) li.setAttribute('aria-current','step');
            progress.append(li);
          });
          card.append(progress);
        }
        const address = elemen('details','shipment-address');
        address.append(elemen('summary','','Alamat pengiriman'),elemen('p','',order.buyer_name),elemen('p','',order.shipping_address));
        card.append(address);
        const actions = elemen('div','shipment-actions');
        if (order.order_status === 'awaiting_payment' && order.payment_provider === 'xendit') {
          const pay = elemen('a','primary','Lanjutkan pembayaran ');
          pay.href = 'pembayaran.html?order=' + encodeURIComponent(order.id); actions.append(pay);
        }
        if (order.order_status === 'delivered' && order.payment_status === 'confirmed') {
          const received = elemen('button','primary','Barang sudah diterima'); received.type = 'button';
          received.addEventListener('click',async () => {
            received.disabled = true;
            try { await Backend.ubahStatusPesanan(order.id,'confirmed','completed'); await load(); }
            catch (_) { message.textContent='Konfirmasi belum tersimpan. Coba lagi.'; message.hidden=false; received.disabled=false; }
          });
          actions.append(received);
        }
        card.append(elemen('strong','shipment-total','Total produk ' + rupiah(order.total)),actions);
        return card;
      });
      host.replaceChildren(...cards);
      message.textContent = orders.length ? '' : 'Belum ada pesanan. Barang dan status pengiriman akan muncul di sini setelah checkout.';
      message.hidden = orders.length > 0;
      const selected = requestedOrder && $('order-' + requestedOrder);
      if (selected && !highlighted) { selected.scrollIntoView({behavior:'smooth',block:'start'}); highlighted=true; }
    } catch (_) {
      message.textContent = 'Status pesanan belum dapat dimuat. Periksa koneksi, lalu klik Perbarui status.'; message.hidden=false;
    } finally { busy=false; refresh.disabled=false; }
  }
  function select(index) {
    shipping = index===1;
    tabs.forEach((tab,i) => { tab.setAttribute('aria-selected',String(i===index)); tab.tabIndex=i===index?0:-1; panels[i].hidden=i!==index; });
    if (shipping) load();
  }
  tabs.forEach((tab,index) => {
    tab.addEventListener('click',()=>select(index));
    tab.addEventListener('keydown',event => {
      if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) { event.preventDefault(); const next=event.key==='Home'?0:event.key==='End'?1:1-index; select(next); tabs[next].focus(); }
    });
  });
  refresh.addEventListener('click',load);
  select(params.get('tab')==='pengiriman'?1:0);
  const timer = setInterval(()=>{ if (shipping && !document.hidden) load(); },30000);
  document.addEventListener('visibilitychange',()=>{ if (shipping && !document.hidden) load(); });
  window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
});
