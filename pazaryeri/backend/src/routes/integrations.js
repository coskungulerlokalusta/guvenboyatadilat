const express = require('express');
const router = express.Router();
const { getIntegration, saveIntegration } = require('../utils/integrationSettings');
const { sendSMS } = require('../utils/sms');
const { adminKeyCheck } = require('../utils/adminAuth');

// Lokalusta routes/integrations.js'in MarkaBahcem uyarlamasi.
// Tum uclar yonetim paneli anahtariyla korunur.
router.use(adminKeyCheck);

const SERVICES = {
  iyzico: ['apiKey', 'secretKey', 'env', 'threeDS', 'marketplace'],
  netgsm: ['user', 'pass', 'orig', 'testPhone'],
  netgsmses: ['user', 'pass', 'audioid', 'testPhone'],
  smstemplates: ['templates', 'events', 'voiceLateOrder', 'otpOnRegister'],
  smtp: ['host', 'port', 'user', 'pass', 'from', 'name', 'testEmail'],
};
const SECRET = ['secretKey', 'pass', 'apiKey'];

// Entegrasyon bilgilerini kaydet
router.post('/:service', async (req, res) => {
  try {
    const allowed = SERVICES[req.params.service];
    if (!allowed) return res.status(404).json({ error: 'Bilinmeyen servis' });
    // Kopyala-yapistirdan gelen fazladan bosluk/satir karakterlerini temizle.
    // Bos gonderilen gizli alanlar mevcut degeri silmesin (panel maskeli gosterir).
    const temizVeri = {};
    allowed.forEach((k) => {
      if (!(k in req.body)) return;
      const v = typeof req.body[k] === 'string' ? req.body[k].trim() : req.body[k];
      if (SECRET.includes(k) && (v === '' || /^•+/.test(String(v)))) return;
      temizVeri[k] = v;
    });
    await saveIntegration(req.params.service, temizVeri);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Baglanti durumu + formu doldurmak icin maskeli degerler (gizli degerler geri donmez)
router.get('/:service/status', async (req, res) => {
  try {
    const allowed = SERVICES[req.params.service];
    if (!allowed) return res.status(404).json({ error: 'Bilinmeyen servis' });
    const data = await getIntegration(req.params.service);
    const values = {};
    allowed.forEach((k) => {
      if (data[k] == null) return;
      values[k] = SECRET.includes(k) ? '••••••' + String(data[k]).slice(-4) : data[k];
    });
    const connected = req.params.service === 'iyzico' ? !!(data.apiKey && data.secretKey)
      : req.params.service === 'netgsmses' ? !!(data.user && data.pass && data.audioid)
      : req.params.service === 'smtp' ? !!(data.host && data.user && data.pass)
      : Object.keys(data).filter(k => k !== 'updatedAt').length > 0;
    res.json({ success: true, connected, values, updatedAt: data.updatedAt || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Gercek baglanti testi
router.post('/:service/test', async (req, res) => {
  const service = req.params.service;
  try {
    if (service === 'netgsm') {
      const cfg = await getIntegration('netgsm');
      if (!cfg.user || !cfg.pass) return res.status(400).json({ error: 'Once bilgileri kaydedin' });
      const hedef = (req.body && req.body.phone) || cfg.testPhone || cfg.user;
      await sendSMS(hedef, 'MarkaBahcem test mesaji - baglanti calisiyor.', { event: 'test' });
      return res.json({ success: true, message: 'Test SMS gonderildi (' + hedef + '), telefonunuzu kontrol edin.' });
    }

    if (service === 'netgsmses') {
      const cfg = await getIntegration('netgsmses');
      if (!cfg.user || !cfg.pass || !cfg.audioid) return res.status(400).json({ error: 'Once bilgileri kaydedin (kullanici, sifre, AudioID)' });
      const { sesliAramaBaslat } = require('../utils/netgsmSesliArama');
      const sonuc = await sesliAramaBaslat({ telefon: (req.body && req.body.phone) || cfg.testPhone || cfg.user });
      if (!sonuc.success) return res.status(400).json({ error: sonuc.error });
      return res.json({ success: true, message: 'Test araması başlatıldı. Görev no: ' + sonuc.bulkid });
    }

    if (service === 'iyzico') {
      const { getIyzipayClient, call, Iyzipay } = require('../utils/iyzico');
      const ctx = await getIyzipayClient();
      if (!ctx) return res.status(400).json({ error: 'Once bilgileri kaydedin' });
      try {
        await call(ctx.client.binNumber.retrieve.bind(ctx.client.binNumber), { locale: Iyzipay.LOCALE.TR, binNumber: '554960', conversationId: 'test-' + Date.now() });
        return res.json({ success: true, message: 'Iyzico baglantisi dogrulandi (' + (ctx.cfg.env === 'production' ? 'Canlı' : 'Sandbox') + ').' });
      } catch (e) {
        return res.status(400).json({ error: e.message || 'Iyzico anahtarlari gecersiz' });
      }
    }

    if (service === 'smtp') {
      const { getTransporter } = require('../utils/mailer');
      const t = await getTransporter();
      if (!t) return res.status(400).json({ error: 'Once SMTP bilgilerini kaydedin' });
      const hedef = (req.body && req.body.email) || t.ayar.testEmail || t.ayar.user;
      try {
        await t.transporter.sendMail({ from: `"${t.ayar.name}" <${t.ayar.from || t.ayar.user}>`, to: hedef, subject: 'MarkaBahçem - Test Maili', text: 'Bu bir test mailidir. SMTP baglantiniz calisiyor!' });
        return res.json({ success: true, message: 'Test maili gonderildi: ' + hedef });
      } catch (e) { return res.status(400).json({ error: 'Mail gonderilemedi: ' + e.message }); }
    }

    const cfg = await getIntegration(service);
    if (Object.keys(cfg).length === 0) return res.status(400).json({ error: 'Once bilgileri kaydedin' });
    res.json({ success: true, message: 'Bilgiler kayitli. Bu servis icin otomatik test yok.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
