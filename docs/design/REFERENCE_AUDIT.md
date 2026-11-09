# Güncel referans denetimi

## Uygulama hizalama düzeltmesi — 9 Kasım 2026

Kullanıcının yeniden verdiği `/Downloads/Atlas.dc.html` dosyası 447,208 byte ve SHA-256 `fb98b5ca09dc1bf7fdb49aec20ad47ba2c49f0ca0ac61a7cd4822a30b90db53d`; önceki Faz 02 kaynağıyla aynıdır. Sapma kaynak sürümünden değil, uygulama yerleşiminden geliyordu. [PR #34](https://github.com/TerekliTahaBerk/atlas-research/pull/34) bu görünümü düzeltir. Aşağıdaki eski bölümler Faz 00 denetiminin tarihsel kaydıdır.

| Nokta | Referans / eski sapma | Düzeltme ve gözlem |
| --- | --- | --- |
| Sidebar | 240 px, proje seçici, katlanabilir bölümler ve küçük kaynak satırları; uygulamada büyük Atlas markası ve tüm proje/workspace listeleri vardı | Gerçek proje seçici, Project/Sources bölümleri, gerçek kaynak bağlantıları ve hesap menüsü. 1440 px QA: sidebar x=0, width=240. Kapat/aç, proje menüsü ve Cmd+K çalıştı. |
| Üst gezinme / kopya başlıklar | Tek 48 px bar; uygulamada ayrıca breadcrumb, sekmeler, eyebrow, başlık ve açıklama üst üste geliyordu | Tek toolbar; ek başlık katmanları kaldırıldı. Bar height=48. Üstteki pazarlama benzeri açıklama/eyebrow metinleri kaldırıldı; çalışan sayfa/eylem adları korundu. |
| Kütüphane | Kaynak HTML'de 196 px koleksiyon rail'i, 240×30 arama ve sık liste; eski uygulama büyük boşluk/kart/ikonlar ekliyordu | QA ölçümü: collections x=241/y=48/width=196; search x=457/y=56/240×30; ilk kaynak x=457/y=101/height=67. Segmented okuma filtresi, nötr seçili yüzey ve küçük hover/focus eylemi. |
| PDF okuyucu | Doğrudan gri canvas, 650 px kağıt, 320 px not paneli, altta sayfa kontrolü; uygulamada çerçeveli kart ve dört üst satır vardı | Kart/breadcrumb/başlık çerçevesi kaldırıldı. 650 px fit-width, 320 px notes rail, 36 px alt bar. Üstte arama, mevcut desteklenen vurgu renkleri ve zoom; sürüm/indirme küçük options menüsünde. Gerçek PDF'nin kendi tipografisi korunur. |
| Research | 760 px merkez alan, 26 px başlık, iki satırlı yuvarlatılmış araştırma girdisi | Aynı composer/başlık geometrisi. Gerçek Crossref metadata sonuçları devam eder; prototipin uydurma Answer/Compare yanıtı eklenmedi. |
| Home / tipografi | 30.5 px karşılama, kompakt filtreler, gerçek devam kartları, 132 px preview/220 px proje kartı | Eyebrow/açıklama kaldırıldı; aynı tipografi ve kart oranları; gerçek kaynak/projeler kullanılır. Grid/List ve sıralama gerçek UI davranışıdır. |
| Palet / ikon / dar ekran | Beyaz canvas, sıcak sidebar, ince Lucide çizgileri; ikincil panel dar alanda belgeyi sıkıştırmamalı | Aynı açık/koyu token ailesi, glyph yerine çizgi ikonlar. Küçük açık sidebar metni #706E68 ile 4.72:1 kontrasta düzeltilir. 390×900'de notes dialog'u; uygulama yatay taşması yok. |

Referans Home/Library/Research/Reader, yerel HTML runtime'ı ile açıldı ve 1440×1000 PNG'ler üzerinden `view_image` ile uygulamanın aynı ölçüdeki görüntüleri yan yana incelendi. Browser plugin bulunmadığı için yerelde repo'nun Playwright Chromium yolu kullanıldı. `typecheck`, `lint`, production build ve `node --import tsx scripts/test-integration.ts --library-browser` PASS: gerçek kaynak/PDF, mavi vurgu+not, yenileme/yeniden giriş, özel dosya erişim reddi, BibTeX/RIS, koleksiyon/etiket, proje seçici, sidebar, arama kısayolu, filtre, açık/koyu ve dar ekran. Framework/page/console hatası gözlenmedi. Son sentetik görsel kanıt oturumun geçici `atlas-library-browser-lr79PI` klasöründedir; repo'ya görsel veya PDF eklenmedi.

Kasıtlı ürün farkları: kaynak/proje adları ve sayıları gerçek veridir; uygulamada olmayan Notes/Tasks/AI/Chat/LaTeX/experiments/graph menüleri ve sahte sayaçlar eklenmez. Export, PDF sürümü/özel indirme ve editor/viewer izinleri için çalışan kontroller korunur. Home scope filtreleri mevcut veri modelindeki Personal/Shared ayrımını kullanır. Referanstaki simüle kağıt yerine gerçek dosya render edilir. Desteklenen highlight renkleri yellow/blue/green'dir; yeni schema rengi eklenmez. Bu kayıt tüm gelecek ürün ekranları için piksel eşitliği veya kapsamlı beta erişilebilirlik kabulü iddiası değildir.


Tarih: 9 Kasım 2026. Kaynak ve hash: [dondurulmuş kayıt](reference/README.md). Bu denetim uygulama testi değildir. Proje konuşmasındaki eski “tamamlandı/validated” ifadeleri kanıt alınmadı; çalışan sayfa ve indirilen HTML incelendi.

## Yöntem ve kapsam

Kullanıcının oturumundaki güncel Claude Design projesi açıldı, All project files listesinden Atlas.dc.html ve Atlas Handoff.md indirildi. İndirme event'i zaman aşımına uğrasa da güncel yerel dosyaların varlığı/boyutu/hash'i kontrol edildi. Eski indirmelerin HTML hash'leri güncel dosyayla farklıydı. Kamuya açık kopyada kişi/e-posta temizliği yapıldı; style/behavior satırları korunur.

Canlı sunumda Home → Research → Library → PDF Reader → Document → Tasks → Channels ve sağ Chat açıldı. Gerçek kullanıcılara davet, mesaj veya model isteği gönderilmedi. 1440×1000 Home ve Channels/AI; 1024×900, 768×900 ve 390×844 Channels/AI görsel olarak incelendi. 768 ve 390'da iframe içi viewport/main genişlikleri DOM'dan doğrulandı; resize sonrası son görünüm esas alındı. Geçici viewport override kapatıldı. Screenshot'lar yalnız oturumda incelendi, kişisel hesap çevresi repoya alınmadı.

## Kaynak hiyerarşisi ve çatışmalar

| Konu | Handoff | Güncel HTML / fiili sonuç | Karar |
| --- | --- | --- | --- |
| Açık tema | Sidebar #F2F1EB, canvas #FAF9F6, inset 10px/6px | #F7F6F3, #FFFFFF, sıfır canvas radius/margin; HTML 20, 103 | HTML geçerli |
| Accent | Eski yeşil anlatımı / mor değerler | Mavi #2F6FEB / #5B8DEF; HTML 18–20 | Yeni paletteki değerler |
| Sidebar | 216px / 30px nav | 240px / 32px nav; HTML 50, 56 | Ölçülmüş HTML |
| Tipografi | Editorial/serif açıklaması, 42px doc title | Sans stack, 32px doc title, 15.5/1.65 reading; HTML 17, 266, 272 | HTML; bağlı Classical meta talimatı ürün gereksinimi değil |
| AI | Çoklu compact/open/focus/panel, 380px | Bu varyantlar hâlâ kodda; panel 392px, dar eşik 1200px | Tek yüzey ürün kararı; eski çoklu modlar taşınmaz |
| Context | Ekrana göre varsayılan değişim | Uyarı var; `go()` ekran değişiminde aiCtx güncelliyor; 1874, 2108–2111 | Scope sabitlenir; yeni kapsam yeni konuşma |
| Sekmeler | Genel ekran davranışı | Ana ekranlarda ortak tabbar; Channels ayrı başlık kullanıyor | Beta S03–S12 ortak kabuk |
| Kalıcılık | Sample label / UI-only | Statik makale dizileri, sentetik AI yanıtları, localStorage tema/ekran | Üretim kanıtı yok |
| Kontrast paneli | Genel “validated” iddiaları | HTML 2276 eski palet çiftlerini hesaplıyor | Gerçek token kontrastı ayrı hesaplandı |

## Bulgular ve planlanan düzeltmeler

| ID | Kanıt / önem | Uygulama kararı / doğrulama fazı |
| --- | --- | --- |
| D01 | 1440'da Channels: global sidebar + local kanal listesi + thread + 392px AI; mesaj sütunu fazla dar, başlıklar çakışıyor | İkincil thread/AI karşılıklı açılır; local nav menüye dönüşür; 03/04 screenshot ve klavye kabulü |
| D02 | 1024'te panel scrim üstünde, main yeniden daralmıyor; 768'de 392px overlay; 390'da panel 374px | Davranış yönü korunur; tek overlay/focus trap/arka plan inert üretimde test edilecek; 01/04 |
| D03 | 768'de açık sidebar drawer AI arkasında kalabiliyor | Sidebar ile AI overlay aynı anda açık olmaz; 01/04 |
| D04 | Input/textarea outline:none, icon düğmelerde eksik anlamlı adlar, tab görünümleri div tabanlı; yalnız statik inceleme | Gerçek focus/label/tab semantics, ekran okuyucu kabulü; 01–04 |
| D05 | tx3/light sidebar 4.39:1; white/dark accent 3.23:1 normal metin sınırını geçmiyor | Etkilenen rol eşleşmesini değiştir ve yeniden ölç; 01 |
| D06 | `prefers-reduced-motion` kaynakta yok | Animasyon yerine anlık durum geçişi; pulse'suz status; 01 |
| D07 | Research'te sample synthesis/Compare methods, Channels @Atlas, doc presence/synced refs, manuscript/experiments var | Discovery liste/ekleme 02; AI 04; co-edit/compile/notebook beta dışında; sahte “saved/synced” taşınmaz |
| D08 | Hover eylemleri, drag/drop, context switching gerçek hizmete bağlı değil | Focus/touch karşılıkları ve sunucu hata durumları [SCREEN_MAP](../SCREEN_MAP.md) ile uygulanır |

## Kanıt sınıfları

**PASS:** güncel kaynağa erişim, iki dosyanın export'u ve hash kaydı; güncel HTML token çıkarımı; ana beta ekranlarına canlı gezinme; dört genişlikte belirtilen sınırlı görünüm incelemesi; seçili token kontrast hesapları; gizlilik temizliği.

**FAIL:** tüm ürün responsive/a11y onayına yeterli değildir: D01, D03–D06 bilinen açık bulgulardır. Bu, Faz 00 doküman tesliminin başarısız olduğu veya mevcut ürün testlerinin koştuğu anlamına gelmez.

**NOT RUN:** tüm ekran × genişlik × tema matrisi; koyu temanın canlı görsel QA'sı; tam klavye/focus/ekran okuyucu testi; auth/davet/gerçek upload; kalıcı kayıt/işbirliği; gerçek AI; bağımlılıklarla offline snapshot çalıştırma. Bu testler ilgili fazın kabul kapısından kaldırılmadı.

Faz 00 tasarım teslimi ölçümler ve dürüst açık bulgularla tamamlanır. Piksel eşliği, tüm ekranların kusursuzluğu ve uygulama erişilebilirlik uyumu iddia edilmez.
