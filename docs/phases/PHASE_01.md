# Faz 01 — Kimlik, workspace, proje ve ilk dağıtım

9 Kasım 2026 sonraki kullanıcı kararı: açık G01 denetimleri [beta öncesine ertelendi](../BETA_REVIEW_BACKLOG.md); Faz 02'yi engellemez. Kısa kontrolleri geçen PR #31'in birleştirilmesi tam canlı kabul anlamına gelmez. Aşağıdaki geçmiş kabul hedefleri ve kanıt durumu değiştirilmez.

Durum: kullanıcı talimatıyla P01-1–4 uygulanıp birleştirildi; P01-5 için yerel doğrulamalar ve yula.co içindeki canlı önizleme hazır. İlk hesap/giriş, readiness, rol ayrımı ve yeniden başlatma doğrulandı. E-posta, bağımsız yedek ve tam canlı kabul ertelenmiş durumda. [Faz 01 handoff](../PHASE_01_HANDOFF.md); G01 açık.

## Amaç

Gerçek iki araştırmacının aynı projede çalışabilmesi ve iki ilgisiz ekibin birbirinin verisini okuyamaması. İlk Coolify deployment'ı yalnız bu fazdaki açık hedef ve yetkiyle yapılır.

## Kapsam

Exact toolchain, monolit kabuğu, auth/session, kişisel/shared workspace, açık project membership, davet/iptal, RLS ve runtime/migrator ayrımı, temel S01–S05/S15/S16, erişilebilir shell, ilk health/readiness ve synthetic backup/restore.

## Kapsam dışı

Kaynak/PDF, belge editor'ü, görev/thread, AI/model/embedding; SSO, gerçek co-editing, gelecek modüller. Mevcut dış projeleri yeniden yapılandırmak veya eski arşiv kodunu taşımak yok.

## Önkoşullar

G00 incelemesi, [mimari/ADR](../ARCHITECTURE.md) ve [yetki sözleşmesi](../AUTHORIZATION.md) esas alınır. Deployment öncesinde kullanıcıya ait Atlas hedefi, bütçe, domain/TLS ve bağımsız backup hedefi somut olarak belirlenir. Exact sürüm kapısı ilk implementasyon PR'ında zorunlu; araştırılmış aday matrix başarılı kurulum sanılmaz.

## Görevler ve PR dilimleri

| PR | Çıktı ve kabul | Bağımlılık |
| --- | --- | --- |
| P01-1 | Resmi engine/peer/advisory/lisans kontrolü; exact pins/lockfile; minimal app ve server/domain/DAL sınırı; frozen install/type/lint/build + disposable DB ve auth/session adapter smoke | G00 + yeni talimat |
| P01-2 | Better Auth register/verify/login/logout/reset; DB session, own profile; idempotent W0; cookie/origin/rate-limit; expire/revoke/yanlış hesap testleri | P01-1; ADR 0002 |
| P01-3 | Workspace/Project/Member/lifecycle ve rol migration'ları; server authorization + FORCE RLS/helper/composite scope; pool context isolation, last owner ve W-admin-private deny | P01-2; ADR 0003 |
| P01-4 | S03–S05 project create/switch/invite accept/revoke; mail outbox/SMTP adaptörü; shell responsive/focus/light-dark kontrast düzeltmeleri; iki oturum akışı | P01-3; DESIGN_SYSTEM D01–D06 |
| P01-5 | Docker standalone, ayrı migrator, iç ağ PostgreSQL, live/ready, yerel verify ve Coolify build gate; ilk yetkili deploy/smoke + synthetic restore/rollback kanıtı | P01-1–4 + somut hedef/bütçe/backup kararı |

Her PR önceki dilimin negatif erişim regresyonunu çalıştırır. Migration dosyaları runtime'da otomatik create/sync yapılmaz. Kaynak/file worker şemalarının tamamını bu fazda spekülatif kurma.

## Test ve kabul kriterleri — G01

- Üniversite dışı iki gerçek test hesabı kayıt/doğrulama/giriş yapar; personal W0 retry'da çoğalmaz. Auth dışına parola/token/session secret sızmaz.
- A P1'i oluşturur, B daveti kendi doğrulanmış hesabıyla bir kez kabul eder, birlikte proje kabuğunu görür. Yanlış/expired/reused davet ve rol yükseltme reddedilir.
- A01–A13'ün auth/workspace/project işlemleri gerçek PostgreSQL runtime rolünde PASS; özellikle C ikinci ekip, D workspace admin, V viewer ve B revoke yarışları.
- İlk deployment readiness, DB role split, restart sonrası veriler, synthetic backup/restore ve uyumlu image rollback gerçek kanıtla raporlu. Yapılmadıysa G01 tamamlandı denmez.
- İlgili ekranlar dört genişlik/iki tema, keyboard/focus ve temel AA kontrollerini geçer; D05/D06 düzeltilir. Fake data “demo” olarak ayrı, yeni hesap gerçekten boş başlar.

## Bitiş koşulları

G01 PASS ve gerçek komut/commit/environment/deploy kanıtı teslim edilir; bilinen kritik access/data-loss/blocker yoktur. Faz 02 için source/PDF gereksinimleri hazır ama uygulanmaz. Sonraki faz ayrı talimatla başlar.
