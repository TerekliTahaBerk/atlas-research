# Atlas Research şifreli yedek ve geri yükleme

Şifreli bir set PostgreSQL özel biçim dump’ını ve aynı pencereye ait özel dosyaları taşır. `ops/atlas-recovery.mjs` bu seti üretir ve bağımsız kopyanın bütünlüğünü doğrular. Production kabulü için doğrulanan set ayrıca izole bir PostgreSQL ve dosya alanına geri yüklenir.

## Seti al

1. `/health/ready` üzerinden Atlas release ve şema revizyonunu kaydet. Yalnız bu uygulamanın veritabanı ve özel dosya volume’unu seç. Yeterli özel scratch alanı hazırla.
2. Uygulama ve worker yazılarını sınırlandır, aktif yükleme ve Compute işlerini boşalt. Bu pencere boyunca veritabanı ve dosya volume’unda yazı yapılmadığını doğrula. Veritabanına ayrı salt okunur `atlas_backup` rolüyle bağlan. Kaynak PostgreSQL ana sürümüyle uyumlu `pg_dump` ve `pg_restore`, `psql`, `tar`, Node.js ve `age` gerekir.
3. Mevcut age alıcı adresini ve libpq bağlantı ayarlarını güvenli operatör ortamından kullan. `PGHOST`, `PGPORT`, `PGDATABASE` ve `PGUSER` açık olmalıdır. Parola girişi için korumalı `PGPASSFILE` kullan. Kurtarma kimliğini yedek hedefinden ayrı tut.
4. Aşağıdaki değişkenleri ayarlayıp `node ops/atlas-recovery.mjs capture` çalıştır. Yazma sınırları doğrulama sona erince kaldırılır. Üretilen şifreli seti onaylı bağımsız depoya taşı ve süresini kaydet.

| Değişken | İçerik |
| --- | --- |
| `ATLAS_RECOVERY_CONFIRM` | Yazı sınırlandırması tamamlanınca `writers-fenced` |
| `ATLAS_RECOVERY_RELEASE` | HTTPS sağlık kontrolünde görülen tam Git commit’i |
| `ATLAS_RECOVERY_SCHEMA` | Veritabanı ve sağlık kontrolünde görülen Prisma revizyonu |
| `ATLAS_RECOVERY_FILES` | Uygulamanın özel dosya volume’u için mutlak yol |
| `ATLAS_RECOVERY_SCRATCH` | İzinleri `0700` olan mutlak geçici dizin, tercihen tmpfs |
| `ATLAS_RECOVERY_RECIPIENT` | Daha önce yetkilendirilmiş age alıcı adresi |
| `ATLAS_RECOVERY_BUNDLE` | Üretilen `.age` dosyası için boş mutlak yol |

Komut kaynak veritabanı, rol, salt okunur bağlantı ve şema revizyonunu denetler. Dosya kopyasını ikinci manifestle karşılaştırır. Mevcut hedefin üzerine yazmaz. Dışa verilen rapor sadece sayım, revizyon, boyut ve şifreli setin SHA-256 değerini içerir.

## Bağımsız kopyayı doğrula ve prova yap

1. Şifreli seti bağımsız hedeften geri indir. `ATLAS_RECOVERY_BUNDLE` geri indirilen dosyanın yoluna, `ATLAS_RECOVERY_IDENTITY` izole kurtarma ortamındaki `0600` izinli age kimliğine işaret etsin. Aynı özel scratch gereksinimiyle `node ops/atlas-recovery.mjs verify` çalıştır. SHA-256 değeri yakalama çıktısıyla eşleşmelidir.
2. Ayrı kurtarma ortamında boş PostgreSQL ve temiz özel dosya volume’u hazırla. Uygulamanın gerektirdiği ayrı rol ve sahiplikleri kur. Seti burada açıp `pg_restore --exit-on-error` ile yeni veritabanına uygula, özel dosyaları yeni volume’a yükle. Veritabanı hedefini ve volume adını komutu çalıştırmadan önce denetle. Canlı hedefe prova yapılmaz.
3. Şema revizyonu, özel dosya hash’leri, kaynak ve atıf bağlantıları, doküman geçmişi, görev ve tartışmalar, Compute çıktısı ve ledger kayıtlarını doğrula. İki ekiple izin ve sızıntı negatif kontrollerini çalıştır. RPO için setin yaşını, RTO için erişimden doğrulanmış geri dönüşe kadar zamanı kaydet.
4. Uygulama geri dönüşünde şemayla uyumlu kayıtlı imaj digest’lerini kullan. Veri geri yükleme ve imaj geri dönüşü ayrı operasyonlardır. [Yayın ve geri dönüş kılavuzu](../implementation/pricing-and-entitlements/ROLLOUT_AND_ROLLBACK.md)

Sentetik testte salt okunur rol ile alma, şifreleme, ayrı kopya doğrulaması, yeni PostgreSQL veritabanına geri yükleme, dosya hash’i, bozulmuş set reddi ve var olan hedefi koruma geçti. Bağımsız production hedefi ve gerçek production geri yükleme denemesi pilot kabul kaydında ayrıca işaretlenir. [Pilot yayın planı](../pilot/LAUNCH.md)
