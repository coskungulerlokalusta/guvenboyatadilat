/* MarkaBahçem — platform yönetim paneli */
(function () {
  'use strict';
  const C = window.Carsim;
  const { U, Svc, K, Auth, DB, Router, Modal, Chart, Store } = C;
  const esc = U.esc;
  const go = p => Router.go(p);
  const A = C.AdminPages = {};

  function guard() {
    const u = Auth.user();
    if (!u) return { redirect: '/login?next=' + encodeURIComponent(Router.path) };
    if (u.role !== 'admin') return { redirect: '/' };
    return null;
  }
  const page = o => Object.assign({ layout: 'panel', panel: 'admin' }, o);
  const colors = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];
  const impersonate = (uid, to) => { Store.set('carsim_admin_back', Auth.user().id); Auth.loginAs(uid); C.toast('Kullanıcı olarak görüntülüyorsun. Yönetici hesabına dönmek için çıkış yapıp tekrar giriş yap.', { icon: '🕶', ms: 4500 }); go(to); };

  /* =============== KONTROL PANELİ =============== */
  A.dashboard = (_, q) => {
    const g = guard(); if (g) return g;
    const d = +q.d || 30;
    const s = Svc.stats({ days: d });
    const stores = DB.all('stores');
    const pendS = stores.filter(x => x.status === 'pending');
    const pendP = DB.where('products', p => p.status === 'pending');
    const rets = Svc.packagesIn(0, Date.now()).filter(x => x.pk.status === 'returnRequested');
    const payReq = DB.where('payouts', p => p.status === 'requested');
    const newUsers = DB.where('users', u => u.createdAt >= s.from).length;
    const perStore = stores.filter(x => x.status === 'active').map(st => { const r = s.rows.filter(x => x.pk.storeId === st.id && x.pk.status !== 'cancelled'); return { st, rev: U.sum(r, x => x.pk.subtotal), n: r.length, com: U.sum(r, x => Svc.commissionOf(x.pk)) }; }).sort((a, b) => b.rev - a.rev);
    const risks = Svc.risks();
    const todo = [
      [pendS.length, '🏪', 'mağaza başvurusu onay bekliyor', '/admin/sellers?s=pending'],
      [pendP.length, '🏷', 'ürün moderasyon bekliyor', '/admin/products'],
      [rets.length, '↩️', 'iade talebi satıcıda bekliyor', '/admin/orders?s=returnRequested'],
      [payReq.length, '💰', 'erken ödeme talebi var', '/admin/sellers'],
      [risks.length, '🚩', 'risk sinyali tespit edildi', '/admin/risk']
    ].filter(x => x[0]);
    const html = `
      <div class="kpis">
        ${K.kpi('Brüt satış (GMV)', U.tl0(s.revenue), s.dRevenue, Chart.spark(s.series.map(x => x.rev)))}
        ${K.kpi('Sipariş', U.num(s.orders), s.dOrders, Chart.spark(s.series.map(x => x.orders), 'var(--c2)'))}
        ${K.kpi('Komisyon geliri', U.tl0(s.commission), null, '', 'Teslim edilen ve yoldaki siparişlerden')}
        ${K.kpi('Ortalama sepet', U.tl0(s.aov), s.prevAov ? (s.aov - s.prevAov) / s.prevAov * 100 : null)}
        ${K.kpi('Aktif mağaza', U.num(stores.filter(x => x.status === 'active').length), null, `<span class="xs muted">${pendS.length} başvuru bekliyor</span>`)}
        ${K.kpi('Yeni üye', U.num(newUsers), null, `<span class="xs muted">${U.num(s.customers)} tekil alıcı</span>`)}
      </div>
      ${todo.length ? `<div class="card card-pad" style="margin-top:16px"><h3>Yapılacaklar</h3><div class="row" style="gap:10px">${todo.map(t => `<a class="alert-row" href="#${t[3]}" style="flex:1;min-width:230px"><span class="ai" style="background:var(--brand-soft)">${t[1]}</span><div><b style="font:700 1.3rem var(--f-display)">${t[0]}</b><div class="small">${t[2]}</div></div></a>`).join('')}</div></div>` : ''}
      <div class="g2" style="margin-top:16px">
        <div class="card card-pad"><div class="row between" style="margin-bottom:8px"><h3 style="margin:0">Günlük GMV ve komisyon</h3><div class="legend"><span><i style="background:var(--c1)"></i>GMV</span></div></div>
          ${Chart.line({ series: [{ name: 'GMV', values: s.series.map(x => U.round2(x.rev)), color: 'var(--c1)' }], labels: s.series.map(x => U.dayMonth(x.t)), money: true, height: 260 })}</div>
        <div class="card card-pad"><h3>Kategori payları</h3>${Chart.donut({ items: s.byCat.slice(0, 6).map((c, i) => ({ label: c.name, value: c.value, color: colors[i] })), money: true, center: Chart.short(s.revenue) })}</div>
      </div>
      <div class="g2" style="margin-top:16px">
        <div class="card"><div class="row between" style="padding:16px 18px 0"><h3 style="margin:0">Mağaza sıralaması</h3><a class="small brand bold" href="#/admin/sellers">Tümü →</a></div><div style="overflow-x:auto;padding-top:8px"><table class="tbl"><thead><tr><th>Mağaza</th><th class="r">Sipariş</th><th class="r">GMV</th><th class="r">Komisyon</th><th class="r">Puan</th></tr></thead><tbody>
          ${perStore.slice(0, 8).map(x => `<tr><td><div class="row nowrap" style="gap:8px">${K.storeAvatar(x.st, 30)}<a href="#/store/${x.st.id}" class="small bold">${esc(x.st.name)}</a></div></td><td class="r">${x.n}</td><td class="r"><b>${U.tl0(x.rev)}</b></td><td class="r">${U.tl0(x.com)}</td><td class="r"><span class="score" style="height:22px">${Svc.storeScore(x.st).toFixed(1).replace('.', ',')}</span></td></tr>`).join('')}</tbody></table></div></div>
        <div class="card card-pad"><h3>Sipariş yoğunluğu</h3>${Chart.heat(s.heat)}<div class="row small" style="margin-top:14px;gap:16px"><span>İptal <b>%${s.cancelRate.toFixed(1).replace('.', ',')}</b></span><span>İade <b>%${s.returnRate.toFixed(1).replace('.', ',')}</b></span><span>Satılan ürün <b>${U.num(s.units)}</b></span></div></div>
      </div>`;
    return page({
      title: 'Kontrol paneli', sub: `Pazaryerinin son ${d} günü`, actions: `<div class="seg" id="period">${[[7, '7 gün'], [30, '30 gün'], [90, '90 gün']].map(([v, l]) => `<button class="${d === v ? 'on' : ''}" data-d="${v}">${l}</button>`).join('')}</div>`, html,
      mount() { U.$('#period').onclick = e => { const b = e.target.closest('[data-d]'); if (b) go('/admin?d=' + b.dataset.d); }; }
    });
  };

  /* =============== MAĞAZALAR =============== */
  A.sellers = (_, q) => {
    const g = guard(); if (g) return g;
    const tab = q.s || 'all';
    const all = DB.all('stores');
    let list = tab === 'all' ? all : all.filter(s => s.status === tab);
    if (q.q) { const n = U.norm(q.q); list = list.filter(s => U.norm(s.name + ' ' + s.city).includes(n)); }
    const s30 = Svc.stats({ days: 30 });
    const rev = sid => U.sum(s30.rows.filter(x => x.pk.storeId === sid && x.pk.status !== 'cancelled'), x => x.pk.subtotal);
    const payReq = DB.where('payouts', p => p.status === 'requested');
    const html = `
      ${payReq.length ? `<div class="card card-pad" style="margin-bottom:16px"><h3>💰 Erken ödeme talepleri</h3>${payReq.map(p => `<div class="row between" style="padding:8px 0;border-bottom:1px solid var(--line)"><span class="small"><b>${esc(Svc.store(p.storeId).name)}</b> · ${U.ago(p.createdAt)}</span><div class="row"><b>${U.tl(p.amount)}</b><button class="btn btn-sm btn-ok" data-pay="${p.id}">Ödemeyi onayla</button></div></div>`).join('')}</div>` : ''}
      <div class="tabs" style="margin-bottom:14px">${[['all', 'Tümü'], ['pending', 'Başvurular'], ['active', 'Aktif'], ['suspended', 'Askıda'], ['rejected', 'Reddedilen']].map(([k, l]) => { const n = k === 'all' ? all.length : all.filter(s => s.status === k).length; return `<a class="${tab === k ? 'on' : ''}" href="#/admin/sellers?s=${k}">${l} <span class="badge ${k === 'pending' && n ? 'b-brand' : 'b-mute'}">${n}</span></a>`; }).join('')}</div>
      <div class="toolbar"><form id="sq" class="row nowrap grow" style="max-width:380px"><input class="input" id="sqi" placeholder="Mağaza veya şehir ara" value="${esc(q.q || '')}"><button class="btn">Ara</button></form></div>
      ${list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Mağaza</th><th>Yetkili</th><th class="r">Ürün</th><th class="r">30 gün GMV</th><th class="r">Puan</th><th>Komisyon</th><th>Durum</th><th></th></tr></thead><tbody>
        ${list.map(s => { const o = Svc.user(s.ownerId); const pc = DB.where('products', p => p.storeId === s.id).length; return `<tr>
          <td><div class="row nowrap" style="gap:10px">${K.storeAvatar(s, 36)}<div><a href="#/store/${s.id}" class="bold small">${esc(s.name)}</a>${s.house ? ' <span class="badge b-teal">Kendi mağazan</span>' : ''}${s.official ? ' <span class="badge b-info">Resmi</span>' : ''}<div class="xs muted">${esc(s.city)} · ${U.date(s.createdAt)}${s.appCategory ? ' · ' + esc(Svc.cat(s.appCategory).name) : ''}</div></div></div></td>
          <td class="small">${esc(o ? o.name : '—')}<div class="xs muted">${esc(o ? o.email : '')}</div></td>
          <td class="r">${pc}</td><td class="r">${U.tl0(rev(s.id))}</td><td class="r">${s.status === 'active' ? `<span class="score" style="height:22px">${Svc.storeScore(s).toFixed(1).replace('.', ',')}</span>` : '—'}</td>
          <td><select class="select" data-com="${s.id}" style="width:120px;padding:6px 8px" aria-label="Komisyon"><option value="">Kategori oranı</option>${[5, 8, 10, 12, 15, 18, 20].map(v => `<option value="${v}" ${s.commission === v ? 'selected' : ''}>%${v}</option>`).join('')}</select></td>
          <td>${K.pill(Svc.STORE_STATUS, s.status)}</td>
          <td><div class="row nowrap" style="gap:4px">
            ${s.status === 'pending' ? `<button class="btn btn-sm btn-ok" data-approve="${s.id}">Onayla</button><button class="btn btn-sm btn-danger" data-reject="${s.id}">Reddet</button>` : ''}
            ${s.status === 'active' ? `<button class="btn btn-sm" data-suspend="${s.id}">Askıya al</button><button class="btn btn-sm btn-ghost" data-official="${s.id}" title="Resmi satıcı rozeti">${s.official ? '✔︎ Rozet' : '+ Rozet'}</button>` : ''}
            ${['suspended', 'rejected'].includes(s.status) ? `<button class="btn btn-sm btn-ok" data-approve="${s.id}">Aktif et</button>` : ''}
            ${o ? `<button class="btn btn-sm btn-ghost" data-imp="${o.id}" title="Satıcı paneline gir">🕶</button>` : ''}</div></td></tr>`; }).join('')}
      </tbody></table></div>` : K.empty('🏪', 'Bu filtrede mağaza yok')}`;
    return page({
      title: 'Mağazalar', sub: 'Başvuruları onayla, komisyon ve rozetleri yönet', html,
      mount(main) {
        U.$('#sq', main).onsubmit = e => { e.preventDefault(); go('/admin/sellers' + U.qs({ s: tab, q: U.$('#sqi').value })); };
        main.addEventListener('change', e => { const t = e.target.closest('[data-com]'); if (t) { const s = Svc.store(+t.dataset.com); s.commission = t.value === '' ? null : +t.value; if (s.commission == null) delete s.commission; DB.save(); C.toast(`${s.name} komisyonu güncellendi`); } });
        main.addEventListener('click', async e => {
          let b;
          if ((b = e.target.closest('[data-approve]'))) { const s = Svc.store(+b.dataset.approve); s.status = 'active'; s.rejectReason = ''; s.followerBase = s.followerBase || 0; DB.save(); Svc.notify(s.ownerId, `🎉 ${s.name} mağazan onaylandı! Ürünlerin artık vitrinde.`, '/seller'); if (C.Sms) { const ow = Svc.user(s.ownerId); C.Sms.event('storeApproved', s.phone || (ow && ow.phone), { ad: ow ? ow.name.split(' ')[0] : '', magaza: s.name }); } Svc._vocab = null; C.toast(s.name + ' aktif edildi'); Router.refresh(); }
          else if ((b = e.target.closest('[data-reject]')) || (b = e.target.closest('[data-suspend]'))) {
            const rej = !!b.dataset.reject; const s = Svc.store(+(b.dataset.reject || b.dataset.suspend));
            const r = await Modal.prompt(rej ? `${s.name} başvurusunu reddet` : `${s.name} mağazasını askıya al`, { label: 'Satıcıya iletilecek gerekçe', textarea: true, value: rej ? 'Vergi levhası bilgileri doğrulanamadı.' : 'Yüksek iptal oranı nedeniyle mağaza incelemeye alındı.', ok: rej ? 'Reddet' : 'Askıya al' });
            if (r == null) return; s.status = rej ? 'rejected' : 'suspended'; s.rejectReason = r; DB.save(); Svc.notify(s.ownerId, `${rej ? '✕ Mağaza başvurun reddedildi' : '⛔ Mağazan askıya alındı'}: ${r}`, '/seller'); Router.refresh();
          }
          else if ((b = e.target.closest('[data-official]'))) { const s = Svc.store(+b.dataset.official); s.official = !s.official; DB.save(); Router.refresh(); }
          else if ((b = e.target.closest('[data-imp]'))) impersonate(+b.dataset.imp, '/seller');
          else if ((b = e.target.closest('[data-pay]'))) { const p = DB.get('payouts', b.dataset.pay); p.status = 'paid'; DB.save(); Svc.notify(Svc.store(p.storeId).ownerId, `💰 ${U.tl(p.amount)} tutarındaki ödemen hesabına gönderildi`, '/seller/finance'); C.toast('Ödeme onaylandı'); Router.refresh(); }
        });
      }
    });
  };

  /* =============== ÜRÜN ONAYI =============== */
  A.products = (_, q) => {
    const g = guard(); if (g) return g;
    const tab = q.s || 'pending';
    const all = DB.all('products');
    let list = tab === 'all' ? all : tab === 'featured' ? all.filter(p => p.featured) : all.filter(p => p.status === tab);
    if (q.q) { const n = U.norm(q.q); list = list.filter(p => U.norm(p.title + ' ' + p.brand + ' ' + p.sku).includes(n)); }
    list = list.slice().sort((a, b) => b.createdAt - a.createdAt);
    const shown = list.slice(0, 120);
    const html = `
      <div class="tabs" style="margin-bottom:14px">${[['pending', 'Onay bekleyen'], ['active', 'Yayında'], ['rejected', 'Reddedilen'], ['passive', 'Pasif'], ['featured', 'Öne çıkan'], ['all', 'Tümü']].map(([k, l]) => { const n = k === 'all' ? all.length : k === 'featured' ? all.filter(p => p.featured).length : all.filter(p => p.status === k).length; return `<a class="${tab === k ? 'on' : ''}" href="#/admin/products?s=${k}">${l} <span class="badge ${k === 'pending' && n ? 'b-brand' : 'b-mute'}">${n}</span></a>`; }).join('')}</div>
      <div class="toolbar"><form id="pq" class="row nowrap grow" style="max-width:420px"><input class="input" id="pqi" placeholder="Ürün, marka veya stok kodu" value="${esc(q.q || '')}"><button class="btn">Ara</button></form>
        <label class="check small" style="margin-left:auto"><span class="switch"><input type="checkbox" id="modT" ${DB.settings.productModeration ? 'checked' : ''}><span></span></span> Yeni ürünler onaya düşsün</label></div>
      ${shown.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Ürün</th><th>Mağaza</th><th>Kategori</th><th class="r">Fiyat</th><th>Kontrol</th><th>Durum</th><th></th></tr></thead><tbody>
        ${shown.map(p => { const an = Svc.priceAnalysis(p); const flags = []; if (an.fake) flags.push('<span class="badge b-warn">Şüpheli indirim</span>'); if (!p.description || p.description.length < 60) flags.push('<span class="badge b-mute">Kısa açıklama</span>'); if (/replika|çakma|muadil/i.test(p.title + p.description)) flags.push('<span class="badge b-bad">Yasaklı kelime</span>'); return `<tr>
          <td><div class="row nowrap" style="gap:10px"><span class="thumb">${K.img(p.images[0])}</span><div style="min-width:0"><a href="#/p/${p.id}" class="small bold" style="display:block;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.title)}</a><div class="xs muted">${esc(p.brand)} · ${esc(p.sku)} · ${U.ago(p.createdAt)}</div></div></div></td>
          <td class="small">${esc((Svc.store(p.storeId) || {}).name)}</td><td class="small">${esc(Svc.cat(p.categoryId).name)} › ${esc(p.sub)}</td><td class="r">${U.tl(p.price)}${p.listPrice ? `<div class="xs muted" style="text-decoration:line-through">${U.tl(p.listPrice)}</div>` : ''}</td>
          <td><div class="row" style="gap:4px">${flags.join('') || '<span class="badge b-ok">Temiz</span>'}</div></td><td>${K.pill(Svc.PROD_STATUS, p.status)}</td>
          <td><div class="row nowrap" style="gap:4px">${p.status !== 'active' ? `<button class="btn btn-sm btn-ok" data-ok="${p.id}">Onayla</button>` : `<button class="btn btn-sm btn-ghost" data-feat="${p.id}" title="Öne çıkar">${p.featured ? '★' : '☆'}</button>`}${p.status !== 'rejected' ? `<button class="btn btn-sm btn-danger" data-rej="${p.id}">${p.status === 'active' ? 'Yayından kaldır' : 'Reddet'}</button>` : ''}</div></td></tr>`; }).join('')}
      </tbody></table></div>${list.length > 120 ? `<p class="small muted" style="margin-top:8px">İlk 120 ürün gösteriliyor (toplam ${list.length}).</p>` : ''}` : K.empty('✅', 'Onay bekleyen ürün yok', 'Tüm ürünler incelenmiş.')}`;
    return page({
      title: 'Ürün onayı', sub: 'Ürün kalitesini ve platform kurallarını denetle', html,
      mount(main) {
        U.$('#pq', main).onsubmit = e => { e.preventDefault(); go('/admin/products' + U.qs({ s: tab, q: U.$('#pqi').value })); };
        U.$('#modT', main).onchange = e => { DB.settings.productModeration = e.target.checked; DB.save(); C.toast(e.target.checked ? 'Yeni ürünler artık onaya düşecek' : 'Yeni ürünler doğrudan yayına girecek'); };
        main.addEventListener('click', async e => {
          let b;
          if ((b = e.target.closest('[data-ok]'))) { const p = Svc.product(+b.dataset.ok); p.status = 'active'; p.rejectReason = ''; DB.save(); Svc._vocab = null; Svc.notify(Svc.store(p.storeId).ownerId, `✅ "${p.title}" onaylandı ve yayında`, '/p/' + p.id); C.toast('Ürün yayına alındı'); Router.refresh(); }
          else if ((b = e.target.closest('[data-rej]'))) { const p = Svc.product(+b.dataset.rej); const r = await Modal.prompt('Ürünü reddet / kaldır', { label: 'Satıcıya iletilecek gerekçe', textarea: true, value: 'Ürün görselleri yetersiz, lütfen gerçek ürün fotoğrafı ekleyin.', ok: 'Gönder' }); if (r == null) return; p.status = 'rejected'; p.rejectReason = r; DB.save(); Svc.notify(Svc.store(p.storeId).ownerId, `✕ "${p.title}" reddedildi: ${r}`, '/seller/products/' + p.id); Router.refresh(); }
          else if ((b = e.target.closest('[data-feat]'))) { const p = Svc.product(+b.dataset.feat); p.featured = !p.featured; DB.save(); b.textContent = p.featured ? '★' : '☆'; C.toast(p.featured ? 'Ürün öne çıkarıldı' : 'Öne çıkarma kaldırıldı'); }
        });
      }
    });
  };

  /* =============== SİPARİŞLER =============== */
  A.orders = (_, q) => {
    const g = guard(); if (g) return g;
    const tab = q.s || 'all';
    let rows = Svc.packagesIn(0, Date.now()).sort((a, b) => b.o.createdAt - a.o.createdAt);
    const count = s => s === 'all' ? rows.length : rows.filter(x => x.pk.status === s).length;
    if (tab !== 'all') rows = rows.filter(x => x.pk.status === tab);
    if (q.q) { const n = U.lower(q.q); rows = rows.filter(x => String(x.o.id).includes(n) || U.lower(x.o.address.name).includes(n)); }
    const tabs = [['all', 'Tümü'], ['new', 'Yeni'], ['preparing', 'Hazırlanıyor'], ['shipped', 'Kargoda'], ['delivered', 'Teslim'], ['returnRequested', 'İade talebi'], ['cancelled', 'İptal']];
    const late = rows.filter(x => x.pk.status === 'new' && Date.now() - x.o.createdAt > 2 * U.DAY).length;
    const html = `<div class="tabs" style="margin-bottom:14px">${tabs.map(([k, l]) => `<a class="${tab === k ? 'on' : ''}" href="#/admin/orders?s=${k}">${l} <span class="badge b-mute">${count(k)}</span></a>`).join('')}</div>
      ${late ? `<div class="insight warnish" style="margin-bottom:14px"><span class="ii">⏰</span><div class="small"><b>${late} sipariş</b> 48 saattir satıcı onayı bekliyor. Satıcılara hatırlatma gönderilebilir.</div></div>` : ''}
      <div class="toolbar"><form id="oq" class="row nowrap grow" style="max-width:380px"><input class="input" id="oqi" placeholder="Sipariş no veya müşteri" value="${esc(q.q || '')}"><button class="btn">Ara</button></form><button class="btn" id="exp" style="margin-left:auto">⬇ Excel'e aktar</button></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Sipariş</th><th>Müşteri</th><th>Mağaza</th><th class="r">Tutar</th><th class="r">Komisyon</th><th>Ödeme</th><th>Durum</th><th></th></tr></thead><tbody>
        ${rows.slice(0, 150).map(({ o, pk }) => `<tr><td><b>#${o.id}</b><div class="xs muted">${U.dateTime(o.createdAt)}</div></td><td class="small">${esc(o.address.name)}<div class="xs muted">${esc(o.address.city)}</div></td><td class="small">${esc(Svc.store(pk.storeId).name)}</td><td class="r">${U.tl(pk.subtotal)}</td><td class="r small">${U.tl(Svc.commissionOf(pk))}</td><td class="xs">${o.payment.method === 'card' ? '💳 ' + (o.payment.installments > 1 ? o.payment.installments + ' taksit' : 'Tek çekim') : o.payment.method === 'cod' ? '🚪 Kapıda' : '🏦 Havale'}</td><td>${K.status(pk.status)}</td>
          <td><div class="row nowrap" style="gap:4px">${pk.status === 'returnRequested' ? `<button class="btn btn-sm btn-ok" data-ret="${o.id}|${pk.storeId}">İadeyi onayla</button>` : ''}${['new', 'preparing'].includes(pk.status) ? `<button class="btn btn-sm btn-ghost" data-can="${o.id}|${pk.storeId}">İptal et</button>` : ''}${pk.status === 'new' && Date.now() - o.createdAt > 2 * U.DAY ? `<button class="btn btn-sm btn-ghost" data-nudge="${o.id}|${pk.storeId}">🔔</button>` : ''}</div></td></tr>`).join('')}
      </tbody></table></div>${rows.length > 150 ? `<p class="small muted" style="margin-top:8px">İlk 150 kayıt gösteriliyor (toplam ${rows.length}).</p>` : ''}`;
    return page({
      title: 'Siparişler', sub: 'Tüm mağazaların paketleri', html,
      mount(main) {
        U.$('#oq', main).onsubmit = e => { e.preventDefault(); go('/admin/orders' + U.qs({ s: tab, q: U.$('#oqi').value })); };
        U.$('#exp', main).onclick = () => U.download('tum-siparisler.csv', U.csv([['Sipariş', 'Tarih', 'Müşteri', 'İl', 'Mağaza', 'Tutar', 'Komisyon', 'Durum']].concat(rows.map(({ o, pk }) => [o.id, U.dateS(o.createdAt), o.address.name, o.address.city, Svc.store(pk.storeId).name, pk.subtotal.toFixed(2).replace('.', ','), Svc.commissionOf(pk).toFixed(2).replace('.', ','), Svc.STATUS[pk.status].label]))));
        main.addEventListener('click', async e => {
          const b = e.target.closest('[data-ret],[data-can],[data-nudge]'); if (!b) return;
          const [oid, sid] = (b.dataset.ret || b.dataset.can || b.dataset.nudge).split('|').map(Number);
          const o = DB.all('orders').find(x => x.id === oid);
          if (b.dataset.ret) { Svc.pkgStatus(o, sid, 'returned'); C.toast('İade platform tarafından onaylandı'); Router.refresh(); }
          else if (b.dataset.can) { if (await Modal.confirm(`#${oid} paketini iptal etmek istiyor musun? Müşteriye ücret iadesi yapılır.`, { ok: 'İptal et', danger: true })) { Svc.pkgStatus(o, sid, 'cancelled'); Router.refresh(); } }
          else { Svc.notify(Svc.store(sid).ownerId, `⏰ #${oid} siparişi 48 saattir onay bekliyor. Lütfen en kısa sürede kargoya ver.`, '/seller/orders'); const st = Svc.store(sid), ow = Svc.user(st.ownerId); if (C.Sms) { C.Sms.send(st.phone || (ow && ow.phone), `MarkaBahcem: #${oid} numarali siparis 48 saattir onay bekliyor. Lutfen satici panelinden kargoya verin.`, 'lateOrder').catch(() => {}); C.Sms.voice(st.phone || (ow && ow.phone)); } C.toast('Satıcıya bildirim, SMS' + (C.Sms && DB.settings.sms && DB.settings.sms.voiceLateOrder ? ' ve sesli arama' : '') + ' ile hatırlatma gönderildi'); }
        });
      }
    });
  };

  /* =============== KULLANICILAR =============== */
  A.users = (_, q) => {
    const g = guard(); if (g) return g;
    const role = q.r || 'all';
    let list = DB.all('users');
    if (role !== 'all') list = list.filter(u => u.role === role);
    if (q.q) { const n = U.norm(q.q); list = list.filter(u => U.norm(u.name + ' ' + u.email).includes(n)); }
    const spend = new Map(), cnt = new Map();
    DB.all('orders').forEach(o => { spend.set(o.userId, (spend.get(o.userId) || 0) + o.total); cnt.set(o.userId, (cnt.get(o.userId) || 0) + 1); });
    list = list.slice().sort((a, b) => (spend.get(b.id) || 0) - (spend.get(a.id) || 0));
    const roleL = { customer: ['Müşteri', 'b-info'], seller: ['Satıcı', 'b-brand'], admin: ['Yönetici', 'b-teal'] };
    const html = `<div class="toolbar"><div class="seg" id="rs">${[['all', 'Tümü'], ['customer', 'Müşteri'], ['seller', 'Satıcı'], ['admin', 'Yönetici']].map(([k, l]) => `<button class="${role === k ? 'on' : ''}" data-r="${k}">${l}</button>`).join('')}</div><form id="uq" class="row nowrap grow" style="max-width:360px"><input class="input" id="uqi" placeholder="Ad veya e-posta" value="${esc(q.q || '')}"><button class="btn">Ara</button></form></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Kullanıcı</th><th>Rol</th><th class="r">Sipariş</th><th class="r">Harcama</th><th>Üyelik</th><th></th></tr></thead><tbody>
      ${list.slice(0, 150).map(u => `<tr><td><div class="row nowrap" style="gap:10px"><div class="store-avatar" style="width:34px;height:34px;font-size:.8rem;background:var(--sunken);color:var(--ink);font-weight:800">${esc(U.initials(u.name))}</div><div><b class="small">${esc(u.name)}</b>${u.banned ? ' <span class="badge b-bad">Engelli</span>' : ''}<div class="xs muted">${esc(u.email)}</div></div></div></td><td>${K.pill(roleL, u.role)}${u.storeId ? `<div class="xs muted">${esc((Svc.store(u.storeId) || {}).name || '')}</div>` : ''}</td><td class="r">${cnt.get(u.id) || 0}</td><td class="r">${U.tl0(spend.get(u.id) || 0)}</td><td class="small">${U.date(u.createdAt)}</td>
        <td><div class="row nowrap" style="gap:4px">${u.role !== 'admin' ? `<button class="btn btn-sm btn-ghost" data-imp="${u.id}" title="Kullanıcı gözünden gör">🕶</button><button class="btn btn-sm ${u.banned ? 'btn-ok' : 'btn-ghost'}" data-ban="${u.id}">${u.banned ? 'Engeli kaldır' : 'Engelle'}</button>` : ''}</div></td></tr>`).join('')}
      </tbody></table></div>`;
    return page({
      title: 'Kullanıcılar', sub: `${DB.all('users').length} kayıtlı kullanıcı`, html,
      mount(main) {
        U.$('#rs', main).onclick = e => { const b = e.target.closest('[data-r]'); if (b) go('/admin/users?r=' + b.dataset.r); };
        U.$('#uq', main).onsubmit = e => { e.preventDefault(); go('/admin/users' + U.qs({ r: role, q: U.$('#uqi').value })); };
        main.addEventListener('click', e => {
          let b;
          if ((b = e.target.closest('[data-ban]'))) { const u = Svc.user(+b.dataset.ban); u.banned = !u.banned; DB.save(); C.toast(u.banned ? u.name + ' engellendi' : 'Engel kaldırıldı'); Router.refresh(); }
          else if ((b = e.target.closest('[data-imp]'))) { const u = Svc.user(+b.dataset.imp); impersonate(u.id, u.role === 'seller' ? '/seller' : '/account/orders'); }
        });
      }
    });
  };

  /* =============== KATEGORİ & KOMİSYON =============== */
  A.categories = () => {
    const g = guard(); if (g) return g;
    const cats = DB.all('categories');
    const s = Svc.stats({ days: 30 });
    const html = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Kategori</th><th>Alt kategoriler</th><th class="r">Ürün</th><th class="r">30 gün GMV</th><th>Komisyon</th><th>Aktif</th></tr></thead><tbody>
      ${cats.map(c => `<tr><td><div class="row nowrap"><input class="input" data-icon="${c.id}" value="${esc(c.icon)}" style="width:52px;text-align:center;padding:6px" aria-label="Simge"><input class="input" data-name="${c.id}" value="${esc(c.name)}" style="width:170px;padding:6px 8px" aria-label="Ad"></div></td>
        <td><input class="input" data-subs="${c.id}" value="${esc(c.subs.join(', '))}" style="min-width:260px;padding:6px 8px" aria-label="Alt kategoriler"></td>
        <td class="r">${DB.where('products', p => p.categoryId === c.id).length}</td><td class="r">${U.tl0((s.byCat.find(x => x.id === c.id) || { value: 0 }).value)}</td>
        <td><div class="row nowrap" style="gap:4px">%<input class="input num" type="number" data-rate="${c.id}" value="${c.commission}" min="0" max="40" style="width:70px;padding:6px 8px" aria-label="Komisyon"></div></td>
        <td><label class="switch"><input type="checkbox" data-act="${c.id}" ${c.active ? 'checked' : ''}><span></span></label></td></tr>`).join('')}
      </tbody></table></div>
      <div class="insight info" style="margin-top:14px"><span class="ii">ℹ️</span><div class="small">Komisyon değişiklikleri yeni siparişlere uygulanır. Mağazaya özel oran, Mağazalar ekranından kategori oranının önüne geçer.</div></div>`;
    return page({
      title: 'Kategori & komisyon', sub: 'Kategori ağacı ve komisyon oranları', actions: '<button class="btn btn-primary" id="addCat">+ Kategori ekle</button>', html,
      mount(main) {
        main.addEventListener('change', e => {
          const t = e.target; const id = t.dataset.icon || t.dataset.name || t.dataset.subs || t.dataset.rate || t.dataset.act; if (!id) return;
          const c = DB.get('categories', id);
          if (t.dataset.icon) c.icon = t.value; if (t.dataset.name) c.name = t.value.trim(); if (t.dataset.subs) c.subs = t.value.split(',').map(x => x.trim()).filter(Boolean);
          if (t.dataset.rate) c.commission = U.clamp(+t.value, 0, 40); if (t.dataset.act) c.active = t.checked;
          DB.save(); Svc._vocab = null; C.toast(c.name + ' güncellendi');
        });
        U.$('#addCat').onclick = async () => { const n = await Modal.prompt('Yeni kategori', { label: 'Kategori adı', placeholder: 'Örn: Evcil Hayvan' }); if (!n) return; DB.insert('categories', { name: n.trim(), icon: '🏷', commission: DB.settings.defaultCommission, subs: ['Genel'], slug: U.slug(n), active: true }); Router.refresh(); };
      }
    });
  };

  /* =============== BANNER YÖNETİMİ =============== */
  A.banners = () => {
    const g = guard(); if (g) return g;
    const bs = DB.all('banners').slice().sort((a, b) => (a.place === b.place ? 0 : a.place === 'hero' ? -1 : 1) || a.order - b.order);
    const row = b => `<div class="row nowrap" style="gap:12px;border:1px solid var(--line);border-radius:12px;padding:10px;background:var(--surface)">
      <div class="row" style="flex-direction:column;gap:2px"><button class="btn btn-sm btn-ghost" data-up="${b.id}" aria-label="Yukarı">▲</button><button class="btn btn-sm btn-ghost" data-down="${b.id}" aria-label="Aşağı">▼</button></div>
      <div style="width:200px;height:84px;border-radius:10px;background:${K.bannerBg(b)};color:#fff;padding:10px;position:relative;overflow:hidden;flex:none"><b style="font-size:.8rem;display:block;max-width:70%">${esc(b.title)}</b>${b.img ? '' : `<span style="position:absolute;right:8px;bottom:4px;font-size:34px">${esc(b.emoji)}</span>`}</div>
      <div class="grow" style="min-width:0"><b class="small">${esc(b.title)}</b><div class="xs muted">${esc(b.subtitle)}</div><div class="xs muted">→ ${esc(b.link || '/')} · ${b.place === 'hero' ? 'Ana slider' : 'Yan banner'}</div></div>
      <label class="switch"><input type="checkbox" data-bact="${b.id}" ${b.active ? 'checked' : ''}><span></span></label><button class="btn btn-sm" data-bedit="${b.id}">Düzenle</button><button class="btn btn-sm btn-ghost" data-bdel="${b.id}">🗑</button></div>`;
    const html = `<div class="stack lg"><section class="stack"><div class="row between"><h3 style="margin:0">Ana sayfa slider</h3><a class="small brand bold" href="#/">Ana sayfada gör →</a></div>${bs.filter(b => b.place === 'hero').map(row).join('')}</section>
      <section class="stack"><h3 style="margin:0">Yan bannerlar <span class="small muted">(ilk 2 aktif banner gösterilir)</span></h3>${bs.filter(b => b.place === 'side').map(row).join('')}</section></div>`;
    return page({
      title: 'Banner yönetimi', sub: 'Ana sayfa vitrinini düzenle', actions: '<button class="btn btn-primary" id="addB">+ Yeni banner</button>', html,
      mount(main) {
        U.$('#addB').onclick = () => C.bannerModal(null, v => { DB.insert('banners', Object.assign(v, { active: true, order: DB.all('banners').length + 1 })); Router.refresh(); }, { withPlace: true });
        main.addEventListener('change', e => { const t = e.target.closest('[data-bact]'); if (t) { DB.update('banners', t.dataset.bact, { active: t.checked }); C.toast(t.checked ? 'Banner yayında' : 'Banner gizlendi'); } });
        main.addEventListener('click', e => {
          let b;
          if ((b = e.target.closest('[data-bedit]'))) { const bn = DB.get('banners', b.dataset.bedit); C.bannerModal(bn, v => { Object.assign(bn, v); DB.save(); Router.refresh(); }, { withPlace: true }); }
          else if ((b = e.target.closest('[data-bdel]'))) { DB.remove('banners', b.dataset.bdel); Router.refresh(); }
          else if ((b = e.target.closest('[data-up]')) || (b = e.target.closest('[data-down]'))) {
            const id = +(b.dataset.up || b.dataset.down); const bn = DB.get('banners', id);
            const same = DB.where('banners', x => x.place === bn.place).sort((a, c) => a.order - c.order);
            const i = same.indexOf(bn), j = i + (b.dataset.up ? -1 : 1);
            if (same[j]) { const t = same[j].order; same[j].order = bn.order; bn.order = t; if (same[j].order === bn.order) bn.order += b.dataset.up ? -1 : 1; DB.save(); Router.refresh(); }
          }
        });
      }
    });
  };

  /* =============== FLAŞ FIRSATLAR =============== */
  A.deals = () => {
    const g = guard(); if (g) return g;
    const deals = DB.all('deals');
    const inDeal = new Set(deals.map(d => d.productId));
    const cands = Svc.live().filter(p => !inDeal.has(p.id) && p.stock > 5).sort((a, b) => b.sold - a.sold).slice(0, 200);
    const html = `<div class="card card-pad stack" style="margin-bottom:16px"><div class="row between"><div><h3 style="margin:0">Bugünün flaş fırsatları</h3><p class="small muted">Her gece yarısı otomatik yenilenir. Bitime kalan: ${deals[0] ? K.countdown(deals[0].endsAt) : '—'}</p></div><button class="btn" id="regen">🔀 Otomatik yeniden seç</button></div>
        <form class="row nowrap" id="addD"><select class="select" id="dp">${cands.map(p => `<option value="${p.id}">${esc(p.title.slice(0, 60))} · ${esc(Svc.store(p.storeId).name)} · ${U.tl(p.price)}</option>`).join('')}</select><select class="select" id="dpct" style="width:100px">${[10, 15, 20, 25, 30, 35, 40, 50].map(v => `<option value="${v}" ${v === 20 ? 'selected' : ''}>%${v}</option>`).join('')}</select><button class="btn btn-primary">Ekle</button></form></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Ürün</th><th>Mağaza</th><th class="r">Normal</th><th>İndirim</th><th class="r">Flaş fiyat</th><th>Kampanya stoğu</th><th></th></tr></thead><tbody>
        ${deals.map(d => { const p = Svc.product(d.productId); if (!p) return ''; return `<tr><td><div class="row nowrap" style="gap:8px"><span class="thumb">${K.img(p.images[0])}</span><a href="#/p/${p.id}" class="small">${esc(p.title)}</a></div></td><td class="small">${esc(Svc.store(p.storeId).name)}</td><td class="r">${U.tl(p.price)}</td>
          <td><select class="select" data-pct="${d.id}" style="width:90px;padding:6px">${[10, 15, 20, 25, 30, 35, 40, 50].map(v => `<option value="${v}" ${d.pct === v ? 'selected' : ''}>%${v}</option>`).join('')}</select></td><td class="r"><b class="brand">${U.tl(p.price * (1 - d.pct / 100))}</b></td>
          <td style="min-width:140px"><div class="bar brand"><i style="width:${Math.min(100, d.claimed / d.stockLimit * 100)}%"></i></div><span class="xs muted">${d.claimed}/${d.stockLimit} satıldı</span></td><td><button class="btn btn-sm btn-ghost" data-rm="${d.id}">Kaldır</button></td></tr>`; }).join('')}
      </tbody></table></div>`;
    return page({
      title: 'Flaş fırsatlar', sub: `${deals.length} ürün bugün flaş fırsatta`, html,
      mount(main) {
        U.$('#regen', main).onclick = () => { C.Seed.refreshDeals(DB.data); DB.save(); C.toast('Flaş fırsatlar yeniden seçildi'); Router.refresh(); };
        U.$('#addD', main).onsubmit = e => { e.preventDefault(); const p = Svc.product(+U.$('#dp').value); DB.insert('deals', { productId: p.id, pct: +U.$('#dpct').value, endsAt: U.startOfDay(Date.now()) + U.DAY - 1000, stockLimit: Math.min(60, p.stock), claimed: 0 }); Svc.notify(Svc.store(p.storeId).ownerId, `⚡ "${p.title}" bugünün flaş fırsatlarına eklendi (%${U.$('#dpct').value})`, '/p/' + p.id); Router.refresh(); };
        main.addEventListener('change', e => { const t = e.target.closest('[data-pct]'); if (t) { DB.update('deals', t.dataset.pct, { pct: +t.value }); Router.refresh(); } });
        main.addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (b) { DB.remove('deals', b.dataset.rm); Router.refresh(); } });
      }
    });
  };

  /* =============== KUPONLAR =============== */
  A.coupons = () => {
    const g = guard(); if (g) return g;
    const cs = DB.all('coupons').slice().sort((a, b) => (a.storeId ? 1 : 0) - (b.storeId ? 1 : 0) || b.createdAt - a.createdAt);
    const html = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Kod</th><th>Kapsam</th><th>İndirim</th><th class="r">Min. sepet</th><th>Kullanım</th><th>Bitiş</th><th>Aktif</th><th></th></tr></thead><tbody>
      ${cs.map(c => `<tr><td><b>${esc(c.code)}</b><div class="xs muted">${esc(c.title)}</div></td><td class="small">${c.storeId ? esc(Svc.store(c.storeId).name) : '<span class="badge b-teal">Tüm platform</span>'}</td><td>${c.type === 'percent' ? '%' + c.value + (c.maxDiscount ? ` <span class="xs muted">(max ${U.tl0(c.maxDiscount)})</span>` : '') : U.tl0(c.value)}</td><td class="r">${U.tl0(c.minTotal)}</td>
        <td style="min-width:130px"><div class="bar brand"><i style="width:${Math.min(100, c.used / c.limit * 100)}%"></i></div><span class="xs muted">${c.used}/${c.limit}</span></td><td class="small">${c.expiresAt < Date.now() ? '<span class="badge b-mute">Doldu</span>' : U.date(c.expiresAt)}</td>
        <td><label class="switch"><input type="checkbox" data-act="${c.id}" ${c.active ? 'checked' : ''}><span></span></label></td><td><button class="btn btn-sm btn-ghost" data-del="${c.id}">🗑</button></td></tr>`).join('')}
      </tbody></table></div>
      <div class="insight info" style="margin-top:14px"><span class="ii">💡</span><div class="small">Platform kuponlarının maliyeti MarkaBahçem'e aittir; satıcı raporlarında indirim tutarı ayrıca gösterilir ve satıcının hakedişinden düşülmez.</div></div>`;
    return page({
      title: 'Kuponlar', sub: 'Platform geneli ve mağaza kuponları', actions: '<button class="btn btn-primary" id="newC">+ Platform kuponu</button>', html,
      mount(main) {
        U.$('#newC').onclick = () => C.couponModal(null, () => Router.refresh());
        main.addEventListener('change', e => { const t = e.target.closest('[data-act]'); if (t) DB.update('coupons', t.dataset.act, { active: t.checked }); });
        main.addEventListener('click', e => { const b = e.target.closest('[data-del]'); if (b) { DB.remove('coupons', b.dataset.del); Router.refresh(); } });
      }
    });
  };

  /* =============== RAPORLAR =============== */
  A.reports = (_, q) => {
    const g = guard(); if (g) return g;
    const r = C.reportView(null, q, '/admin/reports');
    return page({ title: 'Platform raporları', sub: r.sub, html: r.html, mount: r.mount });
  };

  /* =============== RİSK & DENETİM =============== */
  A.risk = () => {
    const g = guard(); if (g) return g;
    const risks = Svc.risks();
    const fakes = Svc.live().filter(p => Svc.priceAnalysis(p).fake);
    const lowRated = DB.where('stores', s => s.status === 'active').map(s => ({ s, r: Svc.storeRating(s) })).filter(x => x.r.n >= 3 && x.r.avg < 4.2).sort((a, b) => a.r.avg - b.r.avg);
    const slowQ = DB.where('questions', q => !q.answer && Date.now() - q.createdAt > U.DAY);
    const html = `<div class="kpis">${K.kpi('Risk sinyali', U.num(risks.length))}${K.kpi('Şüpheli indirim', U.num(fakes.length))}${K.kpi('Düşük puanlı mağaza', U.num(lowRated.length))}${K.kpi('24 saati geçen soru', U.num(slowQ.length))}</div>
      <div class="g2e" style="margin-top:16px;align-items:start">
        <div class="card card-pad stack"><h3 style="margin:0">🚩 Mağaza sinyalleri</h3>${risks.filter(r => r.store).map(r => `<div class="alert-row">${K.storeAvatar(r.store, 36)}<div class="grow"><b class="small">${esc(r.store.name)}</b><div class="small"><span class="badge ${r.kind}">${r.icon}</span> ${esc(r.text)}</div></div><a class="btn btn-sm" href="#/admin/sellers?q=${encodeURIComponent(r.store.name)}">İncele</a></div>`).join('') || '<p class="small muted">Mağazalarda olağan dışı bir durum yok.</p>'}
          ${lowRated.map(x => `<div class="alert-row">${K.storeAvatar(x.s, 36)}<div class="grow"><b class="small">${esc(x.s.name)}</b><div class="small">Ortalama puan ${x.r.avg.toFixed(2).replace('.', ',')} (${x.r.n} yorum)</div></div></div>`).join('')}</div>
        <div class="card card-pad stack"><div class="row between"><h3 style="margin:0">🏷 Şüpheli indirimler</h3>${fakes.length ? '<button class="btn btn-sm btn-danger" id="fixAll">Tümünü düzelt</button>' : ''}</div><p class="small muted">Üstü çizili fiyatı son 90 günde hiç uygulanmamış ürünler. Tüketici mevzuatı gereği indirimli fiyat, son 30 günün en düşük fiyatına göre gösterilmelidir.</p>
          ${fakes.map(p => `<div class="row nowrap" style="gap:10px;border-bottom:1px solid var(--line);padding-bottom:8px"><span class="thumb" style="width:40px;height:40px;border-radius:8px;overflow:hidden;flex:none">${K.img(p.images[0])}</span><div class="grow small" style="min-width:0"><a href="#/p/${p.id}" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.title)}</a><span class="xs muted">${esc(Svc.store(p.storeId).name)} · <s>${U.tl(p.listPrice)}</s> → ${U.tl(p.price)}</span></div><button class="btn btn-sm" data-fix="${p.id}">Üstü çiziliyi kaldır</button></div>`).join('') || '<p class="small muted">Şüpheli indirim yok 👍</p>'}</div>
      </div>`;
    return page({
      title: 'Risk & denetim', sub: 'Otomatik tespit edilen sorunlar', html,
      mount(main) {
        const fix = p => { p.listPrice = 0; Svc.notify(Svc.store(p.storeId).ownerId, `🏷 "${p.title}" ürünündeki üstü çizili fiyat, 90 günlük fiyat geçmişiyle uyuşmadığı için kaldırıldı.`, '/seller/products/' + p.id); };
        main.addEventListener('click', e => { const b = e.target.closest('[data-fix]'); if (b) { fix(Svc.product(+b.dataset.fix)); DB.save(); Router.refresh(); } });
        const fa = U.$('#fixAll', main); fa && (fa.onclick = () => { fakes.forEach(fix); DB.save(); C.toast(fakes.length + ' ürün düzeltildi'); Router.refresh(); });
      }
    });
  };

  /* =============== SİTE AYARLARI =============== */
  A.settings = () => {
    const g = guard(); if (g) return g;
    const s = DB.settings;
    const html = `<form id="stf" class="stack lg" style="max-width:860px">
      <section class="card card-pad stack"><h3 style="margin:0">Genel</h3><div class="form-grid"><div class="field"><label for="st-n">Site adı</label><input class="input" id="st-n" value="${esc(s.siteName)}"></div><div class="field"><label for="st-dc">Varsayılan komisyon (%)</label><input class="input" id="st-dc" type="number" value="${s.defaultCommission}"></div>
        <div class="field full"><label for="st-a">Üst duyuru bandı</label><input class="input" id="st-a" value="${esc(s.announcement)}"></div></div></section>
      <section class="card card-pad stack"><h3 style="margin:0">Taksit vade farkları</h3><div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(110px,1fr))">${s.installments.map(n => `<div class="field"><label for="ir${n}">${n === 1 ? 'Tek çekim' : n + ' taksit'} (%)</label><input class="input" id="ir${n}" type="number" step="0.1" value="${s.installmentRates[n] || 0}" ${n === 1 ? 'disabled' : ''}></div>`).join('')}</div></section>
      <section class="card card-pad stack"><label class="row between"><span><b>Ürün moderasyonu</b><div class="small muted">Açıkken satıcıların eklediği yeni ürünler yönetici onayından sonra yayına girer.</div></span><span class="switch"><input type="checkbox" id="st-mod" ${s.productModeration ? 'checked' : ''}><span></span></span></label></section>
      <button class="btn btn-primary btn-lg" style="align-self:flex-start">Ayarları kaydet</button></form>
      <section class="card card-pad stack" style="max-width:860px;margin-top:20px"><h3 style="margin:0">Veri</h3><p class="small muted">Bu demo tüm veriyi tarayıcında saklar. Canlıya geçişte aynı veri modeli bir veritabanına taşınır.</p>
        <div class="row"><button class="btn" id="exp">⬇ Veriyi JSON olarak dışa aktar</button><button class="btn btn-danger" id="reset">Demo verisini sıfırla</button></div></section>`;
    return page({
      title: 'Site ayarları', html,
      mount(main) {
        U.$('#stf', main).onsubmit = e => { e.preventDefault(); s.siteName = U.$('#st-n').value.trim() || s.siteName; s.defaultCommission = +U.$('#st-dc').value; s.announcement = U.$('#st-a').value.trim(); s.installments.forEach(n => { if (n > 1) s.installmentRates[n] = +U.$('#ir' + n).value || 0; }); s.productModeration = U.$('#st-mod').checked; DB.save(); C.toast('Site ayarları kaydedildi'); Router.refresh(); };
        U.$('#exp', main).onclick = () => U.download('markabahcem-veri.json', JSON.stringify(DB.data), 'application/json');
        U.$('#reset', main).onclick = async () => { if (await Modal.confirm('Tüm siparişler, ürünler ve değişiklikler silinip örnek veri yeniden oluşturulacak.', { ok: 'Sıfırla', danger: true })) { DB.reset(); C.toast('Demo verisi sıfırlandı'); go('/'); } };
      }
    });
  };
})();
