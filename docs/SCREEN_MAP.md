# Ekran ve eylem haritası

Route'lar uygulama için öneridir, oluşturulmuş endpoint değildir. Prototip karşılığı [REFERENCE_AUDIT](design/REFERENCE_AUDIT.md), akışlar [USER_FLOWS](USER_FLOWS.md), izinler [AUTHORIZATION](AUTHORIZATION.md) içindedir. “Görüldü” yalnız prototip görünümüdür.

| ID / ekran / önerilen route | Eylem ve akış | İzin / veri | Boş → yükleniyor → hata/kurtarma | Faz / kabul | Prototip kanıtı |
| --- | --- | --- | --- | --- | --- |
| S01 Auth `/sign-in`, `/sign-up`, `/reset` | Kayıt, doğrulama, giriş, çıkış, reset; F01 | Anonim auth işlemi; kendi User/Session | Yeni hesap → gönderiliyor → genel hata/tekrar; token süre sonu | 01 / G01: üniversitesiz hesap ve iptal edilen oturum | HTML auth modal; canlı yol NOT RUN |
| S02 onboarding `/onboarding` | Kişisel W0; shared isteğe bağlı; F01/F02 | Kendi hesap ve workspace oluşturma | Başlangıç → atomik oluşturma → girdiyi koruyan hata | 01 / G01: retry tek W0 | HTML onboarding; yeniden sadeleştirme gerekli |
| S03 Home `/home` | Proje seç/oluştur, son işleri aç; F02 | Yalnız görünür projeler, kendi son işler | Create card → skeleton → retry/izin dışı kartı kaldır | 01 / G01: A/B ekip listeleri ayrışır | Canlı görüldü |
| S04 Overview `/w/:w/p/:p` | Proje özeti, bağlantılar, arşiv | P viewer; Project/ArtifactLink | İlk kaynak CTA → özet yükü → güvenli unavailable | 01 temel, 02–04 bağlar / G01–G04 | Menü/source tanımı var; canlı içerik incelenmedi |
| S05 Members/Invite `/w/:w/p/:p/members`, `/invite/:token` | Davet/rol/iptal; F03 | P owner/admin; kabulde eşleşen kullanıcı | Üye yok → kaydediliyor → expired/wrong account/retry | 01 / G01: tek kabul, iptal sonrası deny | Share görsel/source; güvenli kabul ekranı yeni |
| S06 Research `/w/:w/p/:p/discover` | Arama, metadata incele, kaydet; F04 | Viewer arar; editor ekler; Source | Sorgu CTA → sonuç skeleton → provider hata/elle giriş | 02 / G02: gerçek arama veya açık hata | Canlı görüldü; AI sentez Faz 04 |
| S07 Library `/w/:w/p/:p/sources` | Koleksiyon/tag/status, kaynak detay, BibTeX/RIS | Viewer okur/export/kendi reading state; editor ortak metadata/tag değiştirir | İlk kaynak → sayfalı liste → retry, duplicate mevcut kaynak | 02 / G02: tekrar girişte kalıcı liste | Canlı görüldü |
| S08 Import dialog | DOI/link/elle/PDF; F05 | Editor; UploadIntent/SourceVersion/FileObject | Girdi → yükleme/işleme → retry/cancel, hata nedeni | 02 / G02: orphan dosya cleanup, yeni sürüm | Import/Add düğmeleri; gerçek upload yeni |
| S09 Reader `/w/:w/p/:p/sources/:s/versions/:v` | PDF oku, anchor/not/cite; F06 | Viewer okur; editor annotation yazar | Metadata-only → sayfa yükü → bozuk PDF/elle sayfa notu | 02 / G02: SV1 konumu reload sonrası aynı | Canlı p.3 ve Notes görüldü; gerçek PDF yok |
| S10 Document `/w/:w/p/:p/docs/:d` | Matematik, cite, save/version/restore, export; F07/F11 | Viewer okur/export; editor sürüm yazar | Start writing → saving → retry/conflict/yerel kopya | 03 / G03: iki yazar kaybı yok | Canlı Related work görüldü |
| S11 Tasks `/w/:w/p/:p/tasks` | Board/list, ayrıntı, atama, link; F08 | Viewer okur; editor görev yazar; assignee aktif editor+ | İlk görev → liste → stale revision/retry | 03 / G03: görev↔D1/A1 geri dönüş | Canlı Board görüldü |
| S12 Discussion `/w/:w/p/:p/discussions/:thread` | Mesaj/thread, kaynak/görev/doküman kartı; F09 | Viewer okur; editor mesaj yazar | İlk tartışma → mesajlar → tekrar/iptal, taslak koru | 03 / G03: aynı projede link; DM yok | Canlı Channels/thread görüldü; sadeleştirilecek |
| S13 Inbox `/inbox` | Okunmamış, bildirimi aç/okundu işaretle | Kendi Notification + hedef için güncel izin | Caught up → skeleton → erişimi kaybolmuş hedef redakte | 03 / G03: başlık sızıntısı yok | Menü görüldü/source; canlı içerik NOT RUN |
| S14 AI panel `/w/:w/p/:p/ai/:conversation` | Scope seç, sor, kanıt aç, proposal; F10/F11 | Kendi konuşması + tüm kaynaklarda P viewer; uygulamada editor | Kaynak seç → queued/working → insufficient/limit/retry | 04 / G04: citation ve support ayrı ölçülür | Canlı panel/citations/context warning görüldü |
| S15 Settings `/settings`, `/w/:w/settings` | Profil/tema, üyelik/owner devri, storage/AI paylaşım politikası | Kendi hesap; workspace yönetişimi W owner/admin | Ayar yok → saving → alan hatası, tekrar | 01 temel, 04 AI politikası / G01/G04 | Source; canlı NOT RUN |
| S16 Unavailable / arşiv/tombstone | Derin link, erişim kaybı, arşiv/silme | Varlığı açıklamadan deny; izinli arşiv salt okunur | N/A → izin kontrolü → güvenli dönüş | 01–04 / tüm kapılar | Üretim hata ekranları yeni |
| S17 Export/proposal dialog | Aralık seç, diff incele, başlat/indir | Güncel okuma; uygulamada hedef editor; ExportJob/AIProposal | Seçim → hazırlanıyor → expire/deny/retry/conflict | 02 kaynak, 03 doküman, 04 proposal | Düğmeler var; kalıcı job/diff ekranı yeni |

## Ortak durum sözleşmesi

Her özel ekran izin kontrolü tamamlanmadan eski proje içeriğini göstermez. Skeleton içerik boyutunu korur, erişilebilir durum metni verir. Empty state gerçek kayıt yokluğudur; filtre sonucu yoksa filtre sıfırlama ayrı sunulur. Error state eylem, tekrar deneme ve request ID verir; içerik/secret loglamaz. Forbidden ve bulunamadı anonim dış kullanıcıya aynı yanıtı verir. Oturumu düşmüş kullanıcıda taslak kaybı yaratmadan yeniden giriş yolu sunulur.

Beta tüm etkileşimlerde [DESIGN_SYSTEM](design/DESIGN_SYSTEM.md) klavye/focus kurallarını izler. UI gizlemek sunucu kontrolünün yerine geçmez.

## Gelecek ekranları ve prototip araçları

Manuscript/LaTeX, Experiments/notebook, Semantic Map, Knowledge graph, kurum SSO/yönetimi, gelişmiş DM ve ödeme/pricing beta ürün navigasyonuna alınmaz. Temel matematik editörü S10'dadır. Kaynak arama S06'da, basit bağlantılar S04/S09–S12'dedir; graph ekranı gerektirmez. Design system, Mobile screens ve Tweaks prototip inceleme araçlarıdır. Sonraki sürüm sırası [ROADMAP](ROADMAP.md) tarafından belirlenir.

## Implemented Phase 03 routes

S10: `/w/:w/p/:p/docs` and `/docs/:id`; S11: `/tasks` and `/tasks/:id`; S12: `/discussions` and `/discussions/:id`; S13: `/inbox`. S17 document export is authorized Markdown on the document API. PDF citation locators reuse `/sources/:id/read?version=:v&page=:n&annotation=:a`. These extend the existing shell; historical suggested routes above are not duplicate endpoints.

S14 update (10 November owner instruction): the shared application controller hosts compact composer, expanded floating, modal focus and 392 px docked presentations. All use the same conversation, context preview, history and run endpoints. A narrow viewport uses the same surface with modal focus and visual-viewport sizing.
