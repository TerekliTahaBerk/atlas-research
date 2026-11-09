# Faz 03 teslim kaydı

Durum: [PR #35](https://github.com/TerekliTahaBerk/atlas-research/pull/35) normal squash merge ile main’e alındı: [`4a013d28548fea4f997ed4d1c12c33ed7391efb1`](https://github.com/TerekliTahaBerk/atlas-research/commit/4a013d28548fea4f997ed4d1c12c33ed7391efb1). Yerel kısa kontroller PASS; aynı Atlas Coolify uygulamasına dağıtım ve canlı kısa yolculuk da PASS. Bu belgeyi tamamlayan takip PR’ı yalnız gözlenen teslim kanıtıdır; uygulama image’ını yeniden değiştirmez. Kapsamlı G03 kabulü PASS sayılmaz; [beta öncesi liste](BETA_REVIEW_BACKLOG.md) açıktır.

## Çalışan ürün

- Gerçek proje dokümanları: oluşturma/adlandırma/liste/açma, owner/admin arşiv/geri getirme, viewer salt okunur/export. Tiptap JSON sözleşmesi; başlık, paragraf, bold/italic, liste, link, alıntı, kod bloğu, satır içi/blok KaTeX matematik.
- Kaynak veya PDF notundan doküman; gerçek Source/SourceVersion/Annotation kimlikli atıf ve aynı-proje bağlantılar/geri bağlantılar. Atıf eski PDF sürümü/sayfa/not konumuna döner. Yeni dosya eski atfı değiştirmez; metadata-only kaynağa sayfa uydurulmaz.
- 1.2 saniye gecikmeli, sunucu onaylı otomatik kayıt; gerçek Saved/Saving/Offline/Save failed durumları ve retry. Stable request UUID/hash receipt ile belirsiz yanıt tekrarında çift revision yok.
- İki oturumda revision çakışması ve yerel/sunucu karşılaştırması, iki kopyayı indirme ve açık seçimle kurtarma. User+project+document bazlı sessionStorage taslağı 24 saatliktir; açık çıkışta temizlenir. Tam offline/co-editing değildir.
- Mevcut içerik her kabul edilmiş kayıtta kalıcı; geçmiş otomatik olarak en çok dakikada bir, yazar değişiminde ve açık checkpoint/restore/kurtarmada alınır. Restore eski sürümü değiştirmeden yeni revision üretir.
- Görev Board/List, durum/öncelik/sorumlu/tarih, düzenleme/filtre, klavyeyle durum select’i ve bağlı kaynak/not/dokümana dönüş. Yalnız aktif editor+ ataması; downgrade/proje veya workspace iptalinde atomik unassign.
- Proje konuları, düz metin mesajlar, gerçek artifact kartları, own edit/owner-admin yönetimi, client UUID ile idempotent gönderim. Görev ataması, yanıt ve açık seçilen mention için uygulama içi bildirim; yalnız alıcı, güncel hedef izniyle çözülen başlık ve read/unread Inbox.
- Markdown dışa aktarma: biçimlendirme, matematik, gerçek bibliyografya ve citation/source/version/annotation/page UUID manifest’i. PDF byte’ı içermez.

[ADR 0005](decisions/0005-documents-and-collaboration.md) exact paketleri, kayıt sözleşmesini ve sınırları; [görsel referans denetimi](design/REFERENCE_AUDIT.md) tasarım kararlarını kaydeder.

## Kısa doğrulama

- Gerçek geçici PostgreSQL 18.6/ayrı runtime ve identity rolleri: kayıt/retry, conflict, immutable checkpoint/restore, source rename ve atıf kimliği, math+referans export, viewer/ilgisiz kullanıcı reddi, alıcı Inbox ayrımı, mesaj duplicate ve atama downgrade/proje/workspace iptali PASS.
- `npm run typecheck`, `npm run lint`, `npm run build`: PASS; son adayda tamamlandı.
- `npm run test:collaboration:browser`: PASS; production build + geçici PostgreSQL/SMTP/Chromium 1440×1000 ve 390×900. PDF notundan atıflı yazı, inline/blok math, metadata-only atıf seçimi, sunucu onaylı save, enjekte edilen 503 sonrası metin/retry, iki sekme çakışması/karşılaştırma/kurtarma, checkpoint/history preview, editor’a görev atama/durum değişimi, linked topic ve editor yanıtı, iki alıcı Inbox, tam PDF version/page/annotation’a dönüş, reload/re-login, viewer read-only/HTTP yazma reddi, yanlış proje HTTP 404, Markdown/math/DOI/manifest kontrolü.
- `npm test`: mevcut 6 unit kontrolü PASS.
- Sayfa kimliği/dolu içerik/framework overlay/page/ilgili console hatası ve yatay taşma kontrolü PASS. Enjekte edilen 503 beklenen hata senaryosudur. Masaüstü/dar ekran görüntüleri incelendi; görünür uzun başlık ve select kırpılması düzeltildi. Tam tema/tarayıcı matrisi yapılmadı.

Tarayıcı doğrulaması Browser plugin bulunmadığı için repo Playwright Chromium yöntemiyle yapılır. Yalnız kontrollü sentetik proje/kullanıcı/PDF kullanılır; ekran görüntüleri/özel dosyalar repo’ya eklenmez. Yerel SMTP yalnız test fixture’ıdır, gerçek e-posta teslimi değildir.

## Yayın ve korunan sınırlar

Çalışma branch’i: `feat/phase-03-documents-collaboration`. Başlangıçta `main` temiz ve PR #32/#34 merged, açık PR yoktu; canlı `eef7c3bff948d7932fc9cb39e4156b8a7928a9f7` / schema 005 doğrulandı. Additive yeni şema: `202611090006_collaboration`.

Hedef aynı [Atlas HTTPS uygulaması](https://om2lefhyk80lxthwkqe2qi3f.91.99.118.96.sslip.io), Coolify yula.co/production. Mevcut Compose/volume/secret kaynakları değişmez; yeni servis, Redis, realtime altyapısı veya ücretli hizmet yok. E-posta ve S3 kapalı kalır. Sunucu/proxy/diğer uygulamalar değiştirilmez. Yeni şema için pre-006 image rollback doğrulanmış sayılmaz.

## Gözlenen canlı sonuç — 9 Kasım 2026

- İşlevsel [PR #35](https://github.com/TerekliTahaBerk/atlas-research/pull/35) squash commit’i `4a013d28548fea4f997ed4d1c12c33ed7391efb1` canlıya alındı. Coolify dağıtımı `gd3ajrlfuzmo8bqodwq3zk1x`: 2026-11-09 15:15:29 UTC başlangıç, gözlenen durum Success.
- HTTPS `/health/ready`: **200 / ready**, release tam olarak `4a013d28548fea4f997ed4d1c12c33ed7391efb1`, schema `202611090006_collaboration`. Bu uygulama release/readiness kanıtıdır; gerçek image ID/digest denetimi değildir.
- Mevcut kontrollü Faz 02 projesindeki PLOS makalesi, PDF sürümü 2 ve iki eski annotation korundu. Sayfa 2 notu → yeni kaynaklı doküman → metin + `p < 0.05` KaTeX ifadesi → sunucu Saved/revision 3 → kendine atanmış In progress görev → doküman/görev/PDF notu kartlı konu + kaydedilmiş yanıt → Inbox görev ataması → doğru görev yolu PASS.
- Konu yeniden açıldığında yanıt duruyor; konu kartından dokümana ve atıftan **aynı PDF version / sayfa 2 / annotation** konumuna dönüldü. PDF canvas, sürüm 2 ve iki not yeniden gözlendi. Doküman tekrar açılınca metin/math/citation ve geri bağlantılar korundu.
- Canlı Markdown tarayıcıdan indirildi: kaydedilen yazı, matematik, gerçek DOI `10.1371/journal.pbio.1002106`, sürüm ve annotation UUID’leri ve `page:2` manifest’i doğrulandı. Dosya/PDF veya fixture hesabı repo’ya eklenmedi.
- Kullanıcının Chrome oturumunda 1920×873/koyu tema doküman incelendi: sidebar **240**, üst bar **48**, document alanı **740 px**, ana sayfa yatay taşma false; ilgili console/page hatası gözlenmedi. Çalışan kontrollü doküman tarayıcıda açık bırakıldı. Yerelde ayrıca 1440×1000/açık ve 390×900 doküman/görev/tartışma görüntüleri incelendi; bu tam tema/cihaz matrisi değildir.
- Canlı kısa kontrol mevcut tek hesapla/kendine atamayla yapıldı. Ayrı owner/editor/viewer akışı, reply bildirimi, conflict ve erişim iptali kontrolleri **yerelde gerçek PostgreSQL/Chromium’da** geçti; kapsamlı canlı çoklu kullanıcı denetimi yapıldı sayılmaz. Bu fazda canlı oturum iptali, bağımsız restore veya rollback yapılmadı.
- Compose, kalıcı `atlas-postgres`/`atlas-private-files` volume’ları, mevcut hesaplar/PDF’ler/notlar ve secret değerleri değiştirilmedi. Yalnız Atlas source commit pin’i ve `ATLAS_RELEASE` eşitlendi. Mail/S3 kapalı; sunucu/proxy/diğer uygulama ayarlarına dokunulmadı.

## Sınırlamalar / ertelenenler

- Co-editing, AI üretimi, LaTeX compile, Python/notebook ve Faz 04 yok.
- Sürüm geçmişi her tuşu saklamaz; mevcut son yazı her kabul edilen kayıtta tutulur. Cihaz taslağı tarayıcı/sekme depolamasına bağlıdır; sunucu yedeği değildir.
- Listeler 200 doküman/konu, 300 görev, 100 Inbox kaydı; konu ilk 500 mesajı gösterir ve sınırı bildirir. Büyük proje sayfalama/retention geliştirmesi beta incelemesindedir.
- Kapsamlı güvenlik/yük/tüm tarayıcı/ayrıntılı erişilebilirlik, bağımsız DB+PDF restore ve uyumlu image ile canlı rollback NOT RUN/ertelenmiş. E-posta teslimi ve bağımsız hedefte yedekleme açık kabul maddeleridir.
