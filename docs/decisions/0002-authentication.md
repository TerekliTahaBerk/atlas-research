# ADR 0002 — Self-hosted kimlik ve DB oturumları

Tarih: 2026-11-09. Durum: Faz 00 seçimi P01-1/2 server uygulamasında doğrulandı; [sürüm/kurulum](../implementation/P01-1.md) ve [auth/session/SMTP test kanıtı](../implementation/P01-2.md). UI ve canlı dağıtım ayrı kapılardır.

## Bağlam ve seçenekler

Beta üniversitesiz kişisel kayıt, e-posta doğrulama/parola sıfırlama ve iptal edilebilir oturum ister. Proje yetkileri kimlik sisteminden ayrı kalmalı. Hosted kimlik aboneliği zorunlu olmayacak.

| Seçenek | Değerlendirme |
| --- | --- |
| Better Auth + PostgreSQL/Prisma | Monolite entegre kimlik, e-posta/parola ve DB session yolu mevcut; mevcut Next.js/Prisma yönüyle en az operasyon bileşeni |
| Auth.js | Self-hosted uygulama dağıtım seçeneği; beta kayıt/doğrulama/reset akışlarının ayrıca değerlendirilmesini gerektirir; daha önceki projeden taşınmayacak |
| Keycloak | Self-hosted bağımsız kimlik sunucusu ve federasyon yönü; kurumsal SSO beta dışında olduğundan ayrı servis/idare yükü bugün gereksiz |
| Özel parola/session uygulaması | Güvenlik bakım yükü nedeniyle tercih edilmedi |

Karar, seçeneklerin çalıştırılarak karşılaştırıldığı anlamına gelmez. [Better Auth installation](https://better-auth.com/docs/installation), [Auth.js deployment](https://authjs.dev/getting-started/deployment), [Keycloak guides](https://www.keycloak.org/guides) 9 Kasım 2026'da okundu.

## Karar ve sınırlar

Better Auth + PostgreSQL DB session + Prisma adapter seçildi. E-posta/parola temel yöntem; üniversite alan adı kontrolü yok. E-posta doğrulama ve reset için SMTP adaptörü planlanır; dış hizmet hesabı bu fazda açılmaz. OAuth/ORCID/SSO prototipte görünse bile beta önkoşulu olmaz.

HttpOnly, Secure, uygun SameSite cookie; origin/CSRF ve auth rate-limit; parola/reset/verify token'ları yalnız kütüphane destekli güvenli yöntemle saklanır. Reset/registration cevapları hesap keşfine izin vermez. Cookie session cache kapalı olacak; her özel request DB session'ı ve canlı üyeliği yeniden denetler. Session iptali, logout ve reset sonrası revocation gerçek test gerektirir. Better Auth belgeleri cookie cache açılırsa iptal gecikmesi olabileceğini açıklar. [Session management](https://better-auth.com/docs/concepts/session-management).

Beta için öneri: 7 gün session süresi, hassas sahiplik/credential değişiminde yakın zamanda doğrulanmış kimlik; kesin konfigürasyon seçilen patch API'si üzerinden Faz 01'de sabitlenecek. Proje/workspace rolleri auth organization plugin'ine otomatik devredilmez. Auth tabloları `atlas_auth` rolüyle izole, içerik runtime RLS korumasındadır.

Job origin session ID ve requester ID sunucuda kaydedilir; session token payload'a konmaz. Dispatch sırasında hesabın ve origin session'ın geçerli olması, sonuçta erişimin sürmesi gerekir. Logout/revocation/expiry nedeniyle iptal edilen iş, yeni girişten sonra açık retry ile yeniden başlatılabilir. Sonuç indirmesi daima güncel browser session'ıyla kontrol edilir.

## Uygulama kapısı

Faz 01 ilk PR'ında seçilen Better Auth/Prisma/Next.js/Node patch'leri ve auth schema üretimi yerel disposable DB'de denenir. Better Auth Prisma sayfası schema generation ile migration'ın ayrı olduğunu belirtir; migration'lar gözden geçirilen Prisma sürecine alınır. Kütüphane CLI'si production'a kendiliğinden schema uygulamaz. [Prisma adapter](https://better-auth.com/docs/adapters/prisma).

Auth/session smoke başarısızsa uygulama başlamadan ADR revize edilir; belge okumak çalışır entegrasyon iddiası değildir. Test kapısı G01, rol sözleşmesi [AUTHORIZATION](../AUTHORIZATION.md).
