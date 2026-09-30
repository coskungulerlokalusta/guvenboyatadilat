# MarkaBahçem: çok satıcılı pazaryeri

Trendyol benzeri, birçok mağazanın ürün sattığı bir pazaryeri. Müşteri vitrini, satıcı paneli ve platform yönetim paneli aynı uygulamanın içinde.

Kurulum gerekmez. `index.html` dosyasını bir web sunucusundan açmak yeterli:

```bash
cd pazaryeri
python3 -m http.server 8080
# tarayıcıda http://localhost:8080
```

## Demo hesapları

| Rol | E-posta | Şifre |
|---|---|---|
| Müşteri | musteri@markabahcem.com | musteri123 |
| Satıcı (Güven Yapı Market) | satici@markabahcem.com | satici123 |
| Yönetici | admin@markabahcem.com | admin123 |

Giriş sayfasındaki "… olarak dene" butonları da aynı işi yapar. Yönetici panelindeki **Site ayarları › Demo verisini sıfırla** tüm veriyi baştan oluşturur.

## Özellikler

### Müşteri
- Ana sayfa: slider banner, mağaza hikâyeleri, kategori menüsü, flaş fırsatlar (geri sayımlı), kuponlar, kişiye özel öneriler, fiyatı yeni düşenler, popüler mağazalar
- Arama: otomatik tamamlama, **yazım hatası düzeltme** ("kulakilk" → "kulaklık"), sesli arama, kategori/marka/fiyat/puan/satıcı/kargo filtreleri, sıralama, sayfalama
- Ürün sayfası: galeri, varyant seçimi, **beden önerisi**, tahmini teslimat, taksit tablosu, **diğer satıcılar** fiyat karşılaştırması, birlikte sık alınanlar, soru-cevap, yorumlar
- **Fiyat analizi**: 90 günlük fiyat geçmişi grafiği, "en düşük fiyat / beklemeye değer" yorumu, **sahte indirim uyarısı**
- **Yorum özeti**: yorumlardan otomatik artı/eksi çıkarımı
- **Fiyat alarmı**: hedef fiyata düşünce bildirim
- **Akıllı alışveriş asistanı**: "1000 TL altı kablosuz kulaklık", "anneme 500 TL altı hediye", "siparişim nerede" gibi günlük dille arama
- Çok mağazalı sepet, mağaza bazlı kargo eşiği ve **eşiği tamamlayacak ürün önerileri**, sonra al listesi, kuponlar
- Ödeme: adres seçimi, kart / havale / kapıda ödeme, taksit, 3D Secure simülasyonu
- Hesabım: sipariş takibi (zaman çizelgesi), iptal, iade talebi, değerlendirme, favoriler, fiyat alarmları, takip edilen mağazalar, bildirimler, adresler
- Ürün karşılaştırma (4 ürüne kadar), mağaza sayfaları, açık/koyu tema, mobil uyumlu arayüz

### Satıcı paneli
- Mağaza başvurusu ve onay süreci, kazanç hesaplayıcı
- Genel bakış: ciro, sipariş, ortalama sepet, net hakediş, günlük grafik, sipariş saati ısı haritası
- **Akıllı öneriler**: stok bitiş tahmini, rakip daha ucuz uyarısı, düşük dönüşüm, cevapsız sorular, en yoğun satış saati
- Siparişler: onaylama, toplu işlem, kargo etiketi, takip numarası, iptal, Excel'e aktarma
- İadeler: onay/ret, iade sebebi analizi
- Ürünler: satır içi fiyat/stok düzenleme, toplu fiyat ve stok, kopyalama, yayına alma/pasife alma
- Ürün ekleme: fotoğraf yükleme, varyantlar, **akıllı açıklama yazıcı**, **piyasa fiyat önerisi**, komisyon/kâr hesabı, kalite puanı, canlı önizleme
- Mağaza tasarımı: logo, renkler, kapak fotoğrafı, duyuru bandı, banner yönetimi
- Kampanyalar: mağaza kuponu, toplu indirim, kargo bedava eşiği, flaş fırsat başvurusu
- Raporlar: tarih aralığı, önceki dönemle karşılaştırma, müşteri sadakati, şehir dağılımı, ürün performansı, CSV dışa aktarma
- Finans: hakediş dökümü, komisyon, erken ödeme talebi, ödeme geçmişi
- Ayarlar: kargo ücreti, teslim süresi, tatil modu

### Entegrasyon ve fiyat (satıcı paneli)
- **XML ile ürün yükleme**: dosya yükle, metin yapıştır ya da örnek dosyayla dene. `<Urunler><Urun>`, `<products><product>`, Google Merchant (`<rss><item><g:price>`) ve iç içe özel yapılar otomatik tanınır.
  - Alanlar Türkçe/İngilizce adlarından otomatik eşleşir (`StokKodu`/`sku`, `SatisFiyati`/`price`…), elle değiştirilebilir. `1.299,90 TL` gibi fiyat yazımları doğru okunur.
  - XML kategorileri site kategorilerine eşleştirilir (tahmin + elle düzeltme).
  - Fiyat ayarı: XML fiyatını kullan, % ekle ya da alış fiyatı + % kâr; ,90/,99 yuvarlama.
  - Önizleme: yeni / güncellenecek / hatalı satırlar ve onaya düşecek zamlar içe aktarmadan önce gösterilir.
  - Seçenekler: yeni ürün ekle, yalnızca stok güncelle, içerik güncelle, XML'de olmayanları pasife al.
  - Otomatik senkron için feed adresi ve sıklık (saatlik / 6 saatlik / günlük), içe aktarma geçmişi ve hata raporu, ürünleri XML olarak dışa aktarma, şablon.
- **Otomatik fiyatlandırma**: sıralı kurallar ve koruma sınırları (en az kâr marjı, tek seferde en fazla değişim, yuvarlama).
  - Rakibe göre fiyatla (buybox), stok seviyesine göre, satmayan ürünü indir, maliyet + marj, periyodik zam (enflasyon/kur), zamanlı indirim.
  - Uygulamadan önce önizleme, günlük otomatik çalıştırma saati, fiyat değişim geçmişi.
- **Fiyat artış talepleri**: son 30 günün en yüksek fiyatına göre %15'i (yönetici ayarlar) aşan artışlar ve flaş fırsattaki ürünlerde yapılan artışlar doğrudan uygulanmaz, talep olarak yöneticiye gider. Bu kural elle düzenleme, toplu fiyat, XML ve otomatik kurallar dahil tüm fiyat değişikliklerinde geçerlidir. Satıcı gerekçe ve açıklamayla toplu talep oluşturabilir, bekleyen talebi geri çekebilir.
- **Yönetici**: talepleri tek tek ya da toplu onaylar, kısmi onay verir (ara fiyat) veya gerekçeyle reddeder; rakip fiyatı ve artış oranı yanında görünür. Onay kuralı ve sınır oranı ayarlanabilir.

### Yönetim paneli
- Kontrol paneli: GMV, komisyon geliri, yapılacaklar listesi, mağaza sıralaması
- Mağazalar: başvuru onay/ret, askıya alma, mağazaya özel komisyon, resmi satıcı rozeti, satıcı gözünden görüntüleme
- Ürün onayı: moderasyon, otomatik kontroller (şüpheli indirim, yasaklı kelime), öne çıkarma
- Siparişler, kullanıcılar (engelleme), kategori ve komisyon oranları
- Ana sayfa banner yönetimi (sıralama, önizleme, görsel yükleme), flaş fırsatlar, kuponlar
- **Risk ve denetim**: yüksek iptal/iade oranlı mağazalar, sahte indirim tespiti ve tek tıkla düzeltme
- Site ayarları: duyuru, taksit vade farkları, moderasyon, veri dışa aktarma

## Kendi mağazaların: XML bayilik (dropshipping)

Yönetim paneli › **Kendi mağazalarım › XML bayilikler**

1. **Yeni XML bayilik**: mağaza adı, logo ve renk ile vitrinde bağımsız görünen bir mağaza açılır (ör. "Ayakkabı Standı", "Merve Bijuteri"). Aynı ekranda bayinin iletişim bilgileri, XML adresi, sipariş iletim yöntemi ve fiyat kuralı girilir.
2. **XML senkronu**: ürünler, stok ve fiyatlar bayinin XML'inden gelir (adresten çekme sunucu gerektirir; dosya yükleyerek de yapılabilir).
   - Satış fiyatı = alış fiyatı + % kâr (ya da XML fiyatı + %), ürün başı en az kâr TL'si ve ,90 yuvarlama.
   - Bayide stoğu biten ürün gizlenir, stok gelince geri açılır.
   - Kendi mağazalarında fiyat artış onayı ve komisyon uygulanmaz.
3. **Tedarik siparişleri**: müşteri kendi mağazalarından birinden sipariş verince bayiye gidecek tedarik siparişi (TS-no) otomatik açılır.
   - İletim yolu: WhatsApp (hazır mesaj, tek tık), SMS (Netgsm), e-posta (SMTP) ya da bayinin API'si. SMS, e-posta ve API için "otomatik ilet" seçilebilir.
   - Bayi onayladığında müşterinin siparişi "Hazırlanıyor" olur. Takip numarası girilince "Kargoda" olur ve müşteriye takip numaralı SMS gider.
   - Stok yoksa "Sorun var" ya da iptal; iptalde müşteriye iade bildirimi gider.
4. **Kârlılık**: mağaza/bayi bazında satış, bayiye ödenen, bayi kargosu, ödeme komisyonu, net kâr, marj ve ortalama kargoya verme süresi.
5. **Satıcı bilgileri**: mağaza adları farklı olsa da kendi mağazalarının "Mağaza hakkında" bölümünde ve ödeme sayfasında satıcı olarak şirketinin unvanı, vergi/MERSİS ve adresi gösterilir. Mesafeli Sözleşmeler Yönetmeliği bunu zorunlu tutar; bu alan doldurulmadan canlıya çıkılmamalıdır.

**Hukuki hatırlatmalar**
- Üstü çizili fiyat olarak bayinin tavsiye satış fiyatını göstermek varsayılan olarak kapalıdır. İndirimli fiyat, son 30 günün en düşük satış fiyatına göre gösterilmelidir.
- Kendi mağazalarına gerçek olmayan yorum, puan ya da takipçi eklenmemelidir. Örnek verideki yorumlar yalnızca demo içindir.
- İade ve cayma hakkından müşteriye karşı satıcı (sen) sorumlusun; bayilerle iade ve kusurlu ürün koşullarını yazılı anlaşmaya bağla.

**Tam otomasyon için sıradaki adım:** Siparişler ve ürünler şu an tarayıcıda tutulduğu için tedarik siparişlerinin bayiye kendiliğinden gitmesi ve XML'in belirli saatlerde çekilmesi, yönetim paneli açıkken çalışır. Bunu 7/24 tam otomatik yapmak için sipariş ve ürün verisinin sunucudaki bir veritabanına taşınması gerekir (`core.js` içindeki `DB` katmanı bunun için tek noktada toplandı).

## Sunucu: iyzico ödeme ve Netgsm SMS (`backend/`)

Ödeme ve SMS için API anahtarları tarayıcıda tutulamayacağı için küçük bir Node.js sunucusu vardır. Yapı Lokalusta'daki entegrasyonlarla aynıdır: `sms.js` ve `netgsmSesliArama.js` Netgsm modülleri, `getIyzipayClient` ve yönetim panelinden "Kaydet & Bağlan / Test Et" akışı. Sunucu aynı zamanda pazaryeri arayüzünü de yayınlar.

```bash
cd pazaryeri/backend
cp .env.example .env      # ADMIN_PANEL_KEY ve PUBLIC_URL'yi doldur
npm install
npm start                 # http://localhost:8080
```

1. Yönetici hesabıyla gir, **Entegrasyonlar** sayfasına git ve **Sunucu bağlantısı** alanına `.env` içindeki `ADMIN_PANEL_KEY` değerini yaz.
2. **İyzico** kartına API Key ve Secret Key değerlerini gir, ortamı seç (Sandbox/Canlı), sonra "Kaydet & Bağlan" ve "Test Et".
   - 3D Secure açıkken dönüş adresi `PUBLIC_URL/api/payments/3ds/callback`.
   - Sandbox test kartı: `5528 7900 0000 0008`, `12/30`, CVC `123`.
3. **Netgsm** kartına kullanıcı adı, şifre ve onaylı SMS başlığını gir, "Test SMS Gönder". Netgsm panelinde API erişimini açıp sunucu IP'sini izinli listeye ekle.
4. **Netgsm Sesli Arama** için alt kullanıcı, şifre ve AudioID gir. 48 saat onaylanmayan siparişte satıcı otomatik aranır.
5. **Pazaryeri modu** açılırsa her mağaza iyzico alt üye iş yeri olarak kaydedilir (Entegrasyonlar sayfasının altındaki tablo). Ödemenin satıcı payı komisyon düşülerek doğrudan mağazanın IBAN'ına aktarılır.

| Uç | Açıklama |
|---|---|
| `POST /api/integrations/:servis` · `GET …/status` · `POST …/test` | iyzico, netgsm, netgsmses, smstemplates ayarları (yönetici anahtarı gerekir) |
| `GET /api/payments/config` | iyzico açık mı, ortam, 3D Secure |
| `POST /api/payments/installments` | Kart BIN'ine göre gerçek taksit seçenekleri |
| `POST /api/payments/pay` | Ödeme (3D Secure veya doğrudan) |
| `POST /api/payments/3ds/callback` | Bankadan dönüş, ödemeyi tamamlar |
| `POST /api/payments/refund` · `/cancel` · `/submerchant` · `GET /log` | Yönetici: iade, iptal, alt üye kaydı, işlem listesi |
| `POST /api/sms/otp/send` · `/otp/verify` | Üyelikte telefon doğrulama (hız sınırlı) |
| `POST /api/sms/send` · `/bulk` · `/voice` · `GET /log` | Yönetici: tekil/toplu SMS, sesli arama, SMS geçmişi |
| `POST /api/suppliers/xml-fetch` · `/forward` | Yönetici: bayi XML'ini sunucudan indirme, tedarik siparişini e-posta/SMS/API ile iletme |

**Güvenlik notları**
- Anahtarlar `backend/data/integrations.json` dosyasında (izin: 600) saklanır. Bu klasör Git'e eklenmez ve web'den erişilemez. Panel gizli değerleri yalnızca son 4 hanesiyle gösterir.
- Siparişler şu an tarayıcıda tutulduğu için ödeme tutarını istemci gönderir; taksit farkını sunucu iyzico'dan sorgular. Siparişler sunucuya taşındığında tutar veritabanından hesaplanmalıdır. İstemciden tetiklenen sipariş SMS'leri de bu yüzden varsayılan olarak kapalıdır (`ALLOW_CLIENT_ORDER_SMS=true` ile açılır, sıkı hız sınırı var).
- Kampanya SMS'leri yalnızca ticari ileti izni veren kullanıcılara gider ve mesajda İYS ret kodu bulunmalıdır.

Sunucu çalışmıyorsa (örneğin statik önizlemede) panel **demo modunda** açılır. Ayarlar tarayıcıda saklanır, SMS ve ödeme gerçekten gönderilmez, SMS geçmişinde "Demo (gönderilmedi)" olarak görünür.

## Dosya yapısı

```
pazaryeri/
├── backend/            Node.js API (iyzico, Netgsm) — ayrıntı yukarıda
├── index.html
├── css/style.css       tasarım sistemi (açık/koyu tema)
└── js/
    ├── core.js         yardımcılar, veri katmanı (DB), oturum, yönlendirici, grafikler
    ├── seed.js         örnek mağaza, ürün, sipariş ve yorum üretimi
    ├── services.js     iş kuralları: fiyat, arama, sepet, sipariş, öneri, analiz, asistan
    ├── components.js   ürün kartı, yıldız, rozet gibi ortak parçalar
    ├── shop.js         müşteri sayfaları
    ├── seller.js       satıcı paneli
    ├── admin.js        yönetim paneli
    ├── integrations.js XML yükleme, otomatik fiyatlandırma, fiyat artış talepleri
    ├── baglantilar.js  sunucu API istemcisi, iyzico ödeme, Netgsm SMS/sesli arama, entegrasyon ve SMS ekranları
    ├── tedarik.js      XML bayilik (dropshipping): kendi mağazaların, bayi senkronu, tedarik siparişleri, kârlılık
    └── app.js          sayfa düzenleri, üst menü, asistan, rotalar
```

## Canlıya almadan önce

Bu sürüm tüm veriyi **tarayıcının yerel deposunda** tutar; her ziyaretçi kendi kopyasını görür. Gerçek bir pazaryeri için:

1. **Sunucu ve veritabanı**: `core.js` içindeki `DB` nesnesi tek erişim noktasıdır; metotları bir REST API'ye bağlanır (Node.js/PostgreSQL ya da benzeri).
2. **Güvenli giriş**: şifreler sunucuda hash'lenmeli, oturumlar sunucu tarafında yönetilmeli.
3. **Ödeme ve SMS**: iyzico ve Netgsm entegrasyonları `backend/` içinde hazır; siparişler sunucuya taşındığında ödeme tutarı sunucuda hesaplanmalı.
4. **Kargo**: Yurtiçi, Aras, MNG API'leri ile otomatik barkod ve takip.
5. **Yasal**: e-Fatura/e-Arşiv entegrasyonu, KVKK metinleri, mesafeli satış sözleşmesi, ETBİS kaydı.
6. **Görseller**: ürün fotoğrafları için bulut depolama ve CDN.
