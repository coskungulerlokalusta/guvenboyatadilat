const fs = require('fs');
const path = require('path');

// Admin panelden kaydedilen entegrasyon ayarlarini okur/yazar.
// Lokalusta'daki yapinin aynisi; tek fark Firestore yerine sunucudaki
// data/integrations.json dosyasini kullanmasi (veritabanina gecildiginde
// yalnizca bu dosyadaki iki fonksiyon degisir).
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'integrations.json');

// 30 saniyelik basit bellek-ici cache: her istekte diske gitmesin diye.
const cache = {};
const CACHE_MS = 30000;

function readAll() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { return {}; }
}

function writeAll(all) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(all, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, FILE);
}

async function getIntegration(service) {
  const now = Date.now();
  if (cache[service] && (now - cache[service].ts) < CACHE_MS) {
    return cache[service].data;
  }
  const data = readAll()['integration_' + service] || {};
  cache[service] = { data, ts: now };
  return data;
}

async function saveIntegration(service, values) {
  const all = readAll();
  const key = 'integration_' + service;
  all[key] = { ...(all[key] || {}), ...values, updatedAt: new Date().toISOString() };
  writeAll(all);
  clearIntegrationCache(service);
  return all[key];
}

function clearIntegrationCache(service) {
  delete cache[service];
}

module.exports = { getIntegration, saveIntegration, clearIntegrationCache };
