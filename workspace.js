const WORKFLOW_LABELS = {awaiting_approval:'Menunggu persetujuan',awaiting_payment:'Menunggu pembayaran',checking:'Sudah dibayar',packaging:'Sedang dikemas',shipping:'Dalam pengiriman',delivered:'Barang tiba',completed:'Selesai',cancelled:'Dibatalkan'};
async function initMarketplaceWorkspace(user) {
  const admin=user.peran==='Admin';
  document.title=(admin?'Pantau Koperasi':'Etalase Produk')+' — Benang-Mawar';
  document.body.classList.add('seller-workspace','market-workspace');
  $('profile-panel').hidden=true;
  $('account-title').textContent=admin?'Pantau koperasi':'Etalase Produk';
  $('account-eyebrow').textContent=admin?'ADMIN KOPERASI':'RUANG PENJUAL';
  $('role-panel-title').textContent=admin?'Penjual, pembeli, dan aktivitas koperasi':'Kelola toko Anda';
  $('role-description').textContent=admin?'Periksa katalog, pesanan, dan aktivitas. Pengelolaan barang dilakukan oleh penjual.':'Kelola produk, setujui pesanan, dan kirimkan nomor resi kepada pembeli.';
  const host=$('role-extra-content');
  const params=new URLSearchParams(location.search);
  const editor=location.pathname.endsWith('/produk-form.html');
  if(editor) {
    if(admin) { location.replace('akun.html');return; }
    await initProductEditor(host,user,params.get('id'));return;
  }
  const view=params.get('view') || (admin?'sellers':'products');
  const tabs=admin?[['sellers','Penjual'],['buyers','Pembeli'],['products','Katalog produk'],['orders','Pesanan'],['articles','Kelola Berita'],['payments','Pengaturan Pembayaran'],['activity','Aktivitas']]:[['products','Produk Anda'],['orders','Pesanan masuk'],['articles','Kabar & Artikel']];
  const nav=elemen('div','workspace-tabs');
  for(const [key,label] of tabs) {const a=elemen('a',view===key?'active':'',label);a.href='akun.html?view='+key;if(view===key)a.setAttribute('aria-current','page');nav.append(a);}
  const content=elemen('div','workspace-content');const message=elemen('p','workspace-message');message.setAttribute('role','status');
  host.replaceChildren(nav,message,content);
  const report=error=>{message.textContent=error.message || 'Data belum dapat dimuat. Coba kembali.';};
  let busy=false;
  async function load() {
    if(busy)return;busy=true;
    try {
      message.textContent='';content.replaceChildren();
      if(view==='orders') await ordersView();
      else if(view==='articles') await articlesView();
      else if(admin && view==='payments') await paymentsView();
      else if(admin && ['sellers','buyers','activity'].includes(view)) await monitorView();
      else await productsView();
    }catch(error){report(error);}finally{busy=false;}
  }
  function heading(title,description,action) {const row=elemen('div','workspace-heading');const text=elemen('div');text.append(elemen('h2','',title),elemen('p','note',description));row.append(text);if(action)row.append(action);content.append(row);}
  async function productsView() {
    const add=admin?null:elemen('a','primary','+ Tambah produk');if(add)add.href='produk-form.html';
    heading(admin?'Katalog penjual':'Produk Anda',admin?'Periksa kelengkapan dan atur penayangan produk.':'Daftar barang, harga, dan stok toko Anda.',add);
    const data=(await Backend.ambilProduk()).filter(p=>admin || p.sellerId===user.id);
    const search=elemen('input','workspace-search');search.type='search';search.placeholder='Cari produk atau penjual';search.setAttribute('aria-label','Cari produk atau penjual');
    const list=elemen('div','inventory-grid');content.append(search,list);
    const draw=()=>{list.replaceChildren();for(const item of data.filter(p=>(p.nama+' '+p.sellerName).toLowerCase().includes(search.value.toLowerCase())))list.append(productCard(item));if(!list.children.length)list.append(elemen('p','notice','Belum ada produk yang sesuai.'));};
    search.addEventListener('input',draw);draw();
    if(!admin) {
      const trash=elemen('details','workspace-trash');trash.append(elemen('summary','','Produk dihapus'));
      for(const item of (await Backend.produkPenjualDihapus()).filter(p=>p.sellerId===user.id)) {
        const row=elemen('div','trash-row');const button=elemen('button','outline','Pulihkan');button.type='button';
        button.addEventListener('click',()=>act(button,()=>Backend.hapusProdukPenjual(item.id,true)));row.append(elemen('span','',item.nama),button);trash.append(row);
      }content.append(trash);
    }
  }
  async function act(button,operation) {button.disabled=true;try{await operation();await load();window.dispatchEvent(new Event('orders-updated'));}catch(error){report(error);button.disabled=false;}}
  function productCard(item,review=true) {
    const card=elemen('article','inventory-card');const image=elemen('img','inventory-photo');image.src=item.imageUrl || 'assets/tenun.jpg';image.alt=item.nama;
    const info=elemen('div','inventory-info');const a=elemen('a','inventory-title',item.nama);a.href='produk.html?id='+item.id;
    const badge=elemen('span','product-status status-'+item.status,({approved:'Tayang',pending:'Draf · menunggu pemeriksaan',needs_revision:'Perlu perbaikan'})[item.status]);
    info.append(badge,a,elemen('p','note',item.sellerName),elemen('strong','inventory-price',rupiah(item.harga)),elemen('p','note',[item.motif,item.bahan,item.ukuran].filter(Boolean).join(' · ')));
    if(item.catatanReview)info.append(elemen('p','notice',item.catatanReview));
    const actions=elemen('div','inventory-actions');
    if(admin && review) {
      const b=elemen('button',item.status==='approved'?'button-draft':'button-publish',item.status==='approved'?'Simpan sebagai draf':'Setujui & tayangkan');b.type='button';b.addEventListener('click',()=>act(b,()=>Backend.ubahStatusProduk(item.id,item.status==='approved'?'pending':'approved','')));actions.append(b);
      info.append(elemen('p','note','Stok: '+item.stok+' kain'));
    }else if(!admin) {
      const edit=elemen('a','button-edit','Edit produk');edit.href='produk-form.html?id='+item.id;actions.append(edit);
      if(item.status==='approved') {const b=elemen('button','button-draft','Jadikan draf');b.type='button';b.addEventListener('click',()=>act(b,()=>Backend.drafProduk(item.id)));actions.append(b);}
      const stock=elemen('div','inventory-stock');
      for(const [operation,label] of [['minus','−'],['plus','+'],['empty','Stok habis']]) {
        const b=elemen('button',operation==='empty'?'stock-empty':'stock-step',label);b.type='button';b.disabled=operation!=='plus' && item.stok===0;b.setAttribute('aria-label',({minus:'Kurangi stok ',plus:'Tambah stok ',empty:'Habiskan stok '})[operation]+item.nama);b.addEventListener('click',()=>act(b,()=>Backend.stokProdukPenjual(item.id,operation)));
        if(operation==='plus')stock.append(elemen('span','',item.stok+' kain'));stock.append(b);
      }
      const remove=elemen('button','product-remove','Hapus produk');remove.type='button';remove.addEventListener('click',()=>{if(confirm('Hapus '+item.nama+' dari etalase? Produk dapat dipulihkan.'))act(remove,()=>Backend.hapusProdukPenjual(item.id));});
      info.append(stock);actions.append(remove);
    }
    info.append(actions);card.append(image,info);return card;
  }
  async function ordersView() {
    const refresh=elemen('button','outline','Perbarui pesanan');refresh.type='button';refresh.addEventListener('click',load);
    heading(admin?'Seluruh pesanan':'Pesanan masuk',admin?'Pantau pembelian dan pemenuhan barang oleh penjual.':'Setujui pesanan, tunggu pembayaran, lalu proses pengiriman.',refresh);
    const orders=await Backend.pesananPenjual();const filter=elemen('select','workspace-filter');filter.setAttribute('aria-label','Filter status pesanan');
    for(const [value,label] of [['all','Semua status'],...Object.entries(WORKFLOW_LABELS)]) {const o=elemen('option','',label);o.value=value;filter.append(o);}
    const list=elemen('div','order-card-list');content.append(filter,list);
    const draw=()=>{list.replaceChildren();for(const order of orders.filter(o=>filter.value==='all'||o.order_status===filter.value))list.append(orderCard(order));if(!list.children.length)list.append(elemen('p','notice','Belum ada pesanan pada status ini.'));};filter.addEventListener('change',draw);draw();
    const selected=params.get('order');
    if(selected && !host.dataset.orderFocused){const card=$('order-'+selected);if(card){card.scrollIntoView({behavior:'smooth',block:'start'});host.dataset.orderFocused='true';}}
  }
  function orderCard(order) {
    const card=elemen('article','market-order');card.id='order-'+order.id;
    const top=elemen('div','order-card-heading');top.append(elemen('strong','','Pesanan #'+order.id.slice(0,8).toUpperCase()),elemen('span','workflow-status',WORKFLOW_LABELS[order.order_status] || order.order_status));card.append(top,elemen('p','note',order.buyer_name+' · '+new Date(order.created_at).toLocaleDateString('id-ID')));
    for(const item of order.order_items || []) {const row=elemen('div','order-item');const image=elemen('img');image.src=item.image_url || 'assets/tenun.jpg';image.alt=item.item_name;const a=elemen('a','',item.item_name);a.href='produk.html?id='+item.product_id;const detail=elemen('div');detail.append(a,elemen('p','note',item.quantity+' kain × '+rupiah(item.unit_price)));row.append(image,detail);card.append(row);}
    const paymentLabel = {
      waiting: 'Belum dibayar',
      submitted: 'Bukti pembayaran dikirim (Perlu verifikasi)',
      confirmed: 'Pembayaran diterima',
      rejected: 'Pembayaran ditolak'
    }[order.payment_status] || (order.payment_status === 'confirmed' ? 'Pembayaran diterima' : 'Belum dibayar');
    card.append(elemen('strong','order-total',rupiah(order.total)),elemen('p','note',paymentLabel));
    if(admin) {
      if (order.order_status === 'awaiting_payment' || ['waiting', 'submitted'].includes(order.payment_status)) {
        const adminActions = elemen('div', 'shipment-actions');
        const b = elemen('button', 'primary', 'Verifikasi Pembayaran Lunas');
        b.type = 'button';
        b.addEventListener('click', () => {
          if (confirm('Verifikasi pembayaran pesanan #' + order.id.slice(0,8).toUpperCase() + ' (' + rupiah(order.total) + ') sebagai lunas?')) {
            act(b, () => Backend.ubahStatusPesanan(order.id, 'confirmed', 'checking'));
          }
        });
        adminActions.append(b);
        card.append(adminActions);
      }
      return card;
    }
    const address=elemen('details','shipment-address');address.append(elemen('summary','','Penerima & alamat'),elemen('p','',order.buyer_name+' · '+order.phone),elemen('p','',order.shipping_address));card.append(address);
    if(order.overall_status==='awaiting_approval' && order.order_status==='awaiting_payment')card.append(elemen('p','notice','Anda sudah menyetujui. Menunggu penjual lain.'));
    const actions=elemen('div','shipment-actions');
    if(order.order_status==='awaiting_approval')for(const [approve,label] of [[true,'Setujui pesanan'],[false,'Tolak pesanan']]) {const b=elemen('button',approve?'primary':'outline',label);b.type='button';b.addEventListener('click',()=>{if(approve||confirm('Tolak seluruh pesanan dan kembalikan stok?'))act(b,()=>Backend.tinjauPesanan(order.id,approve));});actions.append(b);}
    if(order.order_status==='awaiting_payment' && ['waiting', 'submitted'].includes(order.payment_status)) {
      const b = elemen('button', 'outline', 'Verifikasi Pembayaran Lunas');
      b.type = 'button';
      b.addEventListener('click', () => {
        if (confirm('Verifikasi pembayaran pesanan #' + order.id.slice(0,8).toUpperCase() + ' sudah diterima?')) {
          act(b, () => Backend.ubahStatusPesanan(order.id, 'confirmed', 'checking'));
        }
      });
      actions.append(b);
    }
    const transitions={checking:['packaging','Proses & kemas'],shipping:['delivered','Tandai barang tiba']};const next=transitions[order.order_status];
    if(next && order.payment_status==='confirmed') {const b=elemen('button','primary',next[1]);b.type='button';b.addEventListener('click',()=>act(b,()=>Backend.prosesPesananPenjual(order.id,next[0])));actions.append(b);}
    card.append(actions);
    if(order.payment_status==='confirmed' && ['packaging','shipping','delivered'].includes(order.order_status)) {
      const form=elemen('form','tracking-editor');form.append(elemen('h3','','Resi pengiriman'),elemen('p','note','Isi jasa pengiriman, nomor resi, dan tautan halaman pelacakannya.'));
      const inputs={};for(const [key,label,value,placeholder] of [['courier','Jasa pengiriman',order.courier,'Contoh: JNE'],['number','Nomor resi',order.tracking_number,'Masukkan nomor resi'],['url','Tautan pelacakan',order.tracking_url,'https://...']]) {
        const wrap=elemen('label','tracking-field',label);const input=elemen('input');input.type=key==='url'?'url':'text';input.required=true;input.maxLength=key==='url'?1000:key==='number'?120:80;input.value=value || '';input.placeholder=placeholder;inputs[key]=input;wrap.append(input);form.append(wrap);
      }
      form.addEventListener('input',()=>{form.dataset.dirty='true';});
      const save=elemen('button','primary',order.order_status==='packaging'?'Simpan resi & tandai dikirim':'Simpan resi');save.type='submit';form.append(save);
      form.addEventListener('submit',e=>{e.preventDefault();if(!tautanPelacakan(inputs.url.value)){report(new Error('Gunakan tautan pelacakan HTTPS yang valid.'));return;}act(save,()=>Backend.simpanResi(order.id,inputs.courier.value,inputs.number.value,inputs.url.value,order.order_status==='packaging'));});card.append(form);
    }else if(order.tracking_number)card.append(renderResi([order]));
    return card;
  }
  async function monitorView() {
    const data=await Backend.pantauKoperasi();
    if(view==='activity') {
      heading('Aktivitas terbaru','Catatan aktivitas mulai tersimpan sejak pembaruan fitur pemantauan.');const list=elemen('div','activity-list');
      for(const item of data.activity) {const row=elemen('article','activity-row');row.append(elemen('strong','',item.actor_name+' · '+item.action),elemen('p','note',(item.detail.name || '#'+item.entity_id.slice(0,8))+' · '+new Date(item.created_at).toLocaleString('id-ID')),elemen('p','note',[WORKFLOW_LABELS[item.detail.status] || item.detail.status,item.detail.stock!==undefined?'Stok '+item.detail.stock:null].filter(Boolean).join(' · ')));list.append(row);}if(!list.children.length)list.append(elemen('p','notice','Belum ada aktivitas baru.'));content.append(list);return;
    }
    const sellers=view==='sellers';
    const addSellerBtn = sellers ? elemen('button','primary','+ Tambah akun penjual') : null;
    if (addSellerBtn) {
      addSellerBtn.type = 'button';
      addSellerBtn.id = 'btn-open-add-seller';
      addSellerBtn.addEventListener('click', () => {
        const modal = $('seller-modal');
        if (modal) {
          const form = $('seller-account-form');
          if (form) form.reset();
          const err = $('seller-form-error'); if (err) err.textContent = '';
          const succ = $('seller-form-success'); if (succ) succ.textContent = '';
          const submitBtn = $('seller-submit-btn');
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Simpan Akun Penjual'; }
          modal.showModal();
        }
      });
    }
    heading(sellers?'Penjual terdaftar':'Pembeli terdaftar',sellers?'Pilih penjual untuk melihat barang dan aktivitasnya.':'Pilih pembeli untuk melihat riwayat pesanannya.', addSellerBtn);
    const search=elemen('input','workspace-search');search.type='search';search.placeholder=sellers?'Cari penjual':'Cari pembeli';search.setAttribute('aria-label',search.placeholder);
    const people=elemen('div','people-grid');const details=elemen('section','person-detail');content.append(search,people,details);
    const allProducts=sellers?await Backend.ambilProduk():[];const allOrders=await Backend.semuaPesanan();
    const draw=()=>{people.replaceChildren();for(const person of data.people.filter(p=>p.role===(sellers?'seller':'buyer') && p.name.toLowerCase().includes(search.value.toLowerCase()))) {
      const b=elemen('button','person-card');b.type='button';b.append(elemen('span','person-avatar',person.name.charAt(0)),elemen('strong','',person.name),elemen('span','note',sellers?person.products+' produk':person.orders+' pesanan'),elemen('span','person-open','Lihat rincian'));
      b.addEventListener('click',()=>{details.replaceChildren(elemen('h3','',person.name));if(sellers)for(const product of allProducts.filter(p=>p.sellerId===person.id))details.append(productCard(product,false));for(const order of allOrders.filter(o=>sellers?o.order_items.some(i=>i.seller_id===person.id):o.buyer_id===person.id))details.append(orderCard(order));if(details.children.length===1)details.append(elemen('p','notice','Belum ada data untuk ditampilkan.'));details.scrollIntoView({behavior:'smooth',block:'start'});});people.append(b);
    }if(!people.children.length)people.append(elemen('p','notice','Tidak ada akun yang sesuai.'));};search.addEventListener('input',draw);draw();
  }
  if (admin) {
    const sellerForm = $('seller-account-form');
    const modal = $('seller-modal');
    if (sellerForm && !sellerForm.dataset.initialized) {
      sellerForm.dataset.initialized = 'true';
      if (modal) {
        modal.addEventListener('click', e => {
          if (e.target === modal) modal.close();
        });
      }
      sellerForm.addEventListener('submit', async e => {
        e.preventDefault();
        const err = $('seller-form-error');
        const succ = $('seller-form-success');
        const submitBtn = $('seller-submit-btn');
        if (err) err.textContent = '';
        if (succ) succ.textContent = '';

        const nama = $('seller-name')?.value.trim() || '';
        const email = $('seller-email')?.value.trim().toLowerCase() || '';
        const password = $('seller-password')?.value || '';

        if (nama.length < 2 || nama.length > 80) {
          if (err) err.textContent = 'Nama penjual harus 2–80 karakter.';
          $('seller-name')?.focus();
          return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          if (err) err.textContent = 'Format email tidak valid. Masukkan format email yang benar.';
          $('seller-email')?.focus();
          return;
        }
        if (password.length < 10 || password.length > 100) {
          if (err) err.textContent = 'Kata sandi minimal 10 karakter.';
          $('seller-password')?.focus();
          return;
        }

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Menyimpan ke database...';
        }

        try {
          await Backend.buatAkunPenjual(email, password, nama);
          if (succ) succ.textContent = `✓ Akun penjual "${nama}" (${email}) berhasil ditambahkan ke database online!`;
          sellerForm.reset();
          await load();
          setTimeout(() => {
            if (modal && modal.open) modal.close();
          }, 1400);
        } catch (error) {
          if (err) err.textContent = error.message || 'Gagal membuat akun penjual di database.';
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Simpan Akun Penjual';
          }
        }
      });
    }
  }

  function warnaKategori(cat, idx) {
    const c = (cat || '').toLowerCase();
    if (c.includes('budaya') || c.includes('tokoh')) return 'color-green';
    if (c.includes('kegiatan') || c.includes('pelatihan')) return 'color-terracotta';
    if (c.includes('wawasan')) return 'color-purple';
    const colors = ['color-blue', 'color-green', 'color-blue', 'color-purple', 'color-terracotta'];
    return colors[idx % colors.length];
  }

  function bukaModalPembaca(art) {
    let modal = $('article-reader-modal');
    if (!modal) {
      modal = elemen('dialog');
      modal.id = 'article-reader-modal';
      modal.innerHTML = `
        <button class="close-button" data-close aria-label="Tutup" style="position:absolute;right:16px;top:16px;z-index:10;background:rgba(255,255,255,0.85);">×</button>
        <img id="modal-article-cover" class="reader-cover" src="" alt="" hidden>
        <div class="reader-content">
          <div id="modal-article-category" class="reader-category"></div>
          <h2 id="modal-article-title" class="reader-title"></h2>
          <div id="modal-article-meta" class="reader-meta"></div>
          <div id="modal-article-body" class="reader-body"></div>
          <div style="margin-top:24px;">
            <button type="button" class="outline" data-close>Tutup</button>
          </div>
        </div>
      `;
      modal.addEventListener('click', e => { if (e.target === modal) modal.close(); });
      modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => modal.close()));
      document.body.append(modal);
    }
    const cover = modal.querySelector('#modal-article-cover');
    if (art.image_url) {
      cover.src = art.image_url;
      cover.alt = art.title;
      cover.hidden = false;
    } else {
      cover.hidden = true;
    }
    modal.querySelector('#modal-article-category').textContent = art.category || 'Pustaka Tenun';
    modal.querySelector('#modal-article-title').textContent = art.title;
    const tgl = art.created_at ? new Date(art.created_at).toLocaleDateString('id-ID', { dateStyle: 'long' }) : '';
    modal.querySelector('#modal-article-meta').textContent = (art.author_name || 'Admin Koperasi') + (tgl ? ' · ' + tgl : '');
    modal.querySelector('#modal-article-body').textContent = art.content;
    modal.showModal();
  }

  async function articlesView() {
    if (!admin) {
      heading('Kabar & Artikel Koperasi', 'Artikel wawasan, budaya, dan pengumuman yang dibagikan admin koperasi.');
      const articles = await Backend.ambilArtikel();
      if (!articles.length) {
        content.append(elemen('p', 'editorial-empty', 'Belum ada artikel yang diterbitkan oleh admin koperasi.'));
        return;
      }
      const grid = elemen('div', 'editorial-articles-grid');
      articles.forEach((art, idx) => {
        const card = elemen('article', 'editorial-card ' + warnaKategori(art.category, idx));
        const imgUrl = art.image_url || 'assets/tenun-background.jpg';
        card.innerHTML = `
          <div class="editorial-photo-wrap">
            <img class="editorial-photo" src="${teksHTML(imgUrl)}" alt="${teksHTML(art.title)}" loading="lazy">
          </div>
          <span class="editorial-accent-bar" aria-hidden="true"></span>
          <span class="editorial-category">${teksHTML(art.category || 'Pustaka Tenun')}</span>
          <h3 class="editorial-card-title">${teksHTML(art.title)}</h3>
          <p class="editorial-desc">${teksHTML(art.summary || (art.content || '').slice(0, 110))}</p>
        `;
        card.addEventListener('click', () => bukaModalPembaca(art));
        grid.append(card);
      });
      content.append(grid);
      return;
    }

    // Admin view
    const addBtn = elemen('button', 'primary', '+ Tulis Artikel Baru');
    addBtn.type = 'button';
    heading('Kelola Berita & Artikel', 'Tulis artikel baru untuk dibaca pembeli dan penjual di halaman berita & beranda.', addBtn);

    const articles = await Backend.ambilArtikel();
    const listWrap = elemen('div', 'order-card-list');

    if (!articles.length) {
      listWrap.append(elemen('p', 'editorial-empty', 'Belum ada artikel yang dibuat. Klik tombol "+ Tulis Artikel Baru" di atas untuk menambahkan artikel pertama.'));
    } else {
      articles.forEach(art => {
        const row = elemen('article', 'activity-row');
        row.style.display = 'grid';
        row.style.gridTemplateColumns = '90px minmax(0, 1fr) auto';
        row.style.gap = '16px';
        row.style.alignItems = 'center';

        const thumb = elemen('img');
        thumb.src = art.image_url || 'assets/tenun-background.jpg';
        thumb.alt = art.title;
        thumb.style.width = '90px';
        thumb.style.height = '65px';
        thumb.style.objectFit = 'cover';
        thumb.style.borderRadius = '8px';

        const info = elemen('div');
        const badge = elemen('span', 'admin-badge-category', art.category || 'Pustaka Tenun');
        const title = elemen('h3', '', art.title);
        title.style.margin = '4px 0 3px 0';
        title.style.fontSize = '1.05rem';
        const dateStr = art.created_at ? new Date(art.created_at).toLocaleDateString('id-ID', { dateStyle: 'medium' }) : '';
        const meta = elemen('p', 'note', (art.author_name || 'Admin') + (dateStr ? ' · ' + dateStr : ''));
        meta.style.margin = '0';
        info.append(badge, title, meta);

        const actions = elemen('div', 'inventory-actions');
        actions.style.marginTop = '0';

        const editBtn = elemen('button', 'button-edit', 'Edit');
        editBtn.type = 'button';
        editBtn.addEventListener('click', () => bukaDialogArtikel(art));

        const delBtn = elemen('button', 'product-remove', 'Hapus');
        delBtn.type = 'button';
        delBtn.addEventListener('click', async () => {
          if (confirm(`Yakin ingin menghapus artikel "${art.title}"?`)) {
            act(delBtn, async () => {
              await Backend.hapusArtikel(art.id);
              await load();
            });
          }
        });

        actions.append(editBtn, delBtn);
        row.append(thumb, info, actions);
        listWrap.append(row);
      });
    }
    content.append(listWrap);
    addBtn.addEventListener('click', () => bukaDialogArtikel(null));
  }

  function bukaDialogArtikel(art) {
    let dialog = $('article-editor-dialog');
    if (!dialog) {
      dialog = elemen('dialog', 'modal-dialog');
      dialog.id = 'article-editor-dialog';
      dialog.style.maxWidth = '680px';
      document.body.append(dialog);
    }
    const isEdit = Boolean(art && art.id);
    dialog.innerHTML = `
      <div class="modal-header">
        <div>
          <h2 style="font-size:1.35rem;margin:0 0 4px 0;">${isEdit ? 'Edit Artikel' : 'Tulis Artikel Baru'}</h2>
          <p class="note" style="margin:0;">Lengkapi judul, gambar, dan isi teks artikel.</p>
        </div>
        <button type="button" class="close-button" data-close aria-label="Tutup">×</button>
      </div>
      <form id="article-editor-form" style="display:flex;flex-direction:column;gap:14px;margin-top:16px;">
        <label class="editor-field">
          Judul Artikel *
          <input type="text" name="title" required minlength="3" placeholder="Contoh: Corak Insan: Filosofi Songket Sambas" value="${teksHTML(art?.title || '')}">
        </label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <label class="editor-field">
            Kategori
            <select name="category">
              <option value="Pustaka Tenun" ${art?.category === 'Pustaka Tenun' ? 'selected' : ''}>Pustaka Tenun</option>
              <option value="Kegiatan Koperasi" ${art?.category === 'Kegiatan Koperasi' ? 'selected' : ''}>Kegiatan Koperasi</option>
              <option value="Budaya & Tradisi" ${art?.category === 'Budaya & Tradisi' ? 'selected' : ''}>Budaya & Tradisi</option>
              <option value="Pelatihan & Riset" ${art?.category === 'Pelatihan & Riset' ? 'selected' : ''}>Pelatihan & Riset</option>
              <option value="Tokoh & Penenun" ${art?.category === 'Tokoh & Penenun' ? 'selected' : ''}>Tokoh & Penenun</option>
              <option value="Wawasan" ${art?.category === 'Wawasan' ? 'selected' : ''}>Wawasan</option>
            </select>
          </label>
          <label class="editor-field">
            Kategori Kustom
            <input type="text" name="custom_category" placeholder="Opsional (misal: Kabar Dusun)">
          </label>
        </div>
        <label class="editor-field">
          Gambar Artikel (Upload Foto atau Masukkan Tautan URL)
          <input type="file" name="image_file" accept="image/jpeg,image/png,image/webp">
          <input type="url" name="image_url" placeholder="https://... (opsional jika sudah upload berkas)" value="${teksHTML(art?.image_url || '')}" style="margin-top:6px;">
        </label>
        <div id="art-preview-wrap" style="display:${art?.image_url ? 'block' : 'none'};margin-top:-4px;">
          <img id="art-preview-img" src="${teksHTML(art?.image_url || '')}" alt="Preview" style="max-height:140px;border-radius:8px;object-fit:cover;">
        </div>
        <label class="editor-field">
          Ringkasan Singkat (1-2 kalimat untuk kartu beranda)
          <input type="text" name="summary" maxlength="250" placeholder="Ringkasan singkat artikel..." value="${teksHTML(art?.summary || '')}">
        </label>
        <label class="editor-field">
          Isi Deskripsi / Teks Berita Lengkap *
          <textarea name="content" required rows="7" placeholder="Tuliskan berita atau wawasan lengkap di sini...">${teksHTML(art?.content || '')}</textarea>
        </label>
        <p id="art-form-status" class="note" style="margin:0;"></p>
        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:8px;">
          <button type="button" class="outline" data-close>Batal</button>
          <button type="submit" class="primary" id="art-submit-btn">${isEdit ? 'Simpan Perubahan' : 'Terbitkan Artikel'}</button>
        </div>
      </form>
    `;

    const fileInput = dialog.querySelector('input[name="image_file"]');
    const urlInput = dialog.querySelector('input[name="image_url"]');
    const prevWrap = dialog.querySelector('#art-preview-wrap');
    const prevImg = dialog.querySelector('#art-preview-img');

    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files[0]) {
        const reader = new FileReader();
        reader.onload = e => {
          prevImg.src = e.target.result;
          prevWrap.style.display = 'block';
        };
        reader.readAsDataURL(fileInput.files[0]);
      }
    });
    urlInput.addEventListener('input', () => {
      if (urlInput.value.trim()) {
        prevImg.src = urlInput.value.trim();
        prevWrap.style.display = 'block';
      }
    });

    dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close()));

    const form = dialog.querySelector('#article-editor-form');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = dialog.querySelector('#art-submit-btn');
      const status = dialog.querySelector('#art-form-status');
      btn.disabled = true;
      status.textContent = 'Menyimpan artikel ke database…';

      const customCat = form.custom_category.value.trim();
      const cat = customCat || form.category.value;
      const file = fileInput.files[0] || null;

      try {
        await Backend.simpanArtikel({
          id: art?.id,
          title: form.title.value,
          category: cat,
          summary: form.summary.value,
          content: form.content.value,
          image_url: form.image_url.value
        }, file);
        status.textContent = '✓ Artikel berhasil disimpan!';
        setTimeout(() => {
          dialog.close();
          load();
        }, 800);
      } catch (err) {
        status.textContent = err.message || 'Gagal menyimpan artikel.';
        btn.disabled = false;
      }
    });

    dialog.showModal();
  }

  async function paymentsView() {
    heading('Pengaturan Metode Pembayaran', 'Atur kode QRIS, daftar rekening bank, dan dompet digital yang aktif untuk pembeli.');

    const settings = await Backend.ambilPengaturanPembayaran();
    const qrisConfig = settings.find(s => s.category === 'qris') || {
      provider: 'QRIS',
      account_name: 'Koperasi Rantai Mawar Sambas',
      instructions: 'NMID: ID1020261104889',
      image_url: '',
      is_active: true
    };
    const bankAccounts = settings.filter(s => s.category === 'bank');
    const ewalletAccounts = settings.filter(s => s.category === 'ewallet');

    const container = elemen('div', 'admin-payment-container');

    // 1. KOTAK QRIS
    const qrisSection = elemen('section', 'admin-settings-section');
    qrisSection.innerHTML = `
      <h3>1. Pengaturan QRIS (GoPay &amp; Semua Bank / E-Wallet)</h3>
      <p class="note">Kode QR ini berlaku untuk semua pembeli yang memilih bayar via QRIS.</p>
      <form id="form-qris-setting" class="admin-payment-form">
        <label class="editor-field full">
          <input type="checkbox" id="qris-active" ${qrisConfig.is_active !== false ? 'checked' : ''} style="width:auto;margin-right:8px;">
          Aktifkan Pembayaran QRIS untuk Pembeli
        </label>
        <label class="editor-field full">
          Nama Toko / Merchant pada QRIS
          <input type="text" id="qris-name" required value="${teksHTML(qrisConfig.account_name || 'Koperasi Rantai Mawar Sambas')}">
        </label>
        <label class="editor-field full">
          Unggah Gambar Kode QRIS (Foto QR dari GoPay / Bank Anda)
          <input type="file" id="qris-file" accept="image/jpeg,image/png,image/webp,image/svg+xml">
          <input type="url" id="qris-url" placeholder="Atau tautan URL gambar QRIS" value="${teksHTML(qrisConfig.image_url || '')}" style="margin-top:6px;">
        </label>
        <div id="qris-preview-box" class="full" style="text-align:center;padding:14px;background:#faf9f6;border:1px dashed #dce5df;border-radius:10px;">
          <img id="qris-preview-img" src="${teksHTML(qrisConfig.image_url || 'assets/favicon.svg')}" alt="QRIS Preview" style="max-width:200px;max-height:200px;display:${qrisConfig.image_url ? 'inline-block' : 'none'};border-radius:8px;">
          <p id="qris-preview-empty" class="note" style="display:${qrisConfig.image_url ? 'none' : 'block'};margin:10px 0;">Belum ada gambar QRIS. Unggah gambar QRIS GoPay Anda di atas.</p>
        </div>
        <label class="editor-field full">
          Catatan Tambahan / NMID (Opsional)
          <input type="text" id="qris-instructions" placeholder="Contoh: NMID: ID1020261104889" value="${teksHTML(qrisConfig.instructions || '')}">
        </label>
        <div class="full" style="display:flex;justify-content:flex-end;">
          <button type="submit" class="primary" id="btn-save-qris">Simpan Pengaturan QRIS</button>
        </div>
        <p id="qris-status" class="note full" style="margin:0;"></p>
      </form>
    `;

    const qrisFileInput = qrisSection.querySelector('#qris-file');
    const qrisUrlInput = qrisSection.querySelector('#qris-url');
    const qrisPrevImg = qrisSection.querySelector('#qris-preview-img');
    const qrisPrevEmpty = qrisSection.querySelector('#qris-preview-empty');

    qrisFileInput.addEventListener('change', () => {
      if (qrisFileInput.files && qrisFileInput.files[0]) {
        const reader = new FileReader();
        reader.onload = e => {
          qrisPrevImg.src = e.target.result;
          qrisPrevImg.style.display = 'inline-block';
          qrisPrevEmpty.style.display = 'none';
        };
        reader.readAsDataURL(qrisFileInput.files[0]);
      }
    });
    qrisUrlInput.addEventListener('input', () => {
      if (qrisUrlInput.value.trim()) {
        qrisPrevImg.src = qrisUrlInput.value.trim();
        qrisPrevImg.style.display = 'inline-block';
        qrisPrevEmpty.style.display = 'none';
      }
    });

    qrisSection.querySelector('#form-qris-setting').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = qrisSection.querySelector('#btn-save-qris');
      const st = qrisSection.querySelector('#qris-status');
      btn.disabled = true;
      st.textContent = 'Menyimpan QRIS ke database…';
      try {
        await Backend.simpanPengaturanPembayaran({
          id: 'qris',
          category: 'qris',
          provider: 'QRIS',
          account_name: qrisSection.querySelector('#qris-name').value,
          instructions: qrisSection.querySelector('#qris-instructions').value,
          image_url: qrisUrlInput.value,
          is_active: qrisSection.querySelector('#qris-active').checked
        }, qrisFileInput.files[0] || null);
        st.textContent = '✓ Pengaturan QRIS berhasil disimpan ke database!';
        setTimeout(() => { st.textContent = ''; btn.disabled = false; }, 2500);
      } catch (err) {
        st.textContent = err.message || 'Gagal menyimpan QRIS.';
        btn.disabled = false;
      }
    });

    container.append(qrisSection);

    // 2. KOTAK REKENING BANK
    const bankSection = elemen('section', 'admin-settings-section');
    bankSection.innerHTML = `
      <h3>2. Pengaturan Transfer Bank</h3>
      <p class="note">Pilih bank yang Anda miliki. Pembeli hanya akan melihat bank yang Anda daftarkan di sini.</p>
      
      <form id="form-add-bank" class="admin-payment-form" style="background:#f9fbf9;padding:16px;border-radius:10px;margin-bottom:20px;">
        <label class="editor-field">
          Pilih Bank *
          <select id="bank-select" required>
            <option value="Bank Mandiri">Bank Mandiri</option>
            <option value="Bank BCA">Bank BCA</option>
            <option value="Bank BRI">Bank BRI</option>
            <option value="Bank BNI">Bank BNI</option>
            <option value="Bank Kalbar">Bank Kalbar</option>
            <option value="Bank Syariah Indonesia (BSI)">Bank Syariah Indonesia (BSI)</option>
            <option value="Bank CIMB Niaga">Bank CIMB Niaga</option>
            <option value="Bank Permata">Bank Permata</option>
            <option value="Bank Danamon">Bank Danamon</option>
          </select>
        </label>
        <label class="editor-field">
          Nomor Rekening *
          <input type="text" id="bank-number" required placeholder="Contoh: 140-00-1234567-8">
        </label>
        <label class="editor-field full">
          Atas Nama Rekening *
          <input type="text" id="bank-name" required value="Koperasi Rantai Mawar" placeholder="Nama pemilik rekening">
        </label>
        <div class="full" style="display:flex;justify-content:flex-end;">
          <button type="submit" class="primary" id="btn-add-bank">+ Tambahkan Rekening Bank</button>
        </div>
        <p id="bank-status" class="note full" style="margin:0;"></p>
      </form>

      <h4 style="margin:20px 0 10px 0;font-size:1rem;">Daftar Rekening Bank Aktif</h4>
      <div id="bank-list-active" class="order-card-list"></div>
    `;

    const bankListWrap = bankSection.querySelector('#bank-list-active');
    function renderBankList() {
      bankListWrap.replaceChildren();
      if (!bankAccounts.length) {
        bankListWrap.innerHTML = '<p class="note" style="padding:14px;background:#fdfaf6;border:1px dashed #e5dec9;border-radius:8px;">Belum ada rekening bank yang ditambahkan. Masukkan rekening di form atas agar pembeli dapat memilih transfer bank.</p>';
        return;
      }
      bankAccounts.forEach(b => {
        const row = elemen('div', 'admin-card-row');
        row.style.background = '#faf9f6';
        row.style.border = '1px solid #e7eee9';
        row.style.borderRadius = '10px';
        row.style.marginBottom = '10px';
        row.innerHTML = `
          <div>
            <strong style="font-size:1.05rem;color:#1c3c32;">${teksHTML(b.provider)}</strong>
            <p style="margin:4px 0 2px 0;font-family:monospace;font-size:1.1rem;letter-spacing:0.04em;">${teksHTML(b.account_number)}</p>
            <p class="note" style="margin:0;">a.n. ${teksHTML(b.account_name)}</p>
          </div>
          <button type="button" class="product-remove" data-id="${teksHTML(b.id)}">Hapus</button>
        `;
        row.querySelector('.product-remove').addEventListener('click', async () => {
          if (confirm(`Hapus rekening ${b.provider} (${b.account_number})?`)) {
            await Backend.hapusPengaturanPembayaran(b.id);
            const idx = bankAccounts.findIndex(x => x.id === b.id);
            if (idx >= 0) bankAccounts.splice(idx, 1);
            renderBankList();
          }
        });
        bankListWrap.append(row);
      });
    }
    renderBankList();

    bankSection.querySelector('#form-add-bank').addEventListener('submit', async e => {
      e.preventDefault();
      const provider = bankSection.querySelector('#bank-select').value;
      const accNumber = bankSection.querySelector('#bank-number').value.trim();
      const accName = bankSection.querySelector('#bank-name').value.trim();
      const btn = bankSection.querySelector('#btn-add-bank');
      const st = bankSection.querySelector('#bank-status');

      btn.disabled = true;
      st.textContent = 'Menyimpan rekening bank ke database…';
      try {
        const item = await Backend.simpanPengaturanPembayaran({
          id: 'bank_' + provider.toLowerCase().replace(/[^a-z0-9]/g, ''),
          category: 'bank',
          provider: provider,
          account_number: accNumber,
          account_name: accName,
          is_active: true
        });
        const existingIdx = bankAccounts.findIndex(x => x.id === item.id);
        if (existingIdx >= 0) bankAccounts[existingIdx] = item;
        else bankAccounts.push(item);
        renderBankList();

        bankSection.querySelector('#bank-number').value = '';
        st.textContent = '✓ Rekening ' + provider + ' berhasil disimpan!';
        setTimeout(() => { st.textContent = ''; btn.disabled = false; }, 2000);
      } catch (err) {
        st.textContent = err.message || 'Gagal menyimpan rekening bank.';
        btn.disabled = false;
      }
    });

    container.append(bankSection);

    // 3. KOTAK DOMPET DIGITAL
    const ewalletSection = elemen('section', 'admin-settings-section');
    ewalletSection.innerHTML = `
      <h3>3. Pengaturan Dompet Digital (E-Wallet)</h3>
      <p class="note">Pilih dompet digital yang Anda sediakan (GoPay, DANA, ShopeePay, OVO). Pembeli hanya akan melihat dompet digital yang Anda daftarkan di sini.</p>
      
      <form id="form-add-ewallet" class="admin-payment-form" style="background:#f9fbf9;padding:16px;border-radius:10px;margin-bottom:20px;">
        <label class="editor-field">
          Pilih Dompet Digital *
          <select id="ewallet-select" required>
            <option value="GoPay">GoPay</option>
            <option value="DANA">DANA</option>
            <option value="ShopeePay">ShopeePay</option>
            <option value="OVO">OVO</option>
            <option value="LinkAja">LinkAja</option>
          </select>
        </label>
        <label class="editor-field">
          Nomor HP / Akun E-Wallet *
          <input type="tel" id="ewallet-number" required placeholder="Contoh: 0812-3456-7890">
        </label>
        <label class="editor-field full">
          Atas Nama Pemilik Akun *
          <input type="text" id="ewallet-name" required value="Koperasi Rantai Mawar" placeholder="Nama pemilik akun">
        </label>
        <div class="full" style="display:flex;justify-content:flex-end;">
          <button type="submit" class="primary" id="btn-add-ewallet">+ Tambahkan Dompet Digital</button>
        </div>
        <p id="ewallet-status" class="note full" style="margin:0;"></p>
      </form>

      <h4 style="margin:20px 0 10px 0;font-size:1rem;">Daftar Dompet Digital Aktif</h4>
      <div id="ewallet-list-active" class="order-card-list"></div>
    `;

    const ewalletListWrap = ewalletSection.querySelector('#ewallet-list-active');
    function renderEwalletList() {
      ewalletListWrap.replaceChildren();
      if (!ewalletAccounts.length) {
        ewalletListWrap.innerHTML = '<p class="note" style="padding:14px;background:#fdfaf6;border:1px dashed #e5dec9;border-radius:8px;">Belum ada dompet digital yang ditambahkan. Tambahkan dompet digital di atas agar pembeli dapat memilih pembayaran e-wallet.</p>';
        return;
      }
      ewalletAccounts.forEach(w => {
        const row = elemen('div', 'admin-card-row');
        row.style.background = '#faf9f6';
        row.style.border = '1px solid #e7eee9';
        row.style.borderRadius = '10px';
        row.style.marginBottom = '10px';
        row.innerHTML = `
          <div>
            <strong style="font-size:1.05rem;color:#1c3c32;">${teksHTML(w.provider)}</strong>
            <p style="margin:4px 0 2px 0;font-family:monospace;font-size:1.1rem;letter-spacing:0.04em;">${teksHTML(w.account_number)}</p>
            <p class="note" style="margin:0;">a.n. ${teksHTML(w.account_name)}</p>
          </div>
          <button type="button" class="product-remove" data-id="${teksHTML(w.id)}">Hapus</button>
        `;
        row.querySelector('.product-remove').addEventListener('click', async () => {
          if (confirm(`Hapus dompet digital ${w.provider} (${w.account_number})?`)) {
            await Backend.hapusPengaturanPembayaran(w.id);
            const idx = ewalletAccounts.findIndex(x => x.id === w.id);
            if (idx >= 0) ewalletAccounts.splice(idx, 1);
            renderEwalletList();
          }
        });
        ewalletListWrap.append(row);
      });
    }
    renderEwalletList();

    ewalletSection.querySelector('#form-add-ewallet').addEventListener('submit', async e => {
      e.preventDefault();
      const provider = ewalletSection.querySelector('#ewallet-select').value;
      const accNumber = ewalletSection.querySelector('#ewallet-number').value.trim();
      const accName = ewalletSection.querySelector('#ewallet-name').value.trim();
      const btn = ewalletSection.querySelector('#btn-add-ewallet');
      const st = ewalletSection.querySelector('#ewallet-status');

      btn.disabled = true;
      st.textContent = 'Menyimpan dompet digital ke database…';
      try {
        const item = await Backend.simpanPengaturanPembayaran({
          id: 'ewallet_' + provider.toLowerCase().replace(/[^a-z0-9]/g, ''),
          category: 'ewallet',
          provider: provider,
          account_number: accNumber,
          account_name: accName,
          is_active: true
        });
        const existingIdx = ewalletAccounts.findIndex(x => x.id === item.id);
        if (existingIdx >= 0) ewalletAccounts[existingIdx] = item;
        else ewalletAccounts.push(item);
        renderEwalletList();

        ewalletSection.querySelector('#ewallet-number').value = '';
        st.textContent = '✓ ' + provider + ' berhasil disimpan!';
        setTimeout(() => { st.textContent = ''; btn.disabled = false; }, 2000);
      } catch (err) {
        st.textContent = err.message || 'Gagal menyimpan dompet digital.';
        btn.disabled = false;
      }
    });

    container.append(ewalletSection);
    content.append(container);
  }
  await load();
  const timer=setInterval(()=>{if(!document.hidden && view==='orders' && !content.querySelector('.tracking-editor[data-dirty],.tracking-editor:focus-within'))load();},15000);
  window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
}

async function initProductEditor(host,user,id) {
  $('account-title').textContent=id?'Edit produk':'Tambah produk';
  $('role-panel-title').textContent='Informasi kain Anda';$('role-description').textContent='Lengkapi data dan foto kain sebelum diajukan untuk ditayangkan.';
  host.innerHTML='<a class="outline" href="akun.html?view=products">Kembali ke produk Anda</a><form id="product-editor-form" class="product-editor-page"></form>';
  const form=$('product-editor-form');const fields={};
  const specs=[['nama','Nama produk',120],['harga','Harga jual per kain',null],['stok','Stok kain',null],['motif','Motif',100],['ukuran','Ukuran',80],['bahan','Bahan',100],['deskripsi','Deskripsi',1000],['pembuat','Nama pembuat tenun',160],['cerita','Cerita tenun',4000]];
  const owner=elemen('p','editor-owner','Penjual: '+user.nama);form.append(owner);
  for(const [key,label,max] of specs) {
    const wrap=elemen('label',['deskripsi','cerita','nama','pembuat'].includes(key)?'editor-field wide':'editor-field',label);
    const input=elemen(['deskripsi','cerita'].includes(key)?'textarea':'input');input.name=key;input.required=true;if(max)input.maxLength=max;
    if(['harga','stok'].includes(key)){input.type='number';input.min=key==='stok'&&id?'0':'1';input.step='1';}
    if(input.tagName==='TEXTAREA')input.rows=4;fields[key]=input;wrap.append(input);form.append(wrap);
  }
  const upload=elemen('label','editor-field wide','Foto produk');const file=elemen('input');file.type='file';file.accept='image/jpeg,image/png,image/webp';file.required=!id;
  const preview=elemen('img','editor-preview');preview.hidden=true;upload.append(file,elemen('span','note','JPG, PNG atau WebP · maksimal 10 MB'),preview);form.append(upload);
  let objectUrl;file.addEventListener('change',()=>{if(objectUrl)URL.revokeObjectURL(objectUrl);if(file.files[0]){objectUrl=URL.createObjectURL(file.files[0]);preview.src=objectUrl;preview.hidden=false;}});
  const message=elemen('p','editor-message');message.setAttribute('role','status');const save=elemen('button','primary',id?'Simpan perubahan':'Simpan produk');save.type='submit';form.append(save,message);
  if(id) {
    try {const item=await Backend.ambilDetailProduk(id);if(!item || item.sellerId!==user.id)throw new Error('Produk ini bukan milik Anda.');for(const [key]of specs)fields[key].value=({nama:item.nama,harga:item.harga,stok:item.stok,motif:item.motif,ukuran:item.ukuran,bahan:item.bahan,deskripsi:item.deskripsi,pembuat:item.pembuat,cerita:item.cerita})[key]??'';if(item.imageUrl){preview.src=item.imageUrl;preview.hidden=false;}message.textContent='Foto lama tetap digunakan jika tidak diganti. Perubahan akan diperiksa sebelum ditayangkan.';}
    catch(error){message.textContent=error.message;save.disabled=true;return;}
  }
  form.addEventListener('submit',async e=>{e.preventDefault();save.disabled=true;message.textContent='Menyimpan produk…';try{await Backend.unggahProduk(file.files[0],Object.fromEntries(specs.map(([key])=>[key,fields[key].value])),id);location.href='akun.html?view=products';}catch(error){message.textContent=error.message || 'Produk belum tersimpan.';save.disabled=false;}});
}
