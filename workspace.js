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
  const tabs=admin?[['sellers','Penjual'],['buyers','Pembeli'],['products','Katalog produk'],['orders','Pesanan'],['activity','Aktivitas']]:[['products','Produk Anda'],['orders','Pesanan masuk']];
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
    card.append(elemen('strong','order-total',rupiah(order.total)),elemen('p','note',order.payment_status==='confirmed'?'Pembayaran diterima':'Belum dibayar'));
    if(admin) return card;
    const address=elemen('details','shipment-address');address.append(elemen('summary','','Penerima & alamat'),elemen('p','',order.buyer_name+' · '+order.phone),elemen('p','',order.shipping_address));card.append(address);
    if(order.overall_status==='awaiting_approval' && order.order_status==='awaiting_payment')card.append(elemen('p','notice','Anda sudah menyetujui. Menunggu penjual lain.'));
    const actions=elemen('div','shipment-actions');
    if(order.order_status==='awaiting_approval')for(const [approve,label] of [[true,'Setujui pesanan'],[false,'Tolak pesanan']]) {const b=elemen('button',approve?'primary':'outline',label);b.type='button';b.addEventListener('click',()=>{if(approve||confirm('Tolak seluruh pesanan dan kembalikan stok?'))act(b,()=>Backend.tinjauPesanan(order.id,approve));});actions.append(b);}
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
    const sellers=view==='sellers';heading(sellers?'Penjual terdaftar':'Pembeli terdaftar',sellers?'Pilih penjual untuk melihat barang dan aktivitasnya.':'Pilih pembeli untuk melihat riwayat pesanannya.');
    const search=elemen('input','workspace-search');search.type='search';search.placeholder=sellers?'Cari penjual':'Cari pembeli';search.setAttribute('aria-label',search.placeholder);
    const people=elemen('div','people-grid');const details=elemen('section','person-detail');content.append(search,people,details);
    const allProducts=sellers?await Backend.ambilProduk():[];const allOrders=await Backend.semuaPesanan();
    const draw=()=>{people.replaceChildren();for(const person of data.people.filter(p=>p.role===(sellers?'seller':'buyer') && p.name.toLowerCase().includes(search.value.toLowerCase()))) {
      const b=elemen('button','person-card');b.type='button';b.append(elemen('span','person-avatar',person.name.charAt(0)),elemen('strong','',person.name),elemen('span','note',sellers?person.products+' produk':person.orders+' pesanan'),elemen('span','person-open','Lihat rincian'));
      b.addEventListener('click',()=>{details.replaceChildren(elemen('h3','',person.name));if(sellers)for(const product of allProducts.filter(p=>p.sellerId===person.id))details.append(productCard(product,false));for(const order of allOrders.filter(o=>sellers?o.order_items.some(i=>i.seller_id===person.id):o.buyer_id===person.id))details.append(orderCard(order));if(details.children.length===1)details.append(elemen('p','notice','Belum ada data untuk ditampilkan.'));details.scrollIntoView({behavior:'smooth',block:'start'});});people.append(b);
    }if(!people.children.length)people.append(elemen('p','notice','Tidak ada akun yang sesuai.'));};search.addEventListener('input',draw);draw();
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
