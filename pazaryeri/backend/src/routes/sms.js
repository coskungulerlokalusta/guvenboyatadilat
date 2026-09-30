const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { sendSMS, sendBulkSMS } = require('../utils/sms');
const { sesliAramaBaslat } = require('../utils/netgsmSesliArama');
const { getIntegration } = require('../utils/integrationSettings');
const { getLog } = require('../utils/smsLog');
const { adminKeyCheck } = require('../utils/adminAuth');

const cleanPhone = p => String(p || '').replace(/\D/g, '').replace(/^90/, '').replace(/^0/, '');
const validPhone = p => /^5\d{9}$/.test(cleanPhone(p));

/* ---------- Herkese acik: telefon dogrulama (OTP) ---------- */
// Kodlar yalnizca bellekte, hash'lenmis olarak ve 3 dakika tutulur.
const otps = new Map();
const otpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false, message: { error: 'Cok fazla deneme. 15 dakika sonra tekrar deneyin.' } });
const hash = s => crypto.createHash('sha256').update(String(s)).digest('hex');

router.post('/otp/send', otpLimiter, async (req, res) => {
  try {
    const phone = cleanPhone(req.body && req.body.phone);
    if (!validPhone(phone)) return res.status(400).json({ error: 'Gecerli bir cep telefonu girin (5XX XXX XX XX)' });
    const prev = otps.get(phone);
    if (prev && Date.now() - prev.sentAt < 60000) return res.status(429).json({ error: 'Yeni kod icin 1 dakika bekleyin' });
    const code = String(crypto.randomInt(100000, 1000000));
    otps.set(phone, { h: hash(phone + code), exp: Date.now() + 180000, tries: 0, sentAt: Date.now() });
    await sendSMS(phone, `MarkaBahcem dogrulama kodunuz: ${code}. Kodu kimseyle paylasmayin.`, { event: 'otp' });
    res.json({ success: true, expiresIn: 180 });
  } catch (err) {
    res.status(500).json({ error: 'SMS gonderilemedi: ' + err.message });
  }
});

router.post('/otp/verify', otpLimiter, (req, res) => {
  const phone = cleanPhone(req.body && req.body.phone);
  const code = String((req.body && req.body.code) || '');
  const rec = otps.get(phone);
  if (!rec || rec.exp < Date.now()) { otps.delete(phone); return res.status(400).json({ error: 'Kodun suresi doldu, yeni kod isteyin' }); }
  if (++rec.tries > 5) { otps.delete(phone); return res.status(400).json({ error: 'Cok fazla hatali deneme, yeni kod isteyin' }); }
  if (rec.h !== hash(phone + code)) return res.status(400).json({ error: 'Kod hatali' });
  otps.delete(phone);
  res.json({ success: true });
});
setInterval(() => { const now = Date.now(); for (const [k, v] of otps) if (v.exp < now) otps.delete(k); }, 60000).unref();

/* ---------- Siparis olayi SMS'i (gecici) ----------
   Siparisler su an tarayicida tutuldugu icin olay SMS'leri istemciden tetiklenir.
   Kotuye kullanimi onlemek icin varsayilan KAPALIDIR (.env ALLOW_CLIENT_ORDER_SMS=true),
   mesaj metni sunucudaki sablondan uretilir ve siki hiz siniri uygulanir.
   Siparisler sunucuya tasindiginda bu uc kaldirilip SMS siparis API'sinden gonderilmelidir. */
const eventLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
router.post('/order-event', eventLimiter, async (req, res) => {
  if (process.env.ALLOW_CLIENT_ORDER_SMS !== 'true') return res.status(403).json({ error: 'Istemci kaynakli siparis SMS gonderimi kapali' });
  try {
    const { event, phone, vars = {} } = req.body || {};
    if (!validPhone(phone)) return res.status(400).json({ error: 'Gecersiz telefon' });
    const cfg = await getIntegration('smstemplates');
    if (!cfg.events || !cfg.events[event] || !cfg.templates || !cfg.templates[event]) return res.status(400).json({ error: 'Bu olay icin SMS kapali' });
    const safe = v => String(v == null ? '' : v).replace(/[^\p{L}\p{N} .,#:\-/]/gu, '').slice(0, 60);
    const msg = cfg.templates[event].replace(/\{(\w+)\}/g, (_, k) => safe(vars[k]));
    await sendSMS(phone, msg.slice(0, 480), { event });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ---------- Yonetici uclari ---------- */
router.post('/send', adminKeyCheck, async (req, res) => {
  try {
    const { phone, message } = req.body || {};
    if (!validPhone(phone) || !message) return res.status(400).json({ error: 'Telefon ve mesaj gerekli' });
    await sendSMS(phone, String(message).slice(0, 900), { event: req.body.event || 'manual' });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/bulk', adminKeyCheck, async (req, res) => {
  try {
    const { phones, message } = req.body || {};
    if (!Array.isArray(phones) || !phones.length || !message) return res.status(400).json({ error: 'Alici listesi ve mesaj gerekli' });
    if (phones.length > 5000) return res.status(400).json({ error: 'Tek seferde en fazla 5000 alici' });
    const r = await sendBulkSMS(phones.filter(validPhone), String(message).slice(0, 900), { event: 'bulk' });
    res.json({ success: true, ...r });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/voice', adminKeyCheck, async (req, res) => {
  const { phone } = req.body || {};
  if (!validPhone(phone)) return res.status(400).json({ error: 'Gecersiz telefon' });
  const r = await sesliAramaBaslat({ telefon: phone });
  if (!r.success) return res.status(400).json({ error: r.error });
  res.json({ success: true, bulkid: r.bulkid });
});

router.get('/log', adminKeyCheck, (req, res) => res.json({ success: true, log: getLog(+req.query.limit || 100) }));

module.exports = router;
