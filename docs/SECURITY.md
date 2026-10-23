# Security and privacy foundation

## Phase 03 research AI boundary

AI uses server identity, existing actor transactions/RLS, composite source/citation keys, exact quote verification, live evidence rechecks and atomic conservative cost reservations. Providers receive bounded authorized context after explicit processing consent, never all workspace files, credentials or executable tools. The extractor has a separate narrow worker database role and a secret-free offline parser. Conversation erasure preserves only accounting identity; logs exclude research content. [AI security/privacy](ai/SECURITY_AND_PRIVACY.md) defines provider sharing and remaining evaluation gates. Earlier “no AI/extraction” statements describe prior phases/preview; they do not describe the new isolated live implementation. Hosted history exposure and recovery/scanner activation remain unresolved until the separately approved process.

## Phase 02 research and file boundary

Every research read/write re-authorizes in SQL (RLS + `mutate_research`) as well as in services; revoked or never-granted members, including workspace administrators without a private-project grant, receive `NOT_FOUND`. Public metadata is visible only through readable associations. Provider calls go only to configured HTTPS hosts (or loopback fixtures), refuse redirects, cap size/time and never fetch user-supplied URLs; provider keys are server-only. Uploads use private buckets without browser policies, unpredictable keys, `upsert=false` single-object grants, server-measured size/SHA-256/signature checks, 15-minute actor-bound intents, quarantine and an HMAC scanner protocol; nothing is readable before an accepted scan verdict. Downloads are re-authorized 60-second grants, checksum-verified in the browser, rendered by PDF.js in a same-origin worker (`worker-src 'self'`). No AI, extraction, or remote PDF fetching exists. **A production scanner is not deployed, so real uploads stay quarantined.** See [PDF storage security](library/PDF_STORAGE_SECURITY.md) and [ADR 0014](decisions/0014-research-library-boundary.md).

## Phase 01 implementation and release gate

Live mode implements verified Supabase `getUser`, PKCE callbacks, signed short-lived recovery markers, exact-origin JSON mutations, distributed SQL quotas, per-request script nonce CSP, no-store responses and safe error/request IDs. Runtime role validation rejects owner/superuser/BYPASSRLS access. RLS plus constrained SQL commands enforce live tenant/resource capabilities, invitation single use/recipient binding, parent revocation and concurrent last-owner protection. [Authorization](identity/AUTHORIZATION.md) and [authentication](identity/AUTHENTICATION.md) define the trust model and limits.

The credential-free preview remains a separate explicit environment; no sample IDs confer live access. No AI, research execution, ingestion, assets or messages are enabled. The approved development target passed actual TLS/Prisma pooler-context checks and Data API exclusions. Hosted Auth email/OAuth/SMTP, infrastructure log redaction and deployed security are not verified. Production invitation creation is deliberately blocked without delivery configuration. No production security certification or deployment is claimed.

## Current security posture

Phases 00 and 00.5 are an unauthenticated, explicitly labelled UI preview with no research APIs, file ingestion, database calls, or AI requests. It must not host real private research yet. Phase 00.5 adds local UI demonstrations but no product endpoint; browser storage contains only appearance and sidebar preferences. Auth fields are reviewed locally and cleared without network submission. Synthetic references never prove identity, membership, authorization or source verification. Headers disable framing and MIME sniffing and restrict sensitive browser features. CSP with nonce-based Next.js compatibility, HSTS after domain setup, and deployed security review are future release gates; do not assume this preview is production hardened.

## Identity/session boundaries (Phase 01 gate)

Supabase Auth verifies identity; server code verifies claims/session with the supported Supabase server SDK, never trusts local browser state. Profile id matches verified auth user id. Cookies: Secure in deployed HTTPS, HttpOnly where SDK flow permits, appropriate SameSite, short-lived access, rotated refresh, revocation/logout on every device. Validate redirect allowlists, OAuth state/PKCE, callback code exchange and origin. Mutations require same-origin CSRF protection and cannot be GET. Rate-limit login, verification, invitations, and password recovery without account enumeration. No authentication buttons imply working sign-in in Phase 00.

## Tenancy, permissions, and RLS

Require live organization/workspace membership before project access. Private projects need explicit grant; workspace-visible projects grant read only. Administering metadata is not private-content access. Centralize policy services, deny by default, and test role/action matrices with two organizations, two workspaces, private projects, revoked/archived resources, and mismatched IDs.

Composite tenant foreign keys stop invalid parent linkage, but do not authorize reads. Initial SQL enables RLS with no policies, denying non-owner direct access. No anon/authenticated table grants or exposed browser Data API are configured by this repo. Future runtime DB role is non-owner and lacks BYPASSRLS. Prisma transactions set verified actor context locally (`set_config(...,true)`) when custom context policies are used; never accept actor context from client input. Test that connection reuse cannot leak identity. Supabase Auth `auth.uid()` policies and Prisma transaction claims must resolve the same actor or fail closed. Migration role is separate and never available to web traffic.

Private Storage/Realtime paths need their own membership-aware RLS policies: database table RLS alone does not secure objects or broadcasts. Revalidate membership for background jobs, storage signing, retrieval, subscriptions, backfills, exports, and citation rendering. Cache only public metadata globally; private caches include actor, tenant, permissions version and short expiry, with invalidation on revoke.

## Files and research rights

Use private buckets, opaque tenant/project object keys, short-lived signed URLs (initial candidate 60 seconds), and server-authorized download signing. Never log URLs. Quarantine uploads; enforce file size/count/type/signature, checksum, malware scan, decompression limits, parser timeouts, and isolated extraction. Finalization verifies uploaded object size and hash before it enters the library. Deny active HTML/SVG payloads unless sanitized by explicit policy. Use safe content disposition and PDF viewer origin restrictions. Signed URLs are bearer capabilities and cannot be fully revoked before expiry; keep TTL short and avoid browser persistence.

Accept user-provided files, openly licensed sources, or lawful provider access. Metadata discovery does not permit PDF redistribution. Store license/source/access provenance and honor takedowns. Never fetch arbitrary URLs without SSRF protection (DNS/IP allowlist rules, redirects, size/time caps, no private metadata endpoints).

## Secrets/environment/logging

No credentials required for preview. `.env.example` lists future optional values; startup validates configured URL/key pairs and masks all values in errors. Root .env is database CLI only; apps/web/.env.local is Next.js runtime. NEXT_PUBLIC_ is browser visible; never place service, database, Inngest, or model keys there. Use environment-scoped secret stores, rotate on exposure, and separate Atlas dev/staging/prod from every other product. Dependencies/lockfile and build-script allowlist are reviewed. Logs hold request ID/action/duration/error category, not research text, prompts, message bodies, emails, signed URLs or tokens.

## Module threat and mitigation map

| Module                | Main risks                                                                       | Required mitigations before release                                                                     |
| --------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Identity/membership   | Invitation replay, escalation, last-owner removal                                | Hashed single-use expiring tokens; scoped role ceilings; transactional ownership locks                  |
| Discovery             | Malicious metadata, provider abuse, SSRF                                         | Output validation/escaping, lawful provider clients, per-provider quota, restricted fetch targets       |
| Library/PDF           | Copyright leakage, malicious files, cross-tenant objects                         | Rights metadata, quarantine, private buckets, parser sandbox, scoped signing                            |
| AI                    | Prompt injection, private retrieval leakage, hallucinated citations, spend abuse | Evidence separation, SQL ACL filters/rechecks, exact provenance verification, quotas/tool authorization |
| Documents/tasks       | XSS, unauthorized assignment, lost writes                                        | Tiptap schema/sanitization, same-project assignees, optimistic versions                                 |
| Communication         | Subscription leakage, spam, malicious links                                      | Private topic policies, persist-before-broadcast, revoke/reconnect tests, rate limits, safe links       |
| Search/notifications  | Snippets or titles leak private data                                             | Live ACL predicates and permission-aware links; safe minimal notifications                              |
| Execution/manuscripts | Code execution, network/FS escape                                                | Dedicated isolated sandbox, no host secrets, egress/CPU/memory/time caps; separate security design      |
| Billing/admin         | Forged webhooks, excess privilege                                                | Signature and replay verification, entitlements ledger, delegated scopes, immutable audits              |

## Confidential AI handling

Only explicitly authorized sources enter a context; tenant filters execute before ranking. Recheck sources after retrieval and before rendering. Organization provider policy governs data retention, region, training opt-out and sensitive-data consent. Citations prove source location only when verified; scientific entailment needs evaluation. Model tool calls are proposals and require server capability checks and explicit authorization for effects.

## Audit, lifecycle, operations

Future AuditEvent stores append-only actor/action/resource/time/requestId/redacted metadata for membership, visibility, export, deletion and privileged actions. Restrict audit access and retention. Export jobs reauthorize at execution and download; zip objects are private with short-lived links. Soft deletion hides objects immediately; purge is delayed until retention/legal holds and source/citation requirements are resolved. Account deletion must transfer owned research or explicitly confirm archival policy before Auth deletion.

Supabase backups/PITR plan must be selected and verified for staging/prod; no backup service is provisioned in Phase 00. Define recovery-point/time targets with lab pilots (initial hypotheses RPO 24h/RTO 4h), encrypt exports, restrict restore credentials, and perform staging restore drills before beta. Test DB and Storage recovery together; database backups alone do not restore objects. Incident response: revoke affected credentials, suspend capability, preserve redacted audit evidence, restore in isolation, verify scope, document notification obligations. No production compliance certification is claimed.
