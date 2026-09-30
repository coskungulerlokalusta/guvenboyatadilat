/* MarkaBahçem — uygulama kabuğu: düzenler, üst menü, asistan, rotalar, açılış */
(function () {
  'use strict';
  const C = window.Carsim;
  const { U, Svc, K, Auth, DB, Store, Router } = C;
  const esc = U.esc;

  const App = C.App = {
    cleanup: [],
    botOpen: false,
    botMsgs: [],

    mount(handler, params, query) {
      this.cleanup.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
      this.cleanup = [];
      let page;
      try { page = handler(params, query) || {}; }
      catch (e) { console.error(e); page = { title: 'Hata', html: K.empty('⚠️', 'Bir şeyler ters gitti', esc(e.message), '<a class="btn btn-primary" href="#/">Ana sayfaya dön</a>') }; }
      if (page.redirect) { Router.go(page.redirect, { replace: true }); return; }
      document.title = (page.title ? page.title + ' · ' : '') + DB.settings.siteName;
      const root = U.$('#app');
      if (page.layout === 'panel') root.innerHTML = this.panelShell(page);
      else if (page.layout === 'bare') root.innerHTML = `<main class="fade-in">${page.html}</main>`;
      else root.innerHTML = this.shopShell(page);
      const main = U.$('#main') || root;
      if (page.layout !== 'panel') K.bindCards(main);
      this.bindShell(page);
      if (page.mount) { try { const c = page.mount(main, params, query); if (typeof c === 'function') this.cleanup.push(c); } catch (e) { console.error(e); } }
      K.tickCountdowns();
      this.renderBot(page.layout !== 'panel' && page.layout !== 'bare');
      this.renderCmpTray(page.layout !== 'panel' && page.layout !== 'bare');
    },

    /* ---------- Vitrin düzeni ---------- */
    shopShell(page) {
      const u = Auth.user();
      const cats = Svc.cats();
      const path = Router.current().path;
      const q = Router.current().query;
      const cc = Svc.cartCount(), nn = Svc.unread();
      const s = DB.settings;
      return `
      <div class="topbar"><div class="wrap"><span>📣 ${esc(s.announcement)}</span><div class="links">
        ${u && u.role === 'seller' ? '<a href="#/seller">🏪 Satıcı paneli</a>' : '<a href="#/sell">Satıcı ol</a>'}
        ${u && u.role === 'admin' ? '<a href="#/admin">🛡 Yönetim paneli</a>' : ''}
        <a href="#/stores">Mağazalar</a><a href="#/deals">Flaş fırsatlar</a><a href="#/help">Yardım</a></div></div></div>
      <header class="hdr"><div class="wrap hdr-main">
        <a class="logo" href="#/" aria-label="MarkaBahçem ana sayfa"><span class="dot">m</span><span>markabahçe<em>m</em></span></a>
        <div class="search" id="search">
          <form id="sform" role="search"><input id="sq" type="search" placeholder="Ürün, kategori, marka ara… (örn: kablosuz kulaklık)" autocomplete="off" value="${esc(path === '/search' ? q.q || '' : '')}" aria-label="Ara">
          <button type="button" class="sbtn" id="voice" title="Sesle ara" aria-label="Sesle ara">🎙</button><button class="sbtn" type="submit" aria-label="Ara">🔍</button></form>
          <div class="suggest" id="suggest" hidden></div>
        </div>
        <div class="hdr-actions">
          <div class="dd">
            ${u ? `<button class="ha" id="accBtn" aria-haspopup="true"><span class="ico">👤</span><span class="lbl-t">${esc(u.name.split(' ')[0])}</span></button>
              <div class="dd-menu" id="accMenu" hidden>
                <div style="padding:8px 12px"><b>${esc(u.name)}</b><div class="xs muted">${esc(u.email)}</div></div><hr class="divider">
                <a href="#/account/orders">📦 Siparişlerim</a><a href="#/account/favorites">♡ Favorilerim</a><a href="#/account/alerts">🔔 Fiyat alarmlarım</a>
                <a href="#/account/following">🏪 Takip ettiğim mağazalar</a><a href="#/account/addresses">📍 Adreslerim</a><a href="#/account/profile">⚙️ Hesap bilgilerim</a>
                ${u.role === 'seller' ? '<hr class="divider"><a href="#/seller">🏪 Satıcı paneli</a>' : ''}${u.role === 'admin' ? '<hr class="divider"><a href="#/admin">🛡 Yönetim paneli</a>' : ''}
                <hr class="divider"><button id="logout">↩ Çıkış yap</button></div>`
              : `<a class="ha" href="#/login?next=${encodeURIComponent(Router.path)}"><span class="ico">👤</span><span class="lbl-t">Giriş yap</span></a>`}
          </div>
          <a class="ha hide-m" href="#/account/notifications" aria-label="Bildirimler"><span class="ico">🔔</span>${nn ? `<span class="cnt">${nn}</span>` : ''}</a>
          <a class="ha hide-m" href="#/account/favorites"><span class="ico">♡</span><span class="lbl-t">Favoriler</span></a>
          <a class="ha" href="#/cart"><span class="ico">🛒</span><span class="lbl-t">Sepetim</span><span class="cnt" data-cart-count ${cc ? '' : 'hidden'}>${cc}</span></a>
          <button class="icon-btn" id="themeBtn" title="Tema değiştir" aria-label="Tema değiştir">◐</button>
        </div></div>
        <nav class="catbar" aria-label="Kategoriler"><div class="wrap">
          <a href="#/deals" class="hot">⚡ Flaş Fırsatlar</a>
          ${cats.map(c => `<a href="#/search?cat=${c.id}" data-mega="${c.id}" class="${+q.cat === c.id ? 'on' : ''}">${esc(c.name)}</a>`).join('')}
          <a href="#/stores">Mağazalar</a>
        </div></nav>
        <div class="mega" id="mega" hidden></div>
      </header>
      <main class="shop-main fade-in" id="main">${page.html}</main>
      <footer class="footer"><div class="wrap"><div class="cols">
        <div class="stack"><a class="logo" href="#/"><span class="dot">m</span><span>markabahçe<em>m</em></span></a><p class="small muted" style="max-width:320px">Binlerce bağımsız mağaza, tek sepet. Güvenli ödeme, 15 gün ücretsiz iade ve şeffaf fiyat geçmişiyle alışveriş.</p>
          <div class="row small muted">🔒 256-bit SSL · 💳 3D Secure · ↩ 15 gün iade</div></div>
        <div><h4>MarkaBahçem</h4><a href="#/stores">Mağazalar</a><a href="#/deals">Flaş fırsatlar</a><a href="#/compare">Karşılaştır</a><a href="#/help">Yardım merkezi</a></div>
        <div><h4>Kategoriler</h4>${cats.slice(0, 6).map(c => `<a href="#/search?cat=${c.id}">${esc(c.name)}</a>`).join('')}</div>
        <div><h4>İş ortaklığı</h4><a href="#/sell">MarkaBahçem'de satış yap</a><a href="#/seller">Satıcı paneli</a><a href="#/admin">Yönetim paneli</a><a href="#/login">Demo hesaplar</a></div>
      </div><div class="bottom"><span>© ${new Date().getFullYear()} MarkaBahçem Pazaryeri. Demo sürüm: veriler bu tarayıcıda saklanır.</span><span>Kişisel verilerin korunması · Çerez politikası · Mesafeli satış sözleşmesi</span></div></div></footer>
      <nav class="tabbar" aria-label="Alt menü">
        <a href="#/" class="${path === '/' ? 'on' : ''}"><span class="ico">🏠</span>Ana sayfa</a>
        <a href="#/categories" class="${path === '/categories' ? 'on' : ''}"><span class="ico">☰</span>Kategoriler</a>
        <a href="#/cart" class="${path === '/cart' ? 'on' : ''}"><span class="ico">🛒</span>Sepetim${cc ? `<span class="cnt" data-cart-count>${cc}</span>` : ''}</a>
        <a href="#/account/favorites" class="${path === '/account/favorites' ? 'on' : ''}"><span class="ico">♡</span>Favoriler</a>
        <a href="#/account" class="${path.startsWith('/account') && path !== '/account/favorites' ? 'on' : ''}"><span class="ico">👤</span>Hesabım</a>
      </nav>`;
    },

    /* ---------- Panel düzeni (satıcı / yönetici) ---------- */
    panelShell(page) {
      const u = Auth.user();
      const path = Router.current().path;
      const nav = page.panel === 'admin' ? this.adminNav() : this.sellerNav();
      const st = page.panel === 'seller' ? Svc.myStore() : null;
      const who = page.panel === 'admin'
        ? `<div class="who"><div class="store-avatar" style="background:var(--ink);color:var(--bg);width:38px;height:38px;font-size:18px">🛡</div><div class="grow"><b class="small">${esc(u.name)}</b><div class="xs muted">Platform yöneticisi</div></div></div>`
        : `<div class="who">${K.storeAvatar(st, 38)}<div class="grow" style="min-width:0"><b class="small" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(st.name)}</b><div class="xs muted">Puan ${Svc.storeScore(st).toFixed(1).replace('.', ',')} · ${K.pill(Svc.STORE_STATUS, st.status)}</div></div></div>`;
      return `<div class="panel">
        <aside class="side" id="side">
          <a class="logo" href="#/"><span class="dot">m</span><span>markabahçe<em>m</em></span></a>
          ${who}
          ${nav.map(g => `<div class="grp">${esc(g[0])}</div>` + g[1].map(([href, ico, label, n]) => {
            const full = Router.path || path;
            const qMatch = nav.some(gg => gg[1].some(([h]) => h.includes('?') && full.startsWith(h)));
            const on = href.includes('?') ? full.startsWith(href) : !qMatch && (href === path || (href !== '/seller' && href !== '/admin' && path.startsWith(href) && !(href === '/seller/products' && path === '/seller/products/new')));
            return `<a class="nav ${on ? 'on' : ''}" href="#${href}"><span>${ico}</span>${esc(label)}${n ? `<span class="n">${n}</span>` : ''}</a>`;
          }).join('')).join('')}
          <div class="side-foot">
            ${st ? `<a class="nav" href="#/store/${st.id}">👁 Mağazamı görüntüle</a>` : ''}
            <a class="nav" href="#/">🛍 Alışverişe dön</a>
            <a class="nav" href="#" id="themeBtn">◐ Tema değiştir</a>
            <a class="nav" href="#" id="logout">↩ Çıkış yap</a>
          </div>
        </aside>
        <main class="pmain fade-in" id="main">
          <div class="ptop"><div class="row nowrap"><button class="icon-btn mob-side-btn" id="sideBtn" aria-label="Menü">☰</button><div><h1>${esc(page.title)}</h1>${page.sub ? `<div class="sub">${page.sub}</div>` : ''}</div></div><div class="row">${page.actions || ''}</div></div>
          ${page.html}
        </main>
      </div>`;
    },
    sellerNav() {
      const st = Svc.myStore();
      if (!st) return [];
      const all = Svc.packagesIn(0, Date.now(), st.id);
      const newN = all.filter(x => x.pk.status === 'new').length;
      const retN = all.filter(x => x.pk.status === 'returnRequested').length;
      const qN = DB.where('questions', q => q.storeId === st.id && !q.answer).length;
      return [
        ['Mağaza', [['/seller', '📊', 'Genel bakış'], ['/seller/orders', '📦', 'Siparişler', newN], ['/seller/returns', '↩️', 'İadeler', retN], ['/seller/questions', '❓', 'Soru & cevap', qN], ['/seller/reviews', '⭐', 'Değerlendirmeler']]],
        ['Katalog', [['/seller/products', '🏷', 'Ürünlerim'], ['/seller/products/new', '➕', 'Yeni ürün ekle']]],
        ['Entegrasyon & fiyat', [['/seller/xml', '🧩', 'XML ile ürün yükle'], ['/seller/pricing', '🤖', 'Otomatik fiyatlandırma'], ['/seller/price-requests', '📨', 'Fiyat artış talepleri', DB.where('priceRequests', r => r.storeId === st.id && r.status === 'pending').length]]],
        ['Büyüme', [['/seller/design', '🎨', 'Mağaza tasarımı'], ['/seller/campaigns', '🎟', 'Kampanya & kupon'], ['/seller/reports', '📈', 'Raporlar'], ['/seller/finance', '💰', 'Finans & hakediş'], ['/seller/settings', '⚙️', 'Mağaza ayarları']]]
      ];
    },
    adminNav() {
      const pendS = DB.where('stores', s => s.status === 'pending').length;
      const pendP = DB.where('products', p => p.status === 'pending').length;
      const retN = DB.all('orders').filter(o => o.packages.some(p => p.status === 'returnRequested')).length;
      return [
        ['Genel', [['/admin', '📊', 'Kontrol paneli'], ['/admin/reports', '📈', 'Raporlar'], ['/admin/risk', '🚩', 'Risk & denetim']]],
        ['Pazaryeri', [['/admin/sellers', '🏪', 'Mağazalar', pendS], ['/admin/products', '🏷', 'Ürün onayı', pendP], ['/admin/orders', '📦', 'Siparişler', retN], ['/admin/users', '👥', 'Kullanıcılar'], ['/admin/price-requests', '📨', 'Fiyat talepleri', DB.where('priceRequests', r => r.status === 'pending').length]]],
        ['Kendi mağazalarım', [['/admin/dropship', '🧩', 'XML bayilikler', DB.where('purchaseOrders', p => ['pending', 'problem'].includes(p.status)).length], ['/admin/dropship?t=orders', '📦', 'Tedarik siparişleri'], ['/admin/dropship?t=profit', '💰', 'Kârlılık']]],
        ['Vitrin', [['/admin/banners', '🖼', 'Banner yönetimi'], ['/admin/deals', '⚡', 'Flaş fırsatlar'], ['/admin/coupons', '🎟', 'Kuponlar'], ['/admin/categories', '🗂', 'Kategori & komisyon']]],
        ['Sistem', [['/admin/integrations', '🔌', 'Entegrasyonlar'], ['/admin/sms', '💬', 'SMS yönetimi'], ['/admin/settings', '⚙️', 'Site ayarları']]]
      ];
    },

    bindShell(page) {
      const theme = U.$('#themeBtn');
      theme && theme.addEventListener('click', e => { e.preventDefault(); this.toggleTheme(); });
      const lo = U.$('#logout');
      lo && lo.addEventListener('click', e => { e.preventDefault(); Auth.logout(); C.toast('Çıkış yapıldı'); Router.go('/'); });
      if (page.layout === 'panel') {
        const sb = U.$('#sideBtn'), side = U.$('#side');
        sb && sb.addEventListener('click', () => side.classList.toggle('open'));
        return;
      }
      // hesap menüsü
      const ab = U.$('#accBtn'), am = U.$('#accMenu');
      if (ab) {
        ab.addEventListener('click', e => { e.stopPropagation(); am.hidden = !am.hidden; });
        const close = () => { am.hidden = true; };
        document.addEventListener('click', close);
        this.cleanup.push(() => document.removeEventListener('click', close));
      }
      // mega menü
      const mega = U.$('#mega');
      let mt;
      U.$$('[data-mega]').forEach(a => a.addEventListener('mouseenter', () => {
        if (window.matchMedia('(hover: none)').matches) return;
        clearTimeout(mt);
        const c = Svc.cat(+a.dataset.mega);
        const top = Svc.bestSellers(4, c.id);
        mega.innerHTML = `<div class="wrap"><div class="stack"><div class="row"><span style="font-size:2rem">${c.icon}</span><h3>${esc(c.name)}</h3></div><a class="btn btn-soft btn-sm" href="#/search?cat=${c.id}">Tümünü gör →</a></div>
          <div><div class="subs">${c.subs.map(s => `<a href="#/search?cat=${c.id}&sub=${encodeURIComponent(s)}">${esc(s)}</a>`).join('')}</div>
          <div class="eyebrow" style="margin:14px 0 8px">Bu kategoride çok satanlar</div><div class="row">${top.map(p => `<a href="#/p/${p.id}" class="row nowrap small" style="gap:8px;max-width:240px"><span style="width:40px;height:40px;border-radius:8px;overflow:hidden;flex:none">${K.img(p.images[0])}</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.title)}</span></a>`).join('')}</div></div></div>`;
        mega.querySelectorAll('.em').forEach(e => e.style.fontSize = '20px');
        mega.hidden = false;
      }));
      const hdr = U.$('.hdr');
      hdr.addEventListener('mouseleave', () => { mt = setTimeout(() => { mega.hidden = true; }, 120); });
      mega.addEventListener('mouseenter', () => clearTimeout(mt));
      mega.addEventListener('click', e => { if (e.target.closest('a')) mega.hidden = true; });
      U.$$('.catbar a:not([data-mega])').forEach(a => a.addEventListener('mouseenter', () => { mega.hidden = true; }));
      this.bindSearch();
    },

    bindSearch() {
      const form = U.$('#sform'), input = U.$('#sq'), box = U.$('#suggest');
      if (!form) return;
      let act = -1;
      const go = q => { q = q.trim(); if (!q) return; const rec = (Store.get('carsim_recent') || []).filter(x => x !== q); rec.unshift(q); Store.set('carsim_recent', rec.slice(0, 6)); box.hidden = true; Router.go('/search' + U.qs({ q })); };
      const render = () => {
        const q = input.value.trim();
        act = -1;
        if (!q) {
          const rec = Store.get('carsim_recent') || [];
          const pop = ['kulaklık', 'spor ayakkabı', 'dış cephe boyası', 'parfüm', 'akıllı saat', 'nevresim'];
          box.innerHTML = (rec.length ? `<div class="s-head">Son aramaların</div>${rec.map(r => `<div class="s-item" data-q="${esc(r)}">🕘 ${esc(r)}</div>`).join('')}` : '') +
            `<div class="s-head">Popüler aramalar</div><div class="row" style="padding:4px 10px 8px;gap:6px">${pop.map(r => `<button class="chip" data-q="${esc(r)}">${esc(r)}</button>`).join('')}</div>`;
          box.hidden = false; return;
        }
        const s = Svc.suggest(q);
        let h = '';
        if (s.corrected) h += `<div class="s-item" data-q="${esc(s.corrected)}">✨ Bunu mu demek istedin: <b>${esc(s.corrected)}</b></div>`;
        if (s.cats.length) h += `<div class="s-head">Kategoriler</div>` + s.cats.map(x => `<div class="s-item" data-href="/search?cat=${x.c.id}${x.s ? '&sub=' + encodeURIComponent(x.s) : ''}">${x.c.icon} ${esc(x.c.name)}${x.s ? ' › <b>' + esc(x.s) + '</b>' : ''}</div>`).join('');
        if (s.stores.length) h += `<div class="s-head">Mağazalar</div>` + s.stores.map(st => `<div class="s-item" data-href="/store/${st.id}">${K.storeAvatar(st, 30)} ${esc(st.name)}</div>`).join('');
        if (s.products.length) h += `<div class="s-head">Ürünler</div>` + s.products.map(p => `<div class="s-item" data-href="/p/${p.id}"><span class="s-thumb">${K.img(p.images[0])}</span><span class="grow"><b>${esc(p.brand)}</b> ${esc(p.title)}</span><span class="price-now small">${U.tl(Svc.priceInfo(p).price)}</span></div>`).join('');
        h += `<div class="s-item" data-q="${esc(q)}">🔍 "<b>${esc(q)}</b>" için tüm sonuçlar</div>`;
        box.innerHTML = h; box.hidden = false;
        box.querySelectorAll('.s-thumb .em').forEach(e => e.style.fontSize = '18px');
      };
      input.addEventListener('focus', render);
      input.addEventListener('input', U.debounce(render, 120));
      input.addEventListener('keydown', e => {
        const items = U.$$('.s-item', box);
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); act = U.clamp(act + (e.key === 'ArrowDown' ? 1 : -1), 0, items.length - 1); items.forEach((x, i) => x.classList.toggle('act', i === act)); }
        else if (e.key === 'Enter' && act >= 0 && items[act]) { e.preventDefault(); items[act].click(); }
        else if (e.key === 'Escape') box.hidden = true;
      });
      box.addEventListener('mousedown', e => {
        const it = e.target.closest('[data-q],[data-href]'); if (!it) return;
        e.preventDefault();
        if (it.dataset.href) { box.hidden = true; Router.go(it.dataset.href); } else { input.value = it.dataset.q; go(it.dataset.q); }
      });
      input.addEventListener('blur', () => setTimeout(() => { box.hidden = true; }, 150));
      form.addEventListener('submit', e => { e.preventDefault(); go(input.value); });
      const vb = U.$('#voice');
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) vb.hidden = true;
      else vb.addEventListener('click', () => {
        try {
          const r = new SR(); r.lang = 'tr-TR';
          r.onresult = ev => { input.value = ev.results[0][0].transcript; go(input.value); };
          r.onerror = () => C.toast('Mikrofona erişilemedi. Tarayıcı izinlerini kontrol et.', { icon: '🎙' });
          r.start(); C.toast('Dinliyorum… aradığın ürünü söyle', { icon: '🎙' });
        } catch (e) { C.toast('Sesli arama bu tarayıcıda desteklenmiyor', { icon: '🎙' }); }
      });
    },

    updateBadges() {
      const cc = Svc.cartCount();
      U.$$('[data-cart-count]').forEach(el => { el.textContent = cc; el.hidden = !cc; });
    },

    toggleTheme() {
      const cur = document.documentElement.getAttribute('data-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      Store.set('carsim_theme', next);
    },

    /* ---------- Karşılaştırma çubuğu ---------- */
    renderCmpTray(show = true) {
      let el = U.$('#cmpTray');
      const ids = Svc.cmp();
      const path = Router.current().path;
      if (!show || !ids.length || path === '/compare') { if (el) el.remove(); return; }
      if (!el) { el = document.createElement('div'); el.id = 'cmpTray'; el.className = 'cmp-tray'; document.body.appendChild(el); }
      el.innerHTML = `<span>⚖️ ${ids.length} ürün karşılaştırmada</span><button class="btn btn-sm btn-ghost" id="cmpClr">Temizle</button><a class="btn btn-sm btn-primary" href="#/compare">Karşılaştır</a>`;
      U.$('#cmpClr', el).onclick = () => { Store.set('carsim_cmp', []); this.renderCmpTray(); U.$$('[data-cmp]').forEach(c => { c.checked = false; c.parentElement.classList.remove('on'); }); };
    },

    /* ---------- Akıllı alışveriş asistanı ---------- */
    renderBot(show) {
      let fab = U.$('#botFab'), win = U.$('#botWin');
      if (!show) { fab && fab.remove(); win && win.remove(); return; }
      if (!fab) {
        fab = document.createElement('button');
        fab.id = 'botFab'; fab.className = 'bot-fab'; fab.setAttribute('aria-label', 'Alışveriş asistanı');
        fab.innerHTML = '<span class="spark">✦</span><span class="t">Asistana sor</span>';
        fab.onclick = () => { this.botOpen = !this.botOpen; this.renderBot(true); };
        document.body.appendChild(fab);
      }
      if (!this.botOpen) { win && win.remove(); return; }
      if (!win) {
        win = document.createElement('section');
        win.id = 'botWin'; win.className = 'bot'; win.setAttribute('aria-label', 'MarkaBahçem asistanı');
        win.innerHTML = `<div class="bot-h"><span class="spark" style="width:32px;height:32px;border-radius:50%;background:var(--brand);display:grid;place-items:center;color:var(--brand-ink)">✦</span><div class="grow"><b>MarkaBahçem Asistan</b><div class="xs" style="opacity:.7">Ne istediğini yaz, ben bulayım</div></div><button class="icon-btn" id="botX" style="color:inherit" aria-label="Kapat">✕</button></div>
          <div class="bot-b" id="botB" aria-live="polite"></div>
          <div class="bot-sugs" id="botS">${['1000 TL altı kablosuz kulaklık', 'anneme 500 TL altı hediye', 'kargo bedava spor ayakkabı', 'en iyi dış cephe boyası', 'siparişim nerede', 'kuponlar'].map(s => `<button data-s="${esc(s)}">${esc(s)}</button>`).join('')}</div>
          <form class="bot-f" id="botF"><input class="input" id="botI" placeholder="Örn: 2000 TL altı akıllı saat" autocomplete="off" aria-label="Mesajın"><button class="btn btn-primary" aria-label="Gönder">➤</button></form>`;
        document.body.appendChild(win);
        U.$('#botX').onclick = () => { this.botOpen = false; this.renderBot(true); };
        U.$('#botF').onsubmit = e => { e.preventDefault(); const v = U.$('#botI').value.trim(); if (v) { U.$('#botI').value = ''; this.botAsk(v); } };
        U.$('#botS').onclick = e => { const b = e.target.closest('[data-s]'); if (b) this.botAsk(b.dataset.s); };
        if (!this.botMsgs.length) this.botMsgs.push({ ai: true, html: `Merhaba${Auth.user() ? ' ' + esc(Auth.user().name.split(' ')[0]) : ''} 👋 Ben MarkaBahçem Asistan. Bütçeni, ihtiyacını ya da kime hediye alacağını yaz; mağazaları senin için tarayıp en uygun ürünleri getireyim.` });
        this.drawBot();
        setTimeout(() => U.$('#botI') && U.$('#botI').focus(), 50);
      }
    },
    drawBot() {
      const b = U.$('#botB'); if (!b) return;
      b.innerHTML = this.botMsgs.map(m => `<div class="msg ${m.ai ? 'ai' : 'me'}">${m.html}</div>`).join('');
      b.scrollTop = b.scrollHeight;
    },
    botAsk(text) {
      this.botMsgs.push({ ai: false, html: esc(text) });
      this.botMsgs.push({ ai: true, html: '<span class="typing"><span></span><span></span><span></span></span>' });
      this.drawBot();
      setTimeout(() => {
        const r = Svc.assistant(text);
        let h = r.text;
        if (r.products) h += `<div class="mini-prods">${r.products.map(p => `<a href="#/p/${p.id}"><span class="thumb">${K.img(p.images[0])}</span><span class="grow small"><b>${esc(p.brand)}</b> ${esc(p.title)}<br>${p.reviewCount ? '★ ' + p.rating.toFixed(1).replace('.', ',') + ' · ' : ''}<b class="brand">${U.tl(Svc.priceInfo(p).price)}</b></span></a>`).join('')}</div>`;
        if (r.link) h += `<div style="margin-top:8px"><a class="btn btn-sm btn-soft" href="#${r.link[0]}">${esc(r.link[1])} →</a></div>`;
        this.botMsgs[this.botMsgs.length - 1] = { ai: true, html: h };
        this.drawBot();
      }, 450 + Math.random() * 400);
    }
  };

  /* ---------- Rotalar ---------- */
  function routes() {
    const P = C.Pages, S = C.SellerPages, A = C.AdminPages;
    const r = (p, h) => Router.add(p, h);
    r('/', P.home); r('/search', P.search); r('/p/:id', P.product); r('/store/:id', P.store); r('/stores', P.stores);
    r('/deals', P.deals); r('/cart', P.cart); r('/checkout', P.checkout); r('/order-success/:id', P.orderSuccess);
    r('/account', P.account); r('/account/:tab', P.account); r('/account/orders/:id', P.orderDetail);
    r('/compare', P.compare); r('/categories', P.categories); r('/login', P.login); r('/register', P.register);
    r('/sell', P.sell); r('/help', P.help);
    r('/seller', S.dashboard); r('/seller/orders', S.orders); r('/seller/returns', S.returns); r('/seller/products', S.products);
    r('/seller/products/new', S.productEdit); r('/seller/products/:id', S.productEdit); r('/seller/questions', S.questions);
    r('/seller/reviews', S.reviews); r('/seller/design', S.design); r('/seller/campaigns', S.campaigns); r('/seller/reports', S.reports);
    r('/seller/finance', S.finance); r('/seller/settings', S.settings);
    r('/seller/xml', S.xml); r('/seller/pricing', S.pricing); r('/seller/price-requests', S.priceRequests); r('/admin/price-requests', A.priceRequests);
    r('/admin/integrations', A.integrations); r('/admin/dropship', A.dropship); r('/admin/sms', A.sms); r('/payment-result', P.paymentResult);
    r('/admin', A.dashboard); r('/admin/sellers', A.sellers); r('/admin/products', A.products); r('/admin/orders', A.orders);
    r('/admin/users', A.users); r('/admin/categories', A.categories); r('/admin/banners', A.banners); r('/admin/deals', A.deals);
    r('/admin/coupons', A.coupons); r('/admin/reports', A.reports); r('/admin/risk', A.risk); r('/admin/settings', A.settings);
  }

  function boot() {
    const t = Store.get('carsim_theme');
    if (t) document.documentElement.setAttribute('data-theme', t);
    DB.load();
    Svc.ensureDeals();
    routes();
    Router.start();
    setInterval(() => K.tickCountdowns(), 1000);
    window.addEventListener('beforeunload', () => DB.flush());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
