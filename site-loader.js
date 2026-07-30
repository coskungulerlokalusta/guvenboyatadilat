/**
 * GÜVENBOYA — Site geneli dinamik yükleyici
 * ------------------------------------------------------------
 * config.js'te bir API_URL tanımlıysa, bu script sayfa yüklendiğinde
 * backend'den (Google E-Tablo) güncel telefon/whatsapp/e-posta/adres
 * bilgilerini ve panelden yüklenen fotoğrafları çekip sayfadaki ilgili
 * yerlere otomatik olarak yerleştirir. API_URL tanımlı değilse hiçbir
 * şey yapmaz, sayfa statik haliyle kalır.
 */
(function () {
  var API_URL = window.GUVENBOYA_API_URL;
  if (!API_URL) return;

  function isPhoneLike(text) {
    return /^[0()+\d\s]+$/.test(text.trim()) && text.trim().length > 5;
  }

  // Sadece metin düğümünü değiştirir, içindeki <svg> ikon gibi öğelere dokunmaz.
  function setTextPreservingChildren(el, newText) {
    var replaced = false;
    el.childNodes.forEach(function (node) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0) {
        node.textContent = newText;
        replaced = true;
      }
    });
    if (!replaced) {
      if (el.children.length === 0) el.textContent = newText;
    }
  }

  fetch(API_URL + '?action=get_settings')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var s = data && data.settings;
      if (!s) return;

      document.querySelectorAll('a[href^="tel:"]').forEach(function (a) {
        a.setAttribute('href', 'tel:' + s.telefon_link);
        if (isPhoneLike(a.textContent)) setTextPreservingChildren(a, s.telefon_goruntu);
      });

      document.querySelectorAll('a[href*="wa.me/"]').forEach(function (a) {
        try {
          var url = new URL(a.href);
          var num = s.whatsapp_link.replace(/\+/g, '');
          a.href = 'https://wa.me/' + num + url.search;
        } catch (e) {}
      });

      document.querySelectorAll('a[href^="mailto:"]').forEach(function (a) {
        a.setAttribute('href', 'mailto:' + s.eposta);
        if (a.textContent.indexOf('@') !== -1) setTextPreservingChildren(a, s.eposta);
      });

      document.querySelectorAll('.js-address').forEach(function (el) {
        el.textContent = s.adres;
      });

      document.querySelectorAll('a[href*="instagram.com"]').forEach(function (a) {
        a.setAttribute('href', s.instagram);
      });
    })
    .catch(function () {});

  fetch(API_URL + '?action=get_images')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var images = (data && data.images) || {};
      document.querySelectorAll('.photo-slot img').forEach(function (img) {
        var src = img.getAttribute('src') || '';
        var match = src.match(/images\/([a-zA-Z0-9-]+)\.jpg/);
        var key = match ? match[1] : null;
        if (key && images[key]) {
          img.src = images[key];
          img.style.display = '';
          img.onerror = null;
        }
      });
    })
    .catch(function () {});
})();
