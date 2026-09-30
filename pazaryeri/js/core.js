/* MarkaBahçem — çekirdek: yardımcılar, depolama, veri katmanı, oturum, yönlendirici, arayüz araçları */
(function () {
  'use strict';
  const C = window.Carsim = window.Carsim || {};

  /* ---------- Genel yardımcılar ---------- */
  const U = C.U = {
    $: (s, r = document) => r.querySelector(s),
    $$: (s, r = document) => Array.from(r.querySelectorAll(s)),
    esc: s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    tl: n => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0) + ' TL',
    tl0: n => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(n || 0) + ' TL',
    num: n => new Intl.NumberFormat('tr-TR').format(Math.round(n || 0)),
    pct: (n, d = 1) => '%' + (n || 0).toFixed(d).replace('.', ','),
    date: ts => new Date(ts).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }),
    dateS: ts => new Date(ts).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    dateTime: ts => new Date(ts).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
    dayMonth: ts => new Date(ts).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }),
    ago(ts) {
      const s = (Date.now() - ts) / 1000;
      if (s < 60) return 'az önce';
      if (s < 3600) return Math.floor(s / 60) + ' dk önce';
      if (s < 86400) return Math.floor(s / 3600) + ' saat önce';
      if (s < 86400 * 30) return Math.floor(s / 86400) + ' gün önce';
      return U.date(ts);
    },
    DAY: 864e5,
    startOfDay(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); },
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },
    slug(s) {
      const map = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', İ: 'i', Ö: 'o', Ş: 's', Ü: 'u' };
      return String(s).replace(/[çğıöşüÇĞİÖŞÜ]/g, c => map[c]).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    },
    norm(s) { return U.slug(s).replace(/-/g, ' '); },
    lower: s => String(s || '').toLocaleLowerCase('tr-TR'),
    sum: (arr, f = x => x) => arr.reduce((a, x) => a + (+f(x) || 0), 0),
    groupBy(arr, f) { const m = new Map(); arr.forEach(x => { const k = f(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }); return m; },
    uniq: arr => Array.from(new Set(arr)),
    round2: n => Math.round(n * 100) / 100,
    pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
    qs(obj) {
      const p = Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length))
        .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(Array.isArray(v) ? v.join(',') : v));
      return p.length ? '?' + p.join('&') : '';
    },
    parseQs(s) {
      const o = {};
      (s || '').replace(/^\?/, '').split('&').filter(Boolean).forEach(kv => {
        const [k, v = ''] = kv.split('=');
        o[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
      });
      return o;
    },
    initials: n => String(n || '?').split(/\s+/).map(x => x[0]).slice(0, 2).join('').toLocaleUpperCase('tr-TR'),
    csv(rows) {
      return '﻿' + rows.map(r => r.map(c => {
        const s = String(c == null ? '' : c);
        return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(';')).join('\n');
    },
    /** Dosya indirir; indirme engelliyse metni gösterir ve kopyalatır. */
    download(name, text, mime = 'text/csv;charset=utf-8') {
      try {
        const blob = new Blob([text], { type: mime });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      } catch (e) { /* aşağıdaki pencere yine açılır */ }
      C.Modal.open({
        title: 'Rapor hazır: ' + name,
        body: `<p class="small muted" style="margin-bottom:10px">Dosya indirilmediyse aşağıdaki içeriği kopyalayıp Excel'e yapıştırabilirsiniz (ayraç: noktalı virgül).</p>
               <textarea class="textarea" id="dl-text" style="min-height:240px;font-family:ui-monospace,monospace;font-size:.78rem" readonly>${U.esc(text)}</textarea>`,
        actions: [{ label: 'Kopyala', primary: true, onClick: () => { U.copy(U.$('#dl-text').value); return false; } }, { label: 'Kapat' }]
      });
    },
    copy(text) {
      const ok = () => C.toast('Panoya kopyalandı');
      try { navigator.clipboard.writeText(text).then(ok, () => fallback()); } catch (e) { fallback(); }
      function fallback() { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); ok(); } catch (e) { C.toast('Kopyalanamadı, metni elle seçin'); } t.remove(); }
    },
    /** Yüklenen görseli küçültüp JPEG data URL'e çevirir. */
    readImage(file, max = 900) {
      return new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onerror = rej;
        fr.onload = () => {
          const img = new Image();
          img.onerror = rej;
          img.onload = () => {
            const s = Math.min(1, max / Math.max(img.width, img.height));
            const cv = document.createElement('canvas');
            cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
            cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
            res(cv.toDataURL('image/jpeg', .82));
          };
          img.src = fr.result;
        };
        fr.readAsDataURL(file);
      });
    },
    /** Sabit tohumlu rastgele sayı üreteci (tohum verisinin her seferinde aynı çıkması için). */
    rng(seed) {
      let a = seed >>> 0;
      const r = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
      r.int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
      r.pick = arr => arr[Math.floor(r() * arr.length)];
      r.chance = p => r() < p;
      r.shuffle = arr => { const b = arr.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
      return r;
    }
  };

  /* ---------- Güvenli tarayıcı depolaması ---------- */
  const Store = C.Store = {
    mem: {},
    get(k) {
      try { const v = localStorage.getItem(k); if (v != null) return JSON.parse(v); } catch (e) { /* bellek yedeğine düş */ }
      return k in this.mem ? this.mem[k] : null;
    },
    set(k, v) {
      this.mem[k] = v;
      try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
    },
    del(k) { delete this.mem[k]; try { localStorage.removeItem(k); } catch (e) { /* yok say */ } }
  };

  /* ---------- Veri katmanı ----------
     Tüm okuma/yazma buradan geçer. Canlıya alırken yalnızca bu nesnenin
     metotları bir REST API'ye bağlanacak şekilde değiştirilir. */
  const DB_KEY = 'carsim_db';
  const DB_VERSION = 9;
  const DB = C.DB = {
    data: null,
    load() {
      const d = Store.get(DB_KEY);
      if (d && d.version === DB_VERSION) this.data = d;
      else { this.data = C.Seed.build(DB_VERSION); this.flush(); }
    },
    _t: null,
    save() { clearTimeout(this._t); this._t = setTimeout(() => this.flush(), 60); },
    flush() {
      if (!Store.set(DB_KEY, this.data)) {
        if (!this._warned) { this._warned = true; C.toast && C.toast('Tarayıcı depolaması dolu veya kapalı. Değişiklikler bu oturumla sınırlı kalacak.'); }
      }
    },
    reset() { Store.del(DB_KEY); Store.del('carsim_session'); this.load(); },
    all(t) { return this.data[t] || (this.data[t] = []); },
    get(t, id) { id = +id; return this.all(t).find(x => x.id === id) || null; },
    where(t, f) { return this.all(t).filter(f); },
    insert(t, obj) {
      const seq = this.data.seq || (this.data.seq = {});
      seq[t] = (seq[t] || this.all(t).reduce((m, x) => Math.max(m, x.id || 0), 0)) + 1;
      const row = Object.assign({}, obj, { id: seq[t], createdAt: obj.createdAt || Date.now() });
      this.all(t).push(row); this.save(); return row;
    },
    update(t, id, patch) { const r = this.get(t, id); if (r) { Object.assign(r, patch); this.save(); } return r; },
    remove(t, id) { id = +id; this.data[t] = this.all(t).filter(x => x.id !== id); this.save(); },
    get settings() { return this.data.settings; }
  };

  /* ---------- Oturum ---------- */
  const Auth = C.Auth = {
    user() { const id = Store.get('carsim_session'); return id ? DB.get('users', id) : null; },
    login(email, pass) {
      const u = DB.all('users').find(x => U.lower(x.email) === U.lower(email.trim()));
      if (!u || u.password !== pass) return { error: 'E-posta veya şifre hatalı.' };
      if (u.banned) return { error: 'Bu hesap askıya alınmış. Destek ekibiyle iletişime geçin.' };
      Store.set('carsim_session', u.id);
      C.Svc.mergeGuestCart(u.id);
      return { user: u };
    },
    loginAs(id) { Store.set('carsim_session', id); C.Svc.mergeGuestCart(id); },
    logout() { Store.del('carsim_session'); },
    register({ name, email, password, phone }) {
      if (!name || !email || !password) return { error: 'Tüm alanları doldurun.' };
      if (!/^\S+@\S+\.\S+$/.test(email)) return { error: 'Geçerli bir e-posta adresi girin.' };
      if (password.length < 6) return { error: 'Şifre en az 6 karakter olmalı.' };
      if (DB.all('users').some(x => U.lower(x.email) === U.lower(email))) return { error: 'Bu e-posta ile kayıtlı bir hesap var.' };
      const u = DB.insert('users', { name, email: email.trim(), password, phone: phone || '', role: 'customer', addresses: [], favorites: [], viewed: [], cmp: [] });
      Store.set('carsim_session', u.id);
      C.Svc.mergeGuestCart(u.id);
      C.Svc.notify(u.id, '🎉 MarkaBahçem\'e hoş geldin! İlk siparişinde HOSGELDIN koduyla 100 TL indirim seni bekliyor.', '/');
      return { user: u };
    }
  };

  /* ---------- Bildirim balonu ---------- */
  C.toast = function (msg, opts = {}) {
    let host = U.$('.toasts');
    if (!host) { host = document.createElement('div'); host.className = 'toasts'; host.setAttribute('role', 'status'); document.body.appendChild(host); }
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<span>${opts.icon || '✓'}</span><span>${msg}${opts.link ? ` <a href="#${opts.link}">${U.esc(opts.linkText || 'Görüntüle')}</a>` : ''}</span>`;
    host.appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, opts.ms || 2800);
  };

  /* ---------- Modal pencere ---------- */
  const Modal = C.Modal = {
    open({ title, body, actions = [], wide = false, onMount }) {
      const bg = document.createElement('div');
      bg.className = 'modal-bg';
      bg.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${U.esc(title)}">
        <div class="modal-h"><h3>${U.esc(title)}</h3><button class="icon-btn" data-x aria-label="Kapat">✕</button></div>
        <div class="modal-b">${body}</div>
        ${actions.length ? `<div class="modal-f">${actions.map((a, i) => `<button class="btn ${a.primary ? 'btn-primary' : ''} ${a.danger ? 'btn-danger' : ''}" data-a="${i}">${U.esc(a.label)}</button>`).join('')}</div>` : ''}
      </div>`;
      const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
      const onKey = e => { if (e.key === 'Escape') close(); };
      document.addEventListener('keydown', onKey);
      bg.addEventListener('click', e => {
        if (e.target === bg || e.target.closest('[data-x]')) return close();
        const b = e.target.closest('[data-a]');
        if (b) { const a = actions[+b.dataset.a]; const r = a.onClick ? a.onClick(bg) : undefined; if (r !== false) close(); }
      });
      document.body.appendChild(bg);
      const first = bg.querySelector('input,select,textarea');
      if (first) setTimeout(() => first.focus(), 30);
      onMount && onMount(bg, close);
      return close;
    },
    confirm(msg, { ok = 'Onayla', danger = false, title = 'Emin misiniz?' } = {}) {
      return new Promise(res => {
        let done = false;
        const close = this.open({
          title, body: `<p>${msg}</p>`,
          actions: [{ label: 'Vazgeç', onClick: () => { done = true; res(false); } }, { label: ok, primary: !danger, danger, onClick: () => { done = true; res(true); } }]
        });
        const obs = new MutationObserver(() => { if (!document.body.contains(bg)) { obs.disconnect(); if (!done) res(false); } });
        const bg = U.$$('.modal-bg').pop();
        obs.observe(document.body, { childList: true });
        void close;
      });
    },
    prompt(title, { label = '', value = '', placeholder = '', textarea = false, ok = 'Kaydet' } = {}) {
      return new Promise(res => {
        let done = false;
        this.open({
          title,
          body: `<div class="field"><label for="mp-in">${U.esc(label)}</label>${textarea
            ? `<textarea class="textarea" id="mp-in" placeholder="${U.esc(placeholder)}">${U.esc(value)}</textarea>`
            : `<input class="input" id="mp-in" value="${U.esc(value)}" placeholder="${U.esc(placeholder)}">`}</div>`,
          actions: [{ label: 'Vazgeç', onClick: () => { done = true; res(null); } }, { label: ok, primary: true, onClick: bg => { done = true; res(bg.querySelector('#mp-in').value); } }]
        });
        const bg = U.$$('.modal-bg').pop();
        const obs = new MutationObserver(() => { if (!document.body.contains(bg)) { obs.disconnect(); if (!done) res(null); } });
        obs.observe(document.body, { childList: true });
      });
    }
  };

  /* ---------- Yönlendirici (hash tabanlı) ---------- */
  const Router = C.Router = {
    routes: [],
    path: null,
    add(pattern, handler) {
      const keys = [];
      const re = new RegExp('^' + pattern.replace(/\//g, '\\/').replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^\\/]+)'; }) + '\\/?$');
      this.routes.push({ re, keys, handler });
    },
    go(path, { replace = false } = {}) {
      this.render(path);
      try {
        if (replace) history.replaceState(null, '', '#' + path);
        else if (location.hash !== '#' + path) location.hash = path;
      } catch (e) { /* çerçeve hash yazmayı engellerse bellekteki yol yeterli */ }
    },
    refresh() { this.render(this.path || '/', { keepScroll: true }); },
    current() { const [p, q] = (this.path || '/').split('?'); return { path: p, query: U.parseQs(q) }; },
    start() {
      window.addEventListener('hashchange', () => {
        const p = location.hash.slice(1) || '/';
        if (p !== this.path) this.render(p);
      });
      document.addEventListener('click', e => {
        const a = e.target.closest('a[href^="#/"]');
        if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        this.go(a.getAttribute('href').slice(1));
      });
      let p = '/';
      try { p = location.hash.slice(1) || '/'; } catch (e) { /* varsayılan */ }
      if (!p.startsWith('/')) p = '/';
      this.render(p);
    },
    render(fullPath, { keepScroll = false } = {}) {
      this.path = fullPath;
      const [p, q] = fullPath.split('?');
      const query = U.parseQs(q);
      for (const r of this.routes) {
        const m = p.match(r.re);
        if (m) {
          const params = {};
          r.keys.forEach((k, i) => params[k] = decodeURIComponent(m[i + 1]));
          const y = window.scrollY;
          C.App.mount(r.handler, params, query);
          if (keepScroll) window.scrollTo(0, y); else window.scrollTo(0, 0);
          return;
        }
      }
      C.App.mount(C.Pages.notFound, {}, query);
    }
  };

  /* ---------- SVG grafikler ---------- */
  const Chart = C.Chart = {
    _tip: null,
    tip(e, html) {
      if (!this._tip) { this._tip = document.createElement('div'); this._tip.className = 'chart-tip'; document.body.appendChild(this._tip); }
      if (!html) { this._tip.hidden = true; return; }
      this._tip.hidden = false; this._tip.innerHTML = html;
      const w = this._tip.offsetWidth;
      this._tip.style.left = U.clamp(e.clientX - w / 2, 8, window.innerWidth - w - 8) + 'px';
      this._tip.style.top = (e.clientY - 44) + 'px';
    },
    niceMax(v) {
      if (v <= 0) return 1;
      const p = Math.pow(10, Math.floor(Math.log10(v)));
      const n = v / p;
      return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
    },
    short(v) {
      if (v >= 1e6) return (v / 1e6).toFixed(1).replace('.', ',') + ' Mn';
      if (v >= 1e3) return (v / 1e3).toFixed(v >= 1e4 ? 0 : 1).replace('.', ',') + ' B';
      return String(Math.round(v));
    },
    /** Çizgi/alan grafiği. series: [{name, values, color}], labels: x etiketleri */
    line({ series, labels, height = 240, width = 720, money = false, step = false, area = true, id = 'ch' + Math.random().toString(36).slice(2, 7) }) {
      const W = width, H = height, L = 50, R = 14, T = 14, B = 28;
      const max = this.niceMax(Math.max(1, ...series.flatMap(s => s.values)));
      const minV = step ? Math.min(...series.flatMap(s => s.values)) : 0;
      const lo = step ? Math.max(0, this.niceMax(minV) / 2 > minV ? 0 : Math.floor(minV * 0.9)) : 0;
      const n = labels.length;
      const x = i => L + (n <= 1 ? 0 : i * (W - L - R) / (n - 1));
      const y = v => T + (H - T - B) * (1 - (v - lo) / (max - lo || 1));
      let g = '';
      for (let i = 0; i <= 4; i++) {
        const v = lo + (max - lo) * i / 4, yy = y(v);
        g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/><text x="${L - 8}" y="${yy + 4}" text-anchor="end">${this.short(v)}</text>`;
      }
      const every = Math.max(1, Math.ceil(n / 8));
      labels.forEach((l, i) => { if (i % every === 0 || (i === n - 1 && (n - 1) % every >= every / 2)) g += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${U.esc(l)}</text>`; });
      let paths = '';
      series.forEach((s, si) => {
        const pts = s.values.map((v, i) => [x(i), y(v)]);
        let d = '';
        pts.forEach(([px, py], i) => {
          if (i === 0) d += `M${px},${py}`;
          else if (step) d += `H${px}V${py}`;
          else d += `L${px},${py}`;
        });
        if (area && si === 0) paths += `<path d="${d} L${pts[pts.length - 1][0]},${y(lo)} L${pts[0][0]},${y(lo)} Z" style="fill:${s.color};opacity:.12"/>`;
        paths += `<path d="${d}" fill="none" style="stroke:${s.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" ${s.dash ? 'stroke-dasharray="5 5"' : ''}/>`;
        const last = pts[pts.length - 1];
        if (last) paths += `<circle cx="${last[0]}" cy="${last[1]}" r="4.5" style="fill:${s.color};stroke:var(--surface)" stroke-width="2"/>`;
      });
      const hits = labels.map((l, i) => `<rect x="${x(i) - (W - L - R) / Math.max(1, n - 1) / 2}" y="${T}" width="${(W - L - R) / Math.max(1, n - 1)}" height="${H - T - B}" fill="transparent" data-i="${i}"/>`).join('');
      setTimeout(() => {
        const el = document.getElementById(id); if (!el) return;
        el.addEventListener('mousemove', e => {
          const r = e.target.closest('rect[data-i]'); if (!r) return Chart.tip(e, null);
          const i = +r.dataset.i;
          Chart.tip(e, `<b>${U.esc(labels[i])}</b><br>` + series.map(s => `<span style="color:${s.color}">●</span> ${U.esc(s.name)}: ${money ? U.tl(s.values[i]) : U.num(s.values[i])}`).join('<br>'));
        });
        el.addEventListener('mouseleave', e => Chart.tip(e, null));
      });
      return `<svg class="chart" id="${id}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${g}${paths}${hits}</svg>`;
    },
    bars({ items, height = 240, money = false, color = 'var(--c1)', horizontal = false }) {
      if (horizontal) {
        const max = Math.max(1, ...items.map(i => i.value));
        return `<div class="stack" style="gap:10px">${items.map(i => `
          <div><div class="row between small" style="margin-bottom:4px"><span class="grow" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${U.esc(i.label)}</span><b class="num">${money ? U.tl0(i.value) : U.num(i.value)}</b></div>
          <div class="bar brand"><i style="width:${(i.value / max * 100).toFixed(1)}%;background:${i.color || color}"></i></div></div>`).join('')}</div>`;
      }
      const W = 720, H = height, L = 50, R = 10, T = 12, B = 30;
      const max = this.niceMax(Math.max(1, ...items.map(i => i.value)));
      const bw = (W - L - R) / items.length;
      let g = '';
      for (let k = 0; k <= 4; k++) { const v = max * k / 4, yy = T + (H - T - B) * (1 - v / max); g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/><text x="${L - 8}" y="${yy + 4}" text-anchor="end">${this.short(v)}</text>`; }
      const every = Math.max(1, Math.ceil(items.length / 12));
      const id = 'b' + Math.random().toString(36).slice(2, 7);
      const bars = items.map((it, i) => {
        const h = (H - T - B) * it.value / max, xx = L + i * bw + bw * .18;
        return `<rect x="${xx}" y="${T + (H - T - B) - h}" width="${bw * .64}" height="${Math.max(0, h)}" rx="3" style="fill:${it.color || color}" data-i="${i}"/>` +
          (i % every === 0 ? `<text x="${xx + bw * .32}" y="${H - 10}" text-anchor="middle">${U.esc(it.label)}</text>` : '');
      }).join('');
      setTimeout(() => {
        const el = document.getElementById(id); if (!el) return;
        el.addEventListener('mousemove', e => { const r = e.target.closest('rect[data-i]'); if (!r) return Chart.tip(e, null); const it = items[+r.dataset.i]; Chart.tip(e, `<b>${U.esc(it.full || it.label)}</b><br>${money ? U.tl(it.value) : U.num(it.value)}`); });
        el.addEventListener('mouseleave', e => Chart.tip(e, null));
      });
      return `<svg class="chart" id="${id}" viewBox="0 0 ${W} ${H}">${g}${bars}</svg>`;
    },
    donut({ items, size = 150, money = false, center = '' }) {
      const total = U.sum(items, i => i.value) || 1;
      const r = 54, c = 2 * Math.PI * r;
      let off = 0;
      const arcs = items.map(it => {
        const len = c * it.value / total;
        const s = `<circle r="${r}" cx="75" cy="75" fill="none" style="stroke:${it.color}" stroke-width="20" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-off}" transform="rotate(-90 75 75)"><title>${U.esc(it.label)}: ${money ? U.tl(it.value) : U.num(it.value)}</title></circle>`;
        off += len; return s;
      }).join('');
      return `<div class="donut-wrap"><svg viewBox="0 0 150 150" width="${size}" height="${size}"><circle r="${r}" cx="75" cy="75" fill="none" style="stroke:var(--sunken)" stroke-width="20"/>${arcs}
        <text x="75" y="72" text-anchor="middle" style="fill:var(--ink);font:700 15px var(--f-display)">${U.esc(center)}</text><text x="75" y="90" text-anchor="middle" style="fill:var(--muted);font-size:10px">toplam</text></svg>
        <div class="stack" style="gap:8px">${items.map(it => `<div class="row between small nowrap"><span><i class="status-dot" style="background:${it.color}"></i>${U.esc(it.label)}</span><b class="num">${U.pct(it.value / total * 100, 0)}</b></div>`).join('')}</div></div>`;
    },
    spark(values, color = 'var(--c1)') {
      const W = 120, H = 36, max = Math.max(1, ...values), min = Math.min(...values);
      const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1) * W).toFixed(1)},${(H - 4 - (v - min) / (max - min || 1) * (H - 8)).toFixed(1)}`);
      return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline points="0,${H} ${pts.join(' ')} ${W},${H}" style="fill:${color};opacity:.12;stroke:none"/><polyline points="${pts.join(' ')}" fill="none" style="stroke:${color}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
    },
    heat(matrix) {
      const days = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
      const max = Math.max(1, ...matrix.flat());
      let h = '<div class="heat">';
      matrix.forEach((row, d) => {
        h += `<div class="hl">${days[d]}</div>`;
        row.forEach((v, hr) => { h += `<div title="${days[d]} ${hr}:00 · ${v} sipariş" style="background:var(--brand);opacity:${(0.07 + v / max * 0.93).toFixed(2)}"></div>`; });
      });
      h += '<div></div>' + Array.from({ length: 24 }, (_, i) => `<div class="hl" style="justify-content:center">${i % 3 === 0 ? i : ''}</div>`).join('') + '</div>';
      return h;
    }
  };
})();
