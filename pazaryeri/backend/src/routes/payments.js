const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { Iyzipay, getIyzipayClient, call, money } = require('../utils/iyzico');
const { adminKeyCheck } = require('../utils/adminAuth');

/* Odeme kayitlari (son 1000) — yonetim panelindeki "iyzico islemleri" listesi icin */
const LOG = path.join(__dirname, '..', '..', 'data', 'payments-log.json');
const readLog = () => { try { return JSON.parse(fs.readFileSync(LOG, 'utf8')); } catch (e) { return []; } };
const writeLog = (entry) => {
  const list = readLog();
  const i = list.findIndex(x => x.conversationId === entry.conversationId);
  if (i > -1) list[i] = { ...list[i], ...entry, updatedAt: new Date().toISOString() }; else list.unshift({ ...entry, createdAt: new Date().toISOString() });
  if (list.length > 1000) list.length = 1000;
  try { fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.writeFileSync(LOG, JSON.stringify(list)); } catch (e) { /* kayit yazilamasa da odeme etkilenmez */ }
};

const payLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Cok fazla odeme denemesi. Biraz sonra tekrar deneyin.' } });
const publicUrl = req => (process.env.PUBLIC_URL || (req.protocol + '://' + req.get('host'))).replace(/\/$/, '');
const clientIp = req => (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim().replace('::ffff:', '') || '85.34.78.112';

/* ---------- Herkese acik: odeme ayarlari (anahtarlar donmez) ---------- */
router.get('/config', async (req, res) => {
  const ctx = await getIyzipayClient();
  res.json({ success: true, enabled: !!ctx, env: ctx ? ctx.cfg.env : null, threeDS: ctx ? ctx.cfg.threeDS !== false && ctx.cfg.threeDS !== 'false' : true, marketplace: !!(ctx && (ctx.cfg.marketplace === true || ctx.cfg.marketplace === 'true')) });
});

/* ---------- Kart BIN'ine gore gercek taksit secenekleri ---------- */
router.post('/installments', payLimiter, async (req, res) => {
  try {
    const ctx = await getIyzipayClient();
    if (!ctx) return res.status(400).json({ error: 'Iyzico bagli degil' });
    const bin = String((req.body && req.body.bin) || '').replace(/\D/g, '').slice(0, 8);
    const price = Number(req.body && req.body.price);
    if (bin.length < 6 || !(price > 0)) return res.status(400).json({ error: 'Kart numarasinin ilk 6 hanesi ve tutar gerekli' });
    const r = await call(ctx.client.installmentInfo.retrieve.bind(ctx.client.installmentInfo), { locale: Iyzipay.LOCALE.TR, conversationId: 'inst-' + Date.now(), binNumber: bin, price: money(price) });
    const d = (r.installmentDetails || [])[0] || {};
    res.json({ success: true, bank: d.bankName, family: d.cardFamilyName, association: d.cardAssociation, type: d.cardType, force3ds: d.force3ds, options: (d.installmentPrices || []).map(x => ({ n: x.installmentNumber, total: Number(x.totalPrice), monthly: Number(x.installmentPrice) })) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* ---------- Odeme ----------
   ONEMLI: Siparis ve sepet su an tarayicida tutuldugu icin sepet tutarini istemci gonderiyor.
   Iyzico kalemlerin toplamini "price" ile karsilastirir, taksit farkini (paidPrice) ise
   burada iyzico'dan sorgulayarak biz hesapliyoruz. Siparisler sunucuya tasindiginda
   basket, siparis numarasindan veritabanindan okunmalidir (istemci tutarina guvenilmemeli). */
function buildRequest(req, body, cfg) {
  const { card = {}, buyer = {}, address = {}, basket = [], orderRef } = body;
  const items = basket.filter(i => Number(i.price) > 0);
  const price = items.reduce((a, i) => a + Math.round(Number(i.price) * 100), 0) / 100;
  if (!items.length || !(price > 0)) throw new Error('Sepet bos');
  if (!card.number || !card.cvc || !card.expMonth || !card.expYear) throw new Error('Kart bilgileri eksik');
  const [name, ...rest] = String(buyer.name || 'Musteri').trim().split(/\s+/);
  const marketplace = cfg.marketplace === true || cfg.marketplace === 'true';
  const addr = { contactName: address.contactName || buyer.name || 'Musteri', city: address.city || 'Istanbul', country: 'Turkey', address: [address.line, address.district].filter(Boolean).join(' ') || 'Istanbul', zipCode: address.zip || '34000' };
  return {
    locale: Iyzipay.LOCALE.TR,
    conversationId: String(orderRef || crypto.randomUUID()),
    price: money(price),
    paidPrice: money(price),
    currency: Iyzipay.CURRENCY.TRY,
    installment: String(Math.max(1, parseInt(body.installment, 10) || 1)),
    basketId: String(orderRef || 'MB-' + Date.now()),
    paymentChannel: Iyzipay.PAYMENT_CHANNEL.WEB,
    paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
    paymentCard: {
      cardHolderName: String(card.holder || buyer.name || '').slice(0, 60),
      cardNumber: String(card.number).replace(/\D/g, ''),
      expireMonth: String(card.expMonth).padStart(2, '0'),
      expireYear: String(card.expYear).length === 2 ? '20' + card.expYear : String(card.expYear),
      cvc: String(card.cvc),
      registerCard: '0'
    },
    buyer: {
      id: String(buyer.id || 'misafir'),
      name: name || 'Musteri',
      surname: rest.join(' ') || 'Musteri',
      email: buyer.email || 'musteri@markabahcem.com',
      identityNumber: buyer.identityNumber || '11111111111',
      registrationAddress: addr.address,
      ip: clientIp(req),
      city: addr.city,
      country: 'Turkey',
      gsmNumber: buyer.phone ? '+90' + String(buyer.phone).replace(/\D/g, '').replace(/^90/, '').replace(/^0/, '') : undefined
    },
    shippingAddress: addr,
    billingAddress: addr,
    basketItems: items.map((i, k) => {
      const it = { id: String(i.id || k + 1), name: String(i.name || 'Urun').slice(0, 100), category1: String(i.category || 'Genel').slice(0, 50), itemType: Iyzipay.BASKET_ITEM_TYPE.PHYSICAL, price: money(i.price) };
      // Pazaryeri modu: odemenin satici payi iyzico alt uye isyerine aktarilir
      if (marketplace && i.subMerchantKey) { it.subMerchantKey = i.subMerchantKey; it.subMerchantPrice = money(i.subMerchantPrice != null ? i.subMerchantPrice : i.price); }
      return it;
    })
  };
}

async function applyInstallmentPrice(ctx, request) {
  const n = +request.installment;
  if (n <= 1) return;
  const r = await call(ctx.client.installmentInfo.retrieve.bind(ctx.client.installmentInfo), { locale: Iyzipay.LOCALE.TR, conversationId: request.conversationId, binNumber: request.paymentCard.cardNumber.slice(0, 6), price: request.price });
  const opt = (((r.installmentDetails || [])[0] || {}).installmentPrices || []).find(x => +x.installmentNumber === n);
  if (!opt) throw new Error(n + ' taksit bu kart icin kullanilamiyor');
  request.paidPrice = money(opt.totalPrice);
}

const summary = r => ({ paymentId: r.paymentId, paidPrice: Number(r.paidPrice), installment: r.installment, cardAssociation: r.cardAssociation, cardFamily: r.cardFamily, lastFour: r.lastFourDigits, items: (r.itemTransactions || []).map(t => ({ itemId: t.itemId, paymentTransactionId: t.paymentTransactionId, price: Number(t.paidPrice) })) });

router.post('/pay', payLimiter, async (req, res) => {
  let request;
  try {
    const ctx = await getIyzipayClient();
    if (!ctx) return res.status(400).json({ error: 'Odeme sistemi henuz bagli degil' });
    request = buildRequest(req, req.body || {}, ctx.cfg);
    await applyInstallmentPrice(ctx, request);
    const use3ds = ctx.cfg.threeDS !== false && ctx.cfg.threeDS !== 'false';
    if (use3ds) {
      request.callbackUrl = publicUrl(req) + '/api/payments/3ds/callback';
      const r = await call(ctx.client.threedsInitialize.create.bind(ctx.client.threedsInitialize), request);
      writeLog({ conversationId: request.conversationId, status: 'pending3ds', price: +request.price, paidPrice: +request.paidPrice, installment: +request.installment, buyer: request.buyer.name + ' ' + request.buyer.surname, env: ctx.cfg.env });
      return res.json({ success: true, threeDS: true, html: Buffer.from(r.threeDSHtmlContent, 'base64').toString('utf8'), conversationId: request.conversationId });
    }
    // 3D'siz dogrudan odeme (Lokalusta'daki initiatePayment ile ayni cagri)
    const r = await call(ctx.client.payment.create.bind(ctx.client.payment), request);
    const s = summary(r);
    writeLog({ conversationId: request.conversationId, status: 'success', price: +request.price, ...s, buyer: request.buyer.name + ' ' + request.buyer.surname, env: ctx.cfg.env });
    res.json({ success: true, threeDS: false, conversationId: request.conversationId, ...s });
  } catch (err) {
    if (request) writeLog({ conversationId: request.conversationId, status: 'failed', price: +request.price, error: err.message, buyer: request.buyer.name + ' ' + request.buyer.surname });
    res.status(400).json({ error: err.message || 'Odeme basarisiz' });
  }
});

/* iyzico, banka dogrulamasindan sonra buraya form POST'u ile doner */
router.post('/3ds/callback', express.urlencoded({ extended: false }), async (req, res) => {
  const { status, paymentId, conversationData, conversationId, mdStatus } = req.body || {};
  const back = (q) => res.redirect(303, publicUrl(req) + '/#/payment-result?' + new URLSearchParams(q).toString());
  try {
    if (status !== 'success' || String(mdStatus) !== '1') throw new Error('3D Secure dogrulamasi basarisiz (mdStatus ' + (mdStatus || '-') + ')');
    const ctx = await getIyzipayClient();
    const r = await call(ctx.client.threedsPayment.create.bind(ctx.client.threedsPayment), { locale: Iyzipay.LOCALE.TR, conversationId, paymentId, conversationData });
    const s = summary(r);
    writeLog({ conversationId, status: 'success', ...s });
    back({ status: 'success', ref: conversationId, paymentId: s.paymentId, paid: s.paidPrice, inst: s.installment, last4: s.lastFour || '' });
  } catch (err) {
    writeLog({ conversationId, status: 'failed', error: err.message });
    back({ status: 'fail', ref: conversationId || '', msg: err.message });
  }
});

/* ---------- Yonetici uclari ---------- */
router.get('/log', adminKeyCheck, (req, res) => res.json({ success: true, log: readLog().slice(0, +req.query.limit || 100) }));

// Kalem bazli iade (paymentTransactionId ile)
router.post('/refund', adminKeyCheck, async (req, res) => {
  try {
    const ctx = await getIyzipayClient();
    if (!ctx) return res.status(400).json({ error: 'Iyzico bagli degil' });
    const { paymentTransactionId, price } = req.body || {};
    const r = await call(ctx.client.refund.create.bind(ctx.client.refund), { locale: Iyzipay.LOCALE.TR, conversationId: 'refund-' + Date.now(), paymentTransactionId: String(paymentTransactionId), price: money(price), currency: Iyzipay.CURRENCY.TRY, ip: clientIp(req) });
    res.json({ success: true, refundedPrice: Number(r.price) });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Gunun odemesini tamamen iptal (ayni gun icinde)
router.post('/cancel', adminKeyCheck, async (req, res) => {
  try {
    const ctx = await getIyzipayClient();
    if (!ctx) return res.status(400).json({ error: 'Iyzico bagli degil' });
    const r = await call(ctx.client.cancel.create.bind(ctx.client.cancel), { locale: Iyzipay.LOCALE.TR, conversationId: 'cancel-' + Date.now(), paymentId: String(req.body && req.body.paymentId), ip: clientIp(req) });
    writeLog({ conversationId: req.body.conversationId || r.paymentId, status: 'cancelled' });
    res.json({ success: true, price: Number(r.price) });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Pazaryeri modu: magazayi iyzico alt uye isyeri olarak kaydeder
router.post('/submerchant', adminKeyCheck, async (req, res) => {
  try {
    const ctx = await getIyzipayClient();
    if (!ctx) return res.status(400).json({ error: 'Iyzico bagli degil' });
    const b = req.body || {};
    const type = { PERSONAL: Iyzipay.SUB_MERCHANT_TYPE.PERSONAL, PRIVATE_COMPANY: Iyzipay.SUB_MERCHANT_TYPE.PRIVATE_COMPANY, LIMITED_OR_JOINT_STOCK_COMPANY: Iyzipay.SUB_MERCHANT_TYPE.LIMITED_OR_JOINT_STOCK_COMPANY }[b.type] || Iyzipay.SUB_MERCHANT_TYPE.PRIVATE_COMPANY;
    const request = {
      locale: Iyzipay.LOCALE.TR, conversationId: 'sm-' + Date.now(), subMerchantExternalId: 'store-' + b.storeId, subMerchantType: type,
      address: b.address, email: b.email, gsmNumber: b.gsm ? '+90' + String(b.gsm).replace(/\D/g, '').replace(/^90/, '').replace(/^0/, '') : undefined, name: b.name,
      iban: String(b.iban || '').replace(/\s/g, ''), currency: Iyzipay.CURRENCY.TRY
    };
    if (type === Iyzipay.SUB_MERCHANT_TYPE.PERSONAL) Object.assign(request, { contactName: b.contactName, contactSurname: b.contactSurname, identityNumber: b.identityNumber });
    else Object.assign(request, { taxOffice: b.taxOffice, legalCompanyTitle: b.legalCompanyTitle || b.name, ...(type === Iyzipay.SUB_MERCHANT_TYPE.PRIVATE_COMPANY ? { identityNumber: b.identityNumber } : { taxNumber: b.taxNumber }) });
    const r = await call(ctx.client.subMerchant.create.bind(ctx.client.subMerchant), request);
    res.json({ success: true, subMerchantKey: r.subMerchantKey });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

module.exports = router;
