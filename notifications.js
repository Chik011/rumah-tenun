async function initOrderNotifications(user,actions) {
  if(!user || !['Pembeli','Penjual'].includes(user.peran) || $('order-notifications'))return;
  const root=elemen('div','notification-wrapper');root.id='order-notifications';
  root.innerHTML='<button class="icon-btn notification-button" type="button" aria-label="Notifikasi pesanan" aria-expanded="false"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span class="notification-count" hidden></span></button><section class="notification-panel" aria-label="Notifikasi pesanan" hidden><div class="notification-heading"><strong>Notifikasi pesanan</strong><button type="button" class="notification-read-all">Tandai dibaca</button></div><div class="notification-items"></div><p class="notification-status" role="status"></p></section>';
  actions.prepend(root);
  const button=root.querySelector('.notification-button'),badge=root.querySelector('.notification-count'),panel=root.querySelector('.notification-panel'),list=root.querySelector('.notification-items'),status=root.querySelector('.notification-status');
  let busy=false,lastSignature='';
  const target=id=>user.peran==='Penjual'?'akun.html?view=orders&order='+encodeURIComponent(id):'keranjang.html?tab=pengiriman&order='+encodeURIComponent(id);
  async function refresh() {
    if(busy)return;busy=true;
    try {
      const result=await Backend.notifikasi();badge.textContent=result.count>99?'99+':String(result.count);badge.hidden=!result.count;button.setAttribute('aria-label','Notifikasi pesanan'+(result.count?', '+result.count+' belum dibaca':''));
      const signature=JSON.stringify(result.items);
      if(signature===lastSignature)return;
      lastSignature=signature;
      list.replaceChildren();status.textContent='';
      for(const item of result.items) {
        const a=elemen('a',item.read_at?'notification-item':'notification-item unread');a.href=target(item.order_id);
        a.append(elemen('strong','',item.title),elemen('span','',item.message),elemen('small','',new Date(item.created_at).toLocaleString('id-ID',{dateStyle:'short',timeStyle:'short'})));
        a.addEventListener('click',async e=>{e.preventDefault();try{await Backend.bacaNotifikasi(item.id);location.href=a.href;}catch(_){status.textContent='Belum dapat menandai notifikasi. Coba lagi.';}});list.append(a);
      }
      if(!result.items.length)status.textContent='Belum ada notifikasi pesanan.';
    }catch(_){status.textContent='Notifikasi belum dapat dimuat. Coba kembali.';}finally{busy=false;}
  }
  button.addEventListener('click',()=>{panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)refresh();});
  root.querySelector('.notification-read-all').addEventListener('click',async()=>{try{await Backend.bacaNotifikasi(null);await refresh();}catch(_){status.textContent='Notifikasi belum dapat diperbarui.';}});
  document.addEventListener('click',e=>{if(!root.contains(e.target)){panel.hidden=true;button.setAttribute('aria-expanded','false');}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){panel.hidden=true;button.setAttribute('aria-expanded','false');}});
  await refresh();
  const timer=setInterval(()=>{if(!document.hidden)refresh();},10000);
  const channel=supabaseClient.channel('order-alerts-'+user.id).on('postgres_changes',{event:'*',schema:'public',table:'order_notifications',filter:'recipient_id=eq.'+user.id},refresh).subscribe();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});window.addEventListener('orders-updated',refresh);
  window.addEventListener('pagehide',()=>{clearInterval(timer);supabaseClient.removeChannel(channel);},{once:true});
}
