const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function loadServer(file, globals = {}, modules = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS
  }, reportDiagnostics: true });
  assert.equal((compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  const exports = {};
  vm.runInNewContext(compiled.outputText, { exports, require: name => {
    if (!(name in modules)) throw new Error('Unexpected import: ' + name);
    return modules[name];
  }, Request, Response, URL, TextEncoder, Uint8Array, AbortSignal, crypto, btoa, ...globals });
  return exports;
}

test('Xendit payload uses server total, rejects unsafe links and separates Test/Live keys', async () => {
  const shared = loadServer('supabase/functions/_shared/xendit.ts');
  assert.equal(shared.validPaymentUrl('https://dev.xen.to/test'), true);
  for (const url of ['javascript:alert(1)', 'https://checkout.xendit.co.attacker.test/pay', 'http://xen.to/pay', 'https://user:pass@xen.to/pay']) {
    assert.equal(shared.validPaymentUrl(url), false);
  }
  assert.throws(() => shared.paymentConfig(k => ({ XENDIT_SECRET_KEY: 'xnd_development_fake', XENDIT_MODE: 'live' })[k]));
  assert.throws(() => shared.paymentConfig(k => ({ XENDIT_SECRET_KEY: 'xnd_development_fake', SITE_URL: 'http://shop.test' })[k]));
  const payload = shared.sessionPayload({ id: 'order-id', total: 350000 }, 'ref', 'https://shop.test');
  assert.equal(payload.amount, 350000);
  assert.equal(payload.capture_method, 'AUTOMATIC');
  assert.equal(payload.success_return_url, 'https://shop.test/pembayaran.html?order=order-id');
  assert.equal(await shared.tokenEqual('right-token', 'right-token'), true);
  assert.equal(await shared.tokenEqual('right-token', 'wrong-token'), false);
});

test('Webhook rejects forged tokens and verifies payment by re-fetching Xendit', async () => {
  let handler;
  let fetched = 0;
  const calls = [];
  const admin = {
    from: () => ({ select: () => ({ eq: (field, id) => ({ maybeSingle: async () => ({ data: id === 'ps-test' ? { session_id: 'ps-test' } : null, error: null }) }) }) }),
    rpc: async (name, args) => { calls.push({ name, args }); return { error: null }; }
  };
  const shared = loadServer('supabase/functions/_shared/xendit.ts', { fetch: async () => {
    fetched++;
    return new Response(JSON.stringify({ payment_session_id: 'ps-test', session_type: 'PAY', capture_method: 'AUTOMATIC',
      reference_id: 'rm-real-order', amount: 300000, currency: 'IDR', status: 'COMPLETED', payment_id: 'py-verified' }));
  } });
  loadServer('supabase/functions/xendit-webhook/index.ts', {
    Deno: { serve: fn => { handler = fn; }, env: { get: key => ({
      SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fake-service',
      XENDIT_SECRET_KEY: 'xnd_development_fake', XENDIT_WEBHOOK_TOKEN: 'expected-token'
    })[key] } }
  }, { 'npm:@supabase/supabase-js@2': { createClient: () => admin }, '../_shared/xendit.ts': shared });
  const request = token => new Request('https://example.test/webhook', {
    method: 'POST', headers: { 'x-callback-token': token }, body: JSON.stringify({
      event: 'payment_session.completed', data: { payment_session_id: 'ps-test', amount: 1, status: 'COMPLETED' }
    })
  });
  assert.equal((await handler(request('forged-token'))).status, 401);
  assert.equal(fetched, 0);
  assert.equal((await handler(request('expected-token'))).status, 200);
  assert.equal(fetched, 1);
  assert.equal(calls[0].args.p_amount, 300000, 'callback body is not trusted for the amount');
  assert.equal(calls[0].args.p_payment_id, 'py-verified');
  const legacyShape = new Request('https://example.test/webhook', { method: 'POST', headers: { 'x-callback-token': 'expected-token' },
    body: JSON.stringify({ event: 'payment_session.completed', data: { id: 'ps-test', reference_id: 'rm-real-order' } }) });
  assert.equal((await handler(legacyShape)).status, 200, 'dashboard/current webhook id variant is supported');
  const fixture = new Request('https://example.test/webhook', { method: 'POST', headers: { 'x-callback-token': 'expected-token' },
    body: JSON.stringify({ event: 'payment_session.completed', data: { id: 'ps-fixture', reference_id: 'dashboard-test' } }) });
  assert.equal((await handler(fixture)).status, 200, 'dashboard fixture is acknowledged without marking an order paid');
  const early = new Request('https://example.test/webhook', { method: 'POST', headers: { 'x-callback-token': 'expected-token' },
    body: JSON.stringify({ event: 'payment_session.completed', data: { id: 'ps-early', reference_id: 'rm-11111111-1111-4111-8111-111111111111' } }) });
  assert.equal((await handler(early)).status, 503, 'real early callbacks must retry instead of being discarded');
});

test('Payment endpoint refuses missing and invalid buyer sessions', async () => {
  let handler;
  const shared = loadServer('supabase/functions/_shared/xendit.ts');
  loadServer('supabase/functions/xendit-payment/index.ts', {
    Deno: { serve: fn => { handler = fn; }, env: { get: () => 'fake' } }
  }, {
    'npm:@supabase/supabase-js@2': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: null }, error: {} }) } }) },
    '../_shared/xendit.ts': shared
  });
  assert.equal((await handler(new Request('https://example.test/pay', { method: 'POST', body: '{}' }))).status, 401);
  assert.equal((await handler(new Request('https://example.test/pay', { method: 'POST', headers: { Authorization: 'Bearer fake' }, body: '{}' }))).status, 401);
});

test('Payment page handles pending, paid, expired and unsafe redirect results', async () => {
  const orderId = '11111111-1111-4111-8111-111111111111';
  async function page(result) {
    const elements = new Map();
    const element = id => {
      if (!elements.has(id)) elements.set(id, { hidden: true, textContent: '', addEventListener() {} });
      return elements.get(id);
    };
    let ready;
    const document = { hidden: false, addEventListener: (name, fn) => { if (name === 'DOMContentLoaded') ready = fn; } };
    const pageLocation = { search: '?order=' + orderId };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'payment.js'), 'utf8'), {
      document, window: { addEventListener() {} }, location: pageLocation,
      URLSearchParams, URL, $: element, rupiah: n => 'Rp' + n,
      setInterval: () => 1, clearInterval() {},
      Backend: { penggunaAktif: async () => ({ peran: 'Pembeli' }), pembayaranXendit: async () => result },
      supabaseClient: { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { total: 300000 } }) }) }) }) }
    });
    await ready();
    element.location = pageLocation;
    return element;
  }
  let p = await page({ status: 'ACTIVE', mode: 'test', paymentUrl: 'https://dev.xen.to/pay', expiresAt: '2026-10-05T12:00:00Z' });
  assert.equal(p('payment-pay').hidden, false);
  assert.equal(p('payment-test').hidden, false);
  assert.equal(p.location.href, undefined, 'pending payment stays on payment page');
  p = await page({ status: 'COMPLETED', mode: 'test' });
  assert.equal(p('payment-pay').hidden, true);
  assert.match(p('payment-description').textContent, /Tidak ada uang nyata/);
  assert.equal(p.location.href, 'keranjang.html?tab=pengiriman&order=' + orderId, 'verified payment opens its purchased items and shipment status');
  p = await page({ status: 'EXPIRED', mode: 'test' });
  assert.match(p('payment-description').textContent, /stok dikembalikan/);
  assert.equal(p.location.href, undefined, 'expired payment does not show a paid shipment');
  p = await page({ status: 'ACTIVE', mode: 'test', paymentUrl: 'https://attacker.test/pay' });
  assert.equal(p('payment-pay').hidden, true);
  assert.match(p('payment-error').textContent, /tidak valid/);
});

test('Bag separates cart and shipments, handles guests and confirms delivered items', async () => {
  function node() {
    return { hidden:false, children:[], attrs:{}, events:{}, classList:{add(){}}, append(...children){this.children.push(...children)}, replaceChildren(...children){this.children=children}, setAttribute(k,v){this.attrs[k]=v}, addEventListener(k,fn){this.events[k]=fn}, focus(){}, scrollIntoView(){} };
  }
  async function page(user, orders) {
    const elements=new Map(); const element=id=>{if(!elements.has(id)) elements.set(id,node()); return elements.get(id)};
    let ready, reads=0, confirmations=0;
    const doc={hidden:false,createTextNode:text=>({textContent:text}),addEventListener:(name,fn)=>{if(name==='DOMContentLoaded')ready=fn}};
    vm.runInNewContext(fs.readFileSync(path.join(root,'bag.js'),'utf8'),{
      document:doc,window:{addEventListener(){}},location:{search:'?tab=pengiriman'},URLSearchParams,Date,Number,
      $:element,elemen:(tag,cls,text)=>Object.assign(node(),{tag,className:cls,textContent:text}),rupiah:n=>'Rp'+n,
      setInterval:()=>1,clearInterval(){},Backend:{penggunaAktif:async()=>user,pengirimanSaya:async()=>{reads++;return orders},ubahStatusPesanan:async(id,pay,status)=>{assert.equal(status,'completed');assert.equal(pay,'confirmed');confirmations++}}
    });
    ready(); await new Promise(resolve=>setImmediate(resolve));
    return {element,reads:()=>reads,confirmations:()=>confirmations};
  }
  let p=await page(null,[]);
  assert.equal(p.reads(),0,'guests cannot request private shipment data');
  assert.equal(p.element('bag-cart-panel').hidden,true);
  assert.equal(p.element('bag-shipping-panel').hidden,false);
  assert.equal(p.element('shipment-message').children[1].href,'login.html');
  p=await page({peran:'Pembeli'},[]);
  assert.match(p.element('shipment-message').textContent,/Belum ada pesanan/);
  const item={product_id:1,item_name:'Tenun Senja',quantity:2,unit_price:350000};
  p=await page({peran:'Pembeli'},[{id:'order-test',created_at:'2026-10-05',order_status:'delivered',payment_status:'confirmed',order_items:[item],buyer_name:'Pembeli',shipping_address:'Alamat',total:700000}]);
  const card=p.element('shipment-orders').children[0];
  assert.equal(card.children[2].children[1].children[0].href,'produk.html?id=1','purchased items link to product details');
  const progress=card.children.find(x=>x.className==='shipment-progress');
  assert.equal(progress.children[3].attrs['aria-current'],'step','delivered step comes from server status');
  const actions=card.children.find(x=>x.className==='shipment-actions');
  await actions.children[0].events.click();
  assert.equal(p.confirmations(),1,'delivered paid orders can be marked received');
});

test('All page scripts parse and all local stylesheet/script references exist', () => {
  for (const file of fs.readdirSync(root).filter(f => f.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    for (const [, script] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(script, { filename: file });
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    assert.equal(ids.length, new Set(ids).size, file + ' must not have duplicate IDs');
    for (const [, src] of html.matchAll(/(?:src|href)="([^"#]+\.(?:js|css)(?:\?[^"#]*)?)"/g)) {
      if (/^https?:/.test(src)) continue;
      assert.equal(fs.existsSync(path.join(root, src.split('?')[0])), true, file + ' references ' + src);
    }
  }
});

test('PostgreSQL: checkout, permissions, payment verification and stock lifecycle', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
      create function auth.role() returns text language sql as $$ select current_setting('test.role', true) $$;
      create function public.is_admin() returns boolean language sql as $$ select current_setting('test.admin', true) = 'yes' $$;
      grant usage on schema auth to authenticated, anon, service_role;
      create table public.profiles(id uuid primary key);
      create table public.products(id bigint primary key, name text not null, price integer not null,
        description text, image_position text, image_url text, seller_id uuid references public.profiles(id));
      insert into public.profiles values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
      insert into public.products(id, name, price) values (1, 'Tenun Mawar', 150000), (2, 'Tenun Pesisir', 200000);
    `);
    for (const file of ['20261005000000_product_review_and_orders.sql', '20261005010000_buyer_receipt_confirmation.sql', '20261005020000_xendit_payment_sessions.sql']) {
      await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations', file), 'utf8'));
    }
    const user = '11111111-1111-4111-8111-111111111111';
    const other = '22222222-2222-4222-8222-222222222222';
    const request = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const items = JSON.stringify([{ product_id: 1, quantity: 2 }]);
    const context = async (role, admin = 'no') => db.query("select set_config('test.uid', $1, false), set_config('test.role', $2, false), set_config('test.admin', $3, false)", [user, role, admin]);
    await context('authenticated');
    const create = async (key = request, name = 'Pembeli') => (await db.query(
      "select public.create_checkout_order($1, $2, '081234567890', 'Jalan Mawar nomor 10, Bandung', 'QRIS', $3::jsonb) as id", [key, name, items])).rows[0].id;
    const id = await create();
    assert.equal(await create(), id, 'same checkout request returns the same order');
    const stock = async () => (await db.query('select stock from public.products where id = 1')).rows[0].stock;
    assert.equal(await stock(), 18, 'only one stock reservation');
    await assert.rejects(create(request, 'Changed buyer'), /tidak cocok/);
    await context('service_role');
    await assert.rejects(db.query('select claim_payment_session($1,$2)', [id, other]), /tidak ditemukan/);
    const claim = async () => (await db.query('select claim_payment_session($1,$2) as result', [id, user])).rows[0].result;
    assert.equal((await claim()).claimed, true);
    assert.equal((await claim()).claimed, false, 'a second request cannot create another session');
    const session = 'ps-testpaid';
    await db.query("update public.payment_sessions set session_id=$1, status='ACTIVE' where order_id=$2", [session, id]);
    const apply = (status, amount = 300000, reference = 'rm-' + id, payment = 'py-test') =>
      db.query('select apply_xendit_status($1,$2,$3,$4,$5,$6)', [session, reference, amount, 'IDR', status, payment]);
    await assert.rejects(apply('COMPLETED', 1), /tidak cocok/);
    await assert.rejects(apply('COMPLETED', 300000, 'wrong-order'), /tidak cocok/);
    await assert.rejects(apply('COMPLETED', 300000, 'rm-' + id, null), /Payment ID/);
    await context('authenticated');
    await assert.rejects(db.query("update public.orders set payment_status='confirmed' where id=$1", [id]), /otomatis/);
    await assert.rejects(db.query("update public.orders set order_status='cancelled' where id=$1", [id]), /tidak diizinkan/);
    await context('service_role');
    await apply('COMPLETED');
    await apply('COMPLETED');
    await apply('EXPIRED');
    let order = (await db.query('select payment_status,order_status from public.orders where id=$1', [id])).rows[0];
    assert.deepEqual(order, { payment_status: 'confirmed', order_status: 'checking' });
    assert.equal(await stock(), 18, 'late expiry cannot restock a paid order');
    await context('authenticated', 'yes');
    await db.query("update public.orders set order_status='packaging' where id=$1", [id]);
    await db.query("update public.orders set order_status='shipping' where id=$1", [id]);
    await db.query("update public.orders set order_status='delivered' where id=$1", [id]);
    await context('authenticated');
    await db.query("update public.orders set order_status='completed' where id=$1", [id]);
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select * from public.payment_sessions'), /permission denied/);
    await assert.rejects(db.query("select apply_xendit_status('ps-fake','fake',1,'IDR','COMPLETED','py-fake')"), /permission denied/);
    await db.exec('reset role');
    const expired = await create('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    assert.equal(await stock(), 16);
    await context('service_role');
    await db.query('select claim_payment_session($1,$2)', [expired, user]);
    await db.query("update public.payment_sessions set session_id='ps-expired', status='ACTIVE' where order_id=$1", [expired]);
    const expire = () => db.query("select apply_xendit_status('ps-expired',$1,300000,'IDR','EXPIRED',null)", ['rm-' + expired]);
    await expire(); await expire();
    assert.equal(await stock(), 18, 'duplicate expiry restocks exactly once');
    await assert.rejects(db.query("select apply_xendit_status('ps-unknown','fake',1,'IDR','COMPLETED','py-fake')"), /belum tersimpan/);
  } finally { await db.close(); }
});
