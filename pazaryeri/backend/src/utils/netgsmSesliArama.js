const { getIntegration } = require('./integrationSettings');
const axios = require('axios');

// Lokalusta'daki sesli arama modulunun aynisi.
// Netgsm'in resmi dokumantasyonundan DOGRULANMIS gercek istek formati:
// POST https://api.netgsm.com.tr/voicesms/send
// Basarili cevap duz metin olarak doner: "00 123456" (00=basarili, 123456=gorevID/bulkid)
// Hatali cevap sadece hata kodu doner (orn: "30", "40" gibi)
// MarkaBahcem'de kullanim: 48 saattir onaylanmayan siparislerde saticiyi otomatik aramak.
function xmlEsc(s) {
  return String(s == null ? '' : s).replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

async function sesliAramaBaslat({ telefon }) {
  try {
    const cfg = await getIntegration('netgsmses');
    if (!cfg.user || !cfg.pass || !cfg.audioid) {
      throw new Error('Netgsm Sesli Arama bilgileri eksik (panelden Entegrasyonlar > Netgsm Sesli Arama kaydedilmeli)');
    }

    // Numarayi Netgsm'in bekledigi formata getir (basinda 0/90 olmadan, 10 hane)
    const temizTel = String(telefon).replace(/\D/g, '').replace(/^90/, '').replace(/^0/, '');

    const xmlGovde = `<?xml version='1.0'?>
<mainbody>
    <header>
        <usercode>${xmlEsc(cfg.user)}</usercode>
        <password>${xmlEsc(cfg.pass)}</password>
    </header>
    <body>
        <audioid>${xmlEsc(cfg.audioid)}</audioid>
        <no>${xmlEsc(temizTel)}</no>
    </body>
</mainbody>`;

    const sonuc = await axios.post('https://api.netgsm.com.tr/voicesms/send', xmlGovde, {
      headers: { 'Content-Type': 'application/xml' },
      timeout: 15000,
    });

    const cevapMetni = String(sonuc.data).trim();
    if (!cevapMetni.startsWith('00')) {
      throw new Error('Netgsm hata kodu dondu: ' + cevapMetni);
    }

    const gorevId = cevapMetni.split(/\s+/)[1] || '';
    return { success: true, bulkid: gorevId, raw: cevapMetni };
  } catch (err) {
    const detay = err.response ? String(err.response.data).trim() : err.message;
    console.error('Netgsm sesli arama hatasi:', detay);
    return { success: false, error: detay };
  }
}

module.exports = { sesliAramaBaslat };
