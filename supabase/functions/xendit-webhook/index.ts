import { createClient } from 'npm:@supabase/supabase-js@2';
import { paymentConfig, sessionIdentifier, syncSession, tokenEqual, xenditRequest } from '../_shared/xendit.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});

Deno.serve(async request => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const expected = Deno.env.get('XENDIT_WEBHOOK_TOKEN');
  const received = request.headers.get('x-callback-token');
  if (!expected) return json({ error: 'Webhook not configured' }, 503);
  if (!received || !await tokenEqual(received, expected)) return json({ error: 'Unauthorized' }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!['payment_session.completed', 'payment_session.expired'].includes(body.event)) return json({ received: true, ignored: true });
  const id = sessionIdentifier(body.data);
  if (typeof id !== 'string' || !/^ps-[a-zA-Z0-9-]+$/.test(id)) return json({ error: 'Invalid session' }, 400);
  try {
    const config = paymentConfig(key => Deno.env.get(key));
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: saved, error } = await admin.from('payment_sessions').select('session_id').eq('session_id', id).maybeSingle();
    if (error) return json({ error: 'Unable to read session; retry delivery' }, 503);
    if (!saved) {
      // The account can also emit dashboard fixtures or payments from other apps.
      // Our own references must retry if the create response has not been saved yet.
      if (!/^rm-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.data?.reference_id || '')) {
        return json({ received: true, ignored: true });
      }
      return json({ error: 'Session not stored yet; retry delivery' }, 503);
    }
    // Re-fetch from Xendit; a redirect or an untrusted callback body is never proof of payment.
    const remote = await xenditRequest(config.key, '/sessions/' + encodeURIComponent(id));
    await syncSession(admin, remote, id);
    return json({ received: true });
  } catch { return json({ error: 'Unable to reconcile payment; retry delivery' }, 503); }
});
