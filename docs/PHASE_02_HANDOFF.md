# Faz 02 teslim kaydı

Durum: Faz 02 çalışan yolculuğu tamamlandı, PR #32 squash merge edildi ve mevcut Coolify Atlas uygulamasına dağıtıldı. Kısa gerçek-makale akışı hem yerelde hem canlıda doğrulandı. Geniş G01/G02 kabulü [beta öncesi listede](BETA_REVIEW_BACKLOG.md) açık kalır. Faz 03 uygulanmadı.

## Çalışan özellikler

- Crossref gerçek arama, sayfalama, detay ve kütüphaneye kaydetme; DOI lookup, makale bağlantısı, elle metadata/PDF ekleme ve DOI/URL tekrarı önleme.
- Proje kütüphanesi arama, koleksiyon/etiket filtreleri, kişisel okuma durumu ve düzenlenebilir bibliyografik alanlar. PDF olmadan metadata kaydı kullanılabilir.
- Kalıcı özel volume; 25 MiB dosya/250 MiB proje sınırı, staging/hash/idempotence, yetkili HEAD/range ve bounded PostgreSQL PDF işçisi.
- Gerçek PDF.js canvas/metin katmanı, sayfa/zoom/metin arama, sürüme bağlı vurgular/sayfa notları, nottan sayfaya dönüş ve kişisel son sayfa/zoom/scroll kaydı.
- Değişmez PDF sürümleri; eski sürüm/not korunması; gerçek metadata'dan BibTeX/RIS. Viewer okur/export alır/kendi okuma durumunu değiştirir, ortak kaynak/not yazamaz.
- Mevcut Atlas sidebar/proje ekranına Research ve Library bağlantıları; dar ekranda açılır not paneli. Yeni tasarım ZIP'indeki Atlas HTML esas alındı; gelecekteki AI/modüller eklenmedi.

## Kısa doğrulama — 9 Kasım 2026

| Kontrol | Gözlenen sonuç |
| --- | --- |
| Typecheck, lint, production build | PASS; yeni route'lar ve derlenen files worker dahil |
| `npm test` | 6 mevcut unit kontrolü PASS; Docker build'in mevcut korumaları korunuyor |
| `npm run test:library` | PASS; geçici PostgreSQL 18.6, gerçek ayrı roller/RLS, duplicate, özel/range dosya, viewer yazma reddi/kişisel okuma, worker, immutable eski sürüm/anchor ve export |
| `npm run verify:compose` | PASS; gerçek DB'ye bağlanmadan Coolify global env-file enjeksiyonunda altı süreç credential ayrımı |
| `node --import tsx scripts/test-integration.ts --library-browser` | PASS; production build + geçici DB/yerel kontrollü SMTP, gerçek Crossref araması ve açık lisanslı PDF; masaüstü 1440×1000, dar 390×900 |
| Tarayıcı ana yolculuğu | Gerçek makale kaydetme/aynı DOI ikinci kayıt oluşturmama → PDF yükleme/render/metin seçimi → vurgu+açıklama ve sayfa notu → yenileme/yeniden girişte iki not, sayfa 2, zoom 125% → range 206, anonim 401, yanlış proje 404 → BibTeX/RIS DOI → etiket/koleksiyon → dar okuyucu/not dialog'u PASS |
| Render sağlığı | Doğru başlık/route ve dolu içerik, framework overlay/page/console error yok; ekran görüntüleri incelendi; iki genişlikte sayfa taşması yok |
| Canlı kısa yolculuk | PASS; mevcut hesapla ayrı kontrollü proje → gerçek Crossref/PLOS makalesi → PDF yükleme/render → seçili metin vurgusu+açıklama → PDF içi aramayla sayfa 2 → sayfa notu → yenileme/çıkış/yeniden girişte iki annotation, sayfa 2 ve 125% zoom |
| Canlı ek kısa kontroller | DOI büyük/küçük harf tekrarı aynı kayda döndü; kütüphanede tek kaynak kaldı. BibTeX/RIS gerçek DOI içeriyor. Methods koleksiyonu/verification etiketi kaydedildi. Anonim range 401; mevcut oturumda farklı proje scope'uyla dosya yolu UNAVAILABLE. Files worker: 15 sayfa / ready. |
| Canlı render | Chrome 1920×873 ve 390×900; dolu doğru route/başlık, PDF canvas/metin ve dar Notes dialog'u çalıştı; sayfa yatay taşması yok, ilgili app console/page error gözlenmedi; viewport override geri alındı |
| Atlas-only yeniden dağıtım | PASS; aynı commit yeni container'lara alındıktan sonra PDF yeniden render edildi, iki annotation ve sayfa 2 korundu. Bu kısa kontrol bağımsız restore veya kapsamlı rollback denetimi değildir. |

Browser plugin mevcut olmadığı için repo'nun Playwright Chromium yöntemi kullanıldı. Yerel görsel kanıt geçici `atlas-library-browser-coBC1m` dizinindedir; özel veri veya PDF repository'ye eklenmedi. Kullanılan kamu makalesi: Head et al. (2015), [The Extent and Consequences of P-Hacking in Science](https://doi.org/10.1371/journal.pbio.1002106), PLOS Biology, CC BY. Geçici test notları kontrol verisidir; kullanıcının araştırma verisi değildir. Kontrollü yerel SMTP, gerçek e-posta teslimi sayılmaz.

## Teslim ve operasyon

- Branch: `feat/phase-02-research-library`; [işlevsel PR #32](https://github.com/TerekliTahaBerk/atlas-research/pull/32) normal squash merge edildi. Canlı uygulama commit'i: [`d18681952936869d29f46521588ac0df8ac9e725`](https://github.com/TerekliTahaBerk/atlas-research/commit/d18681952936869d29f46521588ac0df8ac9e725). Sonraki belge PR'ı uygulama image'ını değiştirmez.
- HTTPS `/health/ready`: 200 / ready, release tam olarak yukarıdaki SHA, schema `202611090005_library`. Bu uygulama sürümü/readiness kanıtıdır; gerçek image ID/digest denetimi değildir.
- Coolify ilk dağıtım `2ttiizjkjd35i0s8heyx50ig`: 2026-11-09 13:47:19 UTC başlangıç, 1m38s / Success. Aynı-sürüm kalıcılık dağıtımı `rwrazmmnxw3l7yerswyyci5q`: 13:53:37 UTC başlangıç, Success; sonrasında PDF/notlar tekrar gözlendi.
- Önceki PR [#31](https://github.com/TerekliTahaBerk/atlas-research/pull/31), kısa kontrollerle `8c9f6d5c7d393fdcc31c903fedebd6c901f31fd8` olarak birleştirildi; G01 kapanmış sayılmadı.
- Mevcut [Atlas canlı adresi](https://om2lefhyk80lxthwkqe2qi3f.91.99.118.96.sslip.io). Coolify yula.co / production / Atlas Research uygulaması kullanıldı. Eski `lcj5rqwtuautouw34e5ldhva_atlas-postgres` mount'u `/var/lib/postgresql` olarak korundu; yeni `lcj5rqwtuautouw34e5ldhva_atlas-private-files` mount'u `/data/atlas-files`. Mevcut hesap/oturum ve önceden var olan proje erişimi korundu. Sunucu, proxy ve diğer kaynakların ayarları değiştirilmedi. MAIL_DELIVERY=disabled; S3/SMTP etkinleştirilmedi. Build args Dockerfile'da manuel, deploy manuel ve cross-resource network kapalı kaldı.
- [Uygulama kaydı](implementation/P02.md), [güncel operasyon runbook'u](operations/COOLIFY_RUNBOOK.md), [ADR 0004 yeniden değerlendirmesi](decisions/0004-files-jobs-and-realtime.md).

## Sınırlamalar ve açık kabul

E-posta, S3 ve bağımsız DB+PDF yedek/geri dönüş kapalı/ertelenmiş. Çoklu sağlayıcı, OCR, AI, doküman editörü, görev ve tartışma yok. Crossref kamu kotası paylaşımlıdır; sağlayıcı hatasında elle ekleme devam eder. DOI dışındaki makale bağlantıları elle metadata ile saklanır, rastgele URL'den sunucu PDF indirmez. PDF işleme en çok 500 sayfa/2 MB çıkarılmış metin çıktısı destekler; bozuk/şifreli dosyada durum ve yeni sürümle kurtarma yolu vardır. İmza/hash kontrolü zararlı PDF güvenlik taraması değildir.

Geniş canlı ekip/iptal/cookie/header/image/DB limit/rollback denetimleri, kötü niyetli PDF corpus, yük, tüm tarayıcı/a11y ve tutarlı bağımsız DB+files restore beta öncesinde açık kalır. Link ile DB commit'i arasındaki process crash erişilemeyen final orphan bırakabilir; otomatik final silme yerine reconciliation beta listesine kaydedildi. 005 öncesi image'lar güncel readiness revision'ıyla doğrulanmış rollback adayı değildir.

Faz 03 bağlantıları hazır: Source/SourceVersion/Annotation artifact UUID'leri, aynı-proje FK'ler ve `version/page/annotation` deep link'leri. Sonraki fazda kaynak konumuna citation kurulabilir; bu teslimde editör geliştirilmedi.
