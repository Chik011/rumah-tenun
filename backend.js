const SUPABASE_URL = 'https://lsewgdyamxfblzcjkwti.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_VS4ua2k49K7DYmO9OvF6uw_fefxHHd8';
const STORAGE_KEY_GUEST = 'rm_guest_mode';
const STORAGE_KEY_USER_CACHE = 'rm_cached_user';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

function alamatAkunLogin(username) {
  const identifier = username.trim().toLowerCase();
  return ({ user1: 'user@gmail.com', admin: 'admin@rumah-tenun.example', penjual1: 'penjual@rumah-tenun.example' })[identifier] || identifier;
}

function peranTampilan(role) {
  return { admin: 'Admin', seller: 'Penjual', buyer: 'Pembeli' }[role] || 'Pembeli';
}

async function bacaProfil(user) {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('id, display_name, role')
    .eq('id', user.id)
    .single();
  if (error) throw error;
  let details = {};
  if (data.role === 'buyer') {
    const result = await supabaseClient.from('buyer_profile_details').select('phone, address, contact_email').eq('buyer_id',user.id).maybeSingle();
    if (result.error) throw result.error;
    details = result.data || {};
  }
  const profile = {
    id: user.id,
    username: user.user_metadata?.login_name || user.email,
    email: details.contact_email || (user.email.endsWith('@accounts.rumah-tenun.invalid') ? '' : user.email),
    telepon: details.phone || '',
    alamat: details.address || '',
    nama: data.display_name,
    peran: peranTampilan(data.role)
  };
  try {
    localStorage.setItem(STORAGE_KEY_USER_CACHE, JSON.stringify(profile));
  } catch (_) {}
  return profile;
}

function ubahBentukProduk(item) {
  return {
    id: item.id,
    nama: item.name,
    harga: item.price,
    posisi: item.image_position,
    deskripsi: item.description,
    pembuat: item.maker_name || '',
    cerita: item.story || '',
    imageUrl: item.image_url,
    sellerId: item.seller_id,
    sellerName: item.profiles?.display_name || 'Koperasi Rantai Mawar',
    motif: item.motif,
    ukuran: item.size,
    bahan: item.material,
    stok: item.stock,
    status: item.status,
    deletedAt: item.deleted_at || null,
    catatanReview: item.review_note
  };
}

const Backend = {
  async notifikasi() {
    const { data, error } = await supabaseClient.from('order_notifications').select('id,order_id,title,message,read_at,created_at').order('created_at',{ascending:false}).limit(30);
    if(error)throw error;
    const countResult=await supabaseClient.from('order_notifications').select('id',{count:'exact',head:true}).is('read_at',null);
    if(countResult.error)throw countResult.error;
    return {items:data || [],count:countResult.count || 0};
  },
  async bacaNotifikasi(id) {const {error}=await supabaseClient.rpc('read_order_notification',{p_id:id});if(error)throw error;},
  async drafProduk(id) {const {error}=await supabaseClient.rpc('seller_product_draft',{p_product_id:Number(id)});if(error)throw error;},
  async simpanResi(id,courier,number,url,ship=false) {const {error}=await supabaseClient.rpc('save_shipment',{p_order_id:id,p_courier:courier,p_number:number,p_url:url,p_ship:ship});if(error)throw error;},
  async pantauKoperasi() {const {data,error}=await supabaseClient.rpc('admin_overview');if(error)throw error;return data;},
  async bacaTas() {
    const user = await this.penggunaAktif();
    if (!user || user.peran !== 'Pembeli') return {};
    const { data, error } = await supabaseClient.from('buyer_carts').select('items').eq('buyer_id', user.id).maybeSingle();
    if (error) throw error;
    return data?.items || {};
  },
  async simpanTas(items) {
    const { error } = await supabaseClient.rpc('save_buyer_cart', { p_items: items });
    if (error) throw error;
  },
  async stokProdukPenjual(id, action) {
    const { data, error } = await supabaseClient.rpc((await this.penggunaAktif())?.peran === 'Admin' ? 'cooperative_product_stock' : 'seller_product_stock', { p_product_id: Number(id), p_action: action });
    if (error) throw error;
    return data;
  },
  async hapusProdukPenjual(id, restore = false) {
    const { error } = await supabaseClient.rpc((await this.penggunaAktif())?.peran === 'Admin' ? 'cooperative_archive_product' : 'seller_archive_product', { p_product_id: Number(id), p_restore: restore });
    if (error) throw error;
  },
  async produkPenjualDihapus() {
    const { data, error } = await supabaseClient.from('products').select('*').not('deleted_at', 'is', null).order('id');
    if (error) throw error;
    return data.map(ubahBentukProduk);
  },
  async pesananPenjual() {
    if ((await this.penggunaAktif())?.peran === 'Admin') return this.semuaPesanan();
    const { data,error } = await supabaseClient.rpc('seller_orders'); if(error) throw error; return data || [];
  },
  async tinjauPesanan(orderId, approve) {
    const { error } = await supabaseClient.rpc('review_order', { p_order_id: orderId, p_approve: approve });
    if (error) throw error;
  },
  async prosesPesananPenjual(orderId, status) {
    if ((await this.penggunaAktif())?.peran === 'Admin') return this.ubahStatusPesanan(orderId, 'confirmed', status);
    const {error} = await supabaseClient.rpc('advance_seller_order',{p_order_id:orderId,p_status:status}); if(error) throw error;
  },
  async ambilDetailProduk(id) {
    const { data, error } = await supabaseClient.from('products')
      .select('id, name, price, image_position, description, maker_name, story, image_url, seller_id, motif, size, material, stock, status, deleted_at, profiles!products_seller_id_fkey(display_name)')
      .eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? ubahBentukProduk(data) : null;
  },
  async ambilProduk() {
    const { data, error } = await supabaseClient
      .from('products')
      .select('id, name, price, image_position, description, maker_name, story, image_url, seller_id, motif, size, material, stock, status, review_note, profiles!products_seller_id_fkey(display_name)')
      .is('deleted_at', null).order('id');
    if (error) throw error;
    return data.map(ubahBentukProduk);
  },

  async produkPerluReview() {
    const { data, error } = await supabaseClient
      .from('products')
      .select('id, name, price, image_position, description, maker_name, story, image_url, seller_id, motif, size, material, stock, status, review_note, profiles!products_seller_id_fkey(display_name)')
      .in('status', ['pending', 'needs_revision'])
      .is('deleted_at', null)
      .order('id');
    if (error) throw error;
    return data.map(ubahBentukProduk);
  },

  async ubahStatusProduk(id, status, catatan) {
    const { error } = await supabaseClient.from('products')
      .update({ status: status, review_note: catatan || null, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  async buatPesanan(detail, keranjang, requestId) {
    const items = Object.entries(keranjang)
      .filter(([, quantity]) => quantity > 0)
      .map(([productId, quantity]) => ({ product_id: Number(productId), quantity: Number(quantity) }));
    const { data, error } = await supabaseClient.rpc('create_checkout_order', {
      p_request_id: requestId,
      p_buyer_name: detail.nama,
      p_phone: detail.telepon,
      p_shipping_address: detail.alamat,
      p_payment_method: detail.metode,
      p_items: items
    });
    if (error) throw error;
    return data;
  },

  async pesananSaya() {
    const { data, error } = await supabaseClient.from('orders')
      .select('id, buyer_name, payment_method, payment_status, order_status, payment_provider, payment_url, payment_mode, payment_expires_at, total, created_at, order_items(product_id, item_name, unit_price, quantity, image_url)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async pengirimanSaya() {
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) throw new Error('Masuk untuk melihat pesanan Anda.');
    const { data, error } = await supabaseClient.from('orders')
      .select('id, buyer_name, shipping_address, payment_method, payment_status, order_status, payment_provider, payment_mode, total, created_at, order_items(product_id, item_name, unit_price, quantity, image_url)')
      .eq('buyer_id', user.id).order('created_at', { ascending: false });
    if (error) throw error;
    const shipments=await supabaseClient.rpc('buyer_shipments');
    if(shipments.error)throw shipments.error;
    return data.map(order=>({...order,shipments:(shipments.data || []).filter(s=>s.order_id===order.id)}));
  },

  async semuaPesanan() {
    const { data, error } = await supabaseClient.from('orders')
      .select('id, buyer_id, buyer_name, phone, shipping_address, payment_method, payment_status, order_status, payment_provider, payment_mode, total, created_at, order_items(product_id, seller_id, item_name, unit_price, quantity, image_url)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async laporPembayaran(id) {
    const { error } = await supabaseClient.from('orders')
      .update({ payment_status: 'submitted' })
      .eq('id', id);
    if (error) throw error;
  },

  async ubahStatusPesanan(id, paymentStatus, orderStatus) {
    const { error } = await supabaseClient.from('orders').update({
      payment_status: paymentStatus,
      order_status: orderStatus
    }).eq('id', id);
    if (error) throw error;
  },

  async ambilMateri() {
    const { data, error } = await supabaseClient
      .from('learning_materials')
      .select('id, title, duration, steps')
      .order('id');
    if (error) throw error;
    return data.map(item => ({ id: item.id, judul: item.title, durasi: item.duration, langkah: item.steps }));
  },

  async masuk(email, password) {
    localStorage.removeItem(STORAGE_KEY_GUEST);
    if (!alamatAkunLogin(email).includes('@')) email = await this.identitasPembeli('login',email,password);
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: alamatAkunLogin(email),
      password
    });
    if (error) throw error;
    return bacaProfil(data.user);
  },

  async identitasPembeli(action,name,password) {
    const {data,error} = await supabaseClient.functions.invoke('buyer-account',{body:{action,name,password}});
    if(error) {
      let message='Akun belum dapat diproses. Coba lagi.';
      try { message=(await error.context.json()).error || message; } catch(_) {}
      throw new Error(message);
    }
    if(!data?.loginEmail) throw new Error(data?.error || 'Akun belum dapat diproses.');
    return data.loginEmail;
  },

  async daftar(namaLengkap, password) {
    await this.identitasPembeli('register',namaLengkap,password);
    const {error}=await supabaseClient.auth.signOut({scope:'local'});
    if(error) throw error;
    localStorage.removeItem(STORAGE_KEY_GUEST);
    return {nama:namaLengkap.trim()};
  },

  async simpanProfil(nama,telepon='',alamat='',email='') {
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) throw new Error('Silakan masuk terlebih dahulu.');
    const { error } = await supabaseClient.rpc('update_buyer_profile',{p_name:nama.trim(),p_phone:telepon.trim(),p_address:alamat.trim(),p_email:email.trim()});
    if (error) throw error;
    return bacaProfil(user);
  },

  getCachedUser() {
    try {
      if (localStorage.getItem(STORAGE_KEY_GUEST) === '1') {
        return { username: 'guest', nama: 'Tamu', peran: 'Guest' };
      }
      const raw = localStorage.getItem(STORAGE_KEY_USER_CACHE);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  },

  async penggunaAktif() {
    if (localStorage.getItem(STORAGE_KEY_GUEST) === '1') {
      return { username: 'guest', nama: 'Tamu', peran: 'Guest' };
    }
    const { data: { user }, error } = await supabaseClient.auth.getUser();
    if (error || !user) {
      try { localStorage.removeItem(STORAGE_KEY_USER_CACHE); } catch (_) {}
      return null;
    }
    try {
      return await bacaProfil(user);
    } catch (err) {
      const cached = this.getCachedUser();
      if (cached && cached.id === user.id) return cached;
      throw err;
    }
  },

  async masukGuest() {
    try { localStorage.removeItem(STORAGE_KEY_USER_CACHE); } catch (_) {}
    await supabaseClient.auth.signOut();
    localStorage.setItem(STORAGE_KEY_GUEST, '1');
    return { username: 'guest', nama: 'Tamu', peran: 'Guest' };
  },

  async keluar() {
    try { localStorage.removeItem(STORAGE_KEY_USER_CACHE); } catch (_) {}
    try { localStorage.removeItem(STORAGE_KEY_GUEST); } catch (_) {}
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
  },

  async buatAkunPenjual(email, password, nama) {
    const { data, error } = await supabaseClient.functions.invoke('create-seller', {
      body: { email: email.trim().toLowerCase(), password, displayName: nama.trim() }
    });
    if (error) {
      let message = 'Gagal membuat akun penjual di database.';
      try {
        const body = await error.context.json();
        message = body.error || message;
      } catch (_) {
        message = error.message || message;
      }
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  },

  async unggahProduk(file, produk, productId) {
    if (!file && !productId) throw new Error('Pilih berkas gambar.');
    let uploaded = null;
    if (file) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Pilih gambar JPG, PNG, atau WebP.');
    if (file.size > 10 * 1024 * 1024) throw new Error('Ukuran gambar maksimal 10 MB.');

    const { data: signed, error: signError } = await supabaseClient.functions.invoke('cloudinary-signature', { body: {} });
    if (signError) throw signError;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('api_key', signed.apiKey);
    formData.append('timestamp', String(signed.timestamp));
    formData.append('folder', signed.folder);
    formData.append('signature', signed.signature);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${signed.cloudName}/image/upload`, {
      method: 'POST',
      body: formData
    });
    uploaded = await response.json();
    if (!response.ok) throw new Error(uploaded.error && uploaded.error.message || 'Gagal mengunggah gambar.');
    }

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) throw new Error('Silakan masuk sebagai penjual.');
    const productData = {
      name: produk.nama.trim(),
      price: Number(produk.harga),
      description: produk.deskripsi.trim(),
      maker_name: (produk.pembuat || '').trim(),
      story: (produk.cerita || '').trim(),
      image_position: '50% 50%',
      motif: produk.motif.trim(),
      size: produk.ukuran.trim(),
      material: produk.bahan.trim(),
      stock: Number(produk.stok),
      status: 'pending',
      review_note: null,
      updated_at: new Date().toISOString()
    };
    if (uploaded) productData.image_url = uploaded.secure_url;
    if (productId) {
      const { data, error } = await supabaseClient.rpc((await this.penggunaAktif())?.peran === 'Admin' ? 'cooperative_update_product' : 'update_seller_product', { p_product_id: Number(productId), p_product: productData });
      if (error) throw error;
      return ubahBentukProduk(Array.isArray(data) ? data[0] : data);
    }
    const query = supabaseClient.from('products').insert({ ...productData, seller_id: user.id });
    const { data, error } = await query
      .select('id, name, price, image_position, description, maker_name, story, image_url, seller_id, motif, size, material, stock, status, review_note')
      .single();
    if (error) throw error;
    return ubahBentukProduk(data);
  },

  async unggahBerkasGambar(file) {
    if (!file) return null;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'].includes(file.type)) {
      throw new Error('Pilih format gambar JPG, PNG, WebP, atau SVG.');
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('Ukuran gambar maksimal 10 MB.');
    }
    try {
      const { data: signed, error: signError } = await supabaseClient.functions.invoke('cloudinary-signature', { body: {} });
      if (!signError && signed && signed.signature) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('api_key', signed.apiKey);
        formData.append('timestamp', String(signed.timestamp));
        formData.append('folder', signed.folder);
        formData.append('signature', signed.signature);
        const res = await fetch(`https://api.cloudinary.com/v1_1/${signed.cloudName}/image/upload`, {
          method: 'POST',
          body: formData
        });
        if (res.ok) {
          const json = await res.json();
          if (json.secure_url) return json.secure_url;
        }
      }
    } catch (_) {}

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Gagal membaca berkas gambar.'));
      reader.readAsDataURL(file);
    });
  },

  async ambilArtikel() {
    try {
      const { data, error } = await supabaseClient
        .from('articles')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && Array.isArray(data)) {
        try { localStorage.setItem('rm_cached_articles', JSON.stringify(data)); } catch (_) {}
        return data;
      }
    } catch (_) {}
    try {
      const cached = localStorage.getItem('rm_cached_articles');
      return cached ? JSON.parse(cached) : [];
    } catch (_) {
      return [];
    }
  },

  async ambilDetailArtikel(id) {
    try {
      const { data, error } = await supabaseClient
        .from('articles')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (!error && data) return data;
    } catch (_) {}
    const list = await this.ambilArtikel();
    return list.find(a => String(a.id) === String(id)) || null;
  },

  async simpanArtikel(artikel, file) {
    const user = await this.penggunaAktif();
    if (!user || user.peran !== 'Admin') throw new Error('Hanya admin yang dapat mengelola artikel.');

    let imageUrl = artikel.image_url || '';
    if (file) {
      imageUrl = await this.unggahBerkasGambar(file);
    }

    const payload = {
      title: artikel.title.trim(),
      category: (artikel.category || 'Pustaka Tenun').trim(),
      summary: (artikel.summary || '').trim(),
      content: artikel.content.trim(),
      image_url: imageUrl,
      author_name: user.nama || 'Admin Koperasi',
      updated_at: new Date().toISOString()
    };

    let result;
    if (artikel.id) {
      const { data, error } = await supabaseClient
        .from('articles')
        .update(payload)
        .eq('id', artikel.id)
        .select()
        .single();
      if (error) {
        payload.id = artikel.id;
        result = payload;
      } else {
        result = data;
      }
    } else {
      payload.created_at = new Date().toISOString();
      const { data, error } = await supabaseClient
        .from('articles')
        .insert(payload)
        .select()
        .single();
      if (error) {
        payload.id = Date.now();
        result = payload;
      } else {
        result = data;
      }
    }

    try {
      let cached = JSON.parse(localStorage.getItem('rm_cached_articles') || '[]');
      const idx = cached.findIndex(a => String(a.id) === String(result.id));
      if (idx >= 0) cached[idx] = result;
      else cached.unshift(result);
      localStorage.setItem('rm_cached_articles', JSON.stringify(cached));
    } catch (_) {}

    return result;
  },

  async hapusArtikel(id) {
    const user = await this.penggunaAktif();
    if (!user || user.peran !== 'Admin') throw new Error('Hanya admin yang dapat menghapus artikel.');
    try {
      await supabaseClient.from('articles').delete().eq('id', id);
    } catch (_) {}
    try {
      let cached = JSON.parse(localStorage.getItem('rm_cached_articles') || '[]');
      cached = cached.filter(a => String(a.id) !== String(id));
      localStorage.setItem('rm_cached_articles', JSON.stringify(cached));
    } catch (_) {}
  },

  async ambilPengaturanPembayaran() {
    try {
      const { data, error } = await supabaseClient
        .from('payment_settings')
        .select('*')
        .order('created_at', { ascending: true });
      if (!error && Array.isArray(data)) {
        try { localStorage.setItem('rm_cached_payment_settings', JSON.stringify(data)); } catch (_) {}
        return data;
      }
    } catch (_) {}
    try {
      const cached = localStorage.getItem('rm_cached_payment_settings');
      return cached ? JSON.parse(cached) : [];
    } catch (_) {
      return [];
    }
  },

  async simpanPengaturanPembayaran(item, fileQr) {
    const user = await this.penggunaAktif();
    if (!user || user.peran !== 'Admin') throw new Error('Hanya admin yang dapat mengatur metode pembayaran.');

    let imageUrl = item.image_url || '';
    if (fileQr) {
      imageUrl = await this.unggahBerkasGambar(fileQr);
    }

    const payload = {
      id: item.id || (item.category + '_' + item.provider.toLowerCase().replace(/[^a-z0-9]/g, '')),
      category: item.category,
      provider: item.provider.trim(),
      account_number: (item.account_number || '').trim(),
      account_name: (item.account_name || 'Koperasi Rantai Mawar').trim(),
      image_url: imageUrl,
      instructions: (item.instructions || '').trim(),
      is_active: item.is_active !== false,
      updated_at: new Date().toISOString()
    };

    let result;
    const { data, error } = await supabaseClient
      .from('payment_settings')
      .upsert(payload)
      .select()
      .single();
    if (error) {
      result = payload;
    } else {
      result = data;
    }

    try {
      let cached = JSON.parse(localStorage.getItem('rm_cached_payment_settings') || '[]');
      const idx = cached.findIndex(s => s.id === result.id);
      if (idx >= 0) cached[idx] = result;
      else cached.push(result);
      localStorage.setItem('rm_cached_payment_settings', JSON.stringify(cached));
    } catch (_) {}

    return result;
  },

  async hapusPengaturanPembayaran(id) {
    const user = await this.penggunaAktif();
    if (!user || user.peran !== 'Admin') throw new Error('Hanya admin yang dapat menghapus metode pembayaran.');
    try {
      await supabaseClient.from('payment_settings').delete().eq('id', id);
    } catch (_) {}
    try {
      let cached = JSON.parse(localStorage.getItem('rm_cached_payment_settings') || '[]');
      cached = cached.filter(s => s.id !== id);
      localStorage.setItem('rm_cached_payment_settings', JSON.stringify(cached));
    } catch (_) {}
  }
};
