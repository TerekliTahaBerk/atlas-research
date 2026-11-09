# ADR 0004 — Özel volume, PostgreSQL işleri ve kademeli güncelleme

Tarih: 2026-11-09. Durum: Faz 00 seçimi; hiçbir servis oluşturulmadı.

## Faz 02 uygulama kararı — 9 Kasım 2026

Kullanıcının en küçük çalışan kapsam talimatıyla Graphile tercihi yeniden değerlendirildi. Mevcut Faz 01 outbox/lease modelini kullanan, yalnız PDF metadata/metin işleyen `ops.file_jobs` kuyruğu seçildi; Graphile/Redis eklenmedi. Aşağıdaki Graphile bölümü tarihsel Faz 00 tercihidir, uygulanmış bağımlılık değildir. Tek files süreci, `FOR UPDATE SKIP LOCKED`, 60 saniye lease, en çok iki otomatik deneme ve 60 saniye backoff kullanır. Manuel tekrar yeni job kimliği oluşturur. İş sonucu aynı immutable sürümde yalnız türetilmiş durumu günceller. Queue rolü dosya/kaynak içeriği okuyamaz; runtime rolü actor+session ile workspace→project kilit sırasını ve güncel erişimi yeniden denetler. Parser sırasında transaction açık tutulmaz.

`pdfinfo` (5 saniye/100 KB çıktı) ve `pdftotext` (15 saniye/2 MB çıktı) ayrı rootless container içinde çalışır; container 384 MiB/0.5 CPU, salt okunur root ve özel tmpfs kullanır. 25 MiB dosya, 500 sayfa işleme ve 250 MiB/proje yükleme rezervasyonu sınırı vardır. OCR/AI/embedding yoktur. İmza/EOF/hash kontrolleri antivirüs garantisi değildir; kötü niyetli corpus ve parser sertleştirme beta incelemesinde açıktır.

Web ve files süreçleri yeni `atlas-private-files:/data/atlas-files` volume'unu paylaşır. Eski `atlas-postgres` volume'u değişmez. Özel 0600 staging dosyası fsync/hash sonrası değişmez 0400 final dosyaya hard-link edilir; ardından aynı transaction FileObject/SourceVersion/job/intent kaydını tamamlar. Başarısız istek kendi dosyasını temizler, 24 saatten eski `.part` dosyalarını worker temizler. İşlem link ile DB commit'i arasında öldürülürse erişilemeyen final orphan kalabilir; otomatik final-object silme yapılmaz. Reconciliation ve DB+files tutarlı bağımsız geri dönüş beta öncesinde doğrulanmalıdır. Yerel volume kalıcılığı bağımsız yedek değildir; e-posta ve S3 kullanıcı kararıyla kapalıdır.

## Dosya depolama

Beta başlangıcında özel, kalıcı Atlas volume'u ve sunucu tarafından yetkilendirilen download/range proxy seçildi. PostgreSQL yalnız metadata, hash, sahiplik ve ilişkileri tutar; PDF blob'ları tabloya konmaz. Storage key rastgeledir, tenant bazında scope'ludur. Statik public klasöre dosya yazılmaz, doğrudan herkese açık veya uzun ömürlü signed URL verilmez. Range dahil her istek [AUTHORIZATION](../AUTHORIZATION.md) yolundan geçer.

Alternatif S3-uyumlu self-hosted object storage adaptörü büyüme/çok-host gerektiğinde değerlendirilebilir; başlangıçta ek bir storage servisi ve credential seti zorunlu değildir. Yerel volume tek-host bağımlılığı getirir; bağımsız şifreli backup ve DB+file restore testi şarttır. Volume'ların container lifecycle'dan bağımsız kalıcılığı resmi Docker belgelerinde açıklanır. [Docker volumes](https://docs.docker.com/engine/storage/volumes/).

PDF yükleme özel staging alanına gelir, boyut/MIME/magic byte ve zararlı/bozuk dosya kontrollerinden sonra immutable final object olur. DB'nin ready işareti dosya final konumda ve hash doğrulanmadan yazılmaz. Failed/staged dosyalar süreli cleanup ile gider; içerik parser'ı kaynak kısıtlı worker'da çalışır. Lisanssız/private PDF'ler fixture veya repository snapshot'ı olmaz.

## Arka plan işleri

Faz 01'de kısa auth/proje işlemleri normal request'tir. E-posta gibi yeniden denenmesi gereken yan etkiler transactional outbox'a kaydedilir. Faz 02 PDF işleme/export ihtiyacıyla aynı koddan worker süreci ve PostgreSQL tabanlı **Graphile Worker** seçilir. Queue semantiği at-least-once kabul edilir: task handler idempotent olmak zorundadır. Graphile belgeleri PostgreSQL/Node tabanını, retry/backoff ve job key yaklaşımını açıklar. [Graphile Worker](https://worker.graphile.org/docs).

Alternatif özel SKIP LOCKED queue'su daha az paket ama lease/retry/recovery bakımını bize bırakır; BullMQ/Redis ek servis zorunluluğu getirir; request içi PDF/AI ise timeout ve yeniden başlatmada kayıp yaratır. İlk tercih Graphile'dır, zorunlu Redis yok. Güncel requirements sayfasında Node 22.18+ ve PostgreSQL 12+ belirtilir; Atlas'ın daha dar aday matrix'i ve seçilen patch Faz 01/02'de gerçek testle sabitlenir. [Requirements](https://worker.graphile.org/docs/requirements).

Domain değişikliği + outbox aynı DB transaction'dadır. Dispatcher, outbox event ID'yi job dedupe anahtarıyla queue'ya koyar; queue commit'inden sonra delivered işaretler. Arada çöküş çift enqueue yapabilir; handler'ın unique operation record'u ikinci side effect'i engeller. Queue rolü domain içerik okuyamaz. Worker domain işlemlerini actor context ile runtime rolünde yürütür; queue secret'ı içerik bypass'ı değildir. Worker autoinstall/schema mutation production runtime yetkisiyle yapılmaz; queue şeması kontrollü migration adımında hazırlanır.

Job state queued/running/succeeded/failed/cancelled; deneme sayısı, lease/heartbeat, deadline, safe error code ve manuel retry bulunur. İçerik yerine ID payload, kaynak başına bounded concurrency, idempotent extraction/export ve provider timeout sonrası belirsiz kullanım kaydı gerekir. Her okumada/dispatch/result/delivery'de canlı erişim yeniden denetlenir; private provider response loglanmaz.

## Güncellemeler ve gelecekte realtime

Beta için bildirim/görev/thread güncellemesi normal refetch ve görünür sayfada önerilen 15 saniyelik polling ile başlar; sekme odaklandığında refetch olur. Yazma optimistic revision ile korunur. Bu süre güvenlik garantisi değildir; her server isteği güncel yetki kontrolündedir.

SSE aynı monolit üzerinde yalnız değişim bildirimi için ileride adaydır; reconnect/cursor/authorization/proxy buffer ve bağlantı bütçesi ölçülmeden eklenmez. WebSocket/co-editing altyapısı ve özel realtime servisi beta önkoşulu değildir. Polling yeterli değilse Faz 03/05 ölçümü ADR'yi günceller; sessizce kalıcı collaboration iddiası eklenmez.
