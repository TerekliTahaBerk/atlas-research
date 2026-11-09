# Atlas ürün tanımı — Faz 00

Durum: 9 Kasım 2026 tarihli uygulama öncesi tasarım kararı. Çalışan ürün veya kullanıcı araştırması sonucu değildir. Faz sınırlarının yetkili kaynağı [ROADMAP](ROADMAP.md); erişimin tek kaynağı [AUTHORIZATION](AUTHORIZATION.md).

## Problem ve kullanıcılar

Araştırmacı bir makaleyi okurken aldığı notu, yazdığı iddiayı ve ekipteki takip işini farklı araçlarda tutuyor. Bir iddianın hangi makale sürümüne, sayfaya ve tartışmaya dayandığı kayboluyor. Atlas'ın değeri bu ilişkileri kalıcı ve erişime duyarlı bağlantılarla korumaktır.

Birincil kullanıcılar bağımsız araştırmacı, yüksek lisans/doktora öğrencisi ve 2–10 kişilik araştırma ekibidir. Üniversite e-postası veya kurum üyeliği zorunlu değildir. Ekip yöneticisi, proje yöneticisi ve araştırmacı aynı kişi olabilir; rolleri ürün içinde ayrı değerlendirilir.

Temel işler: araştırma sorusu için proje açmak; kaynak bulup eklemek; kaynağa geri dönülebilen not çıkarmak; notlardan matematik içeren doküman yazmak; takip işini bir kişiye atamak; iddiayı kaynaklarıyla tartışmak; yalnızca izinli kaynaklardan kanıtlı AI yanıtı almak.

## Kararların kökeni

| Tür | Karar |
| --- | --- |
| Kullanıcı tarafından belirlenmiş | Bağlantılı araştırma akışı, bireysel ve küçük ekip odağı, üniversitesiz hesap, beta kapsamı, Faz 05 kapalı beta sınırı |
| Kullanıcı tarafından belirlenmiş | Güncel Atlas.dc.html görsel hedefi; Docker/Coolify, self-hosted PostgreSQL, planlanan Next.js/React/TypeScript ve Prisma |
| Faz 00 değerlendirmesi | Özel projeye workspace yöneticiliğiyle otomatik içerik erişimi verilmemesi; açık proje üyeliği |
| Faz 00 değerlendirmesi | Dokümanda iyimser sürüm kontrolü; beta içinde eşzamanlı ortak düzenleme yok |
| Faz 00 değerlendirmesi | Tek AI paneli, proje ile sabitlenmiş konuşma ve açık kaynak seçimi; kişiye özel AI konuşmaları |
| Doğrulanacak hipotez | Aşağıdaki hedefler, pilot sayısı ve kaynak bütçeleri; bunlar ölçülmüş başarı değildir |

## Ürün ilkeleri

1. Her atıf kaynağa ve sürüme döner; başlık veya sayfa numarası tek başına kimlik değildir.
2. Bir bağlantı, atıf, bildirim veya iş kuyruğu erişim sağlamaz. Sunucu her kullanımda yeniden denetler.
3. Kaydetme, işleme ve AI durumları açık görünür. Sunucu kabulü olmadan “kaydedildi” denmez.
4. AI önerisi inceleme ve kullanıcı eylemiyle uygulanır. Yetersiz kanıt normal bir sonuçtur.
5. Kişisel çalışma tam bir kullanım biçimidir; ekip kurma zorunlu onboarding adımı değildir.
6. Klavye, dar ekran, açık/koyu tema ve geri kazanılabilir hatalar ilk uygulamadan itibaren kabul şartıdır.

## Beta kapsam matrisi

| Alan | Beta içinde | Beta dışında | İlk faz |
| --- | --- | --- | --- |
| Kimlik | E-posta/parola, doğrulama/sıfırlama, oturum iptali | Üniversite SSO, kurum yönetimi | 01 |
| Çalışma alanı | Kişisel/paylaşılan workspace, proje, davet, proje rolleri | Kurumsal hiyerarşi, herkese açık proje yayını | 01 |
| Kaynak | Temel akademik arama, DOI/link/elle metadata, PDF, koleksiyon/tag/okuma durumu | Geniş Zotero senkronizasyonu, garantili tam metin erişimi | 02 |
| Okuma | PDF sayfa/konum, vurgu/not, sürüm bağı, BibTeX/RIS kaynak export | OCR garantisi, taranmış belgenin otomatik doğru okunması | 02 |
| Yazı | Matematik gösterimi, kaynak atfı, otomatik kayıt, geçmiş/geri alma, Markdown doküman export | Yerel LaTeX derleme, manuskript build/senkronizasyonu, canlı co-editing | 03 |
| Takip/iletişim | Basit görev listesi/panosu, atama, proje tartışması/thread, uygulama içi bildirim | Kapsamlı chat/DM, ses/video | 03 |
| AI | Seçili sürümlerden yanıt, tıklanabilir kanıt, gözden geçirilen öneri, kota | Otonom ajan, kendiliğinden düzenleme/iş çalıştırma | 04 |
| İlişki | Aynı projede kaynak/not/doküman/görev/thread/atıf bağlantıları | Gelişmiş semantik harita ve graph arayüzü, proje dışı bağlantı | 02–04 |
| Deney | Araştırma işini görev olarak takip | Python/notebook, veri kümesi yürütme | Beta sonrası |

Prototipteki fiyatlandırma, ödeme, “compiled”, “ran”, ortak düzenleme ve AI cevapları demo sunumudur. Beta ürünü bunları çalışır işlev gibi göstermeyecek. Sonraki sürümler [ROADMAP](ROADMAP.md) içindedir.

## İlk araştırma senaryosu J1

Tamamen kurgusal araştırmacı A, uzun protein dizilerinde attention bellek maliyeti üzerine literatür notu hazırlıyor. Kayıtta kişisel workspace W0 oluşur. Tek başına kalan kullanıcı P0 kişisel projesinde aynı kaynak→yazı yolunu izler.

Ekip dalında A ayrıca paylaşılan W1'i ve yalnızca açık üyeliğe sahip özel P1 “Sparse Evoformer” projesini açar; araştırmacı B'yi P1'e editor olarak davet eder. B daveti doğrulanmış kendi hesabıyla kabul eder. A iki makaleyi keşfeder/ekler, izinli PDF sürümlerini yükler, bir sayfada bellek ölçümünün koşulunu işaretler. Bundan “Related work” dokümanında atıflı bir paragraf ve matematik ifadesi üretir. B'ye “batch koşullarını karşılaştır” görevi atanır; kaynak ve paragraf aynı tartışma thread'ine bağlanır. A seçili iki sürümle AI'ya farkları sorar, kanıtları açıp öneriyi inceleyerek dokümana uygular. B bir sonraki oturumda aynı bağlara döner. Deney yürütmek senaryonun parçası değildir.

Bu senaryodaki makaleler, sayılar ve kullanıcılar demo fixture'dır; bilimsel kanıt değildir. Uygulama verisi repoya alınmaz. Gerçek makale değerlendirmesi [AI sözleşmesindeki](AI_AND_SOURCE_CONTRACT.md) ayrı çalışmadır. J1'in her adımı [USER_FLOWS](USER_FLOWS.md) ve [SCREEN_MAP](SCREEN_MAP.md) içinde izlenir.

## Başarı ölçütleri ve ölçüm

Hedefler pilot başlamadan ürün sahibi tarafından yeniden değerlendirilecek. 5–10 araştırmacı ve en az iki küçük ekip pilot hipotezidir; henüz katılımcı yok.

| Kimlik | Tanım ve payda | İlk hedef | Ölçüm yöntemi/faz |
| --- | --- | --- | --- |
| M1 Aktivasyon | İlk proje oluşturan yeni kullanıcılardan 7 gün içinde kaynak + annotation + atıflı doküman oluşturanlar / tüm ilk proje oluşturanlar | ≥%60 | İçeriksiz sunucu olayları; 03–05 |
| M2 J1 tamamlama | Moderasyonlu oturumda kaynak→doküman→görev→thread bağlarını yardımsız tamamlayanlar / başlayanlar | ≥%80 | Görev gözlem formu, takılma nedeni; 05 |
| M3 Bağ doğruluğu | Açılan atıflardan doğru sürüm ve konuma gidenler / değerlendirilen atıflar | %100 test seti | Otomatik konum + insan destek kontrolü; 02–04 |
| M4 Geri dönüş | Aktive pilotlardan sonraki 7 günlük dönemde en az bir araştırma işlemi yapanlar / aktive pilotlar | ≥%50 | Login değil; annotation/doc/task olayı; 05 |
| M5 Kayıt güvenilirliği | Sunucu tarafından kabul edilmiş düzenlemelerden yeniden yüklemede kaybolanlar | 0 | Sürüm/çatışma ve kesinti testleri; 03 |
| M6 İzolasyon | İzin dışı içeriğe erişen negatif testler | 0 | [Yetki test matrisi](AUTHORIZATION.md); 01–05 |
| M7 Kanıtlı AI | Yanıtlanan gerçek makale sorularında doğru konum ve destek ayrı ayrı değerlendirilir | [AI kabul kapısı](AI_AND_SOURCE_CONTRACT.md) | Çevrimdışı rubric, 04 |

Olaylarda içerik, alıntı, doküman başlığı, e-posta veya provider cevabı toplanmaz. Yalnız olay türü, iç kullanıcı/proje kimliği, zaman, başarı/hata sınıfı tutulur; analitik erişimi ayrıca kısıtlanır. Küçük pilot yüzdeleri ham katılımcı sayısıyla raporlanır. Faz 00'da ölçüm sistemi kurulmadı.
