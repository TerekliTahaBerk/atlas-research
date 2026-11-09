# Kullanıcı akışları

Bu belge [J1 senaryosunu](PRODUCT_SPEC.md) uygular. Ekran kimlikleri [SCREEN_MAP](SCREEN_MAP.md), roller [AUTHORIZATION](AUTHORIZATION.md), veri kimlikleri [DATA_MODEL](DATA_MODEL.md) içinde tanımlıdır. Tüm işlemler planlanmıştır; prototip etkileşimi kalıcılık kanıtı değildir.

## J1 uçtan uca iz

| Adım/akış | Kullanıcı ve eylem | Ekran / prototip karşılığı | Veri ve izin | Başarısızlık / kabul |
| --- | --- | --- | --- | --- |
| J1.1 / F01 | A e-posta/parolayla kayıt olur, doğrular; kişisel W0 otomatik açılır | S01 Auth, S02 onboarding; kaynak HTML'de modal tanımları, canlı yol bu denetimde çalıştırılmadı | User, Session, Workspace(personal), owner membership; yalnız kendi hesabı | Aynı kayıt tekrarı W0'ı çoğaltmaz; yanlış parola genel hata, doğrulama tekrar gönderilebilir; G01 |
| J1.2 / F02 | A W1 shared ve P1 oluşturur; bireysel dal P0'da kalır | S03 Home → S04 Overview; Home'da New/project kartı var, gerçek workspace oluşturma tasarlanacak | W1 owner, P1 owner; P1 için açık ProjectMember | Başlık hatası alan yanında; ağ hatası girdiyi korur; izin olmadan oluşturma yok; G01 |
| J1.3 / F03 | A, B'ye P1 editor daveti oluşturur; B kendi doğrulanmış e-postasıyla kabul eder | S05 paylaşım/davet; prototip Share görseli var, gerçek token kabul ekranı yeni | Invitation → WorkspaceMember(member) + ProjectMember(editor), atomik | Yanlış hesapta kabul yok; süresi geçmiş/iptal davet yeni davet ister; ikinci kabul idempotent; G01 |
| J1.4 / F04 | A Research'te sorgular, sonucu P1 kütüphanesine kaydeder; DOI/link/elle/PDF alternatifleri | S06 Research → S07 Library | Source(SA/SB), metadata provenance, project editor | Sağlayıcı yoksa tekrar/elle ekleme; DOI eşleşmesinde mevcut kaynağa yönlendir; G02 |
| J1.5 / F05 | A izinli PDF'yi yükler; dosya doğrulanır, sürüm hazır olur | S08 import → S09 Reader; Import PDF var, gerçek ilerleme/hata bileşeni yeni | UploadIntent, FileObject, immutable SourceVersion(SV1), ProcessingJob; editor | Kesinti/yanlış tür/boyut için retry; işlem bitmeden “hazır” yok; G02 |
| J1.6 / F06 | A SV1'de p.3'te metin seçer, vurgu ve not A1 oluşturur | S09 Reader → Notes; canlı örnek p.3 notları ve Cite/Highlight/Note var | Annotation(A1) → SV1 + anchor; editor | Metin seçilemiyorsa sayfa/not elle; konum çözülemezse orphan etiketi; G02 |
| J1.7 / F07 | A A1'den D1 “Related work” dokümanı yazar; matematik ve C1 atfı ekler | S10 Document; “Related work — sparse attention” mevcut | Document(D1), DocumentVersion(DV1), Citation(C1→SV1/A1); editor | Sunucu onayında kaydedildi; offline draft ayrı; çatışmada iki sürüm korunur; G03 |
| J1.8 / F08 | A D1 paragrafından T1 görevini çıkarır, B'ye atar | S11 Tasks Board/List; ATL-27 benzeri örnek mevcut | Task(T1), ArtifactLink(D1/A1↔T1), assignee aktif P1 editor | B çıkarıldıysa atama reddedilir; pano sürüklemesi klavye menüsüyle eşdeğer; G03 |
| J1.9 / F09 | B D1/C1/T1 bağlarıyla tartışır; A bildirimden döner | S12 Channels → thread, S13 Inbox; canlı kartlı mesaj örnekleri var | DiscussionThread(TH1), Message, recipient Notification; editor | Tekrarlanan gönderim aynı client request ID ile tek mesaj; erişim kaybında önizleme redakte; G03 |
| J1.10 / F10 | A S14'te SA/SB'nin belirli sürümlerini seçip karşılaştırma ister | Chats / sağ AI paneli; canlı kaynak butonları ve kapsam seçici var | Private AIConversation(Q1), scope SV1/SV2, AI citation; viewer dahil okuma | Eksik kanıtta yanıt sınırlanır; iptal/kota/provider hatasında kayıp düzenleme yok; G04 |
| J1.11 / F11 | A kanıt konumlarını açar, D1'e öneriyi önizleyip uygular; export alır | S14 → S09 → S10/export; prototip Insert var, gerçek diff/onay yeni | AIProposal, yeni DV2, C2; okuma + hedefte editor | DV1 değişmişse yeniden diff; doğrudan AI yazımı yok; export indirmesinde tekrar izin; G04 |

G01–G05 kapıları faz belgelerinde aynı anlamdadır. Prototipteki sahte makale ölçümleri J1'in gezinme bağlamıdır; gerçek bilimsel iddia olarak taşınmaz.

## Kritik alternatifler

### F03 — Davet kabulü ve erişim kaldırma

Davet eden P1 owner/admin rolünü sunucuda doğrulatır. Token rastgele, tek kullanımlık ve süreli olur; depoda yalnız hash'i saklanır. Varsayılan süre önerisi 7 gün. URL loglarda ve analitikte yer almaz. E-posta eşleşmesi ve doğrulanmış oturumdan sonra workspace üyeliği ile proje rolü aynı işlemde açılır. Davet proje dışına veya daha yüksek role sessizce genişletilemez. Beta yalnız belirli projeye davet içerir.

Üyelik iptalinde yeni istek, dosya range isteği, export indirmesi, bekleyen job ve AI teslimi yeniden denetlenir. Açık sayfa sonraki yetki kontrolünde içeriği temizleyip erişim mesajı gösterir; kişisel draft hassassa cihazda kalma süresi ve temizleme seçeneği açıklanır. Daha önce indirilen/ekranda görülen veri geri alınamaz. İptal garantisinin sınırı [AUTHORIZATION](AUTHORIZATION.md) içindedir.

### F05 — Yükleme ve kaynak sürümü

Ön kontrol → özel geçici dosya → doğrulama/zararlı içerik kontrolü → metadata + dosya checksum'u → işlem kuyruğu → hazır/hata. Aynı kullanıcı isteğinin retry'ı aynı upload intent'i sürdürür; farklı dosya aynı kaynak için yeni sürüm olur. Biten sürümün byte içeriği değiştirilmez. PDF yoksa metadata kaynağı ve manuel notla devam edilir; kaynaklı tam metin AI uygun değil etiketi görünür. Dosya eklemek yayın hakkı vermez.

### F07 — Kayıt çakışması ve kurtarma

Değişiklik yalnız ilgili document revision ile yazılır. Sunucu revision farklıysa conflict döner; istemci yerel taslağı silmez, güncel sunucu sürümünü ve yerel farkı sunar. Kullanıcı kopya veya birleştirme seçer. Otomatik son-yazan-kazan yok. Sürüm geri alma yeni sürüm üretir; eski citation kimliklerini yeniden hedeflemez. Ağ kesintisinde “cihazdaki taslak” ile “sunucuda kaydedildi” ayrı gösterilir. Çıkışta paylaşılan bilgisayardaki taslağı temizleme sunulur.

### F10 — AI bağlamı ve kanıt

Aynı proje ekranları arasında gezinmek konuşmanın sabit scope'unu değiştirmez. “Bu ekran farklı; yeni konuşma başlat / mevcut kapsamı koru” bildirimi gösterilir. Başka projeye geçiş eski paneli kapatır; yeni projenin konuşmaları yüklenir. Eski scope yeni projeye taşınmaz. Kapsam değişimi yeni konuşma açar; eski yanıtın kanıt listesi değişmez.

Sadece seçili ve hazır, izinli kaynak sürümleri kullanılır. Kaynak yoksa gönder düğmesi durumu açıklar. Kısmi kanıt varsa cevap yalnız desteklenen bölümü verir; “bu iddia için yeterli kanıt yok” gösterilir. Kullanıcı kaynak ekleyip yeni sorgu başlatabilir. Provider timeout, kota ve iptal aynı konuşmada ayrı durumdur; tekrar istek iki kez ücret/kayıt üretmemelidir. Sözleşme ve değerlendirme [AI_AND_SOURCE_CONTRACT](AI_AND_SOURCE_CONTRACT.md).

## Ortak gezinme ve geri dönüş

Doğrudan artifact link'i oturum gerekiyorsa girişe, sonra aynı hedefe döner; URL içinde erişim token'ı bulunmaz. İzin yoksa varlığı doğrulamayan ortak unavailable ekranı S16 açılır. Arşivli hedef yetkili kullanıcıya salt okunur görünür. Silinen hedefte güvenli tombstone ve geri bağlantı gösterilir. PDF'den dokümana dönüş sayfa ve scroll konumunu korur; erişim yeniden denetlenir. Modal/drawer kapanınca odak tetikleyiciye, hedef silinmişse en yakın anlamlı başlığa döner.
