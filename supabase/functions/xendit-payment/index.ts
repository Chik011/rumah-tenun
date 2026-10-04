import { createClient } from 'npm:@supabase/supabase-js@2';
import { GatewayError, paymentConfig, sessionIdentifier, sessionPayload, syncSession, validPaymentUrl, xenditRequest } from '../_shared/xendit.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Metode tidak diizinkan.' }, 405);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Silakan masuk terlebih dahulu.' }, 401);
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return json({ error: 'Sesi login tidak valid.' }, 401);
  let body: { action?: string; orderId?: string };
  try { body = await request.json(); } catch { return json({ error: 'Permintaan tidak valid.' }, 400); }
  if (body.action === 'ready') {
    try {
      const config = paymentConfig(key => Deno.env.get(key));
      if (!Deno.env.get('XENDIT_WEBHOOK_TOKEN')) throw new Error('Pembayaran belum tersedia. Hubungi pengelola toko.');
      return json({ ready: true, mode: config.mode });
    } catch { return json({ error: 'Pembayaran belum tersedia. Hubungi pengelola toko.' }, 503); }
  }
  if (!body.orderId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.orderId) ||
      !['create', 'status'].includes(body.action || '')) return json({ error: 'Permintaan tidak valid.' }, 400);

  try {
    const config = paymentConfig(key => Deno.env.get(key));
    const { data: order, error: orderError } = await admin.from('orders').select('*')
      .eq('id', body.orderId).eq('buyer_id', user.id).single();
    if (orderError || !order) return json({ error: 'Pesanan tidak ditemukan.' }, 404);
    if (order.payment_provider !== 'xendit') return json({ error: 'Pesanan ini menggunakan pembayaran manual.' }, 409);
    const { data: saved, error: savedError } = await admin.from('payment_sessions').select('*').eq('order_id', order.id).maybeSingle();
    if (savedError) throw new Error('Pembayaran belum dapat diperiksa.');
    if (saved?.session_id) {
      const remote = await xenditRequest(config.key, '/sessions/' + encodeURIComponent(saved.session_id));
      await syncSession(admin, remote, saved.session_id);
      return json({ orderId: order.id, status: remote.status,
        paymentUrl: validPaymentUrl(remote.payment_link_url) ? remote.payment_link_url : null,
        expiresAt: remote.expires_at, mode: order.payment_mode || config.mode });
    }
    if (body.action === 'status') return json({ orderId: order.id, status: saved ? 'CREATING' : 'NOT_CREATED', mode: config.mode });
    const { data: claim, error: claimError } = await admin.rpc('claim_payment_session', { p_order_id: order.id, p_buyer_id: user.id });
    if (claimError) return json({ error: 'Pesanan tidak dapat dibayar. Periksa status pesanan Anda.' }, 409);
    if (!claim.claimed) return json({ error: 'Pembayaran sedang disiapkan. Periksa lagi sebentar; jangan membuat pesanan baru.' }, 409);
    let remote;
    try {
      remote = await xenditRequest(config.key, '/sessions', sessionPayload(claim.order, claim.session.reference_id, config.site));
    } catch (error) {
      // Only a definitive validation/auth rejection can safely release the claim.
      if (error instanceof GatewayError && [400, 401, 403, 422].includes(error.status)) {
        const { error: cleanupError } = await admin.from('payment_sessions').delete().eq('order_id', order.id).eq('status', 'CREATING').is('session_id', null);
        if (cleanupError) throw new Error('Pembayaran perlu diperiksa oleh pengelola.');
      }
      throw error;
    }
    const remoteId = sessionIdentifier(remote);
    if (!remoteId || !/^ps-[a-zA-Z0-9-]+$/.test(remoteId) || remote.reference_id !== claim.session.reference_id ||
        Number(remote.amount) !== Number(order.total) || remote.currency !== 'IDR' ||
        !validPaymentUrl(remote.payment_link_url) || !Number.isFinite(Date.parse(remote.expires_at))) {
      throw new Error('Pembayaran perlu diperiksa oleh pengelola.');
    }
    const { error: saveError } = await admin.from('payment_sessions').update({ session_id: remoteId, status: 'ACTIVE' })
      .eq('order_id', order.id).eq('status', 'CREATING');
    if (saveError) throw new Error('Pembayaran perlu diperiksa oleh pengelola.');
    const { error: linkError } = await admin.from('orders').update({ payment_url: remote.payment_link_url,
      payment_expires_at: remote.expires_at, payment_mode: config.mode }).eq('id', order.id);
    if (linkError) throw new Error('Tautan pembayaran belum dapat disimpan. Periksa lagi dari pesanan Anda.');
    await syncSession(admin, remote, remoteId);
    return json({ orderId: order.id, status: remote.status, paymentUrl: remote.payment_link_url, expiresAt: remote.expires_at, mode: config.mode });
  } catch (error) {
    return json({ error: error instanceof Error && !(error instanceof TypeError) ? error.message : 'Pembayaran sedang tidak tersedia. Coba periksa pesanan Anda.' }, 503);
  }
});
