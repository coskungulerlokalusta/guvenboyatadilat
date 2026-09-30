/* MarkaBahçem — örnek veri üretici (ilk açılışta bir kez çalışır) */
(function () {
  'use strict';
  const C = window.Carsim;
  const U = C.U;

  const CATS = [
    { id: 1, name: 'Kadın', icon: '👗', commission: 18, subs: ['Elbise', 'Bluz', 'Pantolon', 'Ceket', 'Etek'] },
    { id: 2, name: 'Erkek', icon: '👔', commission: 18, subs: ['Tişört', 'Gömlek', 'Pantolon', 'Mont', 'Sweatshirt'] },
    { id: 3, name: 'Anne & Çocuk', icon: '🧸', commission: 15, subs: ['Oyuncak', 'Bebek Bakım', 'Çocuk Giyim', 'Bebek Arabası'] },
    { id: 4, name: 'Ev & Yaşam', icon: '🛋️', commission: 15, subs: ['Mobilya', 'Mutfak', 'Aydınlatma', 'Ev Tekstili', 'Dekorasyon'] },
    { id: 5, name: 'Süpermarket', icon: '🛒', commission: 8, subs: ['Kahve & Çay', 'Atıştırmalık', 'Temizlik', 'Kahvaltılık'] },
    { id: 6, name: 'Kozmetik', icon: '💄', commission: 16, subs: ['Cilt Bakımı', 'Makyaj', 'Parfüm', 'Saç Bakımı'] },
    { id: 7, name: 'Ayakkabı & Çanta', icon: '👟', commission: 17, subs: ['Spor Ayakkabı', 'Bot', 'Sandalet', 'Çanta'] },
    { id: 8, name: 'Elektronik', icon: '📱', commission: 8, subs: ['Telefon', 'Bilgisayar', 'Kulaklık', 'Akıllı Saat', 'Televizyon'] },
    { id: 9, name: 'Spor & Outdoor', icon: '⚽', commission: 14, subs: ['Fitness', 'Kamp', 'Bisiklet', 'Spor Giyim'] },
    { id: 10, name: 'Kitap & Hobi', icon: '📚', commission: 10, subs: ['Roman', 'Kişisel Gelişim', 'Çocuk Kitapları', 'Hobi Setleri'] },
    { id: 11, name: 'Saat & Aksesuar', icon: '⌚', commission: 16, subs: ['Kol Saati', 'Gözlük', 'Takı', 'Cüzdan'] },
    { id: 12, name: 'Yapı Market', icon: '🧰', commission: 12, subs: ['Boya', 'Elektrikli Alet', 'Hırdavat', 'Bahçe'] }
  ];

  // Pastel zemin çiftleri (ürün görseli yer tutucuları)
  const BG = [['#ffe8d6', '#ffd0b0'], ['#e0f2f1', '#b2dfdb'], ['#e8eaf6', '#c5cae9'], ['#fce4ec', '#f8bbd0'], ['#fff8e1', '#ffe082'],
    ['#e8f5e9', '#c8e6c9'], ['#f3e5f5', '#e1bee7'], ['#e3f2fd', '#bbdefb'], ['#efebe9', '#d7ccc8'], ['#fbe9e7', '#ffccbc'], ['#f1f8e9', '#dcedc8'], ['#eceff1', '#cfd8dc']];

  // [kategori, alt kategori, başlık, emoji, min fiyat, max fiyat, varyant, markalar, özellikler]
  const T = [
    [1, 'Elbise', 'Keten Karışımlı Midi Elbise', '👗', 449, 899, 'beden', ['Mavi Ada', 'Lina', 'Nora Studio']],
    [1, 'Elbise', 'Çiçek Desenli Yazlık Elbise', '👗', 349, 699, 'beden', ['Lina', 'Bahar']],
    [1, 'Bluz', 'Saten Görünümlü Gömlek Bluz', '👚', 229, 459, 'beden', ['Nora Studio', 'Mavi Ada']],
    [1, 'Pantolon', 'Yüksek Bel Palazzo Pantolon', '👖', 299, 599, 'beden', ['Lina', 'Denimia']],
    [1, 'Ceket', 'Oversize Blazer Ceket', '🧥', 699, 1399, 'beden', ['Nora Studio']],
    [1, 'Etek', 'Pileli Midi Etek', '👗', 279, 499, 'beden', ['Bahar', 'Lina']],
    [2, 'Tişört', 'Basic Pamuklu Bisiklet Yaka Tişört', '👕', 129, 249, 'beden', ['Kuzey', 'Urban Line']],
    [2, 'Gömlek', 'Slim Fit Oxford Gömlek', '👔', 349, 649, 'beden', ['Kuzey', 'Beyefendi']],
    [2, 'Pantolon', 'Regular Fit Chino Pantolon', '👖', 399, 749, 'beden', ['Urban Line', 'Denimia']],
    [2, 'Mont', 'Su İtici Kapüşonlu Şişme Mont', '🧥', 1299, 2499, 'beden', ['Kuzey', 'Alp']],
    [2, 'Sweatshirt', 'Şardonlu Kapüşonlu Sweatshirt', '🧥', 399, 699, 'beden', ['Urban Line']],
    [3, 'Oyuncak', 'Ahşap Eğitici Yapboz Seti', '🧩', 149, 299, null, ['Minik Akıl', 'Toytoy']],
    [3, 'Oyuncak', 'Uzaktan Kumandalı Arazi Arabası', '🚙', 499, 999, null, ['Toytoy']],
    [3, 'Oyuncak', 'Peluş Ayıcık 40 cm', '🧸', 199, 349, null, ['Toytoy', 'Pamuk']],
    [3, 'Bebek Bakım', 'Organik Pamuk Bebek Havlusu 3\'lü', '🍼', 179, 329, null, ['Pamuk']],
    [3, 'Bebek Arabası', 'Katlanabilir Travel Sistem Bebek Arabası', '👶', 4999, 8999, 'renk', ['Babyline']],
    [3, 'Çocuk Giyim', 'Unisex Çocuk Eşofman Takımı', '🧒', 249, 449, 'yas', ['Pamuk', 'Minik Moda']],
    [4, 'Mobilya', 'Masif Ahşap Sehpa', '🪑', 1499, 2999, null, ['Evin Ruhu', 'Nordik']],
    [4, 'Mutfak', 'Granit Döküm Tencere Seti 7 Parça', '🍳', 1799, 3299, null, ['Karaca Usta', 'Mutfakça']],
    [4, 'Mutfak', 'Porselen Yemek Takımı 24 Parça', '🍽️', 1299, 2499, null, ['Mutfakça', 'Porsel']],
    [4, 'Aydınlatma', 'Rattan Sarkıt Avize', '💡', 699, 1299, null, ['Nordik', 'Işıkevi']],
    [4, 'Ev Tekstili', 'Pamuk Saten Nevresim Takımı Çift Kişilik', '🛏️', 799, 1499, 'renk', ['Uyku Evi', 'Pamuk']],
    [4, 'Dekorasyon', 'Seramik Dekoratif Vazo Seti', '🏺', 349, 699, null, ['Evin Ruhu']],
    [4, 'Dekorasyon', 'Kokulu Soya Mum 3\'lü', '🕯️', 199, 399, null, ['Işıkevi']],
    [5, 'Kahve & Çay', 'Filtre Kahve 1 kg Kolombiya', '☕', 399, 649, null, ['Kahveci Baba', 'Çekirdek']],
    [5, 'Kahve & Çay', 'Rize Tirebolu Siyah Çay 1 kg', '🫖', 179, 289, null, ['Karadeniz Çay']],
    [5, 'Kahvaltılık', 'Taş Baskı Sızma Zeytinyağı 2 L', '🫒', 549, 899, null, ['Ege Bahçesi', 'Anadolu Gurme']],
    [5, 'Kahvaltılık', 'Süzme Çiçek Balı 850 g', '🍯', 349, 599, null, ['Anadolu Gurme', 'Yayla']],
    [5, 'Atıştırmalık', 'Karışık Kuruyemiş 500 g', '🥜', 229, 399, null, ['Çerezci', 'Anadolu Gurme']],
    [5, 'Temizlik', 'Çamaşır Deterjanı 60 Yıkama', '🧴', 249, 399, null, ['Parlak', 'Temizim']],
    [6, 'Cilt Bakımı', 'Hyaluronik Asit Nemlendirici Serum 30 ml', '🧪', 199, 449, null, ['Derma Lab', 'Pura']],
    [6, 'Cilt Bakımı', 'SPF 50+ Güneş Kremi 50 ml', '🧴', 249, 499, null, ['Derma Lab', 'Soleil']],
    [6, 'Makyaj', 'Uzun Süre Kalıcı Mat Ruj', '💄', 149, 299, 'renk', ['Rosé', 'Pura']],
    [6, 'Makyaj', 'Hacim Veren Maskara', '🪄', 129, 249, null, ['Rosé']],
    [6, 'Parfüm', 'Oryantal Kadın Parfüm EDP 100 ml', '🌸', 699, 1499, null, ['Maison Lale', 'Esans']],
    [6, 'Parfüm', 'Odunsu Erkek Parfüm EDP 100 ml', '🧴', 699, 1399, null, ['Esans', 'Maison Lale']],
    [6, 'Saç Bakımı', 'Argan Yağlı Onarıcı Şampuan 400 ml', '🧴', 129, 249, null, ['Pura', 'Saçım']],
    [7, 'Spor Ayakkabı', 'Hafif Tabanlı Koşu Ayakkabısı', '👟', 899, 1899, 'numara', ['Stride', 'Rüzgar']],
    [7, 'Spor Ayakkabı', 'Beyaz Deri Sneaker', '👟', 799, 1599, 'numara', ['Urban Step', 'Stride']],
    [7, 'Bot', 'Hakiki Deri Chelsea Bot', '👢', 1299, 2299, 'numara', ['Deri Atölye', 'Urban Step']],
    [7, 'Sandalet', 'Ortopedik Taban Sandalet', '👡', 399, 799, 'numara', ['Rahatım', 'Stride']],
    [7, 'Çanta', 'Hakiki Deri Omuz Çantası', '👜', 899, 1799, 'renk', ['Deri Atölye', 'Lina']],
    [7, 'Çanta', 'Su Geçirmez Laptop Sırt Çantası', '🎒', 499, 999, 'renk', ['Urban Step', 'Gezgin']],
    [8, 'Telefon', 'Akıllı Telefon 8 GB RAM', '📱', 12999, 24999, 'hafiza', ['Nova', 'Vega']],
    [8, 'Telefon', 'Akıllı Telefon Pro 12 GB RAM', '📱', 27999, 44999, 'hafiza', ['Nova']],
    [8, 'Bilgisayar', 'Ultra İnce Dizüstü Bilgisayar 16 GB', '💻', 21999, 38999, 'hafiza', ['Vega', 'Kod']],
    [8, 'Bilgisayar', 'Oyuncu Dizüstü Bilgisayar RTX', '💻', 34999, 59999, null, ['Kod']],
    [8, 'Kulaklık', 'Aktif Gürültü Engelleyici Kablosuz Kulaklık', '🎧', 1999, 4999, 'renk', ['Sonik', 'Nova']],
    [8, 'Kulaklık', 'Bluetooth Kulak İçi Kulaklık', '🎧', 699, 1499, 'renk', ['Sonik', 'Vega']],
    [8, 'Akıllı Saat', 'Akıllı Saat AMOLED Ekran', '⌚', 2499, 5999, 'renk', ['Nova', 'Pulse']],
    [8, 'Televizyon', '55" 4K UHD Smart TV', '📺', 17999, 27999, null, ['Vega', 'Ekran']],
    [8, 'Televizyon', 'Taşınabilir Bluetooth Hoparlör', '🔊', 899, 1999, 'renk', ['Sonik']],
    [9, 'Fitness', 'Ayarlanabilir Dambıl Seti 20 kg', '🏋️', 1299, 2499, null, ['Güçlü', 'FitPro']],
    [9, 'Fitness', 'Kaymaz Yoga Matı 6 mm', '🧘', 249, 499, 'renk', ['FitPro', 'Denge']],
    [9, 'Kamp', '4 Kişilik Su Geçirmez Kamp Çadırı', '⛺', 1999, 3999, null, ['Gezgin', 'Alp']],
    [9, 'Kamp', 'Termos Paslanmaz Çelik 1 L', '🧉', 349, 699, 'renk', ['Gezgin']],
    [9, 'Bisiklet', '26 Jant Dağ Bisikleti 21 Vites', '🚲', 5999, 11999, null, ['Pedal', 'Rüzgar']],
    [9, 'Spor Giyim', 'Nefes Alan Koşu Tişörtü', '🎽', 199, 399, 'beden', ['Stride', 'FitPro']],
    [10, 'Roman', 'Modern Türk Edebiyatı Seçkisi', '📕', 89, 189, null, ['Yeni Sayfa', 'Kalem Yayınları']],
    [10, 'Kişisel Gelişim', 'Alışkanlıkların Gücü', '📗', 99, 199, null, ['Kalem Yayınları']],
    [10, 'Çocuk Kitapları', 'Resimli Masallar Seti 10 Kitap', '📘', 199, 349, null, ['Minik Akıl', 'Yeni Sayfa']],
    [10, 'Hobi Setleri', 'Akrilik Boya ve Tuval Seti', '🎨', 249, 499, null, ['Atölye']],
    [10, 'Hobi Setleri', '1000 Parça Puzzle İstanbul', '🧩', 179, 329, null, ['Atölye', 'Toytoy']],
    [11, 'Kol Saati', 'Çelik Kasa Kronograf Erkek Saat', '⌚', 1499, 3999, null, ['Zaman', 'Pulse']],
    [11, 'Gözlük', 'Polarize Güneş Gözlüğü', '🕶️', 499, 1299, 'renk', ['Optik', 'Soleil']],
    [11, 'Takı', '925 Ayar Gümüş Kolye', '📿', 399, 899, null, ['Gümüşçü']],
    [11, 'Cüzdan', 'Hakiki Deri Kartlık Cüzdan', '👛', 249, 549, 'renk', ['Deri Atölye']],
    [12, 'Boya', 'Silinebilir İç Cephe Boyası 15 L', '🪣', 1299, 2299, 'renk', ['Güven Boya', 'Renkli Duvar']],
    [12, 'Boya', 'Silikonlu Dış Cephe Boyası 15 L', '🪣', 1799, 2999, 'renk', ['Güven Boya', 'Renkli Duvar']],
    [12, 'Boya', 'Su Yalıtım Membranı 20 kg', '🧱', 1499, 2499, null, ['Güven Boya', 'İzomax']],
    [12, 'Boya', 'Profesyonel Boya Rulosu ve Fırça Seti', '🖌️', 199, 399, null, ['Güven Boya', 'Usta İşi']],
    [12, 'Boya', 'Tavan Boyası Ekstra Beyaz 20 kg', '🪣', 899, 1499, null, ['Güven Boya']],
    [12, 'Elektrikli Alet', 'Akülü Darbeli Matkap 18V', '🔧', 1999, 3999, null, ['Usta İşi', 'Voltaj']],
    [12, 'Elektrikli Alet', 'Profesyonel Boya Tabancası 650W', '🔫', 1499, 2799, null, ['Usta İşi', 'Voltaj']],
    [12, 'Hırdavat', '108 Parça Tamir Seti', '🧰', 799, 1499, null, ['Usta İşi']],
    [12, 'Hırdavat', 'Alüminyum Katlanır Merdiven 6 Basamak', '🪜', 1299, 2199, null, ['Usta İşi', 'Güven Boya']],
    [12, 'Bahçe', 'Bahçe Hortumu 25 m Makaralı', '🪴', 499, 899, null, ['Yeşil Bahçe']]
  ];

  const VAR = {
    beden: { name: 'Beden', options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
    numara: { name: 'Numara', options: ['36', '37', '38', '39', '40', '41', '42', '43', '44'] },
    renk: { name: 'Renk', options: ['Siyah', 'Beyaz', 'Lacivert', 'Gri', 'Bej'] },
    hafiza: { name: 'Depolama', options: ['128 GB', '256 GB', '512 GB'] },
    yas: { name: 'Yaş', options: ['2-3', '4-5', '6-7', '8-9'] }
  };

  const STORES = [
    { key: 'tekno', name: 'TeknoVadi', cats: [8, 11], color: '#2459d6', cover: ['#1e3a8a', '#2563eb'], logo: '⚡', city: 'İstanbul', desc: 'Orijinal, faturalı ve garantili elektronik. Aynı gün kargo.', ship: 0, free: 0 },
    { key: 'moda', name: 'ModaSokak', cats: [1, 2], color: '#c2418a', cover: ['#831843', '#db2777'], logo: '🧵', city: 'İzmir', desc: 'Sezonun trend parçaları, butik üretim ve kolay iade.', ship: 39.99, free: 350 },
    { key: 'adim', name: 'AdımAdım', cats: [7, 9], color: '#e0620b', cover: ['#9a3412', '#f97316'], logo: '👣', city: 'Bursa', desc: 'Ayakkabı, çanta ve outdoor ekipmanında uzman mağaza.', ship: 44.99, free: 500 },
    { key: 'ev', name: 'EvimGüzel', cats: [4, 5], color: '#0e7c74', cover: ['#134e4a', '#14b8a6'], logo: '🏡', city: 'Ankara', desc: 'Evinizi güzelleştiren dekorasyon ve mutfak ürünleri.', ship: 49.99, free: 600 },
    { key: 'mini', name: 'MiniMinik', cats: [3, 10], color: '#7c5cd6', cover: ['#4c1d95', '#a78bfa'], logo: '🐣', city: 'İstanbul', desc: 'Bebek ve çocuklar için güvenli, sertifikalı ürünler.', ship: 34.99, free: 300 },
    { key: 'guzel', name: 'GüzellikDurağı', cats: [6], color: '#d9467a', cover: ['#9d174d', '#f472b6'], logo: '🌸', city: 'İstanbul', desc: 'Dermokozmetik, makyaj ve parfümde orijinal ürün güvencesi.', ship: 29.99, free: 250 },
    { key: 'guven', name: 'Güven Yapı Market', cats: [12, 4], color: '#f25c05', cover: ['#7c2d12', '#f25c05'], logo: '🎨', city: 'İstanbul', desc: 'Boya, yalıtım ve yapı malzemesinde 25 yıllık usta tecrübesi. Renk danışmanlığı ücretsiz.', ship: 59.99, free: 750 },
    { key: 'kitap', name: 'Kitapsever', cats: [10, 3], color: '#15803d', cover: ['#14532d', '#22c55e'], logo: '📖', city: 'Eskişehir', desc: 'Kitap, hobi ve kırtasiye. Her siparişe ayraç hediye.', ship: 24.99, free: 200 },
    { key: 'gurme', name: 'Anadolu Gurme', cats: [5], color: '#a16207', cover: ['#713f12', '#eab308'], logo: '🫒', city: 'Balıkesir', desc: 'Üreticiden sofraya doğal, katkısız gurme lezzetler.', ship: 39.99, free: 400 },
    { key: 'spor', name: 'SporMax', cats: [9, 7], color: '#0369a1', cover: ['#0c4a6e', '#0ea5e9'], logo: '🏅', city: 'Antalya', desc: 'Fitness, kamp ve bisiklette profesyonel ekipman.', ship: 49.99, free: 500 }
  ];

  const FIRST = ['Ayşe', 'Mehmet', 'Zeynep', 'Emre', 'Elif', 'Burak', 'Selin', 'Can', 'Deniz', 'Merve', 'Ahmet', 'Ece', 'Kerem', 'Buse', 'Murat', 'Gizem', 'Onur', 'İrem', 'Hakan', 'Derya', 'Serkan', 'Tuğba', 'Oğuz', 'Seda', 'Barış', 'Pınar', 'Cem', 'Melis'];
  const LAST = ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Aydın', 'Öztürk', 'Arslan', 'Doğan', 'Koç', 'Kurt', 'Özdemir', 'Polat', 'Erdoğan', 'Aksoy'];
  const CITIES = [['İstanbul', 'Kadıköy'], ['İstanbul', 'Beşiktaş'], ['Ankara', 'Çankaya'], ['İzmir', 'Karşıyaka'], ['Bursa', 'Nilüfer'], ['Antalya', 'Muratpaşa'], ['Eskişehir', 'Tepebaşı'], ['Konya', 'Selçuklu']];

  const REV = {
    5: ['Ürün tam anlatıldığı gibi, kalitesi çok iyi. Kargo da çok hızlıydı.', 'Fiyatına göre harika, herkese tavsiye ederim.', 'Paketleme özenliydi, satıcı ilgili. Tekrar alırım.', 'Beklentimin üstünde çıktı, kalite mükemmel.', 'Çok hızlı kargo, ürün orijinal ve sağlam.', 'Kumaşı/malzemesi kaliteli, rengi fotoğraftaki gibi.'],
    4: ['Güzel ürün, kargo biraz geç geldi ama memnunum.', 'Kalitesi iyi, fiyatı biraz yüksek ama değer.', 'Genel olarak memnunum, paketleme daha iyi olabilirdi.', 'Rengi fotoğraftakinden biraz farklı ama güzel.', 'Kullanışlı ve kaliteli, hızlı kargo için teşekkürler.'],
    3: ['İdare eder, fiyatına göre normal.', 'Kalıbı biraz küçük, bir beden büyük alın.', 'Kargo geç geldi, ürün ortalama.'],
    2: ['Beklediğim kalitede değil, malzemesi ince.', 'Kargo çok geç geldi, paketleme kötüydü.'],
    1: ['Ürün hasarlı geldi, iade ettim.', 'Fotoğraftaki ürünle alakası yok, kalitesiz.']
  };
  const QS = [['Kargoya ne zaman verilir?', 'Merhaba, saat 15:00\'e kadar verilen siparişler aynı gün kargoya teslim edilir.'],
    ['Ürün orijinal mi, faturalı mı?', 'Tüm ürünlerimiz orijinal ve faturalıdır, garanti belgesiyle gönderilir.'],
    ['Kalıbı nasıl, dar mı?', 'Standart kalıptır, kendi bedeninizi almanızı öneririz.'],
    ['Değişim yapabiliyor muyuz?', '15 gün içinde ücretsiz iade ve değişim hakkınız bulunmaktadır.'],
    ['Başka rengi gelecek mi?', 'Yeni renk seçenekleri önümüzdeki hafta stoklarımıza eklenecek.'],
    ['Kaç m² alanı boyar?', '15 litre ürün tek katta yaklaşık 150-180 m² alanı kaplar.']];

  function price(r, lo, hi) {
    const v = lo + r() * (hi - lo);
    const base = v >= 1000 ? Math.round(v / 50) * 50 : Math.round(v / 10) * 10;
    return base - (v >= 1000 ? 0.01 : 0.1);
  }

  C.Seed = {
    CATS, VAR, BG,
    build(version) {
      const r = U.rng(20260929);
      const now = Date.now();
      const DAY = U.DAY;
      const d = { version, seq: {}, users: [], stores: [], categories: [], products: [], orders: [], reviews: [], questions: [], coupons: [], banners: [], deals: [], notifications: [], alerts: [], carts: {}, returns: [], payouts: [], logs: [] };

      d.settings = { siteName: 'MarkaBahçem', shippingFee: 49.99, freeShipDefault: 500, defaultCommission: 12, maintenance: false, announcement: 'Kasım fırsatları başladı: seçili ürünlerde %40\'a varan indirim!', installments: [1, 2, 3, 6, 9, 12], installmentRates: { 1: 0, 2: 0, 3: 0, 6: 4.9, 9: 7.9, 12: 10.9 } };
      d.categories = CATS.map(c => ({ ...c, slug: U.slug(c.name), active: true }));

      // --- kullanıcılar ---
      const addUser = u => { const x = Object.assign({ id: d.users.length + 1, createdAt: now - r.int(1, 400) * DAY, addresses: [], favorites: [], viewed: [], cmp: [], phone: '05' + r.int(30, 55) + ' ' + r.int(100, 999) + ' ' + r.int(10, 99) + ' ' + r.int(10, 99) }, u); d.users.push(x); return x; };
      addUser({ name: 'Platform Yöneticisi', email: 'admin@markabahcem.com', password: 'admin123', role: 'admin' });
      const demoCustomer = addUser({
        name: 'Ayşe Yılmaz', email: 'musteri@markabahcem.com', password: 'musteri123', role: 'customer',
        addresses: [{ id: 1, title: 'Ev', name: 'Ayşe Yılmaz', phone: '0532 111 22 33', city: 'İstanbul', district: 'Kadıköy', line: 'Caferağa Mah. Moda Cad. No: 12 D: 4' },
          { id: 2, title: 'İş', name: 'Ayşe Yılmaz', phone: '0532 111 22 33', city: 'İstanbul', district: 'Şişli', line: 'Esentepe Mah. Büyükdere Cad. No: 185 Kat: 7' }]
      });
      const customers = [demoCustomer];
      for (let i = 0; i < 40; i++) {
        const n = FIRST[i % FIRST.length] + ' ' + r.pick(LAST);
        const [city, district] = r.pick(CITIES);
        customers.push(addUser({ name: n, email: U.slug(n).replace(/-/g, '.') + i + '@ornek.com', password: '123456', role: 'customer', addresses: [{ id: 1, title: 'Ev', name: n, phone: '0535 000 00 00', city, district, line: 'Örnek Mah. ' + r.int(1, 90) + '. Sok. No: ' + r.int(1, 40) }] }));
      }

      // --- mağazalar ---
      STORES.forEach((s, i) => {
        const owner = addUser({
          name: s.key === 'guven' ? 'Güven Usta' : r.pick(FIRST) + ' ' + r.pick(LAST),
          email: s.key === 'guven' ? 'satici@markabahcem.com' : s.key + '@markabahcem.com',
          password: s.key === 'guven' ? 'satici123' : '123456', role: 'seller'
        });
        const st = {
          id: i + 1, ownerId: owner.id, name: s.name, cats: s.cats, slug: U.slug(s.name), key: s.key, logo: s.logo, logoImg: '', color: s.color, cover: s.cover, coverImg: '',
          description: s.desc, city: s.city, status: 'active', createdAt: now - r.int(200, 900) * DAY,
          shippingFee: s.ship, freeShipOver: s.free, followers: [], taxNo: String(r.int(1000000000, 9999999999)), iban: 'TR' + r.int(10, 99) + ' 0006 ' + r.int(1000, 9999) + ' ' + r.int(1000, 9999) + ' ' + r.int(1000, 9999) + ' ' + r.int(10, 99),
          phone: '0850 ' + r.int(200, 999) + ' ' + r.int(10, 99) + ' ' + r.int(10, 99), shipDays: s.key === 'tekno' ? 0 : r.int(1, 2), official: ['tekno', 'guven', 'guzel'].includes(s.key),
          banners: [], announcement: s.key === 'guven' ? 'Tüm dış cephe boyalarında ücretsiz renk kartelası hediye!' : ''
        };
        owner.storeId = st.id;
        d.stores.push(st);
      });
      const guven = d.stores.find(s => s.key === 'guven');
      guven.banners = [
        { id: 1, title: 'Dış cephe sezonu', subtitle: 'Silikonlu dış cephe boyalarında %20 indirim', c1: '#7c2d12', c2: '#f25c05', emoji: '🏠', link: '', active: true },
        { id: 2, title: 'Usta işi set', subtitle: 'Rulo + fırça + maske seti sadece 249 TL', c1: '#134e4a', c2: '#0e7c74', emoji: '🖌️', link: '', active: true }
      ];
      d.stores.forEach(st => { if (!st.banners.length) st.banners = [{ id: 1, title: st.name + ' fırsatları', subtitle: st.description, c1: st.cover[0], c2: st.cover[1], emoji: st.logo, link: '', active: true }]; });
      // Başvuru bekleyen mağazalar (yönetici onayı için)
      const pendingOwners = [['Zeynep Ege', 'Ege Zeytin Evi', '🫒', 'Ayvalık zeytinyağı ve zeytin ürünleri', 'Balıkesir', 5], ['Kaan Tekin', 'Retro Plak', '💿', 'İkinci el ve yeni basım plaklar, pikaplar', 'İstanbul', 10]];
      pendingOwners.forEach(([n, sn, logo, desc, city, cat], i) => {
        const o = addUser({ name: n, email: U.slug(sn) + '@basvuru.com', password: '123456', role: 'seller' });
        const st = { id: d.stores.length + 1, ownerId: o.id, name: sn, cats: [cat], slug: U.slug(sn), key: U.slug(sn), logo, logoImg: '', color: '#6b7280', cover: ['#374151', '#9ca3af'], coverImg: '', description: desc, city, status: 'pending', createdAt: now - (i + 1) * DAY * 0.6, shippingFee: 39.99, freeShipOver: 400, followers: [], taxNo: String(r.int(1000000000, 9999999999)), iban: 'TR00 0000 0000 0000 0000 00', phone: '0850 000 00 00', shipDays: 2, official: false, banners: [], appCategory: cat, announcement: '' };
        o.storeId = st.id; d.stores.push(st);
      });

      // --- ürünler ---
      const active = d.stores.filter(s => s.status === 'active');
      let pid = 0;
      const mkProduct = (t, store, groupKey, priceMul = 1) => {
        const [cat, sub, title, emoji, lo, hi, vk, brands] = t;
        const brand = store.key === 'guven' && brands.includes('Güven Boya') ? 'Güven Boya' : r.pick(brands);
        let p = price(r, lo, hi) * priceMul;
        p = p >= 1000 ? Math.round(p / 10) * 10 - 0.01 : Math.round(p) - 0.1;
        const discounted = r.chance(0.55);
        const listPrice = discounted ? Math.round(p * (1.15 + r() * 0.35) / 10) * 10 - 0.01 : 0;
        const bg = BG[(pid * 5 + cat) % BG.length];
        const imgs = [{ e: emoji, c1: bg[0], c2: bg[1] }, { e: emoji, c1: BG[(pid + 3) % BG.length][0], c2: BG[(pid + 3) % BG.length][1] }, { e: emoji, c1: '#f5f5f4', c2: '#e7e5e4' }];
        pid++;
        const created = now - r.int(5, 240) * DAY;
        // fiyat geçmişi: 90 günlük birkaç değişim noktası
        const hist = [];
        let hp = p * (1 + r() * 0.3);
        let t0 = now - 90 * DAY;
        const changes = r.int(2, 5);
        for (let k = 0; k < changes; k++) { hist.push([t0, U.round2(hp)]); t0 += r.int(8, 22) * DAY; hp = hp * (0.9 + r() * 0.18); }
        // sahte indirim örneği: liste fiyatı hiç uygulanmamış
        hist.push([Math.min(t0, now - 3 * DAY), p]);
        const specs = { Marka: brand, 'Menşei': r.chance(.7) ? 'Türkiye' : r.pick(['Almanya', 'Çin', 'İtalya', 'Kore']), 'Garanti': cat === 8 || cat === 12 ? '2 Yıl' : 'Yok', 'Kargo Ağırlığı': (r.int(2, 60) / 10).toString().replace('.', ',') + ' kg' };
        if (cat === 12 && sub === 'Boya') Object.assign(specs, { 'Kaplama': '10-12 m²/L (tek kat)', 'Kuruma Süresi': '2 saat (dokunma), 6 saat (kat arası)', 'Uygulama': 'Rulo, fırça, airless' });
        if (cat === 8) Object.assign(specs, { 'Ekran/Parça': r.pick(['AMOLED', 'IPS', 'OLED', 'LCD']), 'Pil Ömrü': r.int(10, 40) + ' saat' });
        if (cat === 1 || cat === 2) Object.assign(specs, { 'Kumaş': r.pick(['%100 Pamuk', '%95 Pamuk %5 Elastan', 'Keten Karışımlı', 'Polyester']), 'Kalıp': r.pick(['Regular', 'Slim Fit', 'Oversize']), 'Yıkama': '30°C' });
        const prod = {
          id: pid, storeId: store.id, categoryId: cat, sub, title, brand, groupKey: groupKey || null,
          price: p, listPrice: listPrice > p ? listPrice : 0, cost: U.round2(p * (0.45 + r() * 0.2)), stock: r.chance(0.08) ? r.int(1, 4) : r.int(8, 240),
          variants: vk ? { name: VAR[vk].name, options: VAR[vk].options.slice() } : null,
          images: imgs, description: '', specs, tags: [sub, brand, CATS[cat - 1].name].map(U.lower),
          status: 'active', freeShipping: store.freeShipOver === 0 || p >= store.freeShipOver, fastDelivery: store.shipDays === 0 || r.chance(0.35),
          createdAt: created, sold: 0, views: r.int(150, 9000), rating: 0, reviewCount: 0, priceHistory: hist, sku: 'MB-' + String(pid).padStart(5, '0'), featured: r.chance(0.15)
        };
        prod.description = C.Seed.describe(prod);
        d.products.push(prod);
        return prod;
      };
      T.forEach((t, i) => {
        const cands = active.filter(s => s.cats.includes(t[0]));
        const cands2 = cands.length ? cands : active;
        const store = t[0] === 12 ? guven : r.pick(cands2);
        const gk = 'g' + i;
        mkProduct(t, store, gk);
        // Katalog zenginliği: her ürün tipinden farklı marka/modelde 1-2 ürün daha
        const extra = r.chance(0.45) ? 2 : 1;
        for (let k = 0; k < extra; k++) {
          const sfx = r.pick(['Premium', 'Plus', 'Lite', 'Yeni Sezon', 'Pro', 'Klasik', 'Eko']);
          const st2 = t[0] === 12 && r.chance(0.5) ? guven : r.pick(cands2);
          const px = mkProduct([t[0], t[1], t[2] + ' ' + sfx, t[3], t[4], t[5], t[6], t[7]], st2, null, sfx === 'Premium' || sfx === 'Pro' ? 1.25 : sfx === 'Lite' || sfx === 'Eko' ? 0.8 : 1);
          px.images = px.images.map((im, j) => j === 0 ? { e: im.e, c1: BG[(pid * 7 + k) % BG.length][0], c2: BG[(pid * 7 + k) % BG.length][1] } : im);
        }
        // Popüler ürünleri ikinci bir satıcı da satsın → "diğer satıcılar" karşılaştırması
        if ([7, 37, 38, 43, 47, 48, 49, 24, 26, 30, 69].includes(i) || r.chance(0.12)) {
          const others = active.filter(s => s.id !== store.id && s.cats.includes(t[0]));
          if (others.length) { const p2 = mkProduct(t, r.pick(others), gk, 0.93 + r() * 0.14); const p1 = d.products[d.products.length - 2]; p2.brand = p1.brand; p2.specs.Marka = p1.brand; p2.images = p1.images; p2.variants = p1.variants && { name: p1.variants.name, options: p1.variants.options.slice() }; }
        }
      });
      // Öne çıkan birkaç "sahte indirim" örneği: liste fiyatı var, ama geçmişte bu fiyat hiç yok
      d.products.filter((p, i) => i % 11 === 3).forEach(p => { p.listPrice = Math.round(p.price * 1.6 / 10) * 10 - 0.01; p.priceHistory = [[now - 90 * DAY, p.price], [now - 20 * DAY, U.round2(p.price * 1.02)], [now - 4 * DAY, p.price]]; });
      // Birkaç ürün onay bekliyor (moderasyon ekranı için)
      [['Mini Waffle Makinesi', '🧇', 4, 'Mutfak', 699.9, 4], ['Organik Lavanta Sabunu 4\'lü', '🧼', 6, 'Cilt Bakımı', 149.9, 6]].forEach(([title, e, cat, sub, pr, sid]) => {
        pid++;
        d.products.push({ id: pid, storeId: sid, categoryId: cat, sub, title, brand: 'Yeni Marka', groupKey: null, price: pr, listPrice: 0, cost: pr * .5, stock: 40, variants: null, images: [{ e, c1: '#fff8e1', c2: '#ffe082' }], description: 'Yeni eklenen ürün, yönetici onayı bekliyor.', specs: { Marka: 'Yeni Marka' }, tags: [U.lower(sub)], status: 'pending', freeShipping: false, fastDelivery: false, createdAt: now - DAY, sold: 0, views: 0, rating: 0, reviewCount: 0, priceHistory: [[now - DAY, pr]], sku: 'MB-' + String(pid).padStart(5, '0'), featured: false });
      });

      // --- siparişler (son 150 gün, yakın tarihe doğru artan) ---
      const sellable = d.products.filter(p => p.status === 'active');
      const weight = sellable.map(p => (p.featured ? 3 : 1) * (0.3 + r()) * (p.price < 500 ? 2.2 : p.price < 2000 ? 1.4 : 0.6) * (p.storeId === guven.id ? 1.6 : 1));
      const wsum = U.sum(weight);
      const pickProd = () => { let x = r() * wsum; for (let i = 0; i < sellable.length; i++) { x -= weight[i]; if (x <= 0) return sellable[i]; } return sellable[0]; };
      const hourW = [1, .5, .3, .2, .2, .3, .6, 1.2, 2, 2.6, 3, 3.2, 3.6, 3.4, 3.2, 3.4, 3.8, 4.2, 4.8, 5.8, 6.4, 6.2, 4.8, 2.6];
      const hsum = U.sum(hourW);
      const pickHour = () => { let x = r() * hsum; for (let i = 0; i < 24; i++) { x -= hourW[i]; if (x <= 0) return i; } return 20; };
      const N = 1100;
      for (let i = 0; i < N; i++) {
        const age = 150 * (1 - Math.sqrt(r())); // yakın zamanda daha yoğun
        const day = U.startOfDay(now - Math.floor(age) * DAY);
        let ts = day + pickHour() * 3600e3 + r.int(0, 59) * 60e3;
        if (ts > now) ts = now - r.int(5, 300) * 60e3;
        const cust = i % 18 === 0 ? demoCustomer : r.pick(customers);
        const nItems = r() < .65 ? 1 : r() < .8 ? 2 : 3;
        const items = [];
        for (let k = 0; k < nItems; k++) {
          const p = pickProd();
          if (items.some(x => x.productId === p.id)) continue;
          const qty = p.price < 300 && r.chance(.25) ? 2 : 1;
          items.push({ productId: p.id, storeId: p.storeId, title: p.title, brand: p.brand, image: p.images[0], price: p.price, qty, variant: p.variants ? r.pick(p.variants.options) : '' });
        }
        const ageDays = (now - ts) / DAY;
        const packages = [...U.groupBy(items, x => x.storeId)].map(([sid, its]) => {
          const st = d.stores.find(s => s.id === sid);
          const sub = U.sum(its, x => x.price * x.qty);
          const shipping = st.freeShipOver === 0 || sub >= st.freeShipOver ? 0 : st.shippingFee;
          let status;
          const q = r();
          if (ageDays > 6) status = q < .9 ? 'delivered' : q < .95 ? 'cancelled' : q < .98 ? 'returned' : 'returnRequested';
          else if (ageDays > 3) status = q < .55 ? 'delivered' : q < .92 ? 'shipped' : 'cancelled';
          else if (ageDays > 1) status = q < .6 ? 'shipped' : 'preparing';
          else status = q < .5 ? 'new' : 'preparing';
          if (status === 'returnRequested' && ageDays > 20) status = 'returned';
          const hist = [{ s: 'new', t: ts }];
          if (status !== 'new' && status !== 'cancelled') hist.push({ s: 'preparing', t: ts + 3 * 3600e3 });
          if (['shipped', 'delivered', 'returned', 'returnRequested'].includes(status)) hist.push({ s: 'shipped', t: ts + (st.shipDays + .5) * DAY });
          if (['delivered', 'returned', 'returnRequested'].includes(status)) hist.push({ s: 'delivered', t: ts + (st.shipDays + 2.5) * DAY });
          if (status === 'returnRequested' || status === 'returned') hist.push({ s: 'returnRequested', t: ts + (st.shipDays + 4) * DAY });
          if (status === 'returned') hist.push({ s: 'returned', t: ts + (st.shipDays + 8) * DAY });
          if (status === 'cancelled') hist.push({ s: 'cancelled', t: ts + 5 * 3600e3 });
          return { storeId: sid, items: its, subtotal: U.round2(sub), shipping, status, history: hist, tracking: ['shipped', 'delivered', 'returned', 'returnRequested'].includes(status) ? 'MB' + r.int(100000000, 999999999) : '', carrier: r.pick(['Yurtiçi Kargo', 'Aras Kargo', 'MNG Kargo', 'Sürat Kargo', 'MarkaBahçem Express']), returnReason: status === 'returned' || status === 'returnRequested' ? r.pick(['Beden uymadı', 'Ürün hasarlı geldi', 'Beklentimi karşılamadı', 'Yanlış ürün gönderildi']) : '' };
        });
        const subtotal = U.sum(packages, p => p.subtotal);
        const shipping = U.sum(packages, p => p.shipping);
        const discount = r.chance(.12) && subtotal > 500 ? 50 : 0;
        d.orders.push({
          id: 100000 + i + 1, userId: cust.id, createdAt: ts, address: cust.addresses[0], packages, subtotal: U.round2(subtotal), shipping: U.round2(shipping), discount, total: U.round2(subtotal + shipping - discount),
          payment: { method: r.chance(.85) ? 'card' : 'transfer', installments: r.chance(.8) ? 1 : r.pick([3, 6, 9]), last4: String(r.int(1000, 9999)) }, coupon: discount ? 'HOSGELDIN' : ''
        });
        packages.forEach(pk => { if (pk.status !== 'cancelled') pk.items.forEach(it => { const p = d.products.find(x => x.id === it.productId); p.sold += it.qty; }); });
      }
      d.orders.sort((a, b) => a.createdAt - b.createdAt);
      d.seq.orders = 100000 + N;

      // --- değerlendirmeler ---
      let rid = 0;
      d.orders.forEach(o => o.packages.forEach(pk => {
        if (pk.status !== 'delivered') return;
        pk.items.forEach(it => {
          if (!r.chance(.42)) return;
          const q = r();
          const rating = q < .62 ? 5 : q < .85 ? 4 : q < .93 ? 3 : q < .97 ? 2 : 1;
          const u = d.users.find(x => x.id === o.userId);
          d.reviews.push({ id: ++rid, productId: it.productId, storeId: pk.storeId, userId: o.userId, userName: u.name.split(' ')[0] + ' ' + u.name.split(' ')[1][0] + '.', orderId: o.id, rating, text: r.pick(REV[rating]), createdAt: pk.history[pk.history.length - 1].t + r.int(1, 5) * DAY, helpful: r.int(0, 40), variant: it.variant, sellerReply: rating <= 3 && r.chance(.6) ? 'Yaşadığınız sorun için üzgünüz, müşteri hizmetlerimiz sizinle iletişime geçecek.' : '' });
        });
      }));
      d.reviews = d.reviews.filter(x => x.createdAt < now);
      d.products.forEach(p => {
        const rs = d.reviews.filter(x => x.productId === p.id);
        p.reviewCount = rs.length;
        p.rating = rs.length ? U.round2(U.sum(rs, x => x.rating) / rs.length) : 0;
      });

      // --- sorular ---
      let qid = 0;
      d.products.forEach(p => {
        const n = r.int(0, 3);
        for (let k = 0; k < n; k++) {
          const [q, a] = r.pick(QS);
          if (q.startsWith('Kaç m²') && p.categoryId !== 12) continue;
          const answered = r.chance(.8);
          d.questions.push({ id: ++qid, productId: p.id, storeId: p.storeId, userId: r.pick(customers).id, text: q, answer: answered ? a : '', answeredAt: answered ? now - r.int(1, 40) * DAY : 0, createdAt: now - r.int(2, 60) * DAY });
        }
      });
      // Demo satıcının cevaplanmamış soruları
      d.products.filter(p => p.storeId === guven.id).slice(0, 3).forEach((p, k) => d.questions.push({ id: ++qid, productId: p.id, storeId: guven.id, userId: customers[k + 2].id, text: ['Bu ürün banyoda kullanılabilir mi?', 'Renk kartelası gönderiyor musunuz?', 'Toptan alımda indirim var mı?'][k], answer: '', answeredAt: 0, createdAt: now - (k + 1) * 3600e3 * 5 }));

      // --- kuponlar ---
      d.coupons = [
        { id: 1, code: 'HOSGELDIN', title: 'Hoş geldin indirimi', type: 'amount', value: 100, minTotal: 500, storeId: null, expiresAt: now + 60 * DAY, limit: 5000, used: 812, active: true },
        { id: 2, code: 'BAHCEM10', title: 'Tüm sepette %10', type: 'percent', value: 10, minTotal: 750, maxDiscount: 400, storeId: null, expiresAt: now + 20 * DAY, limit: 2000, used: 344, active: true },
        { id: 3, code: 'GUVEN50', title: 'Güven Yapı Market\'e özel', type: 'amount', value: 50, minTotal: 400, storeId: guven.id, expiresAt: now + 30 * DAY, limit: 500, used: 61, active: true },
        { id: 4, code: 'TEKNO5', title: 'Elektronikte %5', type: 'percent', value: 5, minTotal: 2000, maxDiscount: 1000, storeId: 1, expiresAt: now + 14 * DAY, limit: 300, used: 97, active: true },
        { id: 5, code: 'MODA75', title: 'ModaSokak 75 TL', type: 'amount', value: 75, minTotal: 600, storeId: 2, expiresAt: now + 10 * DAY, limit: 400, used: 120, active: true }
      ];
      d.seq.coupons = 5;

      // --- ana sayfa bannerları ---
      d.banners = [
        { id: 1, kicker: 'Kasım fırsatları', title: 'Sezonun en büyük indirimi başladı', subtitle: 'Binlerce üründe %40\'a varan indirim, 500 TL üzeri kargo bedava.', c1: '#c2410c', c2: '#f25c05', emoji: '🛍️', img: '', link: '/deals', cta: 'Fırsatları keşfet', active: true, order: 1, place: 'hero' },
        { id: 2, kicker: 'Elektronik haftası', title: 'Teknolojide 12 aya varan taksit', subtitle: 'Telefon, bilgisayar ve kulaklıklarda peşin fiyatına 3 taksit.', c1: '#1e3a8a', c2: '#2459d6', emoji: '🎧', img: '', link: '/search?cat=8', cta: 'Elektroniğe git', active: true, order: 2, place: 'hero' },
        { id: 3, kicker: 'Evini yenile', title: 'Boya ve dekorasyonda usta fiyatları', subtitle: 'Güven Yapı Market\'te dış cephe boyalarında %20 indirim.', c1: '#134e4a', c2: '#0e7c74', emoji: '🎨', img: '', link: '/store/' + guven.id, cta: 'Mağazaya git', active: true, order: 3, place: 'hero' },
        { id: 4, kicker: 'Yeni sezon', title: 'Sonbahar koleksiyonu raflarda', subtitle: 'Trend ceketler, triko ve botlarla dolabını yenile.', c1: '#831843', c2: '#c2418a', emoji: '🧥', img: '', link: '/search?cat=1', cta: 'Koleksiyonu gör', active: true, order: 4, place: 'hero' },
        { id: 5, kicker: '', title: 'Süpermarket', subtitle: 'Kapına 2 saatte', c1: '#713f12', c2: '#ca8a04', emoji: '🛒', img: '', link: '/search?cat=5', cta: '', active: true, order: 5, place: 'side' },
        { id: 6, kicker: '', title: 'Satıcı ol, kazan', subtitle: 'İlk 3 ay %0 komisyon', c1: '#1a1815', c2: '#44403c', emoji: '🏪', img: '', link: '/sell', cta: '', active: true, order: 6, place: 'side' }
      ];
      d.seq.banners = 6;

      // --- flaş fırsatlar ---
      C.Seed.refreshDeals(d, r);

      // --- demo müşteri verileri ---
      demoCustomer.favorites = sellable.filter((p, i) => i % 13 === 2).slice(0, 6).map(p => p.id);
      demoCustomer.viewed = sellable.filter(p => [7, 8, 12].includes(p.categoryId)).slice(0, 8).map(p => p.id);
      d.stores[6].followers.push(demoCustomer.id); d.stores[1].followers.push(demoCustomer.id);
      d.stores.forEach(s => { const n = r.int(200, 9000); s.followerBase = n; });
      const alertP = sellable.find(p => p.categoryId === 8);
      d.alerts.push({ id: 1, userId: demoCustomer.id, productId: alertP.id, target: Math.round(alertP.price * .9), createdAt: now - 5 * DAY, triggered: false });
      d.carts[demoCustomer.id] = sellable.filter(p => p.storeId === guven.id).slice(0, 2).map(p => ({ productId: p.id, variant: p.variants ? p.variants.options[1] : '', qty: 1, saved: false }));
      [['🎉 Siparişin kargoya verildi! Takip numarası ile kargonu izleyebilirsin.', '/account/orders'], ['💸 Takip ettiğin bir üründe fiyat düştü.', '/account/alerts'], ['🏷️ Sana özel BAHCEM10 kodu ile sepette %10 indirim!', '/cart']].forEach(([text, link], i) => d.notifications.push({ id: i + 1, userId: demoCustomer.id, text, link, read: i > 0, createdAt: now - (i + 1) * 7 * 3600e3 }));
      // satıcı bildirimleri
      d.notifications.push({ id: 10, userId: guven.ownerId, text: '📦 3 yeni siparişin hazırlanmayı bekliyor.', link: '/seller/orders', read: false, createdAt: now - 3600e3 });
      d.notifications.push({ id: 11, userId: guven.ownerId, text: '❓ Ürünlerine 3 yeni soru geldi.', link: '/seller/questions', read: false, createdAt: now - 2 * 3600e3 });
      d.notifications.push({ id: 12, userId: 1, text: '🏪 2 yeni mağaza başvurusu onay bekliyor.', link: '/admin/sellers', read: false, createdAt: now - 3600e3 });
      d.seq.notifications = 12;

      // hakediş geçmişi
      d.stores.filter(s => s.status === 'active').forEach(s => {
        for (let k = 1; k <= 4; k++) d.payouts.push({ id: d.payouts.length + 1, storeId: s.id, amount: U.round2(r.int(8000, 90000) + r()), createdAt: now - k * 14 * DAY, status: 'paid' });
      });
      if (C.Seed.extra) C.Seed.extra(d, r);
      return d;
    },
    refreshDeals(d, r) {
      r = r || U.rng(Date.now() % 100000);
      const pool = d.products.filter(p => p.status === 'active' && p.stock > 5);
      const picked = r.shuffle(pool).slice(0, 12);
      const now = Date.now();
      const end = U.startOfDay(now) + U.DAY - 1000; // gece yarısı biter
      d.deals = picked.map((p, i) => ({ id: i + 1, productId: p.id, pct: [15, 20, 25, 30, 35, 40][i % 6], endsAt: end, stockLimit: r.int(20, 80), claimed: r.int(5, 18) }));
      d.dealsDay = U.startOfDay(now);
    },
    describe(p) {
      const cat = CATS[p.categoryId - 1];
      const spec = Object.entries(p.specs).filter(([k]) => k !== 'Marka').slice(0, 3).map(([k, v]) => k.toLocaleLowerCase('tr-TR') + ': ' + v).join(', ');
      return `${p.brand} ${p.title}, ${cat.name.toLocaleLowerCase('tr-TR')} kategorisinde en çok tercih edilen ürünlerden biri. ` +
        `Günlük kullanıma uygun, dayanıklı ve şık tasarımıyla öne çıkar${spec ? ' (' + spec + ')' : ''}. ` +
        `Orijinal ve faturalı olarak, özenli paketlemeyle gönderilir. 15 gün içinde ücretsiz iade hakkınız vardır.`;
    }
  };
})();
