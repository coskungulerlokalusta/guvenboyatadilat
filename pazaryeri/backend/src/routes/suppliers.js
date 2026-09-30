const express = require('express');
const axios = require('axios');
const router = express.Router();
const { adminKeyCheck } = require('../utils/adminAuth');
const { sendSMS } = require('../utils/sms');
const { sendMail } = require('../utils/mailer');

// Tedarikci (XML bayilik) islemleri. Tum uclar yonetim paneli anahtariyla korunur.
router.use(adminKeyCheck);

const isPublicHttpUrl = (u) => {
  try {
    const x = new URL(u);
    if (!['http:', 'https:'].includes(x.protocol)) return false;
    // Sunucunun kendi ic agina istek atilmasini engelle
    return !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|\[?::1\]?)/i.test(x.hostname);
  } catch (e) { return false; }
};

// Bayinin XML'ini sunucu tarafinda indirir (tarayicidan CORS engeline takilmamak icin)
router.post('/xml-fetch', async (req, res) => {
  const url = String((req.body && req.body.url) || '').trim();
  if (!isPublicHttpUrl(url)) return res.status(400).json({ error: 'Gecerli bir http(s) XML adresi girin' });
  try {
    const r = await axios.get(url, {
      timeout: 60000, maxContentLength: 50 * 1024 * 1024, responseType: 'text', transformResponse: x => x,
      headers: { 'User-Agent': 'MarkaBahcem-XML/1.0', Accept: 'application/xml,text/xml,*/*' },
      auth: req.body.user ? { username: req.body.user, password: req.body.pass || '' } : undefined,
    });
    const text = String(r.data || '');
    if (!/<[a-z?!]/i.test(text.slice(0, 2000))) return res.status(400).json({ error: 'Adres XML dondurmedi' });
    res.json({ success: true, text, size: text.length });
  } catch (err) {
    res.status(400).json({ error: 'XML indirilemedi: ' + (err.response ? 'HTTP ' + err.response.status : err.message) });
  }
});

// Tedarik siparisini bayiye iletir: e-posta, SMS ya da bayinin API'sine JSON
router.post('/forward', async (req, res) => {
  const { method, to, subject, text, url, token, payload } = req.body || {};
  try {
    if (method === 'email') {
      if (!to || !text) return res.status(400).json({ error: 'Alici e-posta ve mesaj gerekli' });
      await sendMail({ to, subject: subject || 'Yeni siparis', text });
      return res.json({ success: true, message: 'E-posta gonderildi: ' + to });
    }
    if (method === 'sms') {
      if (!to || !text) return res.status(400).json({ error: 'Telefon ve mesaj gerekli' });
      await sendSMS(to, String(text).slice(0, 900), { event: 'supplierOrder' });
      return res.json({ success: true, message: 'SMS gonderildi' });
    }
    if (method === 'api') {
      if (!isPublicHttpUrl(url)) return res.status(400).json({ error: 'Gecerli bir API adresi girin' });
      const r = await axios.post(url, payload || {}, { timeout: 20000, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, validateStatus: () => true });
      if (r.status >= 400) return res.status(400).json({ error: 'Bayi API hatasi: HTTP ' + r.status, detay: typeof r.data === 'string' ? r.data.slice(0, 300) : r.data });
      return res.json({ success: true, message: 'Bayi API siparisi aldi (HTTP ' + r.status + ')', detay: r.data });
    }
    res.status(400).json({ error: 'Bilinmeyen iletim yontemi' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
