/* MarkaBahçem — dış servis bağlantıları: sunucu API, iyzico ödeme, Netgsm SMS ve sesli arama
   Lokalusta yönetim panelindeki "Entegrasyonlar" ekranının aynısı. Sunucu (pazaryeri/backend)
   çalışıyorsa gerçek istekler gönderilir; çalışmıyorsa (statik önizleme) demo modunda kalır. */
(function () {
  'use strict';
  const C = window.Carsim;
  const { U, Svc, K, Auth, DB, Router, Modal, Store } = C;
  const esc = U.esc;
  const go = p => Router.go(p);
  const A = C.AdminPages, P = C.Pages;

  /* =====================================================================
     SUNUCU API İSTEMCİSİ
     ===================================================================== */
  const Api = C.Api = {
    online: false, checked: false, cfg: { enabled: false },
    base() { return (Store.get('mb_api_base') || '').replace(/\/$/, ''); },
    key() { return Store.get('mb_admin_key') || ''; },
    async req(method, path, body, admin = false) {
      const h = { 'Content-Type': 'application/json' };
      if (admin) h['x-admin-key'] = this.key();
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
      let r;
      try { r = await fetch(this.base() + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal }); }
      catch (e) { throw new Error('Sunucuya ulaşılamadı'); } finally { clearTimeout(t); }
      let j = {}; try { j = await r.json(); } catch (e) { /* JSON değil */ }
      if (!r.ok || j.success === false) throw new Error(j.error || ('Sunucu hatası (' + r.status + ')'));
      return j;
    },
    async check() {
      try {
        const ctl = new AbortController(); setTimeout(() => ctl.abort(), 4000);
        const r = await fetch(this.base() + '/api/health', { signal: ctl.signal });
        const j = await r.json();
        this.online = !!j.success;
        if (this.online) { try { this.cfg = await this.req('GET', '/api/payments/config'); } catch (e) { this.cfg = { enabled: false }; } }
      } catch (e) { this.online = false; }
      this.checked = true;
      return this.online;
    }
  };

  /* =====================================================================
     AYARLAR (demo modunda tarayıcıda, sunucu varken sunucuda)
     ===================================================================== */
  const DEF_TEMPLATES = {
    orderPlaced: 'Merhaba {ad}, #{siparisNo} numarali siparisiniz alindi. Toplam: {tutar}. Siparisinizi markabahcem.com/hesabim adresinden takip edebilirsiniz.',
    sellerNewOrder: 'MarkaBahcem: {magaza} magazaniza #{siparisNo} numarali yeni siparis geldi ({tutar}). Lutfen satici panelinden onaylayin.',
    shipped: 'Merhaba {ad}, #{siparisNo} siparisinizdeki {magaza} paketiniz kargoya verildi. {kargo} takip no: {takipNo}',
    delivered: 'Merhaba {ad}, #{siparisNo} siparisiniz teslim edildi. Urunu degerlendirmeyi unutmayin!',
    cancelled: 'Merhaba {ad}, #{siparisNo} siparisinizdeki {magaza} paketi iptal edildi. Odemeniz 1-3 is gunu icinde iade edilecek.',
    returned: 'Merhaba {ad}, #{siparisNo} siparisiniz icin iadeniz onaylandi. Ucret iadesi baslatildi.',
    storeApproved: 'Tebrikler {ad}! {magaza} magazaniz MarkaBahcem\'de onaylandi. Urunlerinizi satici panelinden ekleyebilirsiniz.'
  };
  const EVENTS = [
    ['orderPlaced', '🧾', 'Sipariş alındı', 'Müşteriye'], ['sellerNewOrder', '🛒', 'Yeni sipariş', 'Satıcıya'], ['shipped', '🚚', 'Kargoya verildi', 'Müşteriye'],
    ['delivered', '✅', 'Teslim edildi', 'Müşteriye'], ['cancelled', '✕', 'Sipariş iptali', 'Müşteriye'], ['returned', '↩️', 'İade onayı', 'Müşteriye'], ['storeApproved', '🏪', 'Mağaza onayı', 'Satıcıya']
  ];
  const VARS = ['{ad}', '{siparisNo}', '{tutar}', '{magaza}', '{kargo}', '{takipNo}'];
  const smsCfg = () => {
    const s = DB.settings;
    s.sms = s.sms || {};
    s.sms.templates = Object.assign({}, DEF_TEMPLATES, s.sms.templates);
    s.sms.events = Object.assign({ orderPlaced: true, sellerNewOrder: true, shipped: true, delivered: true, cancelled: true, returned: true, storeApproved: true }, s.sms.events);
    return s.sms;
  };
  const localInt = name => { const s = DB.settings; s.integrations = s.integrations || {}; return s.integrations[name] || (s.integrations[name] = {}); };
  // GSM 7-bit karakter seti dışındaki (ç, ğ, ı, ş …) karakterler SMS'i 70 karakterlik parçalara böler
  const smsParts = t => { const uni = /[^\x20-\x7EÄÖÜäöüé\n]/.test(t); const one = uni ? 70 : 160, multi = uni ? 67 : 153; return { len: t.length, parts: t.length <= one ? 1 : Math.ceil(t.length / multi), uni }; };
  const mask = p => { const s = String(p || '').replace(/\D/g, ''); return s.length > 6 ? s.slice(0, s.length - 7) + '***' + s.slice(-4) : s; };
  /** Ağ/erişim hatalarını anlaşılır Türkçe açıklamaya çevirir */
  const friendly = m => {
    m = String(m || '');
    if (/tunnel|ENOTFOUND|EAI_AGAIN|ECONNRE|ETIMEDOUT|socket hang up|timeout|statusCode=403|status code 403/i.test(m)) return `Sunucu karşı servise bağlanamadı. Sunucunun internete çıkışını, güvenlik duvarını ve (Netgsm için) IP izin listesini kontrol edin. Teknik ayrıntı: ${m}`;
    if (/status code 401|Invalid signature|api key/i.test(m)) return `Anahtarlar geçersiz görünüyor. Teknik ayrıntı: ${m}`;
    return m;
  };
  C.friendlyError = friendly;
  const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] != null ? vars[k] : '');

  /* =====================================================================
     SMS
     ===================================================================== */
  const Sms = C.Sms = {
    EVENTS, DEF_TEMPLATES,
    log(entry) { DB.insert('smsLog', Object.assign({ phone: mask(entry.phone) }, entry, { phone: mask(entry.phone) })); },
    /** Sipariş/mağaza olaylarında şablondan SMS üretir ve gönderir. */
    async event(event, phone, vars = {}) {
      const cfg = smsCfg();
      if (!cfg.events[event] || !phone) return;
      const message = fill(cfg.templates[event], vars);
      if (!Api.online) { this.log({ phone, message, event, status: 'demo' }); return; }
      try {
        if (Api.key() && ['storeApproved'].includes(event)) await Api.req('POST', '/api/sms/send', { phone, message, event }, true);
        else await Api.req('POST', '/api/sms/order-event', { event, phone, vars });
        this.log({ phone, message, event, status: 'sent' });
      } catch (e) { this.log({ phone, message, event, status: 'error', error: e.message }); }
    },
    async send(phone, message, event = 'manual') {
      if (!Api.online) { this.log({ phone, message, event, status: 'demo' }); return { demo: true }; }
      await Api.req('POST', '/api/sms/send', { phone, message, event }, true);
      this.log({ phone, message, event, status: 'sent' });
      return { sent: true };
    },
    async voice(phone) {
      if (!smsCfg().voiceLateOrder) return null;
      if (!Api.online) { this.log({ phone, message: '📞 Sesli arama (hazır ses kaydı)', event: 'voice', status: 'demo' }); return { demo: true }; }
      try { const r = await Api.req('POST', '/api/sms/voice', { phone }, true); this.log({ phone, message: '📞 Sesli arama · görev ' + r.bulkid, event: 'voice', status: 'sent' }); return r; }
      catch (e) { this.log({ phone, message: '📞 Sesli arama', event: 'voice', status: 'error', error: e.message }); return null; }
    },
    otpRequired() { return !!smsCfg().otpOnRegister; },
    /** Telefon doğrulama penceresi. Başarılı olursa true döner. */
    verifyPhone(phone) {
      return new Promise(resolve => {
        let demoCode = null, done = false;
        const sendCode = async () => {
          if (Api.online) { await Api.req('POST', '/api/sms/otp/send', { phone }); return; }
          demoCode = String(Math.floor(100000 + Math.random() * 900000));
          this.log({ phone, message: `MarkaBahcem dogrulama kodunuz: ${demoCode}. Kodu kimseyle paylasmayin.`, event: 'otp', status: 'demo' });
          C.toast('Demo modu: doğrulama kodun ' + demoCode, { icon: '📱', ms: 8000 });
        };
        Modal.open({
          title: 'Telefonunu doğrula', body: `<div class="stack" style="align-items:center;text-align:center"><div style="font-size:2.2rem">📱</div><p class="small"><b>${esc(phone)}</b> numarasına 6 haneli doğrulama kodu gönderdik.</p><input class="input" id="otpIn" maxlength="6" inputmode="numeric" autocomplete="one-time-code" style="text-align:center;font-size:1.4rem;letter-spacing:.3em;max-width:200px" aria-label="Doğrulama kodu"><button class="btn btn-ghost btn-sm" id="otpRe" type="button">Kodu tekrar gönder</button><span class="small bad" id="otpErr"></span></div>`,
          onMount: bg => {
            sendCode().catch(e => { U.$('#otpErr', bg).textContent = e.message; });
            U.$('#otpRe', bg).onclick = () => sendCode().then(() => C.toast('Yeni kod gönderildi', { icon: '📱' })).catch(e => { U.$('#otpErr', bg).textContent = e.message; });
            const obs = new MutationObserver(() => { if (!document.body.contains(bg)) { obs.disconnect(); if (!done) resolve(false); } });
            obs.observe(document.body, { childList: true });
          },
          actions: [{ label: 'Vazgeç' }, { label: 'Doğrula', primary: true, onClick: bg => {
            const code = U.$('#otpIn', bg).value.trim();
            if (!Api.online) { if (code === demoCode) { done = true; resolve(true); return; } U.$('#otpErr', bg).textContent = 'Kod hatalı'; return false; }
            Api.req('POST', '/api/sms/otp/verify', { phone, code }).then(() => { done = true; bg.remove(); resolve(true); }).catch(e => { U.$('#otpErr', bg).textContent = e.message; });
            return false;
          } }]
        });
      });
    }
  };

  /* Olay kancaları: sipariş ve paket durum değişiklikleri SMS üretir */
  const origPlace = Svc.placeOrder.bind(Svc);
  Svc.placeOrder = function (args) {
    const r = origPlace(args);
    if (r.order) {
      const o = r.order, u = Auth.user();
      Sms.event('orderPlaced', o.address.phone || (u && u.phone), { ad: (o.address.name || '').split(' ')[0], siparisNo: o.id, tutar: U.tl(o.total) });
      o.packages.forEach(pk => { const st = Svc.store(pk.storeId); if (st && st.house) return; const ow = st && Svc.user(st.ownerId); Sms.event('sellerNewOrder', st && (st.phone || (ow && ow.phone)), { ad: ow ? ow.name.split(' ')[0] : '', magaza: st ? st.name : '', siparisNo: o.id, tutar: U.tl(pk.subtotal) }); });
    }
    return r;
  };
  const origStatus = Svc.pkgStatus.bind(Svc);
  Svc.pkgStatus = function (order, storeId, status, extra) {
    origStatus(order, storeId, status, extra);
    const ev = { shipped: 'shipped', delivered: 'delivered', cancelled: 'cancelled', returned: 'returned' }[status];
    if (!ev) return;
    const pk = order.packages.find(p => p.storeId === storeId) || {};
    const cu = Svc.user(order.userId);
    Sms.event(ev, order.address.phone || (cu && cu.phone), { ad: (order.address.name || '').split(' ')[0], siparisNo: order.id, magaza: (Svc.store(storeId) || {}).name, kargo: pk.carrier || '', takipNo: pk.tracking || '', tutar: U.tl(pk.subtotal || 0) });
  };

  /* =====================================================================
     iyzico ÖDEME (ödeme sayfası)
     ===================================================================== */
  const Pay = C.Pay = {
    active() { return Api.online && Api.cfg && Api.cfg.enabled; },
    /** Sepeti iyzico sepet kalemlerine çevirir: kalemlerin toplamı ödenecek tutara eşit olmalı. */
    basket(s) {
      const rows = [];
      s.groups.forEach(g => {
        g.items.forEach(r => { const c = Svc.cat(r.p.categoryId); rows.push({ id: r.p.id + '-' + g.store.id, name: r.p.title, category: c ? c.name : 'Genel', raw: r.info.price * r.qty, store: g.store, rate: (g.store.commission != null ? g.store.commission : c ? c.commission : DB.settings.defaultCommission) / 100 }); });
        if (g.shipping) rows.push({ id: 'kargo-' + g.store.id, name: 'Kargo · ' + g.store.name, category: 'Kargo', raw: g.shipping, store: g.store, rate: 0 });
      });
      const raw = U.sum(rows, x => x.raw), f = raw ? s.total / raw : 1;
      let acc = 0;
      rows.forEach((x, i) => { x.price = i === rows.length - 1 ? U.round2(s.total - acc) : U.round2(x.raw * f); acc = U.round2(acc + x.price); });
      return rows.filter(x => x.price > 0).map(x => ({ id: x.id, name: x.name, category: x.category, price: x.price, subMerchantKey: x.store.iyzicoKey || undefined, subMerchantPrice: x.store.iyzicoKey ? U.round2(x.price * (1 - x.rate)) : undefined }));
    },
    bindCheckout(main, s) {
      if (!this.active()) {
        const note = U.$('#payCard', main);
        note && note.insertAdjacentHTML('afterend', `<div class="xs muted" style="margin-top:6px">ℹ️ Demo ödeme: iyzico sunucusu bağlı olmadığı için kart çekilmez.</div>`);
        return;
      }
      U.$('#payCard', main).insertAdjacentHTML('beforebegin', `<div class="insight info"><span class="ii">🔒</span><div class="small"><b>iyzico ile güvenli ödeme</b>${Api.cfg.threeDS ? ' · 3D Secure' : ''}${Api.cfg.env === 'sandbox' ? ' · <span class="warn">Test ortamı: 5528 7900 0000 0008, 12/30, CVC 123</span>' : ''}</div></div>`);
      U.$$('#payCard .xs.muted', main).forEach(x => { if (/Demo/.test(x.textContent)) x.remove(); });
      const no = U.$('#ccNo', main); const list = U.$('#instList', main);
      if (Api.cfg.env === 'sandbox') { no.value = '5528 7900 0000 0008'; U.$('#ccExp', main).value = '12/30'; U.$('#ccPrev').textContent = no.value; U.$('#ccExpPrev').textContent = '12/30'; }
      else { no.value = ''; U.$('#ccExp', main).value = ''; U.$('#ccCvc', main).value = ''; }
      let lastBin = '';
      this.opts = null;
      const load = U.debounce(async () => {
        const bin = no.value.replace(/\D/g, '').slice(0, 6);
        if (bin.length < 6 || bin === lastBin) return; lastBin = bin;
        try {
          const r = await Api.req('POST', '/api/payments/installments', { bin, price: s.total });
          this.opts = r.options;
          list.innerHTML = `<div class="xs muted">${esc(r.bank || '')} ${esc(r.family || '')} ${r.type ? '· ' + esc(r.type === 'CREDIT_CARD' ? 'kredi kartı' : 'banka kartı') : ''}</div>` + r.options.map((x, i) => `<label class="row between small" style="border:1px solid var(--line-2);border-radius:8px;padding:8px 10px;cursor:pointer"><span class="check"><input type="radio" name="inst" value="${x.n}" ${i === 0 ? 'checked' : ''}>${x.n === 1 ? 'Tek çekim' : x.n + ' × ' + U.tl(x.monthly)}</span><b class="num">${U.tl(x.total)}</b></label>`).join('');
          upd();
        } catch (e) { list.insertAdjacentHTML('afterbegin', `<div class="xs muted">Kartına özel taksit bilgisi alınamadı; standart seçenekler gösteriliyor.</div>`); }
      }, 400);
      const upd = () => { const n = +(U.$('input[name=inst]:checked', main) || { value: 1 }).value; const o = (this.opts || []).find(x => x.n === n); if (o) { U.$('#payTotal').textContent = U.tl(o.total); U.$('#instFee').hidden = o.total - s.total < 0.01; U.$('#instFee .num').textContent = U.tl(o.total - s.total); } };
      no.addEventListener('input', load); list.addEventListener('change', upd); load();
    },
    async checkout({ s, u, address, n, method }) {
      const exp = (U.$('#ccExp').value || '').split('/');
      const ref = 'MB' + Date.now().toString(36).toUpperCase();
      const btn = U.$('#pay'); btn.disabled = true; btn.textContent = 'Ödeme işleniyor…';
      try {
        const r = await Api.req('POST', '/api/payments/pay', {
          orderRef: ref, installment: n,
          card: { holder: U.$('#ccName').value.trim(), number: U.$('#ccNo').value, expMonth: exp[0], expYear: exp[1], cvc: U.$('#ccCvc').value },
          buyer: { id: u.id, name: u.name, email: u.email, phone: address.phone || u.phone },
          address: { contactName: address.name, city: address.city, district: address.district, line: address.line },
          basket: this.basket(s)
        });
        const pending = { ref, addressId: address.id, n, method };
        if (r.threeDS) {
          Store.set('mb_pending_pay', pending);
          document.open(); document.write(r.html); document.close();
          return;
        }
        this.finish(pending, { paymentId: r.paymentId, paid: r.paidPrice, last4: r.lastFour, items: r.items });
      } catch (e) {
        btn.disabled = false; btn.textContent = 'Siparişi onayla';
        Modal.open({ title: 'Ödeme tamamlanamadı', body: `<p>${esc(/Sunucuya ulaşılamadı|tunnel|socket|ECONN|ETIMEDOUT|403/i.test(e.message) ? 'Ödeme sistemine şu an ulaşılamıyor. Lütfen birkaç dakika sonra tekrar deneyin.' : e.message)}</p><p class="small muted" style="margin-top:8px">Kart bilgilerini kontrol edip tekrar deneyebilir ya da farklı bir kart kullanabilirsin. Kartından tutar çekilmedi.</p>`, actions: [{ label: 'Tamam', primary: true }] });
      }
    },
    finish(pending, pay) {
      const u = Auth.user();
      const address = u.addresses.find(a => a.id === pending.addressId) || u.addresses[0];
      const r = Svc.placeOrder({ address, payment: { method: 'card', provider: 'iyzico', installments: pending.n, last4: pay.last4 || '', iyzicoPaymentId: pay.paymentId, ref: pending.ref, items: pay.items || [] } });
      if (r.error) return C.toast(r.error, { icon: '⚠️' });
      if (pay.paid) { r.order.total = U.round2(+pay.paid); DB.save(); }
      Store.del('mb_pending_pay');
      C.App.updateBadges();
      go('/order-success/' + r.order.id);
    }
  };

  /* 3D Secure dönüş sayfası */
  P.paymentResult = (_, q) => {
    const pending = Store.get('mb_pending_pay');
    if (q.status === 'success' && pending && pending.ref === q.ref && Auth.user()) {
      return { title: 'Ödeme onaylandı', html: `<div class="wrap section">${K.empty('⏳', 'Ödemen onaylandı, siparişin oluşturuluyor…')}</div>`, mount() { setTimeout(() => Pay.finish(pending, { paymentId: q.paymentId, paid: q.paid, last4: q.last4 }), 300); } };
    }
    return { title: 'Ödeme başarısız', html: `<div class="wrap section">${K.empty('✕', 'Ödeme tamamlanamadı', esc(q.msg || 'Banka doğrulaması başarısız oldu. Kartından tutar çekilmedi.'), '<a class="btn btn-primary" href="#/checkout">Tekrar dene</a>')}</div>` };
  };

  /* =====================================================================
     YÖNETİM PANELİ — ENTEGRASYONLAR
     ===================================================================== */
  const guard = () => { const u = Auth.user(); if (!u) return { redirect: '/login?next=' + encodeURIComponent(Router.path) }; if (u.role !== 'admin') return { redirect: '/' }; return null; };
  const apage = o => Object.assign({ layout: 'panel', panel: 'admin' }, o);

  const CARDS = {
    iyzico: {
      icon: '<div class="int-icon" style="background:#FFF7ED;color:#FF6B35;font-weight:900;font-size:14px">iy</div>', name: 'İyzico', desc: 'Ödeme Sistemi',
      fields: [['apiKey', '🔑 API Key <span class="muted" style="font-weight:400">(İyzico panelinden kopyala)</span>', 'secret', 'sandbox-xxx veya gerçek API key'], ['secretKey', '🔑 Secret Key', 'secret', 'sandbox-xxx veya gerçek Secret key'], ['env', '🌐 Ortam', 'select', [['sandbox', 'Sandbox (Test)'], ['production', 'Production (Canlı)']]], ['threeDS', '🛡 3D Secure zorunlu', 'check'], ['marketplace', '🏪 Pazaryeri modu (satıcı payını iyzico alt üye iş yerine aktar)', 'check']],
      test: '🔍 Test Et', ok: '✅ Bağlantı başarıyla kuruldu!',
      info: 'Sandbox test kartı: <b>5528 7900 0000 0008</b> · 12/30 · CVC 123. 3D Secure dönüş adresi: <code>{site}/api/payments/3ds/callback</code>'
    },
    netgsm: {
      icon: '<div class="int-icon" style="background:#EFF6FF">📱</div>', name: 'Netgsm', desc: 'SMS bildirim ve OTP doğrulama',
      fields: [['user', '📞 Kullanıcı Adı (Telefon No)', 'text', '05XXXXXXXXX veya 850XXXXXXX'], ['pass', '🔑 Şifre', 'secret', 'Netgsm panel (API alt kullanıcı) şifresi'], ['orig', '📤 SMS Başlığı (Originator)', 'text', 'MARKABAHCEM', 11], ['testPhone', '🧪 Test SMS gidecek numara', 'text', '05XXXXXXXXX']],
      test: '📩 Test SMS Gönder', ok: '✅ SMS sistemi bağlandı!',
      info: 'Netgsm panelinde API erişimini açıp sunucunun IP adresini izinli listeye ekleyin. SMS başlığı Netgsm\'de onaylı olmalı.'
    },
    netgsmses: {
      icon: '<div class="int-icon" style="background:#F5F3FF">📞</div>', name: 'Netgsm Sesli Arama', desc: 'Geciken siparişte satıcıyı otomatik arama',
      pre: '💡 48 saattir onaylanmayan siparişlerde satıcıya SMS hatırlatmasıyla birlikte otomatik arama yapılıp hazır ses kaydı dinletilir.',
      fields: [['user', '📞 Kullanıcı Adı (Alt kullanıcının kendi cep numarası — ana 0850 numarası DEĞİL)', 'text', '05XXXXXXXXX'], ['pass', '🔑 Alt Kullanıcı Şifresi', 'secret', 'Sesli Mesaj yetkili alt kullanıcı şifresi'], ['audioid', '🎙️ AudioID', 'text', 'Netgsm panelinden alınan ses kaydı kimliği'], ['testPhone', '🧪 Test araması yapılacak numara', 'text', '05XXXXXXXXX']],
      test: '📞 Test Araması Yap', ok: '✅ Sesli arama sistemi bağlandı!'
    },
    smtp: {
      icon: '<div class="int-icon" style="background:#ECFDF5">✉️</div>', name: 'E-posta (SMTP)', desc: 'Bayilere sipariş e-postası',
      fields: [['host', '🌐 SMTP sunucusu', 'text', 'smtp.gmail.com / mail.alanadiniz.com'], ['port', '🔌 Port', 'text', '587 (TLS) veya 465 (SSL)'], ['user', '👤 Kullanıcı (e-posta)', 'text', 'siparis@markabahcem.com'], ['pass', '🔑 Şifre / uygulama şifresi', 'secret', 'SMTP şifresi'], ['name', '🏷 Gönderen adı', 'text', 'MarkaBahçem Sipariş'], ['testEmail', '🧪 Test maili gidecek adres', 'text', 'ornek@alanadiniz.com']],
      test: '✉️ Test Maili Gönder', ok: '✅ E-posta bağlantısı kuruldu!',
      info: 'Gmail kullanıyorsan normal şifre yerine "uygulama şifresi" oluşturup buraya yapıştır.'
    }
  };

  function cardHtml(name, st) {
    const c = CARDS[name], v = st.values || {};
    return `<div class="int-card card card-pad stack" data-card="${name}">
      <div class="row between nowrap"><div class="row nowrap">${c.icon}<div><div class="int-name">${c.name}</div><div class="xs muted">${c.desc}</div></div></div>
        <span class="int-status ${st.connected ? 'connected' : ''}"><i class="status-dot" style="background:${st.connected ? 'var(--ok)' : 'var(--line-2)'}"></i>${st.connected ? 'Bağlandı' : 'Bağlı Değil'}</span></div>
      ${c.pre ? `<div class="insight info" style="padding:10px 12px"><div class="small">${c.pre}</div></div>` : ''}
      ${c.fields.map(([k, l, t, ph, max]) => t === 'select'
        ? `<div class="field"><label for="${name}-${k}">${l}</label><select class="select" id="${name}-${k}" data-f="${k}">${ph.map(([ov, ol]) => `<option value="${ov}" ${String(v[k] || ph[0][0]) === ov ? 'selected' : ''}>${ol}</option>`).join('')}</select></div>`
        : t === 'check' ? `<label class="check small"><input type="checkbox" id="${name}-${k}" data-f="${k}" ${(v[k] === undefined ? k === 'threeDS' : v[k] === true || v[k] === 'true') ? 'checked' : ''}> ${l}</label>`
        : `<div class="field"><label for="${name}-${k}">${l}</label><div class="key-wrap"><input class="input key-input" id="${name}-${k}" data-f="${k}" ${t === 'secret' ? 'type="password" autocomplete="off"' : ''} placeholder="${esc(ph)}" value="${esc(v[k] || '')}" ${max ? `maxlength="${max}"` : ''}>${t === 'secret' ? `<button class="key-eye" type="button" data-eye="${name}-${k}" aria-label="Göster">👁</button>` : ''}</div></div>`).join('')}
      <div class="row"><button class="btn" style="flex:1 1 auto" data-test="${name}">${c.test}</button><button class="btn btn-primary" style="flex:1 1 auto" data-save="${name}">💾 Kaydet & Bağlan</button></div>
      <div class="small ok bold" id="${name}-msg" hidden>${c.ok}</div>
      ${c.info ? `<div class="xs muted">${c.info.replace('{site}', esc(location.origin && location.origin !== 'null' ? location.origin : 'https://www.markabahcem.com'))}</div>` : ''}
      ${st.updatedAt ? `<div class="xs muted">Son güncelleme: ${U.dateTime(new Date(st.updatedAt).getTime())}</div>` : ''}
    </div>`;
  }

  async function statusOf(name) {
    if (Api.online && Api.key()) { try { return await Api.req('GET', '/api/integrations/' + name + '/status', null, true); } catch (e) { return { connected: false, values: {}, error: e.message }; } }
    const l = localInt(name);
    const values = {};
    Object.entries(l).forEach(([k, v]) => { if (k !== 'updatedAt') values[k] = ['apiKey', 'secretKey', 'pass'].includes(k) ? '••••••' + String(v).slice(-4) : v; });
    const connected = name === 'iyzico' ? !!(l.apiKey && l.secretKey) : name === 'netgsmses' ? !!(l.user && l.pass && l.audioid) : name === 'smtp' ? !!(l.host && l.user && l.pass) : !!(l.user && l.pass);
    return { connected, values, updatedAt: l.updatedAt };
  }

  A.integrations = () => {
    const g = guard(); if (g) return g;
    const html = `
      <section class="card card-pad stack" id="srvCard">
        <div class="row between"><div class="row nowrap"><div class="int-icon" style="background:var(--sunken)">🖥</div><div><div class="int-name">Sunucu bağlantısı</div><div class="xs muted">API anahtarları tarayıcıda değil, sunucuda saklanır</div></div></div><span id="srvState" class="badge b-mute">Kontrol ediliyor…</span></div>
        <div class="form-grid"><div class="field"><label for="apiBase">API adresi <span class="muted" style="font-weight:400">(site ile aynı sunucudaysa boş bırak)</span></label><input class="input" id="apiBase" placeholder="https://api.markabahcem.com" value="${esc(Api.base())}"></div>
          <div class="field"><label for="apiKey">Yönetim paneli anahtarı <span class="muted" style="font-weight:400">(.env › ADMIN_PANEL_KEY)</span></label><div class="key-wrap"><input class="input key-input" id="apiKey" type="password" autocomplete="off" value="${esc(Api.key())}"><button class="key-eye" type="button" data-eye="apiKey" aria-label="Göster">👁</button></div></div></div>
        <div class="row"><button class="btn btn-dark" id="srvSave">Bağlan</button><span class="xs muted" id="srvInfo"></span></div>
      </section>
      <div class="int-grid" id="intGrid" style="margin-top:16px"></div>
      <section class="card card-pad stack" style="margin-top:16px" id="subCard"></section>
      <section class="card" style="margin-top:16px"><div class="row between" style="padding:16px 18px 0"><h3 style="margin:0">💳 iyzico işlemleri</h3><button class="btn btn-sm" id="payRef">Yenile</button></div><div id="payLog" style="padding:8px 0"></div></section>`;
    return apage({
      title: 'Entegrasyonlar', sub: 'API anahtarlarını buraya yapıştır, bağlantı otomatik kurulur', actions: '<a class="btn" href="#/admin/sms">💬 SMS yönetimi</a>', html,
      async mount(main) {
        const state = U.$('#srvState', main), info = U.$('#srvInfo', main);
        const drawSrv = () => {
          if (!Api.online) { state.className = 'badge b-warn'; state.textContent = 'Demo modu'; info.textContent = 'Sunucuya ulaşılamadı. Ayarlar bu tarayıcıda saklanır ve gerçek SMS/ödeme gönderilmez. Canlıda backend/ klasöründeki sunucuyu çalıştırın.'; }
          else if (!Api.key()) { state.className = 'badge b-warn'; state.textContent = 'Anahtar gerekli'; info.textContent = 'Sunucu çalışıyor. Ayarları görmek için yönetim paneli anahtarını girin.'; }
          else { state.className = 'badge b-ok'; state.textContent = 'Sunucu bağlı'; info.textContent = 'Kaydedilen anahtarlar sunucuda saklanır, tarayıcıya geri gönderilmez.'; }
        };
        const drawCards = async () => {
          const grid = U.$('#intGrid', main);
          const sts = await Promise.all(Object.keys(CARDS).map(statusOf));
          if (sts.some(s => s.error && /Yetkisiz/.test(s.error))) { state.className = 'badge b-bad'; state.textContent = 'Anahtar hatalı'; }
          grid.innerHTML = Object.keys(CARDS).map((n, i) => cardHtml(n, sts[i])).join('');
        };
        const drawSub = () => {
          const iy = localInt('iyzico'); const on = Api.online ? Api.cfg.marketplace : (iy.marketplace === true);
          const stores = DB.where('stores', s => s.status === 'active');
          U.$('#subCard', main).innerHTML = `<div class="row between"><div><h3 style="margin:0">🏪 iyzico alt üye iş yerleri</h3><p class="small muted">Pazaryeri modunda her mağaza iyzico'da alt üye iş yeri olarak kaydedilir; ödemenin satıcı payı (komisyon düşülmüş tutar) iyzico tarafından doğrudan mağazanın IBAN'ına aktarılır.</p></div><span class="badge ${on ? 'b-ok' : 'b-mute'}">${on ? 'Pazaryeri modu açık' : 'Pazaryeri modu kapalı'}</span></div>
            <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Mağaza</th><th>IBAN</th><th>Vergi no</th><th>Alt üye anahtarı</th><th></th></tr></thead><tbody>${stores.map(s => `<tr><td><div class="row nowrap" style="gap:8px">${K.storeAvatar(s, 28)}<b class="small">${esc(s.name)}</b></div></td><td class="xs">${esc(s.iban)}</td><td class="xs">${esc(s.taxNo)}</td><td class="xs">${s.iyzicoKey ? `<span class="badge b-ok">✓ ${esc(s.iyzicoKey.slice(0, 10))}…</span>` : '<span class="muted">Kayıtlı değil</span>'}</td><td>${s.iyzicoKey ? '' : `<button class="btn btn-sm" data-sub="${s.id}">iyzico'ya kaydet</button>`}</td></tr>`).join('')}</tbody></table></div>`;
        };
        const drawPay = async () => {
          const box = U.$('#payLog', main);
          let rows = [];
          if (Api.online && Api.key()) { try { rows = (await Api.req('GET', '/api/payments/log?limit=50', null, true)).log; } catch (e) { box.innerHTML = `<p class="small bad" style="padding:0 18px">${esc(e.message)}</p>`; return; } }
          else rows = DB.all('orders').filter(o => o.payment && o.payment.provider === 'iyzico').slice(-50).reverse().map(o => ({ conversationId: o.payment.ref, status: 'success', paidPrice: o.total, installment: o.payment.installments, lastFour: o.payment.last4, buyer: o.address.name, createdAt: new Date(o.createdAt).toISOString(), paymentId: o.payment.iyzicoPaymentId }));
          const lab = { success: ['Başarılı', 'b-ok'], failed: ['Başarısız', 'b-bad'], pending3ds: ['3D bekliyor', 'b-warn'], cancelled: ['İptal', 'b-mute'] };
          box.innerHTML = rows.length ? `<div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Tarih</th><th>Referans</th><th>Alıcı</th><th class="r">Tutar</th><th>Taksit</th><th>Kart</th><th>Durum</th><th></th></tr></thead><tbody>${rows.map(r => `<tr><td class="small">${U.dateTime(new Date(r.createdAt).getTime())}</td><td class="xs">${esc(r.conversationId || '')}<div class="muted">${esc(r.paymentId || '')}</div></td><td class="small">${esc(r.buyer || '')}</td><td class="r">${r.paidPrice ? U.tl(r.paidPrice) : r.price ? U.tl(r.price) : '—'}</td><td class="small">${r.installment > 1 ? r.installment + ' taksit' : 'Tek çekim'}</td><td class="xs">${r.lastFour ? '**** ' + esc(r.lastFour) : ''}</td><td>${K.pill(lab, r.status)}${r.error ? `<div class="xs bad">${esc(r.error)}</div>` : ''}</td><td>${r.status === 'success' && r.paymentId && Api.online ? `<button class="btn btn-sm btn-ghost" data-cancelpay="${esc(r.paymentId)}" data-conv="${esc(r.conversationId)}">İptal/iade</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
            : `<p class="small muted" style="padding:0 18px 10px">Henüz iyzico ile ödeme yok.${Api.online ? '' : ' Demo modunda ödemeler simüle edilir ve burada listelenmez.'}</p>`;
        };
        drawSrv(); await drawCards(); drawSub(); drawPay();
        U.$('#srvSave', main).onclick = async () => {
          Store.set('mb_api_base', U.$('#apiBase').value.trim()); Store.set('mb_admin_key', U.$('#apiKey').value.trim());
          state.className = 'badge b-mute'; state.textContent = 'Kontrol ediliyor…';
          await Api.check(); drawSrv(); await drawCards(); drawSub(); drawPay();
          C.toast(Api.online ? 'Sunucu bağlantısı kuruldu' : 'Sunucuya ulaşılamadı, demo modunda devam ediliyor', { icon: Api.online ? '🖥' : 'ℹ️' });
        };
        main.addEventListener('click', async e => {
          let b;
          if ((b = e.target.closest('[data-eye]'))) { const i = U.$('#' + b.dataset.eye, main); i.type = i.type === 'password' ? 'text' : 'password'; return; }
          if ((b = e.target.closest('[data-save]'))) {
            const name = b.dataset.save, card = b.closest('[data-card]');
            const payload = {};
            U.$$('[data-f]', card).forEach(i => { payload[i.dataset.f] = i.type === 'checkbox' ? i.checked : i.value.trim(); });
            b.disabled = true;
            try {
              if (Api.online && Api.key()) await Api.req('POST', '/api/integrations/' + name, payload, true);
              else { const l = localInt(name); Object.entries(payload).forEach(([k, v]) => { if (['apiKey', 'secretKey', 'pass'].includes(k) && (v === '' || /^•+/.test(v))) return; l[k] = v; }); l.updatedAt = new Date().toISOString(); DB.save(); }
              if (name === 'iyzico' && Api.online) await Api.check();
              await drawCards(); drawSub();
              const m = U.$('#' + name + '-msg', main); if (m) { m.hidden = false; setTimeout(() => { m.hidden = true; }, 4000); }
              C.toast(Api.online ? 'Kaydedildi ve bağlandı' : 'Kaydedildi (demo modu: bu tarayıcıda saklandı)');
            } catch (err) { Modal.open({ title: 'Kaydedilemedi', body: `<p>${esc(err.message)}</p>`, actions: [{ label: 'Tamam', primary: true }] }); }
            b.disabled = false; return;
          }
          if ((b = e.target.closest('[data-test]'))) {
            const name = b.dataset.test, card = b.closest('[data-card]');
            const tp = U.$('[data-f="testPhone"]', card);
            b.disabled = true; const old = b.textContent; b.textContent = 'Deneniyor…';
            try {
              if (Api.online && Api.key()) { const r = await Api.req('POST', '/api/integrations/' + name + '/test', { phone: tp ? tp.value.trim() : '', email: (U.$('[data-f="testEmail"]', card) || { value: '' }).value.trim() }, true); Modal.open({ title: CARDS[name].name + ' testi', body: `<p>✅ ${esc(r.message)}</p>`, actions: [{ label: 'Tamam', primary: true }] }); }
              else {
                const st = await statusOf(name);
                if (!st.connected) throw new Error('Önce bilgileri kaydedin');
                if (name === 'netgsm') Sms.log({ phone: (tp && tp.value) || localInt('netgsm').user, message: 'MarkaBahcem test mesaji - baglanti calisiyor.', event: 'test', status: 'demo' });
                Modal.open({ title: CARDS[name].name + ' testi (demo modu)', body: `<p>Bilgiler kayıtlı. Bu önizleme sunucuya bağlı olmadığı için ${name === 'iyzico' ? 'iyzico\'ya doğrulama isteği' : name === 'netgsm' ? 'gerçek SMS' : 'gerçek arama'} gönderilmedi.</p><p class="small muted" style="margin-top:8px">Canlı sunucuda bu buton ${name === 'iyzico' ? 'iyzico BIN sorgusuyla anahtarları doğrular' : name === 'netgsm' ? 'Netgsm üzerinden test SMS\'i gönderir' : 'Netgsm sesli mesaj ile test araması başlatır'}.</p>`, actions: [{ label: 'Tamam', primary: true }] });
              }
            } catch (err) { Modal.open({ title: 'Test başarısız', body: `<p>${esc(friendly(err.message))}</p>`, actions: [{ label: 'Tamam', primary: true }] }); }
            b.disabled = false; b.textContent = old; return;
          }
          if ((b = e.target.closest('[data-sub]'))) {
            const s = Svc.store(+b.dataset.sub); const ow = Svc.user(s.ownerId);
            Modal.open({
              title: s.name + ' · iyzico alt üye kaydı', body: `<div class="form-grid">
                <div class="field"><label for="sm-t">Şirket tipi</label><select class="select" id="sm-t"><option value="PRIVATE_COMPANY">Şahıs şirketi</option><option value="LIMITED_OR_JOINT_STOCK_COMPANY">Limited / anonim şirket</option><option value="PERSONAL">Bireysel</option></select></div>
                <div class="field"><label for="sm-n">Unvan</label><input class="input" id="sm-n" value="${esc(s.name)}"></div>
                <div class="field"><label for="sm-e">E-posta</label><input class="input" id="sm-e" value="${esc(ow ? ow.email : '')}"></div><div class="field"><label for="sm-g">Telefon</label><input class="input" id="sm-g" value="${esc(s.phone || (ow && ow.phone) || '')}"></div>
                <div class="field"><label for="sm-o">Vergi dairesi</label><input class="input" id="sm-o" value="${esc(s.taxOffice || '')}" placeholder="Örn: Kadıköy"></div><div class="field"><label for="sm-x">Vergi no / TCKN</label><input class="input" id="sm-x" value="${esc(s.taxNo)}"></div>
                <div class="field full"><label for="sm-i">IBAN</label><input class="input" id="sm-i" value="${esc(s.iban)}"></div><div class="field full"><label for="sm-a">Adres</label><input class="input" id="sm-a" value="${esc(s.city)}"></div></div>`,
              actions: [{ label: 'Vazgeç' }, { label: 'Kaydet', primary: true, onClick: bg => {
                const v = id => U.$(id, bg).value.trim();
                const body = { storeId: s.id, type: v('#sm-t'), name: v('#sm-n'), legalCompanyTitle: v('#sm-n'), email: v('#sm-e'), gsm: v('#sm-g'), taxOffice: v('#sm-o'), taxNumber: v('#sm-x'), identityNumber: v('#sm-x'), iban: v('#sm-i'), address: v('#sm-a'), contactName: (ow ? ow.name : '').split(' ')[0], contactSurname: (ow ? ow.name : '').split(' ').slice(1).join(' ') };
                const done = key => { s.iyzicoKey = key; s.taxOffice = body.taxOffice; DB.save(); drawSub(); Svc.notify(s.ownerId, '💳 Mağazan iyzico alt üye iş yeri olarak kaydedildi. Hakedişlerin doğrudan IBAN\'ına aktarılacak.', '/seller/finance'); C.toast(s.name + ' iyzico\'ya kaydedildi'); };
                if (Api.online && Api.key()) { Api.req('POST', '/api/payments/submerchant', body, true).then(r => { done(r.subMerchantKey); bg.remove(); }).catch(err => C.toast(err.message, { icon: '⚠️', ms: 5000 })); return false; }
                done('demo-' + Math.random().toString(36).slice(2, 12));
              } }]
            });
            return;
          }
          if ((b = e.target.closest('[data-cancelpay]'))) {
            if (!(await Modal.confirm('Bu ödeme iyzico üzerinden iptal edilecek (aynı gün içindeki işlemler için). Tutar karta iade edilir.', { ok: 'İptal et', danger: true }))) return;
            try { await Api.req('POST', '/api/payments/cancel', { paymentId: b.dataset.cancelpay, conversationId: b.dataset.conv }, true); C.toast('Ödeme iptal edildi'); drawPay(); }
            catch (err) { C.toast(err.message, { icon: '⚠️', ms: 5000 }); }
          }
        });
        U.$('#payRef', main).onclick = drawPay;
      }
    });
  };

  /* =====================================================================
     YÖNETİM PANELİ — SMS YÖNETİMİ
     ===================================================================== */
  A.sms = () => {
    const g = guard(); if (g) return g;
    const cfg = smsCfg();
    const customers = DB.where('users', u => u.role === 'customer' && u.phone);
    const since = Date.now() - 90 * U.DAY;
    const buyers = new Set(DB.all('orders').filter(o => o.createdAt > since).map(o => o.userId));
    const stores = DB.where('stores', s => s.status === 'active');
    const html = `
      <div class="g2" style="align-items:start">
        <section class="card card-pad stack"><div class="row between"><h3 style="margin:0">Otomatik SMS bildirimleri</h3><span class="badge ${Api.online ? 'b-ok' : 'b-warn'}">${Api.online ? 'Netgsm üzerinden gönderilir' : 'Demo modu'}</span></div>
          <p class="small muted">Değişkenler: ${VARS.map(v => `<code>${v}</code>`).join(' ')}. Türkçe karakterler (ç, ğ, ı, ö, ş, ü) SMS'i 70 karakterlik parçalara böler.</p>
          ${EVENTS.map(([k, ic, l, who]) => { const p = smsParts(cfg.templates[k]); return `<div class="stack" style="gap:6px;border-top:1px solid var(--line);padding-top:12px">
            <div class="row between"><label class="check"><span class="switch"><input type="checkbox" data-ev="${k}" ${cfg.events[k] ? 'checked' : ''}><span></span></span> <b class="small">${ic} ${l}</b> <span class="xs muted">· ${who}</span></label><span class="xs muted" data-cnt="${k}">${p.len} karakter · ${p.parts} SMS</span></div>
            <textarea class="textarea" data-tpl="${k}" style="min-height:64px;font-size:.86rem">${esc(cfg.templates[k])}</textarea></div>`; }).join('')}
          <div class="stack" style="gap:8px;border-top:1px solid var(--line);padding-top:12px">
            <label class="check small"><span class="switch"><input type="checkbox" id="otpReg" ${cfg.otpOnRegister ? 'checked' : ''}><span></span></span> Üye olurken telefonu SMS kodu ile doğrula (OTP)</label>
            <label class="check small"><span class="switch"><input type="checkbox" id="voiceLate" ${cfg.voiceLateOrder ? 'checked' : ''}><span></span></span> 48 saattir onaylanmayan siparişte satıcıyı Netgsm ile otomatik ara</label></div>
          <div class="row"><button class="btn btn-primary" id="tplSave">Kaydet</button><button class="btn btn-ghost" id="tplReset">Varsayılan metinler</button></div>
        </section>
        <div class="stack lg">
          <section class="card card-pad stack"><h3 style="margin:0">📣 Toplu SMS</h3>
            <div class="field"><label for="bAud">Alıcılar</label><select class="select" id="bAud">
              <option value="consent">Ticari ileti izni veren müşteriler</option><option value="buyers">Son 90 günde sipariş veren (izinli) müşteriler</option><option value="sellers">Tüm satıcılar (bilgilendirme)</option>
              ${stores.map(s => `<option value="store:${s.id}">${esc(s.name)} takipçileri (izinli)</option>`).join('')}</select></div>
            <div class="field"><label for="bMsg">Mesaj</label><textarea class="textarea" id="bMsg" style="min-height:100px">MarkaBahcem Kasim firsatlari basladi! Secili urunlerde %40'a varan indirim: markabahcem.com B019</textarea><span class="xs muted" id="bCnt"></span></div>
            <div class="insight info" style="padding:10px 12px"><span class="ii">⚖️</span><div class="xs">Ticari ileti yönetmeliği gereği kampanya SMS'leri yalnızca izin veren (İYS kayıtlı) alıcılara gönderilir ve mesajda ret kodu (ör. <b>B019</b>) bulunmalıdır.</div></div>
            <div class="row between"><b class="small" id="bInfo"></b><button class="btn btn-dark" id="bSend">Gönder</button></div></section>
          <section class="card card-pad stack"><h3 style="margin:0">Tekil SMS</h3><div class="form-grid"><div class="field"><label for="sPh">Telefon</label><input class="input" id="sPh" placeholder="05XX XXX XX XX"></div></div><textarea class="textarea" id="sMsg" style="min-height:70px" placeholder="Mesaj"></textarea><button class="btn" id="sSend" style="align-self:flex-start">Gönder</button></section>
        </div>
      </div>
      <section class="card" style="margin-top:16px"><div class="row between" style="padding:16px 18px 0"><h3 style="margin:0">SMS geçmişi</h3><button class="btn btn-sm" id="logRef">Yenile</button></div><div id="smsLog" style="padding:8px 0"></div></section>`;
    return apage({
      title: 'SMS yönetimi', sub: 'Netgsm ile sipariş bildirimleri, doğrulama ve kampanya SMS\'leri', actions: '<a class="btn" href="#/admin/integrations">🔌 Entegrasyonlar</a>', html,
      mount(main) {
        const audience = v => {
          if (v === 'consent') return customers.filter(u => u.smsConsent).map(u => u.phone);
          if (v === 'buyers') return customers.filter(u => u.smsConsent && buyers.has(u.id)).map(u => u.phone);
          if (v === 'sellers') return stores.map(s => s.phone || (Svc.user(s.ownerId) || {}).phone).filter(Boolean);
          if (v.startsWith('store:')) { const s = Svc.store(+v.slice(6)); return s.followers.map(id => Svc.user(id)).filter(u => u && u.smsConsent && u.phone).map(u => u.phone); }
          return [];
        };
        const bUpd = () => { const n = U.uniq(audience(U.$('#bAud').value)).length; const p = smsParts(U.$('#bMsg').value); U.$('#bCnt').textContent = `${p.len} karakter · ${p.parts} SMS${p.uni ? ' (Türkçe karakter var)' : ''}`; U.$('#bInfo').textContent = `${n} alıcı · ${n * p.parts} SMS kredisi`; };
        U.$('#bAud', main).onchange = bUpd; U.$('#bMsg', main).oninput = bUpd; bUpd();
        main.addEventListener('input', e => { const t = e.target.closest('[data-tpl]'); if (t) { const p = smsParts(t.value); U.$(`[data-cnt="${t.dataset.tpl}"]`, main).textContent = `${p.len} karakter · ${p.parts} SMS`; } });
        U.$('#tplSave', main).onclick = async () => {
          U.$$('[data-tpl]', main).forEach(t => { cfg.templates[t.dataset.tpl] = t.value.trim() || DEF_TEMPLATES[t.dataset.tpl]; });
          U.$$('[data-ev]', main).forEach(t => { cfg.events[t.dataset.ev] = t.checked; });
          cfg.otpOnRegister = U.$('#otpReg').checked; cfg.voiceLateOrder = U.$('#voiceLate').checked;
          DB.save();
          if (Api.online && Api.key()) { try { await Api.req('POST', '/api/integrations/smstemplates', { templates: cfg.templates, events: cfg.events, otpOnRegister: cfg.otpOnRegister, voiceLateOrder: cfg.voiceLateOrder }, true); } catch (e) { return C.toast('Sunucuya kaydedilemedi: ' + e.message, { icon: '⚠️' }); } }
          C.toast('SMS ayarları kaydedildi');
        };
        U.$('#tplReset', main).onclick = () => { U.$$('[data-tpl]', main).forEach(t => { t.value = DEF_TEMPLATES[t.dataset.tpl]; t.dispatchEvent(new Event('input', { bubbles: true })); }); };
        U.$('#bSend', main).onclick = async () => {
          const phones = U.uniq(audience(U.$('#bAud').value)); const msg = U.$('#bMsg').value.trim();
          if (!phones.length || !msg) return C.toast('Alıcı ve mesaj gerekli', { icon: '⚠️' });
          if (!(await Modal.confirm(`${phones.length} kişiye SMS gönderilecek (${phones.length * smsParts(msg).parts} kredi).`, { ok: 'Gönder' }))) return;
          if (Api.online && Api.key()) {
            try { const r = await Api.req('POST', '/api/sms/bulk', { phones, message: msg }, true); C.toast(`${r.sent} SMS gönderildi${r.failed ? ', ' + r.failed + ' hatalı' : ''}`, { icon: '📣' }); }
            catch (e) { return C.toast(e.message, { icon: '⚠️' }); }
          } else { phones.slice(0, 30).forEach(p => Sms.log({ phone: p, message: msg, event: 'bulk', status: 'demo' })); C.toast(`Demo modu: ${phones.length} SMS kaydedildi, gönderilmedi`, { icon: '📣' }); }
          drawLog();
        };
        U.$('#sSend', main).onclick = async () => {
          const ph = U.$('#sPh').value.trim(), msg = U.$('#sMsg').value.trim();
          if (!/^0?5\d{9}$/.test(ph.replace(/\D/g, '').replace(/^90/, '')) || !msg) return C.toast('Geçerli bir cep telefonu ve mesaj gir', { icon: '⚠️' });
          try { const r = await Sms.send(ph, msg); C.toast(r.demo ? 'Demo modu: SMS kaydedildi, gönderilmedi' : 'SMS gönderildi', { icon: '💬' }); drawLog(); } catch (e) { C.toast(e.message, { icon: '⚠️' }); }
        };
        const lab = { sent: ['Gönderildi', 'b-ok'], demo: ['Demo (gönderilmedi)', 'b-warn'], error: ['Hata', 'b-bad'], dev: ['Geliştirme', 'b-mute'] };
        const evL = Object.fromEntries(EVENTS.map(e => [e[0], e[2]]).concat([['otp', 'Doğrulama kodu'], ['bulk', 'Toplu SMS'], ['manual', 'Tekil SMS'], ['test', 'Test'], ['voice', 'Sesli arama']]));
        const drawLog = async () => {
          const box = U.$('#smsLog', main);
          let rows = DB.all('smsLog').slice().reverse().slice(0, 100).map(x => Object.assign({}, x, { t: x.createdAt }));
          if (Api.online && Api.key()) { try { rows = (await Api.req('GET', '/api/sms/log?limit=100', null, true)).log.map(x => Object.assign({}, x, { t: new Date(x.createdAt).getTime() })); } catch (e) { /* yerel kayıt gösterilir */ } }
          box.innerHTML = rows.length ? `<div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Tarih</th><th>Telefon</th><th>Olay</th><th>Mesaj</th><th>Durum</th></tr></thead><tbody>${rows.map(r => `<tr><td class="small">${U.dateTime(r.t)}</td><td class="xs">${esc(r.phone)}</td><td class="xs">${esc(evL[r.event] || r.event || '')}</td><td class="xs" style="max-width:420px">${esc(r.message)}</td><td>${K.pill(lab, r.status)}${r.error ? `<div class="xs bad">${esc(r.error)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="small muted" style="padding:0 18px 10px">Henüz SMS yok.</p>';
        };
        drawLog(); U.$('#logRef', main).onclick = drawLog;
      }
    });
  };

  /* Örnek veri: SMS ayarları ve izinler */
  const prevExtra = C.Seed.extra;
  C.Seed.extra = (d, r) => {
    if (prevExtra) prevExtra(d, r);
    d.settings.sms = { templates: Object.assign({}, DEF_TEMPLATES), events: { orderPlaced: true, sellerNewOrder: true, shipped: true, delivered: true, cancelled: true, returned: true, storeApproved: true }, otpOnRegister: false, voiceLateOrder: true };
    d.settings.integrations = {};
    d.smsLog = [];
    d.users.forEach((u, i) => { if (u.role === 'customer') u.smsConsent = i % 10 < 7; });
    const now = Date.now();
    const demo = d.orders.slice(-6).reverse();
    demo.forEach((o, i) => d.smsLog.push({ id: i + 1, phone: mask(o.address.phone), event: i % 2 ? 'shipped' : 'orderPlaced', message: fill(i % 2 ? DEF_TEMPLATES.shipped : DEF_TEMPLATES.orderPlaced, { ad: o.address.name.split(' ')[0], siparisNo: o.id, tutar: U.tl(o.total), magaza: (d.stores.find(s => s.id === o.packages[0].storeId) || {}).name, kargo: 'Yurtiçi Kargo', takipNo: 'MB' + (438000000 + o.id) }), status: 'demo', createdAt: now - (i + 1) * 3 * 3600e3 }));
  };

  // Uygulama açılırken sunucuyu yokla (statik önizlemede sessizce demo modunda kalır)
  Api.check().then(on => { if (on && ['/checkout', '/admin/integrations', '/admin/sms'].includes(Router.current().path) && Router.path) Router.refresh(); });
})();
