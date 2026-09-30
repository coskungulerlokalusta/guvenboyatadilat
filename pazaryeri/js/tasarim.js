/* MarkaBahçem — vitrin tasarım katmanı: stüdyo görseller, editoryal ana sayfa, mikro etkileşimler */
(function () {
  'use strict';
  const C = window.Carsim;
  const { U, Svc, K, Auth, DB, Router, Store } = C;
  const esc = U.esc;
  const P = C.Pages;
  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Stüdyo ürün görseli ---------- */
  const baseImg = K.img;
  K.img = function (spec, o = {}) {
    if (spec && typeof spec === 'object' && !spec.url && spec.e) {
      return `<div class="pimg studio" style="--c1:${esc(spec.c1)};--c2:${esc(spec.c2)}" role="img" aria-label="${esc(o.label || '')}"><span class="floor"></span><span class="refl" aria-hidden="true">${esc(spec.e)}</span><span class="em">${esc(spec.e)}</span><span class="shine"></span></div>`;
    }
    return baseImg.call(K, spec, o);
  };

  /* Kartta ikinci açı: üzerine gelince farklı ışıkta ikinci görsel */
  const baseCard = K.card;
  K.card = function (p, o) {
    const html = baseCard.call(K, p, o);
    const alt = p.images[1] || (p.images[0] && typeof p.images[0] === 'object' ? Object.assign({}, p.images[0], { c1: '#f6f4f1', c2: '#e3ded6' }) : null);
    if (!alt) return html;
    return html.replace('<div class="tags">', K.img(alt).replace('class="pimg', 'class="pimg alt') + '<div class="tags">');
  };

  /* ---------- Kategori renkleri (fotoğraf zeminleri) ---------- */
  const CAT_BG = { 1: ['#fde2ec', '#f7a8c4'], 2: ['#dfeefd', '#9cc6f3'], 3: ['#fff4d6', '#ffd36b'], 4: ['#daf2ee', '#8fd3c7'], 5: ['#eaf6dc', '#b6de8a'], 6: ['#f1e3f7', '#d3a6e6'], 7: ['#ffecd9', '#ffb877'], 8: ['#e3e6fb', '#a4aef0'], 9: ['#d9f4f7', '#86d9e4'], 10: ['#f1e9e4', '#cdb8ab'], 11: ['#f3f1ee', '#cbc5bd'], 12: ['#ffe5dc', '#ff9f80'] };
  const catBg = id => CAT_BG[id] || ['#f3f1ee', '#d9d3ca'];

  const sparkPct = d => Math.min(100, Math.round(d.claimed / d.stockLimit * 100));

  /* ---------- Yeni ana sayfa ---------- */
  P.home = () => {
    const hero = DB.where('banners', b => b.active && b.place === 'hero').sort((a, b) => a.order - b.order);
    const side = DB.where('banners', b => b.active && b.place === 'side').sort((a, b) => a.order - b.order).slice(0, 2);
    const live = Svc.live();
    const best = live.slice().sort((a, b) => b.sold - a.sold);
    const deals = DB.all('deals').map(d => ({ d, p: Svc.product(d.productId) })).filter(x => Svc.isLive(x.p));
    const rec = Svc.recommend(10);
    const viewed = Svc.viewed().slice(0, 12);
    const stores = DB.where('stores', s => s.status === 'active');
    const u = Auth.user();
    const followed = u ? stores.filter(s => s.followers.includes(u.id)) : [];
    const storyStores = followed.concat(stores.filter(s => !followed.includes(s)));
    const cats = Svc.cats();
    const coupons = DB.where('coupons', c => c.active && !c.storeId && c.expiresAt > Date.now()).slice(0, 3);
    const now = Date.now();
    const dropped = live.filter(p => { const h = p.priceHistory || []; if (h.length < 2) return false; const [t, v] = h[h.length - 1]; return t > now - 21 * U.DAY && v < h[h.length - 2][1] * 0.97; }).sort((a, b) => b.sold - a.sold).slice(0, 12);
    const brands = U.uniq(best.map(p => p.brand)).slice(0, 18);
    const spot = stores.slice().sort((a, b) => Svc.followerCount(b) - Svc.followerCount(a))[new Date().getDate() % Math.min(4, stores.length)];
    const spotProds = spot ? live.filter(p => p.storeId === spot.id).sort((a, b) => b.sold - a.sold).slice(0, 4) : [];
    const catTop = id => best.filter(p => p.categoryId === id);
    const pickArt = (link) => { const m = /cat=(\d+)/.exec(link || ''); const pool = m ? catTop(+m[1]) : best; return pool.slice(0, 4); };

    const stage = `<div class="stage" id="stage">
      ${hero.map((b, i) => {
        const arts = pickArt(b.link);
        const chip = arts[0];
        return `<div class="st-slide ${i === 0 ? 'on' : ''}" data-i="${i}">
          <div class="st-bg" style="--bg1:${b.img ? '#111' : `linear-gradient(125deg,${esc(b.c1)},${esc(b.c2)})`};--b1:${esc(b.c2)};--b2:${i % 2 ? '#ff5e7e' : '#ffb347'}"></div>
          ${b.img ? `<div class="st-img" style="background-image:url('${esc(b.img)}')"></div><div class="st-shade"></div>` : '<div class="st-grain"></div>'}
          <div class="st-copy">
            ${b.kicker ? `<span class="st-kick"><i></i>${esc(b.kicker)}</span>` : ''}
            <h2>${esc(b.title)}</h2>
            <p>${esc(b.subtitle)}</p>
            <div class="st-cta">${b.cta ? `<a class="btn btn-w" href="#${esc(b.link || '/')}">${esc(b.cta)} →</a>` : ''}<a class="btn btn-g" href="#/deals">⚡ Flaş fırsatlar</a></div>
          </div>
          ${b.img ? '<div></div>' : `<div class="st-art" aria-hidden="true"><div class="ring"></div>
            <div class="orb o1" data-depth="18"><span>${esc(b.emoji)}</span></div>
            ${arts[1] ? `<div class="orb o2" data-depth="36"><span>${esc(arts[1].images[0].e || '✨')}</span></div>` : ''}
            ${arts[2] ? `<div class="orb o3" data-depth="28"><span>${esc(arts[2].images[0].e || '🛍️')}</span></div>` : ''}
            ${arts[3] ? `<div class="orb o4" data-depth="44"><span>${esc(arts[3].images[0].e || '🎁')}</span></div>` : ''}
            ${chip ? `<a class="price-chip" href="#/p/${chip.id}"><span>${esc(chip.brand)}</span><b>${U.tl(Svc.priceInfo(chip).price)}</b><span class="xs">${esc(chip.title.slice(0, 26))}</span></a>` : ''}
          </div>`}
        </div>`; }).join('')}
      ${hero.length > 1 ? `<div class="st-nav"><button data-nav="-1" aria-label="Önceki">‹</button><button data-nav="1" aria-label="Sonraki">›</button></div><div class="st-bars">${hero.map((_, i) => `<button data-bar="${i}" aria-label="${i + 1}. kampanya"><i></i></button>`).join('')}</div>` : ''}
    </div>`;

    const sideTiles = side.map(b => `<a class="promo-tile" href="#${esc(b.link)}" style="background:${K.bannerBg(b)}"><span class="pt-art" aria-hidden="true">${esc(b.emoji)}</span><b>${esc(b.title)}</b><span class="small">${esc(b.subtitle)}</span><span class="go">Keşfet →</span></a>`).join('');

    const bentoOrder = [7, 1, 8, 6, 4, 2, 12, 11, 3, 9, 5, 10];
    const bento = bentoOrder.map(id => cats.find(c => c.id === id)).filter(Boolean).slice(0, 10).map((c, i) => {
      const [c1, c2] = catBg(c.id);
      const top = catTop(c.id);
      const n = live.filter(p => p.categoryId === c.id).length;
      const cls = i === 0 ? 'big' : i === 3 || i === 6 ? 'wide' : '';
      return `<a href="#/search?cat=${c.id}" class="${cls}" style="--c1:${c1};--c2:${c2}"><span class="bg"></span><div><b>${esc(c.name)}</b><br><small>${U.num(n)} ürün</small></div><span class="arr">→</span><span class="arts" aria-hidden="true"><span>${c.icon}</span>${top[0] && top[0].images[0].e ? `<span>${esc(top[0].images[0].e)}</span>` : ''}</span></a>`;
    }).join('');

    const edits = [
      { k: 'Koleksiyon', t: 'Sonbahar dolabı', s: 'Ceketler, botlar ve triko: sezona hazır ol.', link: '/search?cat=1', cats: [1, 2, 7], bg: 'linear-gradient(150deg,#3b1d12,#9a3412 55%,#f25c05)' },
      { k: 'Rehber', t: 'Hediye bulucu', s: 'Parfüm, takı ve saatte en sevilenler.', link: '/search?cat=11', cats: [6, 11], bg: 'linear-gradient(150deg,#2a0f24,#831843 55%,#db2777)' },
      { k: 'Evini yenile', t: 'Boya, dekor, mutfak', s: 'Usta fiyatlarıyla evine yeni bir hava.', link: '/search?cat=4', cats: [4, 12], bg: 'linear-gradient(150deg,#0b2a27,#115e59 55%,#14b8a6)' }
    ].map(e => { const ps = best.filter(p => e.cats.includes(p.categoryId)).slice(0, 4); return `<a class="edit" href="#${e.link}"><span class="eb" style="background:${e.bg}"></span><div class="collage">${ps.map(p => `<div>${K.img(p.images[0])}</div>`).join('')}</div><div class="et"><span class="eyebrow">${e.k}</span><b>${e.t}</b><span>${e.s}</span></div></a>`; }).join('');

    const html = `
    <div class="wrap section" style="padding-bottom:10px"><div class="stage-grid">${stage}<div class="stage-side">${sideTiles}</div></div></div>

    <div class="wrap" style="padding-block:8px 4px"><div class="story-rail" aria-label="Mağazalar">
      ${storyStores.map(s => `<a class="story" href="#/store/${s.id}"><div class="ring"><div style="background:${esc(s.color)};color:#fff">${s.logoImg ? `<img src="${esc(s.logoImg)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : esc(s.logo)}</div></div><span>${esc(s.name)}</span></a>`).join('')}
    </div></div>

    <div class="wrap section"><div class="trust">
      <div><span class="ti">🚚</span><div><b>Ertesi gün kapında</b><span>Hızlı teslimat etiketli ürünlerde</span></div></div>
      <div><span class="ti">↩️</span><div><b>15 gün ücretsiz iade</b><span>Kargo kodu otomatik oluşur</span></div></div>
      <div><span class="ti">📉</span><div><b>Şeffaf fiyat</b><span>90 günlük fiyat geçmişi her üründe</span></div></div>
      <div><span class="ti">🔒</span><div><b>Güvenli ödeme</b><span>3D Secure · 12 taksit</span></div></div>
    </div></div>

    <div class="wrap section"><div class="sec-head"><div><div class="eyebrow">Keşfet</div><h2>Ne arıyorsun?</h2></div><a href="#/categories">Tüm kategoriler →</a></div><div class="bento">${bento}</div></div>

    ${deals.length ? `<div class="wrap section"><div class="flash2">
      <div class="fh"><div><div class="eyebrow" style="color:#ffb38a">Sadece bugün · stokla sınırlı</div><h2>⚡ <span>Flaş fırsatlar</span></h2></div><div class="row" style="gap:14px">${K.countdown(deals[0].d.endsAt)}<a href="#/deals">Tümü →</a></div></div>
      <div class="hscroll">${deals.map(({ d, p }) => `<div class="stack" style="gap:0">${K.card(p)}<div class="deal-meter"><i style="width:${sparkPct(d)}%"></i></div><span class="deal-left" style="color:rgba(255,255,255,.7);margin-top:4px">%${sparkPct(d)} satıldı · son ${d.stockLimit - d.claimed}</span></div>`).join('')}</div>
    </div></div>` : ''}

    <div class="marquee" aria-label="Markalar"><div class="track">${brands.concat(brands).map(b => `<a href="#/search?q=${encodeURIComponent(b)}"><i>✦</i>${esc(b)}</a>`).join('')}</div></div>

    <div class="wrap section"><div class="sec-head"><div><div class="eyebrow">${rec.personalized ? 'Gezdiklerine göre' : 'Editörün seçimi'}</div><h2>${rec.personalized ? 'Sana özel öneriler' : 'Günün öne çıkanları'}</h2></div><a href="#/search?sort=rec">Daha fazla →</a></div>${K.grid(rec.list.slice(0, 10))}</div>

    <div class="wrap section"><div class="sec-head"><div><div class="eyebrow">İlham</div><h2>Koleksiyonlar</h2></div></div><div class="edits">${edits}</div></div>

    ${coupons.length ? `<div class="wrap"><div class="promo-band">${coupons.map(c => `<div class="coupon"><div class="cv">${c.type === 'percent' ? '%' + c.value : U.tl0(c.value)}</div><div class="cb"><b>${esc(c.title)}</b><span class="xs muted">${U.tl0(c.minTotal)} ve üzeri · son ${Math.ceil((c.expiresAt - Date.now()) / U.DAY)} gün</span><div class="row" style="gap:8px"><code>${esc(c.code)}</code><button class="btn btn-sm btn-soft" data-copy="${esc(c.code)}">Kuponu al</button></div></div></div>`).join('')}</div></div>` : ''}

    <div class="wrap section"><div class="sec-head"><div><div class="eyebrow">Trend</div><h2>Kategorilerde çok satanlar</h2></div><div class="seg" id="bsSeg">${[8, 7, 6, 4, 12, 1].map((id, i) => `<button class="${i === 0 ? 'on' : ''}" data-cat="${id}">${esc(Svc.cat(id).name)}</button>`).join('')}</div></div><div id="bsList">${K.rail(Svc.bestSellers(10, 8))}</div></div>

    ${spot ? `<div class="wrap section"><div class="sec-head"><div><div class="eyebrow">Haftanın mağazası</div><h2>${esc(spot.name)} vitrini</h2></div><a href="#/stores">Tüm mağazalar →</a></div>
      <div class="spot"><a class="sc" href="#/store/${spot.id}"><span class="sb" style="background:${spot.coverImg ? `url('${esc(spot.coverImg)}') center/cover` : `linear-gradient(140deg,${esc(spot.cover[0])},${esc(spot.cover[1])})`}"></span>
        <div class="row nowrap">${K.storeAvatar(spot, 72)}<div><h3>${esc(spot.name)}</h3><span class="small" style="opacity:.85">${esc(spot.city)}${spot.official ? ' · ✔︎ Resmi satıcı' : ''}</span></div></div>
        <p class="small" style="opacity:.9">${esc(spot.description)}</p>
        <div class="ss"><div><b>${U.num(Svc.followerCount(spot))}</b>takipçi</div><div><b>${Svc.storeScore(spot).toFixed(1).replace('.', ',')}</b>mağaza puanı</div><div><b>${live.filter(p => p.storeId === spot.id).length}</b>ürün</div></div>
        <span class="btn">Mağazaya git →</span></a>
        <div class="pgrid" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr))">${spotProds.map(p => K.card(p, { showStore: false })).join('')}</div></div></div>` : ''}

    ${dropped.length ? `<div class="wrap section"><div class="sec-head"><div><div class="eyebrow">Fiyat takibi</div><h2>📉 Fiyatı yeni düşenler</h2></div></div>${K.rail(dropped)}</div>` : ''}
    ${viewed.length ? `<div class="wrap section"><div class="sec-head"><div><div class="eyebrow">Kaldığın yerden</div><h2>Son gezdiklerin</h2></div></div>${K.rail(viewed)}</div>` : ''}

    <div class="wrap section"><div class="sell-hero">
      <div class="stack lg"><div class="eyebrow" style="color:var(--brand)">MarkaBahçem satıcı programı</div><h1>Ürünlerini <em>milyonlarca</em> alıcıyla buluştur.</h1><p style="opacity:.8">Mağazanı 10 dakikada aç, ilk 3 ay komisyonsuz sat. Akıllı satıcı paneli stok, fiyat ve kampanyalarını senin yerine takip etsin.</p><div class="row"><a class="btn btn-primary btn-lg" href="#/sell">Hemen mağaza aç</a><a class="btn btn-lg" style="background:transparent;color:var(--bg);border-color:rgba(255,255,255,.3)" href="#/login">Demo satıcı paneli</a></div></div>
      <div class="calc"><b>Bu ay platformda</b><div class="row between"><span class="muted">Aktif mağaza</span><b class="num">${U.num(stores.length)}</b></div><div class="row between"><span class="muted">Yayındaki ürün</span><b class="num">${U.num(live.length)}</b></div><div class="row between"><span class="muted">Ortalama kargoya teslim</span><b>1,2 gün</b></div></div>
    </div></div>`;

    return {
      title: 'Alışverişin yeni adresi', html, mount(main) {
        const slides = U.$$('.st-slide', main), bars = U.$$('[data-bar]', main);
        let i = 0, timer = null, paused = false;
        const DUR = 6500;
        const show = n => {
          i = (n + slides.length) % slides.length;
          slides.forEach((s, k) => s.classList.toggle('on', k === i));
          bars.forEach((b, k) => { b.classList.remove('on', 'done'); if (k < i) b.classList.add('done'); });
          if (bars[i]) { void bars[i].offsetWidth; bars[i].style.setProperty('--dur', DUR + 'ms'); bars[i].classList.add('on'); }
          clearTimeout(timer); if (!reduced() && slides.length > 1) timer = setTimeout(() => { if (!paused) show(i + 1); else loop(); }, DUR);
        };
        const loop = () => { clearTimeout(timer); timer = setTimeout(() => { if (!paused) show(i + 1); else loop(); }, 800); };
        show(0);
        const stageEl = U.$('#stage', main);
        if (stageEl) {
          stageEl.addEventListener('click', e => { const b = e.target.closest('[data-bar]'); if (b) show(+b.dataset.bar); const n = e.target.closest('[data-nav]'); if (n) show(i + +n.dataset.nav); });
          stageEl.addEventListener('mouseenter', () => { paused = true; U.$$('.st-bars button.on i', stageEl).forEach(x => x.style.animationPlayState = 'paused'); });
          stageEl.addEventListener('mouseleave', () => { paused = false; U.$$('.st-bars button.on i', stageEl).forEach(x => x.style.animationPlayState = 'running'); });
          if (!reduced()) stageEl.addEventListener('mousemove', e => {
            const r = stageEl.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
            U.$$('.st-slide.on .orb', stageEl).forEach(o => { const d = +o.dataset.depth || 20; o.style.transform = `translate(${-x * d}px, ${-y * d}px)`; });
          });
          let sx = null;
          stageEl.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
          stageEl.addEventListener('touchend', e => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 40) show(i + (dx < 0 ? 1 : -1)); sx = null; });
        }
        U.$('#bsSeg', main).onclick = e => { const b = e.target.closest('[data-cat]'); if (!b) return; U.$$('#bsSeg button').forEach(x => x.classList.toggle('on', x === b)); U.$('#bsList').innerHTML = K.rail(Svc.bestSellers(10, +b.dataset.cat)); };
        main.addEventListener('click', e => { const c = e.target.closest('[data-copy]'); if (c) { U.copy(c.dataset.copy); Svc.setCoupon(c.dataset.copy); c.textContent = '✓ Sepete tanımlandı'; } });
        return () => clearTimeout(timer);
      }
    };
  };

  /* ---------- Global mikro etkileşimler ---------- */
  // Kaydırınca küçülen cam başlık
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => { const h = U.$('.hdr'); if (h) h.classList.toggle('scrolled', window.scrollY > 30); ticking = false; });
  }, { passive: true });

  // Kartlarda 3B eğilme
  let tiltEl = null;
  document.addEventListener('mousemove', e => {
    if (reduced()) return;
    const card = e.target.closest && e.target.closest('.pcard');
    if (tiltEl && tiltEl !== card) { tiltEl.style.removeProperty('--rx'); tiltEl.style.removeProperty('--ry'); }
    tiltEl = card;
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--ry', ((e.clientX - r.left) / r.width - .5) * 8 + 'deg');
    card.style.setProperty('--rx', (.5 - (e.clientY - r.top) / r.height) * 6 + 'deg');
  }, { passive: true });

  // Favori kalbi "pop"
  document.addEventListener('click', e => { const f = e.target.closest && e.target.closest('[data-fav]'); if (f) { f.classList.remove('pop'); void f.offsetWidth; f.classList.add('pop'); } }, true);

  // Ürün sayfasında büyüteç
  document.addEventListener('mousemove', e => {
    const m = e.target.closest && e.target.closest('.gallery .main');
    U.$$('.gallery .main.zoom').forEach(x => { if (x !== m) x.classList.remove('zoom'); });
    if (!m || reduced()) return;
    const r = m.getBoundingClientRect();
    m.classList.add('zoom');
    m.style.setProperty('--zx', ((.5 - (e.clientX - r.left) / r.width) * 40) + '%');
    m.style.setProperty('--zy', ((.5 - (e.clientY - r.top) / r.height) * 40) + '%');
  }, { passive: true });

  // Sepete uçan ürün
  let lastPoint = null;
  document.addEventListener('pointerdown', e => { lastPoint = { x: e.clientX, y: e.clientY, el: e.target }; }, true);
  const baseAdd = Svc.addToCart.bind(Svc);
  Svc.addToCart = function (pid, variant, qty) {
    const ok = baseAdd(pid, variant, qty);
    if (ok === true && lastPoint && !reduced()) {
      const p = Svc.product(pid);
      const target = U.$$('[data-cart-count]').map(x => x.closest('a')).find(a => a && a.offsetParent);
      if (p && target) {
        const card = lastPoint.el && lastPoint.el.closest && lastPoint.el.closest('.pcard, .pd, .cart-store, .mini-prods');
        const from = card && card.querySelector('.pimg .em') ? card.querySelector('.pimg .em').getBoundingClientRect() : { left: lastPoint.x - 22, top: lastPoint.y - 22, width: 44, height: 44 };
        const to = target.getBoundingClientRect();
        const f = document.createElement('div');
        f.className = 'fly';
        f.textContent = (p.images[0] && p.images[0].e) || '🛍️';
        f.style.left = (from.left + from.width / 2 - 22) + 'px'; f.style.top = (from.top + from.height / 2 - 22) + 'px';
        document.body.appendChild(f);
        requestAnimationFrame(() => { f.style.transform = `translate(${to.left + to.width / 2 - (from.left + from.width / 2)}px, ${to.top + to.height / 2 - (from.top + from.height / 2)}px) scale(.25)`; f.style.opacity = '.4'; });
        setTimeout(() => { f.remove(); target.classList.remove('bump'); void target.offsetWidth; target.classList.add('bump'); }, 760);
      }
    }
    return ok;
  };

  // Aramada dönen örnekler
  const hints = ['kablosuz kulaklık', 'beyaz sneaker', '925 ayar gümüş kolye', 'dış cephe boyası', 'akıllı saat', 'nevresim takımı', 'kahve makinesi', 'parfüm'];
  let hi = 0;
  setInterval(() => {
    const inp = U.$('#sq'); const box = U.$('#search');
    if (!inp || document.activeElement === inp || inp.value) return;
    box.classList.add('swap');
    setTimeout(() => { hi = (hi + 1) % hints.length; inp.placeholder = `"${hints[hi]}" ara…`; box.classList.remove('swap'); }, 300);
  }, 3200);
})();
