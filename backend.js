const SUPABASE_URL = 'https://lsewgdyamxfblzcjkwti.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_VS4ua2k49K7DYmO9OvF6uw_fefxHHd8';
const STORAGE_KEY_GUEST = 'rm_guest_mode';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

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
  return {
    id: user.id,
    username: user.email,
    email: user.email,
    nama: data.display_name,
    peran: peranTampilan(data.role)
  };
}

function ubahBentukProduk(item) {
  return {
    id: item.id,
    nama: item.name,
    harga: item.price,
    posisi: item.image_position,
    deskripsi: item.description,
    imageUrl: item.image_url,
    sellerId: item.seller_id,
    sellerName: item.profiles && item.profiles.display_name,
    motif: item.motif,
    ukuran: item.size,
    bahan: item.material,
    stok: item.stock,
    status: item.status,
    catatanReview: item.review_note
  };
}

const Backend = {
  async ambilProduk() {
    const { data, error } = await supabaseClient
      .from('products')
      .select('id, name, price, image_position, description, image_url, seller_id, motif, size, material, stock, status, review_note, profiles!products_seller_id_fkey(display_name)')
      .order('id');
    if (error) throw error;
    return data.map(ubahBentukProduk);
  },

  async produkPerluReview() {
    const { data, error } = await supabaseClient
      .from('products')
      .select('id, name, price, image_position, description, image_url, seller_id, motif, size, material, stock, status, review_note, profiles!products_seller_id_fkey(display_name)')
      .in('status', ['pending', 'needs_revision'])
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

  async buatPesanan(detail, keranjang) {
    const items = Object.entries(keranjang)
      .filter(([, quantity]) => quantity > 0)
      .map(([productId, quantity]) => ({ product_id: Number(productId), quantity: Number(quantity) }));
    const { data, error } = await supabaseClient.rpc('create_order', {
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
      .select('id, buyer_name, payment_method, payment_status, order_status, total, created_at, order_items(item_name, unit_price, quantity, image_url)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async semuaPesanan() {
    const { data, error } = await supabaseClient.from('orders')
      .select('id, buyer_name, phone, shipping_address, payment_method, payment_status, order_status, total, created_at, order_items(item_name, unit_price, quantity, image_url)')
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
      .select('title, duration, steps')
      .order('id');
    if (error) throw error;
    return data.map(item => ({ judul: item.title, durasi: item.duration, langkah: item.steps }));
  },

  async masuk(email, password) {
    localStorage.removeItem(STORAGE_KEY_GUEST);
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password
    });
    if (error) throw error;
    return bacaProfil(data.user);
  },

  async daftar(email, password, namaLengkap) {
    const { data, error } = await supabaseClient.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { display_name: namaLengkap.trim() } }
    });
    if (error) throw error;
    if (!data.session) return { konfirmasiEmail: true, nama: namaLengkap.trim() };
    return bacaProfil(data.user);
  },

  async simpanProfil(nama) {
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) throw new Error('Silakan masuk terlebih dahulu.');
    const { error } = await supabaseClient.from('profiles')
      .update({ display_name: nama.trim() })
      .eq('id', user.id);
    if (error) throw error;
    return bacaProfil(user);
  },

  async penggunaAktif() {
    if (localStorage.getItem(STORAGE_KEY_GUEST) === '1') {
      return { username: 'guest', nama: 'Tamu', peran: 'Guest' };
    }
    const { data: { user }, error } = await supabaseClient.auth.getUser();
    if (error || !user) return null;
    return bacaProfil(user);
  },

  async masukGuest() {
    await supabaseClient.auth.signOut();
    localStorage.setItem(STORAGE_KEY_GUEST, '1');
    return { username: 'guest', nama: 'Tamu', peran: 'Guest' };
  },

  async keluar() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
    localStorage.removeItem(STORAGE_KEY_GUEST);
  },

  async buatAkunPenjual(email, password, nama) {
    const { data, error } = await supabaseClient.functions.invoke('create-seller', {
      body: { email: email.trim().toLowerCase(), password, displayName: nama.trim() }
    });
    if (error) throw error;
    return data;
  },

  async unggahProduk(file, produk, productId) {
    if (!file || !file.type.startsWith('image/')) throw new Error('Pilih berkas gambar.');
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
    const uploaded = await response.json();
    if (!response.ok) throw new Error(uploaded.error && uploaded.error.message || 'Gagal mengunggah gambar.');

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) throw new Error('Silakan masuk sebagai penjual.');
    const productData = {
      name: produk.nama.trim(),
      price: Number(produk.harga),
      description: produk.deskripsi.trim(),
      image_position: '50% 50%',
      image_url: uploaded.secure_url,
      motif: produk.motif.trim(),
      size: produk.ukuran.trim(),
      material: produk.bahan.trim(),
      stock: Number(produk.stok),
      status: 'pending',
      review_note: null,
      updated_at: new Date().toISOString()
    };
    const query = productId
      ? supabaseClient.from('products').update(productData).eq('id', productId).eq('seller_id', user.id)
      : supabaseClient.from('products').insert({ ...productData, seller_id: user.id });
    const { data, error } = await query
      .select('id, name, price, image_position, description, image_url, seller_id, motif, size, material, stock, status, review_note')
      .single();
    if (error) throw error;
    return ubahBentukProduk(data);
  }
};
