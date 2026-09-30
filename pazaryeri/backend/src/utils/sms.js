const axios = require('axios');
const { getIntegration } = require('./integrationSettings');
const { logSms } = require('./smsLog');

// Lokalusta'daki Netgsm SMS gonderiminin aynisi:
// GET https://api.netgsm.com.tr/sms/send/get/ (usercode, password, gsmno, message, msgheader)
// Netgsm "00 <bulkid>" / "01..." gibi 0 veya 1 ile baslayan bir kodla basari doner.
const sendSMS = async (phone, message, meta = {}) => {
  // Telefon numarasını temizle
  const cleanPhone = String(phone).replace(/\D/g, '').replace(/^0/, '90');

  try {
    let usercode = process.env.NETGSM_USERNAME;
    let password = process.env.NETGSM_PASSWORD;
    let msgheader = process.env.NETGSM_ORIGINATOR;
    try {
      const cfg = await getIntegration('netgsm');
      if (cfg.user) usercode = cfg.user;
      if (cfg.pass) password = cfg.pass;
      if (cfg.orig) msgheader = cfg.orig;
    } catch (e) { /* admin panelden kayit yoksa .env kullanilir */ }

    if (!usercode || !password) throw new Error('Netgsm bilgileri eksik (panelden Entegrasyonlar > Netgsm kaydedilmeli)');

    const response = await axios.get('https://api.netgsm.com.tr/sms/send/get/', {
      params: {
        usercode,
        password,
        gsmno: cleanPhone,
        message,
        msgheader,
        dil: 'TR',
      },
      timeout: 15000,
    });

    const result = response.data.toString().trim();
    // Netgsm 0 veya 1 ile başlayan kod döner (başarı)
    if (result.startsWith('0') || result.startsWith('1')) {
      console.log(`✅ SMS gönderildi: ${cleanPhone}`);
      logSms({ phone: cleanPhone, message, status: 'sent', ref: result.split(/\s+/)[1] || result, ...meta });
      return true;
    }

    throw new Error(`Netgsm hata kodu: ${result} (${netgsmHata(result)})`);
  } catch (err) {
    console.error('SMS gönderilemedi:', err.message);
    // Development'ta SMS gönderme, sadece logla
    if (process.env.NODE_ENV === 'development') {
      console.log(`📱 [DEV] SMS → ${cleanPhone}: ${message}`);
      logSms({ phone: cleanPhone, message, status: 'dev', ...meta });
      return true;
    }
    logSms({ phone: cleanPhone, message, status: 'error', error: err.message, ...meta });
    throw err;
  }
};

// Netgsm'in dokumante ettigi hata kodlarinin Turkce karsiliklari
function netgsmHata(code) {
  const c = String(code).slice(0, 2);
  return {
    '20': 'Mesaj metni hatalı veya çok uzun',
    '30': 'Geçersiz kullanıcı adı/şifre veya API erişim izni yok (IP kısıtı olabilir)',
    '40': 'SMS başlığı (originator) sistemde tanımlı değil',
    '50': 'Abone hesabıyla İYS kontrollü gönderim yapılamıyor',
    '51': 'İYS marka bilgisi bulunamadı',
    '70': 'Hatalı sorgulama, parametre eksik',
    '80': 'Gönderim sınırı aşıldı',
    '85': 'Mükerrer gönderim sınırı aşıldı',
  }[c] || 'bilinmeyen hata';
}

// Toplu gonderim: numaralari sirayla ve sinirli hizda gonderir, sonucu raporlar
const sendBulkSMS = async (phones, message, meta = {}) => {
  const uniq = [...new Set(phones.map(p => String(p).replace(/\D/g, '')).filter(p => p.length >= 10))];
  const result = { total: uniq.length, sent: 0, failed: 0, errors: [] };
  for (const p of uniq) {
    try { await sendSMS(p, message, { ...meta, bulk: true }); result.sent++; }
    catch (e) { result.failed++; if (result.errors.length < 10) result.errors.push({ phone: p, error: e.message }); }
    await new Promise(r => setTimeout(r, 120));
  }
  return result;
};

module.exports = { sendSMS, sendBulkSMS, netgsmHata };
