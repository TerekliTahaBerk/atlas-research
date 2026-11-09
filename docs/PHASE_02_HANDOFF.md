# Faz 02 teslim kaydı

Durum: uygulama ve kısa yerel doğrulama tamamlandı; PR birleştirme ve canlı dağıtım/doğrulama henüz bekliyor. Geniş G01/G02 kabulü [beta öncesi listede](BETA_REVIEW_BACKLOG.md) açık kalır. Faz 03 uygulanmadı.

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
| Canlı kısa yolculuk | NOT RUN — dağıtım sonrası ayrıca kaydedilecek; yerel test canlı kabulü yerine geçmez |

Browser plugin mevcut olmadığı için repo'nun Playwright Chromium yöntemi kullanıldı. Yerel görsel kanıt geçici `atlas-library-browser-coBC1m` dizinindedir; özel veri veya PDF repository'ye eklenmedi. Kullanılan kamu makalesi: Head et al. (2015), [The Extent and Consequences of P-Hacking in Science](https://doi.org/10.1371/journal.pbio.1002106), PLOS Biology, CC BY. Geçici test notları kontrol verisidir; kullanıcının araştırma verisi değildir. Kontrollü yerel SMTP, gerçek e-posta teslimi sayılmaz.

## Teslim ve operasyon

- Branch: `feat/phase-02-research-library`; PR/main squash ve canlı SHA dağıtım tamamlanınca kaydedilecek.
- Önceki PR [#31](https://github.com/TerekliTahaBerk/atlas-research/pull/31), kısa kontrollerle `8c9f6d5c7d393fdcc31c903fedebd6c901f31fd8` olarak birleştirildi; G01 kapanmış sayılmadı.
- Mevcut [Atlas canlı adresi](https://om2lefhyk80lxthwkqe2qi3f.91.99.118.96.sslip.io). Coolify yula.co / production / Atlas Research uygulaması kullanılacak. PostgreSQL volume'u/kimlik sırları/hesap ve projeler korunacak; yalnız yeni Atlas özel dosya volume'u ve files service ekleniyor.
- [Uygulama kaydı](implementation/P02.md), [güncel operasyon runbook'u](operations/COOLIFY_RUNBOOK.md), [ADR 0004 yeniden değerlendirmesi](decisions/0004-files-jobs-and-realtime.md).

## Sınırlamalar ve açık kabul

E-posta, S3 ve bağımsız DB+PDF yedek/geri dönüş kapalı/ertelenmiş. Çoklu sağlayıcı, OCR, AI, doküman editörü, görev ve tartışma yok. Crossref kamu kotası paylaşımlıdır; sağlayıcı hatasında elle ekleme devam eder. DOI dışındaki makale bağlantıları elle metadata ile saklanır, rastgele URL'den sunucu PDF indirmez. PDF işleme en çok 500 sayfa/2 MB çıkarılmış metin çıktısı destekler; bozuk/şifreli dosyada durum ve yeni sürümle kurtarma yolu vardır. İmza/hash kontrolü zararlı PDF güvenlik taraması değildir.

Geniş canlı ekip/iptal/cookie/header/image/DB limit/rollback denetimleri, kötü niyetli PDF corpus, yük, tüm tarayıcı/a11y ve tutarlı bağımsız DB+files restore beta öncesinde açık kalır. Link ile DB commit'i arasındaki process crash erişilemeyen final orphan bırakabilir; otomatik final silme yerine reconciliation beta listesine kaydedildi. 005 öncesi image'lar güncel readiness revision'ıyla doğrulanmış rollback adayı değildir.

Faz 03 bağlantıları hazır: Source/SourceVersion/Annotation artifact UUID'leri, aynı-proje FK'ler ve `version/page/annotation` deep link'leri. Sonraki fazda kaynak konumuna citation kurulabilir; bu teslimde editör geliştirilmedi.
