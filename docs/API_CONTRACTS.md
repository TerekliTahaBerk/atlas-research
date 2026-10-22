# API contracts and service boundaries

## Phase 01 implemented interfaces

The implementation uses one typed command interface rather than duplicating REST and Server Action mutations. `POST /api/v1/commands` accepts the strict `platformCommand` discriminated union from `packages/core/src/platform.ts`. Commands: `onboarding.save`, `bootstrap`, `profile.update`, `organization.create/update/archive`, `workspace.create/update/archive`, `project.create/update/archive/restore`, `invitation.create/revoke/accept`, `membership.set/remove`. Container/member edits require `expectedVersion`; project creation requires a UUID `idempotencyKey`. IDs/scopes/actors cannot be reassigned through extra body fields. Roles are validated per scope.

`POST /api/v1/auth` accepts signup/signin/reset/password/logout/google with action-specific validation. `GET /api/v1/me?workspaceId=&cursor=` returns the actor profile/email, accessible organization/workspace projections and a project page. Project cursors are signed and bound to actor/workspace. `GET /api/v1/projects/:id` returns authorized metadata/capabilities; `GET /api/v1/{organizations,workspaces,projects}/:id/members` returns authorized members; `GET /api/v1/invitations` lists administrable invitations. No Phase 02 endpoint exists. The representative future endpoints below remain future contracts unless explicitly listed here.

Controllers enforce JSON size (32 KiB streamed bound), same-origin mutation checks, verified sessions, distributed quotas, no-store, safe UUID request IDs and normalized errors. Services and SQL independently check scope/capabilities. Missing and inaccessible private resources share 404/unavailable responses. SQL/provider details are never forwarded. Rate failures include Retry-After. Production invite creation fails closed without configured delivery; local links explicitly say no email was sent.

Organization/workspace directories, memberships and invitations use signed actor/scope-bound cursors with 100-row pages; project pages contain 30 rows. GET `/api/v1/organizations?cursor=` and `/api/v1/workspaces?cursor=` continue navigation directories. Member and invitation list responses are `{items,nextCursor}`. Requested authorized contexts beyond the initial navigation page are loaded through fixed-ID RLS lookups. All pages recheck live access.

Status: Phase 01 interfaces listed above are implemented; later research endpoints remain design contracts. `packages/core` contains Zod project/page schemas, error categories/statuses, ApiResult, and TenantScope; this scope type is descriptive, not proof of authorization.

`POST /api/v1/context` accepts `{workspaceId,projectId?}` after fresh resource/parent authorization and saves an actor-bound HttpOnly navigation cookie. It grants no access. Page loaders reauthorize every hint, discard inaccessible recent projects, and fall back from a revoked preferred workspace. The last project is retained when returning to Home in the same workspace; switching workspaces clears that selection. `/api/v1/me` also accepts `organizationId` for intentional organization selection.

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

Phase 01 uses HMAC-signed `{id,actorId,scope}` cursors with a fixed UUID order and the page sizes above. Membership cursors use the profile UUID. Tampered, different-actor and different-scope cursors fail; each query rechecks current RLS. The generic core `pageQuery` belongs to future service contracts and is not used by these endpoints. Never accept arbitrary SQL column/filter strings. Future date-ordered research lists may use `(createdAt,id)` and provider searches use provider-specific cursors.

Phase 01 uses atomic PostgreSQL buckets: authenticated reads 120/min, writes 30/min, navigation preferences 120/min; Auth has a global 300/min limit plus 10/15min per email digest or email-less action. Provider limits remain additional. These conservative initial quotas need capacity review before public release. Future search/model quotas and spend reservations are not implemented. In-memory limiting alone is insufficient on Vercel.

Phase 01 project creation accepts the body UUID `idempotencyKey`, unique per verified creator. An identical active-project replay returns the existing record; changed name/visibility/parent conflicts. Personal bootstrap is idempotent through owner uniqueness and a single transaction. Container/member editing uses body `expectedVersion`. Other commands are not claimed to have a general replay registry. Future irreversible tool calls require their own idempotency policy and bounded retries.

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
