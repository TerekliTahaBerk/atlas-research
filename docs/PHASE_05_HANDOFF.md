# Phase 05 preparation and hardening

Status: in progress. The owner explicitly selected **preparation and hardening**, with no pilot participants or support/incident owner assigned. This is not a closed-beta launch or G05 PASS. Paid AI calls, email and S3 remain disabled. Existing Atlas Coolify settings and unrelated infrastructure must remain intact.

## Changes

- Per-response nonce CSP in the Next.js application, matching framework/theme script nonces, self-only network sources and blocked inline event handlers/objects/frames. PDF workers and WebAssembly are explicitly supported; inline styles remain allowed for PDF/editor geometry. Production JavaScript unsafe-eval is not allowed. HSTS applies to the configured HTTPS app host only, without includeSubDomains or preload. No host/proxy setting change.
- Authenticated `/help` guide and manually shareable diagnostics (readiness, release, schema, UTC timestamp only), with honest closed-gate/support/recovery limitations. No automatic issue, email, analytics or content collection.
- Saved unsent AI questions can be restored after same-project navigation; evidence is previewed again and consent is never restored or submitted automatically.
- [Pilot kit](pilot/README.md), incident process, observation/consent checklist, aggregate M1–M7 validator and empty template. Real cohort remains 0 participants / 0 teams; M1–M7 observations are NOT RUN. Automatic server event instrumentation is not claimed.
- Expanded disposable operational recovery fixtures for PDF/source pages, private AI evidence previews, document versions/citations and linked tasks/discussions. Readiness/manifest checks use the actual schema revision instead of stale Phase 01 constants.

## Verification ledger

Only observed results will be recorded here. Local synthetic evidence does not close live or independent-target requirements.

| Check | Status |
| --- | --- |
| Type/lint/unit/build | PASS: typecheck, lint, production build, 9 unit tests and Compose credential isolation. |
| Responsive/accessibility and CSP browser checks | PASS, focused Chromium: 320/390/768/1024/1440 CSS px × light/dark help guide, no horizontal overflow, safe diagnostics, nonce freshness/framework/theme script binding and blocked inline event handler. Existing source→math writing→task→discussion→Inbox browser regression also passed. Manual screen reader/native zoom and complete screen/state matrix remain NOT RUN. |
| Ten concurrent synthetic sessions / HTTP load / isolation | PASS locally: 10 sessions in two teams; 50 detail reads, 50 acknowledged saves + reloads, 11 cross-team/revoked negative checks; read p95 81 ms, save p95 94 ms, zero lost acknowledged edits. Node 24.21.0 arm64, 10 host CPUs, 32 GiB RAM, local unconstrained web process and disposable PostgreSQL 18.6. Not live server capacity or pilot evidence. |
| Current-image local encrypted DB+files recovery | Not yet run |
| Existing Coolify deployment / HTTPS headers | Not yet observed |
| Actual container image identities / PostgreSQL limits | Not yet observed |
| Live compatible 007 image rollback | Not yet observed |
| Real pilot / support assignment / G01–G05 acceptance | OPEN; participants and owner unassigned, prior gates incomplete |
| Real model / G04 | NOT RUN; paid calls prohibited, budget undecided |
| Independent off-host backup/restore | NOT RUN; no destination selected, S3 off |
| Real email delivery | NOT RUN; disabled by owner |

## Security implementation reference

The nonce follows the [Next.js 16.4.5 CSP guide](https://nextjs.org/docs/app/guides/content-security-policy) and [Proxy convention](https://nextjs.org/docs/app/api-reference/file-conventions/proxy). Reading request headers makes pages dynamic; nonces are not cached or accepted from client input. This trades static rendering for per-request script authorization. The browser and load checks must validate that tradeoff; a header string alone is not application QA. Application CSP is defense in depth, not an authorization replacement.

## Open release conditions

The owner must appoint support and a private channel, recruit consented participants/teams, agree retention/deletion, evaluate real pilot work, review G01–G04 and independent recovery evidence, resolve any P0/P1 defects and explicitly record the beta decision. Previous broad live audits remain separate until actually observed. No numeric threshold is relaxed and no data collection is enabled by a passing synthetic test. Phase 05 preparation can be delivered while G05 remains OPEN.
