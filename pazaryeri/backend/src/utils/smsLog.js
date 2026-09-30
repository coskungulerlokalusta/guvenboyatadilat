const fs = require('fs');
const path = require('path');

// Gonderilen SMS'lerin son 500 kaydi (yonetim panelindeki SMS gecmisi icin)
const FILE = path.join(__dirname, '..', '..', 'data', 'sms-log.json');
let buf = null;

function load() {
  if (buf) return buf;
  try { buf = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { buf = []; }
  return buf;
}

function logSms(entry) {
  const list = load();
  list.unshift({ ...entry, phone: maskPhone(entry.phone), createdAt: new Date().toISOString() });
  if (list.length > 500) list.length = 500;
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(list)); } catch (e) { /* log yazilamasa da gonderim etkilenmez */ }
}

function maskPhone(p) {
  const s = String(p || '');
  return s.length > 6 ? s.slice(0, s.length - 7) + '***' + s.slice(-4) : s;
}

function getLog(limit = 100) { return load().slice(0, limit); }

module.exports = { logSms, getLog };
