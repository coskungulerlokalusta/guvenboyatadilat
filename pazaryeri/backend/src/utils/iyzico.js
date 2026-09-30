const Iyzipay = require('iyzipay');
const { getIntegration } = require('./integrationSettings');

// Iyzico istemcisini admin panelden kaydedilen (yoksa .env'deki) bilgilerle olusturur.
// Sunucu yeniden baslatilmadan, admin panelden anahtar degistirilince hemen gecerli olur.
// (Lokalusta paymentController.js'deki getIyzipayClient'in aynisi.)
async function getIyzipayClient() {
  let apiKey = process.env.IYZICO_API_KEY;
  let secretKey = process.env.IYZICO_SECRET_KEY;
  let uri = process.env.IYZICO_BASE_URL || 'https://sandbox-api.iyzipay.com';
  let cfg = {};
  try {
    cfg = await getIntegration('iyzico');
    if (cfg.apiKey) apiKey = cfg.apiKey;
    if (cfg.secretKey) secretKey = cfg.secretKey;
    if (cfg.env) uri = cfg.env === 'production' ? 'https://api.iyzipay.com' : 'https://sandbox-api.iyzipay.com';
  } catch (e) { /* admin panelden kayit yoksa .env kullanilir */ }
  if (!apiKey || !secretKey) return null;
  return { client: new Iyzipay({ apiKey, secretKey, uri }), cfg: { ...cfg, env: cfg.env || (uri.includes('sandbox') ? 'sandbox' : 'production') } };
}

// iyzipay'in callback tabanli fonksiyonlarini Promise'e cevirir
function call(fn, request) {
  return new Promise((resolve, reject) => {
    fn(request, (err, result) => {
      if (err) return reject(err);
      if (!result || result.status !== 'success') {
        const e = new Error((result && result.errorMessage) || 'Iyzico islemi basarisiz');
        e.code = result && result.errorCode;
        e.result = result;
        return reject(e);
      }
      resolve(result);
    });
  });
}

const money = n => (Math.round(Number(n) * 100) / 100).toFixed(2);

module.exports = { Iyzipay, getIyzipayClient, call, money };
