/* MarkaBahçem — satıcı paneli */
(function () {
  'use strict';
  const C = window.Carsim;
  const { U, Svc, K, Auth, DB, Router, Modal, Chart } = C;
  const esc = U.esc;
  const go = p => Router.go(p);
  const S = C.SellerPages = {};

  function guard() {
    const u = Auth.user();
    if (!u) return { redirect: '/login?next=' + encodeURIComponent(Router.path) };
    if (u.role !== 'seller' || !u.storeId) return { redirect: '/sell' };
    return null;
  }
  const page = (o) => Object.assign({ layout: 'panel', panel: 'seller' }, o);
  const periodSeg = (q, base, d) => `<div class="seg" id="period">${[[7, '7 gün'], [30, '30 gün'], [90, '90 gün']].map(([v, l]) => `<button class="${d === v ? 'on' : ''}" data-d="${v}">${l}</button>`).join('')}</div>`;
  const bindPeriod = (main, base) => { const p = U.$('#period'); p && (p.onclick = e => { const b = e.target.closest('[data-d]'); if (b) go(base + '?d=' + b.dataset.d); }); };
  const carriers = ['Yurtiçi Kargo', 'Aras Kargo', 'MNG Kargo', 'Sürat Kargo', 'MarkaBahçem Express'];

  /* =============== GENEL BAKIŞ =============== */
  S.dashboard = (_, q) => {
    const g = guard(); if (g) return g;
    const st = Svc.myStore();
    if (st.status !== 'active') return page({ title: 'Mağaza başvurun', sub: esc(st.name), html: pendingView(st) });
    const d = +q.d || 30;
    if (Svc.autoRunPricing) Svc.autoRunPricing(st.id);
    const s = Svc.stats({ storeId: st.id, days: d });
    const ins = Svc.insights(st.id);
    const lowStock = DB.where('products', p => p.storeId === st.id && p.status === 'active' && p.stock <= 5).sort((a, b) => a.stock - b.stock);
    const recent = Svc.packagesIn(0, Date.now(), st.id).sort((a, b) => b.o.createdAt - a.o.createdAt).slice(0, 7);
    const sr = Svc.storeRating(st);
    const colors = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];
    const u = Auth.user();
    const html = `
      ${st.vacation ? `<div class="insight warnish" style="margin-bottom:16px"><span class="ii">🏖</span><div><b>Tatil modu açık.</b> Ürünlerin şu an vitrinde görünmüyor. <a class="bold" href="#/seller/settings">Kapat</a></div></div>` : ''}
      <div class="kpis">
        ${K.kpi('Ciro', U.tl0(s.revenue), s.dRevenue, Chart.spark(s.series.map(x => x.rev)))}
        ${K.kpi('Sipariş', U.num(s.orders), s.dOrders, Chart.spark(s.series.map(x => x.orders), 'var(--c2)'))}
        ${K.kpi('Satılan ürün', U.num(s.units), s.dUnits)}
        ${K.kpi('Ortalama sepet', U.tl0(s.aov), s.prevAov ? (s.aov - s.prevAov) / s.prevAov * 100 : null)}
        ${K.kpi('Net hakediş', U.tl0(s.net), null, '', 'Ciro − komisyon − iadeler')}
        ${K.kpi('Mağaza puanı', `${Svc.storeScore(st).toFixed(1).replace('.', ',')}<span class="small muted"> /10</span>`, null, `<span class="xs muted">★ ${sr.avg.toFixed(2).replace('.', ',')} · ${sr.n} değerlendirme</span>`)}
      </div>
      <div class="g2" style="margin-top:16px">
        <div class="card card-pad"><div class="row between" style="margin-bottom:10px"><h3 style="margin:0">Günlük ciro</h3><div class="legend"><span><i style="background:var(--c1)"></i>Ciro</span></div></div>
          ${Chart.line({ series: [{ name: 'Ciro', values: s.series.map(x => U.round2(x.rev)), color: 'var(--c1)' }], labels: s.series.map(x => U.dayMonth(x.t)), money: true, height: 250 })}</div>
        <div class="card card-pad stack"><div class="row between"><h3 style="margin:0">✦ Akıllı öneriler</h3><span class="badge b-brand">${ins.length}</span></div>
          <div class="stack" style="gap:10px;max-height:320px;overflow:auto">${ins.length ? ins.slice(0, 8).map(K.insight).join('') : '<p class="small muted">Her şey yolunda görünüyor 👌</p>'}</div></div>
      </div>
      <div class="g3" style="margin-top:16px">
        <div class="card card-pad"><h3>En çok satanlar</h3><ul class="list-plain">${s.topProducts.slice(0, 5).map((p, i) => `<li><span class="rank">${i + 1}</span><span class="thumb" style="width:36px;height:36px;border-radius:8px;overflow:hidden;flex:none">${K.img(p.image)}</span><a href="#/seller/products/${p.id}" class="grow small" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.title)}</a><span class="small num"><b>${U.tl0(p.rev)}</b><br><span class="muted">${p.qty} adet</span></span></li>`).join('') || '<li class="muted small">Bu dönemde satış yok</li>'}</ul></div>
        <div class="card card-pad"><h3>Kategori dağılımı</h3>${s.byCat.length ? Chart.donut({ items: s.byCat.slice(0, 6).map((c, i) => ({ label: c.name, value: c.value, color: colors[i] })), money: true, center: U.tl0(s.revenue).replace(' TL', '') }) : '<p class="muted small">Veri yok</p>'}</div>
        <div class="card card-pad"><h3>Sipariş saatleri</h3>${Chart.heat(s.heat)}<p class="xs muted" style="margin-top:8px">Koyu hücreler siparişin en yoğun olduğu gün ve saatleri gösterir.</p></div>
      </div>
      <div class="g2" style="margin-top:16px">
        <div class="card"><div class="row between" style="padding:16px 18px 0"><h3 style="margin:0">Son siparişler</h3><a class="small brand bold" href="#/seller/orders">Tümü →</a></div>
          <div style="overflow-x:auto;padding:8px 0"><table class="tbl"><thead><tr><th>No</th><th>Müşteri</th><th>Ürün</th><th class="r">Tutar</th><th>Durum</th></tr></thead><tbody>
          ${recent.map(({ o, pk }) => `<tr><td><b>#${o.id}</b><div class="xs muted">${U.ago(o.createdAt)}</div></td><td class="small">${esc(o.address.name)}</td><td class="small">${esc(pk.items[0].title.slice(0, 32))}${pk.items.length > 1 ? ' +' + (pk.items.length - 1) : ''}</td><td class="r">${U.tl(pk.subtotal)}</td><td>${K.status(pk.status)}</td></tr>`).join('')}</tbody></table></div></div>
        <div class="card card-pad"><div class="row between"><h3 style="margin:0">Kritik stok</h3><span class="badge ${lowStock.length ? 'b-bad' : 'b-ok'}">${lowStock.length}</span></div>
          <ul class="list-plain">${lowStock.slice(0, 6).map(p => `<li><span style="width:36px;height:36px;border-radius:8px;overflow:hidden;flex:none">${K.img(p.images[0])}</span><span class="grow small" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.title)}</span><span class="badge ${p.stock ? 'b-warn' : 'b-bad'}">${p.stock} adet</span><button class="btn btn-sm" data-restock="${p.id}">+50</button></li>`).join('') || '<li class="small muted">Tüm ürünlerde stok yeterli</li>'}</ul></div>
      </div>`;
    return page({
      title: 'Merhaba ' + u.name.split(' ')[0] + ' 👋', sub: `${esc(st.name)} mağazanın son ${d} günü`, actions: periodSeg(q, '/seller', d) + '<a class="btn btn-primary" href="#/seller/products/new">+ Ürün ekle</a>', html,
      mount(main) {
        bindPeriod(main, '/seller');
        main.addEventListener('click', e => { const b = e.target.closest('[data-restock]'); if (b) { const p = Svc.product(+b.dataset.restock); p.stock += 50; DB.save(); C.toast(`"${p.title}" stoğu ${p.stock} oldu`); Router.refresh(); } });
      }
    });
  };

  function pendingView(st) {
    const map = {
      pending: ['⏳', 'Başvurun inceleniyor', 'Ekibimiz başvurunu genelde 24 saat içinde değerlendirir. Bu sırada ürünlerini ekleyip mağazanı tasarlayabilirsin; onay gelince hepsi yayına girer.'],
      rejected: ['✕', 'Başvurun onaylanmadı', st.rejectReason || 'Eksik ya da hatalı bilgi nedeniyle başvurun onaylanmadı. Bilgilerini güncelleyip destek ekibine yazabilirsin.'],
      suspended: ['⛔', 'Mağazan askıya alındı', st.rejectReason || 'Mağazan platform kurallarına aykırılık gerekçesiyle geçici olarak kapatıldı.']
    }[st.status];
    const n = DB.where('products', p => p.storeId === st.id).length;
    const steps = [['Başvuru gönderildi', true], ['Mağaza tasarımı', !!(st.description && st.banners.length)], ['İlk ürün eklendi', n > 0], ['Yönetici onayı', st.status === 'active']];
    return `<div class="card card-pad stack lg" style="max-width:720px">
      <div class="row nowrap"><span style="font-size:2.4rem">${map[0]}</span><div><h2>${map[1]}</h2><p class="muted">${esc(map[2])}</p></div></div>
      <div class="stack">${steps.map(([l, ok]) => `<div class="row"><span class="badge ${ok ? 'b-ok' : 'b-mute'}" style="width:26px;height:26px;justify-content:center;border-radius:50%">${ok ? '✓' : '·'}</span><span class="${ok ? '' : 'muted'}">${l}</span></div>`).join('')}</div>
      <div class="row"><a class="btn btn-primary" href="#/seller/products/new">Ürün ekle</a><a class="btn" href="#/seller/design">Mağazamı tasarla</a><a class="btn btn-ghost" href="#/store/${st.id}">Önizle</a></div>
      <p class="xs muted">Demo ipucu: yönetici hesabıyla (admin@markabahcem.com / admin123) giriş yapıp "Mağazalar" ekranından başvurunu onaylayabilirsin.</p></div>`;
  }

  /* =============== SİPARİŞLER =============== */
  S.orders = (_, q) => {
    const g = guard(); if (g) return g;
    const st = Svc.myStore();
    const tab = q.s || 'new';
    const all = Svc.packagesIn(0, Date.now(), st.id).sort((a, b) => b.o.createdAt - a.o.createdAt);
    const tabs = [['new', 'Yeni'], ['preparing', 'Hazırlanıyor'], ['shipped', 'Kargoda'], ['delivered', 'Teslim edildi'], ['cancelled', 'İptal'], ['all', 'Tümü']];
    const cnt = s => s === 'all' ? all.length : all.filter(x => x.pk.status === s).length;
    let list = tab === 'all' ? all : all.filter(x => x.pk.status === tab);
    if (q.q) { const n = U.lower(q.q); list = list.filter(x => String(x.o.id).includes(n) || U.lower(x.o.address.name).includes(n) || x.pk.items.some(i => U.lower(i.title).includes(n))); }
    const shown = list.slice(0, 100);
    const html = `
      <div class="tabs" style="margin-bottom:14px">${tabs.map(([k, l]) => `<a class="${tab === k ? 'on' : ''}" href="#/seller/orders?s=${k}">${l} <span class="badge ${k === 'new' && cnt(k) ? 'b-brand' : 'b-mute'}">${cnt(k)}</span></a>`).join('')}</div>
      <div class="toolbar"><form id="oq" class="row nowrap grow" style="max-width:420px"><input class="input" id="oqi" placeholder="Sipariş no, müşteri veya ürün ara" value="${esc(q.q || '')}"><button class="btn">Ara</button></form>
        ${['new', 'preparing'].includes(tab) && list.length ? `<button class="btn btn-dark" id="bulk">${tab === 'new' ? 'Seçilenleri onayla' : 'Seçilenleri kargoya ver'}</button>` : ''}</div>
      ${shown.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr>${['new', 'preparing'].includes(tab) ? '<th><input type="checkbox" id="selAll" aria-label="Tümünü seç"></th>' : ''}<th>Sipariş</th><th>Müşteri</th><th>Ürünler</th><th class="r">Tutar</th><th>Durum</th><th>Kargo</th><th></th></tr></thead><tbody>
        ${shown.map(({ o, pk }) => `<tr>${['new', 'preparing'].includes(tab) ? `<td><input type="checkbox" data-sel="${o.id}" aria-label="Seç"></td>` : ''}
          <td><b>#${o.id}</b><div class="xs muted">${U.dateTime(o.createdAt)}</div></td>
          <td class="small">${esc(o.address.name)}<div class="xs muted">${esc(o.address.district)}/${esc(o.address.city)}</div></td>
          <td class="small"><div class="row nowrap" style="gap:6px">${pk.items.slice(0, 3).map(i => `<span class="thumb" style="width:34px;height:34px">${K.img(i.image)}</span>`).join('')}<span>${pk.items.length} ürün · ${U.sum(pk.items, i => i.qty)} adet</span></div></td>
          <td class="r"><b>${U.tl(pk.subtotal - (pk.discount || 0))}</b>${pk.discount ? `<div class="xs muted">kupon -${U.tl(pk.discount)}</div>` : ''}</td>
          <td>${K.status(pk.status)}</td><td class="xs">${pk.tracking ? esc(pk.carrier) + '<br><b>' + esc(pk.tracking) + '</b>' : '<span class="muted">—</span>'}</td>
          <td><div class="row nowrap" style="gap:6px">${actionBtn(o, pk)}<button class="btn btn-sm btn-ghost" data-view="${o.id}">Detay</button></div></td></tr>`).join('')}
      </tbody></table></div>${list.length > 100 ? `<p class="small muted" style="margin-top:8px">İlk 100 sipariş gösteriliyor (toplam ${list.length}).</p>` : ''}` : K.empty('📦', 'Bu durumda sipariş yok', tab === 'new' ? 'Yeni siparişler geldiğinde burada ve bildirimlerinde görünecek.' : '')}`;
    return page({
      title: 'Siparişler', sub: `${cnt('new')} yeni, ${cnt('preparing')} hazırlanıyor, ${cnt('shipped')} kargoda`, actions: `<button class="btn" id="exp">⬇ Excel'e aktar</button>`, html,
      mount(main) {
        U.$('#oq', main).onsubmit = e => { e.preventDefault(); go('/seller/orders' + U.qs({ s: tab, q: U.$('#oqi').value })); };
        U.$('#exp').onclick = () => U.download('siparisler.csv', U.csv([['Sipariş no', 'Tarih', 'Müşteri', 'İl', 'Ürünler', 'Adet', 'Tutar', 'İndirim', 'Kargo', 'Durum', 'Takip no']].concat(list.map(({ o, pk }) => [o.id, U.dateS(o.createdAt), o.address.name, o.address.city, pk.items.map(i => i.title + (i.variant ? ' (' + i.variant + ')' : '')).join(' | '), U.sum(pk.items, i => i.qty), pk.subtotal.toFixed(2).replace('.', ','), (pk.discount || 0).toFixed(2).replace('.', ','), pk.shipping.toFixed(2).replace('.', ','), Svc.STATUS[pk.status].label, pk.tracking]))));
        const sa = U.$('#selAll', main); sa && (sa.onchange = () => U.$$('[data-sel]', main).forEach(c => c.checked = sa.checked));
        const bulk = U.$('#bulk', main);
        bulk && (bulk.onclick = () => {
          const ids = U.$$('[data-sel]:checked', main).map(c => +c.dataset.sel);
          if (!ids.length) return C.toast('Önce sipariş seç', { icon: 'ℹ️' });
          ids.forEach(id => { const o = DB.all('orders').find(x => x.id === id); if (tab === 'new') Svc.pkgStatus(o, st.id, 'preparing'); else Svc.pkgStatus(o, st.id, 'shipped', { carrier: carriers[0], tracking: 'MB' + Math.floor(1e8 + Math.random() * 9e8) }); });
          C.toast(ids.length + ' sipariş güncellendi'); Router.refresh();
        });
        main.addEventListener('click', e => {
          const b = e.target.closest('[data-act]');
          if (b) { const o = DB.all('orders').find(x => x.id === +b.dataset.oid); doAction(o, st.id, b.dataset.act); return; }
          const v = e.target.closest('[data-view]');
          if (v) orderModal(DB.all('orders').find(x => x.id === +v.dataset.view), st.id);
        });
      }
    });
  };
  function actionBtn(o, pk) {
    const m = { new: ['preparing', 'Onayla', 'btn-primary'], preparing: ['ship', 'Kargoya ver', 'btn-dark'], shipped: ['delivered', 'Teslim edildi', 'btn-ok'], returnRequested: ['returns', 'İadeyi incele', 'btn-soft'] }[pk.status];
    return m ? `<button class="btn btn-sm ${m[2]}" data-act="${m[0]}" data-oid="${o.id}">${m[1]}</button>` : '';
  }
  function doAction(o, sid, act) {
    if (act === 'returns') return go('/seller/returns');
    if (act === 'ship') {
      Modal.open({
        title: `#${o.id} kargoya ver`, body: `<div class="stack"><div class="field"><label for="cr">Kargo firması</label><select class="select" id="cr">${carriers.map(c => `<option>${c}</option>`).join('')}</select></div><div class="field"><label for="tn">Takip numarası</label><input class="input" id="tn" value="MB${Math.floor(1e8 + Math.random() * 9e8)}"><span class="hint">Anlaşmalı kargoda takip numarası otomatik oluşturulur.</span></div>
          <div class="card card-pad" style="border-style:dashed"><div class="eyebrow">Kargo etiketi önizleme</div><div class="row between" style="margin-top:8px"><div class="small"><b>Alıcı:</b> ${esc(o.address.name)}<br>${esc(o.address.line)}<br>${esc(o.address.district)}/${esc(o.address.city)}<br>${esc(o.address.phone)}</div><div style="font:700 1.4rem ui-monospace,monospace;letter-spacing:.05em;border:2px solid var(--ink);padding:8px 10px;border-radius:6px">▌▌▍▌▍▍▌▌▍</div></div></div></div>`,
        actions: [{ label: 'Vazgeç' }, { label: 'Kargoya verildi olarak işaretle', primary: true, onClick: bg => { Svc.pkgStatus(o, sid, 'shipped', { carrier: U.$('#cr', bg).value, tracking: U.$('#tn', bg).value }); C.toast('Sipariş kargoya verildi, müşteri bilgilendirildi 🚚'); Router.refresh(); } }]
      });
      return;
    }
    Svc.pkgStatus(o, sid, act);
    C.toast({ preparing: 'Sipariş onaylandı, müşteri bilgilendirildi', delivered: 'Teslim edildi olarak işaretlendi' }[act] || 'Güncellendi');
    Router.refresh();
  }
  function orderModal(o, sid) {
    const pk = o.packages.find(p => p.storeId === sid);
    Modal.open({
      title: `Sipariş #${o.id}`, wide: true, body: `<div class="g2e"><div class="stack"><div class="row">${K.status(pk.status)}<span class="small muted">${U.dateTime(o.createdAt)}</span></div>
        ${pk.items.map(i => `<div class="row nowrap"><span style="width:52px;height:60px;border-radius:8px;overflow:hidden;flex:none">${K.img(i.image)}</span><div class="grow small"><b>${esc(i.title)}</b>${i.variant ? `<div class="xs muted">${esc(i.variant)}</div>` : ''}<div class="xs muted">${i.qty} × ${U.tl(i.price)}</div></div><b class="small">${U.tl(i.price * i.qty)}</b></div>`).join('')}
        <hr class="divider"><div class="sum-line"><span>Ara toplam</span><span>${U.tl(pk.subtotal)}</span></div>${pk.discount ? `<div class="sum-line"><span>Kupon indirimi</span><span>-${U.tl(pk.discount)}</span></div>` : ''}<div class="sum-line"><span>Kargo (müşteriden)</span><span>${U.tl(pk.shipping)}</span></div><div class="sum-line"><span>Tahmini komisyon</span><span>-${U.tl(Svc.commissionOf(pk))}</span></div></div>
        <div class="stack"><div class="card card-pad small"><b>Teslimat adresi</b><br>${esc(o.address.name)}<br>${esc(o.address.line)}<br>${esc(o.address.district)}/${esc(o.address.city)}<br>${esc(o.address.phone)}</div>
        <div class="card card-pad small"><b>Durum geçmişi</b>${pk.history.map(h => `<div class="row between" style="padding:4px 0"><span>${Svc.STATUS[h.s].icon} ${Svc.STATUS[h.s].label}</span><span class="muted">${U.dateTime(h.t)}</span></div>`).join('')}</div>
        ${pk.returnReason ? `<div class="insight warnish"><span class="ii">↩️</span><div class="small">İade sebebi: <b>${esc(pk.returnReason)}</b></div></div>` : ''}</div></div>`,
      actions: [['new', 'preparing'].includes(pk.status) ? { label: 'Siparişi iptal et', danger: true, onClick: () => { Svc.pkgStatus(o, sid, 'cancelled'); C.toast('Sipariş iptal edildi, stok geri eklendi'); Router.refresh(); } } : null, { label: 'Kapat' }].filter(Boolean)
    });
  }

  /* =============== İADELER =============== */
  S.returns = () => {
    const g = guard(); if (g) return g;
    const st = Svc.myStore();
    const list = Svc.packagesIn(0, Date.now(), st.id).filter(x => ['returnRequested', 'returned'].includes(x.pk.status)).sort((a, b) => (a.pk.status === 'returnRequested' ? 0 : 1) - (b.pk.status === 'returnRequested' ? 0 : 1) || b.o.createdAt - a.o.createdAt);
    const reasons = U.groupBy(list, x => x.pk.returnReason || 'Belirtilmemiş');
    const html = `<div class="g2" style="grid-template-columns:1fr 300px">
      <div>${list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Sipariş</th><th>Ürün</th><th>Sebep</th><th class="r">Tutar</th><th>Durum</th><th></th></tr></thead><tbody>
        ${list.map(({ o, pk }) => `<tr><td><b>#${o.id}</b><div class="xs muted">${esc(o.address.name)}</div></td><td class="small">${esc(pk.items.map(i => i.title).join(', ').slice(0, 60))}</td><td class="small">${esc(pk.returnReason)}</td><td class="r">${U.tl(pk.subtotal)}</td><td>${K.status(pk.status)}</td>
          <td>${pk.status === 'returnRequested' ? `<div class="row nowrap" style="gap:6px"><button class="btn btn-sm btn-ok" data-ok="${o.id}">Onayla</button><button class="btn btn-sm btn-danger" data-no="${o.id}">Reddet</button></div>` : ''}</td></tr>`).join('')}</tbody></table></div>` : K.empty('↩️', 'İade talebi yok', 'Müşteri iade talebi oluşturduğunda burada göreceksin.')}</div>
      <div class="card card-pad"><h3>İade sebepleri</h3>${Chart.bars({ items: [...reasons].map(([k, v]) => ({ label: k, value: v.length })), horizontal: true })}<p class="xs muted" style="margin-top:12px">"Beden uymadı" iadeleri çoksa ürün sayfasına beden tablosu eklemek iadeleri azaltır.</p></div></div>`;
    return page({
      title: 'İadeler', sub: `${list.filter(x => x.pk.status === 'returnRequested').length} talep onay bekliyor`, html,
      mount(main) {
        main.addEventListener('click', async e => {
          let b;
          if ((b = e.target.closest('[data-ok]'))) { Svc.pkgStatus(DB.all('orders').find(x => x.id === +b.dataset.ok), st.id, 'returned'); C.toast('İade onaylandı, stok geri eklendi'); Router.refresh(); }
          else if ((b = e.target.closest('[data-no]'))) { const r = await Modal.prompt('İadeyi reddet', { label: 'Müşteriye iletilecek açıklama', textarea: true, value: 'Ürün kullanılmış olarak ulaştığı için iade kabul edilemedi.', ok: 'Reddet' }); if (r == null) return; const o = DB.all('orders').find(x => x.id === +b.dataset.no); Svc.pkgStatus(o, st.id, 'delivered'); Svc.notify(o.userId, `↩️ #${o.id} iade talebin reddedildi: ${r}`, '/account/orders/' + o.id); Router.refresh(); }
        });
      }
    });
  };

  /* =============== ÜRÜNLER =============== */
  S.products = (_, q) => {
    const g = guard(); if (g) return g;
    const st = Svc.myStore();
    let list = DB.where('products', p => p.storeId === st.id);
    const counts = { all: list.length, active: 0, passive: 0, pending: 0, rejected: 0, low: 0 };
    list.forEach(p => { counts[p.status]++; if (p.stock <= 5) counts.low++; });
    const f = q.f || 'all';
    if (f === 'low') list = list.filter(p => p.stock <= 5); else if (f !== 'all') list = list.filter(p => p.status === f);
    if (q.q) { const n = U.norm(q.q); list = list.filter(p => U.norm(p.title + ' ' + p.sku + ' ' + p.brand).includes(n)); }
    const sort = q.sort || 'sold';
    const sorts = { sold: (a, b) => b.sold - a.sold, stock: (a, b) => a.stock - b.stock, price: (a, b) => b.price - a.price, new: (a, b) => b.createdAt - a.createdAt, views: (a, b) => b.views - a.views };
    list.sort(sorts[sort]);
    const link = patch => '#/seller/products' + U.qs(Object.assign({}, q, patch));
    const html = `
      <div class="tabs" style="margin-bottom:14px">${[['all', 'Tümü'], ['active', 'Yayında'], ['passive', 'Pasif'], ['pending', 'Onay bekleyen'], ['rejected', 'Reddedilen'], ['low', 'Kritik stok']].map(([k, l]) => `<a class="${f === k ? 'on' : ''}" href="${link({ f: k })}">${l} <span class="badge b-mute">${counts[k] || 0}</span></a>`).join('')}</div>
      <div class="toolbar"><form id="pq" class="row nowrap grow" style="max-width:420px"><input class="input" id="pqi" placeholder="Ürün adı, marka veya stok kodu" value="${esc(q.q || '')}"><button class="btn">Ara</button></form>
        <select class="select" id="psort" aria-label="Sırala">${[['sold', 'Çok satan'], ['stock', 'Stok (az → çok)'], ['price', 'Fiyat'], ['views', 'Görüntülenme'], ['new', 'En yeni']].map(([v, l]) => `<option value="${v}" ${sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <button class="btn" id="bulkPrice">% Toplu fiyat</button><button class="btn" id="bulkStock">± Toplu stok</button></div>
      ${list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th><input type="checkbox" id="selAll" aria-label="Tümünü seç"></th><th>Ürün</th><th class="r">Fiyat</th><th class="r">Stok</th><th class="r">Satış</th><th class="r">Dönüşüm</th><th>Durum</th><th></th></tr></thead><tbody>
        ${list.map(p => { const i = Svc.priceInfo(p); const v = Svc.velocity(p); const days = v ? Math.floor(p.stock / v) : null; return `<tr>
          <td><input type="checkbox" data-sel="${p.id}" aria-label="Seç"></td>
          <td><div class="row nowrap" style="gap:10px"><span class="thumb">${K.img(p.images[0])}</span><div style="min-width:0"><a href="#/seller/products/${p.id}" class="small bold" style="display:block;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.title)}</a><div class="xs muted">${esc(p.sku)} · ${esc(p.brand)} · ${esc(p.sub)}${p.reviewCount ? ' · ★ ' + p.rating.toFixed(1).replace('.', ',') : ''}</div></div></div></td>
          <td class="r"><input class="input num" style="width:110px;text-align:right;padding:6px 8px" value="${p.price.toFixed(2)}" data-price="${p.id}" aria-label="Fiyat">${i.deal ? `<div class="xs brand">⚡ Flaş: ${U.tl(i.price)}</div>` : ''}${Svc.pendingRequest(p.id) ? `<a class="xs warn" href="#/seller/price-requests">⏳ ${U.tl(Svc.pendingRequest(p.id).newPrice)} onayda</a>` : ''}</td>
          <td class="r"><input class="input num" style="width:80px;text-align:right;padding:6px 8px;${p.stock <= 5 ? 'border-color:var(--bad)' : ''}" value="${p.stock}" data-stock="${p.id}" aria-label="Stok">${days != null && days < 30 ? `<div class="xs ${days < 10 ? 'bad' : 'warn'}">~${days} günlük</div>` : ''}</td>
          <td class="r">${U.num(p.sold)}</td><td class="r small">%${p.views ? (p.sold / p.views * 100).toFixed(1).replace('.', ',') : '0'}<div class="xs muted">${U.num(p.views)} görüntülenme</div></td>
          <td>${['active', 'passive'].includes(p.status) ? `<label class="switch" title="Yayında / pasif"><input type="checkbox" data-toggle="${p.id}" ${p.status === 'active' ? 'checked' : ''}><span></span></label>` : K.pill(Svc.PROD_STATUS, p.status)}</td>
          <td><div class="row nowrap" style="gap:4px"><a class="btn btn-sm btn-ghost" href="#/seller/products/${p.id}" title="Düzenle">✏️</a><a class="btn btn-sm btn-ghost" href="#/p/${p.id}" title="Önizle">👁</a><button class="btn btn-sm btn-ghost" data-dup="${p.id}" title="Kopyala">⧉</button><button class="btn btn-sm btn-ghost" data-del="${p.id}" title="Sil">🗑</button></div></td></tr>`; }).join('')}
      </tbody></table></div>` : K.empty('🏷', 'Ürün bulunamadı', '', '<a class="btn btn-primary" href="#/seller/products/new">İlk ürününü ekle</a>')}`;
    return page({
      title: 'Ürünlerim', sub: `${counts.all} ürün · ${counts.active} yayında · ${counts.low} kritik stok`, actions: `<a class="btn" href="#/seller/xml">🧩 XML ile yükle</a><button class="btn" id="exp">⬇ Excel'e aktar</button><a class="btn btn-primary" href="#/seller/products/new">+ Yeni ürün</a>`, html,
      mount(main) {
        U.$('#pq', main).onsubmit = e => { e.preventDefault(); go(link({ q: U.$('#pqi').value }).slice(1)); };
        U.$('#psort', main).onchange = e => go(link({ sort: e.target.value }).slice(1));
        U.$('#exp').onclick = () => U.download('urunler.csv', U.csv([['Stok kodu', 'Ürün', 'Marka', 'Kategori', 'Alt kategori', 'Fiyat', 'Liste fiyatı', 'Stok', 'Satış', 'Görüntülenme', 'Puan', 'Durum']].concat(list.map(p => [p.sku, p.title, p.brand, Svc.cat(p.categoryId).name, p.sub, p.price.toFixed(2).replace('.', ','), (p.listPrice || 0).toFixed(2).replace('.', ','), p.stock, p.sold, p.views, p.rating, Svc.PROD_STATUS[p.status][0]]))));
        const sa = U.$('#selAll', main); sa && (sa.onchange = () => U.$$('[data-sel]', main).forEach(c => c.checked = sa.checked));
        const sel = () => U.$$('[data-sel]:checked', main).map(c => Svc.product(+c.dataset.sel));
        main.addEventListener('change', e => {
          const t = e.target;
          if (t.dataset.price) { const p = Svc.product(+t.dataset.price); const v = +String(t.value).replace(',', '.'); if (!(v > 0)) { t.value = p.price.toFixed(2); return C.toast('Geçerli bir fiyat gir', { icon: '⚠️' }); } const r = Svc.setPrice(p, v, { source: 'Manuel' }); if (r.requested) { t.value = p.price.toFixed(2); C.toast('Artış sınırı aşıldı: ' + U.tl(U.round2(v)) + ' fiyatı onaya gönderildi', { icon: '📨', link: '/seller/price-requests', linkText: 'Talepler' }); Router.refresh(); } else if (r.applied) C.toast('Fiyat güncellendi: ' + U.tl(p.price)); }
          else if (t.dataset.stock) { const p = Svc.product(+t.dataset.stock); p.stock = Math.max(0, parseInt(t.value) || 0); DB.save(); C.toast('Stok güncellendi: ' + p.stock); }
          else if (t.dataset.toggle) { const p = Svc.product(+t.dataset.toggle); p.status = t.checked ? 'active' : 'passive'; DB.save(); C.toast(t.checked ? 'Ürün yayına alındı' : 'Ürün pasife alındı'); }
        });
        main.addEventListener('click', async e => {
          let b;
          if ((b = e.target.closest('[data-del]'))) { if (await Modal.confirm('Ürün kalıcı olarak silinecek. Geçmiş siparişler etkilenmez.', { ok: 'Sil', danger: true })) { DB.remove('products', b.dataset.del); Svc._vocab = null; C.toast('Ürün silindi'); Router.refresh(); } }
          else if ((b = e.target.closest('[data-dup]'))) { const p = Svc.product(+b.dataset.dup); const c = DB.insert('products', Object.assign(JSON.parse(JSON.stringify(p)), { createdAt: Date.now(), title: p.title + ' (kopya)', sold: 0, views: 0, rating: 0, reviewCount: 0, status: 'passive', priceHistory: [[Date.now(), p.price]], sku: 'MB-' + Date.now().toString().slice(-6) })); DB.data.seq.products = c.id; go('/seller/products/' + c.id); }
        });
        U.$('#bulkPrice', main).onclick = () => {
          const ps = sel(); if (!ps.length) return C.toast('Önce ürün seç', { icon: 'ℹ️' });
          Modal.open({
            title: `${ps.length} ürün için toplu fiyat`, body: `<div class="stack"><div class="seg" id="bpd"><button class="on" data-d="-1">İndir</button><button data-d="1">Artır</button></div><div class="field"><label for="bpv">Oran (%)</label><input class="input" id="bpv" type="number" value="10" min="1" max="90"></div><label class="check small"><input type="checkbox" id="bpl" checked> İndirimde eski fiyatı üstü çizili göster</label><div class="insight info"><span class="ii">ℹ️</span><div class="small">Fiyat değişiklikleri fiyat geçmişine yazılır; fiyat alarmı kuran ve favorisine ekleyen müşterilere bildirim gider.</div></div></div>`,
            onMount: bg => { U.$('#bpd', bg).onclick = e => { const b = e.target.closest('[data-d]'); if (b) U.$$('#bpd button', bg).forEach(x => x.classList.toggle('on', x === b)); }; },
            actions: [{ label: 'Vazgeç' }, { label: 'Uygula', primary: true, onClick: bg => { const dir = +U.$('#bpd .on', bg).dataset.d, pct = +U.$('#bpv', bg).value / 100, keep = U.$('#bpl', bg).checked; let rq = 0; ps.forEach(p => { const old = p.price; const r = Svc.setPrice(p, p.price * (1 + dir * pct), { source: 'Toplu fiyat' }); if (r.requested) rq++; if (r.applied && dir < 0 && keep && !p.listPrice) p.listPrice = old; }); DB.save(); C.toast((ps.length - rq) + ' ürünün fiyatı güncellendi' + (rq ? `, ${rq} artış onaya gönderildi` : ''), { link: rq ? '/seller/price-requests' : null, linkText: 'Talepler' }); Router.refresh(); } }]
          });
        };
        U.$('#bulkStock', main).onclick = async () => {
          const ps = sel(); if (!ps.length) return C.toast('Önce ürün seç', { icon: 'ℹ️' });
          const v = await Modal.prompt(`${ps.length} ürüne stok ekle / çıkar`, { label: 'Adet (çıkarmak için eksi yaz)', value: '25' });
          if (v == null) return; ps.forEach(p => p.stock = Math.max(0, p.stock + (parseInt(v) || 0))); DB.save(); C.toast('Stoklar güncellendi'); Router.refresh();
        };
      }
    });
  };

  /* =============== ÜRÜN EKLE / DÜZENLE =============== */
  S.productEdit = ({ id }) => {
    const g = guard(); if (g) return g;
    const st = Svc.myStore();
    const isNew = !id;
    const p0 = isNew ? null : Svc.product(id);
    if (!isNew && (!p0 || p0.storeId !== st.id)) return page({ title: 'Ürün bulunamadı', html: K.empty('🏷', 'Ürün bulunamadı') });
    const cats = Svc.cats();
    const d = p0 ? JSON.parse(JSON.stringify(p0)) : { title: '', brand: '', categoryId: (st.cats && st.cats[0]) || cats[0].id, sub: '', price: '', listPrice: 0, cost: '', stock: 20, variants: null, images: [], description: '', specs: { 'Menşei': 'Türkiye', 'Garanti': 'Yok' }, fastDelivery: st.shipDays === 0, status: 'active', sku: 'MB-' + Date.now().toString().slice(-6) };
    const emojis = ['📦', '👕', '👗', '👟', '👜', '📱', '💻', '🎧', '⌚', '🛋️', '🍳', '🧴', '💄', '🧸', '📚', '🪣', '🖌️', '🔧', '🧰', '☕', '🫒', '🍯', '⚽', '🚲', '🕶️', '💎', '🪴', '🕯️'];
    const pal = C.Seed.BG;
    const html = `<form id="pf" class="g2" style="grid-template-columns:minmax(0,1fr) 320px;align-items:start">
      <div class="stack lg">
        ${p0 && p0.status === 'rejected' ? `<div class="insight warnish"><span class="ii">✕</span><div><b>Ürün reddedildi:</b> ${esc(p0.rejectReason || 'Kurallara uygun değil')}. Düzenleyip tekrar gönderebilirsin.</div></div>` : ''}
        <section class="card card-pad stack"><h3 style="margin:0">Temel bilgiler</h3>
          <div class="form-grid">
            <div class="field full"><label for="f-title">Ürün adı</label><input class="input" id="f-title" value="${esc(d.title)}" required placeholder="Örn: Silinebilir İç Cephe Boyası 15 L"><span class="hint" id="titleHint">Marka + ürün tipi + ayırt edici özellik (60-90 karakter ideal)</span></div>
            <div class="field"><label for="f-brand">Marka</label><input class="input" id="f-brand" value="${esc(d.brand)}" required list="brandList"><datalist id="brandList">${U.uniq(DB.all('products').map(p => p.brand)).map(b => `<option value="${esc(b)}">`).join('')}</datalist></div>
            <div class="field"><label for="f-sku">Stok kodu</label><input class="input" id="f-sku" value="${esc(d.sku)}"></div>
            <div class="field"><label for="f-cat">Kategori</label><select class="select" id="f-cat">${cats.map(c => `<option value="${c.id}" ${c.id === d.categoryId ? 'selected' : ''}>${esc(c.name)} (%${c.commission} komisyon)</option>`).join('')}</select></div>
            <div class="field"><label for="f-sub">Alt kategori</label><select class="select" id="f-sub"></select></div>
          </div></section>
        <section class="card card-pad stack"><div class="row between"><h3 style="margin:0">Görseller</h3><span class="xs muted">İlk görsel kapak olur · en fazla 6</span></div>
          <div class="img-list" id="imgs"></div>
          <label class="img-drop" id="drop" for="f-file">📷 Fotoğrafları sürükle bırak ya da <b>seç</b><br><span class="xs">JPG/PNG, otomatik küçültülür</span><input type="file" id="f-file" accept="image/*" multiple hidden></label>
          <details><summary class="small bold" style="cursor:pointer">Fotoğrafın yoksa simge ile görsel oluştur</summary><div class="stack" style="margin-top:10px"><div class="row" id="emo" style="gap:4px">${emojis.map(e => `<button type="button" class="chip" data-e="${e}" style="font-size:1.1rem;padding:4px 8px">${e}</button>`).join('')}</div><div class="color-row" id="pal">${pal.map((c, i) => `<button type="button" data-p="${i}" style="background:linear-gradient(145deg,${c[0]},${c[1]})" aria-label="Zemin ${i + 1}"></button>`).join('')}</div><button type="button" class="btn btn-sm" id="addEmo" style="align-self:flex-start">+ Görsel olarak ekle</button></div></details>
        </section>
        <section class="card card-pad stack"><h3 style="margin:0">Fiyat & stok</h3>
          <div class="form-grid">
            <div class="field"><label for="f-price">Satış fiyatı (TL)</label><input class="input" id="f-price" type="number" step="0.01" min="0" value="${d.price}" required></div>
            <div class="field"><label for="f-list">Üstü çizili fiyat (isteğe bağlı)</label><input class="input" id="f-list" type="number" step="0.01" min="0" value="${d.listPrice || ''}"></div>
            <div class="field"><label for="f-cost">Maliyet (yalnızca sen görürsün)</label><input class="input" id="f-cost" type="number" step="0.01" min="0" value="${d.cost || ''}"></div>
            <div class="field"><label for="f-stock">Stok adedi</label><input class="input" id="f-stock" type="number" min="0" value="${d.stock}"></div>
          </div>
          <div id="priceIntel"></div>
          <div class="row"><label class="check"><input type="checkbox" id="f-fast" ${d.fastDelivery ? 'checked' : ''}> 🚀 Hızlı teslimat (24 saatte kargoda)</label></div>
        </section>
        <section class="card card-pad stack"><div class="row between"><h3 style="margin:0">Varyantlar</h3><label class="switch"><input type="checkbox" id="f-var" ${d.variants ? 'checked' : ''}><span></span></label></div>
          <div id="varBox" class="form-grid" ${d.variants ? '' : 'hidden'}><div class="field"><label for="f-vname">Varyant tipi</label><select class="select" id="f-vname">${['Beden', 'Numara', 'Renk', 'Depolama', 'Yaş', 'Hacim'].map(n => `<option ${d.variants && d.variants.name === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div><div class="field"><label for="f-vopts">Seçenekler (virgülle ayır)</label><input class="input" id="f-vopts" value="${esc(d.variants ? d.variants.options.join(', ') : 'S, M, L, XL')}"></div></div></section>
        <section class="card card-pad stack"><div class="row between"><h3 style="margin:0">Açıklama</h3><button type="button" class="btn btn-sm btn-soft" id="genDesc">✦ Akıllı açıklama yaz</button></div>
          <textarea class="textarea" id="f-desc" style="min-height:140px" placeholder="Ürünün öne çıkan özellikleri, kullanım alanı, malzeme…">${esc(d.description)}</textarea>
          <div class="row between"><span class="lbl">Teknik özellikler</span><button type="button" class="btn btn-sm" id="addSpec">+ Özellik</button></div><div class="stack" id="specs" style="gap:8px"></div></section>
      </div>
      <aside class="stack" style="position:sticky;top:16px">
        <div class="card card-pad stack"><h3 style="margin:0">Önizleme</h3><div id="preview" style="max-width:240px"></div></div>
        <div class="card card-pad stack"><h3 style="margin:0">Kalite puanı</h3><div class="row"><b id="qScore" style="font:800 2rem var(--f-display)">0</b><span class="muted">/100</span></div><div class="bar ok"><i id="qBar" style="width:0"></i></div><ul class="small" id="qList" style="margin:0;padding-left:18px;line-height:1.8"></ul></div>
        <div class="card card-pad stack"><label class="check"><input type="checkbox" id="f-active" ${d.status !== 'passive' ? 'checked' : ''}> Kaydedince yayına al</label>
          ${DB.settings.productModeration ? '<span class="xs muted">Yeni ürünler yönetici onayından sonra yayına girer.</span>' : ''}
          <button class="btn btn-primary btn-lg">${isNew ? 'Ürünü kaydet' : 'Değişiklikleri kaydet'}</button>${isNew ? '' : `<a class="btn" href="#/p/${d.id}">Ürün sayfasını gör</a>`}</div>
      </aside></form>`;
    return page({
      title: isNew ? 'Yeni ürün ekle' : 'Ürünü düzenle', sub: isNew ? 'Ürün bilgilerini doldur, önizleme sağda anlık güncellenir' : esc(d.sku), actions: '<a class="btn" href="#/seller/products">← Ürünlerim</a>', html,
      mount(main) {
        let emo = '📦', palI = 0;
        const $ = s => U.$(s, main);
        const subs = () => { const c = Svc.cat(+$('#f-cat').value); $('#f-sub').innerHTML = c.subs.map(s => `<option ${s === d.sub ? 'selected' : ''}>${esc(s)}</option>`).join(''); };
        subs();
        const specRow = (k = '', v = '') => `<div class="row nowrap" style="gap:6px"><input class="input" placeholder="Özellik" value="${esc(k)}" data-sk><input class="input" placeholder="Değer" value="${esc(v)}" data-sv><button type="button" class="btn btn-ghost btn-sm" data-rmspec>✕</button></div>`;
        $('#specs').innerHTML = Object.entries(d.specs || {}).filter(([k]) => k !== 'Marka').map(([k, v]) => specRow(k, v)).join('');
        const drawImgs = () => { $('#imgs').innerHTML = d.images.map((im, i) => `<div class="it">${K.img(im)}<button type="button" data-rmimg="${i}" aria-label="Kaldır">✕</button>${i ? `<button type="button" data-cover="${i}" style="top:auto;bottom:4px;right:auto;left:4px;width:auto;padding:0 6px;border-radius:6px;font-size:.62rem">Kapak yap</button>` : ''}</div>`).join(''); U.$$('#imgs .em', main).forEach(e => e.style.fontSize = '36px'); };
        drawImgs();
        const collect = () => {
          const specs = { Marka: $('#f-brand').value.trim() };
          U.$$('#specs > div', main).forEach(r => { const k = U.$('[data-sk]', r).value.trim(), v = U.$('[data-sv]', r).value.trim(); if (k && v) specs[k] = v; });
          return {
            title: $('#f-title').value.trim(), brand: $('#f-brand').value.trim(), sku: $('#f-sku').value.trim(), categoryId: +$('#f-cat').value, sub: $('#f-sub').value,
            price: U.round2(+$('#f-price').value || 0), listPrice: U.round2(+$('#f-list').value || 0), cost: U.round2(+$('#f-cost').value || 0), stock: Math.max(0, parseInt($('#f-stock').value) || 0),
            fastDelivery: $('#f-fast').checked, variants: $('#f-var').checked ? { name: $('#f-vname').value, options: $('#f-vopts').value.split(',').map(x => x.trim()).filter(Boolean) } : null,
            description: $('#f-desc').value.trim(), specs, images: d.images.length ? d.images : [{ e: emo, c1: pal[palI][0], c2: pal[palI][1] }]
          };
        };
        const update = () => {
          const v = collect();
          const fake = Object.assign({ id: d.id || 0, storeId: st.id, rating: d.rating || 0, reviewCount: d.reviewCount || 0, sold: d.sold || 0, tags: [], freeShipping: false, status: 'active', views: 0 }, v);
          const cardHtml = K.card(fake).replace(/href="#\/p\/0"/g, 'href="#"');
          $('#preview').innerHTML = cardHtml;
          // fiyat zekâsı
          const peers = Svc.live().filter(p => p.categoryId === v.categoryId && p.sub === v.sub && p.id !== d.id).map(p => Svc.priceInfo(p).price).sort((a, b) => a - b);
          const cat = Svc.cat(v.categoryId);
          let h = '';
          if (v.price > 0) {
            const com = v.price * (st.commission != null ? st.commission : cat.commission) / 100;
            const margin = v.cost ? v.price - com - v.cost : null;
            h += `<div class="row small" style="gap:18px"><span>Komisyon (%${st.commission != null ? st.commission : cat.commission}): <b>${U.tl(com)}</b></span><span>Eline geçen: <b>${U.tl(v.price - com)}</b></span>${margin != null ? `<span>Birim kâr: <b class="${margin > 0 ? 'ok' : 'bad'}">${U.tl(margin)} (%${(margin / v.price * 100).toFixed(0)})</b></span>` : ''}</div>`;
          }
          if (peers.length >= 2) {
            const q1 = peers[Math.floor(peers.length * .25)], q3 = peers[Math.floor(peers.length * .75)], med = peers[Math.floor(peers.length / 2)];
            const pos = v.price ? (v.price < q1 ? ['good', 'Rekabetçi: benzer ürünlerin çoğundan ucuz'] : v.price > q3 ? ['warnish', 'Pahalı tarafta: benzer ürünlerin %75\'inden yüksek'] : ['info', 'Piyasa ortalamasında']) : ['info', 'Fiyat gir, piyasa ile karşılaştıralım'];
            h += `<div class="insight ${pos[0]}"><span class="ii">📊</span><div class="small"><b>Fiyat önerisi:</b> "${esc(v.sub)}" alt kategorisinde ${peers.length} ürün ${U.tl0(peers[0])} - ${U.tl0(peers[peers.length - 1])} arasında satılıyor (ortanca ${U.tl0(med)}). ${pos[1]}.</div></div>`;
          }
          if (v.listPrice && v.listPrice <= v.price) h += `<div class="xs bad">Üstü çizili fiyat, satış fiyatından yüksek olmalı.</div>`;
          $('#priceIntel').innerHTML = h;
          // kalite puanı
          const checks = [[v.title.length >= 25, 'Açıklayıcı başlık (25+ karakter)', 15], [d.images.length >= 1 && typeof d.images[0] === 'string', 'Gerçek fotoğraf', 20], [d.images.length >= 3, 'En az 3 görsel', 10], [v.description.length >= 120, 'Detaylı açıklama (120+ karakter)', 20], [Object.keys(v.specs).length >= 4, 'En az 3 teknik özellik', 15], [v.stock >= 10, 'Yeterli stok (10+)', 10], [!!v.brand, 'Marka bilgisi', 10]];
          const score = U.sum(checks.filter(c => c[0]), c => c[2]);
          $('#qScore').textContent = score; $('#qBar').style.width = score + '%';
          $('#qList').innerHTML = checks.map(c => `<li style="list-style:none;margin-left:-18px">${c[0] ? '✅' : '⬜'} ${c[1]}</li>`).join('');
          $('#titleHint').textContent = `${v.title.length} karakter · ` + (v.title.length < 25 ? 'Biraz daha açıklayıcı olabilir' : v.title.length > 100 ? 'Çok uzun, kısaltmayı düşün' : 'Güzel görünüyor');
        };
        main.addEventListener('input', U.debounce(update, 150));
        main.addEventListener('change', e => { if (e.target.id === 'f-cat') { d.sub = ''; subs(); } if (e.target.id === 'f-var') $('#varBox').hidden = !e.target.checked; update(); });
        const addFiles = async files => {
          for (const f of Array.from(files).slice(0, 6 - d.images.length)) { try { d.images.push(await U.readImage(f)); } catch (e) { C.toast('Görsel okunamadı: ' + f.name, { icon: '⚠️' }); } }
          d.images = d.images.filter(x => typeof x === 'string' || d.images.every(y => typeof y !== 'string')); drawImgs(); update();
        };
        $('#f-file').onchange = e => addFiles(e.target.files);
        const drop = $('#drop');
        drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
        drop.ondragleave = () => drop.classList.remove('over');
        drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); addFiles(e.dataTransfer.files); };
        $('#emo').onclick = e => { const b = e.target.closest('[data-e]'); if (!b) return; emo = b.dataset.e; U.$$('#emo .chip', main).forEach(x => x.classList.toggle('on', x === b)); update(); };
        $('#pal').onclick = e => { const b = e.target.closest('[data-p]'); if (!b) return; palI = +b.dataset.p; U.$$('#pal button', main).forEach(x => x.classList.toggle('on', x === b)); update(); };
        $('#addEmo').onclick = () => { if (d.images.length >= 6) return; d.images.push({ e: emo, c1: pal[palI][0], c2: pal[palI][1] }); drawImgs(); update(); };
        main.addEventListener('click', e => {
          let b;
          if ((b = e.target.closest('[data-rmimg]'))) { d.images.splice(+b.dataset.rmimg, 1); drawImgs(); update(); }
          else if ((b = e.target.closest('[data-cover]'))) { const [x] = d.images.splice(+b.dataset.cover, 1); d.images.unshift(x); drawImgs(); update(); }
          else if ((b = e.target.closest('[data-rmspec]'))) { b.parentElement.remove(); update(); }
        });
        $('#addSpec').onclick = () => { $('#specs').insertAdjacentHTML('beforeend', specRow()); };
        $('#genDesc').onclick = () => {
          const v = collect();
          if (!v.title) return C.toast('Önce ürün adını yaz', { icon: 'ℹ️' });
          const specs = Object.entries(v.specs).filter(([k]) => k !== 'Marka');
          const cat = Svc.cat(v.categoryId);
          const reviewHint = DB.where('reviews', r => { const p = Svc.product(r.productId); return p && p.sub === v.sub && r.rating >= 4; }).length;
          $('#f-desc').value = `${v.brand && !U.lower(v.title).startsWith(U.lower(v.brand)) ? v.brand + ' ' : ''}${v.title}, ${cat.name.toLocaleLowerCase('tr-TR')} kategorisinde kaliteyi uygun fiyatla buluşturan bir ürün.\n\n` +
            `• ${specs.length ? specs.slice(0, 4).map(([k, x]) => `${k}: ${x}`).join('\n• ') : 'Dayanıklı malzeme ve özenli işçilik'}\n` +
            `${v.variants ? `• ${v.variants.options.length} farklı ${v.variants.name.toLocaleLowerCase('tr-TR')} seçeneği: ${v.variants.options.join(', ')}\n` : ''}` +
            `• ${v.fastDelivery ? '24 saat içinde kargoda' : 'Özenli paketleme ile hızlı gönderim'}\n\n` +
            `${st.name} güvencesiyle orijinal ve faturalı olarak gönderilir. ${reviewHint > 5 ? 'Bu kategoride müşterilerimiz en çok kalite ve hızlı kargodan memnun kalıyor. ' : ''}15 gün içinde ücretsiz iade hakkınız vardır.`;
          update(); C.toast('Açıklama oluşturuldu, dilediğin gibi düzenleyebilirsin', { icon: '✦' });
        };
        update();
        $('#pf').onsubmit = e => {
          e.preventDefault();
          const v = collect();
          if (!v.title || !v.brand) return C.toast('Ürün adı ve marka zorunlu', { icon: '⚠️' });
          if (!(v.price > 0)) return C.toast('Geçerli bir fiyat gir', { icon: '⚠️' });
          if (v.listPrice && v.listPrice <= v.price) v.listPrice = 0;
          if (!d.images.length) d.images = v.images;
          v.images = d.images;
          v.tags = [v.sub, v.brand, Svc.cat(v.categoryId).name].map(U.lower);
          const wantActive = $('#f-active').checked;
          if (isNew) {
            v.status = !wantActive ? 'passive' : DB.settings.productModeration ? 'pending' : 'active';
            const p = DB.insert('products', Object.assign(v, { storeId: st.id, groupKey: null, sold: 0, views: 0, rating: 0, reviewCount: 0, priceHistory: [[Date.now(), v.price]], featured: false, freeShipping: false }));
            if (p.status === 'pending') DB.where('users', x => x.role === 'admin').forEach(a => Svc.notify(a.id, `🏷 Onay bekleyen yeni ürün: ${p.title} (${st.name})`, '/admin/products'));
            C.toast(p.status === 'pending' ? 'Ürün kaydedildi, yönetici onayına gönderildi' : 'Ürün yayına alındı 🎉', { link: '/p/' + p.id, linkText: 'Görüntüle' });
          } else {
            const p = Svc.product(d.id);
            const old = p.price;
            if (p.status === 'rejected') v.status = DB.settings.productModeration ? 'pending' : 'active';
            else if (['active', 'passive'].includes(p.status)) v.status = wantActive ? 'active' : 'passive';
            const newPrice = v.price; delete v.price;
            Object.assign(p, v);
            p._h = '';
            const pr = Svc.setPrice(p, newPrice, { source: 'Ürün düzenleme' });
            void old;
            DB.save();
            C.toast(pr.requested ? 'Değişiklikler kaydedildi. Yeni fiyat artış sınırını aştığı için onaya gönderildi.' : 'Değişiklikler kaydedildi', { icon: pr.requested ? '📨' : '✓', link: pr.requested ? '/seller/price-requests' : null, linkText: 'Talepler' });
          }
          Svc._vocab = null;
          go('/seller/products');
        };
      }
    });
  };

  /* =============== SORU & CEVAP =============== */
  S.questions = (_, q) => {
    const g = guard(); if (g) return g;
    const st = Svc.myStore();
    const f = q.f || 'open';
    let list = DB.where('questions', x => x.storeId === st.id).sort((a, b) => b.createdAt - a.createdAt);
    const open = list.filter(x => !x.answer).length;
    if (f === 'open') list = list.filter(x => !x.answer); else if (f === 'done') list = list.filter(x => x.answer);
    const quick = ['Merhaba, saat 15:00\'e kadar verilen siparişler aynı gün kargoya teslim edilir.', 'Ürünümüz orijinal ve faturalıdır, garanti belgesiyle gönderilir.', 'Standart kalıptır, kendi bedeninizi almanızı öneririz.', '15 gün içinde ücretsiz iade ve değişim hakkınız bulunmaktadır.'];
    const html = `<div class="tabs" style="margin-bottom:14px">${[['open', 'Cevap bekleyen', open], ['done', 'Cevaplanan'], ['all', 'Tümü']].map(([k, l, n]) => `<a class="${f === k ? 'on' : ''}" href="#/seller/questions?f=${k}">${l}${n ? ` <span class="badge b-brand">${n}</span>` : ''}</a>`).join('')}</div>
      ${list.length ? `<div class="stack">${list.map(x => { const p = Svc.product(x.productId); return `<div class="card card-pad stack" style="gap:10px"><div class="row nowrap">${p ? `<span style="width:44px;height:44px;border-radius:8px;overflow:hidden;flex:none">${K.img(p.images[0])}</span>` : ''}<div class="grow" style="min-width:0"><a class="xs muted" href="#/p/${x.productId}">${esc(p ? p.title : 'Silinmiş ürün')}</a><div><b>❓ ${esc(x.text)}</b></div></div><span class="xs muted">${U.ago(x.createdAt)}</span></div>
        ${x.answer ? `<div class="reply small"><b>Cevabın:</b> ${esc(x.answer)}</div>` : `<form class="stack" data-ans="${x.id}" style="gap:8px"><div class="row" style="gap:6px">${quick.map((t, i) => `<button type="button" class="chip" data-quick="${i}">${['Kargo süresi', 'Orijinallik', 'Kalıp', 'İade'][i]}</button>`).join('')}</div><div class="row nowrap"><input class="input" placeholder="Cevabını yaz…" required><button class="btn btn-primary">Gönder</button></div></form>`}</div>`; }).join('')}</div>` : K.empty('💬', f === 'open' ? 'Cevap bekleyen soru yok' : 'Soru yok', f === 'open' ? 'Harika, tüm soruları cevaplamışsın 👏' : '')}`;
    return page({
      title: 'Soru & cevap', sub: `${open} soru cevap bekliyor`, html,
      mount(main) {
        main.addEventListener('click', e => { const b = e.target.closest('[data-quick]'); if (b) { b.closest('form').querySelector('input').value = quick[+b.dataset.quick]; } });
        main.addEventListener('submit', e => { const f = e.target.closest('[data-ans]'); if (!f) return; e.preventDefault(); Svc.answer(+f.dataset.ans, f.querySelector('input').value.trim()); C.toast('Cevabın yayınlandı, müşteri bilgilendirildi'); Router.refresh(); });
      }
    });
  };

  /* =============== DEĞERLENDİRMELER =============== */
  S.reviews = (_, q) => {
    const g = guard(); if (g) return g;
    const st = Svc.myStore();
    const all = DB.where('reviews', r => r.storeId === st.id).sort((a, b) => b.createdAt - a.createdAt);
    const rf = +q.r || 0;
    const list = rf ? all.filter(r => r.rating === rf) : all;
    const dist = [5, 4, 3, 2, 1].map(s => all.filter(r => r.rating === s).length);
    const sr = Svc.storeRating(st);
    const noReply = all.filter(r => r.rating <= 3 && !r.sellerReply).length;
    const html = `<div class="g2" style="grid-template-columns:300px 1fr;align-items:start">
      <div class="card card-pad stack"><div class="row nowrap"><span style="font:800 2.6rem var(--f-display)">${sr.avg.toFixed(1).replace('.', ',')}</span><div>${K.stars(sr.avg, '1.1rem')}<div class="small muted">${all.length} değerlendirme</div></div></div>
        <div class="rdist">${dist.map((n, i) => `<a href="#/seller/reviews?r=${5 - i}">${5 - i} ★</a><div class="bar"><i style="width:${all.length ? n / all.length * 100 : 0}%"></i></div><span class="muted">${n}</span>`).join('')}</div>
        ${noReply ? `<div class="insight warnish"><span class="ii">💬</span><div class="small"><b>${noReply} olumsuz yorum cevapsız.</b> Olumsuz yorumlara cevap veren satıcıların puanı ortalama 0,3 daha yüksek.</div></div>` : ''}
        ${rf ? '<a class="btn btn-sm" href="#/seller/reviews">Filtreyi kaldır</a>' : ''}</div>
      <div class="card" style="padding:0 18px">${list.length ? list.slice(0, 60).map(r => { const p = Svc.product(r.productId); return `<div class="review"><div class="row">${K.stars(r.rating)}<b class="small">${esc(r.userName)}</b><span class="xs muted">${U.date(r.createdAt)}</span><a class="xs muted" href="#/p/${r.productId}">${esc(p ? p.title : '')}</a></div><p class="small">${esc(r.text)}</p>
        ${r.sellerReply ? `<div class="reply"><b>Cevabın:</b> ${esc(r.sellerReply)}</div>` : `<form class="row nowrap" data-rep="${r.id}"><input class="input" placeholder="Müşteriye herkese açık cevap yaz…" style="padding:7px 10px"><button class="btn btn-sm">Cevapla</button></form>`}</div>`; }).join('') : K.empty('⭐', 'Değerlendirme yok')}</div></div>`;
    return page({
      title: 'Değerlendirmeler', sub: 'Müşteri yorumları ve mağaza puanın', html,
      mount(main) { main.addEventListener('submit', e => { const f = e.target.closest('[data-rep]'); if (!f) return; e.preventDefault(); const v = f.querySelector('input').value.trim(); if (!v) return; const r = DB.get('reviews', f.dataset.rep); r.sellerReply = v; DB.save(); Svc.notify(r.userId, '💬 Satıcı değerlendirmene cevap verdi', '/p/' + r.productId); C.toast('Cevabın yayınlandı'); Router.refresh(); }); }
    });
  };

  /* =============== MAĞAZA TASARIMI =============== */
  S.design = () => {
    const g = guard(); if (g) return g;
    const st = Svc.myStore();
    const logos = ['🏪', '🎨', '🧵', '👟', '📱', '🌸', '🫒', '📚', '🧸', '🏡', '⚡', '🛠', '💎', '☕', '👣', '📖', '🏅', '🐣'];
    const colors = ['#f25c05', '#0e7c74', '#2459d6', '#c2418a', '#a16207', '#15803d', '#7c5cd6', '#1a1815', '#d92626', '#0369a1'];
    const html = `<div class="g2" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:start">
      <div class="stack lg">
        <section class="card card-pad stack"><h3 style="margin:0">Logo</h3>
          <div class="row" id="logoRow" style="gap:6px">${logos.map(l => `<button type="button" class="chip ${!st.logoImg && st.logo === l ? 'on' : ''}" data-logo="${l}" style="font-size:1.1rem">${l}</button>`).join('')}</div>
          <label class="btn btn-sm" style="align-self:flex-start" for="logoFile">📷 Logo yükle</label><input type="file" id="logoFile" accept="image/*" hidden>${st.logoImg ? '<button class="btn btn-sm btn-ghost" id="logoClr" style="align-self:flex-start">Yüklenen logoyu kaldır</button>' : ''}</section>
        <section class="card card-pad stack"><h3 style="margin:0">Renkler & kapak</h3>
          <span class="lbl">Marka rengi</span><div class="color-row" id="colRow">${colors.map(c => `<button type="button" class="${st.color === c ? 'on' : ''}" data-col="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div>
          <div class="form-grid"><div class="field"><label for="cv1">Kapak rengi 1</label><input type="color" id="cv1" value="${esc(st.cover[0])}" class="input" style="height:42px;padding:4px"></div><div class="field"><label for="cv2">Kapak rengi 2</label><input type="color" id="cv2" value="${esc(st.cover[1])}" class="input" style="height:42px;padding:4px"></div></div>
          <label class="btn btn-sm" style="align-self:flex-start" for="coverFile">🖼 Kapak fotoğrafı yükle</label><input type="file" id="coverFile" accept="image/*" hidden>${st.coverImg ? '<button class="btn btn-sm btn-ghost" id="coverClr" style="align-self:flex-start">Kapak fotoğrafını kaldır</button>' : ''}</section>
        <section class="card card-pad stack"><h3 style="margin:0">Metinler</h3>
          <div class="field"><label for="dDesc">Mağaza açıklaması</label><textarea class="textarea" id="dDesc">${esc(st.description)}</textarea></div>
          <div class="field"><label for="dAnn">Duyuru bandı</label><input class="input" id="dAnn" value="${esc(st.announcement || '')}" placeholder="Örn: Tüm siparişlerde renk kartelası hediye!"><span class="hint">Mağaza sayfanın en üstünde gösterilir. Boş bırakırsan gizlenir.</span></div></section>
        <section class="card card-pad stack"><div class="row between"><h3 style="margin:0">Mağaza bannerları</h3><button class="btn btn-sm btn-primary" id="addBn">+ Banner ekle</button></div>
          <div class="stack" id="bnList">${(st.banners || []).map((b, i) => `<div class="row nowrap" style="gap:10px;border:1px solid var(--line);border-radius:10px;padding:8px"><div style="width:120px;height:56px;border-radius:8px;background:${K.bannerBg(b)};display:grid;place-items:center;font-size:1.4rem;flex:none">${b.img ? '' : esc(b.emoji || '')}</div><div class="grow small" style="min-width:0"><b>${esc(b.title)}</b><div class="xs muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(b.subtitle)}</div></div><label class="switch"><input type="checkbox" data-bnact="${i}" ${b.active ? 'checked' : ''}><span></span></label><button class="btn btn-sm btn-ghost" data-bnedit="${i}">✏️</button><button class="btn btn-sm btn-ghost" data-bndel="${i}">🗑</button></div>`).join('') || '<p class="small muted">Henüz banner yok.</p>'}</div></section>
        <button class="btn btn-primary btn-lg" id="saveD" style="align-self:flex-start">Tasarımı kaydet</button>
      </div>
      <div class="stack" style="position:sticky;top:16px"><span class="eyebrow">Canlı önizleme</span><div id="dPrev"></div><a class="btn" href="#/store/${st.id}">Mağaza sayfasını aç →</a></div>
    </div>`;
    return page({
      title: 'Mağaza tasarımı', sub: 'Mağaza vitrinini markana göre kişiselleştir', html,
      mount(main) {
        const d = { logo: st.logo, logoImg: st.logoImg, color: st.color, cover: st.cover.slice(), coverImg: st.coverImg };
        const prev = () => {
          const fake = Object.assign({}, st, d, { description: U.$('#dDesc').value, announcement: U.$('#dAnn').value });
          U.$('#dPrev').innerHTML = `<div class="store-hero" style="background:linear-gradient(120deg,${fake.cover[0]},${fake.cover[1]})">${fake.coverImg ? `<div class="sh-bg" style="background-image:url('${fake.coverImg}')"></div>` : ''}<div class="sh-shade"></div><div class="sh-in">${K.storeAvatar(fake, 70)}<div class="grow"><h1 style="font-size:1.5rem">${esc(fake.name)}</h1><div class="small" style="opacity:.85">${U.num(Svc.followerCount(st))} takipçi · ${esc(fake.city)}</div></div><span class="btn btn-primary btn-sm">+ Takip et</span></div></div>
            ${fake.announcement ? `<div class="insight brandish" style="margin-top:10px"><span class="ii">📣</span><div class="small">${esc(fake.announcement)}</div></div>` : ''}
            <div class="g2e" style="margin-top:10px">${(st.banners || []).filter(b => b.active).slice(0, 2).map(b => `<div class="mini-banner" style="background:${K.bannerBg(b)};min-height:110px"><span class="art" style="font-size:44px">${esc(b.emoji || '')}</span><b style="font-size:1rem">${esc(b.title)}</b><span class="xs">${esc(b.subtitle)}</span></div>`).join('')}</div>
            <p class="small muted" style="margin-top:10px">${esc(fake.description)}</p>`;
        };
        prev();
        main.addEventListener('input', prev);
        U.$('#logoRow').onclick = e => { const b = e.target.closest('[data-logo]'); if (!b) return; d.logo = b.dataset.logo; d.logoImg = ''; U.$$('[data-logo]').forEach(x => x.classList.toggle('on', x === b)); prev(); };
        U.$('#colRow').onclick = e => { const b = e.target.closest('[data-col]'); if (!b) return; d.color = b.dataset.col; U.$$('[data-col]').forEach(x => x.classList.toggle('on', x === b)); prev(); };
        U.$('#cv1').oninput = e => { d.cover[0] = e.target.value; prev(); };
        U.$('#cv2').oninput = e => { d.cover[1] = e.target.value; prev(); };
        U.$('#logoFile').onchange = async e => { if (e.target.files[0]) { d.logoImg = await U.readImage(e.target.files[0], 300); prev(); } };
        U.$('#coverFile').onchange = async e => { if (e.target.files[0]) { d.coverImg = await U.readImage(e.target.files[0], 1400); prev(); } };
        const lc = U.$('#logoClr'); lc && (lc.onclick = () => { d.logoImg = ''; prev(); });
        const cc = U.$('#coverClr'); cc && (cc.onclick = () => { d.coverImg = ''; prev(); });
        U.$('#saveD').onclick = () => { Object.assign(st, d, { description: U.$('#dDesc').value.trim(), announcement: U.$('#dAnn').value.trim() }); DB.save(); C.toast('Mağaza tasarımı kaydedildi', { link: '/store/' + st.id, linkText: 'Gör' }); Router.refresh(); };
        U.$('#addBn').onclick = () => bannerModal(null, b => { st.banners.push(Object.assign({ id: Date.now(), active: true }, b)); DB.save(); Router.refresh(); });
        main.addEventListener('click', e => {
          let b;
          if ((b = e.target.closest('[data-bnedit]'))) { const bn = st.banners[+b.dataset.bnedit]; bannerModal(bn, v => { Object.assign(bn, v); DB.save(); Router.refresh(); }); }
          else if ((b = e.target.closest('[data-bndel]'))) { st.banners.splice(+b.dataset.bndel, 1); DB.save(); Router.refresh(); }
        });
        main.addEventListener('change', e => { const t = e.target.closest('[data-bnact]'); if (t) { st.banners[+t.dataset.bnact].active = t.checked; DB.save(); prev(); } });
      }
    });
  };

  /** Hem satıcı hem yönetici için banner düzenleme penceresi. */
  const bannerModal = C.bannerModal = (b, save, { withPlace = false } = {}) => {
    b = b || { title: '', subtitle: '', kicker: '', cta: 'Keşfet', c1: '#f25c05', c2: '#c2418a', emoji: '🛍️', img: '', link: '', place: 'hero' };
    let img = b.img || '';
    Modal.open({
      title: b.title ? 'Banner düzenle' : 'Yeni banner', wide: true,
      body: `<div class="g2e"><div class="stack">
        ${withPlace ? `<div class="field"><label for="bn-pl">Yerleşim</label><select class="select" id="bn-pl"><option value="hero" ${b.place === 'hero' ? 'selected' : ''}>Ana slider</option><option value="side" ${b.place === 'side' ? 'selected' : ''}>Yan küçük banner</option></select></div>` : ''}
        <div class="field"><label for="bn-k">Üst etiket</label><input class="input" id="bn-k" value="${esc(b.kicker || '')}" placeholder="Örn: Kasım fırsatları"></div>
        <div class="field"><label for="bn-t">Başlık</label><input class="input" id="bn-t" value="${esc(b.title)}"></div>
        <div class="field"><label for="bn-s">Alt metin</label><input class="input" id="bn-s" value="${esc(b.subtitle)}"></div>
        <div class="form-grid"><div class="field"><label for="bn-cta">Buton metni</label><input class="input" id="bn-cta" value="${esc(b.cta || '')}"></div><div class="field"><label for="bn-l">Bağlantı</label><input class="input" id="bn-l" value="${esc(b.link || '')}" placeholder="/search?cat=8"></div></div>
        <div class="form-grid"><div class="field"><label for="bn-c1">Renk 1</label><input type="color" class="input" id="bn-c1" value="${esc(b.c1)}" style="height:42px;padding:4px"></div><div class="field"><label for="bn-c2">Renk 2</label><input type="color" class="input" id="bn-c2" value="${esc(b.c2)}" style="height:42px;padding:4px"></div><div class="field"><label for="bn-e">Simge</label><input class="input" id="bn-e" value="${esc(b.emoji || '')}" maxlength="4"></div></div>
        <div class="row"><label class="btn btn-sm" for="bn-f">🖼 Görsel yükle</label><input type="file" id="bn-f" accept="image/*" hidden><button type="button" class="btn btn-sm btn-ghost" id="bn-fx">Görseli kaldır</button></div>
      </div><div class="stack"><span class="eyebrow">Önizleme</span><div class="hero" style="min-height:220px" id="bn-prev"></div></div></div>`,
      onMount(bg) {
        const v = () => ({ kicker: U.$('#bn-k', bg).value, title: U.$('#bn-t', bg).value, subtitle: U.$('#bn-s', bg).value, cta: U.$('#bn-cta', bg).value, link: U.$('#bn-l', bg).value, c1: U.$('#bn-c1', bg).value, c2: U.$('#bn-c2', bg).value, emoji: U.$('#bn-e', bg).value, img, place: withPlace ? U.$('#bn-pl', bg).value : b.place });
        const pr = () => { const x = v(); U.$('#bn-prev', bg).innerHTML = `<div class="slide on" style="background:${K.bannerBg(x)};padding:24px">${x.img ? '<div class="s-img" style="background-image:url(\'' + x.img + '\')"></div><div class="s-shade"></div>' : ''}<div class="s-txt" style="max-width:65%">${x.kicker ? `<span class="s-kick">${esc(x.kicker)}</span>` : ''}<h2 style="font-size:1.5rem">${esc(x.title || 'Başlık')}</h2><p class="small">${esc(x.subtitle)}</p>${x.cta ? `<span class="btn btn-sm">${esc(x.cta)} →</span>` : ''}</div>${x.img ? '' : `<span class="s-art" style="font-size:80px">${esc(x.emoji)}</span>`}</div>`; };
        pr(); bg.addEventListener('input', pr); bg.addEventListener('change', pr);
        U.$('#bn-f', bg).onchange = async e => { if (e.target.files[0]) { img = await U.readImage(e.target.files[0], 1400); pr(); } };
        U.$('#bn-fx', bg).onclick = () => { img = ''; pr(); };
        bg._v = v;
      },
      actions: [{ label: 'Vazgeç' }, { label: 'Kaydet', primary: true, onClick: bg => { const x = bg._v(); if (!x.title) { C.toast('Başlık zorunlu', { icon: '⚠️' }); return false; } save(x); C.toast('Banner kaydedildi'); } }]
    });
  };

  /* =============== KAMPANYA & KUPON =============== */
  S.campaigns = () => {
    const g = guard(); if (g) return g;
    const st = Svc.myStore();
    const coupons = DB.where('coupons', c => c.storeId === st.id);
    const prods = DB.where('products', p => p.storeId === st.id && p.status === 'active');
    const onSale = prods.filter(p => p.listPrice > p.price);
    const subs = U.uniq(prods.map(p => p.sub));
    const html = `<div class="g2e" style="align-items:start">
      <section class="card card-pad stack"><div class="row between"><h3 style="margin:0">🎟 Mağaza kuponları</h3><button class="btn btn-sm btn-primary" id="newCp">+ Kupon oluştur</button></div>
        ${coupons.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Kod</th><th>İndirim</th><th class="r">Kullanım</th><th>Bitiş</th><th></th></tr></thead><tbody>${coupons.map(c => `<tr><td><b>${esc(c.code)}</b><div class="xs muted">${esc(c.title)}</div></td><td class="small">${c.type === 'percent' ? '%' + c.value : U.tl0(c.value)}<div class="xs muted">min ${U.tl0(c.minTotal)}</div></td><td class="r small">${c.used}/${c.limit}<div class="bar brand" style="width:70px;margin-left:auto"><i style="width:${Math.min(100, c.used / c.limit * 100)}%"></i></div></td><td class="small">${c.expiresAt < Date.now() ? '<span class="badge b-mute">Süresi doldu</span>' : U.dayMonth(c.expiresAt)}</td><td><div class="row nowrap"><label class="switch"><input type="checkbox" data-cpact="${c.id}" ${c.active ? 'checked' : ''}><span></span></label><button class="btn btn-sm btn-ghost" data-cpdel="${c.id}">🗑</button></div></td></tr>`).join('')}</tbody></table></div>` : '<p class="small muted">Henüz kuponun yok. Takipçilerine özel kupon, sepet tutarını ortalama %18 artırıyor.</p>'}</section>
      <section class="card card-pad stack"><h3 style="margin:0">🏷 Mağaza indirimi</h3><p class="small muted">Seçtiğin ürün grubuna yüzde indirim uygula. Eski fiyat üstü çizili görünür, fiyat geçmişine işlenir ve fiyat alarmı kuran müşterilere bildirim gider.</p>
        <div class="form-grid"><div class="field"><label for="dsSub">Ürün grubu</label><select class="select" id="dsSub"><option value="">Tüm ürünler (${prods.length})</option>${subs.map(s => `<option>${esc(s)}</option>`).join('')}</select></div><div class="field"><label for="dsPct">İndirim (%)</label><input class="input" id="dsPct" type="number" value="15" min="1" max="80"></div></div>
        <div class="row"><button class="btn btn-primary" id="dsApply">İndirimi uygula</button>${onSale.length ? `<button class="btn" id="dsClear">${onSale.length} üründeki indirimi kaldır</button>` : ''}</div>
        <div class="insight info"><span class="ii">✦</span><div class="small"><b>İpucu:</b> MarkaBahçem üstü çizili fiyatı son 90 günde gerçekten uygulanmış mı diye kontrol eder. Gerçek indirimler "Fiyat analizi: İyi fiyat" rozeti alır.</div></div></section>
      <section class="card card-pad stack"><h3 style="margin:0">🚚 Kargo kampanyası</h3><p class="small muted">Şu an ${st.freeShipOver ? U.tl(st.freeShipOver) + ' üzeri siparişlerde kargo bedava' : 'tüm siparişlerde kargo bedava'}.</p>
        <div class="row">${[0, 250, 400, 500, 750].map(v => `<button class="chip ${st.freeShipOver === v ? 'on' : ''}" data-fs="${v}">${v ? U.tl0(v) + ' üzeri' : 'Her zaman bedava'}</button>`).join('')}</div></section>
      <section class="card card-pad stack"><h3 style="margin:0">⚡ Flaş fırsatlara başvur</h3><p class="small muted">Ana sayfadaki Flaş Fırsatlar alanı günlük yenilenir. Ürününü önermek için indirim oranını seç; yönetici ekibi uygun gördüğünde yarının listesine ekler.</p>
        <div class="row nowrap"><select class="select" id="flP">${prods.map(p => `<option value="${p.id}">${esc(p.title.slice(0, 50))}</option>`).join('')}</select><select class="select" id="flPct" style="width:100px">${[15, 20, 25, 30, 40].map(v => `<option value="${v}">%${v}</option>`).join('')}</select><button class="btn btn-dark" id="flApply">Başvur</button></div></section>
    </div>`;
    return page({
      title: 'Kampanya & kupon', sub: 'İndirim, kupon ve kargo kampanyalarını yönet', html,
      mount(main) {
        U.$('#newCp').onclick = () => couponModal(st.id, () => Router.refresh());
        main.addEventListener('change', e => { const t = e.target.closest('[data-cpact]'); if (t) { DB.update('coupons', t.dataset.cpact, { active: t.checked }); C.toast(t.checked ? 'Kupon aktif' : 'Kupon durduruldu'); } });
        main.addEventListener('click', e => {
          let b;
          if ((b = e.target.closest('[data-cpdel]'))) { DB.remove('coupons', b.dataset.cpdel); Router.refresh(); }
          else if ((b = e.target.closest('[data-fs]'))) { st.freeShipOver = +b.dataset.fs; DB.save(); C.toast('Kargo kampanyası güncellendi'); Router.refresh(); }
        });
        U.$('#dsApply').onclick = () => {
          const sub = U.$('#dsSub').value, pct = +U.$('#dsPct').value / 100;
          const ps = prods.filter(p => !sub || p.sub === sub);
          ps.forEach(p => { const base = p.listPrice > p.price ? p.listPrice : p.price; p.listPrice = base; Svc.setPrice(p, base * (1 - pct), { source: 'Mağaza indirimi' }); p.listPrice = base; });
          DB.save(); C.toast(`${ps.length} ürüne %${Math.round(pct * 100)} indirim uygulandı`); Router.refresh();
        };
        const dc = U.$('#dsClear'); dc && (dc.onclick = () => { onSale.forEach(p => { const lp = p.listPrice; p.listPrice = 0; Svc.setPrice(p, lp, { source: 'Kampanya bitişi', reason: 'Kampanya bitişi' }); }); DB.save(); C.toast('İndirimler kaldırıldı'); Router.refresh(); });
        U.$('#flApply').onclick = () => { const p = Svc.product(+U.$('#flP').value); DB.where('users', u => u.role === 'admin').forEach(a => Svc.notify(a.id, `⚡ ${st.name}, "${p.title}" için %${U.$('#flPct').value} flaş fırsat başvurusu yaptı`, '/admin/deals')); C.toast('Başvurun yönetime iletildi', { icon: '⚡' }); };
      }
    });
  };
  const couponModal = C.couponModal = (storeId, done) => {
    Modal.open({
      title: 'Yeni kupon', body: `<div class="form-grid"><div class="field"><label for="c-code">Kupon kodu</label><input class="input" id="c-code" value="${storeId ? 'MAGAZA' : 'BAHCEM'}${Math.floor(10 + Math.random() * 89)}" style="text-transform:uppercase"></div><div class="field"><label for="c-title">Başlık</label><input class="input" id="c-title" value="Takipçilere özel indirim"></div>
        <div class="field"><label for="c-type">Tür</label><select class="select" id="c-type"><option value="amount">Tutar (TL)</option><option value="percent">Yüzde (%)</option></select></div><div class="field"><label for="c-val">Değer</label><input class="input" id="c-val" type="number" value="50"></div>
        <div class="field"><label for="c-min">Minimum sepet (TL)</label><input class="input" id="c-min" type="number" value="400"></div><div class="field"><label for="c-lim">Kullanım limiti</label><input class="input" id="c-lim" type="number" value="200"></div>
        <div class="field"><label for="c-days">Geçerlilik (gün)</label><input class="input" id="c-days" type="number" value="14"></div><div class="field"><label for="c-max">En fazla indirim (yüzde için, TL)</label><input class="input" id="c-max" type="number" value="300"></div></div>`,
      actions: [{ label: 'Vazgeç' }, { label: 'Oluştur', primary: true, onClick: bg => {
        const v = id => U.$(id, bg).value.trim();
        const code = v('#c-code').toLocaleUpperCase('tr-TR').replace(/İ/g, 'I').replace(/\s/g, '');
        if (!/^[A-Z0-9]{4,16}$/.test(code)) { C.toast('Kod 4-16 harf/rakam olmalı', { icon: '⚠️' }); return false; }
        if (Svc.findCoupon(code)) { C.toast('Bu kod zaten kullanılıyor', { icon: '⚠️' }); return false; }
        DB.insert('coupons', { code, title: v('#c-title'), type: v('#c-type'), value: +v('#c-val'), minTotal: +v('#c-min'), limit: +v('#c-lim'), used: 0, maxDiscount: v('#c-type') === 'percent' ? +v('#c-max') : 0, storeId, expiresAt: Date.now() + (+v('#c-days') || 14) * U.DAY, active: true });
        if (storeId) { const st = Svc.store(storeId); st.followers.forEach(uid => Svc.notify(uid, `🎟 Takip ettiğin ${st.name} sana özel ${code} kuponunu tanımladı!`, '/store/' + st.id)); }
        C.toast('Kupon oluşturuldu: ' + code); done && done();
      } }]
    });
  };

  /* =============== RAPORLAR =============== */
  const reportView = (storeId, q, base) => {
    const days = +q.d || 30;
    const to = q.to ? new Date(q.to).getTime() + U.DAY - 1 : Date.now();
    const from = q.from ? new Date(q.from).getTime() : U.startOfDay(to - (days - 1) * U.DAY);
    const s = Svc.stats({ storeId, from, to });
    const iso = t => new Date(t - new Date(t).getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const prev = Svc.stats({ storeId, from: from - (to - from), to: from });
    const buyers = U.groupBy(s.rows.filter(x => x.pk.status !== 'cancelled'), x => x.o.userId);
    const firstOrder = new Map();
    DB.all('orders').forEach(o => { if (!storeId || o.packages.some(p => p.storeId === storeId)) { if (!firstOrder.has(o.userId) || firstOrder.get(o.userId) > o.createdAt) firstOrder.set(o.userId, o.createdAt); } });
    const newB = [...buyers.keys()].filter(u => firstOrder.get(u) >= from).length;
    const colors = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];
    const cities = [...U.groupBy(s.rows.filter(x => x.pk.status !== 'cancelled'), x => x.o.address.city)].map(([k, v]) => ({ label: k, value: U.sum(v, x => x.pk.subtotal) })).sort((a, b) => b.value - a.value).slice(0, 6);
    const html = `<div class="toolbar"><div class="seg" id="rp">${[[7, '7 gün'], [30, '30 gün'], [90, '90 gün'], [150, '150 gün']].map(([v, l]) => `<button class="${!q.from && days === v ? 'on' : ''}" data-d="${v}">${l}</button>`).join('')}</div>
        <form class="row nowrap" id="rng" style="gap:6px"><input type="date" class="input" id="rf" value="${iso(from)}" style="min-width:0;width:150px" aria-label="Başlangıç"><span>–</span><input type="date" class="input" id="rt" value="${iso(to)}" style="min-width:0;width:150px" aria-label="Bitiş"><button class="btn">Uygula</button></form>
        <button class="btn" id="csvP" style="margin-left:auto">⬇ Ürün raporu</button><button class="btn" id="csvD">⬇ Günlük rapor</button></div>
      <div class="kpis">${K.kpi('Ciro', U.tl0(s.revenue), s.dRevenue)}${K.kpi('Sipariş', U.num(s.orders), s.dOrders)}${K.kpi('Ortalama sepet', U.tl0(s.aov), s.prevAov ? (s.aov - s.prevAov) / s.prevAov * 100 : null)}${K.kpi('Komisyon', U.tl0(s.commission))}${K.kpi('İade tutarı', U.tl0(s.returned))}${K.kpi('Net', U.tl0(s.net))}</div>
      <div class="card card-pad" style="margin-top:16px"><div class="row between" style="margin-bottom:8px"><h3 style="margin:0">Ciro: bu dönem ve önceki dönem</h3><div class="legend"><span><i style="background:var(--c1)"></i>Bu dönem</span><span><i style="background:var(--c6)"></i>Önceki dönem</span></div></div>
        ${Chart.line({ series: [{ name: 'Bu dönem', values: s.series.map(x => U.round2(x.rev)), color: 'var(--c1)' }, { name: 'Önceki dönem', values: prev.series.slice(0, s.series.length).map(x => U.round2(x.rev)), color: 'var(--c6)', dash: true }], labels: s.series.map(x => U.dayMonth(x.t)), money: true, height: 260 })}</div>
      <div class="g3" style="margin-top:16px">
        <div class="card card-pad"><h3>Sipariş durumları</h3>${Chart.donut({ items: Object.entries(s.statusCount).map(([k, v], i) => ({ label: Svc.STATUS[k].label, value: v, color: colors[i % 6] })), center: U.num(U.sum(Object.values(s.statusCount))) })}
          <div class="row small" style="margin-top:12px;gap:16px"><span>İptal oranı <b class="${s.cancelRate > 5 ? 'bad' : 'ok'}">%${s.cancelRate.toFixed(1).replace('.', ',')}</b></span><span>İade oranı <b class="${s.returnRate > 5 ? 'bad' : 'ok'}">%${s.returnRate.toFixed(1).replace('.', ',')}</b></span></div></div>
        <div class="card card-pad"><h3>Müşteriler</h3><div class="stack"><div class="row between"><span class="muted">Tekil alıcı</span><b>${U.num(buyers.size)}</b></div><div class="row between"><span class="muted">İlk kez alan</span><b>${U.num(newB)}</b></div><div class="row between"><span class="muted">Tekrar alan</span><b>${U.num(buyers.size - newB)}</b></div>
          <div class="bar ok"><i style="width:${buyers.size ? (buyers.size - newB) / buyers.size * 100 : 0}%"></i></div><span class="xs muted">Sadakat oranı %${buyers.size ? Math.round((buyers.size - newB) / buyers.size * 100) : 0}</span></div></div>
        <div class="card card-pad"><h3>Şehirlere göre ciro</h3>${Chart.bars({ items: cities, horizontal: true, money: true })}</div>
      </div>
      <div class="card" style="margin-top:16px"><div style="padding:16px 18px 0"><h3 style="margin:0">Ürün performansı</h3></div><div style="overflow-x:auto;padding-top:8px"><table class="tbl"><thead><tr><th>#</th><th>Ürün</th><th class="r">Adet</th><th class="r">Ciro</th><th class="r">Pay</th><th class="r">Stok</th></tr></thead><tbody>
        ${s.topProducts.slice(0, 20).map((p, i) => { const pp = Svc.product(p.id); return `<tr><td><span class="rank">${i + 1}</span></td><td><div class="row nowrap" style="gap:8px"><span class="thumb" style="width:34px;height:34px">${K.img(p.image)}</span><span class="small">${esc(p.title)}${!storeId && pp ? `<div class="xs muted">${esc(Svc.store(pp.storeId).name)}</div>` : ''}</span></div></td><td class="r">${p.qty}</td><td class="r"><b>${U.tl(p.rev)}</b></td><td class="r small">%${s.revenue ? (p.rev / s.revenue * 100).toFixed(1).replace('.', ',') : 0}</td><td class="r">${pp ? pp.stock : '—'}</td></tr>`; }).join('')}</tbody></table></div></div>`;
    const mount = main => {
      U.$('#rp', main).onclick = e => { const b = e.target.closest('[data-d]'); if (b) go(base + '?d=' + b.dataset.d); };
      U.$('#rng', main).onsubmit = e => { e.preventDefault(); go(base + U.qs({ from: U.$('#rf').value, to: U.$('#rt').value })); };
      U.$('#csvP', main).onclick = () => U.download('urun-raporu.csv', U.csv([['Ürün', 'Adet', 'Ciro']].concat(s.topProducts.map(p => [p.title, p.qty, p.rev.toFixed(2).replace('.', ',')]))));
      U.$('#csvD', main).onclick = () => U.download('gunluk-rapor.csv', U.csv([['Tarih', 'Sipariş', 'Ciro']].concat(s.series.map(x => [U.dateS(x.t), x.orders, x.rev.toFixed(2).replace('.', ',')]))));
    };
    return { html, mount, sub: `${U.date(from)} – ${U.date(to)}` };
  };
  C.reportView = reportView;
  S.reports = (_, q) => {
    const g = guard(); if (g) return g;
    const r = reportView(Svc.myStore().id, q, '/seller/reports');
    return page({ title: 'Raporlar', sub: r.sub, html: r.html, mount: r.mount });
  };

  /* =============== FİNANS =============== */
  S.finance = () => {
    const g = guard(); if (g) return g;
    const st = Svc.myStore();
    const payouts = DB.where('payouts', p => p.storeId === st.id).sort((a, b) => b.createdAt - a.createdAt);
    const lastPaid = payouts.filter(p => p.status === 'paid')[0];
    const since = lastPaid ? lastPaid.createdAt : 0;
    const delivered = Svc.packagesIn(since, Date.now(), st.id).filter(x => x.pk.status === 'delivered');
    const inTransit = Svc.packagesIn(0, Date.now(), st.id).filter(x => ['new', 'preparing', 'shipped'].includes(x.pk.status));
    const gross = U.sum(delivered, x => x.pk.subtotal - (x.pk.discount || 0));
    const com = U.sum(delivered, x => Svc.commissionOf(x.pk));
    const ship = U.sum(delivered, x => x.pk.shipping ? 0 : 29.9);
    const balance = U.round2(gross - com - ship);
    const pending = U.round2(U.sum(inTransit, x => x.pk.subtotal - (x.pk.discount || 0) - Svc.commissionOf(x.pk)));
    const next = (lastPaid ? lastPaid.createdAt : Date.now()) + 14 * U.DAY;
    const requested = payouts.find(p => p.status === 'requested');
    const html = `<div class="kpis">${K.kpi('Çekilebilir bakiye', U.tl(balance))}${K.kpi('Yoldaki siparişler', U.tl(pending), null, '', 'Teslim edildiğinde bakiyeye eklenir')}${K.kpi('Sonraki ödeme', U.date(Math.max(next, Date.now())))}${K.kpi('Toplam ödenen', U.tl0(U.sum(payouts.filter(p => p.status === 'paid'), p => p.amount)))}</div>
      <div class="g2" style="margin-top:16px">
        <div class="card card-pad stack"><h3 style="margin:0">Bu dönemin hakediş dökümü</h3>
          <div class="sum-line"><span>Teslim edilen ${delivered.length} siparişin tutarı</span><b>${U.tl(gross)}</b></div><div class="sum-line"><span>MarkaBahçem komisyonu</span><span class="bad">-${U.tl(com)}</span></div><div class="sum-line"><span>Kargo katkı payı (ücretsiz kargolu siparişler)</span><span class="bad">-${U.tl(ship)}</span></div><div class="sum-total"><span>Net hakediş</span><span>${U.tl(balance)}</span></div>
          <div class="row"><button class="btn btn-primary" id="payReq" ${requested || balance < 100 ? 'disabled' : ''}>${requested ? 'Ödeme talebin işleniyor' : 'Erken ödeme talep et'}</button><span class="xs muted">IBAN: ${esc(st.iban)}</span></div></div>
        <div class="card card-pad"><h3>Kategori bazlı komisyon</h3><table class="spec-tbl"><tbody>${(st.cats || []).map(id => Svc.cat(id)).filter(Boolean).map(c => `<tr><td>${esc(c.name)}</td><td><b>%${st.commission != null ? st.commission : c.commission}</b></td></tr>`).join('')}</tbody></table><p class="xs muted" style="margin-top:10px">Komisyon, KDV dahil satış tutarı üzerinden hesaplanır. Özel oran için yöneticiyle görüşebilirsin.</p></div>
      </div>
      <div class="card" style="margin-top:16px"><div style="padding:16px 18px 0"><h3 style="margin:0">Ödeme geçmişi</h3></div><div style="overflow-x:auto;padding-top:8px"><table class="tbl"><thead><tr><th>Tarih</th><th>Açıklama</th><th class="r">Tutar</th><th>Durum</th></tr></thead><tbody>
        ${payouts.map(p => `<tr><td>${U.date(p.createdAt)}</td><td class="small">${p.status === 'requested' ? 'Erken ödeme talebi' : '14 günlük dönem hakedişi'}</td><td class="r"><b>${U.tl(p.amount)}</b></td><td>${p.status === 'paid' ? '<span class="badge b-ok">Ödendi</span>' : '<span class="badge b-warn">İşleniyor</span>'}</td></tr>`).join('')}</tbody></table></div></div>`;
    return page({
      title: 'Finans & hakediş', sub: 'Bakiye, komisyon ve ödemeler', html,
      mount(main) { const b = U.$('#payReq', main); b && (b.onclick = () => { DB.insert('payouts', { storeId: st.id, amount: balance, status: 'requested' }); DB.where('users', u => u.role === 'admin').forEach(a => Svc.notify(a.id, `💰 ${st.name} ${U.tl(balance)} erken ödeme talep etti`, '/admin/sellers')); C.toast('Ödeme talebin alındı. 1-2 iş gününde hesabında.'); Router.refresh(); }); }
    });
  };

  /* =============== AYARLAR =============== */
  S.settings = () => {
    const g = guard(); if (g) return g;
    const st = Svc.myStore();
    const html = `<form id="sf" class="stack lg" style="max-width:860px">
      <section class="card card-pad stack"><h3 style="margin:0">Mağaza bilgileri</h3><div class="form-grid">
        <div class="field"><label for="s-name">Mağaza adı</label><input class="input" id="s-name" value="${esc(st.name)}"></div><div class="field"><label for="s-city">Şehir</label><input class="input" id="s-city" value="${esc(st.city)}"></div>
        <div class="field"><label for="s-phone">Telefon</label><input class="input" id="s-phone" value="${esc(st.phone)}"></div><div class="field"><label for="s-tax">Vergi no</label><input class="input" id="s-tax" value="${esc(st.taxNo)}"></div>
        <div class="field full"><label for="s-iban">IBAN</label><input class="input" id="s-iban" value="${esc(st.iban)}"></div></div></section>
      <section class="card card-pad stack"><h3 style="margin:0">Kargo & teslimat</h3><div class="form-grid">
        <div class="field"><label for="s-fee">Kargo ücreti (TL)</label><input class="input" id="s-fee" type="number" step="0.01" value="${st.shippingFee}"></div><div class="field"><label for="s-free">Ücretsiz kargo eşiği (TL, 0 = her zaman)</label><input class="input" id="s-free" type="number" value="${st.freeShipOver}"></div>
        <div class="field"><label for="s-days">Kargoya teslim süresi</label><select class="select" id="s-days">${[[0, 'Aynı gün'], [1, '1 iş günü'], [2, '2 iş günü'], [3, '3 iş günü']].map(([v, l]) => `<option value="${v}" ${st.shipDays === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div></section>
      <section class="card card-pad stack"><div class="row between"><div><h3 style="margin:0">🏖 Tatil modu</h3><p class="small muted">Açıkken ürünlerin vitrinde görünmez, sipariş alınmaz. Mevcut siparişlerin etkilenmez.</p></div><label class="switch"><input type="checkbox" id="s-vac" ${st.vacation ? 'checked' : ''}><span></span></label></div></section>
      <section class="card card-pad stack"><h3 style="margin:0">Bildirimler</h3>${[['Yeni sipariş', true], ['Kritik stok uyarısı', true], ['Yeni soru ve yorum', true], ['Haftalık performans özeti (e-posta)', false]].map(([l, on], i) => `<label class="row between"><span class="small">${l}</span><span class="switch"><input type="checkbox" id="nt${i}" ${on ? 'checked' : ''}><span></span></span></label>`).join('')}</section>
      <button class="btn btn-primary btn-lg" style="align-self:flex-start">Ayarları kaydet</button></form>`;
    return page({
      title: 'Mağaza ayarları', html,
      mount(main) {
        U.$('#sf', main).onsubmit = e => {
          e.preventDefault();
          const v = id => U.$(id).value.trim();
          Object.assign(st, { name: v('#s-name') || st.name, city: v('#s-city'), phone: v('#s-phone'), taxNo: v('#s-tax'), iban: v('#s-iban'), shippingFee: +v('#s-fee') || 0, freeShipOver: +v('#s-free') || 0, shipDays: +v('#s-days'), vacation: U.$('#s-vac').checked });
          DB.save(); Svc._vocab = null; C.toast('Ayarlar kaydedildi'); Router.refresh();
        };
      }
    });
  };
})();
