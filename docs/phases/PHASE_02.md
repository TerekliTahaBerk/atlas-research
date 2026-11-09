# Faz 02 — Keşif, kaynak kütüphanesi ve okuma

Durum: plan; uygulanmadı.

## Amaç

Gerçek kaynağın eklenmesi, özel PDF sürümünün okunması ve anchored notun sonraki oturumda aynı konumdan açılması.

## Kapsam

S06–S09 ve kaynak export S17; akademik metadata arama, DOI/link/elle/PDF ekleme, Source/SourceVersion, private files, collections/tags/kullanıcı okuma durumu, PDF reader/annotation, BibTeX/RIS ve temel aynı-proje artifact linkleri.

## Kapsam dışı

AI sentezi/Compare methods cevabı, semantic map/graph, OCR doğruluğu garantisi, Zotero sync, doküman editor'ü, native LaTeX/notebook. Prototip arama cevapları gerçek bilimsel çıktı diye taşınmaz.

## Önkoşullar

G01 PASS; yetkili storage/backup planı ve mail/outbox yolu mevcut. Metadata sağlayıcısı resmi API/erişim koşulu/kota/lisans açısından araştırılır; gerçek endpoint/anahtar ihtiyacı bu fazda belirlenir. Kaynak fixture yalnız lisansı uygun/açık veya sentetiktir.

## Görevler ve PR dilimleri

| PR | Çıktı ve kabul | Bağımlılık |
| --- | --- | --- |
| P02-1 | Artifact registry, Source/Version, metadata provenance ve same-project FK; DOI/URL normalize/dedupe; manual add + tekrar giriş | G01 |
| P02-2 | Provider adapter ve PostgreSQL metadata/full-text arama; kaydetme, pagination, provider failure→manual alternatif; SSRF sınırları | P02-1; sağlayıcı resmi koşul incelemesi |
| P02-3 | Özel volume/proxy, UploadIntent/FileObject; type/size/hash/quota/staging/finalize; partial retry, cleanup ve private range | P02-1; ADR 0004 |
| P02-4 | Graphile patch pin/schema kontrollü migration, outbox dispatcher ve aynı koddan worker; extraction version/status, bounded retry/cancel/lease recovery | P02-3; gerçek parser güvenlik/kaynak incelemesi |
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

G02 PASS ve kaynak→okuma→not kanıtı gerçek kalıcılıkla teslim edilir; kritik file/access/data-loss sorunu yok. Faz 03'ün D1 yazı akışı için sürüm/citation locators hazırdır, editor henüz eklenmez.
