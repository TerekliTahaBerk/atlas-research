# Kimlik ve yetkilendirme sözleşmesi

Normatif kaynak budur; diğer belgelerdeki rol özetleri bu kuralları genişletemez. Karar [ADR 0003](decisions/0003-tenancy-and-authorization.md). Varsayılan deny. Rastgele/UUID ID, gizli URL veya UI'da gizlenen düğme yetki değildir.

## Workspace ve proje rolleri

Kişisel workspace yalnız sahibine açıktır; davet shared workspace projesinde yapılır. Paylaşılan workspace owner/admin üyelik ve workspace ayarlarını yönetir. **Workspace owner/admin olmak özel proje içeriğine erişim vermez.** Tüm projeler beta içinde açık ProjectMember listesiyle özeldir; “workspace'teki herkese açık proje” modu yoktur. Aktif workspace üyeliği + aktif proje rolü içerik için birlikte gereklidir.

Proje oluşturan aktif workspace üyesi proje owner'ı olur. Workspace yöneticisi kendini başka özel projeye ekleyemez, özel proje listesini/başlığını/arama sonucunu veya AI'sını göremez. Workspace üyelerini ve yönetişim bilgisini görebilir. Son özel proje owner'ını çıkarmak transfer tamamlanana kadar engellenir; admin'e içerik/başlık açıklamayan bir sahiplik engeli döner. Acil erişim için gizli “break glass” içerik bypass'ı beta uygulamasına eklenmez.

| İşlem | W owner/admin (P rolü yok) | P owner | P admin | P editor | P viewer |
| --- | --- | --- | --- | --- | --- |
| Workspace üye/ayar yönetimi | Evet; son owner kısıtlarıyla | W rolüne bağlı | W rolüne bağlı | W rolüne bağlı | W rolüne bağlı |
| Özel proje içeriği/liste/arama/versions okuma | Hayır | Evet | Evet | Evet | Evet |
| Kaynak/PDF/not/doc/task/thread oluştur/değiştir | Hayır | Evet | Evet | Evet | Hayır |
| Annotation/message düzeltme | Hayır | Tümünü; edit/audit izi | Tümünü; edit/audit izi | Kendininkini; doc/task ortak düzenleme ayrı | Hayır |
| Kaynak/doc/task archive veya kurtarma | Hayır | Evet | Evet | Hayır | Hayır |
| Proje daveti/rol/üye iptali | Hayır | Evet | Editor/viewer yönetir; admin/owner değiştiremez | Hayır | Hayır |
| Owner devri / admin atama | Hayır | Açık ve atomik devir; son owner korunur | Hayır | Hayır | Hayır |
| Proje archive/unarchive/silme süreci | Hayır | Evet | Archive/unarchive; kalıcı silme süreci yok | Hayır | Hayır |
| Kaynak/doküman export | Hayır | Evet | Evet | Evet | Evet; yetkili içerik kapsamıyla |
| Kendi AI konuşmasını başlat/oku | Hayır | Evet | Evet | Evet | Evet; workspace AI politikası/kota ile |
| Başkasının özel AI konuşmasını oku | Hayır | Hayır | Hayır | Hayır | Hayır |
| AI önerisini dokümana uygula | Hayır | Evet | Evet | Evet | Hayır |

Proje daveti için dar istisna: P owner/admin daveti, kabul eden kişi henüz workspace üyesi değilse yalnız temel `member` workspace üyeliğini de atomik oluşturabilir. Bu, genel workspace üye/ayar yönetimi veya workspace admin/owner atama hakkı değildir. P admin yalnız editor/viewer davet eder; admin daveti yalnız P owner tarafından yapılır. Owner devri davet yoluyla yapılmaz.

Herkes yalnız kendi notification, session ve kişisel reading-state kaydını okur/yönetir. Viewer da izinli kaynağın yalnız kendi okuma durumunu değiştirebilir; bu kaynak metadata/tag/annotation yazma hakkı vermez. Bu kullanıcıya özel kayıtların RLS'si owner eşleşmesini ve gerekiyorsa güncel proje erişimini birlikte ister. Proje üyesi mesaj/task içindeki başka resource ID'ye atlayarak erişim kazanamaz. Artifact bağlantısı her iki uca yetki gerektirir. Shared AI yanıtı yalnız açıkça dokümana/thread'e eklenen kopyadır; hedefteki tüm okuyucuların kaynaklara erişebildiği kontrol edilir.

## Sunucu stratejisi

Her özel read/write/export/job/retrieval için gerçek session DB'den doğrulanır. Cookie cache yetki kaynağı değildir. Route/action/Server Component/asset endpoint domain service'e girer; `actor` kullanıcı isteğinden alınmaz. Parent scope DB'den çözülür. Server membership + action + archive + ownership kurallarını aynı transaction içinde kontrol eder, gereken alanları döndürür. Arama count/snippet, notifications, eski sürümler ve downloads bu yoldan geçer.

Kimlik bootstrap ve auth işlemleri yalnız auth şemasına erişebilen `atlas_auth` rolüyle yapılır. Uygulama tenancy helper'ı doğrulanmış User ID ile content bağlantısını açar; auth bağlantısı içerik tablolarına yetkili değildir. Provider credentials sunucudadır. API/mutation origin/CSRF, input schema ve rate-limit kontrolü olmadan domain'e geçmez. Kullanıcıya unauthorized/not-found aynı güvenli unavailable yanıtı verir; iç log yalnız request ID/hata sınıfı tutar.

## PostgreSQL savunma katmanı

Seçilen tek strateji: **sunucuda merkezi authorization + tüm private içerikte PostgreSQL RLS**. Bunun yerine bazı modüllerde yalnız app filtresi kullanılmaz. Proje kimliği taşıyan tüm tablo/subtype/join/read model'lerde ENABLE ve FORCE RLS planlanır; read için USING, write için USING + WITH CHECK. Registry/composite FK kuralları da [DATA_MODEL](DATA_MODEL.md) uyarınca zorunludur.

| DB rolü | Yetki |
| --- | --- |
| `atlas_runtime` | Web ve worker domain sorguları; NO SUPERUSER, NO BYPASSRLS, tablo sahibi değil; DML/izinli helper EXECUTE, DDL/TRUNCATE/role yönetimi yok |
| `atlas_auth` | Yalnız auth şeması DML; content/queue/migration yetkisi yok |
| `atlas_queue` | Queue lease/enqueue ve dar outbox dispatch; private araştırma içeriği SELECT yok |
| `atlas_migrator` | Şema/migration/policy oluşturma; deployment'ın tek kullanımlık adımı; web/worker env'inde bulunmaz |
| `atlas_policy` | NOLOGIN; sınırlı SECURITY DEFINER permission helper'larının sahibi; gerekli membership okumaları için dar bypass; veri döndüren API değil |
| `atlas_backup` | Yalnız yedek job'unda kapsamlı okuma/backup yetkisi; uygulamaya verilmez; restore rolü ayrı operasyon |

Her domain transaction önce session'dan türeyen user ID'yi transaction-local `app.user_id` olarak ayarlar. Missing/invalid context deny olur. `SET LOCAL` aynı transaction'ın aynı bağlantısındadır; pooled bağlantıya session-level SET yapılmaz, outside-transaction Prisma sorgusu yasaktır. Transaction sonrası bir kullanıcının context'i sonraki kullanıcıya geçmemelidir.

RLS permission helper'ları yalnız sabit membership/project tablosundan boolean üretir; actor parametresi kabul etmez, transaction context'ini okur. Böylece membership tablolarındaki policy recursion'ı önlenir. SECURITY DEFINER fonksiyonlarının sahibi login olamaz; search_path sabit ve nesneler qualified, PUBLIC EXECUTE/CREATE kaldırılmış, dynamic SQL yok, fonksiyon kapsamı yalnız rol/aktiflik kontrolüdür. Membership değişiklikleri ayrı action helper + server kurallarıyla korunur; yetkisi olmayan kişinin kendini admin yapmasına WITH CHECK izin vermez. Auth-only/kendi notification/özel conversation tabloları kendi kullanıcı policy'sini de uygular.

PostgreSQL'de superuser/BYPASSRLS ve genelde tablo sahipliği RLS'yi aşabilir; FORCE ve rol ayrımı bu nedenle zorunludur. RLS FK/unique constraint'lerden sızabilen hataların yerine geçmez; ham constraint hatası dışarı verilmez. Bu tasarım genel bir SQL injection veya ele geçirilmiş uygulama sunucusuna karşı kimliği kriptografik olarak ispatlamaz: runtime SQL çalıştırabilen saldırgan context ayarlayabilir. Parametreli sorgu, server-only boundary, credential ayrımı ve testler birlikte gereklidir. [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

## Üyelik iptali ve yarışlar

Kilit sırası workspace → project → resource olarak sabittir. İzinli kısa içerik transaction'ları ilgili workspace/proje satırlarını paylaşımlı kilitler; üyelik/rol iptali aynı scope satırlarında exclusive lock alır. Böylece iptal commit'inden sonra başlayan işlem eski üyeliğe dayanamaz. Proje iptali ProjectMember'ı, workspace iptali bütün o workspace erişimini etkiler. Her seferinde canlı DB üyeliği okunur, JWT role claim'i/önbellek kararı kullanılmaz.

Provider çağrısı veya PDF parser boyunca DB transaction/kilit açık tutulmaz. Job: başta yetki → veri alımı → provider dispatch öncesi yetki → sonuç yazımında yetki → teslimde yetki. İptal sonucu saklanmaz/yayınlanmaz, kota rezervasyonu settle/release kuralıyla sonlandırılır. İlk beta AI cevabı buffer'lanır; client'a token akıtma sonucu iptal sonrası açıklama riski doğurmaz. Son response yeniden yetki kontrolünden geçer.

Garanti: iptal commit'inden sonra yeni istek, yeni range/download, job dispatch/result veya AI retrieval/delivery yetkisiz kullanıcıya içerik vermez. Önceden başlamış network stream'inde gönderilmiş byte'lar, provider'a zaten iletilen içerik ve kullanıcının indirdiği kopya geri çağrılamaz. Dosya stream'i başta, her yeni range'de ve uzun stream sürerken iptal sinyalinde kontrol edilip kesilir; teslim edilmiş byte için mutlak geri alma sözü verilmez. Browser content cache'i sonraki refetch/permission failure'da temizlenir; polling gecikmesi sunucu güvenlik sınırı değildir.

## Zorunlu iki ekip ve iptal test matrisi

Fixture yalnız sentetik: W-A/P-A'da A owner, B editor, V viewer; W-B/P-B'de C owner; W-A admin D'nin P-A üyeliği yok. Gerçek PostgreSQL ve runtime credentials ile çalıştırılacak; mock-only kanıt yeterli değildir.

| ID | Deneme | Beklenen | İlk kapı |
| --- | --- | --- | --- |
| A01 | Anonim ve expired/revoked session ile her private entry | İçerik/count/snippet yok; auth gerektiği güvenli biçimde bildirilir | G01 |
| A02 | C, P-A ID'sini bilerek list/detail/write/search/version/export çağırır | Tümü deny, hata varlık sızdırmaz | G01→G04 |
| A03 | D workspace admin, P-A içerik/rol ekleme/AI okuma dener | İçerik deny; kendini P-A'ya ekleyemez | G01/G04 |
| A04 | V okur; create/edit/invite/apply dener | Okuma/export izinli; yazma/apply deny | G01→G04 |
| A05 | B body'de P-B parent/link/assignee veya actor=A gönderir | Same-project constraint/authorization deny; actor değişmez | G01→G03 |
| A06 | B iptal edilir; açık session ile yeni liste/PDF range/export indirme | İptal commit sonrası deny; eski session üyelik yerine geçmez | G01→G04 |
| A07 | B'nin upload/export/AI işi kuyruktayken veya çalışırken iptal | Dispatch/result/delivery deny/cancel; özel çıktı sızmaz | G02/G04 |
| A08 | İki eşzamanlı session pool reuse; missing/malformed context | B context'i A'ya sızmaz; eksik context sıfır kayıt/deny | G01 |
| A09 | Runtime ile doğrudan SQL: başkasının satırı read/insert/update/delete, SET ROLE/DDL/TRUNCATE | RLS/privilege deny; `WITH CHECK` scope taşımasını engeller | G01→G04 |
| A10 | Workspace iptali veya project role downgrade; assignee/notification/AI | Proje erişimi kaybolur; görev unassign, notification redakte; daha eski AI erişim sağlamaz | G01/G03/G04 |
| A11 | Yanlış hesap/expired/reused davet; owner escalation; son owner kaldırma | Atomik reject veya idempotent kabul; rol artışı/ownersız proje yok | G01 |
| A12 | Kaynak/atıf/AI conversation başkasına ait; clipboard/download link replay | Erişim tekrar kontrolü; private conversation owner dışına açılmaz | G02→G04 |
| A13 | Revocation ile concurrent transaction, cancel/retry veya stale cache | Kilit sırası, yeni istekte deny, deadlock retry bounded; önceki stream sınırı raporlu | G01→G04 |

Faz 00'da bu testlerin tamamı **NOT RUN**. Planın tutarlılık incelemesi bunların başarılı koştuğu anlamına gelmez.
