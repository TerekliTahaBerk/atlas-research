# Faz 00 teslim ve devam kaydı

Tarih: 9 Kasım 2026, Europe/Istanbul. Durum: ürün/tasarım/mimari paketi tamamlandı; `feat/phase-00-foundation` üzerinden `main` hedefli PR incelemesine teslim. Faz 01 başlamadı. Uygulama, infrastructure provisioning, migration, deployment veya gerçek AI yok. PR bağlantısı ve gözlenen push sonucu son teslim mesajında verilir; bu belge gelecekteki merge/deploy iddiası değildir.

## Teslim kapsamı ve tek bilgi kaynakları

| Prompt maddesi | Teslim ve yetkili bilgi kaynağı |
| --- | --- |
| 1 — ürün | [PRODUCT_SPEC](PRODUCT_SPEC.md): kullanıcı/problem, karar kökenleri, beta matrisi, J1, M1–M7; faz/beta sınırının yetkili kaynağı [ROADMAP](ROADMAP.md) |
| 2 — yolculuk/ekran | [USER_FLOWS](USER_FLOWS.md): F01–F11, J1.1–J1.11 ve alternatifler; [SCREEN_MAP](SCREEN_MAP.md): S01–S17, eylem/izin/veri/durum/faz/kapı |
| 3 — tasarım | [DESIGN_SYSTEM](design/DESIGN_SYSTEM.md): gerçek token/ölçü ve uygulama düzeltmeleri; [REFERENCE_AUDIT](design/REFERENCE_AUDIT.md): D01–D08 ve gözlenen/test edilmeyen ayrımı |
| 4 — mimari/veri/yetki | [ARCHITECTURE](ARCHITECTURE.md), [DATA_MODEL](DATA_MODEL.md); roller ve server/RLS/revocation kurallarının tek yetkili kaynağı [AUTHORIZATION](AUTHORIZATION.md); [ADR 0001](decisions/0001-deployment-and-database.md), [0002](decisions/0002-authentication.md), [0003](decisions/0003-tenancy-and-authorization.md), [0004](decisions/0004-files-jobs-and-realtime.md) |
| 5 — AI/atıf | [AI_AND_SOURCE_CONTRACT](AI_AND_SOURCE_CONTRACT.md): sürüm/konum/provenance, scope/izin, sharing, evidence/abstention, proposal, quota ve gerçek makale eval |
| 6 — operasyon/test | [COOLIFY_PLAN](COOLIFY_PLAN.md): build/runtime/network/migration/rollback/DB+files backup/restore; [VERIFICATION_PLAN](VERIFICATION_PLAN.md): gerçek ve gelecekteki kontrol kapıları |
| 7 — fazlar | [00](phases/PHASE_00.md), [01](phases/PHASE_01.md), [02](phases/PHASE_02.md), [03](phases/PHASE_03.md), [04](phases/PHASE_04.md), [05](phases/PHASE_05.md): kapsam, dışı, önkoşul, bağımlı PR dilimleri, G00–G05 ve bitiş |
| 8 — teslim/tutarlılık | Bu belge; [yerel checker](../scripts/verify_phase00.py), README güncellemesi; eski restart/repository status kaydı tarihsel olarak korunur |

## Güncel tasarım kaynağı

Güncel kullanıcı hesabındaki Atlas.dc.html ve Atlas Handoff.md indirildi; kullanıcı iki dosyanın kamuya açık repoda yayımlanmasına açık izin verdi. [Snapshot ve manifest](design/reference/README.md) özgün ve yayımlanan SHA-256/byte değerlerini içerir. HTML'de kişi/e-posta etiketleri demo değerleriyle değiştirildi; CSS/davranış satırları korunur. Unmodified kişisel verili HTML commit edilmedi. Handoff değişmeden tutuldu fakat eski olduğundan normatif tasarım sistemi sayılmadı.

Home, Research, Library, PDF Reader, Document, Tasks, Channels ve AI canlı görüldü. Dört genişlikte yapılan sınırlı incelemenin tam kapsamı audit'tedir; bütün ekran/tema/klavye matrisinin geçtiği iddia edilmez. Snapshot'ın support/design-system/font bağımlılıkları kopyalanmadı; bu offline çalışan uygulama değildir. Piksel eşliği iddiası yoktur.

Önemli bulgular: Channels'ta 1440px'de bile fazla panel ana mesaj alanını daraltıyor; çoklu AI sunumu/scope değişimi sadeleştirilmeli; eski handoff renk/ölçüleri güncel değil; gerçek token çiftlerinde iki normal-metin kontrast eşleşmesi hedefin altında; input focus ve reduced motion eksikleri var. Bunlar ilgili implementasyon kapılarında zorunlu düzeltme olarak kaydedildi.

## Gerçek doğrulama kaydı

Aşağıdaki belge kontrolleri teslim commit'inden önce yerelde koşturuldu. Uygulama testleri mevcut değildir.

| Kontrol | Sonuç | Kanıt / sınır |
| --- | --- | --- |
| Başlangıç talimatları ve branch | PASS | AGENTS/README/prompt/roadmap/restart/reference/ADR 0001/contributing okundu; başlangıç çalışma ağacı temiz; hazırlanmış origin branch'ine geçildi |
| Güncel referans ve gizlilik | PASS | Authenticated canlı referans + dosya indirme; byte/hash farkıyla eski kopyalar ayrıldı; izin ve demo temizliği kaydı |
| Browser tasarım incelemesi | PASS, sınırlı | Audit'teki ekranlar ve 390/768/1024/1440 görünüm örnekleri; sadece tasarım/prototip |
| Tam tasarım uyumu | FAIL, referans bulguları | D01/D03–D06 açık; bu uygulamanın koşulmuş testi değildir; sonraki faz kabulünden düşürülmedi |
| Yerel doküman checker | PASS | `python3 scripts/verify_phase00.py`: 8 kontrol grubu; 140 yerel Markdown dosya bağlantısı; required docs/fazlar/J1/screens/hash/privacy/scope/JSON |
| `git diff --check` | PASS | İlk staged kontrolde snapshot içindeki 3 whitespace-only satır FAIL verdi; kamuya açık kopyada normalize edilip hash güncellendi, tekrar staged kontrol PASS |
| Manuel tutarlılık ve kapsam incelemesi | PASS | Aşağıdaki çapraz inceleme tamamlandı; davetle temel workspace üyeliği ve viewer'a özel reading-state istisnası açıklaştırıldı |
| Archive/legacy manifest değişmezliği | PASS | Archive head/tree ve 25 parent SHA manifest'le aynı; AGENTS/contributing/prompt/legacy manifest baseline'a göre değişmedi |
| App install/lint/unit/build/browser kalıcılık | NOT RUN | Uygulama/toolchain yok; belge checker'ı app testi değildir |
| RLS/iki ekip/revocation testleri | NOT RUN | A01–A13 yalnız plan; DB/migration yok |
| Auth/PDF/AI/embedding | NOT RUN | Referans etkileşimleri gerçek hizmet sayılmadı; provider çağrısı/anahtar yok |
| Coolify/migration/deploy/restore/rollback | NOT RUN | Host veya mevcut kaynak üzerinde hiçbir operasyon yapılmadı |

## Tutarlılık incelemesi

İncelenen bağlantılar: J1.1–J1.11'in S01–S17 karşılığı; beta matrisinin ROADMAP ile eşliği; G01–G05'in ekran/akış/veri fazları; workspace-admin-private-deny ve açık proje üyeliğinin tüm belgelerde korunması; SourceVersion/citation/annotation kimliklerinin kalıcılığı; same-project link/assignee; private AI conversation + explicit apply; üyelik iptalinde job/retrieval/export recheck; runtime/auth/migrator/queue rol ayrımı; ücretli Actions/Redis/microservice zorunluluğunun olmaması; DB+files birlikte recovery; snapshot'ın referans oluşu ve eski handoff'un öncelikli olmaması.

Uygulama öncesi kararlar ilgili tek kaynağa bağlandı; bilinen riskler kanıt olmadan kapanmış sayılmadı. Snapshot redaksiyonunda 2288 satırın korunduğu, 41 redaksiyon + 3 boşluk temizliği satırının style/class attribute'larının aynı kaldığı ve özgün hesap ad/e-posta etiketinin kalmadığı ayrıca karşılaştırıldı. Manuel inceleme mimarinin uygulamada doğrulandığı anlamına gelmez.

## Açık noktalar ve sahipleri

| Açık nokta | Sorumlu / ne zaman | Engellediği kapı |
| --- | --- | --- |
| Exact paket/Node/PostgreSQL patch/image digest ve uyumluluk smoke | Faz 01 implementasyon sorumlusu, P01-1; resmi kaynaklar yeniden doğrulanır | G01; Faz 00 kurulum gerektirmez |
| Kontrast role düzeltmesinin kesin eşleşmesi, focus/reduced motion, channel panel alanı | P01-4 ve P03-5/P04-4; DESIGN_SYSTEM ölçüme bağlı düzeltme | G01/G03/G04 |
| Atlas'a ait Coolify host/domain/TLS, kaynak bütçesi ve bağımsız bucket/sağlayıcı/bölge | Ürün sahibi + ops, P01-5 öncesi | İlk deploy; şu an kaynak yok |
| SMTP teslim hedefi/credentials ve gerçek mail testi | Ürün sahibi + implementasyon, P01-4 | G01 |
| Backup retention/RPO/RTO/purge sürelerinin operasyon kabulü | Ürün sahibi + ops, P01-5 ve G05 hacim provası | G01/G05 |
| Akademik metadata sağlayıcısının API/koşul/kota seçimi, parser/editör/math paketleri | P02-2/4 ve P03-1; resmi araştırma ve pin | G02/G03 |
| Provider/model/veri koşulları, kullanıcı paylaşım onayı, AI bütçesi ve gerçek makale seti | Ürün sahibi + P04-1/5 | G04 |
| pgvector gerekip gerekmediği | P04-2 retrieval ölçümü; gerekiyorsa yeni ADR | G04; bugün bağımlılık değil |
| Pilot katılımcılar ve destek/incident sorumlusu | Ürün sahibi, P05-1 | G05 |
| Repo genel lisansı | Ürün sahibi; bu çalışma lisans/visibility değiştirmedi | Sonraki dağıtım kararları; source publication izni ayrıca mevcut |

## Faz 01'in ilk somut işi ve durma sınırı

Yeni kullanıcı talimatı geldiğinde **P01-1**: resmi engine/peer/security/lisans bilgileriyle aday sürüm matrix'ini kesinleştir; exact pins ve reproducible toolchain kararıyla minimal monolit scaffold'ı ve disposable yerel auth/session/Prisma transaction smoke'unu ayrı scoped PR'da kur. Proje izinleri P01-3'te gerçek DB testleriyle eklenir. Coolify deployment P01-5'e ve somut Atlas hedefi/backup kararına bağlıdır.

Faz 00 belgeler açısından Faz 01'i planlamaya hazırdır; kurulmuş toolchain veya üretime hazır ürün değildir. Bu teslim commit/push ve PR'dan sonra durur, otomatik merge etmez ve Faz 01'e geçmez.
