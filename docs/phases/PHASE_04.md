# Faz 04 — Kaynaklı AI ve incelenen öneriler

Durum: kullanıcı Faz 04 uygulaması ve mevcut Coolify’a dağıtımı yetkilendirdi. Mevcut anahtarını kendisi Coolify’a ekleyecek; bütçe seçilmedi ve ücretli model çağrıları açıkça yasaklandı. Uygulama kapalı çağrı kapısıyla hazırlanıyor; gerçek model eval/G04 OPEN. [Teslim kaydı](../PHASE_04_HANDOFF.md), [ADR](../decisions/0006-grounded-ai.md).

## Amaç

Seçili izinli kaynaklardan kanıtlı yanıt; doğru sürüm/konuma tıklama ve kullanıcı incelemesiyle dokümana öneri uygulama.

## Kapsam

S14/S17 ve J1.10–J1.11, private project-bound conversation, immutable evidence scope, PostgreSQL retrieval, citation/provenance doğrulama, insufficient evidence, proposal diff/apply, usage reservation/limit/cancel ve gerçek makale eval.

## Kapsam dışı

Otonom tool/ajan, otomatik doküman yazımı, başka workspace retrieval, yetki bypass, model eğitimi, garanti bilimsel doğruluk, varsayılan vector altyapısı ve tam chat ürünü.

## Önkoşullar

G03 kapsamlı kabulü önceki kullanıcı kararıyla beta öncesine ertelendi; Faz 04 geliştirmesine yeni talimat verildi. Bu erteleme G03 PASS anlamına gelmez. [AI_AND_SOURCE_CONTRACT](../AI_AND_SOURCE_CONTRACT.md) ve D01–D06 açıklarının ilgili UI kısmı çözülmüş. Gerçek provider/model/maliyet/bölge/veri koşulları resmi kaynaklarla bu fazda değerlendirilir; workspace dış paylaşım politikası ve kullanıcı onayı, yasal erişimli eval kaynakları, bütçe ve credential güvenliği hazır olmadan çağrı açılmaz.

## Görevler ve PR dilimleri

| PR | Çıktı ve kabul | Bağımlılık |
| --- | --- | --- |
| P04-1 | Model/provider adapter ve resmi koşul kararı; AIConversation/Scope/Message/Usage, kapalı varsayılan paylaşım politikası, budget/idempotency ve job lifecycle | G03; somut provider/bütçe kararı |
| P04-2 | Metadata/full-text→excerpt retrieval, SourceVersion locators/provenance; permission-before-search, dispatch öncesi recheck; gerekirse ölçümlü pgvector ADR | P04-1; gerçek evidence seti |
| P04-3 | Buffered yanıt, citation ID/locator validation, support değerlendirme yolu, insufficient/error/cancel/retry; private logs | P04-2 |
| P04-4 | Tek panel/sheet, sabit proje/scope ve context-switch modeli; clickable evidence; proposal diff + expected revision + explicit apply/undo | P04-1–3 |
| P04-5 | ≥10 gerçek makale/≥40 soru + ≥50 locator eval; A01–A13 AI/revocation yarışları, quota/timeout/injection, usability | P04-1–4 |

## Test ve kabul kriterleri — G04

- J1.10/J1.11 gerçek model ve izinli kaynaklarla tamamlanır; konum doğruluğu ve iddia desteği ayrı raporlanır. [Sözleşmedeki](../AI_AND_SOURCE_CONTRACT.md) tüm sayısal eval eşikleri korunur.
- Sunulan atıfların %100'ü seçili izinli sürüm ve çözülür konumdadır; claim support ≥%90, yetersiz/çelişkili 10 vakanın ≥9'unda uygun sınır/abstention, negatif access/injection vakasında 0 sızıntı/eylem.
- Viewer kendi AI sorgusunu yapabilir, doc apply yapamaz. Owner dahil kimse başkasının private conversation geçmişini otomatik okuyamaz.
- Ekran değişimi scope'u değiştirmez, proje değişimi konuşmayı kapatır. Provider'a gönderilen kapsam görülebilir; kapalı politika hiçbir metin göndermez.
- Proposal kullanıcı apply'ı, editor yetkisi ve güncel revision olmadan kalıcı yazı üretmez. Kaynak revocation veya stale target conflict güvenli durur.
- Kuyruk/dispatch/result/delivery iptal kontrolleri, duplicate request tek rezervasyon, belirsiz provider timeout maliyeti ve bounded retry kanıtlıdır.
- Input/PDF prompt injection araç komutuna dönüşmez; log/fixture'da özel PDF/provider response/anahtar yok. İlgili responsive/a11y matrisi PASS.

## Bitiş koşulları

G04 eval ve güvenlik kanıtıyla PASS. Kritik atıf/access kusuru ortalama skorla gizlenmez. Faz 05 pilotuna hazır sürüm belirlenir; henüz kapalı beta tamamlandı/release oldu denmez.
