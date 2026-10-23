# Isolated PDF scanner integration

Status: concrete implementation in `ops/scanner`; not hosted or production deployed. No real upload is approved by a fixture verdict.

## Trust and isolation

The Python standard-library broker receives only `ATLAS_SCANNER_SECRET`, mounted as `/run/secrets/scanner_secret`. It authenticates claim/complete requests with the existing timestamp/HMAC protocol. It has **no database URL, Storage service key, migration credential or model key**. It allows only the exact Atlas development project and HTTPS Atlas origin, refuses redirects/proxies, validates signed quarantine-grant hosts/paths, caps downloads at 25 MiB while streaming, and verifies actual length/SHA-256. Each claim leases one job for 300 seconds. Verdicts carry its exact attempt. The broker avoids completion near expiry; network failures leave the lease for bounded database retries.

A separate validator container receives PDF bytes and returns a digest and verdict. It has no secret mounts or environment credentials, no public port, no host/socket mounts and no Internet route (Compose internal network). A third container updates official ClamAV signatures on a shared volume; the validator mounts it read-only. Definitions absent or older than 48 hours fail closed. Parser processes receive a scrubbed environment, no shell, CPU/address-space/file/open-file/core limits and 45-second wall deadlines. The container adds a read-only filesystem, no capabilities, no-new-privileges, bounded memory/CPU/PIDs and a 64 MiB non-executable tmpfs. Scans run serially.

ClamAV inspects malware with bounded file/scan/recursion/count limits and alerts on encrypted content or exceeded limits. qpdf must return a clean `--check`, report unencrypted input, and report 1–2,000 pages. Warnings, repair, encryption, missing definitions, parser errors or exceeded resources never produce CLEAN. The broker compares the validator digest to its own before signing the verdict. Document content, parser output, signed URLs, HMAC headers and raw network errors are never logged.

These checks validate structure and malware; they do not prove a document's safety or licensing. The isolated parser remains an untrusted boundary. Select and pin reviewed image digests for the approved deployment; regular security/definition updates and resource sizing are operational requirements.

## Database and object lifecycle

`20261023120000_scanner_fencing` replaces the old unfenced functions. Every lookup/completion checks RUNNING, exact attempt and unexpired lease. Claim and completion recheck the original uploader's live project-write capability and take the existing hierarchy lock so revocations cannot race acceptance. A separate short scanner advisory lock gives state transitions a consistent lock order; no network request runs while it is held.

Before copying any accepted object, the server commits a cleanup reservation bound to job, attempt and unpredictable object key. Only a matching reservation can become READY; the winning transaction deletes that reservation. Losing completions, copy errors, server crashes and ambiguous commits retain the reservation. Every claim retries up to 20 aged candidates: after a one-hour grace (longer than every lease/copy deadline), inactive jobs' unreferenced accepted keys are deleted through Storage and acknowledged only after success. READY object keys are immutable and excluded. Removal errors are surfaced and reservations retained. A stopped broker means cleanup stops; monitor backlog and resume polling. Quarantine objects from terminal jobs remain private and require a separately reviewed retention/purge policy.

## Development deployment procedure

Requires explicit approval of the host and exact HTTPS **live-mode** Atlas origin, an environment-scoped HMAC secret shared only with that server, and server-side Storage configuration. The current public Vercel URL is a design preview and is not an approved scanner destination.

1. Complete backup/restore and hosted migrations in the [activation plan](../phases/PHASE_02_ACTIVATION_PLAN.md). Deploy the matching server protocol to the approved development origin.
2. Put the HMAC secret in the host's secret manager and mount a protected file. Set `ATLAS_SCANNER_SECRET_FILE` to that file and `ATLAS_SCANNER_ORIGIN` to the approved HTTPS origin. The validator/updater never receive it.
3. Review/pin built images. Build `docker compose -f ops/scanner/compose.yml build`; start only `definitions validator`, wait for fresh official signatures, then run engine smoke checks. Do not expose validator port 8080.
4. Start the broker only after clean, malformed, encrypted, EICAR, over-limit and timeout outcomes have been observed. Verify Storage copies and exact SHA-256, one winning completion, stale-attempt rejection, retry exhaustion, revoked uploader denial and accepted-object cleanup.
5. Record image digests, ClamAV/qpdf versions, definition age, resource usage and actual hosted evidence in the Phase 02 report. Alert on unavailable operations, job failure/backlog and cleanup backlog. Rotate the HMAC secret in server and broker together if compromised.

Local protocol tests: `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests/scanner -v`. These mock engine exit codes and are explicitly **not** real malware verification. Actual local image/engine results are recorded separately in the implementation report. No cloud resources or production deployment are created by this delivery.

With definitions loaded and the broker stopped, run the real engine smoke in the validator: `docker compose -f ops/scanner/compose.yml exec -T validator python - < tests/scanner/engine_smoke.py`. It creates only temporary synthetic files, including standard EICAR, and never sends a verdict to Atlas. Successful local checks do not authorize starting the hosted broker.
