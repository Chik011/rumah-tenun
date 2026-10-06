// Demo sessions only use browser-local sample data. They never authenticate
// as a privileged Supabase account or send management changes to the server.
(() => {
  const sessionKey = 'rm_demo_session';
  const dataKey = 'rm_demo_data_v1';
  const roles = {
    'admin@demo.rumah-tenun.example': 'Admin',
    'penjual@demo.rumah-tenun.example': 'Penjual'
  };
  const original = { ...Backend };
  const readSession = () => {
    try {
      const user = JSON.parse(localStorage.getItem(sessionKey) || 'null');
      return user && roles[user.email] === user.peran ? user : null;
    } catch (_) { return null; }
  };
  const sample = () => ({
    products: [
      { id: 1, nama: 'Tenun Senja Contoh', harga: 350000, stok: 20, deskripsi: 'Tenun bermotif geometris untuk mencoba alur demo.', posisi: '50% 50%', imageUrl: '', sellerId: 'demo-penjual', sellerName: 'Penjual Demo', motif: 'Geometris', ukuran: '200 × 110 cm', bahan: 'Katun', status: 'pending', catatanReview: '' },
      { id: 2, nama: 'Tenun Pagi Contoh', harga: 275000, stok: 15, deskripsi: 'Kain contoh untuk demonstrasi.', posisi: '50% 50%', imageUrl: '', sellerId: 'demo-penjual', sellerName: 'Penjual Demo', motif: 'Bunga', ukuran: '200 × 110 cm', bahan: 'Katun', status: 'approved', catatanReview: '' }
    ],
    orders: [{ id: 'demo-order-001', buyer_name: 'Pembeli Contoh', phone: 'Nomor contoh', shipping_address: 'Alamat pengiriman contoh, Sambas', payment_method: 'Pembayaran demo', payment_status: 'confirmed', order_status: 'checking', payment_provider: 'demo', payment_mode: 'test', total: 350000, created_at: '2026-10-06T00:00:00Z', order_items: [{ product_id: 1, item_name: 'Tenun Senja Contoh', unit_price: 350000, quantity: 1, image_url: '' }] }]
  });
  const readData = () => {
    try { return JSON.parse(localStorage.getItem(dataKey)) || sample(); }
    catch (_) { return sample(); }
  };
  const saveData = data => localStorage.setItem(dataKey, JSON.stringify(data));
  const handlers = {
    penggunaAktif: async () => readSession(),
    ambilProduk: async () => readData().products,
    ambilDetailProduk: async id => readData().products.find(item => item.id === Number(id)) || null,
    produkPerluReview: async () => readData().products.filter(item => item.status !== 'approved'),
    semuaPesanan: async () => readData().orders,
    pesananSaya: async () => readData().orders,
    pengirimanSaya: async () => readData().orders,
    ubahStatusProduk: async (id, status, catatan) => {
      const data = readData();
      const product = data.products.find(item => item.id === id);
      if (!product) throw new Error('Produk contoh tidak ditemukan.');
      product.status = status; product.catatanReview = catatan || ''; saveData(data);
    },
    ubahStatusPesanan: async (id, paymentStatus, orderStatus) => {
      const data = readData();
      const order = data.orders.find(item => item.id === id);
      if (!order) throw new Error('Pesanan contoh tidak ditemukan.');
      order.payment_status = paymentStatus; order.order_status = orderStatus; saveData(data);
    },
    buatAkunPenjual: async (email, password, nama) => ({ email, displayName: nama, demo: true }),
    unggahProduk: async (file, product, productId) => {
      const data = readData();
      const item = { ...product, id: productId ? Number(productId) : Math.max(...data.products.map(p => p.id)) + 1, status: 'pending', catatanReview: '', sellerId: 'demo-penjual', sellerName: 'Penjual Demo', imageUrl: '', posisi: '50% 50%' };
      const index = data.products.findIndex(p => p.id === item.id);
      if (index >= 0) data.products[index] = item; else data.products.push(item);
      saveData(data); return item;
    },
    simpanProfil: async nama => {
      const user = readSession(); user.nama = nama.trim();
      localStorage.setItem(sessionKey, JSON.stringify(user)); return user;
    }
  };
  for (const [name, method] of Object.entries(original)) {
    Backend[name] = async (...args) => {
      if (name === 'masuk') {
        const email = String(args[0]).trim().toLowerCase();
        if (roles[email]) {
          if (args[1] !== '12345678') throw new Error('Sandi demo tidak sesuai.');
          await original.keluar();
          const peran = roles[email];
          const user = { id: peran === 'Admin' ? 'demo-admin' : 'demo-penjual', email, username: email, nama: peran + ' Demo', peran, demo: true };
          localStorage.setItem(sessionKey, JSON.stringify(user)); return user;
        }
        localStorage.removeItem(sessionKey);
        return method(...args);
      }
      if (name === 'keluar' || name === 'masukGuest' || name === 'daftar') {
        localStorage.removeItem(sessionKey); return method(...args);
      }
      if (readSession()) {
        if (handlers[name]) return handlers[name](...args);
        if (name === 'ambilMateri') return method(...args);
        throw new Error('Mode demo: tindakan ini tersedia melalui akun pribadi.');
      }
      return method(...args);
    };
  }
  document.addEventListener('DOMContentLoaded', () => {
    if (!readSession()) return;
    const note = document.createElement('p');
    note.className = 'demo-notice';
    note.textContent = 'Mode demo · Anda sedang mencoba data contoh.';
    const host = document.getElementById('main-content');
    if (host) host.prepend(note);
  });
})();
