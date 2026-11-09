# Doğrulama ve kanıt planı

Durum dili: **PASS** gerçekten koşup beklenen sonucu verdi; **FAIL** koştu ve bekleneni vermedi; **NOT RUN** koşulmadı/uygulama yok. Planlanan test hiçbir zaman PASS yazılmaz. Faz 00 gerçek sonuçları [PHASE_00_HANDOFF](PHASE_00_HANDOFF.md), tasarım bulguları [REFERENCE_AUDIT](design/REFERENCE_AUDIT.md) içinde tutulur.

## Güncel Faz 01 kapısı

`npm run verify` gerçek type/lint/unit/PostgreSQL/build/browser kapısıdır; `npm run verify:release` temiz commit için Docker/recovery kanıtını ekler. Sonuçlar ve kalan canlı kapılar [handoff](PHASE_01_HANDOFF.md) içindedir.

## Tarihsel Faz 00 giriş noktası

Repository root'ta Python 3 standart kütüphane yeterlidir; install/network/DB gerekmez:

```sh
python3 scripts/verify_phase00.py --historical
git diff --check
```

Checker gerekli teslim dosyalarını, yerel Markdown dosya bağlantılarını, P00–P05 bölüm/kapılarını, J1 ekran kimliklerini, snapshot hash'lerini, kaynak kopyasında kişi/e-posta temizliğini, bariz credential/PDF örüntülerini ve app/infra manifest'i eklenmediğini kontrol eder. Ürün mantığı, tüm çelişkiler, tüm secret'lar veya erişilebilirlik için kanıt değildir. Link kontrolü uzak URL'leri gezmez ve HTML kaynak içindeki offline bağımlılıkların varlığını beklemez; bunların kopyalanmadığı açık kayıttır. Eşlik eden manuel tutarlılık incelemesi zorunludur.

## Faz 01 öncesi exact sürüm kapısı

[ARCHITECTURE](ARCHITECTURE.md) aday matrix'i araştırılmıştır; exact patch'ler kurulmadı/sabitlenmedi. İlk implementasyon PR'ında:

1. Resmi Node lifecycle, Next.js engine/React peer aralığı, seçilen Prisma major'ın Node/TS/PostgreSQL/OS gereksinimi, Better Auth adapter ve Graphile requirement sayfalarını yeniden oku. Genel “latest” dokümanını yanlış major ile karıştırma.
2. Uygun desteklenen Node patch, package manager patch, Next/React/ReactDOM/TypeScript/Prisma/auth patch'leri, PostgreSQL minor ve Docker base digest'lerini sürüm kaydına sabitle; lisans/advisory ve hedef CPU/OpenSSL/libc kontrolü yap.
3. Lockfile ile temiz frozen install, production build, Prisma generate, disposable PostgreSQL connect/transaction ve auth create/login/revoke smoke çalıştır. Hiçbirinde production credential kullanılmaz.
4. RLS `SET LOCAL`/pool reuse/rollback ve migration role split'i seçilen Prisma driver'la doğrula. Başarısız kombinasyonu upgrade oldu diye kabul etme; ADR'yi düzelt.
5. PR'a exact komut, commit, Node/DB/image sürümü ve gerçek sonuç koy. G01 bu kanıtı ister.

## Kapılar ve test türleri

| Kapı | Otomatik/elle kanıt | Negatif/arıza kanıtı | İlgili faz |
| --- | --- | --- | --- |
| G00 | Doküman checker + diff; J1 ekran/veri/izin/hata izi; kaynak hash/audit | Kapsam dışı uygulama/infra yok; doğrulanmamış ölçüm gerçek gibi değil | [00](phases/PHASE_00.md) |
| G01 | Gerçek auth/session, W0/shared/P1, invite, iki kullanıcı; runtime RLS; ilk yetkili Coolify smoke | A01–A13'ün 01 resource'ları; wrong/expired/reused invite; admin private deny; restart/restore synthetic | [01](phases/PHASE_01.md) |
| G02 | Metadata/PDF→immutable version→anchor persist→export; pagination/reload | Cross-project FK, bozuk/oversize upload, parser timeout, orphan cleanup, private range/export deny | [02](phases/PHASE_02.md) |
| G03 | Math/doc save/version→task→thread→notification→geri link; gerçek iki oturum | Conflict/offline/retry/double submit, erişim iptali, archived/silinen target, no stale title | [03](phases/PHASE_03.md) |
| G04 | [Gerçek makale eval seti](AI_AND_SOURCE_CONTRACT.md), citation locator/support ayrı; proposal apply | Kota/timeout/cancel/revocation/prompt injection/unsupported evidence; provider error | [04](phases/PHASE_04.md) |
| G05 | Pilotların J1 tamamlaması, metrik ham sayıları, support kaydı, DB+files restore | İki-ekip yeniden regresyon, fault/restart/load test, sıfır açık kritik access/data-loss/blocker | [05](phases/PHASE_05.md) |

Her kabul kapısı önceki fazın ilgili regresyonunu korur. Faz 00 planı sonrasında app testleri gerçek toolchain’e bağlandı; Faz 01 sonuçları handoff’ta tutulur.

## Erişim, veri ve job doğrulaması

[AUTHORIZATION A01–A13](AUTHORIZATION.md) matrisi tüm server entry ve yeni tablo türlerinde genişletilir. Unit test permission kararını; gerçek PostgreSQL integration test RLS/privilege/composite FK ve transaction yarışını; browser test istek→sunucu→DB→yeniden yükleme akışını doğrular. Tek başına UI düğmesinin kaybolması güvenlik testi değildir. Ham runtime DB bağlantısıyla eksik context/rol bypass girişimi ayrıca denenir.

Kaynak hash/version, annotation konum, citation sırası/UUID farkı, soft delete/purge ve export manifest'i kontrol edilir. Job enqueue/dispatch/result/delivery iptal yarışları, process kill/lease expiry, duplicate request ve outbox delivery retry gerçek süreçlerle denenir. Yetkisiz snippet, count, notification title veya stale download kritik hatadır.

## Browser ve erişilebilirlik matrisi

Her fazın ilgili S01–S17 ekranlarında 390/768/1024/1440 CSS px, light/dark, empty/loading/error/normal, keyboard ve touch karşılıkları hedeflenir. Ayrıca 200% zoom, 320 CSS px reflow, uzun başlık/kaynak/denklem ve sanal klavye ele alınır. Modal focus trap/Escape/restore, sidebar/AI karşılıklı açılma, PDF scroll, tab overflow ve thread/AI alan bütçesi özellikle doğrulanır. Gerçek ekran okuyucu, label ve contrast kontrolleri mekanik scanner ile desteklenir; sadece screenshot yeterli değildir.

Kaynakta D01–D08 açıkları [audit](design/REFERENCE_AUDIT.md) içinde. Faz 00 dört genişlikte sınırlı inceleme yaptı; tüm matris PASS değildir. Implementasyonda semantik/focus davranışı tekrar test edilmelidir.

## Operasyon, güvenilirlik ve release kanıtı

Deployment testi yalnız kullanıcı o faza yetki verdikten ve ayrı Atlas hedefi belirlendikten sonra yapılır. Liveness/readiness, migrator/runtime ayrımı, image/schema rollback, worker recovery, restart sonrası kalıcı file/DB bütünlüğü ve dış hedef restore'u [COOLIFY_PLAN](COOLIFY_PLAN.md) uyarınca kanıtlanır. Backup oluşması recovery testinin yerine geçmez.

Önerilen pilot performans kapısı: test ortamı/örnek veri ve concurrency kaydedilerek, AI/PDF işlemesi hariç tipik özel liste/detail isteklerinde p95 ≤1 saniye, document save acknowledgement p95 ≤2 saniye; 10 eşzamanlı aktif araştırmacıda hata ve kaynak tüketimi raporlu. Bunlar ölçülmüş kapasite değildir; yavaş cihaz/ağ ayrımı ayrıca raporlanır. Faz 05 yük seti gerçek pilot hacmine yaklaştırılır; başarısız hedefin etkisi ürün sahibiyle release kararında açıkça ele alınır.

Öncelik: P0 çapraz-tenant/secret sızıntısı veya yaygın veri kaybı; P1 araştırma yolunu bloke eden/sık veri kaybı yaratan kusur; P2 recoverable aksaklık; P3 kozmetik. G05 açık P0/P1 ile geçmez. Kontrast/klavye kusuru temel akışı engelliyorsa blocker sayılır. Sonradan eklenen istisnalar sessiz PASS yapılmaz.

## Kanıt kayıt biçimi

Her PR: amaç/faz; exact commit ve ortam; koşan kontroller PASS/FAIL/NOT RUN; sentetik fixture kimliği; bulunan kusur ve düzeltme; DB/deployment etkisi; kalan kabul işi. Screenshot/log yalnız gerekli ve temizlenmiş veri içerir. Gerçek PDF, kişisel bilgi ve provider çıktısı commit edilmez. GitHub Actions yokken gerçek yerel kanıt yeterli süreçtir; hayali required check oluşturulmaz.
