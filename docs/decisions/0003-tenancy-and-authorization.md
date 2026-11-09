# ADR 0003 — Açık proje üyeliği, app authorization ve RLS

Tarih: 2026-11-09. Durum: [P01-3 uygulaması ve PostgreSQL testleri](../implementation/P01-3.md); canlı dağıtım kapısı açık.

## Karar

Shared database/shared schema içinde her içerik kaydı workspace/project scope taşır. Merkezi server domain geçidi + transaction-local actor context + PostgreSQL RLS birlikte kullanılır. Workspace owner/admin rolü özel projenin içeriğine izin vermez. İçerik için aktif workspace üyeliği ve açık ProjectMember şarttır. Kişisel workspace yalnız sahibine açıktır.

Normatif rol, DB rolü, policy helper ve revocation sözleşmesi [AUTHORIZATION](../AUTHORIZATION.md), composite FK/ownership [DATA_MODEL](../DATA_MODEL.md) içindedir. Bu ADR kuralları tekrar tanımlamaz.

## Gerekçe ve alternatifler

Sadece server query filtresi basit görünse de unutulan sorguda tenant sızıntısı riski taşır. Yalnız RLS ise ürün eylem kuralları, auth bootstrap, dosya/providera gönderim ve anlamlı hata yönetimini karşılamaz. DB-per-workspace küçük beta için migration/backup/connection yükünü gereksiz büyütür. Seçilen model tek PostgreSQL ve açık savunma katmanıyla bu ölçeğe uygundur.

Runtime sahibi/BYPASSRLS olmayan DML rolüdür; migration, auth, policy helper ve queue rolleri ayrıdır. Membership helper'ları policy recursion üretmemek için dar SECURITY DEFINER boolean işlevleridir. FORCE RLS, sabit search_path ve PUBLIC yetki kaldırma doğrulanacaktır. RLS'nin owner/superuser istisnaları resmi belgede açıktır. [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

## Sonuçlar ve açılış işlemleri

Prisma'nın her domain sorgusu aynı authorized transaction içinden geçer; pool context leakage negatif testi zorunludur. Workspace/project oluşturma, owner transferi, invitation accept ve membership revocation normal CRUD'a bırakılamaz. Bu lifecycle işlemleri dar server domain action'ı ve gerekirse sabit gövdeli DB helper ile atomik yapılır. Proje yaratmada parent workspace üyeliği kontrol edilip Project ve ilk owner birlikte açılır; yeni P üyesi henüz yok diye bootstrap RLS'yi genel bypass etmek yoktur.

Üyelik/rol değişikliği ile okuma/yazma yarışları workspace→project kilit sırasıyla tasarlanır. DB bağlamı kullanıcı tarafından ayarlanmış bir header değil server session sonucudur. RLS ele geçirilmiş sunucuyu veya runtime SQL injection'ını tek başına çözmez.

## Kabul

A01–A13 iki-ekip test matrisi gerçek PostgreSQL'de çalışmadan G01 geçmez. Sonraki fazlar yeni resource'ları aynı matrise ekler. Runtime rolünün DDL/TRUNCATE/role bypass yapamadığı, eksik context'in kapalı kaldığı ve workspace admin'in özel projeyi açamadığı açık kanıt ister. Faz 00 yalnız bu kararı ve test planını teslim eder.
