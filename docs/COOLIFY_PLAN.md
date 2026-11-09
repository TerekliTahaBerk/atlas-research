# Coolify ve PostgreSQL operasyon planı

Bu belge bir runbook tasarımıdır. Hiçbir host'a bağlanılmadı; kaynak oluşturulmadı, migration/deploy/restart/silme yapılmadı. Eski dış servislerin durumu [RESTART](RESTART.md) kaydından öte varsayılmaz. Uygulama yönü [ARCHITECTURE](ARCHITECTURE.md), veri ve roller [DATA_MODEL](DATA_MODEL.md) / [AUTHORIZATION](AUTHORIZATION.md).

## Dev ve production sınırı

Dev yerel disposable PostgreSQL + ayrı private upload volume + sentetik fixture kullanır. Production ayrı Atlas DB, ayrı roller/secret'lar/volume'lar kullanır. Production verisi geliştirici laptop'a/PR preview'a kopyalanmaz. Bir production host üzerinde GitHub runner kurulmaz. Kalıcı staging branch gerekmez; gerekiyorsa test ortamı ayrı veriyle kısa süreli açılır ve ayrıca yetkilendirilir.

Faz 01'in deployment diliminden önce ürün sahibi Atlas için hedef Coolify instance/host, domain, TLS, kaynak bütçesi ve bağımsız backup hedefini belirler. Mevcut başka uygulama/DB/volume'lar yeniden kullanılmaz veya değiştirilmez. Read-only envanter bile o fazdaki somut hedefle sınırlanır; bu fazda dış kaynaklara dokunulmaz.

## Build, runtime ve ağ

Planlanan image çok aşamalı Docker build: sabit Node patch/image digest → lockfile ile frozen install → type/lint/tests gate → Prisma generate → Next.js build → yalnız standalone output, static/public varlıkları ve gereken runtime dosyaları. Root olmayan sabit UID, gereksiz OS araçları yok; writable temp ve private mount'lar açıkça ayrılır. Dockerfile/Compose/config bu fazda oluşturulmadı.

Next.js standalone minimal Node runtime olarak seçilir; public client bundle'a secret girmez. Özel verilere build anında ihtiyaç duyulmaz, gerçek DB bağlantısı build'in şartı olmaz. Auth/database/env okuyan kod runtime'da çalışır. `NEXT_PUBLIC_*` yalnız kamuya açık değerler içindir ve build'e gömülebileceği göz önüne alınır. Next.js Node/Docker/standalone seçeneklerini resmi olarak belgeler. [Next.js deploying](https://nextjs.org/docs/app/getting-started/deploying).

Coolify proxy dışarıda HTTPS sağlar; web yalnız internal application port'unda çalışır. PostgreSQL, worker, queue ve volume'lar public port/domain almaz. Atlas'a ayrılmış internal Docker ağı ve role credential'ları kullanılır. Web'in DB'ye erişmesi diğer projelere erişme izni değildir. Uzak backup taşıması TLS/şifreli kanal kullanır; secret dosyaları/credentials loglanmaz.

| Süreç | Kalıcı/veri ihtiyacı | Sağlık |
| --- | --- | --- |
| Web standalone | Private source/export volume; yalnız gereken path'ler, app cache ephemeral | Liveness DB'ye bağımlı değil; readiness DB erişimi + beklenen schema revision + gerekli mount erişimi |
| PostgreSQL | Dedicated kalıcı data volume; auth/content/queue ayrı schema/roller | Engine bağlantı ve disk/kayıt durumu; public probe yok |
| Worker, Faz 02+ | Aynı image/code, özel staging/final file mount; CPU/RAM sınırı | Heartbeat, queue lag, failed count; stuck job lease recovery |
| Backup job | DB read/backup yetkisi + files read + dış hedef write | Son başarılı set, yaş, byte/hash, restore manifest; app secret'larından ayrı |

Planlanan `/health/live` yalnız process canlılığı; `/health/ready` hazır/değil ve sürüm etiketi, credentials/schema detayları dönmez. DB yoksa readiness fail ve trafik kesilir, liveness restart döngüsü yaratmaz. Graceful shutdown yeni işleri durdurur, request drain, worker lease/heartbeat bırakma ve bağlantı kapama içerir. Route adları ve probe timeout'ları Faz 01 image testiyle kesinleşir.

## Env ve secret ayrımı

Gizli değerler: runtime/auth DB URL'leri, session secret, SMTP credential, queue bağlantısı, ileride provider secret. Public config: app origin, feature availability; limits ise server config. Migration URL yalnız tek kullanımlık migration sürecinde; backup secret yalnız backup görevinde bulunur. Env dosyası/image layer/PR body/screenshot'a secret girmez. Yerel `.env.example` ancak Faz 01'de anahtar adları ve sahte boş değerlerle oluşturulur.

Prod env değerleri Coolify secret mekanizmasında yönetilir; build/runtime ayrımı incelenir. Secret rotation oturum/provider/job etkisi ve rollback'iyle planlanır; gereksiz eski secret silme/reconfigure bu iş kapsamında değildir. Uygulama sürümü commit SHA + image digest + schema revision ile izlenir.

## Migration ve deployment sırası — ileride

1. İlgili phase gate ve exact commit yerelde PASS olur; image immutable digest ile hazırlanır, secret scan yapılır.
2. Ayrılmış target ve bağımsız backup hedefi doğrulanır; mevcut kaynaklara etki planı gözden geçirilir. İlk kullanıcı verisinden önce backup/restore yolu hazırdır.
3. DB+files tutarlı backup seti ve geri dönüş sınırı kaydedilir. Runtime rolünün schema değiştiremediği kontrol edilir.
4. Tek migration runner/migrator rolü ile review edilmiş Prisma migration uygulanır. Paralel migration yok; başarısızsa web sürümü terfi etmez. Data backfill bounded ve tekrar çalıştırılabilir olur.
5. Expand/contract uyumlu schema ile yeni web image'ı başlatılır; readiness + auth + iki-ekip negatif smoke geçerse trafik yeni sürüme geçer. Worker aynı schema/image ailesiyle uyumlu sırada başlatılır.
6. İlk hata/latency/queue/disk penceresi gözlenir; sonucu gerçek log/metrikle kaydetmeden başarılı deploy denmez.

Rollback önce eski image'ın yeni schema ile uyumluluğunu kontrol eder. Uyumluysa bilinen eski digest'e dönülür, içerik verisi geri sarılmaz. Destructive contract migration öncesi ayrı onaylı bakım ve restore planı gerekir. Uyum yoksa forward fix veya kontrollü bakım altında DB+files set restore edilir; restore sonrası yazılmış verinin kaybı açıkça raporlanır. DB migration'ının tersini otomatik koşmak rollback stratejisi değildir.

## Yedekleme ve restore

Seçilen hedef sınıfı: Atlas üretim host'undan **bağımsız**, ayrı credential ile erişilen S3-uyumlu object bucket. Aynı makinedeki ikinci volume tek backup olamaz. Gerçek sağlayıcı/bucket/bölge/fiyat ve hesabın sahibi deployment planında kullanıcı tarafından seçilecek; henüz hedef oluşturulmadı veya satın alınmadı. Varsa kullanıcıya ait ayrı fiziksel host ancak aynı bağımsızlık/şifreleme/restore koşullarıyla alternatif olabilir.

Önerilen beta hedefleri: RPO ≤24 saat, RTO ≤4 saat; günlük 7, haftalık 4, aylık 3 set. Süre ve maliyet teyidi deployment önkoşuludur. Şifreleme anahtarı ve kurtarma talimatı aynı host/aynı credential kasasında tek kopya kalmaz. Dump içinde auth ve özel içerik vardır; private backup yetkisi ve retention denetlenir.

Tutarlı set yöntemi: kısa bakım/write fence → worker dispatch ve yeni upload/finalize/purge durdur → mevcut mutasyonları drain et → committed file manifest (object key, version UUID, hash, size) al → aynı sabit veri noktasında DB logical dump + immutable final files kopyası → manifest ve app/schema/image sürümüyle paketle → hash/byte sayımı → şifreli dış hedefe aktar → doğrulandıktan sonra writes aç. Staging dosyaları backup'a katılmaz. File purge bu set boyunca çalışmaz. Tek-host küçük beta için basit ve uygulanabilir bakım penceresi; daha sonra ölçüme göre online snapshot/WAL yöntemi değerlendirilebilir.

Coolify scheduled DB backup ve S3-uyumlu hedef desteği sağlar; DB backup file volume'larını kendiliğinden tutarlı yedeklemiş sayılmaz. Başarılı backup restore kanıtı değildir. [Coolify backups](https://coolify.io/docs/databases/backups). `pg_dump` DB içinde tutarlı snapshot verir; dosyalarla tutarlılık yukarıdaki fence/manifest tasarımının sorumluluğudur. [PostgreSQL SQL dump](https://www.postgresql.org/docs/current/backup-dump.html).

Restore provası beta öncesi ayrı disposable ortamda: dış hedeften şifre çöz → role/policy/schema ve dump restore → file manifest'e göre dosya restore/hash doğrula → migration/image uyumunu kontrol et → iki-ekip yetkisi, source page, document version/citation, görev/thread/AI private erişimi smoke → dangling link ve missing file raporu → gerçek süre/veri noktası/RPO/RTO kaydı. Production üzerinde prova yapılmaz. Faz 01'de küçük synthetic set için, Faz 05'te tam beta hacmi için tekrar gerekir. Prova olmadan closed beta açılmaz.

## Gözlemlenebilirlik ve bütçe

Başlangıç tahmini (ölçülmüş kapasite değil): küçük pilot için 2 vCPU/4 GiB toplam host sınıfını değerlendirmek; web ~512 MiB, PostgreSQL ~1 GiB, worker ~512 MiB + proxy/OS/cache/build headroom. Build pik tüketimi runtime'dan ayrılır; gerekirse ayrı build host kullanılır. Disk planı DB + immutable PDF + staging + geçici dump + restore alanı + büyüme ve en az %20 boşluk içerir. Kaynak satın alınmaz; mevcut host yeterli varsayılmaz.

İlk upload önerisi 50 MiB/dosya, 300 sayfa, workspace storage kotası owner konfigürasyonu; parser deadline/concurrency pilot PDF setiyle ölçülüp Faz 02'de sabitlenir. DB pool toplamı web+worker+auth+queue+backup için server limitinden rezerv düşülerek belirlenir. Prisma 7 driver adapter pool ayarları seçilen driver'a bağlıdır; v6 URL parametreleri körlemesine taşınmaz. [Prisma 7 connection pool](https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections/connection-pool).

İzlenecek sinyaller request hata/süre yüzdelikleri, DB connection/slow query sınıfı, queue lag/failure/heartbeat, disk doluluk, son backup yaşı ve restore sonucu. İçerik/SQL parametresi/provider cevabı loglanmaz. Uyarı önerileri: disk %80, backup yaşı >26saat, readiness kesintisi veya artan job failure; gerçek eşikler pilot yüküyle ayarlanır. Faz 05'te bütçe ve darboğaz kanıtıyla release kararı verilir.

## Ücretsiz yerel gate ve Coolify gate

Bugünkü doğrulama `python3 scripts/verify_phase00.py` ve `git diff --check` (uygulama testleri yok). Faz 01'de `verify` giriş noktası type/lint/unit + disposable PostgreSQL RLS/integration + production build'e bağlanır. Sonraki fazlar gerçek browser journey/AI eval'i ekler. Yerelde çalışan kanıt exact commit/environment ile PR'a kaydedilir; GitHub Actions ücreti gerektirmez.

Coolify daha sonra aynı frozen install/check/build adımında başarısızsa image terfisini durdurur. Entegrasyon testleri production DB'de koşmaz; ayrı disposable DB gerekir. Build gate'i readiness/runtime auth smoke'unun yerine geçmez. Henüz workflow/check yok; branch protection'a hayali required check adı eklenmez. Production'a runner kurulmaz.
