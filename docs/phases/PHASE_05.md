# Faz 05 — Kapalı beta sınırı

Durum: kullanıcı Faz 05 hazırlık ve sağlamlaştırmasını yetkilendirdi; katılımcı ve destek/incident sorumlusu henüz yok. Hazırlık/sağlamlaştırma PR #39 ile uygulandı ve mevcut Atlas’ta `33169e1` olarak çalışıyor. Gerçek pilot/beta yayını ve G05 açık kalır; aynı kaynak sürümüne dönüş doğrulansa da aynı image kimliklerine dönüş gerçekleşmedi ve bu kapı FAIL/OPEN kaydedildi. Ücretli AI, e-posta ve S3 kapalı tutulur. [Güncel teslim kaydı](../PHASE_05_HANDOFF.md). Bu faz kapalı-beta release sınırıdır; sonraki sürüm backlog'u [ROADMAP](../ROADMAP.md) içindedir.

## Amaç

Pilot araştırmacıların gerçek araştırma işini kritik erişim/veri kaybı/engelleyici hata olmadan tamamlamasını ve operasyonun kurtarılabilirliğini kanıtlamak.

## Kapsam

Pilot hazırlık/onboarding/support, ölçümler, uçtan uca regresyon, performans/kaynak bütçesi, güvenlik ve erişilebilirlik düzeltmeleri, DB+files restore provası, deployment/rollback ve geri bildirimle release kararı.

## Kapsam dışı

Yeni LaTeX/notebook/graph/agent/kurum modülleri, kapsamlı Zotero/chat/co-editing ve açık public launch. Pilot geri bildirimini gerekçe göstererek beta sınırı sessizce genişletilmez.

## Önkoşullar

Kapalı beta yayını için G01–G04 PASS gereklidir. Kullanıcı eksik kapılar korunarak hazırlık/sağlamlaştırmanın ilerletilmesini istedi; bu karar önceki kapıları PASS yapmaz. Gerçek eval/restore raporları, kullanım/bütçe sınırları, bilinen açık kusurlar, destek sorumlusu ve veri paylaşımı/saklama açıklaması hazır. Pilot hipotezi 5–10 araştırmacı ve en az iki küçük ekip; gerçek recruitment sonucu sayı ayrı kaydedilir, doldurulmuş varsayılmaz.

## Görevler ve PR dilimleri

| PR | Çıktı ve kabul | Bağımlılık |
| --- | --- | --- |
| P05-1 | Pilot rehberi, veri/AI onayları, destek/incident süreci, içeriksiz M1–M7 ölçümü; gerçek katılımcı/ekip planı | G04; ürün sahibi recruitment/ops sorumlusu |
| P05-2 | Tam J1 ve alternatifler; iki ekip + revoke + export/job/AI regresyonu; dört genişlik/iki tema/keyboard/screen reader; P0/P1 düzeltmeleri | P05-1; G01–G04 test seti |
| P05-3 | 10 aktif kullanıcı pilot yükü, ölçülmüş kaynak/limit ayarı, restart/worker recovery; bağımsız hedeften DB+files full restore, rollback ve RPO/RTO raporu | P05-1/2; yeterli temsilî veri hacmi |
| P05-4 | Pilot gözlem ve M1–M7 ham sayı/oranları, triage/düzeltme, bilinen sınırlamalar; kapalı-beta release/handoff kaydı | P05-2/3 ve gerçek kullanım |

## Test ve kabul kriterleri — G05

- Gerçek katılımcılar kaynak→okuma/not→atıflı doküman→görev→tartışma→AI yolunu dener; [PRODUCT_SPEC](../PRODUCT_SPEC.md) metrikleri payda/ham sayılarıyla raporlanır. Hedef tutmazsa sebep ve release kararı açık kaydedilir; sonuç uydurulmaz.
- Açık P0/P1 erişim, veri kaybı veya ana akış blocker'ı yoktur. Negatif yetki testlerinde sıfır sızıntı; AI'da G04 kapısı korunur.
- Backup sadece oluşmaz; bağımsız hedefteki set disposable ortamda restore edilip file hash, document versions/citations, task/thread/AI privacy ve iki-ekip izolasyonu doğrulanır. Ölçülmüş RPO/RTO önerilen hedeflerle karşılaştırılır.
- Kritik fault/restart/duplicate/conflict yolları güvenli ve recoverable; log/screenshot/veri toplama sözleşmesi private içeriği ifşa etmez. Kaynak bütçesi ve performans kanıtı [VERIFICATION_PLAN](../VERIFICATION_PLAN.md) kapsamındadır.
- Responsive/focus/contrast/screen reader sorunları ana yolu engellemez; known limitation kullanıcıya açık ve tutarlı.
- Destek/incident sorumlusu, hata bildirme yolu, version rollback ve veri kurtarma adımları gerçekten kullanılabilir; pilot geri bildirimi önceliklenmiş backlog'a dönüşür.

## Bitiş koşulları

Ürün sahibi gerçek pilot/güvenlik/operasyon kanıtını gözden geçirir ve kapalı beta kararını kaydeder. G05 geçmiş olsa bile sonraki sürümler ayrı scope/karar/talimat ister. Faz 00’daki plan ile bu fazın gözlemlenen uygulama sonuçları teslim kaydında ayrılır.
