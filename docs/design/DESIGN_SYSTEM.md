# Atlas tasarım sistemi

Yetkili görsel kaynak güncel [HTML snapshot](reference/Atlas.dc.html); provenance ve hash [reference kaydında](reference/README.md). Satır numaraları bu snapshot'a aittir. Handoff'taki eski renk/ölçüler doğrudan kullanılmaz. Aşağıdaki **ölçüm** kaynak tanımıdır; **uygulama kararı** erişilebilirlik/alan sorunu için planlanan düzeltmedir. Hiçbiri çalışan React bileşeni değildir.

## Ölçülmüş token'lar

| Anlam / HTML token | Açık | Koyu | Kaynak |
| --- | --- | --- | --- |
| Sidebar `--sb` | `#F7F6F3` | `#191918` | HTML 18, 20 |
| Canvas `--bg` | `#FFFFFF` | `#1F1F1E` | HTML 18, 20 |
| Card `--card` | `#FBFAF8` | `#1C1C1B` | HTML 18, 20 |
| Raised / popover `--el` / `--pop` | `#FFFFFF` / `#FFFFFF` | `#2A2A28` / `#262625` | HTML 18, 20 |
| Hover `--hov` | `#EFEEEA` | `#2E2E2C` | HTML 18, 20 |
| Border `--bd` / `--bd2` | `#E3E1DC` / `#ECEAE6` | `#383835` / `#2D2D2B` | HTML 18, 20 |
| Text `--tx` / `--tx2` / `--tx3` | `#1A1918` / `#57554F` / `#75736D` | `#ECECEA` / `#A8A6A1` / `#8A8883` | HTML 18, 20 |
| Accent / hover `--ac` / `--ach` | `#2F6FEB` / `#2560D4` | `#5B8DEF` / `#4C7EE0` | HTML 18, 20 |
| Soft accent / text `--acs` / `--actx` | `#EAF1FD` / `#1F5CD1` | `rgba(91,141,239,.16)` / `#9DBBF5` | HTML 18, 20 |
| AI composer / border `--aiin` / `--aiib` | `#F4F3F0` / `#E3E1DC` | `#2A2A2A` / `#3A3A3A` | HTML 18, 20 |
| User bubble `--aiu` | `#F0EFEC` | `#2F2F2F` | HTML 18, 20 |
| Danger / warning | `#C24A40` / `#A9781E` | `#E5685F` / `#D3A548` | HTML 18, 20 |
| PDF surround / paper | `#F0F0EE` / `#FFFFFF` | `#1B1B1B` / `#FBFAF6` | HTML 18, 20 |
| Highlight `--hl` | `rgba(214,168,60,.30)` | `rgba(201,164,72,.28)` | HTML 19, 21 |
| Selection `--sel` | `rgba(94,106,210,.20)` | `rgba(108,121,224,.30)` | HTML 19, 21 |

Büyük vurgu yüzeyleri yerine küçük eylem, seçili durum ve kapsam chip'leri kullanılır. PDF'nin kağıt yüzeyi uygulama temasından ayrı tutulur; asıl dosyanın renkleri değiştirilmez.

| Tür | Ölçüm / kullanım | Kaynak |
| --- | --- | --- |
| UI ailesi | `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Geist', system-ui, sans-serif`; `--serif` ve `--read` de aynı stack | HTML 17 |
| Mono / PDF serif | JetBrains Mono + ui-monospace; yalnız kağıt simülasyonu Lora/Georgia | HTML 17; uygulamada font lisansı ayrıca doğrulanır |
| UI body | 14px / 1.5, letter spacing −.006em | HTML 47 |
| Document title | 32px, 600, line-height 1.08, −.02em | HTML 266, 337 |
| Reading body | 15.5px / 1.65 | HTML 272 |
| Nav / küçük metadata | Nav 14px, alt kaynak linkleri 13px, sayaç 11–12px | HTML 56–87 |
| Sidebar | 240px; padding 12/10/10; row 32px; section row 30px | HTML 50–60 |
| Topbar / tabs | Bar 48px; tab 30px; close 20px; add 30px | HTML 108–109 |
| Button boyutları | Sık kullanılan icon 28px/32px; ana uygulamada 36px genel norm doğrulanmadı | HTML 53, 70; 36px örneklerin bir bölümü ayrı mobile mockup |
| Document alanı | max-width 740px; padding 40px 40px 160px | HTML 263 |
| Home alanı | padding 32px 32px 128px; max-width 1440px | HTML 114 |
| AI panel | 392px; geniş düzende aynı miktar sağ margin | HTML 1895–1898, 2029 |
| AI dar panel | `min(392, W−16)` px; scrim | HTML 1898, 2111 |
| Köşeler | Nav/input benzeri kontrollerde 6/8px, proje kartı 12px, AI floating 16px, panel/canvas 0 | HTML 56, 125, 143, 1896–1901 |
| Boşluk | Kaynakta gap 4/6/8/10/12/14/16px; büyük gutter 24/32/40px kullanımları | HTML 51–57, 114, 263; tek 4px grid varmış gibi normalize edilmez |
| İkon | Lucide static font `0.469.0`; sidebar ikon 16px, kontrol 15–17px | HTML 15, 53, 56; uygulama paket sürümü henüz seçilmedi |
| Focus | 2px accent outline, 1px offset; input/textarea outline kaldırılıyor | HTML 30–31; kaldırma uygulamada düzeltilmeli |
| Motion | Panel slide .22s; floating left/width .18s | HTML 1896, 1898; reduced motion kuralı yok |

## Bileşen davranışları ve ortak durumlar

| Bileşen | Beta davranışı / kabul |
| --- | --- |
| AppShell/sidebar | Sabit workspace/proje göstergesi, açık seçili öğe, katlanabilir Notes/Sources/Chats. Proje değişimi önce yetki, sonra içerik. Sidebar listesi kendi scroll alanında; hesap kontrolleri sabit. Gelecek modülleri beta menüsünden çıkar. |
| Ortak üst sekmeler | S03–S12 arasında tutarlı sıra ve aktif etiket; yatay taşmada ulaşılabilir overflow menüsü. Gerçek button/tab semantics; kapatma odağı komşu sekmeye taşır. Channels istisnası kaldırılacak. |
| Listeler/kartlar | Başlık esas, secondary metadata sessiz; satır seçimi klavyeyle, eylemler focus-within ve touch'ta görünür. Hover tek erişim yolu olmaz. Skeleton/filtrede boş/gerçekte boş ayrı. |
| Document editor | Okuma genişliği korunur, math gösterimi ve citation düğmeleri erişilebilir; save durumu canlı ama sessiz announcement. Conflict diff'i ve sürüm restore'u yeni revision üretir. Co-editing/presence gösterilmez. |
| PDF alanı | Canvas bağımsız scroll, toolbar sabit; Notes/Outline ve AI aynı anda daraltıcı iki rail açmaz. Sayfa/zoom anlamlı label, not/anchor klavye alternatifi; canvas tek başına erişilebilir metin yerine geçmez. |
| Tasks | Board + List aynı veridir. Drag/drop'a durum/atama menüsü eşdeğer; renk yanında metin/ikon. Ayrıntı kapanınca seçili göreve dön. |
| Discussion | Projeye bağlı thread ve artifact kartı; tam DM/chat ürünü değil. Yerel kanal seçimi dar alanda menüye dönüşür. Thread ve AI aynı anda ana mesaj alanını sıkıştırmaz. |
| AI panel | Aşağıdaki tek etkileşim modeli; okunabilir mesajlar, anlaşılır scope, kaynak konumu, working/cancel/insufficient/limit/error. “Thought” adımları modelin iç düşüncesi diye sunulmaz; yalnız gerçek işleme durumu gösterilir. |
| Dialog/drawer/popover | Adlandırılmış başlık, Escape, açık kapatma düğmesi, açılışta anlamlı odak ve kapanışta tetikleyiciye dönüş. Modal'da arka plan inert ve focus trap. Popover modal değilse ana iş akışını kilitlemez. |
| Genel hata | Ne başarısız oldu ve nasıl devam edilir görünür; input korunur; retry idempotent. Başarı toast'u kayıt garantisi yerine geçmez. |

## Dört genişlikte alan planı

Bu tablo uygulama kararıdır; tüm ekranların bu koşulları bugün sağladığı iddiası yoktur. Kaynaktaki 900px sidebar ve 1200px panel eşikleri korunur, içeriğin minimum okunabilir alanı ayrıca denetlenir.

| Viewport | Sidebar | Ana içerik / AI | Focus ve scroll |
| --- | --- | --- | --- |
| 390px | Kapalı başlar; 240px overlay drawer | İçerik tek kolon. AI yaklaşık tam ekran sheet; kaynak Notlar ve AI sıralı açılır. 16px dış boşluk önerisi; tablo/PDF kendi kontrollü yatay scroll'u dışında yatay app taşması yok. | Tek aktif overlay; sanal klavyede composer görünür, main inert; sheet kendi mesaj scroll'u |
| 768px | Drawer; ana alandan genişlik almaz | İçerik 768px, AI açılırsa overlay `min(392,W−16)`; yan yana çalışma zorunlu değil | Drawer/AI karşılıklı dışlar; Tab arkaya geçmez; kapatma/geri erişilebilir |
| 1024px | 240px inline veya kullanıcı kapatır | Main 784px; AI overlay, main margin değiştirmez. PDF notes ve discussion thread ikincil görünüm olarak açılır. | Main/PDF tek ana scroll; overlay arka plan scroll'unu durdurur |
| 1440px | 240px inline | AI kapalı main 1200px, açık 808px. Bu bütçede kanal nav + thread + AI birlikte açılmaz. Doc/PDF için 640px kullanılabilir okuma alanı hedefi; daha azında ikincil panel overlay/kapalı olur. | Inline AI ayrı messages scroll, composer sabit; main scroll korunur. Focus trap yalnız modal görünümde |

640px minimum okuma alanı kaynak ölçümü değil Faz 00 kullanılabilirlik hedefidir. Daha geniş ekranlarda da ölçüt yalnız viewport değil sidebar sonrası kullanılabilir alandır. 200% zoom ve 320 CSS px reflow ayrıca test edilecek.

## Tek AI etkileşim modeli

10 Kasım kullanıcı kararı: compact composer, expanded floating, focus ve docked aynı konuşmanın dört sunumudur. Ortak uygulama controller’ı konuşma, taslak, kapsam ve çalışan isteği sunumdan bağımsız tutar; görünüm değişimi yeni konuşma açmaz. Dar ekranda kullanılabilir sheet/focus karşılığı kullanılır. Inline “Ask Atlas”, seçili PDF pasajı veya doküman eylemi bu paneli açıp görünür context chip'i önerir. Göndermeden önce kullanıcı kapsamı görür.

Konuşma tek projeye ve başlatırken seçilmiş source version listesine bağlıdır. Sadece “Project” yazmak yeterli değil: proje adı, seçilen kaynak sayısı ve genişletilebilir sürüm listesi görünür. “Tüm proje kaynakları” seçimi gönderim anında izinli hazır sürüm listesine dondurulur. Ekran değişimi scope'u kendiliğinden değiştirmez. Kaynak listesi değiştirilecekse yeni konuşma açılır. Proje değişince eski konuşma kapanır; başka proje verisi yeni panele taşınmaz. Bu, HTML'deki ekran geçişinde `aiCtx` değiştirme davranışının gerekli düzeltmesidir.

AI cevabı özel konuşmadadır. Başkalarıyla paylaşım açıkça dokümana/thread'e öneri olarak ekleme eylemidir; geçmiş konuşmayı açığa çıkarmaz. Uygulamadan önce diff ve hedef sürüm yeniden doğrulanır. Ayrıntı [AI sözleşmesinde](../AI_AND_SOURCE_CONTRACT.md).

## Erişilebilirlik ve gerekli düzeltmeler

Hedef WCAG 2.2 AA: normal metin en az 4.5:1, büyük metin 3:1, anlam taşıyan UI sınırı/focus göstergeleri 3:1; dokunma hedefinde 24 CSS px alt sınır ve mobil ana eylemlerde 44px hedef. Renk tek bilgi taşıyıcı olmaz; ad/label, sıralı focus, keyboard trap olmaması, status announcement ve azaltılmış hareket gerekir. [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/).

Gerçek token çiftlerinden hesaplanan örnekler: light tx/bg 17.56:1; tx2/bg 7.45:1; tx3/sidebar **4.39:1**; white/light accent 4.57:1; dark tx/bg 13.95:1; tx3/sidebar 4.97:1; white/dark accent **3.23:1**. Bunlar yalnız düz renk hesaplarıdır, bütün ekran kontrast taraması değildir. Açık temada küçük sidebar metni tx2 ile, koyu temada accent üstü küçük yazı uygun koyu foreground veya daha koyu action yüzeyiyle uygulanmalı; kesin yeni token eşleşmesi ölçülerek sabitlenecek. Kaynak paleti gözden geçirilmeden AA geçti denmez.

Input/textarea için focus-visible kaldırma tersine çevrilir; icon-only düğmeler programatik ad alır. Tablist ok tuşları/roving focus, Escape ve focus restore test edilir. J/K/E kısayolları input/editörde işlemez ve alternatif düğmeleri vardır. `prefers-reduced-motion` hareketi/skeleton pulse'u kapatır, işleme durum metni kalır. Kaynakta bunun bulunmadığı statik taramayla doğrulandı; ekran okuyucu ve tam klavye testleri NOT RUN.
