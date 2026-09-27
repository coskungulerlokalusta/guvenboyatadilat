/**
 * GÜVENBOYA — Mobil "Hemen Ara" çubuğu + arama tıklaması takibi
 * ------------------------------------------------------------
 * Telefonda ekranın altına sabit bir arama çubuğu ekler ve sitedeki
 * tüm tel: linklerine tıklamaları Google Ads / Analytics'e
 * "telefon_tiklama" olayı olarak bildirir.
 * Numara site-loader.js tarafından güncellenirse çubuk da güncellenir.
 */
(function () {
  var TEL = '+905326424738';

  var css =
    '.gb-callbar{display:none}' +
    '@media (max-width:920px){' +
      '.gb-callbar{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:120;gap:8px;padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:#fff;border-top:1px solid rgba(43,36,31,.14);box-shadow:0 -8px 24px -12px rgba(43,36,31,.35)}' +
      '.gb-callbar a{display:flex;align-items:center;justify-content:center;gap:8px;border-radius:6px;font-family:"Work Sans",sans-serif;font-weight:600;text-decoration:none;min-height:52px}' +
      '.gb-callbar .gb-call{flex:1;background:#B54B23;color:#fff;font-size:17px}' +
      '.gb-callbar .gb-call small{display:block;font-size:11.5px;font-weight:500;opacity:.9}' +
      '.gb-callbar .gb-wa{width:56px;background:#25D366;color:#fff}' +
      '.gb-callbar svg{width:22px;height:22px;flex-shrink:0}' +
      'body{padding-bottom:78px}' +
      '.wa-float{display:none !important}' +
    '}';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  function build() {
    var bar = document.createElement('div');
    bar.className = 'gb-callbar';
    bar.innerHTML =
      '<a class="gb-call" href="tel:' + TEL + '" aria-label="Hemen arayın">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.4 1.8.7 2.7a2 2 0 01-.5 2.1L8 9.8a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.6 2.7.7a2 2 0 011.7 2z"/></svg>' +
        '<span>Hemen Ara<small>Ücretsiz keşif · 10 yıl garanti</small></span>' +
      '</a>' +
      '<a class="gb-wa" href="https://wa.me/905326424738?text=Merhaba%2C%20%C3%BCcretsiz%20ke%C5%9Fif%20talep%20etmek%20istiyorum." target="_blank" rel="noopener" aria-label="WhatsApp\'tan yazın">' +
        '<svg viewBox="0 0 32 32" fill="currentColor"><path d="M16 3C9 3 3.3 8.7 3.3 15.7c0 2.4.7 4.7 1.9 6.7L3 29l6.8-2.1c1.9 1.1 4 1.6 6.2 1.6 7 0 12.7-5.7 12.7-12.7C28.7 8.7 23 3 16 3zm0 23.1c-2 0-3.9-.5-5.5-1.5l-.4-.2-4 1.2 1.2-3.9-.3-.4a10.4 10.4 0 01-1.6-5.6C5.4 9.8 10.2 5 16 5s10.6 4.8 10.6 10.7S21.8 26.1 16 26.1z"/></svg>' +
      '</a>';
    document.body.appendChild(bar);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();

  // Arama tıklamalarını Google'a bildir
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="tel:"]');
    if (!a || typeof window.gtag !== 'function') return;
    window.gtag('event', 'telefon_tiklama', {
      event_category: 'iletisim',
      event_label: location.pathname
    });
  });
})();
