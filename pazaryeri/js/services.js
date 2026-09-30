/* MarkaBahçem — iş kuralları: fiyat, arama, sepet, sipariş, öneri, analiz */
(function () {
  'use strict';
  const C = window.Carsim;
  const { U, DB, Store } = C;
  const DAY = U.DAY;

  const STATUS = {
    new: { label: 'Sipariş alındı', cls: 'b-info', icon: '🧾' },
    preparing: { label: 'Hazırlanıyor', cls: 'b-warn', icon: '📦' },
    shipped: { label: 'Kargoda', cls: 'b-brand', icon: '🚚' },
    delivered: { label: 'Teslim edildi', cls: 'b-ok', icon: '✅' },
    cancelled: { label: 'İptal edildi', cls: 'b-bad', icon: '✕' },
    returnRequested: { label: 'İade talebi', cls: 'b-warn', icon: '↩️' },
    returned: { label: 'İade edildi', cls: 'b-mute', icon: '↩️' }
  };
  const PROD_STATUS = { active: ['Yayında', 'b-ok'], pending: ['Onay bekliyor', 'b-warn'], rejected: ['Reddedildi', 'b-bad'], passive: ['Pasif', 'b-mute'] };
  const STORE_STATUS = { active: ['Aktif', 'b-ok'], pending: ['Başvuru', 'b-warn'], suspended: ['Askıda', 'b-bad'], rejected: ['Reddedildi', 'b-mute'] };

  const Svc = C.Svc = {
    STATUS, PROD_STATUS, STORE_STATUS,

    /* ----- temel erişim ----- */
    cats() { return DB.all('categories').filter(c => c.active); },
    cat(id) { return DB.get('categories', id); },
    store(id) { return DB.get('stores', id); },
    product(id) { return DB.get('products', id); },
    user(id) { return DB.get('users', id); },
    isLive(p) { if (!p || p.status !== 'active') return false; const s = this.store(p.storeId); return !!s && s.status === 'active' && !s.vacation; },
    live() { const act = new Set(DB.all('stores').filter(s => s.status === 'active' && !s.vacation).map(s => s.id)); return DB.all('products').filter(p => p.status === 'active' && act.has(p.storeId)); },
    myStore() { const u = C.Auth.user(); return u && u.storeId ? this.store(u.storeId) : null; },

    /* ----- fiyat ----- */
    ensureDeals() {
      const d = DB.data;
      if (d.dealsDay !== U.startOfDay(Date.now()) || !d.deals.length) { C.Seed.refreshDeals(d); DB.save(); }
    },
    deal(pid) { const now = Date.now(); return DB.all('deals').find(x => x.productId === pid && x.endsAt > now) || null; },
    priceInfo(p) {
      const deal = this.deal(p.id);
      const price = deal ? U.round2(p.price * (1 - deal.pct / 100)) : p.price;
      const old = Math.max(p.listPrice || 0, deal ? p.price : 0);
      const pct = old > price ? Math.round((old - price) / old * 100) : 0;
      return { price, old: old > price ? old : 0, pct, deal };
    },
    priceAnalysis(p) {
      const info = this.priceInfo(p);
      const now = Date.now();
      const hist = (p.priceHistory || []).filter(h => h[0] >= now - 90 * DAY);
      const vals = hist.map(h => h[1]).concat([p.price]);
      const min = Math.min(...vals), max = Math.max(...vals);
      // zaman ağırlıklı ortalama
      let acc = 0, tot = 0;
      const pts = (p.priceHistory || []).concat([[now, p.price]]);
      for (let i = 0; i < pts.length - 1; i++) { const a = Math.max(pts[i][0], now - 90 * DAY); const b = pts[i + 1][0]; if (b > a) { acc += pts[i][1] * (b - a); tot += b - a; } }
      const avg = tot ? acc / tot : p.price;
      const cur = info.price;
      const fake = p.listPrice > 0 && max < p.listPrice * 0.93;
      let verdict, text;
      if (cur <= min + 0.01) { verdict = 'lowest'; text = cur < min - 0.01 ? `Son 90 günün en düşük fiyatı, öncekinden %${Math.round((1 - cur / min) * 100)} daha ucuz` : 'Son 90 günün en düşük fiyatı'; }
      else if (cur < avg * 0.97) { verdict = 'good'; text = `90 günlük ortalamanın %${Math.round((1 - cur / avg) * 100)} altında`; }
      else if (cur > avg * 1.05) { verdict = 'high'; text = `90 günlük ortalamanın %${Math.round((cur / avg - 1) * 100)} üstünde. Fiyat alarmı kurabilirsin.`; }
      else { verdict = 'normal'; text = 'Fiyat son 90 günün ortalamasında'; }
      return { min, max, avg, cur, verdict, text, fake, series: pts };
    },
    installments(total) {
      const s = DB.settings;
      return s.installments.map(n => { const rate = s.installmentRates[n] || 0; const t = total * (1 + rate / 100); return { n, rate, total: t, monthly: t / n }; });
    },
    deliveryEstimate(p) {
      const st = this.store(p.storeId);
      const now = new Date();
      let ship = st ? st.shipDays : 2;
      if (now.getHours() >= 15) ship += 1;
      const dayName = d => d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
      const a = new Date(Date.now() + (ship + 1) * DAY), b = new Date(Date.now() + (ship + 3) * DAY);
      return { fast: p.fastDelivery, from: dayName(a), to: dayName(b), cutoff: 15 - now.getHours() };
    },

    /* ----- arama ----- */
    _vocab: null,
    vocab() {
      if (this._vocab) return this._vocab;
      const w = new Set();
      this.live().forEach(p => (p.title + ' ' + p.brand + ' ' + p.sub).split(/\s+/).forEach(x => { const n = U.norm(x); if (n.length > 2) w.add(n); }));
      this.cats().forEach(c => U.norm(c.name).split(' ').forEach(x => x.length > 2 && w.add(x)));
      return (this._vocab = Array.from(w));
    },
    lev(a, b) {
      if (Math.abs(a.length - b.length) > 2) return 9;
      const m = Array.from({ length: a.length + 1 }, (_, i) => [i]);
      for (let j = 1; j <= b.length; j++) m[0][j] = j;
      for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      return m[a.length][b.length];
    },
    hay(p) {
      if (!p._h) { const c = this.cat(p.categoryId), s = this.store(p.storeId); Object.defineProperty(p, '_h', { value: U.norm([p.title, p.brand, p.sub, c && c.name, s && s.name, (p.tags || []).join(' ')].join(' ')), enumerable: false, writable: true }); }
      return p._h;
    },
    /** Serbest metin + filtre araması. Yazım hatalarını düzeltir. */
    search(f = {}) {
      let list = this.live();
      let corrected = null;
      if (f.q) {
        let toks = U.norm(f.q).split(' ').filter(t => t.length > 1);
        const match = (p, ts) => { const h = ' ' + this.hay(p); return ts.every(t => h.includes(' ' + t)); };
        let res = list.filter(p => match(p, toks));
        if (!res.length && toks.length) {
          const voc = this.vocab();
          const fixed = toks.map(t => { if (voc.some(v => v.startsWith(t))) return t; let best = t, bd = 3; voc.forEach(v => { const d = this.lev(t, v.slice(0, Math.max(t.length, 3))); if (d < bd) { bd = d; best = v; } }); return bd <= (t.length > 5 ? 2 : 1) ? best : t; });
          if (fixed.join(' ') !== toks.join(' ')) { res = list.filter(p => match(p, fixed)); if (res.length) corrected = fixed.join(' '); }
          if (!res.length) res = list.filter(p => { const h = ' ' + this.hay(p); return toks.some(t => h.includes(' ' + t)); });
        }
        // başlık/alt kategori/markada tüm kelimeler geçen ürünler varsa yalnızca onları göster (kategori veya mağaza adına takılan zayıf eşleşmeleri ele)
        const ts = corrected ? corrected.split(' ') : toks;
        const strong = res.filter(p => { const h = ' ' + U.norm(p.title + ' ' + p.sub + ' ' + p.brand); return ts.every(t => h.includes(' ' + t)); });
        if (strong.length) res = strong;
        list = res;
        list.forEach(p => { const t = U.norm(p.title); p._score = toks.reduce((a, k) => a + (t.includes(k) ? 3 : 1), 0); });
      }
      if (f.cat) list = list.filter(p => p.categoryId === +f.cat);
      if (f.sub) list = list.filter(p => p.sub === f.sub);
      if (f.store) list = list.filter(p => p.storeId === +f.store);
      const base = list;
      if (f.brand && f.brand.length) { const b = [].concat(f.brand); list = list.filter(p => b.includes(p.brand)); }
      if (f.min) list = list.filter(p => this.priceInfo(p).price >= +f.min);
      if (f.max) list = list.filter(p => this.priceInfo(p).price <= +f.max);
      if (f.rating) list = list.filter(p => p.rating >= +f.rating);
      if (f.fs) list = list.filter(p => this.freeShip(p));
      if (f.fast) list = list.filter(p => p.fastDelivery);
      if (f.deal) list = list.filter(p => this.deal(p.id));
      if (f.disc) list = list.filter(p => this.priceInfo(p).pct > 0);
      if (f.instock) list = list.filter(p => p.stock > 0);
      const pi = p => this.priceInfo(p).price;
      const sorts = {
        'price-asc': (a, b) => pi(a) - pi(b),
        'price-desc': (a, b) => pi(b) - pi(a),
        best: (a, b) => b.sold - a.sold,
        rating: (a, b) => (b.rating * Math.log(2 + b.reviewCount)) - (a.rating * Math.log(2 + a.reviewCount)),
        new: (a, b) => b.createdAt - a.createdAt,
        disc: (a, b) => this.priceInfo(b).pct - this.priceInfo(a).pct,
        rec: (a, b) => this.popScore(b) + (b._score || 0) * 50 - this.popScore(a) - (a._score || 0) * 50
      };
      list = list.slice().sort(sorts[f.sort] || sorts.rec);
      return { list, base, corrected };
    },
    popScore(p) { return Math.log(1 + p.sold) * 10 + p.rating * 4 + (this.deal(p.id) ? 8 : 0) + (p.featured ? 6 : 0) + Math.log(1 + p.views); },
    facets(list) {
      const count = f => { const m = new Map(); list.forEach(p => { const k = f(p); m.set(k, (m.get(k) || 0) + 1); }); return [...m].sort((a, b) => b[1] - a[1]); };
      const prices = list.map(p => this.priceInfo(p).price);
      return { brands: count(p => p.brand), subs: count(p => p.sub), stores: count(p => p.storeId), cats: count(p => p.categoryId), min: Math.floor(Math.min(...prices, 0)), max: Math.ceil(Math.max(...prices, 0)) };
    },
    suggest(q) {
      const n = U.norm(q);
      if (!n) return { products: [], cats: [], stores: [], terms: [] };
      const r = this.search({ q, sort: 'rec' });
      const cats = [];
      this.cats().forEach(c => { if (U.norm(c.name).includes(n)) cats.push({ c }); c.subs.forEach(s => { if (U.norm(s).includes(n)) cats.push({ c, s }); }); });
      const stores = DB.all('stores').filter(s => s.status === 'active' && U.norm(s.name).includes(n));
      const terms = U.uniq(r.list.slice(0, 20).map(p => p.sub)).slice(0, 4);
      return { products: r.list.slice(0, 5), cats: cats.slice(0, 4), stores: stores.slice(0, 3), terms, corrected: r.corrected };
    },
    freeShip(p) { const s = this.store(p.storeId); return !!s && (s.freeShipOver === 0 || this.priceInfo(p).price >= s.freeShipOver); },

    /* ----- keşif ----- */
    trackView(pid) {
      const v = (Store.get('carsim_viewed') || []).filter(x => x !== pid);
      v.unshift(pid); Store.set('carsim_viewed', v.slice(0, 30));
      const p = this.product(pid); if (p) { p.views++; DB.save(); }
    },
    viewed() { return (Store.get('carsim_viewed') || []).map(id => this.product(id)).filter(p => this.isLive(p)); },
    recommend(n = 12, exclude = []) {
      const u = C.Auth.user();
      const catW = {};
      const bump = (pid, w) => { const p = this.product(pid); if (p) catW[p.categoryId] = (catW[p.categoryId] || 0) + w; };
      this.viewed().forEach((p, i) => bump(p.id, 3 / (1 + i * 0.3)));
      if (u) {
        (u.favorites || []).forEach(id => bump(id, 2));
        DB.where('orders', o => o.userId === u.id).slice(-10).forEach(o => o.packages.forEach(pk => pk.items.forEach(it => bump(it.productId, 1.5))));
      }
      const ex = new Set(exclude);
      const seen = new Set(this.viewed().slice(0, 3).map(p => p.id));
      const list = this.live().filter(p => !ex.has(p.id) && !seen.has(p.id));
      const score = p => (catW[p.categoryId] || 0) * 12 + this.popScore(p);
      const sorted = list.sort((a, b) => score(b) - score(a));
      // mağaza çeşitliliği: aynı mağazadan en fazla 3
      const out = [], perStore = {};
      for (const p of sorted) { if ((perStore[p.storeId] || 0) >= 3) continue; perStore[p.storeId] = (perStore[p.storeId] || 0) + 1; out.push(p); if (out.length >= n) break; }
      return { list: out, personalized: Object.keys(catW).length > 0 };
    },
    bestSellers(n = 12, cat) { return this.live().filter(p => !cat || p.categoryId === cat).sort((a, b) => b.sold - a.sold).slice(0, n); },
    similar(p, n = 10) {
      const pr = this.priceInfo(p).price;
      return this.live().filter(x => x.id !== p.id && x.categoryId === p.categoryId && x.groupKey !== p.groupKey)
        .sort((a, b) => (a.sub === p.sub ? 0 : 1) - (b.sub === p.sub ? 0 : 1) || Math.abs(this.priceInfo(a).price - pr) - Math.abs(this.priceInfo(b).price - pr)).slice(0, n);
    },
    otherSellers(p) { return p.groupKey ? this.live().filter(x => x.groupKey === p.groupKey && x.id !== p.id) : []; },
    boughtTogether(p, n = 3) {
      const cnt = new Map();
      DB.all('orders').forEach(o => {
        const ids = o.packages.flatMap(pk => pk.items.map(i => i.productId));
        if (!ids.includes(p.id)) return;
        ids.forEach(id => { if (id !== p.id) cnt.set(id, (cnt.get(id) || 0) + 1); });
      });
      let res = [...cnt].sort((a, b) => b[1] - a[1]).map(([id]) => this.product(id)).filter(x => this.isLive(x) && x.categoryId !== p.categoryId);
      if (res.length < n) res = res.concat(this.live().filter(x => x.storeId === p.storeId && x.id !== p.id && !res.includes(x)).sort((a, b) => b.sold - a.sold));
      return res.slice(0, n);
    },
    reviewSummary(pid) {
      const rs = DB.where('reviews', r => r.productId === pid);
      if (!rs.length) return null;
      const POS = { 'Kalite': ['kalite', 'mukemmel', 'saglam'], 'Hızlı kargo': ['hizli', 'hizliydi'], 'Paketleme': ['paketleme ozen', 'ozenli'], 'Fiyat/performans': ['fiyatina', 'deger', 'harika'], 'Orijinallik': ['orijinal'], 'Tavsiye': ['tavsiye', 'tekrar alirim'] };
      const NEG = { 'Kargo gecikmesi': ['gec geldi', 'gec'], 'Kalıp küçük': ['kucuk'], 'Malzeme ince': ['ince', 'kalitesiz'], 'Hasarlı gönderim': ['hasarli'], 'Renk farkı': ['farkli'] };
      const find = (dict, subset) => Object.entries(dict).map(([k, words]) => [k, subset.filter(r => words.some(w => U.norm(r.text).includes(w))).length]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
      const good = rs.filter(r => r.rating >= 4), bad = rs.filter(r => r.rating <= 3);
      const pros = find(POS, good).slice(0, 3), cons = find(NEG, bad.concat(rs.filter(r => r.rating === 4))).slice(0, 2);
      const pos = Math.round(good.length / rs.length * 100);
      const dist = [5, 4, 3, 2, 1].map(s => rs.filter(r => r.rating === s).length);
      let sentence = `Alıcıların %${pos}'i bu üründen memnun.`;
      if (pros.length) sentence += ` En çok övülen: ${pros.map(x => x[0].toLocaleLowerCase('tr-TR')).join(', ')}.`;
      if (cons.length) sentence += ` Dikkat: ${cons.map(x => x[0].toLocaleLowerCase('tr-TR')).join(', ')} yorumları var.`;
      return { pros, cons, pos, dist, total: rs.length, sentence };
    },

    /* ----- favoriler, takip, karşılaştırma ----- */
    requireLogin(msg = 'Bu işlem için giriş yapmalısın.') {
      if (C.Auth.user()) return true;
      C.toast(msg, { icon: '🔒', link: '/login?next=' + encodeURIComponent(C.Router.path), linkText: 'Giriş yap' });
      return false;
    },
    isFav(pid) { const u = C.Auth.user(); return !!u && (u.favorites || []).includes(pid); },
    toggleFav(pid) {
      if (!this.requireLogin('Favorilere eklemek için giriş yap.')) return null;
      const u = C.Auth.user();
      u.favorites = u.favorites || [];
      const on = !u.favorites.includes(pid);
      u.favorites = on ? [pid].concat(u.favorites) : u.favorites.filter(x => x !== pid);
      DB.save();
      C.toast(on ? 'Favorilere eklendi' : 'Favorilerden çıkarıldı', { icon: on ? '♥' : '♡', link: on ? '/account/favorites' : null, linkText: 'Favorilerim' });
      return on;
    },
    isFollowing(sid) { const u = C.Auth.user(); const s = this.store(sid); return !!u && !!s && s.followers.includes(u.id); },
    toggleFollow(sid) {
      if (!this.requireLogin('Mağaza takibi için giriş yap.')) return null;
      const u = C.Auth.user(), s = this.store(sid);
      const on = !s.followers.includes(u.id);
      s.followers = on ? s.followers.concat(u.id) : s.followers.filter(x => x !== u.id);
      DB.save();
      C.toast(on ? s.name + ' takip ediliyor. Yeni ürün ve kuponlardan haberdar olacaksın.' : 'Takipten çıkıldı');
      return on;
    },
    followerCount(s) { return (s.followerBase || 0) + s.followers.length; },
    cmp() { return (Store.get('carsim_cmp') || []).filter(id => this.isLive(this.product(id))); },
    toggleCmp(pid) {
      let c = this.cmp();
      if (c.includes(pid)) c = c.filter(x => x !== pid);
      else { if (c.length >= 4) { C.toast('En fazla 4 ürün karşılaştırabilirsin', { icon: 'ℹ️' }); return false; } c.push(pid); }
      Store.set('carsim_cmp', c); C.App.renderCmpTray(); return c.includes(pid);
    },

    /* ----- sepet ----- */
    cartKey() { const u = C.Auth.user(); return u ? String(u.id) : 'guest'; },
    cartRaw() { const k = this.cartKey(); return DB.data.carts[k] || (DB.data.carts[k] = []); },
    mergeGuestCart(uid) {
      const g = DB.data.carts.guest || [];
      if (!g.length) return;
      const k = String(uid); const c = DB.data.carts[k] || (DB.data.carts[k] = []);
      g.forEach(it => { const ex = c.find(x => x.productId === it.productId && x.variant === it.variant); if (ex) ex.qty += it.qty; else c.push(it); });
      DB.data.carts.guest = []; DB.save();
    },
    addToCart(pid, variant = '', qty = 1) {
      const p = this.product(pid);
      if (!this.isLive(p)) return C.toast('Ürün şu anda satışta değil', { icon: '⚠️' });
      if (p.variants && !variant) return C.toast(p.variants.name + ' seçmelisin', { icon: '⚠️' });
      if (p.stock <= 0) return C.toast('Ürün tükendi', { icon: '⚠️' });
      const c = this.cartRaw();
      const ex = c.find(x => x.productId === pid && x.variant === variant);
      if (ex) { ex.qty = Math.min(p.stock, ex.qty + qty); ex.saved = false; } else c.push({ productId: pid, variant, qty: Math.min(qty, p.stock), saved: false });
      DB.save();
      C.App.updateBadges();
      const s = this.cartSummary();
      const g = s.groups.find(x => x.store.id === p.storeId);
      const hint = g && g.freeLeft > 0 ? ` · ${U.tl(g.freeLeft)} daha ekle, kargo bedava` : '';
      C.toast('Sepete eklendi' + hint, { icon: '🛒', link: '/cart', linkText: 'Sepete git' });
      return true;
    },
    setQty(idx, qty) { const c = this.cartRaw(); const it = c[idx]; if (!it) return; const p = this.product(it.productId); it.qty = U.clamp(qty, 1, Math.max(1, p ? p.stock : 1)); DB.save(); },
    removeItem(idx) { const c = this.cartRaw(); c.splice(idx, 1); DB.save(); },
    toggleSaved(idx) { const c = this.cartRaw(); if (c[idx]) { c[idx].saved = !c[idx].saved; DB.save(); } },
    cartCount() { return U.sum(this.cartRaw().filter(x => !x.saved), x => x.qty); },
    coupon() { return Store.get('carsim_coupon_' + this.cartKey()) || ''; },
    setCoupon(code) { if (code) Store.set('carsim_coupon_' + this.cartKey(), code); else Store.del('carsim_coupon_' + this.cartKey()); },
    findCoupon(code) { return DB.all('coupons').find(c => c.code === String(code || '').trim().toLocaleUpperCase('tr-TR').replace(/İ/g, 'I')); },
    checkCoupon(c, groups, subtotal) {
      if (!c || !c.active) return { error: 'Kupon kodu bulunamadı.' };
      if (c.expiresAt < Date.now()) return { error: 'Bu kuponun süresi dolmuş.' };
      if (c.used >= c.limit) return { error: 'Bu kuponun kullanım limiti doldu.' };
      let base = subtotal;
      if (c.storeId) { const g = groups.find(x => x.store.id === c.storeId); if (!g) return { error: 'Bu kupon yalnızca ' + (this.store(c.storeId) || {}).name + ' ürünlerinde geçerli.' }; base = g.subtotal; }
      if (base < c.minTotal) return { error: `Kupon için en az ${U.tl(c.minTotal)} tutarında ürün gerekir. ${U.tl(c.minTotal - base)} daha ekle.` };
      let amount = c.type === 'percent' ? base * c.value / 100 : c.value;
      if (c.maxDiscount) amount = Math.min(amount, c.maxDiscount);
      return { amount: U.round2(Math.min(amount, base)) };
    },
    cartSummary() {
      const raw = this.cartRaw();
      const rows = raw.map((ci, idx) => { const p = this.product(ci.productId); return p ? { ...ci, idx, p, info: this.priceInfo(p), live: this.isLive(p) } : null; }).filter(Boolean);
      const active = rows.filter(r => !r.saved && r.live);
      const groups = [...U.groupBy(active, r => r.p.storeId)].map(([sid, items]) => {
        const store = this.store(sid);
        const subtotal = U.round2(U.sum(items, r => r.info.price * r.qty));
        const oldTotal = U.round2(U.sum(items, r => (r.info.old || r.info.price) * r.qty));
        const free = store.freeShipOver === 0 || subtotal >= store.freeShipOver;
        return { store, items, subtotal, oldTotal, shipping: free ? 0 : store.shippingFee, freeLeft: free ? 0 : U.round2(store.freeShipOver - subtotal) };
      });
      const subtotal = U.round2(U.sum(groups, g => g.subtotal));
      const shipping = U.round2(U.sum(groups, g => g.shipping));
      const savings = U.round2(U.sum(groups, g => g.oldTotal - g.subtotal));
      let discount = 0, couponError = '', couponObj = null;
      const code = this.coupon();
      if (code) {
        couponObj = this.findCoupon(code);
        const r = this.checkCoupon(couponObj, groups, subtotal);
        if (r.error) couponError = r.error; else discount = r.amount;
      }
      return { rows, saved: rows.filter(r => r.saved), unavailable: rows.filter(r => !r.live && !r.saved), groups, subtotal, shipping, discount, savings, code, couponObj, couponError, total: U.round2(Math.max(0, subtotal + shipping - discount)), count: U.sum(active, r => r.qty) };
    },
    /** Kargo eşiğini tamamlayacak en uygun ürünleri önerir (sepet optimizasyonu). */
    fillers(group, n = 4) {
      const inCart = new Set(group.items.map(r => r.p.id));
      return this.live().filter(p => p.storeId === group.store.id && !inCart.has(p.id) && p.stock > 0)
        .map(p => ({ p, pr: this.priceInfo(p).price }))
        .filter(x => x.pr >= group.freeLeft * 0.6)
        .sort((a, b) => Math.abs(a.pr - group.freeLeft) - Math.abs(b.pr - group.freeLeft))
        .slice(0, n).map(x => x.p);
    },

    /* ----- sipariş ----- */
    placeOrder({ address, payment }) {
      const u = C.Auth.user();
      const s = this.cartSummary();
      if (!u || !s.groups.length) return { error: 'Sepet boş.' };
      for (const g of s.groups) for (const r of g.items) if (r.qty > r.p.stock) return { error: `${r.p.title} için yeterli stok yok (kalan ${r.p.stock}).` };
      const now = Date.now();
      // indirimi paketlere oransal dağıt (satıcı raporları için)
      const packages = s.groups.map(g => {
        let disc = 0;
        if (s.discount) {
          if (s.couponObj.storeId) disc = s.couponObj.storeId === g.store.id ? s.discount : 0;
          else disc = U.round2(s.discount * g.subtotal / s.subtotal);
        }
        return {
          storeId: g.store.id, subtotal: g.subtotal, shipping: g.shipping, discount: disc, status: 'new', history: [{ s: 'new', t: now }], tracking: '', carrier: '',
          items: g.items.map(r => ({ productId: r.p.id, storeId: g.store.id, title: r.p.title, brand: r.p.brand, image: r.p.images[0], price: r.info.price, qty: r.qty, variant: r.variant }))
        };
      });
      DB.data.seq.orders = (DB.data.seq.orders || 100000) + 1;
      const order = { id: DB.data.seq.orders, userId: u.id, createdAt: now, address, packages, subtotal: s.subtotal, shipping: s.shipping, discount: s.discount, total: s.total, payment, coupon: s.discount ? s.code : '' };
      if (payment.installments > 1) order.total = U.round2(order.total * (1 + (DB.settings.installmentRates[payment.installments] || 0) / 100));
      DB.all('orders').push(order);
      packages.forEach(pk => {
        pk.items.forEach(it => {
          const p = this.product(it.productId);
          p.stock -= it.qty; p.sold += it.qty;
          const d = this.deal(p.id); if (d) d.claimed += it.qty;
          if (p.stock <= 3) this.notify(this.store(p.storeId).ownerId, `⚠️ "${p.title}" stoğu kritik seviyede (${p.stock} adet).`, '/seller/products/' + p.id);
        });
        const st = this.store(pk.storeId);
        this.notify(st.ownerId, `🛒 Yeni sipariş #${order.id}: ${pk.items.length} ürün, ${U.tl(pk.subtotal)}`, '/seller/orders');
      });
      if (s.couponObj && s.discount) s.couponObj.used++;
      DB.data.carts[this.cartKey()] = this.cartRaw().filter(x => x.saved);
      this.setCoupon('');
      this.notify(u.id, `✅ #${order.id} numaralı siparişin alındı. Satıcı onayladığında bilgilendireceğiz.`, '/account/orders/' + order.id);
      DB.save();
      return { order };
    },
    pkgStatus(order, storeId, status, extra = {}) {
      const pk = order.packages.find(p => p.storeId === storeId);
      if (!pk) return;
      pk.status = status;
      pk.history.push({ s: status, t: Date.now() });
      Object.assign(pk, extra);
      if (status === 'cancelled' || status === 'returned') pk.items.forEach(it => { const p = this.product(it.productId); if (p) { p.stock += it.qty; p.sold = Math.max(0, p.sold - it.qty); } });
      const msgs = { preparing: 'hazırlanıyor', shipped: `kargoya verildi (${pk.carrier} · ${pk.tracking})`, delivered: 'teslim edildi. Ürünü değerlendirmeyi unutma!', cancelled: 'iptal edildi. Ödemen 1-3 iş günü içinde iade edilecek.', returned: 'için iaden onaylandı. Ücret iadesi başlatıldı.' };
      if (msgs[status]) this.notify(order.userId, `${STATUS[status].icon} #${order.id} siparişindeki ${this.store(storeId).name} paketin ${msgs[status]}`, '/account/orders/' + order.id);
      DB.save();
    },
    myOrders() { const u = C.Auth.user(); return u ? DB.where('orders', o => o.userId === u.id).sort((a, b) => b.createdAt - a.createdAt) : []; },

    /* ----- değerlendirme & soru ----- */
    canReview(pid) {
      const u = C.Auth.user(); if (!u) return false;
      if (DB.all('reviews').some(r => r.productId === pid && r.userId === u.id)) return false;
      return DB.all('orders').some(o => o.userId === u.id && o.packages.some(pk => pk.status === 'delivered' && pk.items.some(i => i.productId === pid)));
    },
    addReview(pid, rating, text) {
      const u = C.Auth.user(); const p = this.product(pid);
      DB.insert('reviews', { productId: pid, storeId: p.storeId, userId: u.id, userName: u.name.split(' ')[0] + ' ' + ((u.name.split(' ')[1] || '')[0] || '') + '.', rating, text, helpful: 0, sellerReply: '' });
      const rs = DB.where('reviews', r => r.productId === pid);
      p.reviewCount = rs.length; p.rating = U.round2(U.sum(rs, r => r.rating) / rs.length);
      this.notify(this.store(p.storeId).ownerId, `⭐ "${p.title}" ürününe ${rating} yıldızlı yeni değerlendirme geldi.`, '/seller/reviews');
      DB.save();
    },
    ask(pid, text) {
      const u = C.Auth.user(); const p = this.product(pid);
      DB.insert('questions', { productId: pid, storeId: p.storeId, userId: u.id, text, answer: '', answeredAt: 0 });
      this.notify(this.store(p.storeId).ownerId, `❓ "${p.title}" için yeni soru: ${text.slice(0, 60)}`, '/seller/questions');
    },
    answer(qid, text) {
      const q = DB.get('questions', qid); q.answer = text; q.answeredAt = Date.now();
      this.notify(q.userId, `💬 Sorun cevaplandı: "${q.text.slice(0, 40)}…"`, '/p/' + q.productId);
      DB.save();
    },

    /* ----- bildirim & fiyat alarmı ----- */
    notify(userId, text, link = '') { DB.insert('notifications', { userId, text, link, read: false }); },
    unread() { const u = C.Auth.user(); return u ? DB.where('notifications', n => n.userId === u.id && !n.read).length : 0; },
    setAlert(pid, target) {
      if (!this.requireLogin('Fiyat alarmı için giriş yap.')) return;
      const u = C.Auth.user();
      DB.data.alerts = DB.all('alerts').filter(a => !(a.userId === u.id && a.productId === pid));
      DB.insert('alerts', { userId: u.id, productId: pid, target: +target, triggered: false });
      C.toast('Fiyat alarmı kuruldu. Fiyat ' + U.tl(target) + ' altına düşünce haber vereceğiz.', { icon: '🔔' });
    },
    /** Satıcı fiyat değiştirdiğinde çağrılır: geçmişi günceller, alarmları tetikler. */
    priceChanged(p, oldPrice) {
      if (Math.abs(p.price - oldPrice) < 0.005) return;
      p.priceHistory = (p.priceHistory || []).concat([[Date.now(), p.price]]);
      const pr = this.priceInfo(p).price;
      DB.all('alerts').filter(a => a.productId === p.id && !a.triggered && pr <= a.target).forEach(a => {
        a.triggered = true;
        this.notify(a.userId, `💸 Fiyat alarmı: "${p.title}" şimdi ${U.tl(pr)}! (hedefin ${U.tl(a.target)})`, '/p/' + p.id);
      });
      if (pr < oldPrice) DB.all('users').filter(u => (u.favorites || []).includes(p.id)).forEach(u => this.notify(u.id, `♥ Favorindeki "${p.title}" ürününün fiyatı ${U.tl(pr)}'ye düştü.`, '/p/' + p.id));
      DB.save();
    },

    /* ----- raporlama ----- */
    packagesIn(from, to, storeId) {
      const out = [];
      DB.all('orders').forEach(o => {
        if (o.createdAt < from || o.createdAt > to) return;
        o.packages.forEach(pk => { if (!storeId || pk.storeId === storeId) out.push({ o, pk }); });
      });
      return out;
    },
    commissionOf(pk) {
      return U.round2(U.sum(pk.items, it => { const p = this.product(it.productId); const c = p ? this.cat(p.categoryId) : null; const st = this.store(pk.storeId); const rate = st && st.commission != null ? st.commission : (c ? c.commission : DB.settings.defaultCommission); return it.price * it.qty * rate / 100; }));
    },
    stats({ storeId = null, days = 30, from, to } = {}) {
      to = to || Date.now();
      from = from || U.startOfDay(to - (days - 1) * DAY);
      const span = to - from;
      const cur = this.packagesIn(from, to, storeId);
      const prev = this.packagesIn(from - span, from, storeId);
      const ok = x => x.pk.status !== 'cancelled';
      const rev = arr => U.round2(U.sum(arr.filter(ok), x => x.pk.subtotal - (x.pk.discount || 0)));
      const units = arr => U.sum(arr.filter(ok), x => U.sum(x.pk.items, i => i.qty));
      const nDays = Math.max(1, Math.round(span / DAY));
      const series = Array.from({ length: nDays }, (_, i) => ({ t: from + i * DAY, rev: 0, orders: 0 }));
      cur.filter(ok).forEach(x => { const i = Math.min(nDays - 1, Math.floor((x.o.createdAt - from) / DAY)); series[i].rev += x.pk.subtotal - (x.pk.discount || 0); series[i].orders++; });
      const prodMap = new Map();
      cur.filter(ok).forEach(x => x.pk.items.forEach(it => { const m = prodMap.get(it.productId) || { id: it.productId, title: it.title, image: it.image, qty: 0, rev: 0 }; m.qty += it.qty; m.rev += it.price * it.qty; prodMap.set(it.productId, m); }));
      const catMap = new Map();
      cur.filter(ok).forEach(x => x.pk.items.forEach(it => { const p = this.product(it.productId); const k = p ? p.categoryId : 0; catMap.set(k, (catMap.get(k) || 0) + it.price * it.qty); }));
      const heat = Array.from({ length: 7 }, () => Array(24).fill(0));
      cur.forEach(x => { const d = new Date(x.o.createdAt); heat[(d.getDay() + 6) % 7][d.getHours()]++; });
      const statusCount = {};
      cur.forEach(x => statusCount[x.pk.status] = (statusCount[x.pk.status] || 0) + 1);
      const commission = U.round2(U.sum(cur.filter(ok).filter(x => x.pk.status !== 'returned'), x => this.commissionOf(x.pk)));
      const returned = U.round2(U.sum(cur.filter(x => x.pk.status === 'returned'), x => x.pk.subtotal));
      const revenue = rev(cur), prevRevenue = rev(prev);
      const ordersN = cur.filter(ok).length, prevOrders = prev.filter(ok).length;
      const customers = new Set(cur.map(x => x.o.userId)).size;
      const delta = (a, b) => b ? (a - b) / b * 100 : (a ? 100 : 0);
      return {
        from, to, revenue, prevRevenue, dRevenue: delta(revenue, prevRevenue), orders: ordersN, prevOrders, dOrders: delta(ordersN, prevOrders),
        units: units(cur), dUnits: delta(units(cur), units(prev)), aov: ordersN ? revenue / ordersN : 0, prevAov: prevOrders ? prevRevenue / prevOrders : 0,
        customers, commission, returned, net: U.round2(revenue - commission - returned), series, heat, statusCount,
        cancelRate: cur.length ? (statusCount.cancelled || 0) / cur.length * 100 : 0,
        returnRate: cur.length ? ((statusCount.returned || 0) + (statusCount.returnRequested || 0)) / cur.length * 100 : 0,
        topProducts: [...prodMap.values()].sort((a, b) => b.rev - a.rev),
        byCat: [...catMap].map(([id, v]) => ({ id, name: (this.cat(id) || { name: 'Diğer' }).name, value: v })).sort((a, b) => b.value - a.value),
        rows: cur
      };
    },
    velocity(p, days = 30) {
      const from = Date.now() - days * DAY;
      let q = 0;
      DB.all('orders').forEach(o => { if (o.createdAt < from) return; o.packages.forEach(pk => { if (pk.status === 'cancelled') return; pk.items.forEach(i => { if (i.productId === p.id) q += i.qty; }); }); });
      return q / days;
    },
    /** Satıcıya özel, veriye dayalı öneriler. */
    insights(storeId) {
      const out = [];
      const prods = DB.where('products', p => p.storeId === storeId && p.status === 'active');
      prods.forEach(p => {
        const v = this.velocity(p);
        if (v > 0 && p.stock / v < 12) {
          const days = Math.max(0, Math.floor(p.stock / v));
          out.push({ pri: 10 - days / 2, icon: '📉', kind: 'warnish', title: `Stok ${days === 0 ? 'bugün' : days + ' gün içinde'} bitebilir`, text: `"${p.title}" günde ortalama ${v.toFixed(1).replace('.', ',')} adet satıyor, ${p.stock} adet kaldı. Önerilen tedarik: ${Math.ceil(v * 30)} adet (30 günlük).`, link: '/seller/products/' + p.id, cta: 'Stoğu güncelle' });
        }
        const others = this.otherSellers(p);
        if (others.length) {
          const mine = this.priceInfo(p).price;
          const best = others.reduce((a, b) => this.priceInfo(a).price < this.priceInfo(b).price ? a : b);
          const bp = this.priceInfo(best).price;
          if (bp < mine) out.push({ pri: 8, icon: '⚔️', kind: 'brandish', title: 'Rakip daha ucuz satıyor', text: `"${p.title}" ürününü ${this.store(best.storeId).name} ${U.tl(bp)}'ye satıyor (senin fiyatın ${U.tl(mine)}). ${U.tl(bp - 0.1)} yaparsan "En iyi fiyat" rozetini alırsın.`, link: '/seller/products/' + p.id, cta: 'Fiyatı düzenle' });
        }
        if (p.views > 2500 && p.sold / p.views < 0.004) out.push({ pri: 5, icon: '👀', kind: 'info', title: 'Çok bakılıyor, az satılıyor', text: `"${p.title}" ${U.num(p.views)} kez görüntülendi ama dönüşüm oranı %${(p.sold / p.views * 100).toFixed(2).replace('.', ',')}. Daha net fotoğraflar ve kısa bir indirim dönüşümü artırabilir.`, link: '/seller/products/' + p.id, cta: 'Ürünü iyileştir' });
        if (p.reviewCount >= 3 && p.rating < 3.8) out.push({ pri: 6, icon: '⭐', kind: 'warnish', title: 'Puanı düşük ürün', text: `"${p.title}" ortalama ${p.rating.toFixed(1).replace('.', ',')} puanda. Olumsuz yorumlara cevap vermek güveni artırır.`, link: '/seller/reviews', cta: 'Yorumlara git' });
      });
      const unanswered = DB.where('questions', q => q.storeId === storeId && !q.answer).length;
      if (unanswered) out.push({ pri: 9, icon: '❓', kind: 'brandish', title: `${unanswered} soru cevap bekliyor`, text: 'Müşteri sorularına 24 saat içinde cevap vermek satıcı puanını ve satış ihtimalini artırır.', link: '/seller/questions', cta: 'Cevapla' });
      const waiting = this.packagesIn(0, Date.now(), storeId).filter(x => x.pk.status === 'new').length;
      if (waiting) out.push({ pri: 11, icon: '📦', kind: 'brandish', title: `${waiting} sipariş onay bekliyor`, text: 'Siparişleri hızlı onaylayıp kargoya vermek "Hızlı Teslimat" rozetini korur.', link: '/seller/orders', cta: 'Siparişlere git' });
      const st = this.stats({ storeId, days: 30 });
      const peak = st.heat.flatMap((r, d) => r.map((v, h) => ({ v, d, h }))).sort((a, b) => b.v - a.v)[0];
      if (peak && peak.v) out.push({ pri: 3, icon: '⏰', kind: 'info', title: 'En yoğun satış saatin', text: `Siparişlerin en çok ${['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'][peak.d]} ${peak.h}:00-${peak.h + 1}:00 arasında geliyor. Kampanyalarını bu saatten hemen önce başlat.`, link: '/seller/campaigns', cta: 'Kampanya oluştur' });
      const store = this.store(storeId);
      if (store.freeShipOver && st.aov && st.aov < store.freeShipOver && store.freeShipOver - st.aov < 250) out.push({ pri: 4, icon: '🚚', kind: 'good', title: 'Kargo eşiği fırsatı', text: `Ortalama sepetin ${U.tl(st.aov)}, ücretsiz kargo eşiğin ${U.tl(store.freeShipOver)}. Müşteriler eşiğe yakın; sepette "kargo bedava için X TL ekle" önerileri sepet tutarını büyütüyor.`, link: '/seller/settings', cta: 'Kargo ayarları' });
      return out.sort((a, b) => b.pri - a.pri);
    },
    /** Yönetici için risk sinyalleri. */
    risks() {
      const out = [];
      DB.where('stores', s => s.status === 'active').forEach(s => {
        const st = this.stats({ storeId: s.id, days: 60 });
        if (st.orders >= 5 && st.cancelRate > 8) out.push({ icon: '🚩', kind: 'b-bad', store: s, text: `İptal oranı %${st.cancelRate.toFixed(1).replace('.', ',')} (platform hedefi < %5)` });
        if (st.orders >= 5 && st.returnRate > 6) out.push({ icon: '↩️', kind: 'b-warn', store: s, text: `İade oranı %${st.returnRate.toFixed(1).replace('.', ',')}` });
      });
      const fakes = this.live().filter(p => this.priceAnalysis(p).fake);
      if (fakes.length) out.push({ icon: '🏷️', kind: 'b-warn', text: `${fakes.length} üründe şüpheli indirim: üstü çizili fiyat son 90 günde hiç uygulanmamış.`, products: fakes });
      return out;
    },
    storeScore(s) {
      const rs = DB.where('reviews', r => r.storeId === s.id);
      const avg = rs.length ? U.sum(rs, r => r.rating) / rs.length : 4.5;
      return U.round2(Math.min(10, avg * 2));
    },
    storeRating(s) { const rs = DB.where('reviews', r => r.storeId === s.id); return { avg: rs.length ? U.sum(rs, r => r.rating) / rs.length : 0, n: rs.length }; },

    /* ----- asistan (doğal dil ile ürün bulma) ----- */
    assistant(text) {
      const raw = text.trim().replace(/(\d)\s*-\s*(\d)/g, '$1 ila $2');
      const n = U.norm(raw);
      const f = { sort: 'rec' };
      let rest = ' ' + n + ' ';
      const u = C.Auth.user();
      const has = (...w) => w.some(x => rest.includes(' ' + x));
      // niyetler
      if (/^(merhaba|selam|hey|sa|iyi gunler)\b/.test(n) && n.split(' ').length <= 3) return { text: `Merhaba${u ? ' ' + u.name.split(' ')[0] : ''}! Ne aradığını günlük dille yazman yeterli. Örneğin "1000 TL altı kablosuz kulaklık" ya da "anneme hediye".` };
      if (has('siparisim', 'kargom', 'siparis nerede', 'kargo nerede')) {
        const o = this.myOrders()[0];
        if (!u) return { text: 'Siparişlerini görebilmem için giriş yapman gerekiyor.', link: ['/login', 'Giriş yap'] };
        if (!o) return { text: 'Henüz bir siparişin yok. Sana birkaç öneri bulayım mı?' };
        return { text: `Son siparişin #${o.id} (${U.date(o.createdAt)}):<br>` + o.packages.map(pk => `• ${U.esc(this.store(pk.storeId).name)}: <b>${STATUS[pk.status].label}</b>${pk.tracking ? ' · ' + pk.carrier + ' ' + pk.tracking : ''}`).join('<br>'), link: ['/account/orders/' + o.id, 'Siparişi görüntüle'] };
      }
      if (has('kupon', 'indirim kodu')) {
        const cs = DB.where('coupons', c => c.active && c.expiresAt > Date.now() && c.used < c.limit);
        return { text: 'Şu an kullanabileceğin kuponlar:<br>' + cs.map(c => `• <b>${c.code}</b>: ${U.esc(c.title)} (${c.type === 'percent' ? '%' + c.value : U.tl(c.value)}, min. ${U.tl(c.minTotal)})`).join('<br>') };
      }
      if (has('iade', 'degisim')) return { text: 'Teslimattan sonra 15 gün içinde ücretsiz iade hakkın var. Siparişlerim sayfasından ilgili paketi seçip "İade talebi oluştur" demen yeterli; kargo kodu otomatik oluşur ve ücretin iade onayından sonra 1-3 iş gününde kartına yansır.', link: ['/account/orders', 'Siparişlerim'] };
      if (has('sepet')) {
        const s = this.cartSummary();
        if (!s.count) return { text: 'Sepetin şu an boş.' };
        const tips = s.groups.filter(g => g.freeLeft > 0).map(g => `• ${U.esc(g.store.name)}: ${U.tl(g.freeLeft)} daha eklersen kargo bedava.`);
        return { text: `Sepetinde ${s.count} ürün var, toplam ${U.tl(s.total)}.${tips.length ? '<br>Tasarruf ipucu:<br>' + tips.join('<br>') : ' Tüm mağazalarda kargon ücretsiz 👍'}`, link: ['/cart', 'Sepete git'] };
      }
      // hediye fikirleri
      const gifts = { anne: [6, 11, 4], baba: [11, 8, 2], sevgili: [6, 11, 1], cocuk: [3, 10], erkek: [11, 8, 2], kadin: [6, 11, 1], arkadas: [10, 4, 6] };
      let giftCats = null;
      if (has('hediye')) { Object.keys(gifts).forEach(k => { if (rest.includes(' ' + k)) giftCats = gifts[k]; }); giftCats = giftCats || [6, 11, 10, 4]; }
      // fiyat
      let m;
      if ((m = rest.match(/(\d[\d.]*)\s*(?:tl|lira)?\s*(?:-|ile|ila)\s*(\d[\d.]*)\s*(?:tl|lira)?/))) { f.min = +m[1].replace(/\./g, ''); f.max = +m[2].replace(/\./g, ''); rest = rest.replace(m[0], ' '); }
      if ((m = rest.match(/(\d[\d.]*)\s*(?:tl|lira)?\s*(?:alti|altinda|den az|dan az|den ucuz|dan ucuz|e kadar|a kadar|kadar)/))) { f.max = +m[1].replace(/\./g, ''); rest = rest.replace(m[0], ' '); }
      if ((m = rest.match(/(\d[\d.]*)\s*(?:tl|lira)?\s*(?:ustu|uzeri|den fazla|dan fazla|den pahali)/))) { f.min = +m[1].replace(/\./g, ''); rest = rest.replace(m[0], ' '); }
      if ((m = rest.match(/(?:max|maksimum|en fazla|butcem)\s*(\d[\d.]*)/))) { f.max = +m[1].replace(/\./g, ''); rest = rest.replace(m[0], ' '); }
      const flags = [
        [['kargo bedava', 'ucretsiz kargo', 'bedava kargo'], () => f.fs = 1],
        [['hizli', 'yarin', 'bugun', 'acil'], () => f.fast = 1],
        [['indirimli', 'firsat', 'kampanyali', 'indirim'], () => f.disc = 1],
        [['en ucuz', 'ucuz', 'uygun fiyatli', 'ekonomik'], () => f.sort = 'price-asc'],
        [['en iyi', 'kaliteli', 'en begenilen', 'yuksek puanli', 'iyi yorumlu'], () => { f.sort = 'rating'; f.rating = 4; }],
        [['cok satan', 'populer', 'en cok satan'], () => f.sort = 'best'],
        [['yeni', 'en yeni'], () => f.sort = 'new']
      ];
      flags.forEach(([ws, fn]) => ws.forEach(w => { if (rest.includes(' ' + w + ' ') || rest.includes(' ' + w)) { fn(); rest = rest.replace(' ' + w, ' '); } }));
      const stop = ['bana', 'icin', 'bir', 've', 'ile', 'olan', 'istiyorum', 'ariyorum', 'lazim', 'oner', 'onerir', 'misin', 'musun', 'bul', 'goster', 'tl', 'lira', 'fiyatli', 'hediye', 'anneme', 'babama', 'sevgilime', 'cocuguma', 'arkadasima', 'esime', 'kadar', 'en', 'cok', 'urun', 'urunler', 'ne', 'var', 'mi', 'bi', 'biraz', 'uygun', 'olsun', 'de', 'da', 'ki', 'icin', 'alabilecegim', 'alsam', 'almak', 'anne', 'baba', 'sevgili', 'kadin', 'erkek', 'cocuk'];
      const alts = { kablosuz: ['kablosuz', 'bluetooth'], bluetooth: ['bluetooth', 'kablosuz'], laptop: ['dizustu'], notebook: ['dizustu'], bilgisayar: ['bilgisayar', 'dizustu'], televizyon: ['tv'], kaban: ['mont'], duvar: ['boya'], kulakligi: ['kulaklik'], ayakkabisi: ['ayakkabi'], boyasi: ['boyasi', 'boya'] };
      let words = rest.trim().split(/\s+/).filter(w => w && !stop.includes(w) && !/^\d+$/.test(w));
      // eş anlamlıları genişlet, sonuçları birleştir; hiç sonuç yoksa kelimeleri tek tek gevşet
      const tryQ = ws => {
        const combos = ws.reduce((acc, w) => acc.flatMap(c => (alts[w] || [w]).map(a => c.concat(a))), [[]]).slice(0, 8);
        const seen = new Set(), out = [];
        combos.forEach(c => this.search({ ...f, q: c.join(' ') }).list.forEach(p => { if (!seen.has(p.id)) { seen.add(p.id); out.push(p); } }));
        if (f.sort === 'price-asc') out.sort((a, b) => this.priceInfo(a).price - this.priceInfo(b).price);
        return out;
      };
      let res, relaxed = false;
      if (giftCats) {
        res = this.live().filter(p => giftCats.includes(p.categoryId));
        if (f.max) res = res.filter(p => this.priceInfo(p).price <= f.max);
        if (f.min) res = res.filter(p => this.priceInfo(p).price >= f.min);
        res = res.sort((a, b) => (b.rating * Math.log(2 + b.reviewCount)) - (a.rating * Math.log(2 + a.reviewCount)));
        if (words.length) { const w = tryQ(words).filter(p => giftCats.includes(p.categoryId)); if (w.length) res = w; }
      } else {
        res = words.length ? tryQ(words) : this.search(f).list;
        if (!res.length && words.length > 1) {
          let best = [];
          words.forEach((_, i) => { const r = tryQ(words.filter((x, j) => j !== i)); if (r.length > best.length) best = r; });
          res = best;
        }
        if (!res.length && words.length) { res = this.search({ q: words.join(' '), sort: 'price-asc' }).list; relaxed = res.length > 0; }
      }
      const parts = [];
      if (f.min && f.max) parts.push(`${U.tl0(f.min)} - ${U.tl0(f.max)} arası`); else if (f.max) parts.push(`${U.tl0(f.max)} altı`); else if (f.min) parts.push(`${U.tl0(f.min)} üstü`);
      if (f.fs) parts.push('kargo bedava'); if (f.fast) parts.push('hızlı teslimat'); if (f.disc) parts.push('indirimli');
      if (f.rating) parts.push('4+ puanlı');
      const understood = (giftCats ? 'hediye fikirleri' : words.join(' ') || 'ürünler') + (parts.length ? ' · ' + parts.join(', ') : '');
      if (!res.length) return { text: `"${U.esc(understood)}" için uygun ürün bulamadım. Bütçeyi biraz esnetmeyi ya da farklı bir kelime denemeyi önerebilirim.` };
      const q = relaxed ? U.qs({ q: words.join(' ') }) : U.qs({ q: giftCats ? '' : words.join(' '), min: f.min, max: f.max, fs: f.fs, fast: f.fast, disc: f.disc, sort: f.sort, rating: f.rating });
      const top = res.slice(0, 4);
      const cheapest = res.reduce((a, b) => this.priceInfo(a).price < this.priceInfo(b).price ? a : b);
      return {
        text: relaxed ? `<b>${U.esc(understood)}</b> kriterlerine tam uyan ürün yok. Filtreleri gevşetince bulduğum en yakın seçenekler:` : `<b>${U.esc(understood)}</b> için ${res.length} ürün buldum. İşte en iyi eşleşenler:` + (res.length > 4 ? ` En uygun fiyatlısı ${U.tl(this.priceInfo(cheapest).price)}.` : ''),
        products: top, link: ['/search' + q, 'Tümünü gör (' + res.length + ')']
      };
    }
  };
})();
