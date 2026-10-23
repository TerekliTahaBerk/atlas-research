# Private PDF storage security

## Buckets and keys

Two private Supabase Storage buckets, created by the reviewed migration only when `storage.buckets` exists (and the migration aborts if either is public):

- `atlas-quarantine` — every upload lands here first.
- `atlas-sources` — objects copied here only after the isolated scanner accepts them.

Both are limited to `application/pdf` and 25 MB (`26214400` bytes). **No `storage.objects` policy is created**: browser roles (`anon`, `authenticated`) have no object access at all. Every transfer uses a single-object grant signed by the server after Atlas authorization; the Storage service credential (`ATLAS_STORAGE_SERVICE_KEY`) is server-only and never reaches the browser, logs or responses.

Keys are unpredictable and scoped for operations, not for security:
`quarantine/{projectId}/{uuid}/{192-bit random}.pdf` and `accepted/{projectId}/{sourceVersionId}/{192-bit random}.pdf`. Object keys are never included in DTOs.

## Upload flow

1. `POST /api/v1/projects/:id/uploads` `{fileName, mediaType: application/pdf, byteSize ≤ 25 MB, sha256, projectPaperId, idempotencyKey}` — verified session, same-origin, 30 uploads/hour/actor, `project.write`, paper in that project, not archived, ≤ 20 versions per paper.
2. SQL `upload.create` records an immutable `source_versions` row (`PENDING_UPLOAD`) and a 15-minute actor-bound `upload_intents` row.
3. The server returns a Storage signed upload URL for that one quarantine key with `upsert=false` (an existing object can never be overwritten).
4. The browser computes SHA-256 and `PUT`s the bytes directly to Storage.
5. `POST /api/v1/uploads/:id/finalize` — only the creating actor. The server downloads the stored object and checks the **actual** length, SHA-256 against the declaration, the `%PDF-` header and `%%EOF` trailer. Expired grants are rejected. Mismatches mark the version `REJECTED` and delete the object. A missing object returns `VALIDATION_ERROR` without consuming the intent.
6. Valid files become `QUARANTINED` and a `SCAN` outbox job is written in the same transaction. **Nothing is readable yet.**

No PDF parser runs in the web process; finalization only inspects bytes.

## Scanning boundary

Scanning runs outside the web process. A scanner authenticates with HMAC-SHA256 over `timestamp.body` (`ATLAS_SCANNER_SECRET`, ±5 minutes) to:

- `POST /api/v1/internal/scanner/claim {max ≤ 10, leaseSeconds 30–900}` — leases jobs (`FOR UPDATE SKIP LOCKED`), marks versions `SCANNING`, returns 120-second read grants for the quarantined objects plus the expected SHA-256.
- `POST /api/v1/internal/scanner/complete {jobId, attempt, verdict: CLEAN|INFECTED|INVALID|ERROR, sha256, scanner}` — requires the exact active claim attempt and live uploader authorization. `CLEAN` with a matching checksum copies the object to `atlas-sources` under a key bound to that exact project/version and marks the version `READY`; mismatches, `INFECTED` and `INVALID` mark it `REJECTED`; `ERROR` returns it to `QUARANTINED` with exponential backoff, failing terminally after five attempts or expired leases.

The scanner never receives database or Storage credentials. **Status: the isolated ClamAV/qpdf integration is implemented, builds and passes real local engine checks; it is not hosted/deployed.** See [scanner deployment](SCANNER_DEPLOYMENT.md). A committed per-attempt copy reservation and aged cleanup queue prevent accepted-object leaks after losing completions or crashes; failed cleanup retains its reservation. Scanner requests are byte-limited to 4 KiB while streaming, before HMAC verification. Until one is, uploads remain quarantined in every real environment, by design. Browser tests supply the verdict through the same protocol and label it as a test fixture.

## Download

`GET /api/v1/sources/:id/access` re-authorizes on every call (`project.read` via RLS, 60/minute/actor), requires `READY`, and returns a 60-second signed URL plus the expected SHA-256. The reader downloads into memory with `credentials: omit` and no referrer, verifies the checksum before display, renders with PDF.js in a same-origin worker, and requests a fresh grant once if the first download fails. Signed URLs are bearer capabilities until expiry; they are short-lived, never logged, persisted or cached. Revoked members cannot obtain new grants.

## Threats addressed

Cross-tenant object access (no browser policies, server-side scope), overwrite (`upsert=false`, unique keys), declared-type/size spoofing (server measures stored bytes), replay (intent single finalization, actor binding, expiry), unscanned access (`READY` requires scan completion and a bound accepted key, enforced by a check constraint and trigger), and SSRF (no remote URL fetching).
