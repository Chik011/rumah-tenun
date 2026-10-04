export const paymentHosts = new Set(['xen.to', 'dev.xen.to', 'checkout.xendit.co', 'checkout-staging.xendit.co']);

export function sessionIdentifier(session: any): string | undefined {
  return session?.payment_session_id || session?.id;
}

export function validPaymentUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && paymentHosts.has(url.hostname);
  } catch { return false; }
}

export function paymentConfig(env: (key: string) => string | undefined) {
  const key = env('XENDIT_SECRET_KEY');
  const mode = env('XENDIT_MODE') || 'test';
  if (!key || !['test', 'live'].includes(mode) ||
      (mode === 'test' && !key.startsWith('xnd_development_')) ||
      (mode === 'live' && !key.startsWith('xnd_production_'))) {
    throw new Error('Pembayaran belum tersedia. Hubungi pengelola toko.');
  }
  const raw = env('SITE_URL');
  const site = raw ? new URL(raw) : null;
  if (site && (site.protocol !== 'https:' || site.username || site.password || site.search || site.hash)) {
    throw new Error('Alamat toko untuk pembayaran belum dikonfigurasi.');
  }
  return { key, mode, site: site ? site.toString().replace(/\/$/, '') : null };
}

export function sessionPayload(order: { id: string; total: number }, reference: string, site: string | null) {
  return {
    reference_id: reference, session_type: 'PAY', mode: 'PAYMENT_LINK',
    capture_method: 'AUTOMATIC', allow_save_payment_method: 'DISABLED',
    amount: Number(order.total), currency: 'IDR', country: 'ID', locale: 'id',
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    description: 'Rantai Mawar · Pesanan #' + order.id.slice(0, 8).toUpperCase(),
    ...(site ? {
      success_return_url: `${site}/pembayaran.html?order=${order.id}`,
      cancel_return_url: `${site}/pembayaran.html?order=${order.id}&kembali=1`
    } : {})
  };
}

export async function tokenEqual(a: string, b: string) {
  const hash = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const [left, right] = await Promise.all([hash(a), hash(b)]);
  let result = 0;
  for (let i = 0; i < left.length; i++) result |= left[i] ^ right[i];
  return result === 0;
}

export class GatewayError extends Error {
  constructor(public status: number) { super('Layanan pembayaran sedang tidak tersedia. Coba lagi dari pesanan Anda.'); }
}

export async function xenditRequest(key: string, path: string, payload?: unknown) {
  const response = await fetch('https://api.xendit.co' + path, {
    method: payload ? 'POST' : 'GET',
    headers: { Authorization: 'Basic ' + btoa(key + ':'), 'Content-Type': 'application/json' },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new GatewayError(response.status);
  return response.json();
}

export async function syncSession(admin: any, session: any, expectedId: string) {
  if (sessionIdentifier(session) !== expectedId || session.session_type !== 'PAY' ||
      session.capture_method === 'MANUAL' || !Number.isSafeInteger(session.amount) || session.currency !== 'IDR') {
    throw new Error('Data pembayaran tidak sesuai.');
  }
  const { error } = await admin.rpc('apply_xendit_status', {
    p_session_id: expectedId, p_reference_id: session.reference_id, p_amount: session.amount,
    p_currency: session.currency, p_status: session.status, p_payment_id: session.payment_id || null
  });
  if (error) throw new Error('Status pembayaran belum dapat disimpan. Coba periksa kembali.');
}
