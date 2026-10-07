document.addEventListener('DOMContentLoaded', async () => {
  try {
    const id = Number(new URLSearchParams(location.search).get('id'));
    if (!Number.isSafeInteger(id) || id < 1) throw new Error('Panduan tidak ditemukan. Pilih materi dari ruang belajar.');
    const materi = (await Backend.ambilMateri()).find(item => item.id === id);
    if (!materi || !Array.isArray(materi.langkah) || !materi.langkah.length) throw new Error('Panduan ini belum tersedia. Silakan pilih materi lainnya.');
    document.title = materi.judul + ' — Benang-Mawar';
    $('guide-title').textContent = materi.judul;
    materi.langkah.forEach((text,index) => {
      const step = elemen('li','guide-step');
      const number = elemen('span','guide-step-number',String(index+1).padStart(2,'0'));
      number.setAttribute('aria-hidden','true');
      const content = elemen('div','guide-step-content');
      content.append(elemen('h2','','Langkah ' + (index+1)),elemen('p','',text));
      step.append(number,content);
      $('guide-steps').append(step);
    });
    $('guide-finish').hidden = false;
  } catch(error) {
    $('guide-title').textContent = 'Panduan belum dapat dibuka';
    $('guide-intro').hidden = true;
    $('guide-error').hidden = false;
    $('guide-error').textContent = error.message || 'Periksa koneksi Anda, lalu coba lagi.';
  }
});
