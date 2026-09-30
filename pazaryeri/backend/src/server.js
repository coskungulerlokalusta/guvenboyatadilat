require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => res.json({ success: true, service: 'markabahcem-api', time: new Date().toISOString() }));
app.use('/api/integrations', require('./routes/integrations'));
app.use('/api/sms', require('./routes/sms'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Bulunamadi' }));

// Pazaryeri arayuzu (pazaryeri/ klasoru) ayni sunucudan yayinlanir
// (backend/ klasoru ve gizli dosyalar disariya acilmaz)
const WEB = path.join(__dirname, '..', '..');
app.use('/backend', (req, res) => res.status(404).end());
app.use(express.static(WEB, { index: 'index.html', dotfiles: 'deny' }));

app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Sunucu hatasi' }); });

// Dis servislerle (iyzico, Netgsm) baglanti koptugunda kutuphanelerin soketlerinden gelen
// yakalanmamis ag hatalari tum sunucuyu dusurmesin: kaydedip calismaya devam ediyoruz.
// Ag disi beklenmeyen hatalarda ise surec yeniden baslatilmak uzere kapanir (pm2/systemd).
const NET_ERRORS = new Set(['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ESOCKETTIMEDOUT', 'ECONNABORTED']);
process.on('uncaughtException', (err) => {
  if (err && NET_ERRORS.has(err.code)) { console.error('Ag hatasi (sunucu calismaya devam ediyor):', err.code, err.message); return; }
  console.error('Beklenmeyen hata, surec kapaniyor:', err);
  process.exit(1);
});
process.on('unhandledRejection', (err) => { console.error('Yakalanmamis promise hatasi:', err && err.message ? err.message : err); });

const PORT = process.env.PORT || 8080;
if (!process.env.ADMIN_PANEL_KEY || process.env.ADMIN_PANEL_KEY.length < 12) console.warn('⚠️  ADMIN_PANEL_KEY tanimli degil veya 12 karakterden kisa: yonetim uclari kapali.');
app.listen(PORT, () => console.log(`MarkaBahçem API ${PORT} portunda çalışıyor`));
