const crypto = require('crypto');

// Yonetim panelinin gonderdigi x-admin-key basligini .env'deki ADMIN_PANEL_KEY ile
// sabit zamanli karsilastirir. Anahtar tanimli degilse yonetici uclari tamamen kapalidir.
function adminKeyCheck(req, res, next) {
  const expected = process.env.ADMIN_PANEL_KEY || '';
  const given = String(req.headers['x-admin-key'] || '');
  if (expected.length >= 12 && given.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return next();
  return res.status(401).json({ error: 'Yetkisiz erisim. Yonetim panelindeki sunucu anahtarini kontrol edin.' });
}

module.exports = { adminKeyCheck };
