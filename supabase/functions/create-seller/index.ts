// Legacy endpoint retired: members submit their products to the cooperative admin.
Deno.serve(request => new Response(request.method === 'OPTIONS' ? 'ok' : JSON.stringify({error:'Pendaftaran toko per anggota sudah ditutup. Produk dikelola terpusat oleh admin koperasi.'}), {
 status: request.method === 'OPTIONS' ? 200 : 410,
 headers: {'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'}
}));
