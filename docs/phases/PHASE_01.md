# Phase 01 — Core platform

Status: implemented core under verification; hosted development signup, confirmation, onboarding, persisted-project return login and pooler checks pass; hosted recovery/OAuth, deployed security and production invitation delivery gates remain open. See [implementation report](PHASE_01_IMPLEMENTATION_REPORT.md).

## 1. Objective

Deliver core platform as the phase outcome. Authentication, profile linkage, personal organizations, workspaces, projects, invitations, memberships and effective permissions.

## 2. Dependencies

Phase 00 foundation and Phase 00.5 UI contracts reviewed; explicitly identified Atlas development target; verified auth redirect/domain configuration. Hosted staging/production activation remains separate.

## 3. Exact scope

Authentication, profile linkage, personal organizations, workspaces, projects, invitations, memberships and effective permissions.

## 4. Out of scope

Paper integrations, AI, rich editor, messaging, payments, university administration.

## 5. Detailed implementation tasks

1. Provision isolated Atlas Auth/DB roles; bind profile UUID to verified identity; implement server cookie/PKCE callback, refresh, logout and redirect allowlist.
2. Implement idempotent personal organization/workspace bootstrap with creator identity uniqueness; use a single transaction and recover incomplete onboarding.
3. Create central policy/capability service implementing DATABASE role matrix; resolve resource scope from DB, reject revoked/archived parents.
4. Implement workspace/project CRUD with private defaults, explicit owner grant, cursor pagination, optimistic update versions and archive recovery.
5. Add hashed expiring single-use invitations, atomic acceptance, role ceilings, last-owner transaction locks and membership audit events.
6. Add non-owner runtime DB/RLS policies, server DTO routes, distributed rate limits and cross-tenant/pooler tests before enabling live mode.

## 6. Implemented files and directories

`apps/web/src/features/identity` contains Auth adapters/services and `features/platform` contains tenant services, page loaders and live presentation. Routes live in `app/{login,register,onboarding,auth/callback,api/v1,app}`; domain contracts in `packages/core/src/platform.ts`; SQL in `packages/database/prisma/migrations`; tests in `tests/{unit,integration,auth,e2e}`. Small tenant services share the platform domain rather than introducing empty packages.

## 7. Data model changes

Invitation (tokenHash, scope, role, expiresAt, acceptedAt/revokedAt); AuditEvent; RateBucket; personal owner/provisioning keys; profile auth FK, onboarding completion/draft and research attributes; optimistic versions; active-membership policies and role grants.

## 8. Required APIs

Auth callback/session handling; workspace/project list/create/read/update/archive; scoped invite/accept/revoke and membership role endpoints from API_CONTRACTS.

## 9. UI states and workflows

Logged out, verification pending/expired, onboarding draft/success/retry, no workspace, private project denied, invitation expired/revoked/accepted, last-owner conflict.

## 10. Security requirements

Live session verification, same-origin mutation/CSRF rules, server scope/capability guards, RLS without BYPASSRLS, Auth enumeration resistance and audit-safe logging.

## 11. Testing requirements

Email/token callbacks in isolated test environment; idempotent onboarding concurrency; complete role/action matrix; two-tenant and pooler identity reuse tests; keyboard form E2E.

## 12. Acceptance criteria

- [x] A new researcher gets exactly one personal org/workspace after replayed bootstrap requests (real PostgreSQL concurrency and Auth browser tests).
- [x] Invitations cannot replay, exceed inviter authority or cross tenant scope (real SQL lifecycle/role tests and Auth collaboration journey).
- [x] Removed memberships deny API/direct SQL; unauthorized deep links conceal names (SQL, HTTP and actual Auth browser coverage).
- [x] Last-owner deletion/demotion races preserve one active owner (organization/project concurrency tests).
- [x] No sample identifier bypass can reach live services (strict contracts and live route guards).

These checks describe the disposable environments in the implementation report. Hosted configuration, pooler, email/OAuth and production invitation delivery remain release gates.

## 13. Definition of Done

Each acceptance criterion has recorded evidence; applicable unit/integration/E2E and quality checks pass; migration SQL is reviewed against an identified environment; docs/API/security/ADRs reflect behavior; no unresolved critical defects; actual NOT RUN checks and external blockers are explicit. No later-phase behavior is implied by completion.

## 14. Dependencies on later phases

Library, AI, docs/tasks and messaging all depend on these guards. Future enterprise grants may extend policy but cannot weaken current private-content boundaries.

## 15. Risks and mitigation

Auth cookie and pooled RLS semantics may diverge; test the actual hosted Supabase pooler and session refresh. Disposable GoTrue/PostgreSQL tests pass; the approved hosted development target now has reviewed migrations, a non-owner runtime and passing read-only Prisma/pooler checks; actual hosted signup/email confirmation/onboarding and return login pass; hosted recovery/OAuth and deployed security remain open. Production invitation creation remains gated until approved delivery exists.

## 16. Suggested issue breakdown for coding agents

- P01-01: Provision isolated Atlas Auth/DB roles Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Establish contracts before dependent UI work.
- P01-02: Implement idempotent personal organization/workspace bootstrap with creator identity uniqueness Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
- P01-03: Create central policy/capability service implementing DATABASE role matrix Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
- P01-04: Implement workspace/project CRUD with private defaults, explicit owner grant, cursor pagination, optimistic update versions and archive recovery. Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
- P01-05: Add hashed expiring single-use invitations, atomic acceptance, role ceilings, last-owner transaction locks and membership audit events. Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
- P01-06: Add non-owner runtime DB/RLS policies, server DTO routes, distributed rate limits and cross-tenant/pooler tests before enabling live mode. Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.

## Phase 00.5 presentation handoff

Follow [Phase 00.5 integration requirements](PHASE_00_5.md), [screen map](../SCREEN_MAP.md), and [AI interaction contracts](../AI_INTERACTION_SPEC.md). Replace local auth/onboarding review with verified services, provide membership-authorized workspace/project DTOs and real empty/denied states, and preserve private defaults. Never accept synthetic `sample` IDs, reference chips, UI proposals or local preferences as authorization. UI-only demonstration content must remain separate from production models and cannot bypass server guards.
