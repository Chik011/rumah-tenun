import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method tidak diizinkan.' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization) return jsonResponse({ error: 'Sesi login diperlukan.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const token = authorization.replace(/^Bearer\s+/i, '');
  const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
  if (userError || !user) return jsonResponse({ error: 'Sesi login tidak valid.' }, 401);

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profileError || profile.role !== 'admin') return jsonResponse({ error: 'Hanya admin yang dapat membuat akun penjual.' }, 403);

  let body: { email?: string; password?: string; displayName?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Data akun tidak valid.' }, 400);
  }

  const email = body.email?.trim().toLowerCase() || '';
  const password = body.password || '';
  const displayName = body.displayName?.trim() || '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonResponse({ error: 'Alamat email tidak valid.' }, 400);
  if (password.length < 10 || password.length > 100) return jsonResponse({ error: 'Kata sandi harus 10-100 karakter.' }, 400);
  if (displayName.length < 2 || displayName.length > 80) return jsonResponse({ error: 'Nama penjual harus 2-80 karakter.' }, 400);

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName }
  });
  if (createError || !created.user) return jsonResponse({ error: createError?.message || 'Gagal membuat akun.' }, 400);

  const { error: roleError } = await adminClient
    .from('profiles')
    .update({ display_name: displayName, role: 'seller' })
    .eq('id', created.user.id);
  if (roleError) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    return jsonResponse({ error: 'Akun penjual gagal disiapkan.' }, 500);
  }

  return jsonResponse({ id: created.user.id, email, displayName, role: 'seller' }, 201);
});
