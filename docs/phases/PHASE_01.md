# Phase 01 — Core platform

Status: planned; not implemented

## 1. Objective

Deliver core platform as the phase outcome. Authentication, profile linkage, personal organizations, workspaces, projects, invitations, memberships and effective permissions.

## 2. Dependencies

Phase 00 checks green; new Atlas Supabase development/staging projects; verified auth redirect/domain configuration.

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

## 6. Proposed files and directories

apps/web/src/features/{identity,organizations,workspaces,projects,memberships}/server; app/{login,register,onboarding}; app/api/v1; packages/database/prisma/migrations; tests/integration/auth.

## 7. Data model changes

Invitation (tokenHash, scope, role, expiresAt, consumedAt); AuditEvent; personal owner/provisioning key; profile auth FK; optimistic versions; active-membership policies and role grants.

## 8. Required APIs

Auth callback/session handling; workspace/project list/create/read/update/archive; scoped invite/accept/revoke and membership role endpoints from API_CONTRACTS.

## 9. UI states and workflows

Logged out, verification pending/expired, onboarding draft/success/retry, no workspace, private project denied, invitation expired/revoked/accepted, last-owner conflict.

## 10. Security requirements

Live session verification, same-origin mutation/CSRF rules, server scope/capability guards, RLS without BYPASSRLS, Auth enumeration resistance and audit-safe logging.

## 11. Testing requirements

Email/token callbacks in isolated test environment; idempotent onboarding concurrency; complete role/action matrix; two-tenant and pooler identity reuse tests; keyboard form E2E.

## 12. Acceptance criteria

- [ ] A new researcher gets exactly one personal org/workspace after replayed bootstrap requests.
- [ ] Invitations cannot replay, exceed inviter authority or cross tenant scope.
- [ ] Removed memberships deny API, direct SQL and deep links without leaking names.
- [ ] Last-owner deletion/demotion races preserve one active owner.
- [ ] No sample identifier bypass can reach live services.

## 13. Definition of Done

Each acceptance criterion has recorded evidence; applicable unit/integration/E2E and quality checks pass; migration SQL is reviewed against an identified environment; docs/API/security/ADRs reflect behavior; no unresolved critical defects; actual NOT RUN checks and external blockers are explicit. No later-phase behavior is implied by completion.

## 14. Dependencies on later phases

Library, AI, docs/tasks and messaging all depend on these guards. Future enterprise grants may extend policy but cannot weaken current private-content boundaries.

## 15. Risks and mitigation

Auth cookie and pooled RLS semantics may diverge; test actual Supabase pooler and session refresh. Provisioning is blocked until isolated account resources are available.

## 16. Suggested issue breakdown for coding agents

- P01-01: Provision isolated Atlas Auth/DB roles Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Establish contracts before dependent UI work.
- P01-02: Implement idempotent personal organization/workspace bootstrap with creator identity uniqueness Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
- P01-03: Create central policy/capability service implementing DATABASE role matrix Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
- P01-04: Implement workspace/project CRUD with private defaults, explicit owner grant, cursor pagination, optimistic update versions and archive recovery. Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
- P01-05: Add hashed expiring single-use invitations, atomic acceptance, role ceilings, last-owner transaction locks and membership audit events. Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
- P01-06: Add non-owner runtime DB/RLS policies, server DTO routes, distributed rate limits and cross-tenant/pooler tests before enabling live mode. Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
