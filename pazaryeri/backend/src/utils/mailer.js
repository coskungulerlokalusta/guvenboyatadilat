const nodemailer = require('nodemailer');
const { getIntegration } = require('./integrationSettings');

// Lokalusta utils/mailer.js'teki getTransporter ile ayni mantik:
// SMTP bilgileri yonetim panelinden (Entegrasyonlar > SMTP) okunur.
async function getTransporter() {
  const ayar = await getIntegration('smtp');
  if (!ayar.host || !ayar.user || !ayar.pass) return null;
  const port = Number(ayar.port) || 587;
  const transporter = nodemailer.createTransport({
    host: ayar.host,
    port,
    secure: port === 465,
    auth: { user: ayar.user, pass: ayar.pass },
    connectionTimeout: 15000,
  });
  return { transporter, ayar: { ...ayar, name: ayar.name || 'MarkaBahçem' } };
}

async function sendMail({ to, subject, text, html, replyTo }) {
  const t = await getTransporter();
  if (!t) throw new Error('SMTP bilgileri eksik (panelden Entegrasyonlar > E-posta kaydedilmeli)');
  return t.transporter.sendMail({ from: `"${t.ayar.name}" <${t.ayar.from || t.ayar.user}>`, to, subject, text, html, replyTo });
}

module.exports = { getTransporter, sendMail };
