/* MarkaBahçem — entegrasyon: XML ürün yükleme, otomatik fiyatlandırma, fiyat artış talepleri */
(function () {
  'use strict';
  const C = window.Carsim;
  const { U, Svc, K, Auth, DB, Router, Modal } = C;
  const esc = U.esc;
  const go = p => Router.go(p);
  const DAY = U.DAY;
  const S = C.SellerPages, A = C.AdminPages;

  /* =====================================================================
     1) FİYAT DEĞİŞİKLİĞİ VE ONAY KURALI
     Tüm fiyat değişiklikleri Svc.setPrice'tan geçer. Artış, son 30 günün en
     yüksek fiyatına göre izin verilen sınırı aşarsa ya da ürün aktif bir
     flaş fırsattaysa fiyat değişmez, yöneticiye "fiyat artış talebi" düşer.
     ===================================================================== */
  const REASONS = ['Maliyet artışı', 'Döviz kuru değişimi', 'Tedarikçi zammı', 'Vergi / harç değişikliği', 'Hatalı fiyat düzeltme', 'Kampanya bitişi', 'Otomatik fiyat kuralı', 'XML fiyat güncellemesi', 'Diğer'];
  const REQ_STATUS = { pending: ['Onay bekliyor', 'b-warn'], approved: ['Onaylandı', 'b-ok'], partial: ['Kısmi onay', 'b-info'], rejected: ['Reddedildi', 'b-bad'], cancelled: ['Geri çekildi', 'b-mute'] };

  Object.assign(Svc, {
    PRICE_REASONS: REASONS, REQ_STATUS,
    priceLimit() { const v = DB.settings.priceIncreaseLimit; return v == null ? 15 : +v; },
    approvalOn() { return DB.settings.priceApproval !== false; },
    /** Son 30 günde geçerli olmuş en yüksek fiyat (kampanya dönüşleri serbest kalsın diye). */
    priceRef(p) {
      const since = Date.now() - 30 * DAY;
      let ref = p.price, before = null;
      (p.priceHistory || []).forEach(([t, v]) => { if (t >= since) ref = Math.max(ref, v); else before = v; });
      if (before != null) ref = Math.max(ref, before);
      return ref;
    },
    needsApproval(p, np) {
      if (!this.approvalOn() || np <= p.price + 0.004) return null;
      if (this.deal(p.id)) return 'Ürün aktif flaş fırsatta; kampanya süresince fiyat artışı onaya tabidir';
      const ref = this.priceRef(p), lim = this.priceLimit();
      if (np > ref * (1 + lim / 100) + 0.004) return `Son 30 günün en yüksek fiyatına (${U.tl(ref)}) göre %${((np / ref - 1) * 100).toFixed(1).replace('.', ',')} artış; sınır %${lim}`;
      return null;
    },
    pendingRequest(pid) { return DB.all('priceRequests').find(r => r.productId === pid && r.status === 'pending') || null; },
    applyPrice(p, np, source = 'Manuel') {
      const old = p.price;
      p.price = U.round2(np);
      if (p.listPrice && p.listPrice <= p.price) p.listPrice = 0;
      DB.insert('priceLog', { storeId: p.storeId, productId: p.id, old, new: p.price, source });
      this.priceChanged(p, old);
    },
    _reqQueue: {},
    setPrice(p, np, { source = 'Manuel', reason = '', note = '', force = false } = {}) {
      np = U.round2(+np);
      if (!(np > 0)) return { error: 'Geçersiz fiyat' };
      if (Math.abs(np - p.price) < 0.005) return { same: true };
      const why = force && np > p.price ? 'Satıcı fiyat artış talebi oluşturdu' : this.needsApproval(p, np);
      if (why) {
        const data = { storeId: p.storeId, productId: p.id, oldPrice: p.price, newPrice: np, ref: this.priceRef(p), reason: reason || (source.startsWith('XML') ? 'XML fiyat güncellemesi' : source.startsWith('Otomatik') ? 'Otomatik fiyat kuralı' : 'Maliyet artışı'), note, source, why, status: 'pending' };
        let r = this.pendingRequest(p.id);
        if (r) Object.assign(r, data, { createdAt: Date.now() }); else r = DB.insert('priceRequests', data);
        this._reqQueue[p.storeId] = (this._reqQueue[p.storeId] || 0) + 1;
        clearTimeout(this._reqT);
        this._reqT = setTimeout(() => {
          Object.entries(this._reqQueue).forEach(([sid, n]) => DB.where('users', u => u.role === 'admin').forEach(a => this.notify(a.id, `📨 ${this.store(+sid).name} ${n} ürün için fiyat artış onayı istiyor`, '/admin/price-requests')));
          this._reqQueue = {}; DB.save();
        }, 50);
        DB.save();
        return { requested: true, request: r, why };
      }
      this.applyPrice(p, np, source);
      return { applied: true };
    },
    decideRequest(r, status, { price, note = '' } = {}) {
      const p = this.product(r.productId);
      r.status = status; r.decidedAt = Date.now(); r.adminNote = note;
      if ((status === 'approved' || status === 'partial') && p) { r.approvedPrice = U.round2(price || r.newPrice); this.applyPrice(p, r.approvedPrice, 'Onaylı artış talebi'); }
      const st = this.store(r.storeId);
      const msg = { approved: `✅ "${p ? p.title : ''}" fiyat artış talebin onaylandı: ${U.tl(r.approvedPrice)}`, partial: `☑️ "${p ? p.title : ''}" için ${U.tl(r.approvedPrice)} fiyat onaylandı (talep ${U.tl(r.newPrice)})${note ? ': ' + note : ''}`, rejected: `✕ "${p ? p.title : ''}" fiyat artış talebin reddedildi${note ? ': ' + note : ''}` }[status];
      if (st && msg) this.notify(st.ownerId, msg, '/seller/price-requests');
      DB.save();
    }
  });

  /* =====================================================================
     2) OTOMATİK FİYATLANDIRMA KURALLARI
     ===================================================================== */
  const iso = t => new Date(t - new Date(t).getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const RULES = {
    buybox: { icon: '⚔️', label: 'Rakibe göre fiyatla', desc: 'Aynı ürünü satan en ucuz rakibin biraz altına iner. Zaten en ucuzsan rakibe yaklaşarak kârını artırır.', defaults: { undercut: 1, raise: true },
      fields: [['undercut', 'Rakibin kaç TL altında dur', 'number'], ['raise', 'En ucuz bensem fiyatı rakibe doğru yükselt', 'check']] },
    stock: { icon: '📦', label: 'Stok seviyesine göre', desc: 'Stok azalınca fiyatı artırır, stok fazlaysa indirerek eritir.', defaults: { low: 5, lowPct: 8, high: 150, highPct: 5 },
      fields: [['low', 'Stok bu adede düşünce', 'number'], ['lowPct', 'Fiyatı artır (%)', 'number'], ['high', 'Stok bu adedi aşınca', 'number'], ['highPct', 'Fiyatı indir (%)', 'number']] },
    velocity: { icon: '🐢', label: 'Satmayan ürünü indir', desc: 'Belirli bir süre hiç satmayan ürünlerde fiyatı kademeli olarak düşürür.', defaults: { days: 14, pct: 7 },
      fields: [['days', 'Kaç gündür satış yoksa', 'number'], ['pct', 'İndirim (%)', 'number']] },
    margin: { icon: '🧮', label: 'Maliyet + kâr marjı', desc: 'Fiyatı, komisyon düşüldükten sonra hedef kâr marjını bırakacak şekilde maliyetten hesaplar. Maliyeti girilmiş ürünlerde çalışır.', defaults: { margin: 35 },
      fields: [['margin', 'Hedef net kâr marjı (%)', 'number']] },
    periodic: { icon: '📈', label: 'Periyodik zam (enflasyon / kur)', desc: 'Fiyatı son değişiminden bu yana belirtilen gün geçtiyse yüzde olarak artırır. Sınırı aşan artışlar otomatik olarak onaya gönderilir.', defaults: { pct: 3, days: 30 },
      fields: [['pct', 'Artış (%)', 'number'], ['days', 'Kaç günde bir', 'number']] },
    schedule: { icon: '⏰', label: 'Zamanlı indirim', desc: 'Belirlediğin tarih aralığında indirim uygular, bitince eski fiyata döner.', defaults: { pct: 10, from: iso(Date.now()), to: iso(Date.now() + 7 * DAY) },
      fields: [['pct', 'İndirim (%)', 'number'], ['from', 'Başlangıç', 'date'], ['to', 'Bitiş', 'date']] }
  };
  const ROUND = { none: 'Yuvarlama yok', '90': ',90 ile bitir', '99': ',99 ile bitir', '0': 'Tam sayıya yuvarla' };

  const round = (x, mode) => {
    if (mode === '90') return x < 20 ? U.round2(x) : Math.max(0.9, Math.round(x) - 0.10);
    if (mode === '99') return x < 20 ? U.round2(x) : Math.max(0.99, Math.round(x) - 0.01);
    if (mode === '0') return Math.max(1, Math.round(x));
    return U.round2(x);
  };
  const comRate = p => { const st = Svc.store(p.storeId); const c = Svc.cat(p.categoryId); return (st && st.commission != null ? st.commission : c ? c.commission : DB.settings.defaultCommission) / 100; };
  const soldSince = (p, since) => { let q = 0; DB.all('orders').forEach(o => { if (o.createdAt < since) return; o.packages.forEach(pk => { if (pk.status !== 'cancelled') pk.items.forEach(i => { if (i.productId === p.id) q += i.qty; }); }); }); return q; };
  const inScope = (rule, p) => { const s = rule.scope || { kind: 'all' }; if (s.kind === 'cat') return p.categoryId === +s.value; if (s.kind === 'sub') return p.sub === s.value; return true; };

  function evalRule(rule, p, cur) {
    const x = rule.params || {};
    const now = Date.now();
    switch (rule.type) {
      case 'buybox': {
        const others = Svc.otherSellers(p); if (!others.length) return null;
        const best = others.reduce((a, b) => Svc.priceInfo(a).price < Svc.priceInfo(b).price ? a : b);
        const bp = Svc.priceInfo(best).price, t = bp - (+x.undercut || 0);
        const bn = Svc.store(best.storeId).name;
        if (bp < cur) return { price: t, reason: `${bn} ${U.tl(bp)}'ye satıyor` };
        if (x.raise && t > cur + 0.5) return { price: t, reason: `En ucuz sensin; ${bn} ${U.tl(bp)}, kâr artırılıyor` };
        return null;
      }
      case 'stock':
        if (p.stock > 0 && p.stock <= +x.low) return { price: cur * (1 + x.lowPct / 100), reason: `Stok az (${p.stock} adet)` };
        if (p.stock >= +x.high) return { price: cur * (1 - x.highPct / 100), reason: `Stok fazla (${p.stock} adet)` };
        return null;
      case 'velocity':
        if (now - p.createdAt < x.days * DAY) return null;
        return soldSince(p, now - x.days * DAY) === 0 ? { price: cur * (1 - x.pct / 100), reason: `${x.days} gündür satış yok` } : null;
      case 'margin': {
        if (!(p.cost > 0)) return null;
        const t = p.cost * (1 + x.margin / 100) / (1 - comRate(p));
        return Math.abs(t - cur) / cur > 0.01 ? { price: t, reason: `Maliyet ${U.tl(p.cost)} + %${x.margin} net marj` } : null;
      }
      case 'periodic': {
        const h = p.priceHistory || []; const last = h.length ? h[h.length - 1][0] : p.createdAt;
        return now - last >= x.days * DAY ? { price: cur * (1 + x.pct / 100), reason: `${Math.floor((now - last) / DAY)} gündür fiyat değişmedi` } : null;
      }
      case 'schedule': {
        const from = new Date(x.from).getTime(), to = new Date(x.to).getTime() + DAY - 1;
        const on = now >= from && now <= to;
        const mark = p.sched && p.sched.rule === rule.id;
        if (on && !mark) return { price: cur * (1 - x.pct / 100), reason: `Zamanlı indirim (${U.dayMonth(from)} – ${U.dayMonth(to)})`, sched: 'start', base: cur };
        if (!on && mark) return { price: p.sched.base, reason: 'Zamanlı indirim bitti, eski fiyata dönülüyor', sched: 'end' };
        return null;
      }
    }
    return null;
  }

  Object.assign(Svc, {
    RULES,
    storeRules(sid) { return DB.where('priceRules', r => r.storeId === sid).sort((a, b) => (a.order || 0) - (b.order || 0)); },
    /** Kuralları ürünlere uygular. dry=true ise yalnızca ne olacağını hesaplar. */
    runRules(sid, { ruleIds = null, dry = true } = {}) {
      const rules = this.storeRules(sid).filter(r => (ruleIds ? ruleIds.includes(r.id) : r.active));
      const prods = DB.where('products', p => p.storeId === sid && ['active', 'passive'].includes(p.status));
      const out = [];
      prods.forEach(p => {
        let cur = p.price; const steps = []; let sched = null;
        rules.forEach(rule => {
          if (!inScope(rule, p)) return;
          const r = evalRule(rule, p, cur); if (!r) return;
          const g = rule.guards || {};
          let t = r.price, notes = [];
          if (r.sched !== 'end') {
            if (g.maxChange) { const hi = cur * (1 + g.maxChange / 100), lo = cur * (1 - g.maxChange / 100); if (t > hi) { t = hi; notes.push(`en fazla %${g.maxChange} değişim`); } if (t < lo) { t = lo; notes.push(`en fazla %${g.maxChange} değişim`); } }
            if (p.cost > 0 && g.minMargin != null && g.minMargin !== '') { const floor = p.cost * (1 + g.minMargin / 100) / (1 - comRate(p)); if (t < floor) { t = floor; notes.push(`kâr koruması (min %${g.minMargin})`); } }
            t = round(t, g.rounding || '90');
          } else t = U.round2(t);
          if (Math.abs(t - cur) < 0.01) return;
          steps.push({ rule, from: cur, to: t, reason: r.reason + (notes.length ? ' · ' + notes.join(', ') : '') });
          if (r.sched) sched = { rule, kind: r.sched, base: r.base };
          cur = t;
        });
        if (steps.length && Math.abs(cur - p.price) >= 0.01) out.push({ p, old: p.price, new: cur, steps, sched, why: this.needsApproval(p, cur) });
      });
      if (!dry) {
        let applied = 0, requested = 0;
        out.forEach(c => {
          const res = this.setPrice(c.p, c.new, { source: 'Otomatik: ' + U.uniq(c.steps.map(s => s.rule.name)).join(', '), reason: 'Otomatik fiyat kuralı', note: c.steps.map(s => s.reason).join(' → ') });
          if (res.applied) { applied++; if (c.sched) { if (c.sched.kind === 'start') { c.p.sched = { rule: c.sched.rule.id, base: c.sched.base }; if (!c.p.listPrice) c.p.listPrice = c.sched.base; } else { delete c.p.sched; } } }
          if (res.requested) requested++;
          c.result = res;
        });
        rules.forEach(r => { r.lastRun = Date.now(); r.lastCount = out.filter(c => c.steps.some(s => s.rule.id === r.id)).length; });
        const st = this.store(sid); st.autoPricing = Object.assign({ enabled: false, hour: 9 }, st.autoPricing, { lastRun: Date.now(), lastApplied: applied, lastRequested: requested });
        DB.save();
        return { changes: out, applied, requested };
      }
      return { changes: out };
    },
    /** Satıcı panele girdiğinde, zamanı gelmiş otomatik çalıştırmayı yapar (canlıda sunucu zamanlayıcısı yapar). */
    autoRunPricing(sid) {
      const st = this.store(sid); const ap = st && st.autoPricing;
      if (!ap || !ap.enabled) return null;
      const due = U.startOfDay(Date.now()) + (ap.hour || 9) * 3600e3;
      if (Date.now() < due || (ap.lastRun || 0) >= due) return null;
      const r = this.runRules(sid, { dry: false });
      this.notify(st.ownerId, `🤖 Otomatik fiyatlandırma çalıştı: ${r.applied} fiyat güncellendi${r.requested ? ', ' + r.requested + ' artış onaya gönderildi' : ''}.`, '/seller/pricing');
      return r;
    }
  });

  /* =====================================================================
     3) XML OKUMA, EŞLEŞTİRME VE İÇE AKTARMA
     ===================================================================== */
  const FIELDS = [
    ['sku', 'Stok kodu', true, ['sku', 'stokkodu', 'stok_kodu', 'productcode', 'urunkodu', 'code', 'kod', 'model', 'modelkodu', 'id', 'mpn', 'itemcode', 'stockcode']],
    ['title', 'Ürün adı', true, ['title', 'name', 'urunadi', 'urun_adi', 'baslik', 'productname', 'adi', 'ad', 'label', 'isim']],
    ['price', 'Satış fiyatı', true, ['price', 'fiyat', 'satisfiyati', 'saleprice', 'indirimlifiyat', 'price1', 'sellingprice', 'satis', 'fiyat1', 'salesprice']],
    ['listPrice', 'Piyasa / üstü çizili fiyat', false, ['listprice', 'piyasafiyati', 'oldprice', 'marketprice', 'regularprice', 'eskifiyat', 'liste', 'listefiyati', 'originalprice']],
    ['cost', 'Alış / maliyet fiyatı', false, ['cost', 'maliyet', 'alisfiyati', 'buyingprice', 'purchaseprice', 'bayifiyati', 'dealerprice']],
    ['stock', 'Stok adedi', true, ['stock', 'stok', 'quantity', 'miktar', 'adet', 'stockquantity', 'stokadedi', 'qty', 'inventory', 'stokmiktari']],
    ['barcode', 'Barkod', false, ['barcode', 'barkod', 'gtin', 'ean', 'ean13']],
    ['brand', 'Marka', false, ['brand', 'marka', 'manufacturer', 'uretici', 'vendor']],
    ['category', 'Kategori', false, ['category', 'kategori', 'producttype', 'categorypath', 'kategoriyolu', 'maincategory', 'googleproductcategory', 'kategoriadi', 'categoryname']],
    ['description', 'Açıklama', false, ['description', 'aciklama', 'detay', 'details', 'urunaciklamasi', 'content', 'detail']],
    ['image', 'Görsel(ler)', false, ['image', 'imagelink', 'resim', 'resim1', 'image1', 'picture', 'images', 'resimler', 'gorsel', 'gorseller', 'photo', 'imageurl', 'additionalimagelink', 'image2', 'resim2']],
    ['variants', 'Varyant seçenekleri', false, ['variants', 'varyant', 'beden', 'bedenler', 'size', 'sizes', 'renk', 'color', 'secenek', 'secenekler', 'options']]
  ];
  const nk = k => U.norm(String(k).replace(/^[a-z]+:/i, '').replace(/^@/, '')).replace(/\s/g, '');

  const Xml = C.Xml = {
    FIELDS,
    num(v) {
      if (v == null) return NaN;
      let s = String(Array.isArray(v) ? v[0] : v).replace(/[^\d.,-]/g, '');
      if (!s) return NaN;
      const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
      if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
      else if (lc > -1) s = s.replace(/\./g, '').replace(',', '.');
      else if (ld > -1 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
      return parseFloat(s);
    },
    parse(text) {
      let doc;
      try { doc = new DOMParser().parseFromString(text, 'application/xml'); } catch (e) { return { error: 'Dosya okunamadı.' }; }
      const pe = doc.getElementsByTagName('parsererror')[0];
      if (pe) return { error: 'XML biçimi hatalı: ' + (pe.textContent || '').split('\n')[0].slice(0, 160) };
      // Tekrarlanan (ürün) düğümünü bul: aynı isimle en çok tekrar eden, alt alanı olan eleman
      let best = null;
      const walk = (el, depth) => {
        if (depth > 5) return;
        const groups = {};
        Array.from(el.children).forEach(c => { (groups[c.nodeName] = groups[c.nodeName] || []).push(c); });
        Object.values(groups).forEach(arr => { if (arr[0].children.length >= 2 && (!best || arr.length > best.length)) best = arr; });
        Array.from(el.children).forEach(c => walk(c, depth + 1));
      };
      walk(doc.documentElement, 0);
      if (!best && doc.documentElement.children.length >= 2) best = [doc.documentElement];
      if (!best) return { error: 'Dosyada ürün listesi bulunamadı. Her ürün ayrı bir eleman (ör. <urun> veya <product>) içinde olmalı.' };
      const flat = (el, prefix, obj) => {
        Array.from(el.attributes || []).forEach(a => { obj[prefix + '@' + a.name] = a.value; });
        Array.from(el.children).forEach(c => {
          const key = prefix + c.nodeName;
          if (c.children.length) {
            const kids = Array.from(c.children);
            if (kids.every(k => k.nodeName === kids[0].nodeName && !k.children.length)) { obj[key] = kids.map(k => k.textContent.trim()).filter(Boolean); }
            else flat(c, key + '.', obj);
          } else {
            const v = c.textContent.trim();
            Array.from(c.attributes || []).forEach(a => { obj[key + '@' + a.name] = a.value; });
            if (key in obj) obj[key] = [].concat(obj[key], v); else obj[key] = v;
          }
        });
        return obj;
      };
      const items = best.map(el => flat(el, '', {}));
      const keys = U.uniq(items.flatMap(o => Object.keys(o)));
      return { items, keys, itemTag: best[0].nodeName, rootTag: doc.documentElement.nodeName };
    },
    guess(keys) {
      const m = {};
      FIELDS.forEach(([f, , , syn]) => {
        const hit = keys.find(k => syn.includes(nk(k))) || keys.find(k => syn.some(s => s.length > 3 && nk(k).includes(s)));
        if (hit) m[f] = hit;
      });
      return m;
    },
    catOptions() { return Svc.cats().flatMap(c => c.subs.map(s => [c.id + '|' + s, c.name + ' › ' + s])); },
    guessCat(raw, store) {
      const n = U.norm(raw || '');
      let best = null, bs = 0;
      Svc.cats().forEach(c => c.subs.forEach(s => {
        let sc = 0;
        U.norm(s).split(' ').forEach(w => { if (w.length > 2 && n.includes(w)) sc += 3; });
        U.norm(c.name).split(' ').forEach(w => { if (w.length > 2 && n.includes(w)) sc += 1; });
        if (sc > bs) { bs = sc; best = c.id + '|' + s; }
      }));
      if (best) return best;
      const c = Svc.cat((store.cats && store.cats[0]) || 1);
      return c.id + '|' + c.subs[0];
    },
    val(item, key) { if (!key) return undefined; const v = item[key]; return Array.isArray(v) ? v : v; },
    str(item, key) { const v = this.val(item, key); return v == null ? '' : String(Array.isArray(v) ? v[0] : v).trim(); },
    /** Her satırı doğrular, mevcut ürünle eşleştirir ve ne olacağını hesaplar. */
    rows(parsed, map, catMap, opt, store) {
      const mine = DB.where('products', p => p.storeId === store.id);
      const bySku = new Map(mine.map(p => [U.lower(p.sku), p])), byBar = new Map(mine.filter(p => p.barcode).map(p => [String(p.barcode), p]));
      const seen = new Set();
      return parsed.items.map((it, i) => {
        const d = {
          sku: this.str(it, map.sku), title: this.str(it, map.title), brand: this.str(it, map.brand), barcode: this.str(it, map.barcode), category: this.str(it, map.category),
          description: this.str(it, map.description), price: this.num(this.val(it, map.price)), listPrice: this.num(this.val(it, map.listPrice)), cost: this.num(this.val(it, map.cost)), stock: this.num(this.val(it, map.stock))
        };
        const imgs = map.image ? [].concat(it[map.image] || []).concat(FIELDS ? Object.keys(it).filter(k => k !== map.image && /^(image|resim|picture|gorsel)\d+$/i.test(nk(k))).map(k => it[k]) : []).flat().filter(x => /^https?:\/\//i.test(x)) : [];
        d.images = U.uniq(imgs).slice(0, 6);
        const vr = map.variants ? [].concat(it[map.variants] || []).join(',') : '';
        d.variants = vr ? U.uniq(vr.split(/[,|;/]/).map(x => x.trim()).filter(Boolean)) : [];
        d.variantName = map.variants ? ({ beden: 'Beden', size: 'Beden', sizes: 'Beden', bedenler: 'Beden', renk: 'Renk', color: 'Renk' }[nk(map.variants)] || 'Seçenek') : '';
        // fiyat dönüşümü
        let price = d.price;
        if (opt.priceMode === 'markup' && price > 0) price = price * (1 + (+opt.markup || 0) / 100);
        if (opt.priceMode === 'cost') price = d.cost > 0 ? d.cost * (1 + (+opt.markup || 0) / 100) : NaN;
        if (price > 0) price = round(price, opt.rounding);
        const errors = [], warns = [];
        if (!d.sku) errors.push('Stok kodu yok');
        else if (seen.has(U.lower(d.sku))) errors.push('Aynı stok kodu dosyada tekrar ediyor');
        seen.add(U.lower(d.sku));
        if (!(price > 0)) errors.push(opt.priceMode === 'cost' ? 'Maliyet fiyatı yok' : 'Fiyat yok veya geçersiz');
        if (isNaN(d.stock)) { warns.push('Stok yok, 0 kabul edildi'); d.stock = 0; }
        d.stock = Math.max(0, Math.round(d.stock));
        const match = (d.sku && bySku.get(U.lower(d.sku))) || (d.barcode && byBar.get(d.barcode)) || null;
        if (!match && !d.title) errors.push('Yeni ürün için ürün adı gerekli');
        const [cid, sub] = (catMap[d.category] || this.guessCat(d.category + ' ' + d.title, store)).split('|');
        const row = { i, d, price: price > 0 ? price : 0, match, errors, warns, catId: +cid, sub, changes: [] };
        if (errors.length) row.status = 'error';
        else if (match) {
          if (opt.update) {
            if (!opt.stockOnly && Math.abs(match.price - row.price) >= 0.01) row.changes.push(['Fiyat', U.tl(match.price) + ' → ' + U.tl(row.price), row.price > match.price ? Svc.needsApproval(match, row.price) : null]);
            if (match.stock !== d.stock) row.changes.push(['Stok', match.stock + ' → ' + d.stock]);
            if (opt.content && d.title && d.title !== match.title) row.changes.push(['Ad', 'güncellenecek']);
          }
          row.status = row.changes.length ? 'update' : 'same';
        } else row.status = opt.create ? 'new' : 'skip';
        return row;
      });
    },
    import(rows, opt, store, meta) {
      const res = { created: 0, updated: 0, requested: 0, same: 0, skipped: 0, errors: 0, deactivated: 0, errorRows: [] };
      const pal = C.Seed.BG;
      rows.forEach(r => {
        if (r.status === 'error') { res.errors++; res.errorRows.push({ row: r.i + 1, sku: r.d.sku, msg: r.errors.join(', ') }); return; }
        if (r.status === 'skip') { res.skipped++; return; }
        if (r.status === 'same') { res.same++; return; }
        const cat = Svc.cat(r.catId);
        if (r.status === 'new') {
          const bg = pal[(r.i * 3 + r.catId) % pal.length];
          const images = r.d.images.length ? r.d.images.map(u => ({ url: u, e: cat.icon, c1: bg[0], c2: bg[1] })) : [{ e: cat.icon, c1: bg[0], c2: bg[1] }];
          const status = opt.publish ? (DB.settings.productModeration ? 'pending' : 'active') : 'passive';
          const p = DB.insert('products', {
            storeId: store.id, categoryId: r.catId, sub: r.sub, title: r.d.title, brand: r.d.brand || store.name, groupKey: null, sku: r.d.sku, barcode: r.d.barcode || '',
            price: r.price, listPrice: r.d.listPrice > r.price ? r.d.listPrice : 0, cost: r.d.cost > 0 ? r.d.cost : 0, stock: r.d.stock,
            variants: r.d.variants.length > 1 ? { name: r.d.variantName, options: r.d.variants } : null, images,
            description: r.d.description || '', specs: { Marka: r.d.brand || store.name, Barkod: r.d.barcode || '—' }, tags: [r.sub, r.d.brand, cat.name].filter(Boolean).map(U.lower),
            status, freeShipping: false, fastDelivery: store.shipDays === 0, sold: 0, views: 0, rating: 0, reviewCount: 0, priceHistory: [[Date.now(), r.price]], featured: false, source: 'xml'
          });
          if (!p.description) p.description = C.Seed.describe(p);
          res.created++;
        } else if (r.status === 'update') {
          const p = r.match;
          if (opt.update) {
            p.stock = r.d.stock;
            if (!opt.stockOnly) {
              const pr = Svc.setPrice(p, r.price, { source: 'XML: ' + (meta.file || 'feed'), reason: 'XML fiyat güncellemesi' });
              if (pr.requested) res.requested++;
              if (r.d.listPrice > 0) p.listPrice = r.d.listPrice > p.price ? r.d.listPrice : 0;
              if (r.d.cost > 0) p.cost = r.d.cost;
            }
            if (opt.content) { if (r.d.title) p.title = r.d.title; if (r.d.description) p.description = r.d.description; if (r.d.images.length) p.images = r.d.images.map(u => ({ url: u, e: cat.icon, c1: '#eee', c2: '#ddd' })); p._h = ''; }
          }
          res.updated++;
        }
      });
      if (opt.deactivate) {
        const skus = new Set(rows.filter(r => r.d.sku).map(r => U.lower(r.d.sku)));
        DB.where('products', p => p.storeId === store.id && p.status === 'active' && !skus.has(U.lower(p.sku))).forEach(p => { p.status = 'passive'; res.deactivated++; });
      }
      Svc._vocab = null;
      DB.insert('imports', Object.assign({ storeId: store.id, file: meta.file, source: meta.source, total: rows.length, errorRows: res.errorRows.slice(0, 50) }, res));
      DB.save();
      return res;
    },
    sample(store) {
      const mine = DB.where('products', p => p.storeId === store.id && p.status === 'active').slice(0, 2);
      const x = s => U.esc(s);
      const row = (o) => `  <Urun>\n    <StokKodu>${x(o.sku)}</StokKodu>\n    <Barkod>${x(o.bar || '')}</Barkod>\n    <UrunAdi>${x(o.title)}</UrunAdi>\n    <Marka>${x(o.brand)}</Marka>\n    <Kategori>${x(o.cat)}</Kategori>\n    <SatisFiyati>${o.price}</SatisFiyati>\n    <PiyasaFiyati>${o.list || ''}</PiyasaFiyati>\n    <AlisFiyati>${o.cost || ''}</AlisFiyati>\n    <Stok>${o.stock}</Stok>\n    <Aciklama>${x(o.desc || '')}</Aciklama>\n    <Resimler>\n${(o.imgs || []).map(u => `      <Resim>${x(u)}</Resim>`).join('\n')}\n    </Resimler>${o.var ? `\n    <Beden>${x(o.var)}</Beden>` : ''}\n  </Urun>`;
      const list = [];
      if (mine[0]) list.push({ sku: mine[0].sku, title: mine[0].title, brand: mine[0].brand, cat: 'Yapı Market > ' + mine[0].sub, price: (mine[0].price * 1.05).toFixed(2).replace('.', ','), stock: mine[0].stock + 40, cost: '', desc: 'Stok ve fiyat güncellemesi (%5 artış)' });
      if (mine[1]) list.push({ sku: mine[1].sku, title: mine[1].title, brand: mine[1].brand, cat: 'Yapı Market > ' + mine[1].sub, price: (mine[1].price * 1.32).toFixed(2).replace('.', ','), stock: 12, desc: 'Tedarikçi zammı (%32 artış, onaya düşer)' });
      list.push(
        { sku: 'GB-SAT-001', bar: '8690000100011', title: 'Saten İç Cephe Boyası 7,5 L Kırık Beyaz', brand: 'Güven Boya', cat: 'Yapı Market > Boya > İç Cephe', price: '1.149,90', list: '1.399,90', cost: '640', stock: 85, desc: 'Yarı mat, silinebilir, kokusuz saten iç cephe boyası.' },
        { sku: 'GB-AST-015', bar: '8690000100158', title: 'Akrilik Astar 15 L', brand: 'Güven Boya', cat: 'Yapı Market > Boya > Astar', price: '989,90', cost: '520', stock: 40, desc: 'İç ve dış yüzeyler için su bazlı akrilik astar.' },
        { sku: 'GB-MAS-025', bar: '8690000100257', title: 'Kağıt Maskeleme Bandı 25 mm 6\'lı', brand: 'Usta İşi', cat: 'Yapı Market > Hırdavat', price: '149,90', cost: '70', stock: 300, desc: 'Boya işlerinde iz bırakmayan maskeleme bandı.' },
        { sku: 'GB-TUL-110', title: 'Boya Tulumu Tek Kullanımlık', brand: 'Usta İşi', cat: 'Hırdavat > İş Güvenliği', price: '89,90', cost: '32', stock: 150, var: 'M, L, XL, XXL', desc: 'Nefes alabilen, tozu ve boyayı geçirmeyen koruyucu tulum.' },
        { sku: 'GB-SPR-400', title: 'Sprey Boya 400 ml Parlak Siyah', brand: 'Renkli Duvar', cat: 'Yapı Market > Boya > Sprey', price: '129,90', stock: 0, desc: 'Metal, ahşap ve plastik yüzeyler için hızlı kuruyan sprey boya.' },
        { sku: 'GB-HATA-01', title: 'Fiyatı unutulmuş ürün (hatalı satır örneği)', brand: 'Güven Boya', cat: 'Boya', price: '', stock: 10 }
      );
      return `<?xml version="1.0" encoding="UTF-8"?>\n<Urunler>\n${list.map(row).join('\n')}\n</Urunler>\n`;
    },
    export(store) {
      const x = s => U.esc(s == null ? '' : s);
      const ps = DB.where('products', p => p.storeId === store.id);
      return `<?xml version="1.0" encoding="UTF-8"?>\n<Urunler magaza="${x(store.name)}" tarih="${new Date().toISOString()}">\n` + ps.map(p => `  <Urun>\n    <StokKodu>${x(p.sku)}</StokKodu>\n    <Barkod>${x(p.barcode || '')}</Barkod>\n    <UrunAdi>${x(p.title)}</UrunAdi>\n    <Marka>${x(p.brand)}</Marka>\n    <Kategori>${x(Svc.cat(p.categoryId).name + ' > ' + p.sub)}</Kategori>\n    <SatisFiyati>${p.price.toFixed(2)}</SatisFiyati>\n    <PiyasaFiyati>${p.listPrice ? p.listPrice.toFixed(2) : ''}</PiyasaFiyati>\n    <AlisFiyati>${p.cost ? p.cost.toFixed(2) : ''}</AlisFiyati>\n    <Stok>${p.stock}</Stok>\n    <Durum>${x(Svc.PROD_STATUS[p.status][0])}</Durum>\n    <Aciklama>${x(p.description)}</Aciklama>${p.variants ? `\n    <Varyant ad="${x(p.variants.name)}">${x(p.variants.options.join(','))}</Varyant>` : ''}\n  </Urun>`).join('\n') + '\n</Urunler>\n';
    }
  };

  /* Uzak görseller (XML'den gelen adresler) yüklenemezse kategori simgesi görünür */
  const baseImg = K.img;
  K.img = function (spec, o = {}) {
    if (spec && typeof spec === 'object' && spec.url) {
      return `<div class="pimg has-img" style="background:linear-gradient(145deg,${esc(spec.c1 || '#eee')},${esc(spec.c2 || '#ddd')})"><span class="em">${esc(spec.e || '📦')}</span><img src="${esc(spec.url)}" alt="${esc(o.label || '')}" loading="lazy" style="position:absolute;inset:0" onerror="this.remove()"></div>`;
    }
    return baseImg.call(K, spec, o);
  };

  /* =====================================================================
     SATICI SAYFALARI
     ===================================================================== */
  const guard = () => { const u = Auth.user(); if (!u) return { redirect: '/login?next=' + encodeURIComponent(Router.path) }; if (u.role !== 'seller' || !u.storeId) return { redirect: '/sell' }; return null; };
  const spage = o => Object.assign({ layout: 'panel', panel: 'seller' }, o);
  const apage = o => Object.assign({ layout: 'panel', panel: 'admin' }, o);
  const reqPill = s => K.pill(REQ_STATUS, s);
  const pctTxt = (a, b) => { const v = (b / a - 1) * 100; return `<b class="${v > 0 ? 'bad' : 'ok'}">${v > 0 ? '+' : ''}%${v.toFixed(1).replace('.', ',')}</b>`; };

  /* ---------------- XML ile ürün yükleme ---------------- */
  S.xml = () => {
    const g = guard(); if (g) return g;
    const st = Svc.myStore();
    const feed = st.xmlFeed || {};
    const imports = DB.where('imports', x => x.storeId === st.id).sort((a, b) => b.createdAt - a.createdAt);
    const html = `
      <div class="steps" id="xSteps"><span class="st on" data-s="1"><i>1</i>Dosya</span><span class="ln"></span><span class="st" data-s="2"><i>2</i>Alan eşleştirme</span><span class="ln"></span><span class="st" data-s="3"><i>3</i>Önizleme & aktar</span></div>
      <div id="xBody"></div>
      <div class="g2e" style="margin-top:20px;align-items:start">
        <section class="card card-pad stack"><div class="row between"><h3 style="margin:0">🔄 Otomatik XML senkronizasyonu</h3>${feed.url ? `<span class="badge ${feed.interval && feed.interval !== 'off' ? 'b-ok' : 'b-mute'}">${feed.interval && feed.interval !== 'off' ? 'Açık' : 'Kapalı'}</span>` : ''}</div>
          <p class="small muted">Tedarikçinin ya da e-ticaret altyapının (Ticimax, İdeasoft, T-Soft, WooCommerce, Shopify…) verdiği XML adresini gir. Stok ve fiyatların seçtiğin sıklıkta otomatik güncellenir; eşleştirme ayarların hatırlanır.</p>
          <div class="field"><label for="fUrl">XML feed adresi</label><input class="input" id="fUrl" placeholder="https://tedarikci.com/xml/urunler.xml" value="${esc(feed.url || '')}"></div>
          <div class="form-grid"><div class="field"><label for="fInt">Güncelleme sıklığı</label><select class="select" id="fInt">${[['off', 'Kapalı'], ['1h', 'Saatte bir'], ['6h', '6 saatte bir'], ['24h', 'Günde bir']].map(([v, l]) => `<option value="${v}" ${(feed.interval || 'off') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
            <div class="field"><label for="fScope">Güncellenecekler</label><select class="select" id="fScope"><option value="both" ${feed.scope !== 'stock' ? 'selected' : ''}>Fiyat + stok</option><option value="stock" ${feed.scope === 'stock' ? 'selected' : ''}>Yalnızca stok</option></select></div></div>
          <div class="row"><button class="btn btn-dark" id="fSave">Kaydet</button><button class="btn" id="fSync" ${feed.url ? '' : 'disabled'}>Şimdi senkronize et</button></div>
          ${feed.lastSync ? `<span class="xs muted">Son senkron: ${U.dateTime(feed.lastSync)} · ${esc(feed.lastMsg || '')}</span>` : ''}
        </section>
        <section class="card card-pad stack"><h3 style="margin:0">📤 Dışa aktar & şablon</h3>
          <p class="small muted">Tüm ürünlerini XML olarak indir, başka bir kanalda kullan ya da toplu düzenleyip geri yükle. Şablon, desteklenen alan adlarını gösterir.</p>
          <div class="row"><button class="btn" id="xExport">⬇ Ürünlerimi XML indir</button><button class="btn btn-ghost" id="xTpl">📄 XML şablonunu gör</button></div>
          <div class="insight info"><span class="ii">ℹ️</span><div class="small">Desteklenen yapılar: <code>&lt;Urunler&gt;&lt;Urun&gt;</code>, <code>&lt;products&gt;&lt;product&gt;</code>, Google Merchant <code>&lt;rss&gt;&lt;item&gt;&lt;g:price&gt;</code> ve alt alanlı özel yapılar. Alan adları otomatik tanınır; tanınmayanları elle eşleştirebilirsin.</div></div>
        </section>
      </div>
      <section class="card" style="margin-top:20px"><div style="padding:16px 18px 0"><h3 style="margin:0">İçe aktarma geçmişi</h3></div>
        ${imports.length ? `<div style="overflow-x:auto;padding-top:8px"><table class="tbl"><thead><tr><th>Tarih</th><th>Kaynak</th><th class="r">Satır</th><th class="r">Yeni</th><th class="r">Güncellenen</th><th class="r">Onaya giden fiyat</th><th class="r">Hatalı</th><th></th></tr></thead><tbody>
          ${imports.slice(0, 20).map(x => `<tr><td class="small">${U.dateTime(x.createdAt)}</td><td class="small">${esc(x.file || '')}<div class="xs muted">${esc(x.source || '')}</div></td><td class="r">${x.total}</td><td class="r ok">${x.created}</td><td class="r">${x.updated}</td><td class="r">${x.requested ? `<a class="brand bold" href="#/seller/price-requests">${x.requested}</a>` : 0}</td><td class="r ${x.errors ? 'bad' : ''}">${x.errors}</td><td>${x.errors ? `<button class="btn btn-sm btn-ghost" data-errs="${x.id}">Hataları gör</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="small muted" style="padding:12px 18px 18px">Henüz içe aktarma yapılmadı.</p>'}
      </section>`;
    return spage({
      title: 'XML ile ürün yükle', sub: 'Toplu ürün ekleme, fiyat ve stok güncelleme', actions: '<a class="btn" href="#/seller/products">← Ürünlerim</a>', html,
      mount(main) {
        const state = { step: 1, text: '', file: '', source: '', parsed: null, map: {}, catMap: {}, opt: { update: true, create: true, publish: true, stockOnly: false, content: false, deactivate: false, priceMode: 'asis', markup: 0, rounding: 'none' }, rows: null };
        if (feed.map) state.map = Object.assign({}, feed.map);
        if (feed.catMap) state.catMap = Object.assign({}, feed.catMap);
        const body = U.$('#xBody', main);
        const setStep = n => { state.step = n; U.$$('#xSteps .st', main).forEach(s => s.classList.toggle('on', +s.dataset.s <= n)); draw(); };
        const load = (text, file, source) => {
          const r = Xml.parse(text);
          if (r.error) return C.toast(r.error, { icon: '⚠️', ms: 5000 });
          if (!r.items.length) return C.toast('Dosyada ürün bulunamadı', { icon: '⚠️' });
          state.text = text; state.file = file; state.source = source; state.parsed = r;
          const guess = Xml.guess(r.keys);
          state.map = Object.assign(guess, Object.fromEntries(Object.entries(state.map).filter(([, v]) => r.keys.includes(v))));
          U.uniq(r.items.map(it => Xml.str(it, state.map.category))).forEach(c => { if (!state.catMap[c]) state.catMap[c] = Xml.guessCat(c, st); });
          C.toast(`${r.items.length} ürün okundu (&lt;${esc(r.itemTag)}&gt;)`, { icon: '🧩' });
          setStep(2);
        };
        const draw = () => {
          if (state.step === 1) {
            body.innerHTML = `<div class="g2" style="grid-template-columns:minmax(0,1.4fr) minmax(0,1fr)">
              <section class="card card-pad stack"><h3 style="margin:0">XML dosyanı yükle</h3>
                <label class="img-drop" id="xDrop" for="xFile" style="padding:36px 18px"><span style="font-size:2rem">🧩</span><br><b>XML dosyasını sürükle bırak ya da seç</b><br><span class="xs">.xml · en fazla birkaç bin ürün</span><input type="file" id="xFile" accept=".xml,text/xml,application/xml" hidden></label>
                <details><summary class="small bold" style="cursor:pointer">XML metnini yapıştır</summary><div class="stack" style="margin-top:8px"><textarea class="textarea" id="xPaste" style="min-height:160px;font-family:ui-monospace,monospace;font-size:.78rem" placeholder="<?xml version=&quot;1.0&quot;?>&#10;<Urunler>…"></textarea><button class="btn btn-sm" id="xPasteGo" style="align-self:flex-start">Metni oku</button></div></details>
              </section>
              <section class="card card-pad stack"><h3 style="margin:0">Hemen denemek ister misin?</h3><p class="small muted">Örnek dosyada mağazandaki 2 ürünün fiyat/stok güncellemesi (biri onaya düşecek kadar yüksek zam), 5 yeni ürün ve 1 hatalı satır var.</p><button class="btn btn-primary" id="xSample">Örnek XML ile dene</button>
                <hr class="divider"><div class="small stack" style="gap:6px"><b>Nasıl çalışır?</b><span>1. Dosyadaki alanlar otomatik tanınır.</span><span>2. Stok kodu veya barkodu eşleşen ürün güncellenir, eşleşmeyen yeni ürün olarak eklenir.</span><span>3. Sınırı aşan fiyat artışları doğrudan uygulanmaz, fiyat artış talebi olarak onaya gider.</span></div></section></div>`;
            const f = U.$('#xFile', main), drop = U.$('#xDrop', main);
            const readF = file => { if (!file) return; const fr = new FileReader(); fr.onload = () => load(fr.result, file.name, 'Dosya yükleme'); fr.readAsText(file); };
            f.onchange = () => readF(f.files[0]);
            drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
            drop.ondragleave = () => drop.classList.remove('over');
            drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); readF(e.dataTransfer.files[0]); };
            U.$('#xPasteGo', main).onclick = () => { const t = U.$('#xPaste').value.trim(); if (t) load(t, 'yapıştırılan-metin.xml', 'Metin'); };
            U.$('#xSample', main).onclick = () => load(Xml.sample(st), 'ornek-urunler.xml', 'Örnek dosya');
          } else if (state.step === 2) {
            const P = state.parsed;
            const keyOpts = sel => `<option value="">— Kullanma —</option>` + P.keys.map(k => `<option value="${esc(k)}" ${sel === k ? 'selected' : ''}>${esc(k)}</option>`).join('');
            const ex = k => { const v = k ? P.items.map(it => it[k]).find(x => x != null && x !== '') : ''; return esc(String(Array.isArray(v) ? v.join(', ') : v || '').slice(0, 60)); };
            const cats = U.uniq(P.items.map(it => Xml.str(it, state.map.category)));
            const cOpts = Xml.catOptions();
            body.innerHTML = `<div class="g2e" style="align-items:start">
              <section class="card card-pad stack"><div class="row between"><h3 style="margin:0">Alan eşleştirme</h3><span class="xs muted">${P.items.length} ürün · &lt;${esc(P.itemTag)}&gt;</span></div>
                <div class="tbl-wrap"><table class="tbl"><thead><tr><th>MarkaBahçem alanı</th><th>XML alanı</th><th>Örnek değer</th></tr></thead><tbody>
                ${FIELDS.map(([f, l, req]) => `<tr><td class="small"><b>${l}</b>${req ? ' <span class="bad">*</span>' : ''}</td><td><select class="select" data-map="${f}" style="padding:6px 8px;min-width:150px">${keyOpts(state.map[f])}</select></td><td class="xs muted" data-ex="${f}">${ex(state.map[f])}</td></tr>`).join('')}
                </tbody></table></div></section>
              <div class="stack lg">
                <section class="card card-pad stack"><h3 style="margin:0">Kategori eşleştirme</h3><p class="xs muted">XML'deki kategorileri MarkaBahçem kategorilerine bağla. Tahminleri kontrol et.</p>
                  ${state.map.category ? cats.map((c, i) => `<div class="field"><label for="cm${i}" style="font-weight:500">${esc(c || '(kategori yok)')} <span class="muted">· ${P.items.filter(it => Xml.str(it, state.map.category) === c).length} ürün</span></label><select class="select" id="cm${i}" data-cat="${esc(c)}">${cOpts.map(([v, l]) => `<option value="${v}" ${state.catMap[c] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`).join('') : '<p class="small muted">Kategori alanı seçilmedi; ürünler ürün adına göre en uygun kategoriye yerleştirilecek.</p>'}</section>
                <section class="card card-pad stack"><h3 style="margin:0">Fiyat ayarları</h3>
                  <div class="field"><label for="oPm">Satış fiyatı</label><select class="select" id="oPm"><option value="asis" ${state.opt.priceMode === 'asis' ? 'selected' : ''}>XML'deki satış fiyatını kullan</option><option value="markup" ${state.opt.priceMode === 'markup' ? 'selected' : ''}>XML satış fiyatına % ekle</option><option value="cost" ${state.opt.priceMode === 'cost' ? 'selected' : ''}>Alış fiyatı + % kâr ile hesapla</option></select></div>
                  <div class="form-grid"><div class="field"><label for="oMk">Eklenecek oran (%)</label><input class="input" id="oMk" type="number" value="${state.opt.markup}"></div><div class="field"><label for="oRd">Yuvarlama</label><select class="select" id="oRd">${Object.entries(ROUND).map(([k, v]) => `<option value="${k}" ${state.opt.rounding === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div></section>
                <section class="card card-pad stack" style="gap:8px"><h3 style="margin:0">İçe aktarma seçenekleri</h3>
                  ${[['create', 'Yeni ürünleri ekle'], ['publish', 'Yeni ürünleri yayına al'], ['update', 'Mevcut ürünlerin fiyat ve stoğunu güncelle'], ['stockOnly', 'Mevcut ürünlerde yalnızca stoğu güncelle'], ['content', 'Mevcut ürünlerin ad, açıklama ve görsellerini de güncelle'], ['deactivate', 'XML\'de olmayan ürünlerimi pasife al']].map(([k, l]) => `<label class="check small"><input type="checkbox" data-opt="${k}" ${state.opt[k] ? 'checked' : ''}> ${l}</label>`).join('')}</section>
              </div></div>
              <div class="row" style="margin-top:16px"><button class="btn" id="xBack">← Başka dosya</button><button class="btn btn-primary" id="xNext">Önizle →</button></div>`;
            body.onchange = e => {
              const t = e.target;
              if (t.dataset.map) { state.map[t.dataset.map] = t.value; U.$(`[data-ex="${t.dataset.map}"]`, body).innerHTML = ex(t.value); if (t.dataset.map === 'category') { U.uniq(P.items.map(it => Xml.str(it, t.value))).forEach(c => { if (!state.catMap[c]) state.catMap[c] = Xml.guessCat(c, st); }); draw(); } }
              if (t.dataset.cat != null) state.catMap[t.dataset.cat] = t.value;
              if (t.dataset.opt) state.opt[t.dataset.opt] = t.checked;
              if (t.id === 'oPm') state.opt.priceMode = t.value;
              if (t.id === 'oMk') state.opt.markup = +t.value || 0;
              if (t.id === 'oRd') state.opt.rounding = t.value;
            };
            U.$('#xBack', main).onclick = () => setStep(1);
            U.$('#xNext', main).onclick = () => {
              const miss = FIELDS.filter(f => f[2] && !state.map[f[0]] && !(f[0] === 'price' && state.opt.priceMode === 'cost' && state.map.cost)).map(f => f[1]);
              if (miss.length) return C.toast('Zorunlu alanları eşleştir: ' + miss.join(', '), { icon: '⚠️', ms: 4000 });
              state.rows = Xml.rows(P, state.map, state.catMap, state.opt, st); setStep(3);
            };
          } else {
            const R = state.rows;
            const cnt = s => R.filter(r => r.status === s).length;
            const req = R.filter(r => r.changes.some(c => c[2])).length;
            const lab = { new: ['Yeni', 'b-ok'], update: ['Güncellenecek', 'b-info'], same: ['Değişiklik yok', 'b-mute'], skip: ['Atlanacak', 'b-mute'], error: ['Hatalı', 'b-bad'] };
            body.innerHTML = `<div class="kpis">${K.kpi('Toplam satır', U.num(R.length))}${K.kpi('Yeni ürün', U.num(cnt('new')))}${K.kpi('Güncellenecek', U.num(cnt('update')))}${K.kpi('Onaya gidecek zam', U.num(req))}${K.kpi('Hatalı satır', U.num(cnt('error')))}</div>
              ${req ? `<div class="insight warnish" style="margin-top:14px"><span class="ii">📨</span><div class="small"><b>${req} üründe fiyat artışı %${Svc.priceLimit()} sınırını aşıyor</b> (ya da ürün flaş fırsatta). Bu ürünlerin stoğu güncellenir, yeni fiyat ise yönetici onayına gider.</div></div>` : ''}
              <div class="toolbar" style="margin-top:14px"><div class="seg" id="xf">${[['all', 'Tümü'], ['new', 'Yeni'], ['update', 'Güncellenecek'], ['error', 'Hatalı'], ['same', 'Aynı']].map(([k, l], i) => `<button class="${i ? '' : 'on'}" data-f="${k}">${l}</button>`).join('')}</div></div>
              <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Durum</th><th>Ürün</th><th>Stok kodu</th><th>Kategori</th><th class="r">Fiyat</th><th class="r">Stok</th><th>Açıklama</th></tr></thead><tbody>
              ${R.slice(0, 300).map(r => `<tr data-st="${r.status}"><td class="xs muted">${r.i + 1}</td><td>${K.pill(lab, r.status)}</td><td class="small" style="max-width:280px">${esc(r.d.title || (r.match ? r.match.title : '—'))}${r.d.images.length ? `<div class="xs muted">🖼 ${r.d.images.length} görsel</div>` : ''}${r.d.variants.length > 1 ? `<div class="xs muted">${esc(r.d.variantName)}: ${esc(r.d.variants.join(', '))}</div>` : ''}</td><td class="xs">${esc(r.d.sku)}</td><td class="xs">${esc(Svc.cat(r.catId).name)} › ${esc(r.sub)}</td><td class="r small">${r.price ? U.tl(r.price) : '—'}${r.d.cost > 0 ? `<div class="xs muted">alış ${U.tl(r.d.cost)}</div>` : ''}</td><td class="r small">${r.d.stock}</td>
                <td class="xs">${r.errors.length ? `<span class="bad">${esc(r.errors.join(', '))}</span>` : r.changes.map(c => `<div>${esc(c[0])}: ${esc(c[1])}${c[2] ? ' <span class="badge b-warn">onaya gider</span>' : ''}</div>`).join('') || (r.warns.length ? `<span class="warn">${esc(r.warns.join(', '))}</span>` : '')}</td></tr>`).join('')}</tbody></table></div>
              ${R.length > 300 ? `<p class="small muted" style="margin-top:8px">İlk 300 satır gösteriliyor; tamamı aktarılır.</p>` : ''}
              <div class="row" style="margin-top:16px"><button class="btn" id="xBack2">← Eşleştirmeye dön</button><button class="btn btn-primary btn-lg" id="xGo" ${cnt('new') + cnt('update') ? '' : 'disabled'}>${cnt('new') + cnt('update')} ürünü içe aktar</button><label class="check small"><input type="checkbox" id="xRemember" checked> Eşleştirmeyi otomatik senkron için hatırla</label></div>`;
            U.$('#xf', main).onclick = e => { const b = e.target.closest('[data-f]'); if (!b) return; U.$$('#xf button', main).forEach(x => x.classList.toggle('on', x === b)); U.$$('tr[data-st]', body).forEach(tr => tr.hidden = b.dataset.f !== 'all' && tr.dataset.st !== b.dataset.f); };
            U.$('#xBack2', main).onclick = () => setStep(2);
            U.$('#xGo', main).onclick = () => {
              const res = Xml.import(R, state.opt, st, { file: state.file, source: state.source });
              if (U.$('#xRemember').checked) { st.xmlFeed = Object.assign({}, st.xmlFeed, { map: state.map, catMap: state.catMap, opt: state.opt }); DB.save(); }
              Modal.open({
                title: 'İçe aktarma tamamlandı', body: `<div class="stack"><div class="kpis">${K.kpi('Eklenen', U.num(res.created))}${K.kpi('Güncellenen', U.num(res.updated))}${K.kpi('Onaya giden zam', U.num(res.requested))}${K.kpi('Hatalı', U.num(res.errors))}</div>
                  ${res.deactivated ? `<p class="small">${res.deactivated} ürün XML'de olmadığı için pasife alındı.</p>` : ''}
                  ${res.requested ? `<div class="insight warnish"><span class="ii">📨</span><div class="small">${res.requested} ürünün yeni fiyatı yönetici onayını bekliyor. Onaylanınca otomatik uygulanır.</div></div>` : ''}
                  ${res.errors ? `<div class="small"><b>Hatalı satırlar</b>${res.errorRows.slice(0, 8).map(e => `<div class="muted">Satır ${e.row} (${esc(e.sku || '—')}): ${esc(e.msg)}</div>`).join('')}</div>` : ''}</div>`,
                actions: [{ label: 'Fiyat taleplerim', onClick: () => go('/seller/price-requests') }, { label: 'Ürünlerime git', primary: true, onClick: () => go('/seller/products?sort=new') }]
              });
              state.step = 1; state.rows = null; Router.refresh();
            };
          }
        };
        draw();
        U.$('#xExport', main).onclick = () => U.download(U.slug(st.name) + '-urunler.xml', Xml.export(st), 'application/xml');
        U.$('#xTpl', main).onclick = () => Modal.open({ title: 'XML şablonu', wide: true, body: `<p class="small muted" style="margin-bottom:10px">Alan adları Türkçe ya da İngilizce olabilir (ör. <code>StokKodu</code> / <code>sku</code>, <code>SatisFiyati</code> / <code>price</code>). Ondalık ayıracı virgül veya nokta olabilir.</p><textarea class="textarea" readonly style="min-height:360px;font-family:ui-monospace,monospace;font-size:.76rem">${esc(Xml.sample(st))}</textarea>`, actions: [{ label: 'Kopyala', onClick: () => { U.copy(Xml.sample(st)); return false; } }, { label: 'Kapat', primary: true }] });
        U.$('#fSave', main).onclick = () => { st.xmlFeed = Object.assign({}, st.xmlFeed, { url: U.$('#fUrl').value.trim(), interval: U.$('#fInt').value, scope: U.$('#fScope').value }); DB.save(); C.toast('XML feed ayarları kaydedildi'); Router.refresh(); };
        U.$('#fSync', main).onclick = async e => {
          const b = e.currentTarget; b.disabled = true; b.textContent = 'Bağlanılıyor…';
          const url = (st.xmlFeed || {}).url;
          try {
            const r = await fetch(url, { cache: 'no-store' });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const text = await r.text();
            const P = Xml.parse(text); if (P.error) throw new Error(P.error);
            const f = st.xmlFeed;
            const map = Object.assign(Xml.guess(P.keys), f.map || {});
            const opt = Object.assign({ update: true, create: false, publish: true, rounding: 'none', priceMode: 'asis' }, f.opt || {}, { stockOnly: f.scope === 'stock' });
            const res = Xml.import(Xml.rows(P, map, f.catMap || {}, opt, st), opt, st, { file: url, source: 'Otomatik senkron' });
            f.lastSync = Date.now(); f.lastMsg = `${res.updated} güncellendi, ${res.created} eklendi, ${res.requested} zam onaya gitti`;
            DB.save(); C.toast('Senkronizasyon tamamlandı: ' + f.lastMsg); Router.refresh();
          } catch (err) {
            st.xmlFeed.lastSync = Date.now(); st.xmlFeed.lastMsg = 'Bağlantı kurulamadı'; DB.save();
            Modal.open({ title: 'XML adresine ulaşılamadı', body: `<p class="small">"${esc(url)}" adresinden veri alınamadı (${esc(err.message)}).</p><ul class="small muted" style="line-height:1.8"><li>Adresin tarayıcıda açıldığını ve XML döndürdüğünü kontrol et.</li><li>Tedarikçi sunucusu başka sitelerin okumasına izin vermiyor olabilir (CORS). Canlı sistemde senkron sunucu tarafında yapıldığı için bu kısıt olmaz.</li><li>Bu önizleme ortamında dış adreslere erişim kapalıdır; dosyayı indirip yukarıdan yükleyebilirsin.</li></ul>`, actions: [{ label: 'Tamam', primary: true }] });
            b.disabled = false; b.textContent = 'Şimdi senkronize et';
          }
        };
        main.addEventListener('click', e => { const b = e.target.closest('[data-errs]'); if (!b) return; const x = DB.get('imports', b.dataset.errs); Modal.open({ title: 'Hatalı satırlar', body: (x.errorRows || []).map(r => `<div class="small" style="padding:6px 0;border-bottom:1px solid var(--line)"><b>Satır ${r.row}</b> · ${esc(r.sku || '—')}<div class="muted">${esc(r.msg)}</div></div>`).join(''), actions: [{ label: 'Kapat', primary: true }] }); });
      }
    });
  };

  /* ---------------- Otomatik fiyatlandırma ---------------- */
  function ruleModal(st, rule, done) {
    const r = rule ? JSON.parse(JSON.stringify(rule)) : { name: '', type: 'buybox', active: true, params: Object.assign({}, RULES.buybox.defaults), scope: { kind: 'all' }, guards: { minMargin: 10, maxChange: 15, rounding: '90' } };
    const subs = U.uniq(DB.where('products', p => p.storeId === st.id).map(p => p.sub));
    const cats = U.uniq(DB.where('products', p => p.storeId === st.id).map(p => p.categoryId)).map(id => Svc.cat(id));
    Modal.open({
      title: rule ? 'Kuralı düzenle' : 'Yeni fiyat kuralı', wide: true,
      body: `<div class="stack lg">
        <div class="field"><span class="lbl">Kural tipi</span><div class="g3" id="rtypes" style="gap:8px">${Object.entries(RULES).map(([k, t]) => `<button type="button" class="addr ${r.type === k ? 'on' : ''}" data-type="${k}" style="padding:10px"><b class="small">${t.icon} ${t.label}</b><span class="xs muted">${t.desc}</span></button>`).join('')}</div></div>
        <div class="form-grid"><div class="field"><label for="rn">Kural adı</label><input class="input" id="rn" value="${esc(r.name)}" placeholder="Örn: Boyalarda rakibe göre fiyat"></div>
          <div class="field"><label for="rsk">Uygulanacak ürünler</label><select class="select" id="rsk"><option value="all">Tüm ürünlerim</option>${cats.map(c => `<option value="cat:${c.id}" ${r.scope.kind === 'cat' && +r.scope.value === c.id ? 'selected' : ''}>Kategori: ${esc(c.name)}</option>`).join('')}${subs.map(s => `<option value="sub:${esc(s)}" ${r.scope.kind === 'sub' && r.scope.value === s ? 'selected' : ''}>Alt kategori: ${esc(s)}</option>`).join('')}</select></div></div>
        <div id="rparams" class="form-grid"></div>
        <div class="card card-pad stack" style="background:var(--surface-2)"><b class="small">🛡 Koruma sınırları</b><div class="form-grid">
          <div class="field"><label for="gmm">En az net kâr marjı (%)</label><input class="input" id="gmm" type="number" value="${r.guards.minMargin ?? ''}"><span class="hint">Maliyeti girilmiş ürünlerde fiyat bunun altına inmez</span></div>
          <div class="field"><label for="gmc">Tek seferde en fazla değişim (%)</label><input class="input" id="gmc" type="number" value="${r.guards.maxChange ?? ''}"></div>
          <div class="field"><label for="grd">Yuvarlama</label><select class="select" id="grd">${Object.entries(ROUND).map(([k, v]) => `<option value="${k}" ${r.guards.rounding === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div>
          <span class="xs muted">Artışlar %${Svc.priceLimit()} platform sınırını aşarsa fiyat değişmez, otomatik olarak fiyat artış talebi oluşturulur.</span></div>
      </div>`,
      onMount(bg) {
        const drawParams = () => {
          const t = RULES[r.type];
          U.$('#rparams', bg).innerHTML = t.fields.map(([k, l, type]) => type === 'check'
            ? `<label class="check small full"><input type="checkbox" data-p="${k}" ${r.params[k] ? 'checked' : ''}> ${l}</label>`
            : `<div class="field"><label for="rp-${k}">${l}</label><input class="input" id="rp-${k}" data-p="${k}" type="${type}" value="${esc(r.params[k] ?? t.defaults[k])}"></div>`).join('');
          if (!U.$('#rn', bg).value || Object.values(RULES).some(x => x.label === U.$('#rn', bg).value)) U.$('#rn', bg).value = t.label;
        };
        drawParams();
        U.$('#rtypes', bg).onclick = e => { const b = e.target.closest('[data-type]'); if (!b) return; r.type = b.dataset.type; r.params = Object.assign({}, RULES[r.type].defaults); U.$$('#rtypes .addr', bg).forEach(x => x.classList.toggle('on', x === b)); drawParams(); };
        bg._collect = () => {
          U.$$('[data-p]', bg).forEach(i => { r.params[i.dataset.p] = i.type === 'checkbox' ? i.checked : i.type === 'number' ? +i.value : i.value; });
          const sk = U.$('#rsk', bg).value; r.scope = sk === 'all' ? { kind: 'all' } : { kind: sk.split(':')[0], value: sk.slice(sk.indexOf(':') + 1) };
          r.guards = { minMargin: U.$('#gmm', bg).value === '' ? '' : +U.$('#gmm', bg).value, maxChange: +U.$('#gmc', bg).value || 0, rounding: U.$('#grd', bg).value };
          r.name = U.$('#rn', bg).value.trim() || RULES[r.type].label;
          return r;
        };
      },
      actions: [{ label: 'Vazgeç' }, { label: 'Kaydet', primary: true, onClick: bg => {
        const v = bg._collect();
        if (rule) Object.assign(rule, v); else DB.insert('priceRules', Object.assign(v, { storeId: st.id, order: Svc.storeRules(st.id).length + 1 }));
        DB.save(); C.toast('Kural kaydedildi. Önizlemeden etkisini görebilirsin.', { icon: '🤖' }); done && done();
      } }]
    });
  }
  function simModal(st, changes, onApply) {
    const req = changes.filter(c => c.why).length;
    const up = changes.filter(c => c.new > c.old).length;
    Modal.open({
      title: `Önizleme: ${changes.length} ürünün fiyatı değişecek`, wide: true,
      body: changes.length ? `<div class="row small" style="gap:18px;margin-bottom:12px"><span>▲ ${up} artış</span><span>▼ ${changes.length - up} indirim</span>${req ? `<span class="badge b-warn">📨 ${req} artış onaya gidecek</span>` : ''}</div>
        <div class="tbl-wrap" style="max-height:52vh;overflow:auto"><table class="tbl"><thead><tr><th>Ürün</th><th class="r">Şu an</th><th class="r">Yeni</th><th class="r">Fark</th><th>Neden</th></tr></thead><tbody>
        ${changes.map(c => `<tr><td class="small" style="max-width:240px">${esc(c.p.title)}</td><td class="r small">${U.tl(c.old)}</td><td class="r"><b>${U.tl(c.new)}</b></td><td class="r small">${pctTxt(c.old, c.new)}</td><td class="xs">${c.steps.map(s => `<div>${esc(s.rule.name)}: ${esc(s.reason)}</div>`).join('')}${c.why ? `<span class="badge b-warn">onaya gider</span>` : ''}</td></tr>`).join('')}</tbody></table></div>`
        : K.empty('✅', 'Değişiklik yok', 'Kurallar şu an hiçbir üründe fiyat değişikliği gerektirmiyor.'),
      actions: changes.length ? [{ label: 'Vazgeç' }, { label: 'Fiyatları uygula', primary: true, onClick: onApply }] : [{ label: 'Kapat', primary: true }]
    });
  }

  S.pricing = () => {
    const g = guard(); if (g) return g;
    const st = Svc.myStore();
    const auto = Svc.autoRunPricing(st.id);
    const rules = Svc.storeRules(st.id);
    const ap = Object.assign({ enabled: false, hour: 9 }, st.autoPricing);
    const log = DB.where('priceLog', l => l.storeId === st.id).sort((a, b) => b.createdAt - a.createdAt);
    const pend = DB.where('priceRequests', r => r.storeId === st.id && r.status === 'pending').length;
    const log30 = log.filter(l => l.createdAt > Date.now() - 30 * DAY);
    const html = `
      ${auto ? `<div class="insight good" style="margin-bottom:14px"><span class="ii">🤖</span><div class="small">Günlük otomatik çalıştırma az önce yapıldı: <b>${auto.applied}</b> fiyat güncellendi${auto.requested ? `, <b>${auto.requested}</b> artış onaya gönderildi` : ''}.</div></div>` : ''}
      <div class="kpis">${K.kpi('Aktif kural', U.num(rules.filter(r => r.active).length))}${K.kpi('Son 30 gün fiyat değişimi', U.num(log30.length))}${K.kpi('Onay bekleyen zam', U.num(pend))}${K.kpi('Son çalışma', ap.lastRun ? U.ago(ap.lastRun) : '—')}</div>
      <div class="g2" style="margin-top:16px;align-items:start">
        <section class="stack">
          <div class="row between"><h3 style="margin:0">Fiyat kuralları</h3><div class="row"><button class="btn" id="simAll" ${rules.some(r => r.active) ? '' : 'disabled'}>👁 Tümünü önizle</button><button class="btn btn-primary" id="newRule">+ Kural ekle</button></div></div>
          ${rules.length ? rules.map((r, i) => { const t = RULES[r.type]; const scope = r.scope.kind === 'all' ? 'Tüm ürünler' : r.scope.kind === 'cat' ? Svc.cat(+r.scope.value).name : r.scope.value; return `<div class="card card-pad stack" style="gap:8px;${r.active ? '' : 'opacity:.65'}">
            <div class="row between nowrap"><div class="row nowrap" style="min-width:0"><span class="rank">${i + 1}</span><span style="font-size:1.3rem">${t.icon}</span><div style="min-width:0"><b>${esc(r.name)}</b><div class="xs muted">${t.label} · ${esc(scope)}</div></div></div><label class="switch" title="Aktif/pasif"><input type="checkbox" data-ract="${r.id}" ${r.active ? 'checked' : ''}><span></span></label></div>
            <div class="row" style="gap:6px">${t.fields.map(([k, l, ty]) => `<span class="chip" style="font-size:.74rem">${esc(l)}: <b>${ty === 'check' ? (r.params[k] ? 'evet' : 'hayır') : esc(r.params[k])}</b></span>`).join('')}${r.guards.minMargin !== '' && r.guards.minMargin != null ? `<span class="chip" style="font-size:.74rem">🛡 min marj %${r.guards.minMargin}</span>` : ''}${r.guards.maxChange ? `<span class="chip" style="font-size:.74rem">🛡 max %${r.guards.maxChange}</span>` : ''}</div>
            <div class="row between"><span class="xs muted">${r.lastRun ? `Son çalışma ${U.ago(r.lastRun)} · ${r.lastCount || 0} ürün` : 'Henüz çalışmadı'}</span><div class="row" style="gap:4px"><button class="btn btn-sm" data-rsim="${r.id}">Önizle</button><button class="btn btn-sm btn-ghost" data-redit="${r.id}">Düzenle</button>${i ? `<button class="btn btn-sm btn-ghost" data-rup="${r.id}" title="Önceliği artır">▲</button>` : ''}<button class="btn btn-sm btn-ghost" data-rdel="${r.id}">🗑</button></div></div></div>`; }).join('')
            : `<div class="card">${K.empty('🤖', 'Henüz kuralın yok', 'Rakibe göre fiyatlama, stok ve satış hızına göre fiyat, maliyet + marj ya da periyodik zam kuralları oluşturabilirsin.', '<button class="btn btn-primary" id="newRule2">İlk kuralı oluştur</button>')}</div>`}
          <p class="xs muted">Kurallar yukarıdan aşağı sırayla uygulanır; bir kuralın sonucu sonrakinin başlangıç fiyatıdır.</p>
        </section>
        <aside class="stack">
          <div class="card card-pad stack"><div class="row between"><h3 style="margin:0">⏱ Otomatik çalıştır</h3><label class="switch"><input type="checkbox" id="apOn" ${ap.enabled ? 'checked' : ''}><span></span></label></div>
            <p class="small muted">Aktif kurallar her gün seçtiğin saatte çalışır. Sınırı aşan artışlar kendiliğinden fiyat artış talebine dönüşür.</p>
            <div class="field"><label for="apH">Çalışma saati</label><select class="select" id="apH">${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${ap.hour === h ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('')}</select></div>
            ${ap.lastRun ? `<span class="xs muted">Son çalışma ${U.dateTime(ap.lastRun)}: ${ap.lastApplied || 0} güncelleme, ${ap.lastRequested || 0} talep</span>` : ''}</div>
          <div class="card card-pad stack"><h3 style="margin:0">📏 Platform kuralı</h3><p class="small">Fiyat artışları son 30 günün en yüksek fiyatına göre <b>%${Svc.priceLimit()}</b>'e kadar anında uygulanır. Daha yüksek artışlar ve flaş fırsattaki ürünlerde yapılan tüm artışlar yönetici onayına gider.</p><a class="btn btn-sm" href="#/seller/price-requests" style="align-self:flex-start">Fiyat taleplerim${pend ? ` (${pend})` : ''} →</a></div>
        </aside>
      </div>
      <section class="card" style="margin-top:20px"><div style="padding:16px 18px 0"><h3 style="margin:0">Fiyat değişim geçmişi</h3></div>
        ${log.length ? `<div style="overflow-x:auto;padding-top:8px"><table class="tbl"><thead><tr><th>Tarih</th><th>Ürün</th><th class="r">Eski</th><th class="r">Yeni</th><th class="r">Fark</th><th>Kaynak</th></tr></thead><tbody>
          ${log.slice(0, 60).map(l => { const p = Svc.product(l.productId); return `<tr><td class="small">${U.dateTime(l.createdAt)}</td><td class="small">${p ? `<a href="#/seller/products/${p.id}">${esc(p.title)}</a>` : '—'}</td><td class="r small">${U.tl(l.old)}</td><td class="r"><b>${U.tl(l.new)}</b></td><td class="r small">${pctTxt(l.old, l.new)}</td><td class="xs">${esc(l.source)}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="small muted" style="padding:12px 18px 18px">Henüz kayıtlı fiyat değişikliği yok.</p>'}
      </section>`;
    return spage({
      title: 'Otomatik fiyatlandırma', sub: 'Kurallarla fiyatlarını rekabetçi ve kârlı tut', html,
      mount(main) {
        const apply = ids => { const r = Svc.runRules(st.id, { ruleIds: ids, dry: false }); C.toast(`${r.applied} fiyat güncellendi${r.requested ? `, ${r.requested} artış onaya gönderildi` : ''}`, { icon: '🤖', link: r.requested ? '/seller/price-requests' : null, linkText: 'Talepler' }); Router.refresh(); };
        const sim = ids => simModal(st, Svc.runRules(st.id, { ruleIds: ids, dry: true }).changes, () => apply(ids));
        [U.$('#newRule', main), U.$('#newRule2', main)].forEach(b => b && (b.onclick = () => ruleModal(st, null, () => Router.refresh())));
        const sa = U.$('#simAll', main); sa && (sa.onclick = () => sim(null));
        U.$('#apOn', main).onchange = e => { st.autoPricing = Object.assign({}, ap, { enabled: e.target.checked, lastRun: e.target.checked ? Date.now() : ap.lastRun }); DB.save(); C.toast(e.target.checked ? `Kurallar her gün ${String(ap.hour).padStart(2, '0')}:00'da otomatik çalışacak` : 'Otomatik çalıştırma kapatıldı'); };
        U.$('#apH', main).onchange = e => { st.autoPricing = Object.assign({}, st.autoPricing || ap, { hour: +e.target.value }); DB.save(); C.toast('Çalışma saati güncellendi'); };
        main.addEventListener('change', e => { const t = e.target.closest('[data-ract]'); if (t) { DB.update('priceRules', t.dataset.ract, { active: t.checked }); Router.refresh(); } });
        main.addEventListener('click', async e => {
          let b;
          if ((b = e.target.closest('[data-rsim]'))) sim([+b.dataset.rsim]);
          else if ((b = e.target.closest('[data-redit]'))) ruleModal(st, DB.get('priceRules', b.dataset.redit), () => Router.refresh());
          else if ((b = e.target.closest('[data-rdel]'))) { if (await Modal.confirm('Kural silinsin mi? Uygulanmış fiyatlar değişmez.', { ok: 'Sil', danger: true })) { DB.remove('priceRules', b.dataset.rdel); Router.refresh(); } }
          else if ((b = e.target.closest('[data-rup]'))) { const rs = Svc.storeRules(st.id); const i = rs.findIndex(r => r.id === +b.dataset.rup); if (i > 0) { [rs[i - 1], rs[i]] = [rs[i], rs[i - 1]]; rs.forEach((r, k) => r.order = k + 1); DB.save(); Router.refresh(); } }
        });
      }
    });
  };

  /* ---------------- Fiyat artış talepleri (satıcı) ---------------- */
  S.priceRequests = (_, q) => {
    const g = guard(); if (g) return g;
    const st = Svc.myStore();
    const tab = q.s || 'pending';
    const all = DB.where('priceRequests', r => r.storeId === st.id).sort((a, b) => b.createdAt - a.createdAt);
    const list = tab === 'all' ? all : all.filter(r => tab === 'approved' ? ['approved', 'partial'].includes(r.status) : r.status === tab);
    const prods = DB.where('products', p => p.storeId === st.id && ['active', 'passive'].includes(p.status)).sort((a, b) => b.sold - a.sold);
    const html = `
      <section class="card card-pad stack" style="margin-bottom:20px"><div class="row between"><div><h3 style="margin:0">📨 Yeni fiyat artış talebi</h3><p class="small muted">Maliyet, kur ya da tedarikçi zammı nedeniyle fiyat artırman gerekiyorsa ürünleri seç. %${Svc.priceLimit()} sınırının altındaki artışlar anında uygulanır, üstündekiler onaya gider.</p></div></div>
        <div class="g2" style="grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);align-items:start">
          <div class="stack" style="gap:8px"><input class="input" id="rqS" placeholder="Ürün ara (ad veya stok kodu)"><div class="tbl-wrap" style="max-height:300px;overflow:auto"><table class="tbl"><thead><tr><th><input type="checkbox" id="rqAll" aria-label="Tümünü seç"></th><th>Ürün</th><th class="r">Fiyat</th><th class="r">30 gün en yüksek</th></tr></thead><tbody id="rqList">
            ${prods.map(p => { const pr = Svc.pendingRequest(p.id); return `<tr data-name="${esc(U.lower(p.title + ' ' + p.sku))}"><td><input type="checkbox" data-rq="${p.id}" aria-label="Seç"></td><td class="small">${esc(p.title)}<div class="xs muted">${esc(p.sku)}${pr ? ` · <span class="warn">bekleyen talep ${U.tl(pr.newPrice)}</span>` : ''}${Svc.deal(p.id) ? ' · ⚡ flaş fırsatta' : ''}</div></td><td class="r small">${U.tl(p.price)}</td><td class="r small muted">${U.tl(Svc.priceRef(p))}</td></tr>`; }).join('')}</tbody></table></div></div>
          <div class="stack">
            <div class="seg" id="rqMode"><button class="on" data-m="pct">Yüzde artış</button><button data-m="fixed">Yeni fiyat</button></div>
            <div class="field"><label for="rqV" id="rqVl">Artış oranı (%)</label><input class="input" id="rqV" type="number" value="20" step="0.01"></div>
            <div class="field"><label for="rqR">Gerekçe</label><select class="select" id="rqR">${REASONS.filter(r => !['Otomatik fiyat kuralı', 'XML fiyat güncellemesi'].includes(r)).map(r => `<option>${r}</option>`).join('')}</select></div>
            <div class="field"><label for="rqN">Açıklama (yöneticiye)</label><textarea class="textarea" id="rqN" style="min-height:70px" placeholder="Örn: Tedarikçi 1 Ekim itibarıyla liste fiyatlarını %18 artırdı, fatura ektedir."></textarea></div>
            <label class="check small"><input type="checkbox" id="rqForce"> Sınırın altındaki artışları da onaya gönder</label>
            <div id="rqSum" class="small muted"></div>
            <button class="btn btn-primary" id="rqGo">Talebi gönder</button>
          </div></div></section>
      <div class="tabs" style="margin-bottom:14px">${[['pending', 'Onay bekleyen'], ['approved', 'Onaylanan'], ['rejected', 'Reddedilen'], ['all', 'Tümü']].map(([k, l]) => { const n = k === 'all' ? all.length : all.filter(r => k === 'approved' ? ['approved', 'partial'].includes(r.status) : r.status === k).length; return `<a class="${tab === k ? 'on' : ''}" href="#/seller/price-requests?s=${k}">${l} <span class="badge ${k === 'pending' && n ? 'b-warn' : 'b-mute'}">${n}</span></a>`; }).join('')}</div>
      ${list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Ürün</th><th class="r">Mevcut</th><th class="r">Talep</th><th class="r">Artış</th><th>Gerekçe & kaynak</th><th>Durum</th><th></th></tr></thead><tbody>
        ${list.map(r => { const p = Svc.product(r.productId); return `<tr><td class="small" style="max-width:260px">${p ? `<a href="#/seller/products/${p.id}">${esc(p.title)}</a>` : '—'}<div class="xs muted">${U.dateTime(r.createdAt)}</div></td><td class="r small">${U.tl(r.oldPrice)}</td><td class="r"><b>${U.tl(r.newPrice)}</b>${r.approvedPrice && r.approvedPrice !== r.newPrice ? `<div class="xs ok">onaylanan ${U.tl(r.approvedPrice)}</div>` : ''}</td><td class="r small">${pctTxt(r.oldPrice, r.newPrice)}</td>
          <td class="xs" style="max-width:280px"><b>${esc(r.reason)}</b> · ${esc(r.source)}${r.note ? `<div class="muted">${esc(r.note)}</div>` : ''}<div class="muted">${esc(r.why || '')}</div>${r.adminNote ? `<div style="margin-top:4px"><b>Yönetici:</b> ${esc(r.adminNote)}</div>` : ''}</td>
          <td>${reqPill(r.status)}</td><td>${r.status === 'pending' ? `<button class="btn btn-sm btn-ghost" data-cancel="${r.id}">Geri çek</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>` : K.empty('📨', 'Bu durumda talep yok')}`;
    return spage({
      title: 'Fiyat artış talepleri', sub: `Artış sınırı %${Svc.priceLimit()} · onaylanan talepler otomatik uygulanır`, html,
      mount(main) {
        let mode = 'pct';
        const sel = () => U.$$('[data-rq]:checked', main).map(c => Svc.product(+c.dataset.rq));
        const summary = () => {
          const ps = sel(), v = +U.$('#rqV').value;
          if (!ps.length || !(v > 0)) { U.$('#rqSum').textContent = 'Ürün seç ve değer gir.'; return; }
          let direct = 0, req = 0;
          ps.forEach(p => { const np = mode === 'pct' ? p.price * (1 + v / 100) : v; if (np <= p.price) return; if (U.$('#rqForce').checked || Svc.needsApproval(p, np)) req++; else direct++; });
          U.$('#rqSum').innerHTML = `${ps.length} ürün seçildi · <b>${direct}</b> anında uygulanacak · <b>${req}</b> onaya gidecek`;
        };
        U.$('#rqS', main).oninput = e => { const v = U.lower(e.target.value); U.$$('#rqList tr', main).forEach(tr => tr.hidden = !tr.dataset.name.includes(v)); };
        U.$('#rqAll', main).onchange = e => { U.$$('#rqList tr:not([hidden]) [data-rq]', main).forEach(c => c.checked = e.target.checked); summary(); };
        U.$('#rqMode', main).onclick = e => { const b = e.target.closest('[data-m]'); if (!b) return; mode = b.dataset.m; U.$$('#rqMode button', main).forEach(x => x.classList.toggle('on', x === b)); U.$('#rqVl').textContent = mode === 'pct' ? 'Artış oranı (%)' : 'Yeni fiyat (TL)'; if (mode === 'fixed') { const p = sel()[0]; U.$('#rqV').value = p ? (p.price * 1.2).toFixed(2) : ''; } summary(); };
        main.addEventListener('change', e => { if (e.target.closest('[data-rq]') || e.target.id === 'rqForce') summary(); });
        U.$('#rqV', main).oninput = summary;
        summary();
        U.$('#rqGo', main).onclick = () => {
          const ps = sel(), v = +U.$('#rqV').value;
          if (!ps.length) return C.toast('En az bir ürün seç', { icon: 'ℹ️' });
          if (!(v > 0)) return C.toast('Geçerli bir değer gir', { icon: '⚠️' });
          if (mode === 'fixed' && ps.length > 1) return C.toast('Sabit fiyat için tek ürün seç ya da yüzde artış kullan', { icon: 'ℹ️' });
          let applied = 0, requested = 0, skipped = 0;
          ps.forEach(p => {
            const np = mode === 'pct' ? p.price * (1 + v / 100) : v;
            if (np <= p.price) { skipped++; return; }
            const r = Svc.setPrice(p, np, { source: 'Satıcı talebi', reason: U.$('#rqR').value, note: U.$('#rqN').value.trim(), force: U.$('#rqForce').checked });
            if (r.applied) applied++; if (r.requested) requested++;
          });
          C.toast(`${applied ? applied + ' fiyat anında güncellendi. ' : ''}${requested ? requested + ' talep yönetici onayına gönderildi.' : ''}${skipped ? ` ${skipped} ürün atlandı (yeni fiyat düşük).` : ''}`, { icon: '📨', ms: 4500 });
          Router.refresh();
        };
        main.addEventListener('click', e => { const b = e.target.closest('[data-cancel]'); if (b) { DB.update('priceRequests', b.dataset.cancel, { status: 'cancelled', decidedAt: Date.now() }); C.toast('Talep geri çekildi'); Router.refresh(); } });
      }
    });
  };

  /* ---------------- Fiyat artış talepleri (yönetici) ---------------- */
  A.priceRequests = (_, q) => {
    const u = Auth.user();
    if (!u) return { redirect: '/login?next=' + encodeURIComponent(Router.path) };
    if (u.role !== 'admin') return { redirect: '/' };
    const tab = q.s || 'pending';
    const all = DB.all('priceRequests').slice().sort((a, b) => b.createdAt - a.createdAt);
    let list = tab === 'all' ? all : all.filter(r => tab === 'approved' ? ['approved', 'partial'].includes(r.status) : r.status === tab);
    if (q.store) list = list.filter(r => r.storeId === +q.store);
    const decided = all.filter(r => ['approved', 'partial', 'rejected'].includes(r.status));
    const html = `
      <div class="kpis">${K.kpi('Onay bekleyen', U.num(all.filter(r => r.status === 'pending').length))}${K.kpi('Onay oranı', decided.length ? '%' + Math.round(decided.filter(r => r.status !== 'rejected').length / decided.length * 100) : '—')}${K.kpi('Ortalama talep edilen artış', all.length ? '%' + (U.sum(all, r => (r.newPrice / r.oldPrice - 1) * 100) / all.length).toFixed(1).replace('.', ',') : '—')}${K.kpi('Artış sınırı', '%' + Svc.priceLimit())}</div>
      <div class="card card-pad row between" style="margin-top:16px"><div class="row"><label class="check small"><span class="switch"><input type="checkbox" id="apOn" ${Svc.approvalOn() ? 'checked' : ''}><span></span></span> Fiyat artışları onaya tabi</label>
        <label class="row nowrap small" style="gap:6px">Onaysız artış sınırı %<input class="input num" id="apLim" type="number" min="0" max="100" value="${Svc.priceLimit()}" style="width:80px;padding:6px 8px"></label><button class="btn btn-sm" id="apSave">Kaydet</button></div>
        <span class="xs muted">Referans: ürünün son 30 günde geçerli olan en yüksek fiyatı</span></div>
      <div class="tabs" style="margin:16px 0 14px">${[['pending', 'Onay bekleyen'], ['approved', 'Onaylanan'], ['rejected', 'Reddedilen'], ['all', 'Tümü']].map(([k, l]) => { const n = k === 'all' ? all.length : all.filter(r => k === 'approved' ? ['approved', 'partial'].includes(r.status) : r.status === k).length; return `<a class="${tab === k ? 'on' : ''}" href="#/admin/price-requests?s=${k}">${l} <span class="badge ${k === 'pending' && n ? 'b-brand' : 'b-mute'}">${n}</span></a>`; }).join('')}</div>
      ${tab === 'pending' && list.length ? `<div class="toolbar"><button class="btn btn-ok" id="bulkOk">Seçilenleri onayla</button><button class="btn btn-danger" id="bulkNo">Seçilenleri reddet</button><span class="xs muted">%30'un üstündeki artışlar kırmızı işaretlidir.</span></div>` : ''}
      ${list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr>${tab === 'pending' ? '<th><input type="checkbox" id="selAll" aria-label="Tümünü seç"></th>' : ''}<th>Ürün / mağaza</th><th class="r">Mevcut</th><th class="r">Talep</th><th class="r">Artış</th><th class="r">Rakip</th><th>Gerekçe</th><th>${tab === 'pending' ? '' : 'Durum'}</th></tr></thead><tbody>
        ${list.map(r => { const p = Svc.product(r.productId); const s = Svc.store(r.storeId); const inc = (r.newPrice / r.oldPrice - 1) * 100; const others = p ? Svc.otherSellers(p) : []; const rival = others.length ? Math.min(...others.map(o => Svc.priceInfo(o).price)) : null; return `<tr>
          ${tab === 'pending' ? `<td><input type="checkbox" data-sel="${r.id}" aria-label="Seç"></td>` : ''}
          <td class="small" style="min-width:170px;max-width:240px">${p ? `<a href="#/p/${p.id}">${esc(p.title)}</a>` : '—'}<div class="xs muted">${esc(s ? s.name : '')} · ${U.ago(r.createdAt)}${p && Svc.deal(p.id) ? ' · ⚡ flaşta' : ''}</div></td>
          <td class="r small">${U.tl(r.oldPrice)}<div class="xs muted">30g en yüksek ${U.tl(r.ref || r.oldPrice)}</div></td><td class="r"><b>${U.tl(r.newPrice)}</b>${r.approvedPrice && r.approvedPrice !== r.newPrice ? `<div class="xs ok">onay ${U.tl(r.approvedPrice)}</div>` : ''}</td>
          <td class="r"><span class="badge ${inc > 30 ? 'b-bad' : inc > 15 ? 'b-warn' : 'b-mute'}">+%${inc.toFixed(1).replace('.', ',')}</span></td><td class="r small">${rival ? U.tl(rival) + (rival < r.newPrice ? ' <span class="xs bad">daha ucuz</span>' : '') : '<span class="muted">—</span>'}</td>
          <td class="xs" style="min-width:160px;max-width:240px"><b>${esc(r.reason)}</b> · ${esc(r.source)}${r.note ? `<div class="muted">${esc(r.note)}</div>` : ''}${r.adminNote ? `<div><b>Not:</b> ${esc(r.adminNote)}</div>` : ''}</td>
          <td>${r.status === 'pending' ? `<div class="row nowrap" style="gap:4px"><button class="btn btn-sm btn-ok" data-ok="${r.id}">Onayla</button><button class="btn btn-sm" data-part="${r.id}">Kısmi</button><button class="btn btn-sm btn-danger" data-no="${r.id}">Reddet</button></div>` : reqPill(r.status)}</td></tr>`; }).join('')}</tbody></table></div>` : K.empty('📨', 'Bu durumda talep yok', tab === 'pending' ? 'Tüm fiyat artış talepleri değerlendirildi.' : '')}`;
    return apage({
      title: 'Fiyat artış talepleri', sub: 'Satıcıların sınırı aşan zam talepleri', html,
      mount(main) {
        U.$('#apSave', main).onclick = () => { DB.settings.priceApproval = U.$('#apOn').checked; DB.settings.priceIncreaseLimit = U.clamp(+U.$('#apLim').value || 0, 0, 100); DB.save(); C.toast('Fiyat onay kuralı kaydedildi'); Router.refresh(); };
        const sa = U.$('#selAll', main); sa && (sa.onchange = () => U.$$('[data-sel]', main).forEach(c => c.checked = sa.checked));
        const sel = () => U.$$('[data-sel]:checked', main).map(c => DB.get('priceRequests', c.dataset.sel));
        const bo = U.$('#bulkOk', main); bo && (bo.onclick = () => { const rs = sel(); if (!rs.length) return C.toast('Önce talep seç', { icon: 'ℹ️' }); rs.forEach(r => Svc.decideRequest(r, 'approved')); C.toast(rs.length + ' talep onaylandı, fiyatlar güncellendi'); Router.refresh(); });
        const bn = U.$('#bulkNo', main); bn && (bn.onclick = async () => { const rs = sel(); if (!rs.length) return C.toast('Önce talep seç', { icon: 'ℹ️' }); const n = await Modal.prompt(`${rs.length} talebi reddet`, { label: 'Satıcılara iletilecek gerekçe', textarea: true, value: 'Artış oranı piyasa ortalamasının üzerinde.', ok: 'Reddet' }); if (n == null) return; rs.forEach(r => Svc.decideRequest(r, 'rejected', { note: n })); Router.refresh(); });
        main.addEventListener('click', async e => {
          let b;
          if ((b = e.target.closest('[data-ok]'))) { Svc.decideRequest(DB.get('priceRequests', b.dataset.ok), 'approved'); C.toast('Onaylandı, yeni fiyat yayında'); Router.refresh(); }
          else if ((b = e.target.closest('[data-part]'))) {
            const r = DB.get('priceRequests', b.dataset.part);
            const mid = U.round2(r.oldPrice + (r.newPrice - r.oldPrice) / 2);
            const v = await Modal.prompt('Kısmi onay', { label: `Onaylanacak fiyat (talep ${U.tl(r.newPrice)}, mevcut ${U.tl(r.oldPrice)})`, value: mid.toFixed(2), ok: 'Bu fiyatı onayla' });
            if (v == null) return; const pr = +String(v).replace(',', '.');
            if (!(pr > r.oldPrice && pr < r.newPrice)) return C.toast('Fiyat mevcut ile talep arasında olmalı', { icon: '⚠️' });
            Svc.decideRequest(r, 'partial', { price: pr, note: `Talep edilen artışın bir kısmı onaylandı (${U.tl(pr)})` }); Router.refresh();
          }
          else if ((b = e.target.closest('[data-no]'))) { const n = await Modal.prompt('Talebi reddet', { label: 'Satıcıya iletilecek gerekçe', textarea: true, value: 'Aktif kampanya süresince fiyat artışı yapılamaz.', ok: 'Reddet' }); if (n == null) return; Svc.decideRequest(DB.get('priceRequests', b.dataset.no), 'rejected', { note: n }); Router.refresh(); }
        });
      }
    });
  };

  /* =====================================================================
     ÖRNEK VERİ (ilk kurulumda)
     ===================================================================== */
  C.Seed.extra = (d) => {
    const now = Date.now();
    d.settings.priceIncreaseLimit = 15;
    d.settings.priceApproval = true;
    d.priceRequests = []; d.priceRules = []; d.priceLog = []; d.imports = [];
    const guven = d.stores.find(s => s.key === 'guven');
    const add = (t, o) => { d[t].push(Object.assign({ id: d[t].length + 1, createdAt: now }, o)); };
    const pick = (sid, n) => d.products.filter(p => p.storeId === sid && p.status === 'active').slice(0, n);
    [[1, 3, 'Döviz kuru değişimi', 'Dolar kuru son iki haftada %6 yükseldi; ithal ürün maliyetlerimiz arttı.', 0.24], [2, 2, 'Tedarikçi zammı', 'Kumaş tedarikçimiz 1 Ekim itibarıyla %20 zam yaptı.', 0.21], [4, 1, 'Maliyet artışı', '', 0.35]].forEach(([sid, n, reason, note, inc], k) => {
      pick(sid, n).forEach((p, j) => add('priceRequests', { storeId: sid, productId: p.id, oldPrice: p.price, newPrice: U.round2(Math.round(p.price * (1 + inc)) - 0.1), ref: p.price, reason, note, source: 'Satıcı talebi', why: `Son 30 günün en yüksek fiyatına göre %${Math.round(inc * 100)} artış; sınır %15`, status: 'pending', createdAt: now - (k * 5 + j + 1) * 3600e3 }));
    });
    const gp = pick(guven.id, 4);
    if (gp[2]) add('priceRequests', { storeId: guven.id, productId: gp[2].id, oldPrice: U.round2(gp[2].price * 0.82), newPrice: gp[2].price, approvedPrice: gp[2].price, ref: gp[2].price * 0.82, reason: 'Tedarikçi zammı', note: 'Hammadde zammı', source: 'Satıcı talebi', why: 'Sınır aşıldı', status: 'approved', adminNote: '', decidedAt: now - 8 * DAY, createdAt: now - 9 * DAY });
    if (gp[3]) add('priceRequests', { storeId: guven.id, productId: gp[3].id, oldPrice: gp[3].price, newPrice: U.round2(gp[3].price * 1.4), ref: gp[3].price, reason: 'Maliyet artışı', note: '', source: 'XML: tedarikci.xml', why: 'Sınır aşıldı', status: 'rejected', adminNote: 'Ürün 7 gün önce kampanyadaydı; artış kademeli yapılmalı.', decidedAt: now - 2 * DAY, createdAt: now - 3 * DAY });
    add('priceRules', { storeId: guven.id, name: 'Boyalarda rakibe göre fiyat', type: 'buybox', active: true, params: { undercut: 1, raise: true }, scope: { kind: 'all' }, guards: { minMargin: 12, maxChange: 10, rounding: '90' }, order: 1, createdAt: now - 20 * DAY });
    add('priceRules', { storeId: guven.id, name: 'Az kalan stokta fiyat artır', type: 'stock', active: true, params: { low: 5, lowPct: 6, high: 200, highPct: 4 }, scope: { kind: 'all' }, guards: { minMargin: 10, maxChange: 10, rounding: '90' }, order: 2, createdAt: now - 20 * DAY });
    add('priceRules', { storeId: guven.id, name: 'Aylık enflasyon zammı', type: 'periodic', active: false, params: { pct: 3, days: 30 }, scope: { kind: 'sub', value: 'Boya' }, guards: { minMargin: '', maxChange: 5, rounding: '90' }, order: 3, createdAt: now - 20 * DAY });
    guven.autoPricing = { enabled: false, hour: 9 };
    guven.xmlFeed = { url: 'https://tedarikci-ornek.com/xml/guven-boya.xml', interval: '6h', scope: 'both', lastSync: now - 5 * 3600e3, lastMsg: '42 güncellendi, 0 eklendi, 1 zam onaya gitti' };
    add('imports', { storeId: guven.id, file: 'tedarikci-ekim.xml', source: 'Dosya yükleme', total: 48, created: 6, updated: 38, requested: 2, same: 2, skipped: 0, errors: 2, deactivated: 0, errorRows: [{ row: 17, sku: 'GB-1017', msg: 'Fiyat yok veya geçersiz' }, { row: 33, sku: '', msg: 'Stok kodu yok' }], createdAt: now - 6 * DAY });
    gp.slice(0, 2).forEach((p, i) => add('priceLog', { storeId: guven.id, productId: p.id, old: U.round2(p.price * 1.04), new: p.price, source: i ? 'Otomatik: Boyalarda rakibe göre fiyat' : 'Manuel', createdAt: now - (i + 2) * DAY }));
  };
})();
