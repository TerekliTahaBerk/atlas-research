# API contracts and service boundaries

Status: design contracts only. Phase 00 exposes no product API endpoints. `packages/core` contains Zod project/page schemas, error categories/statuses, ApiResult, and TenantScope; this scope type is descriptive, not proof of authorization.

## Request standard

App Router `app/api/v1/.../route.ts` handlers validate path/query/body with Zod and cap body size. Server Actions follow the same auth/policy/service path; actions are not trusted merely because called from the UI. Server code verifies Supabase session claims and resolves parent scope from the resource, then checks live membership. Reject deleted containers. Return minimal DTOs, never Prisma rows or provider responses. Use `Cache-Control: private, no-store` for private responses.

Success: `{ data: T, requestId: string }`; page data: `{ items: T[], nextCursor: string | null }`. Failure: `{ error: { code, message }, requestId }`. Generate server UUID requestId; validate any incoming trace header format/length before correlation. `X-Request-Id` echoes the safe ID. Redacted structured logs map internal exceptions to public-safe messages.

| Code                    | HTTP | Public behavior                                               |
| ----------------------- | ---- | ------------------------------------------------------------- |
| VALIDATION_ERROR        | 400  | Safe field-level validation; never echo secrets               |
| UNAUTHENTICATED         | 401  | Sign in again; no stale session access                        |
| FORBIDDEN               | 403  | Deny capabilities on already-visible resources                |
| NOT_FOUND               | 404  | Missing or undiscoverable resource, including other tenants   |
| CONFLICT                | 409  | Duplicate key/payload mismatch or optimistic version conflict |
| RATE_LIMITED            | 429  | Retry-After header and retryable status                       |
| EXTERNAL_PROVIDER_ERROR | 502  | Provider temporarily unavailable, no raw response             |
| INTERNAL_ERROR          | 500  | Generic failure with request ID                               |

## Pagination, filters, limits

Opaque signed cursor encodes `(createdAt,id)`, fixed filters, resource scope and order; enforce actor scope again each request. Core `pageQuery` currently permits a UUID cursor placeholder for service contract prototyping; replace with validated opaque cursor schema when pagination endpoints ship. Limit default 30, max 100. Never accept arbitrary SQL column/filter strings. Whitelist query/state/type/date filters. Do not return total counts unless needed and authorized. Searches use provider-specific opaque cursors, not cross-provider offsets.

Distributed rate limits are planned before exposed APIs: actor + workspace + operation, stricter anonymous IP/auth rules, provider budgets, AI spend reservations. Initial candidate limits (hypotheses): reads 120/min, writes 30/min, search 20/min, AI 5/min with concurrent-run cap 2. Revisit by measurement. In-memory rate limiting alone is insufficient on Vercel.

Mutations that can be replayed accept Idempotency-Key (UUID). Unique actor/scope/operation/key with payload hash, expiry, and result pointer; identical replay returns prior result, changed payload returns CONFLICT. DB transaction commits state and idempotency result together. Editing uses expectedVersion/If-Match. No automatic failover of ambiguous paid AI writes.

Version path `/api/v1`; additive optional fields remain compatible; breaking contract changes need new API version and migration plan. Internal services are typed functions and do not call HTTP routes. Validate provider outputs separately. CSRF protection: same-origin mutations, origin checks, secure cookies; never mutate via GET.

## Representative future endpoints

| Endpoint                                          | Input → data                                              | Authorization / failure                                     |
| ------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------- |
| GET /api/v1/workspaces                            | cursor/limit → Workspace[]                                | Active memberships only                                     |
| POST /api/v1/organizations/:id/workspaces         | name, key → Workspace                                     | Org admin; transaction with owner/admin grant               |
| GET /api/v1/workspaces/:id/projects               | visibility/cursor → Project[]                             | Filter inaccessible private projects                        |
| POST /api/v1/workspaces/:id/projects              | name, visibility → Project                                | Active member; private default; create owner atomically     |
| POST /api/v1/projects/:id/invitations             | email, role → Invitation                                  | Project owner and eligible org/workspace policy             |
| PATCH /api/v1/projects/:id/memberships/:profileId | role, expectedVersion → Membership                        | Owner; last-owner lock; no escalation                       |
| GET /api/v1/projects/:id/research                 | q, provider, cursor → PaperCandidate[]                    | Read + provider quota; normalized metadata                  |
| POST /api/v1/projects/:id/papers                  | provider/externalId or normalized metadata → ProjectPaper | Editor; DOI and request dedup                               |
| POST /api/v1/projects/:id/uploads                 | mediaType, bytes, checksum → short-lived upload grant     | Editor; private quarantine path; separate finalize endpoint |
| POST /api/v1/projects/:id/documents               | title, content → Document                                 | Editor; content schema validation                           |
| PATCH /api/v1/documents/:id                       | content, expectedVersion → DocumentVersion                | Editor; stale version 409                                   |
| POST /api/v1/projects/:id/tasks                   | title, assigneeIds → Task                                 | Editor; assignees in same project                           |
| POST /api/v1/channels/:id/messages                | body, clientMessageId → Message                           | Project + restricted-channel permission                     |
| GET /api/v1/channels/:id/messages                 | cursor → Message[]                                        | Live permission on backfill                                 |
| POST /api/v1/projects/:id/conversations           | title, visibility → Conversation                          | Project read; explicit creator privacy                      |
| POST /api/v1/conversations/:id/runs               | messages, sourceIds, key → Run                            | Conversation grant + source ACL + quota reservation         |
| GET /api/v1/runs/:id/events                       | Last-Event-ID → SSE AIStreamEvent                         | Same actor scope, reconnect policy, bounded lifetime        |

All endpoint IDs are UUIDs. `/app/projects/sample` is a preview-only UI identifier; never accept `sample` in production API schemas. A URL organization/workspace/project mismatch returns 404. Validation order must not leak resource existence to unauthorized actors.
