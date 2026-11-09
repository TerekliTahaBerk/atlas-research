# AI ve kaynak sözleşmesi

Durum: Faz 04 için normatif plan; Faz 00'da model/provider hesabı, API key, gerçek çağrı veya embedding üretilmedi. Veri modeli [DATA_MODEL](DATA_MODEL.md), yetki [AUTHORIZATION](AUTHORIZATION.md), arayüz [DESIGN_SYSTEM](design/DESIGN_SYSTEM.md).

## Kaynak ve konum kimliği

`Source` bibliyografik eser kaydıdır; `SourceVersion` o projede kullanılan immutable metadata/dosya içeriğidir. Bir PDF yenilenince yeni version UUID ve checksum oluşur; eski annotation/citation eski sürümde kalır. DOI eseri tanımlamaya yardım eder, yüklenen dosyanın sürümünü/konumunu doğrulamaz.

Her annotation/citation/evidence kaydı şunları taşır:

- Workspace/project, source ve source version UUID; dosya SHA-256 veya metadata-only işareti.
- PDF için 1 tabanlı fiziksel sayfa indeksi ve varsa görünen sayfa etiketi ayrı alanlarda; text quote exact/prefix/suffix, extraction text offset + extractor revision, normalize page rectangle listesi. HTML/link kaynağı için frozen excerpt locator + alınma zamanı; yalnız mutable web URL kanıt sayılmaz.
- Alıntı, quote hash ve konum güven durumu: verified / unresolved / metadata_only. Bir alıntı elle düzeltilirse provenance ve kontrol sonucu yenilenir.
- DOI/link/provider/manual/PDF ekleme yöntemi, metadata alanının kaynağı, retrieval/extraction zamanı ve parser revision. Lisans/erişim kapsamı biliniyorsa kaydedilir; bilinmiyorsa “bilinmiyor”.

Citation UUID sabit kimliktir; dokümandaki `[1]` sırası değişebilir. AI citation'ı yanıt segmenti, source version, locator ve kullanılan evidence excerpt'e bağlanır. Tıklama doğru sürümün doğru sayfa/konumunu açar; çözüm başarısızsa “konum doğrulanamadı” görünür, benzer pasaj sessizce hedef yapılmaz. Source kaldırılınca daha farklı sürüme retarget yapılmaz.

**Konum doğruluğu ile bilimsel destek farklı kontrollerdir.** Bir alıntı gerçekten sayfa 3'te olabilir, fakat AI'nın iddiasını desteklemeyebilir. Exact locator/checksum kontrolü otomatik; iddia–kanıt desteği bağımsız insan rubric'i ve gerektiğinde ek otomatik kontrol ile değerlendirilir. Birinin geçmesi diğerinin geçtiği anlamına gelmez.

## Retrieval ve dışarıya içerik gönderimi

Konuşma tek projeye ve kullanıcısına aittir. Scope, seçilmiş hazır source version listesi olarak sorgu başında dondurulur. Tüm-proje seçimi de gönderim anında bu listeye açılır. Client'tan gelen IDs erişim sağlamaz: account/session, membership, archive, her kaynak ve sürüm server'da kontrol edilir. Arama sıralaması, sayımlar ve snippet'ler izin filtresinden sonra üretilir. Başka projenin parçası, benzer makale veya aynı DOI ortak retrieval havuzuna alınmaz.

İlk yaklaşım PostgreSQL metadata/full-text + seçili excerpt retrieval'dır. Faz 04 temsilî makale setinde kanıt bulma başarısızlığı ölçülürse pgvector için yeni ADR açılır; extension, embedding modeli/sürümü, vector scope/purge, maliyet ve negatif erişim testleri birlikte değerlendirilir. Şimdiden embedding veya pgvector zorunluluğu yoktur.

Workspace'te dış provider'a metin gönderme varsayılan kapalıdır. Owner politika ve izinli provider/veri koşullarını ayarladığında kullanıcı her sorguda hangi source version/excerpt'lerin paylaşılacağını görür; ilk kullanımda açık onay verir. Kendi upload'u olmayan ekip dosyaları için workspace politikası ve kaynak paylaşım hakkı birlikte gerekir. Metin göndermeye izin yoksa AI uygun bir açıklamayla kapalı kalır; metadata-only arama devam eder. Kapsamdan fazlası, üyelik e-postaları, tüm workspace veya ilişkisiz dokümanlar gönderilmez.

Provider seçimi Faz 04'te kullanım koşulu, retention/training politikası, bölge, self-host model seçeneği, maliyet ve kalitesiyle değerlendirilir. Bu belgede uyum/retention garantisi verilmez; seçimden sonra resmi koşullar tekrar doğrulanır. Şimdiki sözleşme hiçbir sağlayıcı hesabı gerektirmez.

PDF/HTML içerikleri ve kullanıcı dokümanları güvenilmeyen veridir; içlerindeki talimatlar sistem/tool komutuna dönüşmez. Modelin harici tool, URL fetch, dosya veya görev çalıştırma yetkisi yoktur. Kaynak metni ayrı data bölmesindedir. Provider dispatch ve result/delivery öncesi izin kontrolü [AUTHORIZATION](AUTHORIZATION.md) uyarınca tekrar edilir. İlk beta response buffer'lanır, kontrollü tamamlanmış yanıt teslim edilir.

## Yanıt, hata ve öneri

Kaynaklar yetersizse uydurulmuş cevap/DOI/citation yerine açık yetersiz kanıt yanıtı verilir. Kısmi kanıtta sadece desteklenen bölümler yanıtlanır ve belirsizlik görünür. Metadata-only sonuç “tam metin incelendi” gibi sunulmaz. İddia referansının seçilmiş erişilebilir evidence listesinde bulunması ve locator'ın doğrulanması zorunludur. Uydurma, kapsam dışı veya artık erişilemeyen atıf varsa yanıt teslim edilmez; doğrulama hatası gösterilir, bounded retry veya kaynakları açma yolu sunulur.

AI dokümanı kendiliğinden değiştirmez. Proposal; hedef document ID/revision, önerilen değişiklik diff'i ve kaynak citation listesiyle kaydedilir. Kullanıcı “Uygula” dediğinde hedefte editor+ ve bütün kaynaklarda erişim yeniden kontrol edilir. Hedef revision değişmişse yeni diff istenir; kabul yeni DocumentVersion üretir, geri alma mümkündür. Reddetme belgeyi değiştirmez. Thread'e paylaşım aynı-proje evidence erişimi kontrolünden geçer; özel konuşma geçmişi paylaşılmaz.

Durumlar queued/working/complete/insufficient/validation_failed/cancelled/limited/provider_error. Timeout ve iptal için düzenleme kaybı olmaz. API anahtarı, raw prompt/response, özel excerpt ve provider request body loglara/fixture'lara alınmaz. Audit'te request/job ID, model konfigürasyon sürümü, evidence ID listesi, validation sonucu ve kullanım sayıları kısıtlı saklanır; içerik saklama yalnız private application verisidir.

## Kullanım sınırları

Önerilen pilot başlangıç limitleri: kullanıcı başına aynı anda 1, workspace başına 2 AI işi; sorguda en fazla 10 source version ve 20 excerpt; input/output token üst sınırı seçilecek modelin ölçümüne göre konfigürasyonla sabitlenir. Günlük kullanıcı isteği için 20 başlangıç önerisi ve workspace için ürün sahibinin belirlediği parasal tavan bulunur. Bunlar provider fiyat taahhüdü değildir; gerçek bütçe seçilmeden canlı çağrı açılmaz.

Kota rezervasyonu + job atomik oluşturulur. Aynı idempotency key ikinci rezervasyon oluşturmaz. Kullanılan miktar sonuçla settle edilir, dispatch öncesi iptal rezervasyonu release eder. Dispatch sonrası timeout'ta maliyet belirsiz kalabilir; gerçek tüketim geldiğinde uzlaştırılır, sınırsız otomatik retry yapılmaz. UI kalan kota, limit nedeni ve ne zaman tekrar deneyebileceğini gösterir. Kullanım tablosu proje içeriği barındırmaz.

## Gerçek makale değerlendirme planı — G04

Faz 04'te yasal erişimi ve alıntılama koşulları doğrulanmış en az 10 gerçek makale, farklı uzunluk/düzen/tablo/formül içerir. Özel PDF/provider response repo'ya konmaz. Repoya yalnız bibliyografik kimlikler, test metodolojisi ve içeriksiz skorlar girer; gerekiyorsa lisansı uygun kısa evidence seti ayrı onaylı fixture olur. Prototip makaleleri bilimsel eval seti değildir.

En az 40 değerlendirilen soru: 20 doğrudan/çoklu kaynak yanıtlanabilir, 10 yetersiz/çelişkili kanıt, 10 erişim/yanıltıcı kaynak talimatı vakası. Ek locator seti en az 50 sabit konum içerir. İnsan değerlendirici her yanıt iddiasını destekleniyor/kısmen/desteksiz/çelişkili diye ve citation konumunu ayrı skorlar; anlaşmazlıklar ikinci incelemeyle kaydedilir. Küçük örneklemde sonuçlar sayı+oran olarak raporlanır.

G04 hedefi: sunulan citation'ların %100'ü seçili izinli sürüm ve çözülür konumda; değerlendirilen yanıt iddialarının en az %90'ı tam destekli; 10 yetersiz/çelişkili vakanın en az 9'unda uygun abstention veya açık sınır; erişim/prompt-injection vakalarında **0 sızıntı ve 0 izinsiz eylem**. Kritik erişim veya uydurma atıf sorunu varsa ortalama kalite yüksek olsa da kapı geçmez. Kota, iptal, retry, proposal conflict ve revocation yarışları ayrıca A01–A13 matrisiyle geçer.

Başlangıç tüm model testi **NOT RUN**. Aday model değişimi, parser/extraction sürümü veya retrieval yaklaşımı değişirse bu set ilgili fazda yeniden çalıştırılır.

## Phase 04 implementation record (9 November 2026)

[ADR 0006](decisions/0006-grounded-ai.md) specifies the bounded PostgreSQL/Poppler evidence pipeline, OpenAI adapter, privacy/consent, conservative accounting and revision-safe proposals. [The handoff](PHASE_04_HANDOFF.md) distinguishes local synthetic checks, live closed-gate observations and pending real-model acceptance. The owner prohibits paid calls and has not chosen a budget; production calls stay disabled. The numeric G04 thresholds above are not relaxed. No Phase 05 work is authorized by this implementation record.
