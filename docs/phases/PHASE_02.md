# Faz 02 — Keşif, kaynak kütüphanesi ve okuma

Durum: uygulama çalışması sürüyor; güncel kısa doğrulama ve dağıtım kaydı [Faz 02 tesliminde](../PHASE_02_HANDOFF.md). Aşağıdaki geniş matris tarihsel beta hedefidir.

9 Kasım 2026 kullanıcı kararı bu belgedeki eski G01 PASS ve her dilimde kapsamlı kabul önkoşulunu değiştirir: G01/G02'nin kapsamlı denetimleri [beta öncesi listeye](../BETA_REVIEW_BACKLOG.md) ertelenmiştir. Faz 02, mevcut hesap/projeleri koruyarak çalışan kaynak→PDF→kalıcı not yolculuğunu, son sürümde typecheck/lint/build ve kısa kritik veri/dosya erişimi kontrolleriyle teslim eder. E-posta ve S3 kapalı kalır. Aşağıdaki kapsamlı matris tarihsel hedef olarak korunur; yapılmamış kontroller PASS sayılmaz.

## Amaç

Gerçek kaynağın eklenmesi, özel PDF sürümünün okunması ve anchored notun sonraki oturumda aynı konumdan açılması.

## Kapsam

S06–S09 ve kaynak export S17; akademik metadata arama, DOI/link/elle/PDF ekleme, Source/SourceVersion, private files, collections/tags/kullanıcı okuma durumu, PDF reader/annotation, BibTeX/RIS ve temel aynı-proje artifact linkleri.

## Kapsam dışı

AI sentezi/Compare methods cevabı, semantic map/graph, OCR doğruluğu garantisi, Zotero sync, doküman editor'ü, native LaTeX/notebook. Prototip arama cevapları gerçek bilimsel çıktı diye taşınmaz.

## Önkoşullar

Güncel kullanıcı talimatı kapsamında mevcut hesap/proje temeli ve yetkili özel storage yolu yeterlidir. G01 PASS ve bağımsız backup tamamlanması bu fazın giriş koşulu değildir. Metadata sağlayıcısı resmi API/erişim koşulu/kota/lisans açısından araştırılır; gerçek endpoint/anahtar ihtiyacı bu fazda belirlenir. Kaynak fixture yalnız lisansı uygun/açık veya sentetiktir.

## Görevler ve PR dilimleri

| PR | Çıktı ve kabul | Bağımlılık |
| --- | --- | --- |
| P02-1 | Artifact registry, Source/Version, metadata provenance ve same-project FK; DOI/URL normalize/dedupe; manual add + tekrar giriş | G01 |
| P02-2 | Provider adapter ve PostgreSQL metadata/full-text arama; kaydetme, pagination, provider failure→manual alternatif; SSRF sınırları | P02-1; sağlayıcı resmi koşul incelemesi |
| P02-3 | Özel volume/proxy, UploadIntent/FileObject; type/size/hash/quota/staging/finalize; partial retry, cleanup ve private range | P02-1; ADR 0004 |
| P02-4 | ADR 0004 yeniden değerlendirmesi: mevcut PostgreSQL lease kuyruğu ve aynı koddan worker; extraction version/status, bounded retry/cancel/lease recovery | P02-3; gerçek parser güvenlik/kaynak incelemesi |
| P02-5 | S07/S09 reader/page/text layer/zoom; annotation quote/page/rect/offset; collection/tag/reading state, reload/old-version/orphan davranışı | P02-2–4 |
| P02-6 | BibTeX/RIS export/manifest, source-version deep links; job revoke ve DB+files restore testi; dört genişlik/a11y regresyon | P02-1–5 |

## Test ve kabul kriterleri — G02

- J1.4–J1.6 gerçek metadata/PDF üzerinde tamamlanır; aynı source yeni dosyada yeni immutable version alır. Eski annotation sürümü değişmez.
- Reload/login sonrasında library, kullanıcı reading state, PDF page ve annotation kimliği/konumu aynı; text seçilemeyince elle sayfa notu ve açık sınırlama vardır.
- Bozuk/yanlış MIME/oversize/kesilmiş/şifreli PDF veya parser timeout güvenli hata ve retry verir; ready olmayan sürüm AI-ready gibi görünmez. Kaynak limitleri ölçülüp sabitlenir.
- V okur/export alır ama annotation yazamaz; C/D kaynak sayısı/snippet/PDF/range/export bile göremez. A05–A09/A12–A13 yeni resource'larda ve ham runtime SQL'de PASS.
- B job kuyruğundayken/çalışırken çıkarılırsa result/download deny; queue duplicate ve restart iki source version veya iki ücretli yan etki üretmez.
- En az bir gerçek tutarlı DB+files set'i disposable ortamda restore edilip file hash/anchor FK doğrulanır. BibTeX/RIS gerçek kaydı temsil eder; sahte citation üretilmez.
- S06–S09 normal/empty/loading/error için responsive/keyboard/contrast; PDF Notes ve AI placeholder alanı sıkıştırmaz; AI henüz canlı değildir.

## Bitiş koşulları

Güncel kullanıcı kararı: build ve kısa kaynak→okuma→not kanıtı gerçek kalıcılıkla teslim edilir; geniş G02 beta listesinde açık kalır; kritik file/access/data-loss sorunu yok. Faz 03'ün D1 yazı akışı için sürüm/citation locators hazırdır, editor henüz eklenmez.
