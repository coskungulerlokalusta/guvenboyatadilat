/* MarkaBahçem — XML bayilik (dropshipping) yönetimi
   Her XML bayilik için platform sahibine ait, kendi marka adıyla bir mağaza açılır.
   Ürün/stok/fiyat bayinin XML'inden senkronlanır; müşteri sipariş verince bayiye
   "şu adrese gönder" tedarik siparişi iletilir, bayinin takip numarası müşteriye yansır.
   Yasal zorunluluk: satıcı bilgisi (unvan, adres, vergi/MERSİS) her mağazada şirketin
   gerçek bilgileriyle gösterilir (Mesafeli Sözleşmeler Yönetmeliği md. 5). */
(function () {
  'use strict';
  const C = window.Carsim;
  const { U, Svc, K, Auth, DB, Router, Modal, Store, Xml, Api } = C;
  const esc = U.esc;
  const go = p => Router.go(p);
  const A = C.AdminPages;
  const DAY = U.DAY;

  const PO_STATUS = { pending: ['Bayiye iletilecek', 'b-warn'], sent: ['Bayiye iletildi', 'b-info'], confirmed: ['Bayi onayladı', 'b-teal'], shipped: ['Kargoda', 'b-brand'], delivered: ['Teslim edildi', 'b-ok'], problem: ['Sorun var', 'b-bad'], cancelled: ['İptal', 'b-mute'] };
  const METHODS = { whatsapp: '💬 WhatsApp', sms: '📱 SMS (Netgsm)', email: '✉️ E-posta', api: '🔗 Bayi API / webhook', manual: '📋 Manuel (kopyala)' };
  const CARRIERS = ['Yurtiçi Kargo', 'Aras Kargo', 'MNG Kargo', 'Sürat Kargo', 'PTT Kargo', 'HepsiJET', 'Kolay Gelsin', 'Trendyol Express'];

  /* XML'de sık geçen bayi alan adları */
  const addSyn = (f, list) => { const x = Xml.FIELDS.find(r => r[0] === f); if (x) list.forEach(s => { if (!x[3].includes(s)) x[3].push(s); }); };
  addSyn('listPrice', ['piyasasatisfiyati', 'psf', 'tavsiyesatisfiyati', 'tavsiyefiyat', 'perakendefiyati']);
  addSyn('cost', ['bayifiyati', 'bayi_fiyati', 'toptanfiyat', 'toptanfiyati', 'alisfiyat', 'netfiyat']);
  addSyn('sku', ['urunkodu', 'stokkod', 'productid', 'varyantkodu']);
  // Satış fiyatı alanına "PiyasaSatisFiyati" düşmesin
  const priceRow = Xml.FIELDS.find(r => r[0] === 'price');
  const baseGuess = Xml.guess.bind(Xml);
  Xml.guess = keys => { const m = baseGuess(keys); if (m.price && /piyasa|psf|tavsiye|perakende/i.test(m.price)) { const alt = keys.find(k => priceRow[3].includes(k.toLowerCase().replace(/[^a-z]/g, '')) && !/piyasa|psf|tavsiye/i.test(k)); if (alt) m.price = alt; else delete m.price; } return m; };

  /* Kendi mağazalarında fiyat artış onayı gerekmez (satıcı ve platform aynı) */
  const baseNeeds = Svc.needsApproval.bind(Svc);
  Svc.needsApproval = function (p, np) { const s = this.store(p.storeId); if (s && s.house) return null; return baseNeeds(p, np); };

  const company = () => Object.assign({ title: '', taxOffice: '', taxNo: '', mersis: '', address: '', phone: '', email: '', kep: '' }, DB.settings.company);
  Svc.sellerInfo = s => {
    if (s && s.house) { const c = company(); return { title: c.title || '(Şirket unvanı girilmedi)', taxOffice: c.taxOffice, taxNo: c.taxNo, mersis: c.mersis, address: c.address, phone: c.phone, email: c.email, kep: c.kep }; }
    return { title: (s && s.legalTitle) || (s ? s.name : ''), taxNo: s ? s.taxNo : '', address: s ? s.city : '', phone: s ? s.phone : '' };
  };

  /* ---------------- Tedarik siparişi mantığı ---------------- */
  const Drop = C.Drop = {
    PO_STATUS, METHODS,
    suppliers() { return DB.all('suppliers'); },
    supplierOf(storeId) { return DB.all('suppliers').find(s => s.storeId === storeId) || null; },
    houseStores() { return DB.where('stores', s => s.house); },
    message(po) {
      const sup = DB.get('suppliers', po.supplierId) || {};
      const a = po.address;
      return `${DB.settings.siteName} yeni siparis\nTedarik no: TS-${po.id} / Siparis no: ${po.orderId}\n\nAlici: ${a.name}\nTelefon: ${a.phone}\nAdres: ${a.line}, ${a.district}/${a.city}\n\nUrunler:\n${po.items.map(i => `- ${i.sku} | ${i.title}${i.variant ? ' | ' + i.variant : ''} | ${i.qty} adet`).join('\n')}\n\nToplam alis: ${U.tl(po.costTotal)}\nLutfen urunleri ${DB.settings.siteName} adina (faturasiz / fiyatsiz irsaliye ile) alici adresine gonderip kargo takip numarasini iletin.${sup.note ? '\nNot: ' + sup.note : ''}`;
    },
    payload(po) {
      return { reference: 'TS-' + po.id, orderNo: po.orderId, shipTo: { name: po.address.name, phone: po.address.phone, address: po.address.line, district: po.address.district, city: po.address.city }, items: po.items.map(i => ({ sku: i.sku, name: i.title, variant: i.variant, quantity: i.qty, unitCost: i.cost })), totalCost: po.costTotal, dropship: true };
    },
    createFromOrder(order) {
      order.packages.forEach(pk => {
        const st = Svc.store(pk.storeId); if (!st || !st.house) return;
        const sup = this.supplierOf(st.id);
        const items = pk.items.map(it => { const p = Svc.product(it.productId) || {}; return { productId: it.productId, sku: p.supplierSku || p.sku || '', title: it.title, variant: it.variant, qty: it.qty, cost: U.round2(p.cost || 0), price: it.price }; });
        const po = DB.insert('purchaseOrders', {
          orderId: order.id, storeId: st.id, supplierId: sup ? sup.id : null, items, address: order.address, status: 'pending',
          costTotal: U.round2(U.sum(items, i => i.cost * i.qty)), saleTotal: U.round2(pk.subtotal - (pk.discount || 0) + pk.shipping), shippingCharged: pk.shipping,
          history: [{ s: 'pending', t: Date.now() }], carrier: '', tracking: '', note: ''
        });
        DB.where('users', u => u.role === 'admin').forEach(a => Svc.notify(a.id, `📦 ${st.name} için bayiye iletilecek yeni sipariş: TS-${po.id} (${U.tl(po.costTotal)} alış)`, '/admin/dropship?t=orders'));
        if (sup && sup.autoForward && ['sms', 'email', 'api'].includes(sup.method)) this.forward(po, { silent: true });
      });
    },
    setStatus(po, status, extra = {}) {
      po.status = status; po.history.push({ s: status, t: Date.now() }); Object.assign(po, extra);
      const order = DB.all('orders').find(o => o.id === po.orderId);
      const pk = order && order.packages.find(p => p.storeId === po.storeId);
      if (order && pk) {
        if (status === 'confirmed' && pk.status === 'new') Svc.pkgStatus(order, po.storeId, 'preparing');
        if (status === 'shipped' && ['new', 'preparing'].includes(pk.status)) Svc.pkgStatus(order, po.storeId, 'shipped', { carrier: po.carrier, tracking: po.tracking });
        if (status === 'delivered' && pk.status === 'shipped') Svc.pkgStatus(order, po.storeId, 'delivered');
        if (status === 'cancelled' && ['new', 'preparing'].includes(pk.status)) Svc.pkgStatus(order, po.storeId, 'cancelled');
      }
      DB.save();
    },
    /** Tedarik siparişini bayiye iletir. Dönen değer: { ok, msg, link? } */
    async forward(po, { method, silent = false } = {}) {
      const sup = DB.get('suppliers', po.supplierId);
      if (!sup) return { ok: false, msg: 'Bu mağazaya bağlı bayi yok' };
      const m = method || sup.method || 'manual';
      const text = this.message(po);
      const done = via => { this.setStatus(po, 'sent', { sentVia: via, sentAt: Date.now() }); return { ok: true, msg: 'Bayiye iletildi (' + METHODS[via] + ')' }; };
      try {
        if (m === 'whatsapp') {
          const ph = String(sup.whatsapp || sup.phone || '').replace(/\D/g, '').replace(/^0/, '90').replace(/^(?!90)/, '90');
          return { ok: false, link: 'https://wa.me/' + ph + '?text=' + encodeURIComponent(text), text, msg: 'WhatsApp mesajı hazır' };
        }
        if (m === 'manual') return { ok: false, text, msg: 'Metni kopyalayıp bayiye ilet' };
        if (!Api.online || !Api.key()) {
          if (silent) { po.note = 'Otomatik iletim için sunucu bağlantısı gerekli'; DB.save(); return { ok: false, msg: po.note }; }
          C.Sms && C.Sms.log({ phone: sup.phone, message: text, event: 'supplierOrder', status: 'demo' });
          return Object.assign(done(m), { msg: 'Demo modu: iletim kaydedildi, gerçek ' + METHODS[m] + ' gönderilmedi' });
        }
        if (m === 'sms') await Api.req('POST', '/api/suppliers/forward', { method: 'sms', to: sup.phone, text }, true);
        if (m === 'email') await Api.req('POST', '/api/suppliers/forward', { method: 'email', to: sup.email, subject: `${DB.settings.siteName} siparis TS-${po.id}`, text }, true);
        if (m === 'api') await Api.req('POST', '/api/suppliers/forward', { method: 'api', url: sup.apiUrl, token: sup.apiToken, payload: this.payload(po) }, true);
        return done(m);
      } catch (e) {
        po.note = 'İletim hatası: ' + e.message; DB.save();
        return { ok: false, msg: (C.friendlyError || String)(e.message) };
      }
    },
    /** Bayinin XML'ini indirir (veya verilen metni kullanır) ve mağazaya işler. */
    async sync(sup, { text = null, file = '' } = {}) {
      const st = Svc.store(sup.storeId);
      if (!text) {
        if (!sup.feedUrl) throw new Error('Bayinin XML adresi girilmemiş');
        if (!Api.online || !Api.key()) throw new Error('XML adresinden otomatik çekmek için sunucu bağlantısı gerekli. Şimdilik dosyayı yükleyerek senkronize edebilirsin.');
        text = (await Api.req('POST', '/api/suppliers/xml-fetch', { url: sup.feedUrl, user: sup.feedUser, pass: sup.feedPass }, true)).text;
      }
      const P = Xml.parse(text);
      if (P.error) throw new Error(P.error);
      const map = Object.assign(Xml.guess(P.keys), sup.map || {});
      const pr = sup.pricing || {};
      const opt = { create: true, update: true, publish: true, stockOnly: false, content: false, deactivate: !!sup.deactivateMissing, priceMode: pr.mode || 'cost', markup: +pr.value || 0, rounding: pr.rounding || '90' };
      if (opt.priceMode === 'cost' && !map.cost) opt.priceMode = map.price ? 'markup' : 'asis';
      const catMap = sup.catMap || {};
      U.uniq(P.items.map(it => Xml.str(it, map.category))).forEach(c => { if (!catMap[c]) catMap[c] = sup.defaultCat || Xml.guessCat(c, st); });
      const rows = Xml.rows(P, map, catMap, opt, st);
      const res = Xml.import(rows, opt, st, { file: file || sup.feedUrl || 'dosya', source: 'Bayi: ' + sup.name });
      // bayi bağlantısı, en az kâr koruması ve PSF üstü çizili kuralı
      const skus = new Set(rows.filter(r => r.status !== 'error').map(r => U.lower(r.d.sku)));
      DB.where('products', p => p.storeId === st.id && skus.has(U.lower(p.sku))).forEach(p => {
        p.supplierId = sup.id; p.supplierSku = p.sku;
        if (!pr.showPsf) p.listPrice = 0;
        const minP = +pr.minProfit || 0;
        if (p.cost > 0 && minP && p.price - p.cost < minP) Svc.applyPrice(p, Math.ceil(p.cost + minP) - 0.1, 'Bayi senkronu: en az kâr');
        if (p.stock <= 0 && sup.hideOutOfStock) p.status = 'passive';
        else if (p.stock > 0 && p.status === 'passive' && sup.hideOutOfStock) p.status = 'active';
      });
      sup.map = map; sup.catMap = catMap; sup.lastSync = Date.now(); sup.lastResult = { total: rows.length, created: res.created, updated: res.updated, errors: res.errors };
      DB.save();
      return res;
    },
    stats(days = 30) {
      const since = Date.now() - days * DAY;
      const pos = DB.where('purchaseOrders', p => p.createdAt >= since);
      return this.suppliers().map(sup => {
        const mine = pos.filter(p => p.supplierId === sup.id);
        const ok = mine.filter(p => !['cancelled'].includes(p.status));
        const lead = ok.map(p => { const a = p.history.find(h => h.s === 'sent'), b = p.history.find(h => h.s === 'shipped'); return a && b ? (b.t - a.t) / 3600e3 : null; }).filter(x => x != null);
        const sales = U.sum(ok, p => p.saleTotal), cost = U.sum(ok, p => p.costTotal), ship = U.sum(ok, p => sup.shipCost || 0);
        const pay = U.sum(ok, p => p.saleTotal * (DB.settings.paymentFeePct || 2.99) / 100);
        return { sup, store: Svc.store(sup.storeId), count: mine.length, open: mine.filter(p => ['pending', 'sent', 'confirmed', 'problem'].includes(p.status)).length, sales, cost, ship, pay, profit: sales - cost - ship - pay, lead: lead.length ? U.sum(lead) / lead.length : null, problems: mine.filter(p => p.status === 'problem').length };
      });
    }
  };

  /* Sipariş verilince kendi mağazalarındaki paketler için tedarik siparişi aç */
  const basePlace = Svc.placeOrder;
  Svc.placeOrder = function (args) { const r = basePlace.call(this, args); if (r.order) Drop.createFromOrder(r.order); return r; };

  /* ---------------- Örnek bayi XML'leri ---------------- */
  const SAMPLES = {
    ayakkabi: { cat: 'Ayakkabı & Çanta', items: [['AS-1001', 'Günlük Triko Sneaker Siyah', 'StepOn', 'Ayakkabı > Spor Ayakkabı', 385, 899, 42, '36,37,38,39,40,41'], ['AS-1002', 'Kalın Taban Beyaz Spor Ayakkabı', 'StepOn', 'Ayakkabı > Spor Ayakkabı', 420, 949, 30, '36,37,38,39,40'], ['AS-1003', 'Hakiki Deri Loafer Taba', 'Kuzey Deri', 'Ayakkabı > Klasik', 690, 1499, 18, '40,41,42,43,44'], ['AS-1004', 'Fermuarlı Kadın Bot Siyah', 'Kuzey Deri', 'Ayakkabı > Bot', 760, 1690, 12, '36,37,38,39,40'], ['AS-1005', 'Hafif Yürüyüş Ayakkabısı Gri', 'Rota', 'Ayakkabı > Spor Ayakkabı', 455, 999, 0, '40,41,42,43'], ['AS-1006', 'Kadın Babet Bej', 'Nora', 'Ayakkabı > Babet', 240, 549, 65, '36,37,38,39,40'], ['AS-1007', 'Çocuk Işıklı Spor Ayakkabı', 'Mini Adım', 'Ayakkabı > Çocuk', 280, 649, 24, '26,27,28,29,30,31'], ['AS-1008', 'Deri Sırt Çantası Kahve', 'Kuzey Deri', 'Çanta > Sırt Çantası', 540, 1199, 9, '']] },
    taki: { cat: 'Saat & Aksesuar', items: [['MB-T201', '925 Ayar Gümüş Sonsuzluk Kolye', 'Işıltı', 'Takı > Kolye', 210, 549, 40, ''], ['MB-T202', 'Zirkon Taşlı Tektaş Yüzük', 'Işıltı', 'Takı > Yüzük', 165, 449, 55, '14,15,16,17,18'], ['MB-T203', 'Çelik Hasır Bileklik Rose', 'Aura', 'Takı > Bileklik', 95, 279, 120, ''], ['MB-T204', 'İnci Detaylı Küpe', 'Aura', 'Takı > Küpe', 70, 199, 88, ''], ['MB-T205', 'Harf Kolye Altın Kaplama', 'Işıltı', 'Takı > Kolye', 130, 349, 60, 'A,B,C,D,E,M,S,Z'], ['MB-T206', 'Taşlı Saç Tokası 3\'lü Set', 'Aura', 'Aksesuar > Saç', 45, 149, 150, ''], ['MB-T207', 'Minimal Çelik Kadın Saat', 'Zaman', 'Saat > Kadın Saat', 390, 899, 14, ''], ['MB-T208', 'Nazar Boncuklu Halhal', 'Aura', 'Takı > Halhal', 55, 169, 0, '']] }
  };
  const sampleXml = kind => {
    const s = SAMPLES[kind] || SAMPLES.ayakkabi;
    const x = v => esc(String(v));
    return `<?xml version="1.0" encoding="UTF-8"?>\n<Urunler>\n${s.items.map(([sku, t, b, c, cost, psf, stock, v]) => `  <Urun>\n    <UrunKodu>${x(sku)}</UrunKodu>\n    <Barkod>869${String(Math.abs(sku.split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7))).padStart(10, '0').slice(0, 10)}</Barkod>\n    <UrunAdi>${x(t)}</UrunAdi>\n    <Marka>${x(b)}</Marka>\n    <Kategori>${x(c)}</Kategori>\n    <BayiFiyati>${String(cost).replace('.', ',')}</BayiFiyati>\n    <PiyasaSatisFiyati>${String(psf).replace('.', ',')}</PiyasaSatisFiyati>\n    <Stok>${stock}</Stok>${v ? `\n    <Beden>${x(v)}</Beden>` : ''}\n    <Aciklama>${x(t)}. Bayi stoğundan aynı gün kargo.</Aciklama>\n  </Urun>`).join('\n')}\n</Urunler>\n`;
  };

  /* ---------------- Yeni bayilik + mağaza sihirbazı ---------------- */
  function supplierModal(sup, done) {
    const isNew = !sup;
    const st = sup ? Svc.store(sup.storeId) : null;
    const s = sup ? JSON.parse(JSON.stringify(sup)) : { name: '', contact: '', phone: '', whatsapp: '', email: '', feedUrl: '', method: 'whatsapp', autoForward: false, apiUrl: '', apiToken: '', shipDays: 1, shipCost: 0, note: '', hideOutOfStock: true, deactivateMissing: false, pricing: { mode: 'cost', value: 60, minProfit: 100, rounding: '90', showPsf: false } };
    const cats = Svc.cats();
    const logos = ['👟', '💍', '👜', '👗', '⌚', '🕶️', '💄', '🧸', '🏠', '📱', '🎁', '🌸', '✨', '🧿'];
    const colors = ['#f25c05', '#c2418a', '#7c5cd6', '#0e7c74', '#2459d6', '#a16207', '#1a1815', '#d92626'];
    Modal.open({
      title: isNew ? 'Yeni XML bayilik ve mağaza' : s.name + ' · bayi ayarları', wide: true,
      body: `<div class="stack lg">
        ${isNew ? `<section class="stack"><b>1. Vitrinde görünecek mağaza</b><div class="form-grid">
          <div class="field"><label for="hs-n">Mağaza adı</label><input class="input" id="hs-n" placeholder="Örn: Ayakkabı Standı"></div>
          <div class="field"><label for="hs-c">Ana kategori</label><select class="select" id="hs-c">${cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
          <div class="field full"><label for="hs-d">Mağaza açıklaması</label><input class="input" id="hs-d" placeholder="Örn: Günlük ve spor ayakkabıda en yeni modeller, aynı gün kargo."></div></div>
          <div class="row"><span class="lbl">Logo</span><div class="row" id="hs-l" style="gap:4px">${logos.map((l, i) => `<button type="button" class="chip ${i ? '' : 'on'}" data-l="${l}">${l}</button>`).join('')}</div></div>
          <div class="row"><span class="lbl">Renk</span><div class="color-row" id="hs-k">${colors.map((c, i) => `<button type="button" class="${i ? '' : 'on'}" data-k="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div></div></section>` : ''}
        <section class="stack"><b>${isNew ? '2. ' : ''}Bayi (tedarikçi) bilgileri</b><div class="form-grid">
          <div class="field"><label for="sp-n">Bayi / firma adı</label><input class="input" id="sp-n" value="${esc(s.name)}" placeholder="Örn: Adım Toptan Ayakkabı"></div>
          <div class="field"><label for="sp-c">Yetkili kişi</label><input class="input" id="sp-c" value="${esc(s.contact)}"></div>
          <div class="field"><label for="sp-p">Telefon</label><input class="input" id="sp-p" value="${esc(s.phone)}" placeholder="05XX XXX XX XX"></div>
          <div class="field"><label for="sp-w">WhatsApp (farklıysa)</label><input class="input" id="sp-w" value="${esc(s.whatsapp)}"></div>
          <div class="field"><label for="sp-e">E-posta</label><input class="input" id="sp-e" value="${esc(s.email)}"></div>
          <div class="field"><label for="sp-sd">Bayinin kargoya verme süresi (gün)</label><input class="input" id="sp-sd" type="number" min="0" value="${s.shipDays}"></div>
          <div class="field full"><label for="sp-f">XML adresi</label><input class="input" id="sp-f" value="${esc(s.feedUrl)}" placeholder="https://bayi.com/xml/urunler.xml?key=…"></div>
          <div class="field"><label for="sp-fu">XML kullanıcı adı (varsa)</label><input class="input" id="sp-fu" value="${esc(s.feedUser || '')}"></div>
          <div class="field"><label for="sp-fp">XML şifresi (varsa)</label><input class="input" id="sp-fp" type="password" value="${esc(s.feedPass || '')}"></div></div></section>
        <section class="stack"><b>${isNew ? '3. ' : ''}Sipariş iletimi</b><div class="form-grid">
          <div class="field"><label for="sp-m">Siparişler bayiye nasıl iletilsin?</label><select class="select" id="sp-m">${Object.entries(METHODS).map(([k, v]) => `<option value="${k}" ${s.method === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          <div class="field"><label for="sp-au">Bayi API adresi (API seçildiyse)</label><input class="input" id="sp-au" value="${esc(s.apiUrl)}" placeholder="https://bayi.com/api/siparis"></div>
          <div class="field"><label for="sp-at">API anahtarı</label><input class="input" id="sp-at" type="password" value="${esc(s.apiToken)}"></div>
          <div class="field"><label for="sp-sc">Bayinin kargo ücreti (sipariş başı, TL)</label><input class="input" id="sp-sc" type="number" min="0" step="0.01" value="${s.shipCost}"></div>
          <div class="field full"><label for="sp-no">Bayiye her siparişte gidecek not</label><input class="input" id="sp-no" value="${esc(s.note)}" placeholder="Örn: Paketin üzerine ${esc(DB.settings.siteName)} etiketi yapıştırın."></div></div>
          <label class="check small"><input type="checkbox" id="sp-af" ${s.autoForward ? 'checked' : ''}> Sipariş gelince otomatik ilet (SMS, e-posta ve API için; WhatsApp tek tıkla gönderilir)</label></section>
        <section class="stack"><b>${isNew ? '4. ' : ''}Fiyatlandırma ve stok</b><div class="form-grid">
          <div class="field"><label for="pr-m">Satış fiyatı</label><select class="select" id="pr-m"><option value="cost" ${s.pricing.mode === 'cost' ? 'selected' : ''}>Bayi (alış) fiyatı + % kâr</option><option value="markup" ${s.pricing.mode === 'markup' ? 'selected' : ''}>XML'deki satış fiyatı + %</option><option value="asis" ${s.pricing.mode === 'asis' ? 'selected' : ''}>XML'deki satış fiyatı aynen</option></select></div>
          <div class="field"><label for="pr-v">Kâr oranı (%)</label><input class="input" id="pr-v" type="number" value="${s.pricing.value}"></div>
          <div class="field"><label for="pr-mp">Ürün başı en az kâr (TL)</label><input class="input" id="pr-mp" type="number" value="${s.pricing.minProfit}"></div>
          <div class="field"><label for="pr-r">Yuvarlama</label><select class="select" id="pr-r">${[['90', ',90 ile bitir'], ['99', ',99 ile bitir'], ['0', 'Tam sayı'], ['none', 'Yok']].map(([k, v]) => `<option value="${k}" ${s.pricing.rounding === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div>
          <label class="check small"><input type="checkbox" id="sp-hs" ${s.hideOutOfStock ? 'checked' : ''}> Bayide stoğu biten ürünü vitrinden gizle, stok gelince geri aç</label>
          <label class="check small"><input type="checkbox" id="sp-dm" ${s.deactivateMissing ? 'checked' : ''}> Bayinin XML'inden çıkan ürünleri pasife al</label>
          <label class="check small"><input type="checkbox" id="pr-psf" ${s.pricing.showPsf ? 'checked' : ''}> Bayinin tavsiye satış fiyatını üstü çizili göster</label>
          <div class="xs muted">⚖️ Üstü çizili fiyat, ürünün son 30 günde gerçekten satıldığı en düşük fiyat olmalı (Haksız Ticari Uygulamalar Yönetmeliği). Tavsiye fiyatını üstü çizili göstermek bu yüzden varsayılan olarak kapalı.</div></section>
      </div>`,
      onMount(bg) {
        const pick = (id, attr) => { const box = U.$(id, bg); if (box) box.onclick = e => { const b = e.target.closest('[' + attr + ']'); if (!b) return; U.$$('[' + attr + ']', box).forEach(x => x.classList.toggle('on', x === b)); }; };
        pick('#hs-l', 'data-l'); pick('#hs-k', 'data-k');
      },
      actions: [{ label: 'Vazgeç' }, { label: isNew ? 'Mağazayı aç' : 'Kaydet', primary: true, onClick: bg => {
        const v = id => (U.$(id, bg) || { value: '' }).value.trim();
        const chk = id => U.$(id, bg).checked;
        Object.assign(s, { name: v('#sp-n'), contact: v('#sp-c'), phone: v('#sp-p'), whatsapp: v('#sp-w'), email: v('#sp-e'), shipDays: +v('#sp-sd') || 0, feedUrl: v('#sp-f'), feedUser: v('#sp-fu'), feedPass: v('#sp-fp'), method: v('#sp-m'), apiUrl: v('#sp-au'), apiToken: v('#sp-at'), shipCost: +v('#sp-sc') || 0, note: v('#sp-no'), autoForward: chk('#sp-af'), hideOutOfStock: chk('#sp-hs'), deactivateMissing: chk('#sp-dm'), pricing: { mode: v('#pr-m'), value: +v('#pr-v') || 0, minProfit: +v('#pr-mp') || 0, rounding: v('#pr-r'), showPsf: chk('#pr-psf') } });
        if (!s.name) { C.toast('Bayi adını gir', { icon: '⚠️' }); return false; }
        if (s.method === 'email' && !s.email) { C.toast('E-posta ile iletim için bayinin e-posta adresi gerekli', { icon: '⚠️' }); return false; }
        if (['sms', 'whatsapp'].includes(s.method) && !(s.whatsapp || s.phone)) { C.toast('Bayinin telefonu gerekli', { icon: '⚠️' }); return false; }
        if (isNew) {
          const name = v('#hs-n');
          if (!name) { C.toast('Mağaza adını gir', { icon: '⚠️' }); return false; }
          if (DB.all('stores').some(x => U.lower(x.name) === U.lower(name))) { C.toast('Bu isimde bir mağaza var', { icon: '⚠️' }); return false; }
          const cat = +v('#hs-c'); const logo = (U.$('#hs-l .on', bg) || {}).dataset.l || '🏪'; const color = (U.$('#hs-k .on', bg) || {}).dataset.k || '#f25c05';
          const c = company();
          const owner = DB.insert('users', { name: name + ' Yönetimi', email: 'magaza-' + U.slug(name) + '@' + U.slug(DB.settings.siteName) + '.local', password: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2), role: 'seller', addresses: [], favorites: [], viewed: [], cmp: [], phone: c.phone || '', internal: true });
          const store = DB.insert('stores', { ownerId: owner.id, house: true, name, slug: U.slug(name), key: U.slug(name), cats: [cat], logo, logoImg: '', color, cover: [color, '#1a1815'], coverImg: '', description: v('#hs-d') || name, city: (c.address.split(/[ ,/]+/).filter(Boolean).pop()) || 'İstanbul', status: 'active', shippingFee: 49.99, freeShipOver: 500, followers: [], followerBase: 0, taxNo: c.taxNo, iban: '', phone: c.phone, shipDays: s.shipDays, official: false, commission: 0, banners: [{ id: 1, title: name, subtitle: v('#hs-d') || 'Yeni sezon ürünleri', c1: color, c2: '#1a1815', emoji: logo, link: '', active: true }], announcement: '' });
          owner.storeId = store.id;
          s.storeId = store.id; s.defaultCat = cat + '|' + Svc.cat(cat).subs[0];
          const row = DB.insert('suppliers', s);
          C.toast(`${name} mağazası açıldı. Şimdi bayinin XML'ini senkronize et.`, { icon: '🏪', ms: 4500 });
          done && done(row);
        } else { Object.assign(sup, s); Svc.store(sup.storeId).shipDays = s.shipDays; DB.save(); C.toast('Bayi ayarları kaydedildi'); done && done(sup); }
      } }]
    });
  }

  function syncModal(sup, after) {
    const kind = /ayakkab|bot|sneaker|çanta/i.test(sup.name + Svc.store(sup.storeId).name) ? 'ayakkabi' : 'taki';
    Modal.open({
      title: sup.name + ' · XML senkronu', body: `<div class="stack">
        <p class="small muted">Bayinin XML'i okunur; stok kodu eşleşen ürünler güncellenir, yeniler eklenir. Satış fiyatı: ${sup.pricing.mode === 'cost' ? `alış + %${sup.pricing.value}` : sup.pricing.mode === 'markup' ? `XML fiyatı + %${sup.pricing.value}` : 'XML fiyatı'}${sup.pricing.minProfit ? `, en az ${U.tl0(sup.pricing.minProfit)} kâr` : ''}.</p>
        ${sup.feedUrl ? `<button class="btn btn-primary" id="syUrl" style="align-self:flex-start">🔄 XML adresinden çek</button><span class="xs muted">${esc(sup.feedUrl)}${Api.online && Api.key() ? '' : ' · sunucu bağlantısı gerekir'}</span>` : '<span class="small warn">Bayinin XML adresi girilmemiş.</span>'}
        <label class="img-drop" for="syFile" style="padding:20px">📄 Ya da XML dosyasını yükle<input type="file" id="syFile" accept=".xml,text/xml" hidden></label>
        <button class="btn btn-ghost btn-sm" id="sySample" style="align-self:flex-start">Örnek bayi XML'i ile dene</button>
        <div id="syOut"></div></div>`,
      onMount(bg) {
        const out = U.$('#syOut', bg);
        const run = async (text, file) => {
          out.innerHTML = '<p class="small muted">İşleniyor…</p>';
          try {
            const r = await Drop.sync(sup, { text, file });
            out.innerHTML = `<div class="insight good"><span class="ii">✅</span><div class="small"><b>Senkron tamam.</b> ${r.created} yeni ürün, ${r.updated} güncelleme${r.errors ? `, ${r.errors} hatalı satır` : ''}${r.deactivated ? `, ${r.deactivated} ürün pasife alındı` : ''}.</div></div>`;
            after && after();
          } catch (e) { out.innerHTML = `<div class="insight warnish"><span class="ii">⚠️</span><div class="small">${esc((C.friendlyError || String)(e.message))}</div></div>`; }
        };
        const u = U.$('#syUrl', bg); u && (u.onclick = () => run(null));
        U.$('#syFile', bg).onchange = e => { const f = e.target.files[0]; if (!f) return; const fr = new FileReader(); fr.onload = () => run(fr.result, f.name); fr.readAsText(f); };
        U.$('#sySample', bg).onclick = () => run(sampleXml(kind), 'ornek-bayi.xml');
      },
      actions: [{ label: 'Kapat', primary: true }]
    });
  }

  function forwardUi(po, after) {
    const sup = DB.get('suppliers', po.supplierId);
    if (!sup) return C.toast('Bu siparişin bağlı bayisi yok', { icon: '⚠️' });
    Drop.forward(po).then(r => {
      if (r.ok) { C.toast(r.msg, { icon: '📤' }); after && after(); return; }
      if (r.text) {
        Modal.open({
          title: `TS-${po.id} · bayiye ilet`, body: `<div class="stack"><p class="small muted">${esc(r.msg)}. Gönderdikten sonra "Bayiye iletildi" olarak işaretle.</p><textarea class="textarea" id="fwT" readonly style="min-height:230px;font-family:ui-monospace,monospace;font-size:.8rem">${esc(r.text)}</textarea>${r.link ? `<a class="btn btn-ok" href="${esc(r.link)}" target="_blank" rel="noopener">💬 WhatsApp'ta aç</a>` : ''}</div>`,
          actions: [{ label: 'Kopyala', onClick: () => { U.copy(r.text); return false; } }, { label: 'Bayiye iletildi', primary: true, onClick: () => { Drop.setStatus(po, 'sent', { sentVia: sup.method, sentAt: Date.now() }); after && after(); } }]
        });
        return;
      }
      Modal.open({ title: 'İletilemedi', body: `<p>${esc(r.msg)}</p>`, actions: [{ label: 'Tamam', primary: true }] });
    });
  }

  /* ---------------- Yönetim sayfası ---------------- */
  A.dropship = (_, q) => {
    const u = Auth.user();
    if (!u) return { redirect: '/login?next=' + encodeURIComponent(Router.path) };
    if (u.role !== 'admin') return { redirect: '/' };
    const tab = q.t || 'suppliers';
    const sups = Drop.suppliers();
    const pos = DB.all('purchaseOrders').slice().sort((a, b) => b.createdAt - a.createdAt);
    const openN = pos.filter(p => ['pending', 'problem'].includes(p.status)).length;
    const c = company();
    const stats = Drop.stats(30);
    const tabs = [['suppliers', `🏪 Bayilikler & mağazalar (${sups.length})`], ['orders', `📦 Tedarik siparişleri${openN ? ` <span class="badge b-brand">${openN}</span>` : ''}`], ['profit', '💰 Kârlılık'], ['company', `🧾 Satıcı bilgileri${c.title ? '' : ' <span class="badge b-bad">!</span>'}`]];
    let body = '';
    if (!c.title && tab !== 'company') body += `<div class="insight warnish" style="margin-bottom:14px"><span class="ii">⚖️</span><div class="small"><b>Şirket bilgilerin eksik.</b> Mesafeli satışta satıcının unvanı, adresi ve vergi/MERSİS bilgisi müşteriye gösterilmek zorunda. Kendi mağazalarının "Mağaza hakkında" bölümünde bu bilgiler görünür. <a class="bold" href="#/admin/dropship?t=company">Şimdi doldur →</a></div></div>`;
    if (tab === 'suppliers') {
      body += sups.length ? `<div class="store-list" style="grid-template-columns:repeat(auto-fill,minmax(340px,1fr))">${sups.map(sp => {
        const st = Svc.store(sp.storeId); if (!st) return '';
        const n = DB.where('products', p => p.storeId === st.id).length, live = DB.where('products', p => p.storeId === st.id && p.status === 'active').length;
        const s30 = stats.find(x => x.sup.id === sp.id) || {};
        return `<div class="card card-pad stack" style="gap:10px">
          <div class="row between nowrap"><div class="row nowrap" style="min-width:0">${K.storeAvatar(st, 44)}<div style="min-width:0"><b>${esc(st.name)}</b><div class="xs muted">Bayi: ${esc(sp.name)}${sp.contact ? ' · ' + esc(sp.contact) : ''}</div></div></div><span class="badge b-teal">Kendi mağazan</span></div>
          <div class="row small" style="gap:16px"><span><b>${live}</b>/${n} ürün yayında</span><span><b>${s30.count || 0}</b> sipariş (30g)</span><span class="${(s30.profit || 0) >= 0 ? 'ok' : 'bad'}"><b>${U.tl0(s30.profit || 0)}</b> kâr</span></div>
          <div class="xs muted">${METHODS[sp.method]} ile iletim${sp.autoForward ? ' · otomatik' : ''} · ${sp.pricing.mode === 'cost' ? 'alış + %' + sp.pricing.value : sp.pricing.mode === 'markup' ? 'XML fiyatı + %' + sp.pricing.value : 'XML fiyatı'} · ${sp.lastSync ? 'son senkron ' + U.ago(sp.lastSync) + (sp.lastResult ? ` (${sp.lastResult.created} yeni, ${sp.lastResult.updated} güncel)` : '') : '<span class="warn">henüz senkronlanmadı</span>'}</div>
          <div class="row" style="gap:6px"><button class="btn btn-sm btn-primary" data-sync="${sp.id}">🔄 XML senkronu</button><button class="btn btn-sm" data-edit="${sp.id}">Ayarlar</button><button class="btn btn-sm btn-ghost" data-manage="${st.id}">🎨 Mağazayı yönet</button><a class="btn btn-sm btn-ghost" href="#/store/${st.id}">👁 Vitrin</a></div>
        </div>`; }).join('')}</div>`
        : `<div class="card">${K.empty('🏪', 'Henüz XML bayiliğin yok', 'Her bayilik için kendi adı, logosu ve rengiyle bir mağaza açılır; ürünler bayinin XML\'inden gelir, siparişler bayiye iletilir.', '<button class="btn btn-primary" id="newSup2">+ İlk bayiliği ekle</button>')}</div>`;
    } else if (tab === 'orders') {
      const f = q.s || 'open';
      const list = f === 'all' ? pos : f === 'open' ? pos.filter(p => ['pending', 'sent', 'confirmed', 'problem'].includes(p.status)) : pos.filter(p => p.status === f);
      body += `<div class="tabs" style="margin-bottom:14px">${[['open', 'Açık'], ['pending', 'İletilecek'], ['sent', 'Bayide'], ['shipped', 'Kargoda'], ['delivered', 'Teslim'], ['problem', 'Sorunlu'], ['all', 'Tümü']].map(([k, l]) => `<a class="${f === k ? 'on' : ''}" href="#/admin/dropship?t=orders&s=${k}">${l} <span class="badge b-mute">${k === 'all' ? pos.length : k === 'open' ? pos.filter(p => ['pending', 'sent', 'confirmed', 'problem'].includes(p.status)).length : pos.filter(p => p.status === k).length}</span></a>`).join('')}</div>
        ${list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tedarik</th><th>Mağaza / bayi</th><th>Alıcı</th><th>Ürünler</th><th class="r">Satış</th><th class="r">Alış</th><th class="r">Brüt kâr</th><th>Durum</th><th></th></tr></thead><tbody>
          ${list.map(po => { const st = Svc.store(po.storeId), sp = DB.get('suppliers', po.supplierId); const late = ['pending', 'sent'].includes(po.status) && Date.now() - po.createdAt > ((sp ? sp.shipDays : 1) + 1) * DAY; return `<tr>
            <td><b>TS-${po.id}</b><div class="xs muted">Sipariş #${po.orderId} · ${U.ago(po.createdAt)}</div></td>
            <td class="small">${esc(st ? st.name : '')}<div class="xs muted">${esc(sp ? sp.name : 'Bayi yok')}</div></td>
            <td class="small" style="white-space:nowrap">${esc(po.address.name)}<div class="xs muted">${esc(po.address.city)}</div></td>
            <td class="xs" style="min-width:190px;max-width:260px">${po.items.map(i => `${i.qty} × <b>${esc(i.sku)}</b> ${esc(i.title.slice(0, 40))}${i.variant ? ' (' + esc(i.variant) + ')' : ''}`).join('<br>')}</td>
            <td class="r">${U.tl(po.saleTotal)}</td><td class="r small">${U.tl(po.costTotal)}</td><td class="r"><b class="${po.saleTotal - po.costTotal >= 0 ? 'ok' : 'bad'}">${U.tl(po.saleTotal - po.costTotal)}</b></td>
            <td>${K.pill(PO_STATUS, po.status)}${late ? '<div class="xs bad">Gecikti</div>' : ''}${po.tracking ? `<div class="xs muted">${esc(po.carrier)} ${esc(po.tracking)}</div>` : ''}${po.note ? `<div class="xs warn">${esc(po.note)}</div>` : ''}</td>
            <td style="min-width:150px"><div class="row" style="gap:4px">
              ${['pending', 'problem'].includes(po.status) ? `<button class="btn btn-sm btn-primary" data-fw="${po.id}">📤 İlet</button>` : ''}
              ${po.status === 'sent' ? `<button class="btn btn-sm" data-ok="${po.id}">Onaylandı</button>` : ''}
              ${['sent', 'confirmed'].includes(po.status) ? `<button class="btn btn-sm btn-dark" data-track="${po.id}">🚚 Takip no</button>` : ''}
              ${po.status === 'shipped' ? `<button class="btn btn-sm btn-ok" data-dl="${po.id}">Teslim</button>` : ''}
              ${!['delivered', 'cancelled'].includes(po.status) ? `<button class="btn btn-sm btn-ghost" data-more="${po.id}" title="Diğer">⋯</button>` : ''}</div></td></tr>`; }).join('')}</tbody></table></div>` : K.empty('📦', 'Bu durumda tedarik siparişi yok', 'Kendi mağazalarından sipariş geldiğinde burada, bayiye iletilecek olarak görünür.')}`;
    } else if (tab === 'profit') {
      const tot = stats.reduce((a, x) => ({ sales: a.sales + x.sales, cost: a.cost + x.cost, ship: a.ship + x.ship, pay: a.pay + x.pay, profit: a.profit + x.profit, count: a.count + x.count }), { sales: 0, cost: 0, ship: 0, pay: 0, profit: 0, count: 0 });
      body += `<div class="kpis">${K.kpi('Satış (30 gün)', U.tl0(tot.sales))}${K.kpi('Bayiye ödenen', U.tl0(tot.cost))}${K.kpi('Net kâr (tahmini)', U.tl0(tot.profit))}${K.kpi('Kâr marjı', tot.sales ? '%' + (tot.profit / tot.sales * 100).toFixed(1).replace('.', ',') : '—')}${K.kpi('Tedarik siparişi', U.num(tot.count))}</div>
        <div class="tbl-wrap" style="margin-top:16px"><table class="tbl"><thead><tr><th>Mağaza / bayi</th><th class="r">Sipariş</th><th class="r">Satış</th><th class="r">Alış</th><th class="r">Bayi kargosu</th><th class="r">Ödeme komisyonu</th><th class="r">Net kâr</th><th class="r">Marj</th><th class="r">Ort. kargoya verme</th></tr></thead><tbody>
        ${stats.map(x => `<tr><td class="small"><b>${esc(x.store ? x.store.name : '')}</b><div class="xs muted">${esc(x.sup.name)}</div></td><td class="r">${x.count}${x.open ? ` <span class="xs muted">(${x.open} açık)</span>` : ''}</td><td class="r">${U.tl0(x.sales)}</td><td class="r">${U.tl0(x.cost)}</td><td class="r">${U.tl0(x.ship)}</td><td class="r">${U.tl0(x.pay)}</td><td class="r"><b class="${x.profit >= 0 ? 'ok' : 'bad'}">${U.tl0(x.profit)}</b></td><td class="r">${x.sales ? '%' + (x.profit / x.sales * 100).toFixed(1).replace('.', ',') : '—'}</td><td class="r small">${x.lead != null ? (x.lead < 24 ? Math.round(x.lead) + ' saat' : (x.lead / 24).toFixed(1).replace('.', ',') + ' gün') : '—'}</td></tr>`).join('')}</tbody></table></div>
        <p class="xs muted" style="margin-top:8px">Ödeme komisyonu %${DB.settings.paymentFeePct || 2.99} varsayılmıştır (iyzico sözleşmene göre Site ayarlarından değiştirilebilir). Reklam ve influencer giderleri dahil değildir.</p>`;
    } else {
      body += `<form class="card card-pad stack" id="coF" style="max-width:820px"><p class="small muted">Bu bilgiler kendi mağazalarının "Mağaza hakkında" bölümünde, ön bilgilendirme formunda ve faturalarda satıcı olarak yer alır. Mağaza adları farklı olsa da satıcı bilgisi yasal olarak şirketinin gerçek bilgisi olmalıdır.</p>
        <div class="form-grid">${[['title', 'Ticaret unvanı', 'Örn: Güven Boya Tadilat Ltd. Şti.'], ['taxOffice', 'Vergi dairesi', ''], ['taxNo', 'Vergi / TC kimlik no', ''], ['mersis', 'MERSİS no', ''], ['phone', 'Telefon', ''], ['email', 'E-posta', ''], ['kep', 'KEP adresi', ''], ['address', 'Açık adres', '']].map(([k, l, ph]) => `<div class="field ${k === 'address' ? 'full' : ''}"><label for="co-${k}">${l}</label><input class="input" id="co-${k}" data-co="${k}" value="${esc(c[k])}" placeholder="${esc(ph)}"></div>`).join('')}</div>
        <div class="field" style="max-width:260px"><label for="co-fee">Ödeme kuruluşu komisyonu (%)</label><input class="input" id="co-fee" type="number" step="0.01" value="${DB.settings.paymentFeePct || 2.99}"></div>
        <button class="btn btn-primary" style="align-self:flex-start">Kaydet</button></form>`;
    }
    const html = `<div class="tabs" style="margin-bottom:16px">${tabs.map(([k, l]) => `<a class="${tab === k ? 'on' : ''}" href="#/admin/dropship?t=${k}">${l}</a>`).join('')}</div>${body}`;
    return {
      layout: 'panel', panel: 'admin', title: 'XML bayilikler & mağazalarım', sub: 'Kendi mağazaların, bayi XML senkronu ve tedarik siparişleri', actions: '<button class="btn btn-primary" id="newSup">+ Yeni XML bayilik</button>', html,
      mount(main) {
        const re = () => Router.refresh();
        [U.$('#newSup'), U.$('#newSup2', main)].forEach(b => b && (b.onclick = () => supplierModal(null, sp => { re(); setTimeout(() => syncModal(sp, re), 300); })));
        const co = U.$('#coF', main);
        co && (co.onsubmit = e => { e.preventDefault(); const o = {}; U.$$('[data-co]', co).forEach(i => { o[i.dataset.co] = i.value.trim(); }); DB.settings.company = o; DB.settings.paymentFeePct = +U.$('#co-fee').value || 0; Drop.houseStores().forEach(s => { s.taxNo = o.taxNo; s.phone = o.phone || s.phone; }); DB.save(); C.toast('Satıcı bilgileri kaydedildi'); re(); });
        main.addEventListener('click', async e => {
          let b;
          if ((b = e.target.closest('[data-sync]'))) syncModal(DB.get('suppliers', b.dataset.sync), re);
          else if ((b = e.target.closest('[data-edit]'))) supplierModal(DB.get('suppliers', b.dataset.edit), re);
          else if ((b = e.target.closest('[data-manage]'))) { const st = Svc.store(+b.dataset.manage); Store.set('carsim_admin_back', Auth.user().id); Auth.loginAs(st.ownerId); C.toast(st.name + ' satıcı paneli açıldı. Yönetim paneline dönmek için çıkış yapıp yönetici olarak gir.', { icon: '🎨', ms: 4500 }); go('/seller/design'); }
          else if ((b = e.target.closest('[data-fw]'))) forwardUi(DB.get('purchaseOrders', b.dataset.fw), re);
          else if ((b = e.target.closest('[data-ok]'))) { Drop.setStatus(DB.get('purchaseOrders', b.dataset.ok), 'confirmed'); C.toast('Bayi onayı işlendi, müşterinin siparişi "Hazırlanıyor"'); re(); }
          else if ((b = e.target.closest('[data-dl]'))) { Drop.setStatus(DB.get('purchaseOrders', b.dataset.dl), 'delivered'); re(); }
          else if ((b = e.target.closest('[data-track]'))) {
            const po = DB.get('purchaseOrders', b.dataset.track);
            Modal.open({ title: `TS-${po.id} · kargo bilgisi`, body: `<div class="stack"><div class="field"><label for="tr-c">Kargo firması</label><select class="select" id="tr-c">${CARRIERS.map(x => `<option>${x}</option>`).join('')}</select></div><div class="field"><label for="tr-n">Takip numarası</label><input class="input" id="tr-n" placeholder="Bayinin ilettiği takip no"></div><p class="xs muted">Kaydedince müşterinin siparişi "Kargoda" olur ve müşteriye takip numarasıyla SMS gider.</p></div>`,
              actions: [{ label: 'Vazgeç' }, { label: 'Kaydet', primary: true, onClick: bg => { const n = U.$('#tr-n', bg).value.trim(); if (!n) { C.toast('Takip numarası gir', { icon: '⚠️' }); return false; } Drop.setStatus(po, 'shipped', { carrier: U.$('#tr-c', bg).value, tracking: n }); C.toast('Müşteriye kargo bilgisi iletildi 🚚'); re(); } }] });
          }
          else if ((b = e.target.closest('[data-more]'))) {
            const po = DB.get('purchaseOrders', b.dataset.more);
            Modal.open({ title: `TS-${po.id}`, body: `<div class="stack"><textarea class="textarea" readonly style="min-height:200px;font-family:ui-monospace,monospace;font-size:.8rem">${esc(Drop.message(po))}</textarea><div class="field"><label for="pb-n">Not / sorun açıklaması</label><input class="input" id="pb-n" value="${esc(po.note || '')}" placeholder="Örn: Bayide 38 numara kalmamış"></div></div>`,
              actions: [{ label: 'Kopyala', onClick: () => { U.copy(Drop.message(po)); return false; } }, { label: 'Sorun var', onClick: bg => { Drop.setStatus(po, 'problem', { note: U.$('#pb-n', bg).value.trim() }); re(); } }, { label: 'Siparişi iptal et', danger: true, onClick: bg => { Drop.setStatus(po, 'cancelled', { note: U.$('#pb-n', bg).value.trim() || 'Bayide stok yok' }); C.toast('Tedarik ve müşteri siparişi iptal edildi; müşteriye iade bildirimi gitti'); re(); } }, { label: 'Kapat', primary: true }] });
          }
        });
      }
    };
  };

  /* ---------------- Örnek veri: iki kendi mağazası ---------------- */
  const prevExtra = C.Seed.extra;
  C.Seed.extra = (d, r) => {
    if (prevExtra) prevExtra(d, r);
    d.settings.company = { title: '', taxOffice: '', taxNo: '', mersis: '', address: '', phone: '', email: '', kep: '' };
    d.settings.paymentFeePct = 2.99;
    d.suppliers = []; d.purchaseOrders = [];
    const now = Date.now();
    const mk = (name, logo, color, cat, sub, kind, supName, method, pct) => {
      const uid = d.users.length + 1;
      d.users.push({ id: uid, name: name + ' Yönetimi', email: 'magaza-' + U.slug(name) + '@markabahcem.local', password: Math.random().toString(36).slice(2), role: 'seller', addresses: [], favorites: [], viewed: [], cmp: [], phone: '', internal: true, createdAt: now - 20 * DAY });
      const sid = Math.max(...d.stores.map(s => s.id)) + 1;
      d.stores.push({ id: sid, ownerId: uid, house: true, name, slug: U.slug(name), key: U.slug(name), cats: [cat], logo, logoImg: '', color, cover: [color, '#1a1815'], coverImg: '', description: kind === 'taki' ? 'Gümüş, çelik ve bijuteri takılarda her gün yeni modeller.' : 'Günlük ve spor ayakkabıda sezonun en sevilen modelleri.', city: 'İstanbul', status: 'active', createdAt: now - 20 * DAY, shippingFee: 39.99, freeShipOver: 400, followers: [], followerBase: 0, taxNo: '', iban: '', phone: '', shipDays: 1, official: false, commission: 0, banners: [{ id: 1, title: name, subtitle: kind === 'taki' ? '925 ayar gümüş takılarda yeni sezon' : 'Yeni sezon sneaker modelleri', c1: color, c2: '#1a1815', emoji: logo, link: '', active: true }], announcement: '' });
      d.users[uid - 1].storeId = sid;
      const supId = d.suppliers.length + 1;
      d.suppliers.push({ id: supId, storeId: sid, name: supName, contact: 'Satış Temsilcisi', phone: '0532 000 00 0' + supId, whatsapp: '', email: 'siparis@' + U.slug(supName) + '.com', feedUrl: 'https://' + U.slug(supName) + '.com/xml/bayi.xml', method, autoForward: method !== 'whatsapp', apiUrl: '', apiToken: '', shipDays: 1, shipCost: 0, note: '', hideOutOfStock: true, deactivateMissing: false, pricing: { mode: 'cost', value: pct, minProfit: 80, rounding: '90', showPsf: false }, defaultCat: cat + '|' + sub, lastSync: now - 4 * 3600e3, lastResult: { total: 8, created: 0, updated: 8, errors: 0 }, createdAt: now - 20 * DAY });
      const bg = C.Seed.BG;
      SAMPLES[kind].items.forEach(([sku, title, brand, , cost, , stock, vars], i) => {
        const pid = Math.max(...d.products.map(p => p.id)) + 1;
        let price = cost * (1 + pct / 100); price = Math.max(price, cost + 80); price = Math.round(price) - 0.1;
        const e = kind === 'taki' ? ['📿', '💍', '✨', '💎', '🔤', '🎀', '⌚', '🧿'][i] : ['👟', '👟', '👞', '👢', '👟', '🥿', '👟', '🎒'][i];
        const b2 = bg[(i * 3 + sid) % bg.length];
        d.products.push({ id: pid, storeId: sid, categoryId: cat, sub: kind === 'taki' ? (i === 6 ? 'Kol Saati' : 'Takı') : (i === 7 ? 'Çanta' : i === 3 ? 'Bot' : 'Spor Ayakkabı'), title, brand, groupKey: null, price, listPrice: 0, cost, stock, variants: vars ? { name: kind === 'taki' ? (vars.includes('A') ? 'Harf' : 'Ölçü') : 'Numara', options: vars.split(',') } : null, images: [{ e, c1: b2[0], c2: b2[1] }], description: title + '. Bayi stoğundan aynı gün kargo.', specs: { Marka: brand }, tags: [U.lower(brand)], status: stock > 0 ? 'active' : 'passive', freeShipping: price >= 400, fastDelivery: true, createdAt: now - 20 * DAY, sold: 0, views: 30 + i * 11, rating: 0, reviewCount: 0, priceHistory: [[now - 20 * DAY, price]], sku, supplierSku: sku, supplierId: supId, featured: false, source: 'xml' });
      });
      return { sid, supId };
    };
    const a = mk('Ayakkabı Standı', '👟', '#f25c05', 7, 'Spor Ayakkabı', 'ayakkabi', 'Adım Toptan Ayakkabı', 'sms', 60);
    const b = mk('Merve Bijuteri', '💍', '#c2418a', 11, 'Takı', 'taki', 'Işıltı Aksesuar Toptan', 'whatsapp', 110);
    // örnek siparişler ve tedarik siparişleri (demo müşteri)
    const cust = d.users.find(u => u.email === 'musteri@markabahcem.com');
    [[a, 0, 'sent', 2], [a, 1, 'shipped', 30], [b, 1, 'pending', 1], [b, 0, 'delivered', 100]].forEach(([s, idx, st, hAgo], k) => {
      const p = d.products.filter(x => x.storeId === s.sid)[idx];
      const t = now - hAgo * 3600e3;
      const store = d.stores.find(x => x.id === s.sid);
      const shipping = p.price >= store.freeShipOver ? 0 : store.shippingFee;
      const variant = p.variants ? p.variants.options[1] : '';
      const pkStatus = { pending: 'new', sent: 'new', shipped: 'shipped', delivered: 'delivered' }[st];
      const hist = [{ s: 'new', t }].concat(['shipped', 'delivered'].includes(st) ? [{ s: 'preparing', t: t + 3600e3 }, { s: 'shipped', t: t + 20 * 3600e3 }] : []).concat(st === 'delivered' ? [{ s: 'delivered', t: t + 60 * 3600e3 }] : []);
      d.seq.orders = (d.seq.orders || 100000) + 1;
      const oid = d.seq.orders;
      const tracking = ['shipped', 'delivered'].includes(st) ? 'YK' + (70000000 + k * 1337) : '';
      d.orders.push({ id: oid, userId: cust.id, createdAt: t, address: cust.addresses[0], packages: [{ storeId: s.sid, items: [{ productId: p.id, storeId: s.sid, title: p.title, brand: p.brand, image: p.images[0], price: p.price, qty: 1, variant }], subtotal: p.price, shipping, discount: 0, status: pkStatus, history: hist, tracking, carrier: tracking ? 'Yurtiçi Kargo' : '' }], subtotal: p.price, shipping, discount: 0, total: U.round2(p.price + shipping), payment: { method: 'card', installments: 1, last4: '4242' }, coupon: '' });
      p.sold += 1; p.stock = Math.max(0, p.stock - 1);
      const phist = [{ s: 'pending', t }].concat(st !== 'pending' ? [{ s: 'sent', t: t + 600e3 }] : []).concat(['shipped', 'delivered'].includes(st) ? [{ s: 'shipped', t: t + 20 * 3600e3 }] : []).concat(st === 'delivered' ? [{ s: 'delivered', t: t + 60 * 3600e3 }] : []);
      d.purchaseOrders.push({ id: k + 1, orderId: oid, storeId: s.sid, supplierId: s.supId, items: [{ productId: p.id, sku: p.sku, title: p.title, variant, qty: 1, cost: p.cost, price: p.price }], address: cust.addresses[0], status: st, costTotal: p.cost, saleTotal: U.round2(p.price + shipping), shippingCharged: shipping, history: phist, carrier: tracking ? 'Yurtiçi Kargo' : '', tracking, note: '', sentVia: st === 'pending' ? '' : (s === a ? 'sms' : 'whatsapp'), createdAt: t });
    });
    d.seq.purchaseOrders = 4; d.seq.suppliers = 2;
  };
})();
