/* MarkaBahçem — müşteri tarafı sayfaları */
(function () {
  'use strict';
  const C = window.Carsim;
  const { U, Svc, K, Auth, DB, Store, Router, Modal, Chart } = C;
  const esc = U.esc;
  const go = p => Router.go(p);

  const P = C.Pages = {};

  /* =============== ANA SAYFA =============== */
  P.home = () => {
    const hero = DB.where('banners', b => b.active && b.place === 'hero').sort((a, b) => a.order - b.order);
    const side = DB.where('banners', b => b.active && b.place === 'side').sort((a, b) => a.order - b.order).slice(0, 2);
    const deals = DB.all('deals').map(d => Svc.product(d.productId)).filter(p => Svc.isLive(p));
    const rec = Svc.recommend(12);
    const viewed = Svc.viewed().slice(0, 12);
    const stores = DB.where('stores', s => s.status === 'active');
    const u = Auth.user();
    const followed = u ? stores.filter(s => s.followers.includes(u.id)) : [];
    const storyStores = followed.concat(stores.filter(s => !followed.includes(s)));
    const coupons = DB.where('coupons', c => c.active && !c.storeId && c.expiresAt > Date.now()).slice(0, 3);
    const now = Date.now();
    const dropped = Svc.live().filter(p => { const h = p.priceHistory || []; if (h.length < 2) return false; const [t, v] = h[h.length - 1]; return t > now - 21 * U.DAY && v < h[h.length - 2][1] * 0.97; })
      .sort((a, b) => b.sold - a.sold).slice(0, 12);
    const cats = Svc.cats();
    const featuredStores = stores.slice().sort((a, b) => Svc.followerCount(b) - Svc.followerCount(a)).slice(0, 4);

    const html = `
    <div class="wrap section">
      <div class="hero-grid">
        <div class="hero" id="hero" aria-roledescription="carousel">
          ${hero.map((b, i) => `<a class="slide ${i === 0 ? 'on' : ''}" href="#${esc(b.link || '/')}" style="background:${K.bannerBg(b)}" data-i="${i}">
            ${b.img ? '<div class="s-img"></div><div class="s-shade"></div>' : ''}
            <div class="s-txt">${b.kicker ? `<span class="s-kick">${esc(b.kicker)}</span>` : ''}<h2>${esc(b.title)}</h2><p>${esc(b.subtitle)}</p>${b.cta ? `<span class="btn">${esc(b.cta)} →</span>` : ''}</div>
            ${b.img ? '' : `<span class="s-art" aria-hidden="true">${esc(b.emoji)}</span>`}</a>`).join('')}
          ${hero.length > 1 ? `<button class="hero-nav prev" aria-label="Önceki">‹</button><button class="hero-nav next" aria-label="Sonraki">›</button><div class="dots">${hero.map((_, i) => `<button class="${i === 0 ? 'on' : ''}" data-dot="${i}" aria-label="${i + 1}. slayt"></button>`).join('')}</div>` : ''}
        </div>
        <div class="hero-side" style="display:grid">${side.map(b => `<a class="mini-banner" href="#${esc(b.link)}" style="background:${K.bannerBg(b)}"><span class="art" aria-hidden="true">${esc(b.emoji)}</span><b>${esc(b.title)}</b><span class="small">${esc(b.subtitle)} →</span></a>`).join('')}</div>
      </div>
    </div>

    <div class="wrap"><div class="story-rail" aria-label="Mağazalar">
      ${storyStores.map(s => `<a class="story" href="#/store/${s.id}"><div class="ring"><div style="background:${esc(s.color)};color:#fff">${s.logoImg ? `<img src="${esc(s.logoImg)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : esc(s.logo)}</div></div><span>${esc(s.name)}</span></a>`).join('')}
    </div></div>

    <div class="wrap section"><div class="cat-rail">
      ${cats.map(c => `<a href="#/search?cat=${c.id}"><span class="circ">${c.icon}</span>${esc(c.name)}</a>`).join('')}
    </div></div>

    <div class="wrap"><div class="perks">
      <div class="perk"><span class="pi">🚚</span><div><b>Hızlı teslimat</b><span>Seçili ürünler ertesi gün kapında</span></div></div>
      <div class="perk"><span class="pi">↩️</span><div><b>15 gün ücretsiz iade</b><span>Kargo kodu otomatik oluşur</span></div></div>
      <div class="perk"><span class="pi">📉</span><div><b>Şeffaf fiyat geçmişi</b><span>Sahte indirimleri biz işaretliyoruz</span></div></div>
      <div class="perk"><span class="pi">🔒</span><div><b>Güvenli ödeme</b><span>3D Secure, 12 taksit imkânı</span></div></div>
    </div></div>

    ${deals.length ? `<div class="wrap section"><div class="flash">
      <div class="sec-head"><h2>⚡ Flaş fırsatlar ${K.countdown(DB.all('deals')[0].endsAt)}</h2><a href="#/deals">Tümünü gör →</a></div>
      ${K.rail(deals)}
    </div></div>` : ''}

    ${coupons.length ? `<div class="wrap"><div class="promo-band">${coupons.map(c => `<div class="coupon"><div class="cv">${c.type === 'percent' ? '%' + c.value : U.tl0(c.value)}</div><div class="cb"><b>${esc(c.title)}</b><span class="xs muted">${U.tl0(c.minTotal)} ve üzeri alışverişte · Son ${Math.ceil((c.expiresAt - Date.now()) / U.DAY)} gün</span><div class="row" style="gap:8px"><code>${esc(c.code)}</code><button class="btn btn-sm btn-soft" data-copy="${esc(c.code)}">Kodu kopyala</button></div></div></div>`).join('')}</div></div>` : ''}

    <div class="wrap section">
      <div class="sec-head"><div><div class="eyebrow">${rec.personalized ? 'Gezdiğin ürünlere göre' : 'MarkaBahçem seçkisi'}</div><h2>${rec.personalized ? 'Sana özel öneriler' : 'Günün öne çıkanları'}</h2></div><a href="#/search?sort=rec">Daha fazla →</a></div>
      ${K.grid(rec.list.slice(0, 10))}
    </div>

    <div class="wrap section">
      <div class="sec-head"><h2>Kategorilerde çok satanlar</h2><div class="seg" id="bsSeg">${[8, 7, 6, 4, 12, 1].map((id, i) => `<button class="${i === 0 ? 'on' : ''}" data-cat="${id}">${esc(Svc.cat(id).name)}</button>`).join('')}</div></div>
      <div id="bsList">${K.rail(Svc.bestSellers(10, 8))}</div>
    </div>

    ${dropped.length ? `<div class="wrap section"><div class="sec-head"><div><div class="eyebrow">Fiyat takibi</div><h2>📉 Fiyatı yeni düşenler</h2></div></div>${K.rail(dropped)}</div>` : ''}

    <div class="wrap section">
      <div class="sec-head"><h2>Popüler mağazalar</h2><a href="#/stores">Tüm mağazalar →</a></div>
      <div class="store-list">${featuredStores.map(storeTile).join('')}</div>
    </div>

    ${viewed.length ? `<div class="wrap section"><div class="sec-head"><h2>Son gezdiğin ürünler</h2></div>${K.rail(viewed)}</div>` : ''}

    <div class="wrap section"><div class="sell-hero">
      <div class="stack lg"><div class="eyebrow" style="color:var(--brand)">MarkaBahçem satıcı programı</div><h1>Ürünlerini <em>milyonlarca</em> alıcıyla buluştur.</h1><p style="opacity:.8">Mağazanı 10 dakikada aç, ilk 3 ay komisyonsuz sat. Akıllı satıcı paneli stok, fiyat ve kampanyalarını senin yerine takip etsin.</p><div class="row"><a class="btn btn-primary btn-lg" href="#/sell">Hemen mağaza aç</a><a class="btn btn-lg" style="background:transparent;color:var(--bg);border-color:rgba(255,255,255,.3)" href="#/login">Demo satıcı paneli</a></div></div>
      <div class="calc"><b>Bu ay platformda</b><div class="row between"><span class="muted">Aktif mağaza</span><b class="num">${U.num(stores.length * 1240)}</b></div><div class="row between"><span class="muted">Satılan ürün</span><b class="num">${U.num(U.sum(Svc.live(), p => p.sold) * 37)}</b></div><div class="row between"><span class="muted">Ortalama teslimat</span><b>1,8 gün</b></div></div>
    </div></div>`;

    return {
      title: 'Alışverişin yeni adresi', html, mount(main) {
        const slides = U.$$('.slide', main), dots = U.$$('[data-dot]', main);
        let i = 0;
        const show = n => { i = (n + slides.length) % slides.length; slides.forEach((s, k) => s.classList.toggle('on', k === i)); dots.forEach((d, k) => d.classList.toggle('on', k === i)); };
        let timer = setInterval(() => show(i + 1), 5500);
        const reset = () => { clearInterval(timer); timer = setInterval(() => show(i + 1), 5500); };
        dots.forEach(d => d.onclick = e => { e.preventDefault(); show(+d.dataset.dot); reset(); });
        const pv = U.$('.hero-nav.prev', main), nx = U.$('.hero-nav.next', main);
        pv && (pv.onclick = e => { e.preventDefault(); show(i - 1); reset(); });
        nx && (nx.onclick = e => { e.preventDefault(); show(i + 1); reset(); });
        hero.forEach((b, k) => { if (b.img) { const el = slides[k].querySelector('.s-img'); el.style.backgroundImage = `url('${b.img}')`; } });
        U.$('#bsSeg', main).onclick = e => { const b = e.target.closest('[data-cat]'); if (!b) return; U.$$('#bsSeg button').forEach(x => x.classList.toggle('on', x === b)); U.$('#bsList').innerHTML = K.rail(Svc.bestSellers(10, +b.dataset.cat)); };
        main.addEventListener('click', e => { const c = e.target.closest('[data-copy]'); if (c) { U.copy(c.dataset.copy); Svc.setCoupon(c.dataset.copy); } });
        return () => clearInterval(timer);
      }
    };
  };

  function storeTile(s) {
    const prods = Svc.live().filter(p => p.storeId === s.id).sort((a, b) => b.sold - a.sold).slice(0, 3);
    const r = Svc.storeRating(s);
    return `<a class="store-tile" href="#/store/${s.id}">
      <div class="st-cover" style="background:${s.coverImg ? `url('${esc(s.coverImg)}') center/cover` : `linear-gradient(120deg,${esc(s.cover[0])},${esc(s.cover[1])})`}"></div>
      <div class="st-body">${K.storeAvatar(s, 54)}
        <div class="row between"><b>${esc(s.name)} ${s.official ? '<span class="badge b-info">Resmi</span>' : ''}</b><span class="score">${Svc.storeScore(s).toFixed(1).replace('.', ',')}</span></div>
        <div class="xs muted">${U.num(Svc.followerCount(s))} takipçi · ${r.n ? '★ ' + r.avg.toFixed(1).replace('.', ',') + ' (' + r.n + ')' : 'Yeni mağaza'} · ${esc(s.city)}</div>
        <div class="st-prods">${prods.map(p => `<div>${K.img(p.images[0])}</div>`).join('')}</div>
      </div></a>`;
  }

  /* =============== ARAMA / KATEGORİ =============== */
  P.search = (_, q) => {
    const f = { q: q.q || '', cat: q.cat ? +q.cat : '', sub: q.sub || '', brand: q.brand ? q.brand.split(',') : [], min: q.min, max: q.max, rating: q.rating, fs: q.fs, fast: q.fast, deal: q.deal, disc: q.disc, instock: q.instock, store: q.store, sort: q.sort || 'rec' };
    const page = +q.page || 1, per = 24;
    const { list, base, corrected } = Svc.search(f);
    const fac = Svc.facets(base);
    const cat = f.cat ? Svc.cat(f.cat) : null;
    const title = f.q ? `"${f.q}" araması` : f.sub ? f.sub : cat ? cat.name : 'Tüm ürünler';
    const link = patch => '#/search' + U.qs(Object.assign({}, q, { page: '' }, patch));
    const chips = [];
    if (f.q) chips.push(['Arama: ' + f.q, { q: '' }]);
    if (cat) chips.push([cat.name, { cat: '', sub: '' }]);
    if (f.sub) chips.push([f.sub, { sub: '' }]);
    f.brand.forEach(b => chips.push([b, { brand: f.brand.filter(x => x !== b).join(',') }]));
    if (f.min || f.max) chips.push([`${f.min ? U.tl0(f.min) : '0 TL'} - ${f.max ? U.tl0(f.max) : '∞'}`, { min: '', max: '' }]);
    if (f.rating) chips.push([f.rating + '+ puan', { rating: '' }]);
    if (f.fs) chips.push(['Kargo bedava', { fs: '' }]);
    if (f.fast) chips.push(['Hızlı teslimat', { fast: '' }]);
    if (f.deal) chips.push(['Flaş ürünler', { deal: '' }]);
    if (f.disc) chips.push(['İndirimli', { disc: '' }]);
    if (f.instock) chips.push(['Stoktakiler', { instock: '' }]);
    if (f.store) chips.push([(Svc.store(f.store) || {}).name, { store: '' }]);
    const shown = list.slice((page - 1) * per, page * per);
    const ranges = [[0, 250], [250, 500], [500, 1000], [1000, 2500], [2500, 10000], [10000, 0]];
    const opt = (checked, label, href, count) => `<a class="opt" href="${href}"><input type="checkbox" ${checked ? 'checked' : ''} tabindex="-1" aria-hidden="true">${esc(label)}${count != null ? `<span class="c">${count}</span>` : ''}</a>`;

    const filters = `<aside class="filters" id="filters">
      <div class="row between mob-filter-btn" style="display:none"></div>
      <div class="row between" id="fHead" hidden><h3>Filtreler</h3><button class="btn btn-sm" id="fClose">Kapat</button></div>
      ${!cat ? `<div class="fbox"><h4>Kategori</h4><div class="opts">${fac.cats.map(([id, n]) => opt(false, Svc.cat(id).name, link({ cat: id, sub: '' }), n)).join('')}</div></div>`
        : `<div class="fbox"><h4>${esc(cat.name)}</h4><div class="opts">${fac.subs.map(([s, n]) => opt(f.sub === s, s, link({ sub: f.sub === s ? '' : s }), n)).join('')}</div></div>`}
      <div class="fbox"><h4>Fiyat</h4>
        <form class="row nowrap" id="priceF" style="gap:6px"><input class="input" id="pmin" type="number" min="0" placeholder="En az" value="${esc(f.min || '')}" aria-label="En az fiyat"><span>-</span><input class="input" id="pmax" type="number" min="0" placeholder="En çok" value="${esc(f.max || '')}" aria-label="En çok fiyat"><button class="btn btn-sm btn-dark" aria-label="Uygula">›</button></form>
        <div class="opts" style="margin-top:10px">${ranges.map(([a, b]) => opt(+f.min === a && +(f.max || 0) === b, b ? `${U.tl0(a)} - ${U.tl0(b)}` : `${U.tl0(a)} ve üzeri`, link({ min: a || '', max: b || '' }))).join('')}</div></div>
      <div class="fbox"><h4>Marka</h4><input class="input" id="bSearch" placeholder="Marka ara" style="margin-bottom:8px;padding:7px 10px"><div class="opts" id="bOpts">${fac.brands.map(([b, n]) => { const on = f.brand.includes(b); return `<span data-b="${esc(U.lower(b))}">${opt(on, b, link({ brand: (on ? f.brand.filter(x => x !== b) : f.brand.concat(b)).join(',') }), n)}</span>`; }).join('')}</div></div>
      <div class="fbox"><h4>Değerlendirme</h4><div class="opts">${[4, 3].map(r => opt(+f.rating === r, `${r} yıldız ve üzeri`, link({ rating: +f.rating === r ? '' : r }))).join('')}</div></div>
      <div class="fbox"><h4>Hizmetler</h4><div class="opts">
        ${opt(f.fs, '🚚 Kargo bedava', link({ fs: f.fs ? '' : 1 }))}${opt(f.fast, '🚀 Hızlı teslimat', link({ fast: f.fast ? '' : 1 }))}
        ${opt(f.deal, '⚡ Flaş ürünler', link({ deal: f.deal ? '' : 1 }))}${opt(f.disc, '🏷 İndirimli ürünler', link({ disc: f.disc ? '' : 1 }))}${opt(f.instock, '📦 Sadece stoktakiler', link({ instock: f.instock ? '' : 1 }))}</div></div>
      <div class="fbox"><h4>Satıcı</h4><div class="opts">${fac.stores.map(([id, n]) => opt(+f.store === id, Svc.store(id).name, link({ store: +f.store === id ? '' : id }), n)).join('')}</div></div>
    </aside>`;

    const html = `<div class="wrap">
      <div class="crumbs"><a href="#/">Ana sayfa</a>›${cat ? `<a href="#/search?cat=${cat.id}">${esc(cat.name)}</a>` : '<span>Arama</span>'}${f.sub ? '›<span>' + esc(f.sub) + '</span>' : ''}</div>
      ${cat && !f.sub && !f.q ? `<div class="row" style="margin-bottom:16px;gap:8px;overflow-x:auto;flex-wrap:nowrap">${cat.subs.map(s => `<a class="chip" href="${link({ sub: s })}">${esc(s)}</a>`).join('')}</div>` : ''}
      <div class="search-layout">
        ${filters}
        <section style="min-width:0">
          <div class="results-bar"><div><h1 style="font-size:1.35rem">${esc(title)}</h1><div class="small muted">${U.num(list.length)} ürün bulundu</div></div>
            <div class="row"><button class="btn mob-filter-btn" id="fOpen">⚙️ Filtrele${chips.length ? ' (' + chips.length + ')' : ''}</button>
            <select class="select" id="sort" style="width:auto" aria-label="Sırala">${[['rec', 'Önerilen'], ['best', 'En çok satan'], ['price-asc', 'En düşük fiyat'], ['price-desc', 'En yüksek fiyat'], ['rating', 'En yüksek puan'], ['disc', 'En yüksek indirim'], ['new', 'En yeniler']].map(([v, l]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
          ${corrected ? `<div class="insight info" style="margin-bottom:12px"><span class="ii">✨</span><div>"${esc(f.q)}" için sonuç yoktu, <b>"${esc(corrected)}"</b> sonuçlarını gösteriyoruz.</div></div>` : ''}
          ${chips.length ? `<div class="active-filters">${chips.map(([l, p]) => `<a class="chip on" href="${link(p)}">${esc(l)} <span class="x">✕</span></a>`).join('')}<a class="chip" href="#/search${U.qs({ q: f.q })}">Temizle</a></div>` : ''}
          ${K.grid(shown)}
          ${K.pager(list.length, page, per)}
        </section>
      </div></div>`;
    return {
      title, html, mount(main) {
        U.$('#sort', main).onchange = e => go(link({ sort: e.target.value }).slice(1));
        U.$('#priceF', main).onsubmit = e => { e.preventDefault(); go(link({ min: U.$('#pmin').value, max: U.$('#pmax').value }).slice(1)); };
        U.$('#bSearch', main).oninput = e => { const v = U.lower(e.target.value); U.$$('#bOpts [data-b]').forEach(x => x.hidden = !x.dataset.b.includes(v)); };
        const fl = U.$('#filters', main);
        U.$('#fOpen', main).onclick = () => { fl.classList.add('open'); U.$('#fHead').hidden = false; };
        U.$('#fClose', main).onclick = () => { fl.classList.remove('open'); };
        main.addEventListener('click', e => { const b = e.target.closest('[data-page]'); if (b) go(link({ page: b.dataset.page }).slice(1)); });
      }
    };
  };

  /* =============== ÜRÜN DETAY =============== */
  P.product = ({ id }) => {
    const p = Svc.product(id);
    if (!p || (!Svc.isLive(p) && !(Auth.user() && (Auth.user().role === 'admin' || Auth.user().storeId === p.storeId)))) return { title: 'Ürün bulunamadı', html: `<div class="wrap">${K.empty('🔎', 'Bu ürün artık satışta değil', 'Ürün kaldırılmış ya da mağaza geçici olarak kapalı olabilir.', '<a class="btn btn-primary" href="#/">Alışverişe devam et</a>')}</div>` };
    Svc.trackView(p.id);
    const s = Svc.store(p.storeId), cat = Svc.cat(p.categoryId);
    const info = Svc.priceInfo(p);
    const an = Svc.priceAnalysis(p);
    const del = Svc.deliveryEstimate(p);
    const others = Svc.otherSellers(p);
    const together = Svc.boughtTogether(p);
    const sum = Svc.reviewSummary(p.id);
    const reviews = DB.where('reviews', r => r.productId === p.id).sort((a, b) => b.createdAt - a.createdAt);
    const qs = DB.where('questions', x => x.productId === p.id).sort((a, b) => b.createdAt - a.createdAt);
    const sr = Svc.storeRating(s);
    const fav = Svc.isFav(p.id);
    const coupons = DB.where('coupons', c => c.active && c.expiresAt > Date.now() && (c.storeId === s.id || !c.storeId)).slice(0, 3);
    const inst = Svc.installments(info.price);
    const vv = p.variants;
    const verdict = { lowest: ['good', '📉', 'En düşük fiyat'], good: ['good', '👍', 'İyi fiyat'], normal: ['info', '📊', 'Ortalama fiyat'], high: ['warnish', '⏳', 'Beklemeye değer'] }[an.verdict];
    const allSellers = [p].concat(others).sort((a, b) => Svc.priceInfo(a).price - Svc.priceInfo(b).price);
    const bestSeller = allSellers[0];

    const html = `<div class="wrap">
      <div class="crumbs"><a href="#/">Ana sayfa</a>›<a href="#/search?cat=${cat.id}">${esc(cat.name)}</a>›<a href="#/search?cat=${cat.id}&sub=${encodeURIComponent(p.sub)}">${esc(p.sub)}</a>›<a href="#/search?q=${encodeURIComponent(p.brand)}">${esc(p.brand)}</a></div>
      ${p.status !== 'active' ? `<div class="insight warnish" style="margin-bottom:14px"><span class="ii">👁</span><div><b>Önizleme:</b> Bu ürün şu an yayında değil (${Svc.PROD_STATUS[p.status][0]}).</div></div>` : ''}
      <div class="pd">
        <div class="gallery">
          <div class="thumbs">${p.images.map((im, i) => `<button class="${i === 0 ? 'on' : ''}" data-img="${i}" aria-label="${i + 1}. görsel">${K.img(im)}</button>`).join('')}</div>
          <div class="main" id="gMain">${K.img(p.images[0], { label: p.title })}${info.deal ? `<div style="position:absolute;left:12px;top:12px"><span class="badge" style="background:var(--ink);color:var(--bg);font-size:.85rem;padding:6px 10px">⚡ Flaş %${info.deal.pct}</span></div>` : ''}</div>
        </div>

        <div class="pd-info">
          <h1><a href="#/search?q=${encodeURIComponent(p.brand)}"><b>${esc(p.brand)}</b></a> ${esc(p.title)}</h1>
          <div class="row small">${p.reviewCount ? `<a href="#reviews" data-tab-go="reviews" class="rating-line"><b>${p.rating.toFixed(1).replace('.', ',')}</b>${K.stars(p.rating, '1rem')}<span>${U.num(p.reviewCount)} değerlendirme</span></a>` : '<span class="muted">Henüz değerlendirme yok</span>'}<span class="muted">·</span><a href="#qa" data-tab-go="qa" class="muted">${qs.length} soru-cevap</a><span class="muted">·</span><span class="muted">👁 Son 24 saatte ${U.num(Math.round(p.views / 30) + 3)} kişi baktı</span></div>
          <div class="row small">Satıcı: <a href="#/store/${s.id}" class="bold">${esc(s.name)}</a><span class="score">${Svc.storeScore(s).toFixed(1).replace('.', ',')}</span>${s.official ? '<span class="badge b-info">✔︎ Resmi satıcı</span>' : ''}</div>
          <div class="pd-price">${info.old ? `<span class="price-old">${U.tl(info.old)}</span><span class="badge b-bad">%${info.pct}</span>` : ''}<span class="price-now">${U.tl(info.price)}</span></div>
          ${info.deal ? `<div class="insight brandish"><span class="ii">⚡</span><div class="grow"><b>Flaş fırsat bitimine</b> ${K.countdown(info.deal.endsAt)}<div class="bar brand" style="margin-top:8px"><i style="width:${Math.min(100, info.deal.claimed / info.deal.stockLimit * 100)}%"></i></div><div class="xs muted" style="margin-top:4px">Kampanya stoğunun %${Math.round(info.deal.claimed / info.deal.stockLimit * 100)}'i satıldı</div></div></div>` : ''}
          <div class="insight ${verdict[0]}"><span class="ii">${verdict[1]}</span><div><b>Fiyat analizi: ${verdict[2]}</b><div class="small">${esc(an.text)}. Önceki 90 günde en düşük ${U.tl(an.min)}, en yüksek ${U.tl(an.max)}. <a href="#price" data-tab-go="price" class="bold">Geçmişi gör</a></div>
            ${an.fake ? `<div class="small" style="margin-top:6px;color:var(--bad)"><b>⚠️ Dikkat:</b> Üstü çizili ${U.tl(p.listPrice)} fiyatı son 90 günde hiç uygulanmamış. Gerçek indirim oranı daha düşük.</div>` : ''}</div></div>
          ${vv ? `<div class="opt-group"><span class="lbl">${esc(vv.name)}: <b id="vSel">Seçiniz</b></span><div class="vals" id="vals">${vv.options.map(o => `<button data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>
            ${vv.name === 'Beden' ? '<button class="btn btn-ghost btn-sm" id="sizeHelp" style="align-self:flex-start">📏 Bedenimi bul</button>' : ''}</div>` : ''}
          <div class="row">
            <div class="qty"><button data-q="-1" aria-label="Azalt">−</button><input id="qty" value="1" inputmode="numeric" aria-label="Adet"><button data-q="1" aria-label="Arttır">+</button></div>
            <button class="btn btn-primary btn-lg grow" id="addCart" ${p.stock <= 0 ? 'disabled' : ''}>${p.stock <= 0 ? 'Tükendi' : 'Sepete ekle'}</button>
            <button class="btn btn-lg" id="buyNow" ${p.stock <= 0 ? 'disabled' : ''}>Hemen al</button>
            <button class="icon-btn" id="favBtn" style="width:50px;height:50px;border:1px solid var(--line-2);font-size:1.3rem;color:${fav ? 'var(--bad)' : 'inherit'}" aria-label="Favorilere ekle">${fav ? '♥' : '♡'}</button>
          </div>
          ${p.stock > 0 && p.stock <= 10 ? `<div class="small warn bold">⏳ Stokta son ${p.stock} ürün kaldı</div>` : ''}
          <div class="card card-pad stack" style="gap:10px">
            <div class="row nowrap small"><span style="font-size:1.2rem">🚚</span><div><b>Tahmini teslimat: ${esc(del.from)} - ${esc(del.to)}</b>${del.cutoff > 0 && del.fast ? `<div class="xs muted">${del.cutoff} saat içinde sipariş verirsen bugün kargoda</div>` : ''}</div></div>
            <div class="row nowrap small"><span style="font-size:1.2rem">📦</span><div>${Svc.freeShip(p) ? '<b class="ok">Kargo bedava</b>' : `Kargo ${U.tl(s.shippingFee)} · ${esc(s.name)}'da ${U.tl(s.freeShipOver)} üzeri kargo bedava`}</div></div>
            <div class="row nowrap small"><span style="font-size:1.2rem">↩️</span><div>15 gün içinde ücretsiz iade</div></div>
          </div>
          ${coupons.length ? `<div class="stack" style="gap:8px"><span class="lbl">Bu ürüne uygulanabilir kuponlar</span>${coupons.map(c => `<div class="row between small" style="border:1px dashed var(--brand);border-radius:10px;padding:8px 12px;background:var(--brand-soft)"><span><b>${c.type === 'percent' ? '%' + c.value : U.tl0(c.value)} indirim</b> · ${U.tl0(c.minTotal)} üzeri</span><button class="btn btn-sm btn-primary" data-coupon="${esc(c.code)}">Kuponu al</button></div>`).join('')}</div>` : ''}
        </div>

        <aside class="pd-side stack">
          <div class="card card-pad seller-box">
            <div class="row nowrap">${K.storeAvatar(s)}<div class="grow" style="min-width:0"><a href="#/store/${s.id}" class="bold">${esc(s.name)}</a><div class="xs muted">${esc(s.city)} · ${U.num(Svc.followerCount(s))} takipçi</div></div><span class="score">${Svc.storeScore(s).toFixed(1).replace('.', ',')}</span></div>
            <div class="row small muted" style="gap:14px"><span>★ ${sr.n ? sr.avg.toFixed(1).replace('.', ',') : '–'} mağaza puanı</span><span>⚡ ${s.shipDays === 0 ? 'Aynı gün' : s.shipDays + ' günde'} kargo</span></div>
            <div class="row"><button class="btn btn-sm grow" id="followBtn">${Svc.isFollowing(s.id) ? '✓ Takip ediliyor' : '+ Takip et'}</button><a class="btn btn-sm grow" href="#/store/${s.id}">Mağazaya git</a></div>
          </div>
          ${others.length ? `<div class="card card-pad"><h3 style="margin-bottom:8px">Diğer satıcılar (${others.length})</h3><p class="xs muted" style="margin-bottom:10px">Aynı ürünü satan tüm mağazaları fiyata göre sıraladık.</p>
            <div class="stack" style="gap:8px">${allSellers.map(o => { const os = Svc.store(o.storeId); const oi = Svc.priceInfo(o); return `<a href="#/p/${o.id}" class="row between nowrap small" style="padding:8px 10px;border-radius:10px;border:1px solid ${o.id === p.id ? 'var(--brand)' : 'var(--line)'}"><span class="grow" style="min-width:0"><b>${esc(os.name)}</b> <span class="score" style="height:20px;min-width:30px;font-size:.72rem">${Svc.storeScore(os).toFixed(1).replace('.', ',')}</span><br><span class="xs muted">${Svc.freeShip(o) ? 'Kargo bedava' : 'Kargo ' + U.tl(os.shippingFee)}${o.id === bestSeller.id ? ' · <b class="ok">En iyi fiyat</b>' : ''}</span></span><b class="price-now" style="font-size:.95rem">${U.tl(oi.price)}</b></a>`; }).join('')}</div></div>` : ''}
          <div class="card card-pad stack" style="gap:10px"><h3 style="margin:0">🔔 Fiyat alarmı</h3><p class="small muted">Fiyat hedefinin altına düşünce sana bildirim gönderelim.</p>
            <form class="row nowrap" id="alertF"><input class="input" id="alertV" type="number" value="${Math.round(info.price * 0.9)}" aria-label="Hedef fiyat"><button class="btn btn-dark">Kur</button></form></div>
          <div class="card card-pad"><h3 style="margin-bottom:8px">💳 Taksit seçenekleri</h3><table class="install-tbl"><thead><tr><th>Taksit</th><th>Aylık</th><th>Toplam</th></tr></thead><tbody>${inst.slice(0, 6).map(x => `<tr><td>${x.n === 1 ? 'Tek çekim' : x.n + ' taksit'}${x.rate === 0 && x.n > 1 ? ' <span class="badge b-ok">Faizsiz</span>' : ''}</td><td>${U.tl(x.monthly)}</td><td>${U.tl(x.total)}</td></tr>`).join('')}</tbody></table></div>
        </aside>
      </div>

      ${together.length ? `<section class="section"><div class="sec-head"><h2>Birlikte sık alınanlar</h2></div>
        <div class="card card-pad"><div class="row" style="gap:14px;align-items:stretch" id="bundle">
          ${[p].concat(together).map((x, i) => `${i ? '<span style="align-self:center;font-size:1.5rem;color:var(--muted)">+</span>' : ''}<label class="stack" style="width:150px;gap:6px;cursor:pointer"><div style="aspect-ratio:4/5;border-radius:10px;overflow:hidden;position:relative">${K.img(x.images[0])}<input type="checkbox" checked data-bundle="${x.id}" data-price="${Svc.priceInfo(x).price}" style="position:absolute;top:8px;left:8px;width:18px;height:18px;accent-color:var(--brand)"></div><span class="xs" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${i === 0 ? '<b>Bu ürün:</b> ' : ''}${esc(x.title)}</span><b class="price-now small">${U.tl(Svc.priceInfo(x).price)}</b></label>`).join('')}
          <div class="stack" style="justify-content:center;margin-left:auto;min-width:200px"><span class="muted small">Seçilenlerin toplamı</span><b class="price-now" style="font-size:1.5rem" id="bundleTotal"></b><button class="btn btn-primary" id="bundleAdd">Seçilenleri sepete ekle</button><span class="xs muted">Varyantlı ürünler için seçim ürün sayfasında yapılır.</span></div>
        </div></div></section>` : ''}

      <section class="section">
        <div class="tabs" id="ptabs" role="tablist">
          <button class="on" data-tab="desc">Ürün açıklaması</button><button data-tab="specs">Özellikler</button>
          <button data-tab="reviews">Değerlendirmeler (${reviews.length})</button><button data-tab="qa">Soru & cevap (${qs.length})</button><button data-tab="price">Fiyat geçmişi</button>
        </div>
        <div class="card card-pad" style="border-top:0;border-radius:0 0 var(--r) var(--r)">
          <div data-pane="desc"><p style="max-width:75ch;line-height:1.7">${esc(p.description)}</p>
            <ul class="small muted" style="margin-top:14px;line-height:1.9"><li>Bu ürün <b>${esc(s.name)}</b> tarafından gönderilecektir.</li><li>Stok kodu: ${esc(p.sku)}</li><li>Kampanya fiyatından satılmak üzere 10 adetten fazla stok sunulmuştur.</li><li>MarkaBahçem, listelenen fiyat ve stok bilgilerini satıcıdan alır; fiyat geçmişini bağımsız olarak kaydeder.</li></ul></div>
          <div data-pane="specs" hidden><table class="spec-tbl"><tbody>${Object.entries(p.specs).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}<tr><td>Kategori</td><td>${esc(cat.name)} › ${esc(p.sub)}</td></tr></tbody></table></div>
          <div data-pane="reviews" hidden>${reviewsPane(p, reviews, sum)}</div>
          <div data-pane="qa" hidden>${qaPane(p, qs)}</div>
          <div data-pane="price" hidden>${pricePane(p, an)}</div>
        </div>
      </section>

      <section class="section"><div class="sec-head"><h2>Benzer ürünler</h2></div>${K.rail(Svc.similar(p))}</section>
      <section class="section"><div class="sec-head"><h2>${esc(s.name)} mağazasından</h2><a href="#/store/${s.id}">Mağazaya git →</a></div>${K.rail(Svc.live().filter(x => x.storeId === s.id && x.id !== p.id).sort((a, b) => b.sold - a.sold).slice(0, 10))}</section>
    </div>
    <div class="sticky-buy"><div>${K.price(p)}</div><button class="btn btn-primary" id="addCart2" ${p.stock <= 0 ? 'disabled' : ''}>Sepete ekle</button></div>`;

    return {
      title: p.brand + ' ' + p.title, html, mount(main) {
        let variant = '';
        U.$$('[data-img]', main).forEach(b => b.onclick = () => { U.$$('[data-img]', main).forEach(x => x.classList.toggle('on', x === b)); U.$('#gMain', main).firstElementChild.outerHTML = K.img(p.images[+b.dataset.img], { label: p.title }); });
        U.$('#gMain', main).onclick = () => { const i = +(U.$('[data-img].on', main) || { dataset: { img: 0 } }).dataset.img; Modal.open({ title: p.title, wide: true, body: `<div style="aspect-ratio:4/5;max-height:75vh;margin:auto;border-radius:12px;overflow:hidden">${K.img(p.images[i])}</div>` }); };
        const vals = U.$('#vals', main);
        vals && (vals.onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; variant = b.dataset.v; U.$$('[data-v]', vals).forEach(x => x.classList.toggle('on', x === b)); U.$('#vSel').textContent = variant; });
        const qty = U.$('#qty', main);
        main.querySelector('.qty').onclick = e => { const b = e.target.closest('[data-q]'); if (b) qty.value = U.clamp((+qty.value || 1) + +b.dataset.q, 1, Math.max(1, p.stock)); };
        const add = () => Svc.addToCart(p.id, variant, +qty.value || 1);
        U.$('#addCart', main).onclick = add;
        U.$('#addCart2').onclick = () => { if (vv && !variant) { window.scrollTo({ top: 0, behavior: 'smooth' }); C.toast(vv.name + ' seçmelisin', { icon: '⚠️' }); } else add(); };
        U.$('#buyNow', main).onclick = () => { if (add()) go('/cart'); };
        U.$('#favBtn', main).onclick = e => { const on = Svc.toggleFav(p.id); if (on != null) { e.currentTarget.textContent = on ? '♥' : '♡'; e.currentTarget.style.color = on ? 'var(--bad)' : ''; } };
        U.$('#followBtn', main).onclick = e => { const on = Svc.toggleFollow(s.id); if (on != null) e.currentTarget.textContent = on ? '✓ Takip ediliyor' : '+ Takip et'; };
        U.$('#alertF', main).onsubmit = e => { e.preventDefault(); Svc.setAlert(p.id, U.$('#alertV').value); };
        main.addEventListener('click', e => {
          const c = e.target.closest('[data-coupon]'); if (c) { Svc.setCoupon(c.dataset.coupon); c.textContent = '✓ Alındı'; c.disabled = true; C.toast(c.dataset.coupon + ' kuponu sepetine tanımlandı', { icon: '🎟' }); }
        });
        const sh = U.$('#sizeHelp', main);
        sh && (sh.onclick = () => Modal.open({
          title: 'Bedenimi bul', body: `<p class="small muted" style="margin-bottom:12px">Boy ve kilona göre bu ürünün kalıbı için önerimizi hesaplayalım. Yorumlarda "kalıbı küçük" diyenleri de hesaba katıyoruz.</p><div class="form-grid"><div class="field"><label for="sh-h">Boy (cm)</label><input class="input" id="sh-h" type="number" value="168"></div><div class="field"><label for="sh-w">Kilo (kg)</label><input class="input" id="sh-w" type="number" value="62"></div></div><div id="sh-out" style="margin-top:14px"></div>`,
          actions: [{ label: 'Hesapla', primary: true, onClick: bg => {
            const h = +U.$('#sh-h', bg).value, w = +U.$('#sh-w', bg).value; const bmi = w / Math.pow(h / 100, 2);
            let idx = bmi < 18.5 ? 1 : bmi < 21 ? 2 : bmi < 24 ? 3 : bmi < 27 ? 4 : 5;
            const small = sum && sum.cons.some(c => c[0] === 'Kalıp küçük'); if (small) idx = Math.min(5, idx + 1);
            const size = vv.options[idx];
            U.$('#sh-out', bg).innerHTML = `<div class="insight good"><span class="ii">📏</span><div><b>Önerilen beden: ${size}</b><div class="small">${small ? 'Yorumlara göre kalıp küçük olduğu için bir beden büyüğünü öneriyoruz.' : 'Bu ürünün kalıbı standart.'}</div></div></div>`;
            const btn = U.$(`[data-v="${size}"]`, main); btn && btn.click(); return false;
          } }]
        }));
        const tabs = U.$('#ptabs', main);
        const openTab = t => { U.$$('[data-tab]', tabs).forEach(b => b.classList.toggle('on', b.dataset.tab === t)); U.$$('[data-pane]', main).forEach(x => x.hidden = x.dataset.pane !== t); };
        tabs.onclick = e => { const b = e.target.closest('[data-tab]'); if (b) openTab(b.dataset.tab); };
        U.$$('[data-tab-go]', main).forEach(a => a.onclick = e => { e.preventDefault(); openTab(a.dataset.tabGo); tabs.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
        // birlikte alınanlar
        const bt = U.$('#bundleTotal', main);
        if (bt) {
          const upd = () => { bt.textContent = U.tl(U.sum(U.$$('[data-bundle]:checked', main), x => +x.dataset.price)); };
          upd(); U.$('#bundle', main).onchange = upd;
          U.$('#bundleAdd', main).onclick = () => { let n = 0; U.$$('[data-bundle]:checked', main).forEach(x => { const bp = Svc.product(+x.dataset.bundle); if (bp.variants) { if (bp.id === p.id && variant) { Svc.addToCart(bp.id, variant); n++; } } else if (Svc.addToCart(bp.id)) n++; }); if (!n) C.toast('Varyantlı ürünler için önce seçim yap', { icon: 'ℹ️' }); };
        }
        // değerlendirme ve soru formları
        bindReviewQa(main, p);
      }
    };
  };

  function reviewsPane(p, reviews, sum) {
    if (!reviews.length) return K.empty('⭐', 'Henüz değerlendirme yok', 'Bu ürünü satın alan ilk kişi sen ol ve deneyimini paylaş.') + reviewForm(p);
    return `<div class="g2" style="grid-template-columns:320px 1fr;gap:24px">
      <div class="stack">
        <div class="row nowrap"><span style="font:800 3rem var(--f-display)">${p.rating.toFixed(1).replace('.', ',')}</span><div>${K.stars(p.rating, '1.2rem')}<div class="small muted">${sum.total} değerlendirme</div></div></div>
        <div class="rdist">${sum.dist.map((n, i) => `<span>${5 - i} ★</span><div class="bar"><i style="width:${(n / sum.total * 100).toFixed(0)}%"></i></div><span class="muted">${n}</span>`).join('')}</div>
        <div class="card card-pad" style="background:var(--surface-2)"><div class="eyebrow" style="margin-bottom:6px">✦ Yorum özeti</div><p class="small" style="line-height:1.6">${esc(sum.sentence)}</p>
          ${sum.pros.length ? `<div class="kw" style="margin-top:10px">${sum.pros.map(x => `<span class="badge b-ok">👍 ${esc(x[0])} (${x[1]})</span>`).join('')}${sum.cons.map(x => `<span class="badge b-warn">👎 ${esc(x[0])} (${x[1]})</span>`).join('')}</div>` : ''}</div>
        ${reviewForm(p)}
      </div>
      <div><div class="row" style="margin-bottom:6px"><div class="seg" id="rvSeg"><button class="on" data-rf="0">Tümü</button>${[5, 4, 3, 2, 1].map(s => `<button data-rf="${s}">${s} ★</button>`).join('')}</div></div>
        <div id="rvList">${reviews.slice(0, 30).map(reviewItem).join('')}</div></div>
    </div>`;
  }
  function reviewItem(r) {
    return `<div class="review" data-rating="${r.rating}"><div class="row between"><div class="row">${K.stars(r.rating)}<b class="small">${esc(r.userName)}</b><span class="xs muted">${U.date(r.createdAt)}</span>${r.variant ? `<span class="badge b-mute">${esc(r.variant)}</span>` : ''}<span class="badge b-ok">✓ Satın aldı</span></div><button class="btn btn-ghost btn-sm" data-helpful="${r.id}">👍 Faydalı (${r.helpful})</button></div><p class="small">${esc(r.text)}</p>${r.sellerReply ? `<div class="reply"><b>Satıcı cevabı:</b> ${esc(r.sellerReply)}</div>` : ''}</div>`;
  }
  function reviewForm(p) {
    if (!Svc.canReview(p.id)) return '';
    return `<form class="card card-pad stack" id="rvForm"><b>Bu ürünü satın aldın, değerlendir</b><div class="row" id="rvStars" style="font-size:1.6rem;gap:2px">${[1, 2, 3, 4, 5].map(i => `<button type="button" data-st="${i}" style="border:0;background:none;color:var(--line-2);padding:0">★</button>`).join('')}</div><textarea class="textarea" id="rvText" placeholder="Ürünü nasıl buldun? Kalite, kalıp, kargo…" required></textarea><button class="btn btn-primary">Değerlendirmeyi gönder</button></form>`;
  }
  function qaPane(p, qs) {
    const s = Svc.store(p.storeId);
    const avgH = (() => { const a = qs.filter(q => q.answer && q.answeredAt); return a.length ? Math.max(1, Math.round(U.sum(a, q => Math.max(0, q.answeredAt - q.createdAt)) / a.length / 3600e3 / 10)) : 0; })();
    return `<div class="stack lg"><form class="row nowrap" id="qaForm"><input class="input" id="qaText" placeholder="Satıcıya ürünle ilgili sorunu sor…" aria-label="Soru"><button class="btn btn-dark">Soru sor</button></form>
      ${avgH ? `<div class="small muted">💬 ${esc(s.name)} soruları ortalama ${avgH} saatte cevaplıyor.</div>` : ''}
      ${qs.length ? qs.map(q => `<div class="review"><div class="row"><b class="small">❓ ${esc(q.text)}</b><span class="xs muted">${U.ago(q.createdAt)}</span></div>${q.answer ? `<div class="reply"><b>${esc(s.name)}:</b> ${esc(q.answer)}</div>` : '<span class="xs muted">Satıcının cevabı bekleniyor</span>'}</div>`).join('') : K.empty('💬', 'Henüz soru sorulmamış', 'Aklına takılanı satıcıya sorabilirsin.')}</div>`;
  }
  function pricePane(p, an) {
    const now = Date.now();
    const pts = an.series.filter(x => x[0] >= now - 90 * U.DAY);
    const start = (p.priceHistory || []).filter(x => x[0] < now - 90 * U.DAY).pop();
    const days = [];
    for (let t = U.startOfDay(now - 89 * U.DAY); t <= now; t += U.DAY) {
      let v = start ? start[1] : (pts[0] || [0, p.price])[1];
      an.series.forEach(([tt, vv]) => { if (tt <= t + U.DAY - 1) v = vv; });
      days.push([t, v]);
    }
    const info = Svc.priceInfo(p);
    days[days.length - 1][1] = info.price;
    const series = [{ name: 'Fiyat', values: days.map(d => d[1]), color: 'var(--c1)' }];
    if (p.listPrice) series.push({ name: 'Üstü çizili fiyat', values: days.map(() => p.listPrice), color: 'var(--c6)', dash: true });
    return `<div class="stack"><div class="row" style="gap:24px"><div><div class="xs muted">Bugün</div><b class="price-now">${U.tl(info.price)}</b></div><div><div class="xs muted">90 gün en düşük</div><b>${U.tl(an.min)}</b></div><div><div class="xs muted">90 gün ortalama</div><b>${U.tl(an.avg)}</b></div><div><div class="xs muted">90 gün en yüksek</div><b>${U.tl(an.max)}</b></div></div>
      ${Chart.line({ series, labels: days.map(d => U.dayMonth(d[0])), height: 300, width: 1150, money: true, step: true, area: false })}
      <div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join('')}</div>
      <p class="xs muted">Fiyat geçmişi MarkaBahçem tarafından bağımsız olarak kaydedilir. Flaş fırsat indirimleri günün fiyatına yansıtılmıştır.</p></div>`;
  }
  function bindReviewQa(main, p) {
    const f = U.$('#rvForm', main);
    if (f) {
      let rating = 0;
      U.$('#rvStars', main).onclick = e => { const b = e.target.closest('[data-st]'); if (!b) return; rating = +b.dataset.st; U.$$('[data-st]', main).forEach(x => x.style.color = +x.dataset.st <= rating ? 'var(--star)' : 'var(--line-2)'); };
      f.onsubmit = e => { e.preventDefault(); if (!rating) return C.toast('Yıldız seçmelisin', { icon: '⚠️' }); Svc.addReview(p.id, rating, U.$('#rvText').value.trim()); C.toast('Değerlendirmen yayınlandı, teşekkürler!', { icon: '⭐' }); Router.refresh(); };
    }
    const seg = U.$('#rvSeg', main);
    seg && (seg.onclick = e => { const b = e.target.closest('[data-rf]'); if (!b) return; U.$$('[data-rf]', seg).forEach(x => x.classList.toggle('on', x === b)); const v = +b.dataset.rf; U.$$('#rvList .review').forEach(r => r.hidden = v && +r.dataset.rating !== v); });
    main.addEventListener('click', e => { const h = e.target.closest('[data-helpful]'); if (h && !h.disabled) { const r = DB.get('reviews', h.dataset.helpful); r.helpful++; DB.save(); h.textContent = `👍 Faydalı (${r.helpful})`; h.disabled = true; } });
    const qf = U.$('#qaForm', main);
    qf.onsubmit = e => { e.preventDefault(); const t = U.$('#qaText').value.trim(); if (!t) return; if (!Svc.requireLogin('Soru sormak için giriş yap.')) return; Svc.ask(p.id, t); C.toast('Sorun satıcıya iletildi. Cevaplandığında bildirim alacaksın.', { icon: '💬' }); U.$('#qaText').value = ''; };
  }

  /* =============== MAĞAZA =============== */
  P.store = ({ id }, q) => {
    const s = Svc.store(id);
    if (!s || (s.status !== 'active' && !(Auth.user() && (Auth.user().role === 'admin' || Auth.user().storeId === s.id)))) return { title: 'Mağaza bulunamadı', html: `<div class="wrap">${K.empty('🏪', 'Mağaza bulunamadı', 'Bu mağaza kapalı ya da henüz onaylanmamış olabilir.', '<a class="btn btn-primary" href="#/stores">Mağazalara göz at</a>')}</div>` };
    const tab = q.tab || 'all';
    const prods = Svc.live().filter(p => p.storeId === s.id);
    const subs = U.uniq(prods.map(p => p.sub));
    let list = prods;
    if (q.sub) list = list.filter(p => p.sub === q.sub);
    const sort = q.sort || 'best';
    list = Svc.search({ store: s.id, sub: q.sub, sort }).list;
    const r = Svc.storeRating(s);
    const reviews = DB.where('reviews', x => x.storeId === s.id).sort((a, b) => b.createdAt - a.createdAt);
    const banners = (s.banners || []).filter(b => b.active);
    const coupons = DB.where('coupons', c => c.active && c.storeId === s.id && c.expiresAt > Date.now());
    const following = Svc.isFollowing(s.id);
    const link = patch => '#/store/' + s.id + U.qs(Object.assign({}, q, patch));
    const st30 = Svc.stats({ storeId: s.id, days: 90 });
    const html = `<div class="wrap section">
      ${s.status !== 'active' ? `<div class="insight warnish" style="margin-bottom:14px"><span class="ii">👁</span><div><b>Önizleme:</b> Mağazan henüz yayında değil (${Svc.STORE_STATUS[s.status][0]}). Müşteriler bu sayfayı göremez.</div></div>` : ''}
      <div class="store-hero" style="background:linear-gradient(120deg,${esc(s.cover[0])},${esc(s.cover[1])})">
        ${s.coverImg ? `<div class="sh-bg" style="background-image:url('${esc(s.coverImg)}')"></div>` : ''}<div class="sh-shade"></div>
        <div class="sh-in">${K.storeAvatar(s, 76)}
          <div class="grow stack" style="gap:6px"><div class="row"><h1>${esc(s.name)}</h1>${s.official ? '<span class="badge" style="background:#fff;color:#1a1815">✔︎ Resmi satıcı</span>' : ''}<span class="score">${Svc.storeScore(s).toFixed(1).replace('.', ',')}</span></div>
            <div class="store-stats"><div><b>${U.num(Svc.followerCount(s))}</b>takipçi</div><div><b>${r.n ? r.avg.toFixed(1).replace('.', ',') : '–'} ★</b>${r.n} değerlendirme</div><div><b>${prods.length}</b>ürün</div><div><b>${s.shipDays === 0 ? 'Aynı gün' : s.shipDays + ' gün'}</b>kargoya teslim</div><div><b>${U.num(st30.units)}</b>son 90 gün satış</div></div></div>
          <button class="btn ${following ? '' : 'btn-primary'}" id="follow">${following ? '✓ Takip ediliyor' : '+ Takip et'}</button>
        </div>
      </div>
      ${s.announcement ? `<div class="insight brandish" style="margin-top:14px"><span class="ii">📣</span><div><b>Mağaza duyurusu:</b> ${esc(s.announcement)}</div></div>` : ''}
      ${banners.length ? `<div class="g2e" style="margin-top:14px">${banners.slice(0, 2).map(b => `<a class="mini-banner" style="background:${K.bannerBg(b)};min-height:130px" href="${b.link ? '#' + esc(b.link) : link({ tab: 'all' })}"><span class="art">${esc(b.emoji || '')}</span><b>${esc(b.title)}</b><span class="small">${esc(b.subtitle)}</span></a>`).join('')}</div>` : ''}
      ${coupons.length ? `<div class="promo-band" style="margin-top:14px">${coupons.map(c => `<div class="coupon"><div class="cv">${c.type === 'percent' ? '%' + c.value : U.tl0(c.value)}</div><div class="cb"><b>${esc(c.title)}</b><span class="xs muted">${U.tl0(c.minTotal)} üzeri · kod <code>${esc(c.code)}</code></span><button class="btn btn-sm btn-soft" data-coupon="${esc(c.code)}" style="align-self:flex-start">Kuponu al</button></div></div>`).join('')}</div>` : ''}
      <div class="tabs" style="margin-top:20px">${[['all', 'Tüm ürünler'], ['best', 'Çok satanlar'], ['reviews', 'Değerlendirmeler'], ['about', 'Mağaza hakkında']].map(([k, l]) => `<a class="${tab === k ? 'on' : ''}" href="${link({ tab: k })}">${l}</a>`).join('')}</div>
      <div style="padding-top:16px">
      ${tab === 'all' ? `<div class="row between" style="margin-bottom:14px"><div class="row" style="gap:6px"><a class="chip ${!q.sub ? 'on' : ''}" href="${link({ sub: '' })}">Tümü</a>${subs.map(x => `<a class="chip ${q.sub === x ? 'on' : ''}" href="${link({ sub: x })}">${esc(x)}</a>`).join('')}</div>
          <select class="select" id="ssort" style="width:auto" aria-label="Sırala">${[['best', 'En çok satan'], ['price-asc', 'En düşük fiyat'], ['price-desc', 'En yüksek fiyat'], ['rating', 'En yüksek puan'], ['new', 'En yeniler']].map(([v, l]) => `<option value="${v}" ${sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>${K.grid(list, { showStore: false })}` : ''}
      ${tab === 'best' ? K.grid(prods.slice().sort((a, b) => b.sold - a.sold).slice(0, 12), { showStore: false }) : ''}
      ${tab === 'reviews' ? (reviews.length ? `<div class="card card-pad">${reviews.slice(0, 40).map(rv => { const pp = Svc.product(rv.productId); return reviewItem(rv).replace('<p class="small">', `<a class="xs muted" href="#/p/${rv.productId}">${esc(pp ? pp.title : '')}</a><p class="small">`); }).join('')}</div>` : K.empty('⭐', 'Henüz değerlendirme yok')) : ''}
      ${tab === 'about' ? `<div class="g2e"><div class="card card-pad stack"><h3>Hakkımızda</h3><p>${esc(s.description)}</p></div><div class="card card-pad"><table class="spec-tbl"><tbody>
          ${(() => { const si = Svc.sellerInfo ? Svc.sellerInfo(s) : { title: s.name }; return `<tr><td>Satıcı unvanı</td><td>${esc(si.title)}</td></tr>${si.taxOffice ? `<tr><td>Vergi dairesi</td><td>${esc(si.taxOffice)}</td></tr>` : ''}${si.mersis ? `<tr><td>MERSİS no</td><td>${esc(si.mersis)}</td></tr>` : ''}${s.house && si.address ? `<tr><td>Adres</td><td>${esc(si.address)}</td></tr>` : ''}${s.house && si.email ? `<tr><td>İletişim</td><td>${esc(si.email)}${si.phone ? ' · ' + esc(si.phone) : ''}</td></tr>` : ''}${si.kep ? `<tr><td>KEP</td><td>${esc(si.kep)}</td></tr>` : ''}`; })()}<tr><td>Şehir</td><td>${esc(s.city)}</td></tr><tr><td>MarkaBahçem'de</td><td>${U.date(s.createdAt)}'den beri</td></tr>
          <tr><td>Kargo ücreti</td><td>${s.freeShipOver === 0 ? 'Tüm siparişlerde ücretsiz' : U.tl(s.shippingFee) + ' (' + U.tl(s.freeShipOver) + ' üzeri ücretsiz)'}</td></tr><tr><td>Kargoya teslim</td><td>${s.shipDays === 0 ? 'Aynı gün' : s.shipDays + ' iş günü'}</td></tr>
          <tr><td>İptal oranı</td><td>%${st30.cancelRate.toFixed(1).replace('.', ',')}</td></tr><tr><td>Vergi no</td><td>${esc(s.taxNo)}</td></tr></tbody></table></div></div>` : ''}
      </div></div>`;
    return {
      title: s.name, html, mount(main) {
        U.$('#follow', main).onclick = () => { if (Svc.toggleFollow(s.id) != null) Router.refresh(); };
        const so = U.$('#ssort', main); so && (so.onchange = e => go(link({ sort: e.target.value }).slice(1)));
        main.addEventListener('click', e => { const c = e.target.closest('[data-coupon]'); if (c) { Svc.setCoupon(c.dataset.coupon); c.textContent = '✓ Sepete tanımlandı'; c.disabled = true; } });
      }
    };
  };

  P.stores = () => {
    const stores = DB.where('stores', s => s.status === 'active').sort((a, b) => Svc.followerCount(b) - Svc.followerCount(a));
    return { title: 'Mağazalar', html: `<div class="wrap section"><div class="sec-head"><div><div class="eyebrow">${stores.length} onaylı mağaza</div><h1>Mağazalar</h1></div><a class="btn btn-primary" href="#/sell">Sen de mağaza aç</a></div><div class="store-list">${stores.map(storeTile).join('')}</div></div>` };
  };

  /* =============== FLAŞ FIRSATLAR =============== */
  P.deals = () => {
    const deals = DB.all('deals').filter(d => Svc.isLive(Svc.product(d.productId)));
    const html = `<div class="wrap section"><div class="flash" style="margin-bottom:20px"><div class="row between"><div><div class="eyebrow" style="color:var(--brand)">Bugüne özel</div><h1 style="color:var(--bg)">⚡ Flaş fırsatlar</h1><p style="opacity:.75">Her gün gece yarısı yenilenen, stokla sınırlı indirimler.</p></div><div class="stack" style="align-items:flex-end;gap:4px"><span class="small" style="opacity:.75">Bitmesine kalan</span>${deals[0] ? K.countdown(deals[0].endsAt) : ''}</div></div></div>
      <div class="pgrid">${deals.map(d => { const p = Svc.product(d.productId); const pct = Math.min(100, Math.round(d.claimed / d.stockLimit * 100)); return `<div class="stack" style="gap:6px">${K.card(p)}<div class="bar brand"><i style="width:${pct}%"></i></div><span class="xs muted">%${pct} satıldı · ${d.stockLimit - d.claimed} kampanyalı ürün kaldı</span></div>`; }).join('')}</div></div>`;
    return { title: 'Flaş fırsatlar', html };
  };

  /* =============== SEPET =============== */
  P.cart = () => {
    const s = Svc.cartSummary();
    const avail = DB.where('coupons', c => c.active && c.expiresAt > Date.now() && c.used < c.limit && (!c.storeId || s.groups.some(g => g.store.id === c.storeId)));
    if (!s.rows.length) {
      return { title: 'Sepetim', html: `<div class="wrap section">${K.empty('🛒', 'Sepetin şu an boş', 'Beğendiğin ürünleri sepete ekleyip tek seferde birden fazla mağazadan alışveriş yapabilirsin.', '<a class="btn btn-primary" href="#/">Alışverişe başla</a>')}<div class="sec-head"><h2>Sana önerdiklerimiz</h2></div>${K.rail(Svc.recommend(10).list)}</div>` };
    }
    const item = r => `<div class="cart-item">
      <a class="thumb" href="#/p/${r.p.id}">${K.img(r.p.images[0])}</a>
      <div style="min-width:0" class="stack" style="gap:4px"><a href="#/p/${r.p.id}" class="small"><b>${esc(r.p.brand)}</b> ${esc(r.p.title)}</a>
        <div class="row small muted" style="gap:8px">${r.variant ? `<span class="badge b-mute">${esc(r.p.variants ? r.p.variants.name : '')}: ${esc(r.variant)}</span>` : ''}${r.info.deal ? '<span class="badge" style="background:var(--ink);color:var(--bg)">⚡ Flaş</span>' : ''}${r.p.stock < r.qty ? `<span class="badge b-bad">Stokta ${r.p.stock} adet var</span>` : r.p.stock <= 5 ? `<span class="badge b-warn">Son ${r.p.stock} ürün</span>` : ''}</div>
        <div class="xs muted">${esc(Svc.deliveryEstimate(r.p).from)} tahmini teslimat</div>
        <div class="row" style="gap:6px"><button class="btn btn-ghost btn-sm" data-save="${r.idx}">${r.saved ? '🛒 Sepete taşı' : '🔖 Sonra al'}</button><button class="btn btn-ghost btn-sm" data-del="${r.idx}">🗑 Sil</button></div></div>
      <div class="ci-right">${r.saved ? '' : `<div class="qty sm"><button data-dq="${r.idx}" data-d="-1" aria-label="Azalt">−</button><input value="${r.qty}" data-qi="${r.idx}" aria-label="Adet"><button data-dq="${r.idx}" data-d="1" aria-label="Arttır">+</button></div>`}
        <div style="text-align:right">${r.info.old ? `<div class="price-old">${U.tl(r.info.old * r.qty)}</div>` : ''}<div class="price-now">${U.tl(r.info.price * r.qty)}</div></div></div>
    </div>`;
    const html = `<div class="wrap section">
      <h1 style="margin-bottom:16px">Sepetim <span class="muted" style="font-size:1rem;font-weight:500">(${s.count} ürün, ${s.groups.length} mağaza)</span></h1>
      <div class="cart-layout">
        <div class="stack">
          ${s.groups.map(g => {
            const fill = g.freeLeft > 0 ? Svc.fillers(g, 3) : [];
            const pct = g.store.freeShipOver ? Math.min(100, g.subtotal / g.store.freeShipOver * 100) : 100;
            return `<div class="cart-store">
              <div class="cs-head"><div class="row">${K.storeAvatar(g.store, 30)}<a href="#/store/${g.store.id}" class="bold">${esc(g.store.name)}</a><span class="score" style="height:22px">${Svc.storeScore(g.store).toFixed(1).replace('.', ',')}</span></div><span class="small ${g.shipping ? 'muted' : 'ok bold'}">${g.shipping ? 'Kargo ' + U.tl(g.shipping) : '🚚 Kargo bedava'}</span></div>
              ${g.freeLeft > 0 ? `<div class="ship-progress"><span>🚚 <b>${U.tl(g.freeLeft)}</b> daha eklersen bu mağazadan kargo bedava</span><div class="bar ok"><i style="width:${pct}%"></i></div>
                ${fill.length ? `<div class="row" style="gap:8px;margin-top:4px">${fill.map(p => `<div class="row nowrap" style="gap:8px;border:1px solid var(--line);border-radius:10px;padding:6px 8px;flex:1;min-width:200px"><span style="width:36px;height:36px;border-radius:6px;overflow:hidden;flex:none">${K.img(p.images[0])}</span><a href="#/p/${p.id}" class="xs grow" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.title)}<br><b class="brand">${U.tl(Svc.priceInfo(p).price)}</b></a>${p.variants ? `<a class="btn btn-sm" href="#/p/${p.id}">Seç</a>` : `<button class="btn btn-sm btn-soft" data-quick="${p.id}">Ekle</button>`}</div>`).join('')}</div>` : ''}</div>` : ''}
              ${g.items.map(item).join('')}
            </div>`;
          }).join('')}
          ${s.unavailable.length ? `<div class="cart-store"><div class="cs-head"><b>Satışta olmayan ürünler</b></div>${s.unavailable.map(item).join('')}</div>` : ''}
          ${s.saved.length ? `<div class="cart-store"><div class="cs-head"><b>🔖 Sonra alacaklarım (${s.saved.length})</b></div>${s.saved.map(item).join('')}</div>` : ''}
        </div>
        <aside class="card card-pad summary stack">
          <h3 style="margin:0">Sipariş özeti</h3>
          <div><div class="sum-line"><span>Ürünlerin toplamı</span><span class="num">${U.tl(s.subtotal)}</span></div>
            <div class="sum-line"><span>Kargo</span><span class="num">${s.shipping ? U.tl(s.shipping) : '<b class="ok">Bedava</b>'}</span></div>
            ${s.discount ? `<div class="sum-line ok"><span>Kupon (${esc(s.code)})</span><span class="num">-${U.tl(s.discount)}</span></div>` : ''}
            <div class="sum-total"><span>Toplam</span><span class="num">${U.tl(s.total)}</span></div>
            ${s.savings + s.discount > 0 ? `<div class="insight good" style="margin-top:10px;padding:8px 12px"><span class="ii">🎉</span><div class="small">Bu siparişte <b>${U.tl(s.savings + s.discount)}</b> tasarruf ediyorsun</div></div>` : ''}</div>
          <form class="stack" id="cpForm" style="gap:6px"><label class="lbl" for="cpIn">İndirim kuponu</label><div class="row nowrap"><input class="input" id="cpIn" placeholder="Kupon kodu" value="${esc(s.code)}"><button class="btn btn-dark">${s.code ? 'Güncelle' : 'Uygula'}</button></div>
            ${s.couponError ? `<span class="xs bad">${esc(s.couponError)}</span>` : s.discount ? `<span class="xs ok">✓ Kupon uygulandı <a href="#" id="cpDel" class="bold">Kaldır</a></span>` : ''}</form>
          ${avail.length ? `<div class="stack" style="gap:6px"><span class="xs muted">Kullanabileceğin kuponlar</span>${avail.slice(0, 4).map(c => `<button class="row between small" data-cp="${esc(c.code)}" style="border:1px dashed var(--brand);background:var(--brand-soft);border-radius:8px;padding:6px 10px;text-align:left"><span><b>${esc(c.code)}</b> · ${c.type === 'percent' ? '%' + c.value : U.tl0(c.value)}</span><span class="xs muted">min ${U.tl0(c.minTotal)}</span></button>`).join('')}</div>` : ''}
          <button class="btn btn-primary btn-lg btn-block" id="toCheckout" ${s.count ? '' : 'disabled'}>Sepeti onayla →</button>
          <div class="xs muted" style="text-align:center">🔒 Güvenli ödeme · ↩ 15 gün ücretsiz iade</div>
        </aside>
      </div>
      <div class="section"><div class="sec-head"><h2>Bunlar da ilgini çekebilir</h2></div>${K.rail(Svc.recommend(10, s.rows.map(r => r.p.id)).list)}</div>
    </div>`;
    return {
      title: 'Sepetim', html, mount(main) {
        const re = () => { Router.refresh(); C.App.updateBadges(); };
        main.addEventListener('click', e => {
          let b;
          if ((b = e.target.closest('[data-dq]'))) { const r = s.rows.find(x => x.idx === +b.dataset.dq); Svc.setQty(r.idx, r.qty + +b.dataset.d); re(); }
          else if ((b = e.target.closest('[data-del]'))) { Svc.removeItem(+b.dataset.del); C.toast('Ürün sepetten çıkarıldı'); re(); }
          else if ((b = e.target.closest('[data-save]'))) { Svc.toggleSaved(+b.dataset.save); re(); }
          else if ((b = e.target.closest('[data-quick]'))) { Svc.addToCart(+b.dataset.quick); re(); }
          else if ((b = e.target.closest('[data-cp]'))) { Svc.setCoupon(b.dataset.cp); re(); }
        });
        main.addEventListener('change', e => { const i = e.target.closest('[data-qi]'); if (i) { Svc.setQty(+i.dataset.qi, +i.value || 1); re(); } });
        U.$('#cpForm', main).onsubmit = e => { e.preventDefault(); Svc.setCoupon(U.$('#cpIn').value.trim()); re(); };
        const cd = U.$('#cpDel', main); cd && (cd.onclick = e => { e.preventDefault(); Svc.setCoupon(''); re(); });
        U.$('#toCheckout', main).onclick = () => go(Auth.user() ? '/checkout' : '/login?next=%2Fcheckout');
      }
    };
  };

  /* =============== ÖDEME =============== */
  P.checkout = () => {
    const u = Auth.user();
    if (!u) return { redirect: '/login?next=%2Fcheckout' };
    const s = Svc.cartSummary();
    if (!s.count) return { redirect: '/cart' };
    const inst = Svc.installments(s.total);
    const html = `<div class="wrap section">
      <div class="steps"><span class="st on"><i>1</i>Sepet</span><span class="ln"></span><span class="st on"><i>2</i>Adres & ödeme</span><span class="ln"></span><span class="st"><i>3</i>Onay</span></div>
      <div class="cart-layout">
        <div class="stack lg">
          <section class="card card-pad stack"><div class="row between"><h3 style="margin:0">📍 Teslimat adresi</h3><button class="btn btn-sm" id="addAddr">+ Yeni adres</button></div>
            ${u.addresses.length ? `<div class="addr-grid" id="addrs">${u.addresses.map((a, i) => `<button class="addr ${i === 0 ? 'on' : ''}" data-addr="${a.id}"><b>${esc(a.title)}</b><span class="small">${esc(a.name)} · ${esc(a.phone)}</span><span class="small muted">${esc(a.line)}, ${esc(a.district)}/${esc(a.city)}</span></button>`).join('')}</div>` : '<p class="muted small">Kayıtlı adresin yok. Devam etmek için bir adres ekle.</p>'}
          </section>
          <section class="card card-pad stack"><h3 style="margin:0">💳 Ödeme</h3>
            <div class="seg" id="payM"><button class="on" data-m="card">Kredi / banka kartı</button><button data-m="transfer">Havale / EFT</button><button data-m="cod">Kapıda ödeme</button></div>
            <div id="payCard" class="g2e" style="align-items:start">
              <div class="stack">
                <div class="field"><label for="ccName">Kart üzerindeki isim</label><input class="input" id="ccName" value="${esc(u.name.toLocaleUpperCase('tr-TR'))}" autocomplete="cc-name"></div>
                <div class="field"><label for="ccNo">Kart numarası</label><input class="input" id="ccNo" inputmode="numeric" placeholder="0000 0000 0000 0000" value="4506 3470 1234 5678" maxlength="19" autocomplete="cc-number"></div>
                <div class="form-grid" style="grid-template-columns:1fr 1fr"><div class="field"><label for="ccExp">Son kullanma</label><input class="input" id="ccExp" placeholder="AA/YY" value="12/28" maxlength="5"></div><div class="field"><label for="ccCvc">CVC</label><input class="input" id="ccCvc" placeholder="000" value="123" maxlength="4" inputmode="numeric"></div></div>
                <span class="xs muted">Demo: kart bilgileri kaydedilmez, ödeme simüle edilir.</span>
              </div>
              <div class="stack"><div class="cc-preview"><div class="row between"><b>MARKABAHÇEM PAY</b><span>◉◉</span></div><div class="ccn" id="ccPrev">4506 3470 1234 5678</div><div class="row between small"><span id="ccNamePrev">${esc(u.name.toLocaleUpperCase('tr-TR'))}</span><span id="ccExpPrev">12/28</span></div></div>
                <div><span class="lbl">Taksit seçenekleri</span><div class="stack" style="gap:6px;margin-top:6px" id="instList">${inst.map((x, i) => `<label class="row between small" style="border:1px solid var(--line-2);border-radius:8px;padding:8px 10px;cursor:pointer"><span class="check"><input type="radio" name="inst" value="${x.n}" ${i === 0 ? 'checked' : ''}>${x.n === 1 ? 'Tek çekim' : x.n + ' × ' + U.tl(x.monthly)}${x.rate === 0 && x.n > 1 ? ' <span class="badge b-ok">Faizsiz</span>' : ''}</span><b class="num">${U.tl(x.total)}</b></label>`).join('')}</div></div></div>
            </div>
            <div id="payTransfer" hidden class="insight info"><span class="ii">🏦</span><div class="small">Siparişini onayladıktan sonra IBAN bilgisi gösterilir. Ödemen 24 saat içinde ulaşmazsa sipariş otomatik iptal edilir.<br><b>MarkaBahçem Ödeme Hizmetleri A.Ş. · TR12 0006 4000 0011 2345 6789 01</b></div></div>
            <div id="payCod" hidden class="insight warnish"><span class="ii">🚪</span><div class="small">Kapıda ödeme hizmet bedeli: <b>${U.tl(19.9)}</b>. Kurye kart veya nakit kabul eder.</div></div>
          </section>
          <section class="card card-pad stack"><h3 style="margin:0">📦 Teslimat özeti</h3>${s.groups.map(g => `<div class="row between small"><span>${K.storeAvatar(g.store, 26).replace('class="store-avatar"', 'class="store-avatar" style="display:inline-grid;vertical-align:middle;margin-right:6px"')} <b>${esc(g.store.name)}</b> · ${g.items.length} ürün <span class="xs muted">· Satıcı: ${esc(Svc.sellerInfo ? Svc.sellerInfo(g.store).title : g.store.name)}</span></span><span class="muted">${esc(Svc.deliveryEstimate(g.items[0].p).from)}</span></div>`).join('')}</section>
        </div>
        <aside class="card card-pad summary stack">
          <h3 style="margin:0">Sipariş özeti</h3>
          <div class="stack" style="gap:8px">${s.groups.flatMap(g => g.items).slice(0, 5).map(r => `<div class="row nowrap small"><span style="width:40px;height:40px;border-radius:8px;overflow:hidden;flex:none">${K.img(r.p.images[0])}</span><span class="grow" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.qty} × ${esc(r.p.title)}</span></div>`).join('')}</div>
          <div><div class="sum-line"><span>Ürünler</span><span class="num">${U.tl(s.subtotal)}</span></div><div class="sum-line"><span>Kargo</span><span class="num">${s.shipping ? U.tl(s.shipping) : 'Bedava'}</span></div>
            ${s.discount ? `<div class="sum-line ok"><span>Kupon</span><span class="num">-${U.tl(s.discount)}</span></div>` : ''}<div class="sum-line" id="instFee" hidden><span>Vade farkı</span><span class="num"></span></div><div class="sum-line" id="codFee" hidden><span>Kapıda ödeme</span><span class="num">${U.tl(19.9)}</span></div>
            <div class="sum-total"><span>Ödenecek</span><span class="num" id="payTotal">${U.tl(s.total)}</span></div></div>
          <label class="check small"><input type="checkbox" id="agree" checked> <span>Ön bilgilendirme formu ve mesafeli satış sözleşmesini okudum, onaylıyorum.</span></label>
          <button class="btn btn-primary btn-lg btn-block" id="pay">Siparişi onayla</button>
          <div class="xs muted" style="text-align:center">🔒 3D Secure ile güvenli ödeme</div>
        </aside>
      </div></div>`;
    return {
      title: 'Ödeme', html, mount(main) {
        let addrId = u.addresses[0] ? u.addresses[0].id : null, method = 'card';
        const addrs = U.$('#addrs', main);
        addrs && (addrs.onclick = e => { const b = e.target.closest('[data-addr]'); if (!b) return; addrId = +b.dataset.addr; U.$$('[data-addr]').forEach(x => x.classList.toggle('on', x === b)); });
        U.$('#addAddr', main).onclick = () => addressModal(null, () => Router.refresh());
        const recalc = () => {
          const n = +(U.$('input[name=inst]:checked') || { value: 1 }).value;
          const rate = method === 'card' ? DB.settings.installmentRates[n] || 0 : 0;
          const fee = U.round2(s.total * rate / 100), cod = method === 'cod' ? 19.9 : 0;
          U.$('#instFee').hidden = !fee; U.$('#instFee .num').textContent = U.tl(fee);
          U.$('#codFee').hidden = !cod;
          U.$('#payTotal').textContent = U.tl(s.total + fee + cod);
        };
        U.$('#instList', main).onchange = recalc;
        U.$('#payM', main).onclick = e => { const b = e.target.closest('[data-m]'); if (!b) return; method = b.dataset.m; U.$$('#payM button').forEach(x => x.classList.toggle('on', x === b)); U.$('#payCard').hidden = method !== 'card'; U.$('#payTransfer').hidden = method !== 'transfer'; U.$('#payCod').hidden = method !== 'cod'; recalc(); };
        const no = U.$('#ccNo', main);
        no.oninput = () => { no.value = no.value.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 '); U.$('#ccPrev').textContent = no.value || '•••• •••• •••• ••••'; };
        U.$('#ccName', main).oninput = e => U.$('#ccNamePrev').textContent = e.target.value.toLocaleUpperCase('tr-TR');
        U.$('#ccExp', main).oninput = e => { let v = e.target.value.replace(/\D/g, '').slice(0, 4); if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2); e.target.value = v; U.$('#ccExpPrev').textContent = v; };
        if (C.Pay) C.Pay.bindCheckout(main, s);
        U.$('#pay', main).onclick = () => {
          if (!addrId) return C.toast('Teslimat adresi eklemelisin', { icon: '📍' });
          if (!U.$('#agree').checked) return C.toast('Sözleşmeyi onaylamalısın', { icon: '⚠️' });
          const n = method === 'card' ? +(U.$('input[name=inst]:checked') || { value: 1 }).value : 1;
          if (method === 'card' && no.value.replace(/\D/g, '').length < 16) return C.toast('Kart numarası 16 hane olmalı', { icon: '💳' });
          const finish = () => {
            const r = Svc.placeOrder({ address: u.addresses.find(a => a.id === addrId), payment: { method, installments: n, last4: no.value.replace(/\D/g, '').slice(-4) } });
            if (r.error) return C.toast(r.error, { icon: '⚠️' });
            if (method === 'cod') { r.order.total = U.round2(r.order.total + 19.9); DB.save(); }
            C.App.updateBadges();
            go('/order-success/' + r.order.id);
          };
          if (method !== 'card') return finish();
          if (C.Pay && C.Pay.active()) return C.Pay.checkout({ s, u, address: u.addresses.find(a => a.id === addrId), n, method });
          Modal.open({
            title: '3D Secure doğrulama', body: `<div class="stack" style="align-items:center;text-align:center"><div style="font-size:2.4rem">🏦</div><p class="small">Bankan <b>${U.tl(U.sum([s.total]))}</b> tutarındaki işlem için telefonuna tek kullanımlık şifre gönderdi.</p><input class="input" id="otp" value="123456" maxlength="6" style="text-align:center;font-size:1.4rem;letter-spacing:.3em;max-width:200px" inputmode="numeric" aria-label="Doğrulama kodu"><span class="xs muted">Demo kodu: 123456</span></div>`,
            actions: [{ label: 'Vazgeç' }, { label: 'Onayla ve öde', primary: true, onClick: bg => { if (U.$('#otp', bg).value !== '123456') { C.toast('Doğrulama kodu hatalı', { icon: '⚠️' }); return false; } finish(); } }]
          });
        };
      }
    };
  };

  P.orderSuccess = ({ id }) => {
    const o = DB.all('orders').find(x => x.id === +id);
    if (!o) return { redirect: '/' };
    const html = `<div class="wrap section" style="max-width:760px">
      <div class="card card-pad stack lg" style="text-align:center;align-items:center;padding:40px 24px;position:relative;overflow:hidden">
        <canvas id="confetti" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none"></canvas>
        <div style="width:76px;height:76px;border-radius:50%;background:var(--ok-soft);color:var(--ok);display:grid;place-items:center;font-size:2.4rem">✓</div>
        <h1>Siparişin alındı!</h1><p class="muted">Sipariş numaran <b style="color:var(--ink)">#${o.id}</b>. Özetini e-posta adresine de gönderdik.</p>
        <div class="row" style="justify-content:center;gap:28px"><div><div class="xs muted">Toplam</div><b>${U.tl(o.total)}</b></div><div><div class="xs muted">Paket sayısı</div><b>${o.packages.length}</b></div><div><div class="xs muted">Ödeme</div><b>${o.payment.method === 'card' ? (o.payment.installments > 1 ? o.payment.installments + ' taksit' : 'Tek çekim') : o.payment.method === 'cod' ? 'Kapıda' : 'Havale'}</b></div></div>
        ${o.payment.method === 'transfer' ? '<div class="insight info"><span class="ii">🏦</span><div class="small">Lütfen 24 saat içinde <b>TR12 0006 4000 0011 2345 6789 01</b> IBAN\'ına açıklamaya #' + o.id + ' yazarak ödeme yap.</div></div>' : ''}
        <div class="row" style="justify-content:center"><a class="btn btn-primary" href="#/account/orders/${o.id}">Siparişi takip et</a><a class="btn" href="#/">Alışverişe devam et</a></div>
      </div></div>`;
    return {
      title: 'Sipariş alındı', html, mount(main) {
        const cv = U.$('#confetti', main); if (!cv || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const ctx = cv.getContext('2d'); cv.width = cv.offsetWidth; cv.height = cv.offsetHeight;
        const cols = ['#f25c05', '#0e7c74', '#2459d6', '#c2418a', '#f5a70a'];
        const ps = Array.from({ length: 120 }, () => ({ x: Math.random() * cv.width, y: -20 - Math.random() * cv.height, v: 2 + Math.random() * 3, r: Math.random() * 6.28, s: 4 + Math.random() * 6, c: cols[Math.floor(Math.random() * 5)] }));
        let raf, t = 0;
        const draw = () => { ctx.clearRect(0, 0, cv.width, cv.height); ps.forEach(p => { p.y += p.v; p.x += Math.sin(p.y / 30); p.r += .1; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore(); }); if (++t < 260) raf = requestAnimationFrame(draw); else ctx.clearRect(0, 0, cv.width, cv.height); };
        draw();
        return () => cancelAnimationFrame(raf);
      }
    };
  };

  /* =============== HESABIM =============== */
  function addressModal(addr, done) {
    const u = Auth.user();
    const a = addr || { title: 'Ev', name: u.name, phone: u.phone || '', city: 'İstanbul', district: '', line: '' };
    Modal.open({
      title: addr ? 'Adresi düzenle' : 'Yeni adres', body: `<div class="form-grid">
        <div class="field"><label for="a-t">Adres başlığı</label><input class="input" id="a-t" value="${esc(a.title)}"></div><div class="field"><label for="a-n">Ad soyad</label><input class="input" id="a-n" value="${esc(a.name)}"></div>
        <div class="field"><label for="a-p">Telefon</label><input class="input" id="a-p" value="${esc(a.phone)}"></div><div class="field"><label for="a-c">İl</label><input class="input" id="a-c" value="${esc(a.city)}"></div>
        <div class="field"><label for="a-d">İlçe</label><input class="input" id="a-d" value="${esc(a.district)}"></div><div class="field full"><label for="a-l">Açık adres</label><textarea class="textarea" id="a-l">${esc(a.line)}</textarea></div></div>`,
      actions: [{ label: 'Vazgeç' }, { label: 'Kaydet', primary: true, onClick: bg => {
        const v = id => U.$(id, bg).value.trim();
        const row = { title: v('#a-t'), name: v('#a-n'), phone: v('#a-p'), city: v('#a-c'), district: v('#a-d'), line: v('#a-l') };
        if (!row.name || !row.line || !row.district) { C.toast('Ad, ilçe ve açık adres zorunlu', { icon: '⚠️' }); return false; }
        if (addr) Object.assign(addr, row); else u.addresses.push(Object.assign({ id: Date.now() }, row));
        DB.save(); C.toast('Adres kaydedildi'); done && done();
      } }]
    });
  }

  P.account = ({ tab = 'orders' }) => {
    const u = Auth.user();
    if (!u) return { redirect: '/login?next=' + encodeURIComponent('/account/' + tab) };
    const nav = [['orders', '📦', 'Siparişlerim'], ['favorites', '♡', 'Favorilerim'], ['alerts', '🔔', 'Fiyat alarmlarım'], ['following', '🏪', 'Takip ettiklerim'], ['notifications', '✉️', 'Bildirimler'], ['addresses', '📍', 'Adreslerim'], ['profile', '⚙️', 'Hesap bilgilerim']];
    let body = '', mount = null, title = (nav.find(n => n[0] === tab) || nav[0])[2];
    if (tab === 'orders') {
      const orders = Svc.myOrders();
      body = orders.length ? `<div class="seg" id="oFilt" style="margin-bottom:14px"><button class="on" data-f="all">Tümü</button><button data-f="active">Devam edenler</button><button data-f="delivered">Teslim edilenler</button><button data-f="cancelled">İptal & iade</button></div><div class="stack" id="oList">${orders.map(orderCard).join('')}</div>`
        : K.empty('📦', 'Henüz siparişin yok', 'İlk siparişinde HOSGELDIN koduyla 100 TL indirim kazan.', '<a class="btn btn-primary" href="#/">Alışverişe başla</a>');
      mount = main => { const f = U.$('#oFilt', main); f && (f.onclick = e => { const b = e.target.closest('[data-f]'); if (!b) return; U.$$('#oFilt button').forEach(x => x.classList.toggle('on', x === b)); U.$$('#oList [data-st]').forEach(c => { const st = c.dataset.st.split(','); const m = { all: true, active: st.some(x => ['new', 'preparing', 'shipped'].includes(x)), delivered: st.includes('delivered'), cancelled: st.some(x => ['cancelled', 'returned', 'returnRequested'].includes(x)) }; c.hidden = !m[b.dataset.f]; }); }); };
    } else if (tab === 'favorites') {
      const favs = (u.favorites || []).map(id => Svc.product(id)).filter(p => Svc.isLive(p));
      const drops = favs.filter(p => { const h = p.priceHistory || []; return h.length > 1 && Svc.priceInfo(p).price < h[h.length - 2][1]; });
      body = (drops.length ? `<div class="insight good" style="margin-bottom:14px"><span class="ii">📉</span><div><b>${drops.length} favorinin fiyatı düştü!</b><div class="small">${drops.map(p => esc(p.title)).join(', ')}</div></div></div>` : '') + (favs.length ? K.grid(favs) : K.empty('♡', 'Favori listen boş', 'Beğendiğin ürünlerdeki kalbe dokun, fiyatı düşünce haber verelim.'));
    } else if (tab === 'alerts') {
      const al = DB.where('alerts', a => a.userId === u.id).map(a => ({ a, p: Svc.product(a.productId) })).filter(x => x.p);
      body = al.length ? `<div class="stack">${al.map(({ a, p }) => { const cur = Svc.priceInfo(p).price; const hit = cur <= a.target; return `<div class="alert-row"><a href="#/p/${p.id}" style="width:60px;height:60px;border-radius:10px;overflow:hidden;flex:none">${K.img(p.images[0])}</a><div class="grow" style="min-width:0"><a href="#/p/${p.id}" class="small bold">${esc(p.title)}</a><div class="small muted">Şu an <b style="color:var(--ink)">${U.tl(cur)}</b> · Hedefin <b>${U.tl(a.target)}</b></div><div class="bar ${hit ? 'ok' : 'brand'}" style="margin-top:6px;max-width:320px"><i style="width:${Math.min(100, a.target / cur * 100)}%"></i></div></div>${hit ? '<span class="badge b-ok">🎯 Hedef fiyata ulaştı</span>' : `<span class="badge b-mute">%${Math.round((1 - a.target / cur) * 100)} düşüş bekleniyor</span>`}<button class="btn btn-ghost btn-sm" data-dela="${a.id}">Sil</button></div>`; }).join('')}</div>`
        : K.empty('🔔', 'Fiyat alarmın yok', 'Ürün sayfasındaki "Fiyat alarmı" kutusundan hedef fiyat belirle, fiyat düşünce ilk sen öğren.');
      mount = main => main.addEventListener('click', e => { const b = e.target.closest('[data-dela]'); if (b) { DB.remove('alerts', b.dataset.dela); Router.refresh(); } });
    } else if (tab === 'following') {
      const st = DB.where('stores', s => s.followers.includes(u.id));
      body = st.length ? `<div class="store-list">${st.map(storeTile).join('')}</div>` : K.empty('🏪', 'Takip ettiğin mağaza yok', 'Mağaza sayfalarından takip et, yeni ürün ve kuponlardan haberdar ol.', '<a class="btn btn-primary" href="#/stores">Mağazaları keşfet</a>');
    } else if (tab === 'notifications') {
      const ns = DB.where('notifications', n => n.userId === u.id).sort((a, b) => b.createdAt - a.createdAt);
      body = ns.length ? `<div class="row between" style="margin-bottom:10px"><span class="small muted">${ns.filter(n => !n.read).length} okunmamış</span><button class="btn btn-sm" id="readAll">Tümünü okundu say</button></div><div class="card">${ns.map(n => `<a href="#${esc(n.link || '/account/notifications')}" class="row nowrap" style="padding:14px 16px;border-bottom:1px solid var(--line);${n.read ? '' : 'background:var(--brand-soft)'}" data-nid="${n.id}"><span class="grow small">${esc(n.text)}</span><span class="xs muted" style="white-space:nowrap">${U.ago(n.createdAt)}</span></a>`).join('')}</div>` : K.empty('✉️', 'Bildirimin yok');
      mount = main => { const r = U.$('#readAll', main); r && (r.onclick = () => { ns.forEach(n => n.read = true); DB.save(); Router.refresh(); }); main.addEventListener('click', e => { const a = e.target.closest('[data-nid]'); if (a) { DB.update('notifications', a.dataset.nid, { read: true }); } }); };
    } else if (tab === 'addresses') {
      body = `<div class="addr-grid">${u.addresses.map(a => `<div class="addr"><b>${esc(a.title)}</b><span class="small">${esc(a.name)} · ${esc(a.phone)}</span><span class="small muted">${esc(a.line)}, ${esc(a.district)}/${esc(a.city)}</span><div class="row" style="margin-top:8px"><button class="btn btn-sm" data-edit="${a.id}">Düzenle</button><button class="btn btn-sm btn-danger" data-deladdr="${a.id}">Sil</button></div></div>`).join('')}
        <button class="addr" id="newAddr" style="align-items:center;justify-content:center;min-height:120px;border-style:dashed"><span style="font-size:1.6rem">+</span><b>Yeni adres ekle</b></button></div>`;
      mount = main => main.addEventListener('click', e => {
        let b;
        if (e.target.closest('#newAddr')) addressModal(null, () => Router.refresh());
        else if ((b = e.target.closest('[data-edit]'))) addressModal(u.addresses.find(a => a.id === +b.dataset.edit), () => Router.refresh());
        else if ((b = e.target.closest('[data-deladdr]'))) { u.addresses = u.addresses.filter(a => a.id !== +b.dataset.deladdr); DB.save(); Router.refresh(); }
      });
    } else if (tab === 'profile') {
      const orders = Svc.myOrders();
      const spent = U.sum(orders, o => o.total);
      const saved = U.sum(orders, o => o.discount);
      body = `<div class="kpis" style="margin-bottom:16px">${K.kpi('Toplam sipariş', U.num(orders.length))}${K.kpi('Toplam harcama', U.tl0(spent))}${K.kpi('Kupon tasarrufu', U.tl0(saved))}${K.kpi('Üyelik', U.date(u.createdAt))}</div>
        <form class="card card-pad stack" id="profF"><h3 style="margin:0">Kişisel bilgiler</h3><div class="form-grid"><div class="field"><label for="p-n">Ad soyad</label><input class="input" id="p-n" value="${esc(u.name)}"></div><div class="field"><label for="p-e">E-posta</label><input class="input" id="p-e" value="${esc(u.email)}"></div><div class="field"><label for="p-p">Telefon</label><input class="input" id="p-p" value="${esc(u.phone || '')}"></div><div class="field"><label for="p-pw">Yeni şifre</label><input class="input" id="p-pw" type="password" placeholder="Değiştirmek istemiyorsan boş bırak"></div></div><button class="btn btn-primary" style="align-self:flex-start">Kaydet</button></form>`;
      mount = main => { U.$('#profF', main).onsubmit = e => { e.preventDefault(); u.name = U.$('#p-n').value.trim() || u.name; u.email = U.$('#p-e').value.trim() || u.email; u.phone = U.$('#p-p').value.trim(); const pw = U.$('#p-pw').value; if (pw) { if (pw.length < 6) return C.toast('Şifre en az 6 karakter olmalı', { icon: '⚠️' }); u.password = pw; } DB.save(); C.toast('Bilgilerin güncellendi'); Router.refresh(); }; };
    }
    const html = `<div class="wrap section"><div class="acc-layout">
      <aside class="card"><div style="padding:16px 16px 8px" class="row nowrap"><div class="store-avatar" style="background:var(--brand);color:var(--brand-ink);font-size:1rem;font-weight:800">${esc(U.initials(u.name))}</div><div style="min-width:0"><b>${esc(u.name)}</b><div class="xs muted" style="overflow:hidden;text-overflow:ellipsis">${esc(u.email)}</div></div></div>
        <nav class="acc-nav">${nav.map(([k, i, l]) => `<a href="#/account/${k}" class="${tab === k ? 'on' : ''}">${i} ${l}${k === 'notifications' && Svc.unread() ? ` <span class="badge b-brand" style="margin-left:auto">${Svc.unread()}</span>` : ''}</a>`).join('')}</nav></aside>
      <section style="min-width:0"><h1 style="margin-bottom:16px;font-size:1.5rem">${esc(title)}</h1>${body}</section>
    </div></div>`;
    return { title, html, mount };
  };

  function orderCard(o) {
    return `<div class="order-card" data-st="${o.packages.map(p => p.status).join(',')}"><div class="oc-head"><div><span>Sipariş no</span><b>#${o.id}</b></div><div><span>Tarih</span>${U.date(o.createdAt)}</div><div><span>Alıcı</span>${esc(o.address.name)}</div><div><span>Tutar</span><b>${U.tl(o.total)}</b></div><a class="btn btn-sm" href="#/account/orders/${o.id}" style="margin-left:auto">Detaylar</a></div>
      ${o.packages.map(pk => `<div class="row" style="padding:12px 18px;border-bottom:1px solid var(--line);gap:14px"><div class="row" style="gap:6px">${pk.items.slice(0, 4).map(i => `<span style="width:48px;height:56px;border-radius:8px;overflow:hidden;display:block">${K.img(i.image)}</span>`).join('')}</div><div class="grow small"><b>${esc((Svc.store(pk.storeId) || {}).name)}</b> · ${pk.items.length} ürün<div>${K.status(pk.status)} <span class="xs muted">${U.ago(pk.history[pk.history.length - 1].t)}</span></div></div></div>`).join('')}</div>`;
  }

  P.orderDetail = ({ id }) => {
    const u = Auth.user();
    if (!u) return { redirect: '/login' };
    const o = DB.all('orders').find(x => x.id === +id && (x.userId === u.id || u.role === 'admin'));
    if (!o) return { title: 'Sipariş bulunamadı', html: `<div class="wrap">${K.empty('📦', 'Sipariş bulunamadı')}</div>` };
    const flow = ['new', 'preparing', 'shipped', 'delivered'];
    const html = `<div class="wrap section" style="max-width:980px">
      <div class="crumbs"><a href="#/account/orders">Siparişlerim</a>›<span>#${o.id}</span></div>
      <div class="row between" style="margin-bottom:16px"><h1 style="font-size:1.5rem">Sipariş #${o.id}</h1><span class="muted small">${U.dateTime(o.createdAt)}</span></div>
      <div class="stack lg">
      ${o.packages.map(pk => {
        const st = Svc.store(pk.storeId);
        const doneIdx = flow.indexOf(pk.history.filter(h => flow.includes(h.s)).map(h => h.s).pop());
        const lastDelivered = pk.history.find(h => h.s === 'delivered');
        const canCancel = ['new', 'preparing'].includes(pk.status);
        const canReturn = pk.status === 'delivered' && lastDelivered && Date.now() - lastDelivered.t < 15 * U.DAY;
        return `<div class="order-card"><div class="oc-head"><div class="row">${K.storeAvatar(st, 30)}<b>${esc(st.name)}</b></div>${K.status(pk.status)}${pk.tracking ? `<div><span>Kargo</span>${esc(pk.carrier)} · <b>${esc(pk.tracking)}</b></div>` : ''}
            <div class="row" style="margin-left:auto">${canCancel ? `<button class="btn btn-sm btn-danger" data-cancel="${pk.storeId}">Siparişi iptal et</button>` : ''}${canReturn ? `<button class="btn btn-sm" data-return="${pk.storeId}">↩ İade talebi oluştur</button>` : ''}</div></div>
          <div style="padding:16px 18px">
            ${['cancelled'].includes(pk.status) ? `<div class="insight warnish"><span class="ii">✕</span><div class="small">Bu paket ${U.dateTime(pk.history[pk.history.length - 1].t)} tarihinde iptal edildi. Ödemen 1-3 iş günü içinde iade edilir.</div></div>` :
            `<div class="timeline">${flow.map((s, i) => { const h = pk.history.find(x => x.s === s); return `<div class="tstep ${i <= doneIdx ? 'done' : ''} ${i === doneIdx + 1 ? 'cur' : ''}"><i>${i <= doneIdx ? '✓' : Svc.STATUS[s].icon}</i><b>${Svc.STATUS[s].label}</b>${h ? `<span>${U.dateTime(h.t)}</span>` : ''}</div>`; }).join('')}</div>`}
            ${['returnRequested', 'returned'].includes(pk.status) ? `<div class="insight info" style="margin-top:10px"><span class="ii">↩️</span><div class="small"><b>${pk.status === 'returned' ? 'İaden tamamlandı.' : 'İade talebin satıcıya iletildi.'}</b> Sebep: ${esc(pk.returnReason)}${pk.status === 'returnRequested' ? '<br>Kargo iade kodu: <b>IADE-' + o.id + '</b> · Anlaşmalı kargo şubesine ücretsiz teslim edebilirsin.' : ''}</div></div>` : ''}
          </div>
          ${pk.items.map(it => { const canRev = pk.status === 'delivered' && Svc.canReview(it.productId); return `<div class="cart-item"><a class="thumb" href="#/p/${it.productId}">${K.img(it.image)}</a><div class="small"><a href="#/p/${it.productId}"><b>${esc(it.brand)}</b> ${esc(it.title)}</a>${it.variant ? `<div class="xs muted">${esc(it.variant)}</div>` : ''}<div class="xs muted">${it.qty} adet</div></div><div class="ci-right"><b class="num">${U.tl(it.price * it.qty)}</b>${canRev ? `<a class="btn btn-sm btn-soft" href="#/p/${it.productId}">⭐ Değerlendir</a>` : ''}<button class="btn btn-sm btn-ghost" data-again="${it.productId}">Tekrar al</button></div></div>`; }).join('')}
        </div>`;
      }).join('')}
      <div class="g2e"><div class="card card-pad stack" style="gap:6px"><h3 style="margin:0 0 6px">Teslimat adresi</h3><b class="small">${esc(o.address.name)}</b><span class="small muted">${esc(o.address.line)}, ${esc(o.address.district)}/${esc(o.address.city)}</span><span class="small muted">${esc(o.address.phone)}</span></div>
        <div class="card card-pad"><h3>Ödeme özeti</h3><div class="sum-line"><span>Ürünler</span><span>${U.tl(o.subtotal)}</span></div><div class="sum-line"><span>Kargo</span><span>${o.shipping ? U.tl(o.shipping) : 'Bedava'}</span></div>${o.discount ? `<div class="sum-line ok"><span>İndirim ${o.coupon ? '(' + esc(o.coupon) + ')' : ''}</span><span>-${U.tl(o.discount)}</span></div>` : ''}<div class="sum-total"><span>Toplam</span><span>${U.tl(o.total)}</span></div><div class="xs muted" style="margin-top:8px">${o.payment.method === 'card' ? `💳 **** ${esc(o.payment.last4)} · ${o.payment.installments > 1 ? o.payment.installments + ' taksit' : 'Tek çekim'}` : o.payment.method === 'cod' ? '🚪 Kapıda ödeme' : '🏦 Havale/EFT'}</div></div></div>
      </div></div>`;
    return {
      title: 'Sipariş #' + o.id, html, mount(main) {
        main.addEventListener('click', async e => {
          let b;
          if ((b = e.target.closest('[data-cancel]'))) { if (await Modal.confirm('Bu paketi iptal etmek istediğine emin misin? Ödemen kartına iade edilecek.', { ok: 'İptal et', danger: true })) { Svc.pkgStatus(o, +b.dataset.cancel, 'cancelled'); C.toast('Sipariş iptal edildi'); Router.refresh(); } }
          else if ((b = e.target.closest('[data-return]'))) {
            Modal.open({ title: 'İade talebi', body: `<div class="stack"><div class="field"><label for="rr">İade sebebi</label><select class="select" id="rr">${['Beden/ölçü uymadı', 'Ürün hasarlı geldi', 'Beklentimi karşılamadı', 'Yanlış ürün gönderildi', 'Vazgeçtim'].map(x => `<option>${x}</option>`).join('')}</select></div><div class="field"><label for="rn">Açıklama (isteğe bağlı)</label><textarea class="textarea" id="rn"></textarea></div><div class="insight info"><span class="ii">ℹ️</span><div class="small">İade kargo kodun otomatik oluşturulacak. Ürün satıcıya ulaşınca ücret iaden başlar.</div></div></div>`,
              actions: [{ label: 'Vazgeç' }, { label: 'Talebi gönder', primary: true, onClick: bg => { const st = +b.dataset.return; Svc.pkgStatus(o, st, 'returnRequested', { returnReason: U.$('#rr', bg).value }); Svc.notify(Svc.store(st).ownerId, `↩️ #${o.id} siparişi için iade talebi: ${U.$('#rr', bg).value}`, '/seller/returns'); C.toast('İade talebin oluşturuldu'); Router.refresh(); } }] });
          }
          else if ((b = e.target.closest('[data-again]'))) { const p = Svc.product(+b.dataset.again); if (p && p.variants) go('/p/' + p.id); else Svc.addToCart(+b.dataset.again); }
        });
      }
    };
  };

  /* =============== KARŞILAŞTIRMA =============== */
  P.compare = () => {
    const ps = Svc.cmp().map(id => Svc.product(id));
    if (!ps.length) return { title: 'Karşılaştır', html: `<div class="wrap section">${K.empty('⚖️', 'Karşılaştırılacak ürün yok', 'Ürün kartlarındaki "Karşılaştır" kutusunu işaretleyerek en fazla 4 ürünü yan yana inceleyebilirsin.', '<a class="btn btn-primary" href="#/search">Ürünlere göz at</a>')}</div>` };
    const prices = ps.map(p => Svc.priceInfo(p).price);
    const minP = Math.min(...prices), maxR = Math.max(...ps.map(p => p.rating));
    const specKeys = U.uniq(ps.flatMap(p => Object.keys(p.specs)));
    const row = (label, fn) => `<tr><th>${esc(label)}</th>${ps.map(fn).join('')}</tr>`;
    const html = `<div class="wrap section"><div class="sec-head"><h1>Ürün karşılaştırma</h1><button class="btn" id="clr">Listeyi temizle</button></div>
      <div class="tbl-wrap"><table class="tbl cmp-table"><tbody>
        ${row('', p => `<td><div style="aspect-ratio:4/5;max-width:180px;border-radius:10px;overflow:hidden;position:relative">${K.img(p.images[0])}</div><a href="#/p/${p.id}" class="small" style="display:block;margin-top:8px"><b>${esc(p.brand)}</b> ${esc(p.title)}</a><button class="btn btn-sm btn-ghost" data-rm="${p.id}">✕ Çıkar</button></td>`)}
        ${row('Fiyat', (p, i) => `<td><b class="price-now">${U.tl(prices[i])}</b> ${prices[i] === minP && ps.length > 1 ? '<span class="badge b-ok">En ucuz</span>' : ''}</td>`)}
        ${row('Puan', p => `<td>${K.rating(p)} ${p.rating === maxR && p.rating > 0 && ps.length > 1 ? '<span class="badge b-ok">En yüksek</span>' : ''}</td>`)}
        ${row('Fiyat analizi', p => { const a = Svc.priceAnalysis(p); return `<td class="small">${esc(a.text)}${a.fake ? '<br><span class="bad">⚠️ Şüpheli indirim</span>' : ''}</td>`; })}
        ${row('Satıcı', p => `<td class="small">${esc(Svc.store(p.storeId).name)} <span class="score" style="height:20px">${Svc.storeScore(Svc.store(p.storeId)).toFixed(1).replace('.', ',')}</span></td>`)}
        ${row('Kargo', p => `<td class="small">${Svc.freeShip(p) ? '<b class="ok">Bedava</b>' : U.tl(Svc.store(p.storeId).shippingFee)}${p.fastDelivery ? ' · 🚀 Hızlı' : ''}</td>`)}
        ${row('Satış adedi', p => `<td class="num">${U.num(p.sold)}</td>`)}
        ${specKeys.map(k => row(k, p => `<td class="small">${esc(p.specs[k] || '—')}</td>`)).join('')}
        ${row('', p => `<td>${p.variants ? `<a class="btn btn-primary btn-sm" href="#/p/${p.id}">Seçenekleri gör</a>` : `<button class="btn btn-primary btn-sm" data-add="${p.id}">Sepete ekle</button>`}</td>`)}
      </tbody></table></div></div>`;
    return {
      title: 'Karşılaştır', html, mount(main) {
        U.$('#clr', main).onclick = () => { Store.set('carsim_cmp', []); Router.refresh(); };
        main.addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (b) { Svc.toggleCmp(+b.dataset.rm); Router.refresh(); } });
      }
    };
  };

  P.categories = () => ({
    title: 'Kategoriler', html: `<div class="wrap section"><h1 style="margin-bottom:16px">Kategoriler</h1><div class="stack">${Svc.cats().map(c => `<details class="card"><summary class="row" style="padding:14px 16px;cursor:pointer;list-style:none"><span style="font-size:1.6rem">${c.icon}</span><b class="grow">${esc(c.name)}</b><span class="muted">›</span></summary><div style="padding:0 16px 14px" class="row"><a class="chip on" href="#/search?cat=${c.id}">Tümü</a>${c.subs.map(s => `<a class="chip" href="#/search?cat=${c.id}&sub=${encodeURIComponent(s)}">${esc(s)}</a>`).join('')}</div></details>`).join('')}</div></div>`
  });

  /* =============== GİRİŞ / KAYIT =============== */
  P.login = (_, q) => {
    const next = q.next || '/';
    const demos = [['musteri@markabahcem.com', 'musteri123', '🛍', 'Müşteri', 'Ayşe Yılmaz · sipariş, favori, alarm verisi hazır', 'var(--info-soft)'], ['satici@markabahcem.com', 'satici123', '🏪', 'Satıcı', 'Güven Yapı Market · satıcı paneli', 'var(--brand-soft)'], ['admin@markabahcem.com', 'admin123', '🛡', 'Yönetici', 'Platform yönetim paneli', 'var(--teal-soft)']];
    const html = `<div class="wrap"><div class="auth"><div class="card stack lg">
      <div class="stack" style="gap:4px;text-align:center"><h1>Tekrar hoş geldin</h1><p class="muted small">Hesabına giriş yap ya da bir demo hesabı seç</p></div>
      <div class="demo-accs">${demos.map(d => `<button data-demo="${d[0]}|${d[1]}"><span class="av" style="background:${d[5]}">${d[2]}</span><span class="grow"><b>${d[3]} olarak dene</b><div class="xs muted">${d[4]}</div></span><span class="muted">→</span></button>`).join('')}</div>
      <div class="row" style="gap:10px"><hr class="divider grow"><span class="xs muted">veya e-posta ile</span><hr class="divider grow"></div>
      <form class="stack" id="lf"><div class="field"><label for="le">E-posta</label><input class="input" id="le" type="email" autocomplete="email" required></div><div class="field"><label for="lp">Şifre</label><input class="input" id="lp" type="password" autocomplete="current-password" required></div><span class="small bad" id="lerr"></span><button class="btn btn-primary btn-lg">Giriş yap</button></form>
      <p class="small" style="text-align:center">Hesabın yok mu? <a class="brand bold" href="#/register?next=${encodeURIComponent(next)}">Üye ol</a></p>
    </div></div></div>`;
    const done = u => { C.toast('Hoş geldin, ' + u.name.split(' ')[0] + '!', { icon: '👋' }); go(q.next ? next : u.role === 'seller' ? '/seller' : u.role === 'admin' ? '/admin' : '/'); };
    return {
      title: 'Giriş yap', html, mount(main) {
        U.$('#lf', main).onsubmit = e => { e.preventDefault(); const r = Auth.login(U.$('#le').value, U.$('#lp').value); if (r.error) U.$('#lerr').textContent = r.error; else done(r.user); };
        main.addEventListener('click', e => { const b = e.target.closest('[data-demo]'); if (!b) return; const [em, pw] = b.dataset.demo.split('|'); const r = Auth.login(em, pw); if (r.user) done(r.user); else U.$('#lerr').textContent = r.error; });
      }
    };
  };
  P.register = (_, q) => ({
    title: 'Üye ol', html: `<div class="wrap"><div class="auth"><div class="card stack lg"><div class="stack" style="gap:4px;text-align:center"><h1>MarkaBahçem'e katıl</h1><p class="muted small">İlk siparişinde 100 TL indirim kazan</p></div>
      <form class="stack" id="rf"><div class="field"><label for="rn">Ad soyad</label><input class="input" id="rn" required autocomplete="name"></div><div class="field"><label for="re">E-posta</label><input class="input" id="re" type="email" required autocomplete="email"></div><div class="field"><label for="rph">Telefon</label><input class="input" id="rph" autocomplete="tel"></div><div class="field"><label for="rp">Şifre</label><input class="input" id="rp" type="password" required minlength="6" autocomplete="new-password"><span class="hint">En az 6 karakter</span></div>
      <label class="check small"><input type="checkbox" id="rsms"> Kampanya ve fırsatlardan SMS ile haberdar olmak istiyorum (ticari ileti izni).</label><label class="check small"><input type="checkbox" required checked> Üyelik sözleşmesini ve KVKK aydınlatma metnini okudum.</label><span class="small bad" id="rerr"></span><button class="btn btn-primary btn-lg">Üye ol</button></form>
      <p class="small" style="text-align:center">Zaten üye misin? <a class="brand bold" href="#/login">Giriş yap</a></p></div></div></div>`,
    mount(main) {
      U.$('#rf', main).onsubmit = async e => {
        e.preventDefault();
        const phone = U.$('#rph').value.trim();
        let verified = false;
        if (C.Sms && C.Sms.otpRequired()) {
          if (!/^0?5\d{9}$/.test(phone.replace(/\D/g, '').replace(/^90/, ''))) { U.$('#rerr').textContent = 'Telefon doğrulaması için geçerli bir cep telefonu gir (05XX XXX XX XX).'; return; }
          if (!(await C.Sms.verifyPhone(phone))) { U.$('#rerr').textContent = 'Telefon doğrulanmadan üyelik tamamlanamaz.'; return; }
          verified = true;
        }
        const r = Auth.register({ name: U.$('#rn').value.trim(), email: U.$('#re').value.trim(), phone, password: U.$('#rp').value });
        if (r.error) { U.$('#rerr').textContent = r.error; return; }
        r.user.smsConsent = U.$('#rsms').checked; r.user.phoneVerified = verified; DB.save();
        C.toast('Hesabın oluşturuldu 🎉'); go(q.next || '/');
      };
    }
  });

  /* =============== SATICI OL =============== */
  P.sell = () => {
    const u = Auth.user();
    const cats = Svc.cats();
    const myStore = u && u.storeId ? Svc.store(u.storeId) : null;
    const logos = ['🏪', '🎨', '🧵', '👟', '📱', '🌸', '🫒', '📚', '🧸', '🏡', '⚡', '🛠', '💎', '☕'];
    const colors = ['#f25c05', '#0e7c74', '#2459d6', '#c2418a', '#a16207', '#15803d', '#7c5cd6', '#1a1815'];
    const html = `<div class="wrap section stack lg">
      <div class="sell-hero"><div class="stack lg"><div class="eyebrow" style="color:var(--brand)">MarkaBahçem'de satış yap</div><h1>Mağazanı <em>10 dakikada</em> aç, Türkiye'nin her yerine sat.</h1>
        <p style="opacity:.8">Başvurunu yap, onaylandığında ürünlerini yükle. Siparişler, kargo, ödeme ve raporlama tek panelde. İlk 3 ay komisyon yok.</p>
        <div class="row">${myStore ? `<a class="btn btn-primary btn-lg" href="#/seller">Satıcı paneline git →</a>` : '<a class="btn btn-primary btn-lg" href="#apply" id="toApply">Başvuruya başla</a>'}</div></div>
        <div class="calc" id="calc"><b>Kazanç hesaplayıcı</b>
          <div class="field"><label for="cCat">Kategori</label><select class="select" id="cCat">${cats.map(c => `<option value="${c.commission}">${esc(c.name)} · %${c.commission} komisyon</option>`).join('')}</select></div>
          <div class="field"><label for="cSales">Aylık satış tutarı: <b id="cSalesV"></b></label><input type="range" id="cSales" min="10000" max="1000000" step="10000" value="150000" style="accent-color:var(--brand)"></div>
          <div class="row between"><span class="muted">Komisyon (ilk 3 ay)</span><b class="ok">0 TL</b></div><div class="row between"><span class="muted">Sonraki aylarda komisyon</span><b id="cCom"></b></div><div class="row between"><span class="muted">Yıllık net kazanç tahmini</span><b class="brand" style="font-size:1.3rem" id="cNet"></b></div></div></div>
      <div class="sell-steps">${[['Başvur', 'Mağaza ve şirket bilgilerini gir, 2 dakika sürer.'], ['Onay al', 'Ekibimiz başvurunu genelde 24 saat içinde onaylar.'], ['Ürünlerini yükle', 'Toplu fiyat, stok ve akıllı açıklama üretici ile hızlıca listele.'], ['Satışa başla', 'Siparişleri panelden yönet, hakedişin 14 günde bir hesabında.']].map((s, i) => `<div class="card"><span class="n">${i + 1}</span><b>${s[0]}</b><span class="small muted">${s[1]}</span></div>`).join('')}</div>
      <div class="g3">${[['📊', 'Akıllı satıcı paneli', 'Stok bitiş tahmini, rakip fiyat uyarısı ve en yoğun satış saatin gibi öneriler otomatik gelir.'], ['🎨', 'Kendi mağaza vitrinin', 'Logo, kapak, renk, banner ve duyurularla mağazanı markana göre tasarla.'], ['🎟', 'Kampanya araçları', 'Mağazana özel kupon, indirim ve kargo bedava eşiği tanımla.']].map(x => `<div class="card card-pad stack" style="gap:6px"><span style="font-size:1.8rem">${x[0]}</span><b>${x[1]}</b><span class="small muted">${x[2]}</span></div>`).join('')}</div>
      ${myStore ? `<div class="insight ${myStore.status === 'active' ? 'good' : 'warnish'}"><span class="ii">🏪</span><div><b>${esc(myStore.name)}</b> mağazan: ${Svc.STORE_STATUS[myStore.status][0]}. <a class="bold" href="#/seller">Panele git →</a></div></div>` : `
      <form class="card card-pad stack lg" id="apply"><div><h2>Mağaza başvurusu</h2><p class="small muted">Bilgilerin yalnızca doğrulama için kullanılır.</p></div>
        ${u ? `<div class="insight info"><span class="ii">👤</span><div class="small"><b>${esc(u.name)}</b> hesabınla başvuruyorsun.</div></div>` : `<div class="form-grid"><div class="field"><label for="ap-n">Ad soyad</label><input class="input" id="ap-n" required></div><div class="field"><label for="ap-e">E-posta</label><input class="input" id="ap-e" type="email" required></div><div class="field"><label for="ap-pw">Şifre</label><input class="input" id="ap-pw" type="password" minlength="6" required></div></div>`}
        <div class="form-grid">
          <div class="field"><label for="ap-s">Mağaza adı</label><input class="input" id="ap-s" required placeholder="Örn: Güven Yapı Market"></div>
          <div class="field"><label for="ap-c">Ana kategori</label><select class="select" id="ap-c">${cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
          <div class="field"><label for="ap-city">Şehir</label><input class="input" id="ap-city" value="İstanbul"></div>
          <div class="field"><label for="ap-tax">Vergi / TC kimlik no</label><input class="input" id="ap-tax" required inputmode="numeric" placeholder="10 veya 11 hane"></div>
          <div class="field"><label for="ap-iban">IBAN</label><input class="input" id="ap-iban" required placeholder="TR00 0000 …"></div>
          <div class="field"><label for="ap-ph">Mağaza telefonu</label><input class="input" id="ap-ph" placeholder="0850 …"></div>
          <div class="field full"><label for="ap-d">Mağazanı birkaç cümleyle anlat</label><textarea class="textarea" id="ap-d" placeholder="Ne satıyorsun, seni farklı kılan ne?"></textarea></div>
        </div>
        <div class="g2e"><div class="field"><span class="lbl">Logo simgesi</span><div class="row" id="ap-logo" style="gap:6px">${logos.map((l, i) => `<button type="button" class="chip ${i === 0 ? 'on' : ''}" data-logo="${l}" style="font-size:1.1rem">${l}</button>`).join('')}</div></div>
          <div class="field"><span class="lbl">Marka rengi</span><div class="color-row" id="ap-color">${colors.map((c, i) => `<button type="button" class="${i === 0 ? 'on' : ''}" data-color="${c}" style="background:${c}" aria-label="Renk ${c}"></button>`).join('')}</div></div></div>
        <label class="check small"><input type="checkbox" required checked> Satıcı sözleşmesini ve komisyon koşullarını kabul ediyorum.</label>
        <span class="small bad" id="ap-err"></span>
        <button class="btn btn-primary btn-lg" style="align-self:flex-start">Başvuruyu gönder</button>
      </form>`}
    </div>`;
    return {
      title: 'Satıcı ol', html, mount(main) {
        const calc = () => { const rate = +U.$('#cCat').value, s = +U.$('#cSales').value; U.$('#cSalesV').textContent = U.tl0(s); U.$('#cCom').textContent = U.tl0(s * rate / 100) + '/ay'; U.$('#cNet').textContent = U.tl0(s * 12 - s * rate / 100 * 9 - s * 12 * 0.55); };
        U.$('#cCat', main).onchange = calc; U.$('#cSales', main).oninput = calc; calc();
        const ta = U.$('#toApply', main); ta && (ta.onclick = e => { e.preventDefault(); U.$('#apply').scrollIntoView({ behavior: 'smooth' }); });
        const f = U.$('#apply', main); if (!f) return;
        let logo = logos[0], color = colors[0];
        U.$('#ap-logo', main).onclick = e => { const b = e.target.closest('[data-logo]'); if (!b) return; logo = b.dataset.logo; U.$$('[data-logo]').forEach(x => x.classList.toggle('on', x === b)); };
        U.$('#ap-color', main).onclick = e => { const b = e.target.closest('[data-color]'); if (!b) return; color = b.dataset.color; U.$$('[data-color]').forEach(x => x.classList.toggle('on', x === b)); };
        f.onsubmit = e => {
          e.preventDefault();
          const err = t => { U.$('#ap-err').textContent = t; };
          let user = Auth.user();
          if (!user) { const r = Auth.register({ name: U.$('#ap-n').value.trim(), email: U.$('#ap-e').value.trim(), password: U.$('#ap-pw').value }); if (r.error) return err(r.error); user = r.user; }
          const name = U.$('#ap-s').value.trim();
          if (DB.all('stores').some(s => U.lower(s.name) === U.lower(name))) return err('Bu isimde bir mağaza zaten var.');
          if (!/^\d{10,11}$/.test(U.$('#ap-tax').value.replace(/\s/g, ''))) return err('Vergi / TC kimlik no 10 veya 11 haneli olmalı.');
          const cat = +U.$('#ap-c').value;
          const dark = c => c; // kapak için aynı rengin koyu tonu yerine iki durak
          const st = DB.insert('stores', { ownerId: user.id, name, slug: U.slug(name), key: U.slug(name), cats: [cat], appCategory: cat, logo, logoImg: '', color, cover: [dark(color), '#1a1815'], coverImg: '', description: U.$('#ap-d').value.trim() || name + ' MarkaBahçem mağazası', city: U.$('#ap-city').value.trim(), status: 'pending', shippingFee: 39.99, freeShipOver: 400, followers: [], followerBase: 0, taxNo: U.$('#ap-tax').value.trim(), iban: U.$('#ap-iban').value.trim(), phone: U.$('#ap-ph').value.trim(), shipDays: 2, official: false, banners: [], announcement: '' });
          user.role = 'seller'; user.storeId = st.id; DB.save();
          DB.where('users', x => x.role === 'admin').forEach(a => Svc.notify(a.id, `🏪 Yeni mağaza başvurusu: ${name}`, '/admin/sellers'));
          C.toast('Başvurun alındı! Onaylanınca bildirim alacaksın.', { icon: '🎉', ms: 4000 });
          go('/seller');
        };
      }
    };
  };

  P.help = () => {
    const faq = [['Siparişim ne zaman gelir?', 'Her ürün sayfasında satıcının kargoya teslim süresine göre hesaplanan tahmini teslimat tarihi yazar. Siparişlerim sayfasından her paketi ayrı ayrı takip edebilirsin.'], ['Nasıl iade ederim?', 'Teslimattan sonraki 15 gün içinde Siparişlerim › Sipariş detayı › "İade talebi oluştur" adımlarını izle. İade kargo kodun otomatik oluşur, ücret kargo satıcıya ulaştıktan sonra 1-3 iş gününde kartına yansır.'], ['Fiyat analizi nedir?', 'MarkaBahçem her ürünün fiyatını 90 gün boyunca kaydeder. Ürün sayfasında fiyatın son 90 günün en düşüğü mü, ortalamanın üstünde mi olduğunu görürsün. Üstü çizili fiyat bu sürede hiç uygulanmadıysa seni uyarırız.'], ['Farklı mağazalardan aldığım ürünlerin kargosu nasıl hesaplanır?', 'Her mağaza kendi kargo ücretini ve ücretsiz kargo eşiğini belirler. Sepetinde her mağaza için eşiğe ne kadar kaldığını ve eşiği tamamlayacak ürün önerilerini gösteririz.'], ['Kupon nasıl kullanılır?', 'Sepet sayfasındaki kupon alanına kodu yaz ya da ürün ve mağaza sayfalarındaki "Kuponu al" butonuna bas. Kupon, koşulları sağlandığında otomatik uygulanır.'], ['Satıcı olmak için ne gerekir?', 'Vergi numarası veya TC kimlik numarası ve bir IBAN yeterli. "Satıcı ol" sayfasından başvurabilirsin.']];
    return { title: 'Yardım', html: `<div class="wrap section" style="max-width:820px"><h1 style="margin-bottom:6px">Yardım merkezi</h1><p class="muted" style="margin-bottom:20px">Sık sorulan sorular. Aradığını bulamazsan sağ alttaki asistana yazabilirsin.</p><div class="stack">${faq.map(([q, a]) => `<details class="card"><summary style="padding:16px;cursor:pointer;font-weight:700">${esc(q)}</summary><p style="padding:0 16px 16px;line-height:1.7" class="muted">${esc(a)}</p></details>`).join('')}</div></div>` };
  };

  P.notFound = () => ({ title: 'Sayfa bulunamadı', html: `<div class="wrap">${K.empty('🧭', 'Aradığın sayfayı bulamadık', 'Adres değişmiş ya da sayfa kaldırılmış olabilir.', '<a class="btn btn-primary" href="#/">Ana sayfaya dön</a>')}</div>` });
})();
