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
  if (profileError || !['admin','seller'].includes(profile.role)) {
    return jsonResponse({ error: 'Akun ini tidak diizinkan mengunggah produk.' }, 403);
  }

  const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME');
  const apiKey = Deno.env.get('CLOUDINARY_API_KEY');
  const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET');
  if (!cloudName || !apiKey || !apiSecret) return jsonResponse({ error: 'Konfigurasi Cloudinary belum lengkap.' }, 500);

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'rumah-tenun/products';
  const signatureSource = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(signatureSource));
  const signature = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');

  return jsonResponse({ cloudName, apiKey, timestamp, folder, signature });
});
