/* MarkaBahçem — tekrar kullanılan arayüz parçaları */
(function () {
  'use strict';
  const C = window.Carsim;
  const { U, Svc } = C;
  const esc = U.esc;

  const K = C.K = {
    /** Görsel: data URL / adres veya {e, c1, c2} yer tutucu. */
    img(spec, { label = '' } = {}) {
      if (!spec) spec = { e: '📦', c1: '#eee', c2: '#ddd' };
      if (typeof spec === 'string') return `<div class="pimg has-img"><img src="${esc(spec)}" alt="${esc(label)}" loading="lazy"></div>`;
      return `<div class="pimg" style="background:linear-gradient(145deg,${esc(spec.c1)},${esc(spec.c2)})" role="img" aria-label="${esc(label)}"><span class="em">${esc(spec.e)}</span></div>`;
    },
    storeAvatar(s, size = 46) {
      if (!s) return '';
      return `<div class="store-avatar" style="background:${esc(s.color)};width:${size}px;height:${size}px;font-size:${Math.round(size * .5)}px">${s.logoImg ? `<img src="${esc(s.logoImg)}" alt="">` : esc(s.logo)}</div>`;
    },
    stars(r, size = '.85rem') {
      const w = U.clamp(r / 5 * 100, 0, 100);
      return `<span class="stars" style="font-size:${size}" aria-label="5 üzerinden ${String(r).replace('.', ',')} puan">★★★★★<span class="fill" style="width:${w}%">★★★★★</span></span>`;
    },
    rating(p) {
      if (!p.reviewCount) return `<div class="rating-line"><span class="muted">Henüz değerlendirme yok</span></div>`;
      return `<div class="rating-line"><b>${p.rating.toFixed(1).replace('.', ',')}</b>${K.stars(p.rating)}<span>(${U.num(p.reviewCount)})</span></div>`;
    },
    price(p, big = false) {
      const i = Svc.priceInfo(p);
      return `<div class="pprice">${i.old ? `<span class="price-old">${U.tl(i.old)}</span>` : ''}<span class="price-now" ${big ? 'style="font-size:2rem"' : ''}>${U.tl(i.price)}</span></div>`;
    },
    card(p, { showStore = true } = {}) {
      const i = Svc.priceInfo(p);
      const s = Svc.store(p.storeId);
      const fav = Svc.isFav(p.id);
      const cmp = Svc.cmp().includes(p.id);
      const tags = [];
      if (i.deal) tags.push(`<span class="badge" style="background:var(--ink);color:var(--bg)">⚡ Flaş %${i.deal.pct}</span>`);
      else if (i.pct >= 5) tags.push(`<span class="badge b-bad">%${i.pct} indirim</span>`);
      if (p.sold > 60 && !i.deal) tags.push(`<span class="badge b-brand">🔥 Çok satan</span>`);
      const btags = [];
      if (Svc.freeShip(p)) btags.push(`<span class="badge b-ok">Kargo bedava</span>`);
      if (p.fastDelivery) btags.push(`<span class="badge b-info">🚀 Hızlı teslimat</span>`);
      if (p.stock > 0 && p.stock <= 5) btags.push(`<span class="badge b-warn">Son ${p.stock} ürün</span>`);
      if (p.stock <= 0) btags.push(`<span class="badge b-mute">Tükendi</span>`);
      return `<article class="pcard" data-pid="${p.id}">
        <a href="#/p/${p.id}" class="pimg-wrap" aria-label="${esc(p.brand + ' ' + p.title)}">${K.img(p.images[0], { label: p.title })}
          <div class="tags">${tags.join('')}</div><div class="bottom-tags">${btags.join('')}</div></a>
        <button class="fav ${fav ? 'on' : ''}" data-fav="${p.id}" aria-label="Favorilere ekle" aria-pressed="${fav}">${fav ? '♥' : '♡'}</button>
        <div class="pbody">
          <a href="#/p/${p.id}" class="ptitle"><b>${esc(p.brand)}</b> ${esc(p.title)}</a>
          ${K.rating(p)}
          ${showStore && s ? `<div class="sold-by">${esc(s.name)}${s.official ? ' <span title="Resmi satıcı">✔︎</span>' : ''}</div>` : ''}
          ${K.price(p)}
        </div>
        <label class="cmp ${cmp ? 'on' : ''}"><input type="checkbox" data-cmp="${p.id}" ${cmp ? 'checked' : ''}> Karşılaştır</label>
        ${p.variants || p.stock <= 0 ? '' : `<button class="btn btn-primary btn-sm add" data-add="${p.id}">Sepete ekle</button>`}
      </article>`;
    },
    grid(list, opts) { return list.length ? `<div class="pgrid">${list.map(p => K.card(p, opts)).join('')}</div>` : K.empty('🔎', 'Ürün bulunamadı', 'Filtreleri azaltmayı ya da farklı bir arama yapmayı dene.'); },
    rail(list) { return `<div class="hscroll">${list.map(p => K.card(p)).join('')}</div>`; },
    empty(icon, title, text = '', cta = '') { return `<div class="empty"><div class="ei">${icon}</div><h3>${esc(title)}</h3>${text ? `<p>${text}</p>` : ''}${cta}</div>`; },
    status(s) { const x = Svc.STATUS[s] || { label: s, cls: 'b-mute' }; return `<span class="badge ${x.cls}">${x.label}</span>`; },
    pill(map, s) { const x = map[s] || [s, 'b-mute']; return `<span class="badge ${x[1]}">${x[0]}</span>`; },
    countdown(endsAt) { return `<span class="countdown" data-cd="${endsAt}"><span>00</span>:<span>00</span>:<span>00</span></span>`; },
    tickCountdowns() {
      U.$$('[data-cd]').forEach(el => {
        let s = Math.max(0, Math.floor((+el.dataset.cd - Date.now()) / 1000));
        const h = Math.floor(s / 3600); s -= h * 3600; const m = Math.floor(s / 60); s -= m * 60;
        const sp = el.querySelectorAll('span');
        [h, m, s].forEach((v, i) => { if (sp[i]) sp[i].textContent = String(v).padStart(2, '0'); });
      });
    },
    pager(total, page, per) {
      const pages = Math.ceil(total / per);
      if (pages <= 1) return '';
      const btn = n => `<button class="${n === page ? 'on' : ''}" data-page="${n}">${n}</button>`;
      let out = '';
      if (page > 1) out += `<button data-page="${page - 1}" aria-label="Önceki">‹</button>`;
      for (let n = 1; n <= pages; n++) { if (n === 1 || n === pages || Math.abs(n - page) <= 1) out += btn(n); else if (Math.abs(n - page) === 2) out += '<button disabled>…</button>'; }
      if (page < pages) out += `<button data-page="${page + 1}" aria-label="Sonraki">›</button>`;
      return `<div class="pager">${out}</div>`;
    },
    kpi(label, value, delta, spark, hint) {
      const d = delta == null ? '' : `<span class="k-d ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '▲' : '▼'} %${Math.abs(delta).toFixed(1).replace('.', ',')} <span class="muted" style="font-weight:500">önceki döneme göre</span></span>`;
      return `<div class="kpi"><div class="k-l"><span>${esc(label)}</span>${hint ? `<span title="${esc(hint)}">ⓘ</span>` : ''}</div><div class="k-v">${value}</div>${d}${spark || ''}</div>`;
    },
    insight(x) {
      return `<div class="insight ${x.kind}"><span class="ii">${x.icon}</span><div class="grow"><b>${esc(x.title)}</b><div class="small" style="margin-top:2px">${esc(x.text)}</div>${x.link ? `<a href="#${x.link}" class="small bold" style="display:inline-block;margin-top:6px;color:var(--brand-deep)">${esc(x.cta || 'Git')} →</a>` : ''}</div></div>`;
    },
    /** Kart üzerindeki favori / sepet / karşılaştır butonlarını bağlar. */
    bindCards(root) {
      root.addEventListener('click', e => {
        const f = e.target.closest('[data-fav]');
        if (f) { e.preventDefault(); const on = Svc.toggleFav(+f.dataset.fav); if (on != null) { f.classList.toggle('on', on); f.textContent = on ? '♥' : '♡'; f.setAttribute('aria-pressed', on); } return; }
        const a = e.target.closest('[data-add]');
        if (a) { e.preventDefault(); Svc.addToCart(+a.dataset.add); return; }
      });
      root.addEventListener('change', e => {
        const c = e.target.closest('[data-cmp]');
        if (c) { const on = Svc.toggleCmp(+c.dataset.cmp); c.checked = on; c.parentElement.classList.toggle('on', on); }
      });
    },
    bannerBg(b) { return b.img ? `url('${esc(b.img)}') center/cover` : `linear-gradient(120deg,${esc(b.c1)},${esc(b.c2)})`; }
  };
})();
