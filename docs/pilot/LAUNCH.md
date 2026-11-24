# Atlas Research kapalı pilot yayın planı

Hedef en fazla 20 araştırmacıya ücretsiz erişim sağlamak. İlk kabul turu iki bireysel araştırmacı ve iki üyeli bir ekiple yapılır. Production checkout ve canlı davet gönderimi kapalıdır. Pilot kontenjanı ile Founding Researcher programı ayrı kayıtlar üzerinden izlenir.

Operasyon ve destek sorumluluğu ürün sahibinde. Katılımcılar ürün sahibine e-postayla ulaşır. Adres karşılama bilgileriyle özel olarak paylaşılır. İlk katılımcılar henüz kaydedilmedi. Bağımsız production yedek hedefi ürün sahibinin kararıyla bu pilot için ertelendi. Canlı yedek ve bağımsız geri yükleme kanıtı açık kalıyor.

## 1. Yayın ve sürüm izlenebilirliği

- Running release ve şema revizyonunu Coolify kaydıyla eşleştir. Production’da çalışan kodu `main` tabanlı PR üzerinden incele, doğrula ve squash merge et. Production commit’i ile merge sonucu arasındaki kod farkını kaydet.
- Typecheck, lint, unit, PostgreSQL entegrasyonu, production build ve production yapıdan masaüstü ile dar ekran Chromium akışlarını çalıştır. Docker Compose ile servislerin aynı şemayı, mevcut volume adlarını ve doğru credential sınırlarını kullandığını doğrula.
- Uyumlu web, files, mail, migrator, broker ve runner imajlarını digest ile kaydet. Kaynak kodu yeniden derlemek aynı imajı geri getirmez. Geri dönüş denemesinde aynı digest’leri ve sağlık kontrollerini doğrula.

Katılımcı erişimini açmadan önce kanıt kaydına aynı sürümü ve şemayı yaz. Genel erişim kontrolü sekiz HTTPS GET isteği yapar ve çıkış kodu `1` ile beklenmeyen sonucu bildirir. Oturum, çerez veya özel veri kullanmadan sağlık, sürüm, kapalı ödeme ve posta durumu, oturumsuz API reddi ve giriş güvenlik başlıklarını doğrular.

```sh
NODE_OPTIONS=--use-system-ca npm run pilot:preflight -- \
  https://om2lefhyk80lxthwkqe2qi3f.91.99.118.96.sslip.io \
  01a0938dff2d9a7a1b35a13e9626a0fa68fdbbef \
  202611240104_compute_jobs
```

Beklenen commit ve şema değerlerini planlanan dağıtım kaydından al. Sağlık yanıtını beklenen değer olarak kopyalamadan önce dağıtım kaydıyla doğrula. JSON çıktısındaki `PASS` yalnızca genel HTTPS kontrollerini ifade eder.

## 2. Gerçek production kabulü

Yetkili pilot test hesapları giriş yapınca aşağıdaki akışlar sentetik çalışma alanlarında ve yalnızca kullanılmasına izin verilen örnek PDF’lerle yürütülür. Gerçek araştırma alanlarının kotasına veya üyeliklerine dokunmadan ölçüm yapılır.

| Senaryo | Kabul |
| --- | --- |
| Bireysel araştırma | Kaynak ve PDF sürümü kaydedilir. PDF notu ve APA atfı eklenir. Doküman kaydedilip yeniden açılır. Atıf aynı kaynak sürümü ve sayfaya gider. Görev doküman ve kaynağa bağlanır. |
| Ekip ve yetki | Aynı ekibin ikinci üyesi kendisine açılan dokümanı görür. Diğer ekip ve yetkisi kaldırılan oturum PDF, doküman, dışa aktarım ve Compute sonucuna erişemez. |
| Python | Geçerli iş çıktı üretir. Düşük zaman sınırını aşan iş durur. Ölçülen süre doğru çalışma alanına yazılır. Aynı istek ikinci kez kullanım yazmaz ve paket sınırını aşan iş reddedilir. |
| LaTeX | Geçerli PDF yetkili oturumda açılır. Zaman aşımında sonuç üretilmez. Test çalışma alanındaki derleme kotası dolduğunda yeni iş API seviyesinde reddedilir. |
| Hata ve mobil | Yükleme, oturum kaybı, kaydetme çakışması ve kota dolması için anlaşılır durum ve geri dönüş yolu görünür. Kritik akış dar ekranda ve klavyeyle tamamlanır. |

Tarayıcı oturumu, davet token’ı, kaynak içeriği ve özel dosyalar rapora kopyalanmaz. Her kontrol ortam, release, beklenen/gözlenen sonuç ve gerekli olduğunda güvenli bir istek kimliğiyle kaydedilir.

İlk prova için mevcut doğrulanmış hesaplarla üç ayrı tarayıcı profili kullan. Bir hesap çalışma alanının sahibi, bir hesap aynı projede düzenleyici, üçüncü hesap farklı bir çalışma alanının üyesi olur. İkinci hesapla görev ve Inbox bağlantısını aç. Üçüncü hesapla aynı PDF, doküman, dışa aktarım ve Compute sonuç bağlantılarının reddedildiğini kontrol et. Prova üyeliğini kaldırıp önceki oturumda erişimi tekrar dene. Kendi çalışma alanlarını ve üretim kaynaklarını kullan; gerçek katılımcıların verilerinde değişiklik yapma.

## 3. Veriyi kurtarma

- Yetkili operatör PostgreSQL ve özel dosya yazılarını aynı kısa pencere için durdurur ve açık işleri boşaltır. Salt okunur yedek rolüyle DB dump ve özel dosya manifesti alınır. Şifreli set, onaylı bağımsız hedefe yazılır. Kurtarma anahtarı hedeften ayrı tutulur.
- Ayrı PostgreSQL ve dosya alanına geri yükleme yapılır. Prisma şeması, dosya hash’leri, doküman geçmişi, atıf bağlantıları, ekip izinleri, Compute çıktıları ve kullanım kayıtları karşılaştırılır. Kurtarma süresi ve yedek yaşı ölçülür. Canlı diskler doğrulama hedefi olarak kullanılmaz.
- İzole Docker kurtarma provasının sonucu yayın kaydında. Pilot sırasında izinli ve ikame edilebilir örneklerle başlanır. Bağımsız hedef ve gerçek production geri yüklemesi daha sonra tamamlanacak.

## 4. Giriş, destek ve katılımcı dalgaları

- Ürün sahibi destek için e-posta adresini ve destek saatlerini katılımcıya [ilk oturum rehberiyle](PARTICIPANT_BRIEF.md) birlikte verir. Saklama, erişim kaldırma ve silme talepleri aynı adrese gider. Katılımcı ve hesap listesi özel kalır.
- Uygulamanın gönderimi kapalıyken oturumlu kabul mevcut doğrulanmış hesaplarla yapılır. Production’da yeni kayıt, parola kurtarma ve yeni ekip daveti uygulamanın e-posta gönderebilmesini gerektirir. Ekip provası için üyeliği hazır iki doğrulanmış hesap gerekir. Katılımcı hesaplarının nasıl açılacağı dalga başlamadan onaylanır. Mevcut ilk kullanıcı mekanizması boş veritabanında bir kez çalışır. Standart doğrulama ve ekip izinleri korunur.
- İlk dört katılımcıyla gözlem yapılır. P0 veya P1 durumunda ilgili katılım adımı durur. Yetki, veri bütünlüğü ve destek kontrolleri geçince önce 10’a, ardından en fazla 20’ye çıkılır.
- Giriş, ilk proje, kaydedilen kaynak, PDF notu, atıflı doküman, ekip erişimi ve tekrar kullanım [M1–M7 ölçüm protokolüyle](MEASUREMENT.md) kaydedilir. Tamamlanmamış 7 günlük ölçüm pencerelerinden yüzde veya gerçek pilot sonucu üretilmez.

## 5. AI ve ticari açılış

- AI etkinleştirme için onaylı model ve bütçe, workspace veri onayı ve gerçek sağlayıcı değerlendirmesi gerekir. Pilot kapsamı güncel literatür öneriyorsa tarih aralığı, kaynak bulunmayan durumda yanıt ve sağlayıcı maliyetinin krediye dönüşümü kontrol edilir. G04 için gerçek makale, soru ve locator örneklem eşiği korunur.
- Ücretli açılış için sağlayıcı seçimi, doğrulanmış webhook, ülke bazında checkout ve vergi, iptal/iade ve başarısız tahsilat akışları test edilip onaylanır. Ücretsiz kapalı pilottaki erişimler kart veya otomatik ödeme gerektirmez.

## Yayın kaydı

- Production `01a0938`, `202611240104_compute_jobs`. Python ve LaTeX production çalıştırıcı testi geçti. Oturumlu production kota ve ekip kabulü için mevcut hesapla giriş gerekiyor.
- 24 Kasım 2026’da genel HTTPS yayın kontrolü production `01a0938` ve rotasyon sonrası staging `e2297ea` üzerinde 7/7 geçti. Çalışan production kodu PR #56 ile `main` dalına alındı.
- Hazırlık dalında 21 birim ve 15 PostgreSQL entegrasyon testi geçti. Geçici veritabanında üç hesapla kayıt, ekip paylaşımı, erişim iptali ve e-posta kapalı durum testleri tamamlandı. Pilot yardım ekranı ve güvenli tanı metni beş ekran genişliğinde ve iki temada doğrulandı.
- Açığa çıkan staging bağlantıları yenilendi. Eski anahtar reddi ve staging uçtan uca Compute kabulü doğrulandı.
- Sentetik Docker geri yükleme kanıtı mevcut. Bağımsız production yedek hedefi, production geri yükleme provası ve pilot gözlemi açık.

[Teslimat kanıtları](../implementation/pricing-and-entitlements/TEST_REPORT.md) · [Kurtarma ve geri dönüş](../implementation/pricing-and-entitlements/ROLLOUT_AND_ROLLBACK.md) · [Pilot kiti](README.md)
