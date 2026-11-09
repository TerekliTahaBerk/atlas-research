# Atlas Research — Faz 00 uygulama promptu

Atlas Research projesinde yalnızca Faz 00'ı tamamla: ürün, tasarım ve mimari hazırlık. Faz 01 uygulamasına geçme.

## Başlangıç ve çalışma kuralları

Repo: https://github.com/TerekliTahaBerk/atlas-research
Ana branch: main
Çalışma branch'i: feat/phase-00-foundation
Önce README.md, AGENTS.md, CONTRIBUTING.md, docs/ROADMAP.md, docs/RESTART.md, docs/design/REFERENCE.md ve ADR 0001'i oku. Git durumunu kontrol et, ilgisiz değişiklikleri koru. Hazırlanmış çalışma branch'ini kullan; ilerleme varsa üzerine güvenle devam et.

Eski kod archive/pre-restart-2026-11-09 içinde yalnızca tarihsel referanstır. Eski kapsamı, mimariyi, migration'ları veya tamamlanmışlık iddialarını yeni ürüne taşımak zorunda değilsin. Scholara'ya hiçbir şekilde dokunma.

Bu fazın sonucu ayrıntılı ama uygulanabilir bir ürün/tasarım/mimari paketi ve gözden geçirilebilir PR'dır. Uygulama kodu, kullanıcı sistemi, veritabanı migration'ı, çalışan AI, gerçek dosya işleme, yeni bulut kaynağı veya deploy oluşturma. Mevcut Coolify/Supabase/Vercel kaynaklarını değiştirme.

## Ürün ve beta hedefi

Atlas, bireysel araştırmacılar ve 2–10 kişilik ekipler için bağlantılı araştırma alanıdır. Üniversite hesabı zorunlu değildir.

Beta akışı:
Proje aç → kaynak bul/ekle → PDF oku ve not al → kaynak bağlantılı doküman yaz → görev ata → tartış → seçili kaynaklardan AI ile yanıt al.

Ürün değeri, kaynak/not/doküman/görev/tartışma/AI çıktısı arasındaki bağlamın korunmasıdır.

Beta: hesap/proje/ekip/davet/yetki; temel literatür arama; DOI/link/elle kaynak/PDF ekleme; kütüphane; PDF okuyucu/vurgular; matematik destekli doküman; otomatik kayıt/sürüm; kaynak gösterme ve dışa aktarma; temel görev/tartışma/bildirim; kaynaklı AI ve basit bağlantılar.

Beta sonrası: LaTeX derleme, Python/notebook çalıştırma, gelişmiş semantik harita/grafik, kapsamlı Zotero senkronizasyonu, otonom ajanlar, kurumsal SSO/yönetim, ses/video. Prototipte görünmeleri bu sınırı değiştirmez.

## Tasarım girdisi

docs/design/REFERENCE.md içindeki güncel Atlas.dc.html ve varsa Atlas Handoff.md dosyasını esas al:
https://claude.ai/design/p/c0ecedb8-87e2-4ad5-b313-63d75aef1817?file=Atlas.dc.html

Önce gerçek referansı incele. Erişilebiliyorsa HTML/handoff sürümünü dışa aktar, paylaşım hakkını ve hassas veri bulunmadığını kontrol ederek docs/design/reference/ altında dondur; kaynak URL, tarih ve SHA-256 kaydet. Eski bir Library dosyasını aynı revizyon kabul etme. Erişim yoksa bağımsız planlama işlerini tamamla; referans ölçümü gerektiren maddeleri dürüstçe bekleyen olarak kaydet. Tasarımı görmeden piksel, font veya renk değeri uydurma.

Gözlenen yön: varsayılan açık tema, sıcak gri sidebar, beyaz ana alan, mavi vurgu, sistem sans-serif, sakin/kompakt düzen, ortak üst sekmeler ve sağ bağlamsal AI paneli. Koyu tema ve dar ekran davranışını da tanımla.

## Üretilecek çalışma

1. docs/PRODUCT_SPEC.md:
   - Problem, hedef kullanıcılar, değer önerisi, temel işler ve ürün ilkeleri.
   - Beta dahil/hariç matrisi, başarı ölçütleri ve ölçüm tanımları.
   - Bireysel ve ekip kullanımını kapsayan gerçekçi ilk araştırma senaryosu.
   - Senin değerlendirmelerin ile kullanıcı tarafından belirlenmiş kararları ayır.

2. docs/USER_FLOWS.md ve docs/SCREEN_MAP.md:
   - İlk kayıt/proje, kaynak keşfi/ekleme, okuma/not, doküman, görev, tartışma ve kaynaklı AI akışları.
   - Davet kabulü, erişim kaldırma, kayıt çakışması, başarısız yükleme, yetersiz AI kanıtı gibi kritik alternatif yollar.
   - Ekran/eylem/izin/veri/boş-yükleniyor-hata/kabul kriteri/faz eşlemesi.
   - Tek bir örneği baştan sona mevcut prototip ekranlarına bağla; prototipte olmayan adımları açıkça işaretle.

3. docs/design/DESIGN_SYSTEM.md ve docs/design/REFERENCE_AUDIT.md:
   - Doğrulanmış renk, tipografi, boşluk, boyut, köşe, ikon ve bileşen token'ları; her ölçüm için kaynak.
   - Sidebar, sekmeler, listeler, editör, PDF alanı, görev panosu, iletişim, AI paneli ve ortak durumların davranışı.
   - 390, 768, 1024 ve 1440 px görünüm planı; sidebar + içerik + AI paneli için alan/focus/scroll kuralları.
   - Tek anlaşılır AI etkileşim modeli, açık kapsam seçimi ve ekran/proje değişiminde sohbet bağlamı.
   - Klavye, odak, kontrast, azaltılmış hareket ve erişilebilirlik kriterleri.
   - Yeni görsel yön üretme; referansı koruyan gerekli düzeltmeleri gerekçelendir.

4. docs/ARCHITECTURE.md, docs/DATA_MODEL.md ve docs/AUTHORIZATION.md:
   - Docker/Coolify üzerinde Next.js/React/TypeScript modüler monolit, PostgreSQL ve Prisma.
   - Uygulama/sunucu/iş alanı/veri erişimi/arka plan işi sınırları.
   - Kullanıcı, kişisel/paylaşılan workspace, üyelik, proje ve proje izinleri; kaynak, kaynak sürümü, annotation, doküman/sürüm, görev, tartışma, bildirim, AI konuşması/citation ve bağlantı ilişkileri.
   - Kavramsal ERD, sahiplik, aynı proje kısıtları, benzersizlik, silme/arşivleme ve export davranışları. Bu fazda tüm tabloları veya migration'ları oluşturma.
   - Workspace yöneticiliğinin özel proje içeriğine erişim verip vermediğini açıkça kararlaştır.
   - Sunucu yetkilendirmesi ve veritabanı savunma katmanı için tek uygulanabilir strateji; runtime/migration rol ayrımı; iki ekip ve üyelik iptali test matrisi.
   - Auth, özel dosya depolama, background işler ve ileride realtime için self-host edilebilir seçenekleri değerlendir, beta için en sade uygun kararı ADR'lerle kaydet. Araştırma yapmadan sürüm/API uyumluluğu iddia etme.
   - PostgreSQL işlemleri/arama ilk tercih; zorunlu Redis veya spekülatif mikroservis ekleme. pgvector ihtiyacını Faz 04 sınırında değerlendir.

5. docs/AI_AND_SOURCE_CONTRACT.md:
   - Kaynak/sürüm/sayfa veya konum/alıntı/provenance ilişkileri.
   - Erişim filtreleme, içerik paylaşımı, yetersiz kanıt ve hatalı atıf davranışı.
   - AI önerisinin dokümana uygulanması için kullanıcı eylemi, kullanım sınırları ve gerçek makale değerlendirme planı.
   - Kaynak konumunun doğrulanmasıyla bilimsel iddianın desteklenmesinin farklı kontroller olduğunu belirt.
   - Gerçek model çağrısı, provider hesabı, API anahtarı veya embedding üretme.

6. docs/COOLIFY_PLAN.md ve docs/VERIFICATION_PLAN.md:
   - Docker build/runtime, standalone web container, health/readiness, iç ağdaki PostgreSQL, kalıcı dosyalar, env/secret ayrımı.
   - Dev/production ayrımı, migration sırası, deployment/rollback, gözlemlenebilirlik ve kaynak bütçesi yaklaşımı.
   - DB + dosyaların birlikte yedeklenmesi, bağımsız yedek hedefi seçimi ve beta öncesi restore provası.
   - Ücretli GitHub Actions gerektirmeyen yerel doğrulama ve ileride Coolify build gate planı; üretim sunucusuna GitHub runner kurma.
   - Gerekli paket/Node/PostgreSQL sürümlerini uygulama başlamadan resmi kaynaklardan doğrulama ve sabitleme planı.
   - Bu fazda sunucuda kaynak oluşturma, deployment başlatma veya çalışan kaynakları silme.

7. docs/phases/PHASE_00.md ... PHASE_05.md:
   - Her faz için amaç, kapsam, kapsam dışı, önkoşullar, görevler, bağımlılıklar, test/kabul kriterleri ve bitiş koşulları.
   - Faz 01–05 görevlerini uygulanabilir PR dilimlerine ayır; hiçbirini henüz uygulama.
   - Faz 05'i açık kapalı-beta sınırı olarak koru; sonraki sürümler ayrı backlog olsun.
   - Faz 00 ürün/tasarım/mimari çalışması olarak kalsın; önceki projedeki foundation scope'unu otomatik devralma.

8. docs/PHASE_00_HANDOFF.md:
   - Teslim edilenler, açık kararlar, tasarım kaynağının durumu, gerçek doğrulamalar ve Faz 01'in ilk somut işi.
   - Linkler/çelişkiler/faz eşlemeleri/izinler/örnek yolculuk üzerinde doküman tutarlılık incelemesi yap.
   - Belgeleri tek bilgi kaynağına bağla; aynı kuralları çelişkili şekilde çoğaltma.

## Kabul ve teslim

- Beta araştırma akışı tek bir örnek üzerinde ekran, veri, yetki ve hata durumlarıyla izlenebiliyor.
- Görsel hedef mevcut tasarıma bağlı; kaynağı görülemeyen ölçümler doğrulanmış gösterilmiyor.
- Coolify/PostgreSQL kararı uygulanabilir ve açık; henüz provision/deploy yapılmış gösterilmiyor.
- Kapsam, erişim modeli, veri ilişkileri ve Faz 01–05 kabul kriterleri birbiriyle tutarlı.
- Çalışmayan ürün, gerçek olmayan AI, test veya deployment iddiası yok.
- Gerçek kontroller PASS / FAIL / NOT RUN olarak raporlanmış.
- Değişiklikleri feat/phase-00-foundation'a commit/push et ve main'e kısa, somut açıklamalı PR aç. Otomatik merge etme.
- Son cevapta tamamlananları, açık noktaları, PR bağlantısını ve Faz 01'e hazırlık durumunu ver. Faz 00 sonunda dur.
