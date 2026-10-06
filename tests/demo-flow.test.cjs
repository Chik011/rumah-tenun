const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

test('Shared demo roles authenticate locally and cannot reach privileged server methods', async () => {
  let serverCalls = 0;
  const storage = new Map();
  const Backend = {};
  const methods = ['masuk','keluar','masukGuest','daftar','penggunaAktif','ambilProduk','ambilDetailProduk','produkPerluReview','semuaPesanan','pesananSaya','pengirimanSaya','ubahStatusProduk','ubahStatusPesanan','buatAkunPenjual','unggahProduk','simpanProfil','buatPesanan','pembayaranXendit','laporPembayaran'];
  for (const name of methods) Backend[name] = async () => { serverCalls++; if (name !== 'keluar') throw Error('Server must not be called'); };
  const context = { Backend, document: { addEventListener() {} }, localStorage: { getItem: key => storage.get(key) || null, setItem: (key,value) => storage.set(key,value), removeItem: key => storage.delete(key) } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../demo.js'),'utf8'), context);
  await assert.rejects(Backend.masuk('admin@demo.rumah-tenun.example','wrong'));
  assert.equal(serverCalls,0);
  for (const [email,role] of [['admin@demo.rumah-tenun.example','Admin'],['penjual@demo.rumah-tenun.example','Penjual']]) {
    const user = await Backend.masuk(email,'12345678');
    assert.equal(user.peran,role);
    assert.equal(user.demo,true);
    const before = serverCalls;
    const products = await Backend.ambilProduk();
    await Backend.ubahStatusProduk(products[0].id,'approved','');
    assert.equal((await Backend.ambilProduk())[0].status,'approved');
    const orders = await Backend.semuaPesanan();
    await Backend.ubahStatusPesanan(orders[0].id,'confirmed','packaging');
    assert.equal((await Backend.semuaPesanan())[0].order_status,'packaging');
    await Backend.buatAkunPenjual('sample@example.test','sample','Sample');
    await Backend.unggahProduk(null,{nama:'Sample'},null);
    await Backend.simpanProfil('Demo');
    await assert.rejects(Backend.buatPesanan({},{}), /Mode demo/);
    await assert.rejects(Backend.pembayaranXendit('create'), /Mode demo/);
    await assert.rejects(Backend.laporPembayaran('real-order'), /Mode demo/);
    assert.equal(serverCalls,before);
  }
  await Backend.keluar();
  assert.equal(storage.has('rm_demo_session'),false);
});
