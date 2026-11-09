# Faz 00 — Ürün, tasarım ve mimari hazırlık

Durum: doküman paketi tamamlandı, PR incelemesine sunulacak. G00 gerçek sonuç kaydı [handoff](../PHASE_00_HANDOFF.md). Bu faz uygulama foundation'ı değildir.

## Amaç

Tek J1 araştırma yolunu kaynak, ekran, veri, yetki ve hata durumlarıyla uygulanabilir hale getirmek. Beta sınırını ve Faz 01–05 kanıt kapılarını netleştirmek.

## Kapsam

Ürün tanımı, akış/ekran haritası, güncel tasarım snapshot/audit/tokens, conceptual model, erişim/AI sözleşmesi, self-hosted mimari ADR'leri, Coolify/backup planı ve yerel doküman doğrulaması.

## Kapsam dışı

App scaffold/paket kurulumu, auth/DB schema/migration, gerçek PDF/AI, sunucu kaynakları, deploy, mevcut dış servis değişikliği, merge. Arşiv ve başka proje kodu kullanılmaz.

## Önkoşullar

[AGENTS](../../AGENTS.md), README, ROADMAP, RESTART, REFERENCE, ADR 0001 ve [yürütme promptu](../prompts/PHASE_00.md) okunur. Temiz/ilgili çalışma durumu doğrulanır; `feat/phase-00-foundation`, PR base `main`. Güncel referans yoksa yalnız kaynak gerektiren ölçümler pending kalır; bu çalışmada kaynak erişildi ve yayımlama izni alındı.

## Görevler ve bağımlılıklar

| Dilim | Teslim | Bağımlılık |
| --- | --- | --- |
| P00-1 | PRODUCT_SPEC, J1, scope/başarı ölçütleri | ROADMAP beta sınırı |
| P00-2 | USER_FLOWS/SCREEN_MAP; source snapshot ve DESIGN_SYSTEM/REFERENCE_AUDIT | P00-1 + güncel HTML; handoff çatışma incelemesi |
| P00-3 | ARCHITECTURE/DATA_MODEL/AUTHORIZATION/AI sözleşmesi ve ADR'ler | P00-1/2; resmi teknik kaynak kontrolü |
| P00-4 | COOLIFY_PLAN/VERIFICATION_PLAN; P00–P05; handoff ve yerel checker | P00-1–3 |
| P00-5 | Tutarlılık incelemesi, commit/push, main'e somut PR; merge yok | G00 ve diff kontrolü |

## Test ve kabul kriterleri — G00

- [J1](../USER_FLOWS.md) kayıt→proje→kaynak→reader→doküman→görev→tartışma→AI yolunun her adımını ekran/veri/izin/hata/fazla eşler; eksik prototip adımı gizlenmez.
- Source provenance ve hash var; eski handoff'tan yanlış renk/ölçü devralınmaz; responsive/a11y bulguları ve koşulmayan testler açık.
- Workspace admin özel içeriğe erişimi, server+RLS stratejisi, runtime/migration ayrımı, iki ekip/iptal testleri tutarlı.
- Self-hosted auth/file/job/realtime kararı, DB+file recovery ve paid Actions olmadan gate planı uygulanabilir; kaynak oluşturulmuş iddiası yok.
- G01–G05 açık ve PR dilimlerine ayrılmış; source/annotation/citation ID'leri sürüme bağlı ve aynı-proje kısıtları korunmuş.
- `python3 scripts/verify_phase00.py`, `git diff --check` ve manuel çapraz okuma sonuçları gerçek durumla raporlu.

## Bitiş koşulları

G00 PASS, bilinen tasarım/operasyon açıkları owner ve ilgili phase gate ile kaydedilmiş, branch push ve main PR'ı gerçekten gözlenmiş olur. Otomatik merge yapılmaz; Faz 01 için yeni kullanıcı talimatı beklenir.
