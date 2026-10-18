import { createClient } from 'npm:@supabase/supabase-js@2';
const cors = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS' };
const reply = (body:unknown,status=200) => new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
async function digest(text:string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),byte=>byte.toString(16).padStart(2,'0')).join('');
}
Deno.serve(async request => {
  if(request.method==='OPTIONS') return new Response('ok',{headers:cors});
  if(request.method!=='POST') return reply({error:'Metode tidak diizinkan.'},405);
  try {
    if(Number(request.headers.get('content-length')||0)>4096) return reply({error:'Data terlalu panjang.'},400);
    const raw=await request.text(); if(raw.length>4096) return reply({error:'Data terlalu panjang.'},400);
    const body=JSON.parse(raw);
    const name=typeof body.name==='string'?body.name.normalize('NFKC').trim().replace(/\s+/g,' '):'';
    const password=typeof body.password==='string'?body.password:'';
    if(!['register','login'].includes(body.action)) return reply({error:'Permintaan tidak valid.'},400);
    if(name.length<2||name.length>80||/[\u0000-\u001f\u007f@]/.test(name)) return reply({error:'Nama harus 2–80 karakter dan tidak mengandung @.'},400);
    if(password.length<8||password.length>100) return reply({error:'Kata sandi minimal 8 karakter.'},400);
    if(['admin','penjual1','user1','guest'].includes(name.toLowerCase())) return reply({error:body.action==='register'?'Nama ini sudah digunakan. Pilih nama lain.':'Gunakan tombol akses cepat untuk akun ini.'},400);
    const url=Deno.env.get('SUPABASE_URL')!;
    const email='buyer-'+(await digest(name.toLowerCase())).slice(0,48)+'@accounts.rumah-tenun.invalid';
    if(body.action==='register') {
      const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const ip=(request.headers.get('x-forwarded-for')||request.headers.get('x-real-ip')||'unknown').split(',')[0].trim();
      const {data:allowed,error:limitError}=await admin.rpc('claim_buyer_signup',{p_key:await digest(ip)});
      if(limitError) return reply({error:'Pendaftaran sementara belum tersedia. Coba lagi.'},503);
      if(!allowed) return reply({error:'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.'},429);
      const {error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:name,login_name:name}});
      if(error) return reply({error:error.code==='email_exists'||error.message.toLowerCase().includes('already')?'Nama ini sudah digunakan. Pilih nama lain.':'Akun belum dapat dibuat. Periksa nama dan kata sandi, lalu coba lagi.'},400);
      // The auth trigger always creates a buyer, regardless of supplied metadata or body role.
      return reply({loginEmail:email},201);
    }
    // The browser signs in through Supabase Auth, preserving its normal password checks and limits.
    return reply({loginEmail:email});
  } catch(_) { return reply({error:'Data pendaftaran tidak valid.'},400); }
});
