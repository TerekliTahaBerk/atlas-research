# Faz 03 — Yazı, görev ve tartışma

Durum: plan; uygulanmadı.

## Amaç

J1 annotation'ı kaynak atıflı dokümana, atanan göreve ve ekip tartışmasına dönüştürmek; hiçbir bağlantı veya kabul edilmiş düzenleme kaybolmamalı.

## Kapsam

S10–S13/S17, math gösterimi, citations, optimistic saving/version/restore, basit görev Board/List, proje discussion/thread, uygulama içi notification, aynı-proje link/backlink ve Markdown/math/reference manifest export.

## Kapsam dışı

LaTeX compile/manuscript pipeline, Python/notebook, co-editing/presence/CRDT, kapsamlı chat/DM, ses/video, AI üretimi. Math syntax seçimi rendering içindir; çalıştırma yetkisi vermez.

## Önkoşullar

G02 PASS. Stable source/version/anchor ve private file/queue yolu vardır. Editör/math renderer seçimi erişilebilirlik, sanitize, lisans ve resmi package uyumluluğuyla bu fazın ilk PR'ında değerlendirilir; eski toolchain taşınmaz.

## Görevler ve PR dilimleri

| PR | Çıktı ve kabul | Bağımlılık |
| --- | --- | --- |
| P03-1 | Document/Version/Citation ve source-linked note→doc; math render, sanitization; current revision atomic save | G02 |
| P03-2 | Gerçek autosave acknowledgement, offline cihaz draft'ı, optimistic conflict diff, version history/restore→yeni revision; Markdown+math export | P03-1 |
| P03-3 | Task/assignee/status, Board/List, artifact links/backlinks, source/doc'dan task yaratma; keyboard durum değişimi | P03-1 + aktif project membership |
| P03-4 | Proje thread/messages + linked artifact kartları, own-edit kuralları, idempotent gönderim; recipient notification + permission-aware Inbox | P03-3; outbox |
| P03-5 | J1.7–J1.9 bütünleşik iki-oturum testi; revocation/title redaction; poll/refetch; D01 channel/thread alan düzeltmesi ve export/recovery regresyon | P03-1–4 |

## Test ve kabul kriterleri — G03

- SV1/A1→D1/C1→T1→TH1→notification→geri D1/SV1 yolu aynı projede kalır. Source title değişimi/citation reorder kimliği bozmaz.
- Aynı D1 revision'ından iki kullanıcı yazınca ikincisi conflict alır; iki içerik de kurtarılabilir. Ağ kesintisi server-saved gibi etiketlenmez; retry duplicate version üretmez.
- Math expression doğru ve güvenli gösterilir; kaynak atfı gerçek version/locator'a gider; restore eskisini overwrite etmeden yeni revision oluşturur.
- Görev yalnız aktif editor+ üyeye atanır; revoke/downgrade unassign eder. P viewer sadece okur/export; C/D content/Inbox hedef başlığı göremez.
- Thread'deki source/doc/task kartı doğru hedefe ve izin denetimine gider; message retry tek kayıt, private konuşma/DM işlevi yoktur.
- D01/D03 düzeltilir: 1440'da bile thread + local nav + AI placeholder ana alanı ezmez; 390/768/1024, dark/light, keyboard/focus ve durum matrisi ilgili ekranlarda PASS.
- A01–A13 yeni tablolarla, document XSS/markdown/math sanitization ve backup/restore sonrası citation/version/link bütünlüğü PASS.

## Bitiş koşulları

G03 PASS; kaynaklı araştırma yazısı ve ekip takip yolu kalıcıdır. Açık kritik access/data-loss/blocker yok. AI eylemleri kapalı veya açıkça unavailable; gerçek işlev gibi gösterilmez. Faz 04 ayrı talimat ister.
