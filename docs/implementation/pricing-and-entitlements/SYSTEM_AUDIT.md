# Atlas Research commercial systems audit

Baseline: `TerekliTahaBerk/atlas-research` at `a121975`. The Docker/Coolify app is a Next.js modular monolith. PostgreSQL is self-hosted, Prisma handles application queries, and Better Auth owns verified identities and sessions. PostgreSQL RLS runs under a separate NOBYPASSRLS runtime connection with transaction-local identity. The repository has no Supabase dependency.

| Area | Existing system | Extension |
| --- | --- | --- |
| Identity, teams, projects | Better Auth, personal/shared workspaces, project roles, archived project timestamps, verified-email invitations | Resolve entitlements by workspace. Count editing membership across projects without counting viewers. |
| Content | Versioned Tiptap documents, math, tasks, annotated PDF reader | Preserve current routes, version histories, links and project-level checks. |
| Files | Private disk objects, upload intents, project-authorized streaming | Reuse private storage and intent lifecycle. Add scoped reservations and live capacity summaries. |
| Index | Poppler extraction and PostgreSQL text pages/chunks through the file worker | Meter actual indexed UTF-8 data separately. Keep authorization and source-version boundaries. |
| AI | Private scoped runs with a daily USD budget, bounded provider calls and evidence verification | Add versioned provider price quotes, credit reservations and program-wide provider spend controls. |
| Jobs | PostgreSQL queue and independent file and SMTP workers | Reuse recovery, lease and isolated-role patterns. |
| Python and LaTeX | Mathematical notation is supported. There is no executable Python or native LaTeX compiler endpoint or trusted runner. | Publish finite plan allocations. Keep execution unavailable until an isolated runner is deployable and verified. |
| Billing and academic | No provider or commercial entitlement state | Add an inactive-by-default commercial module and a controlled signed test-provider event path. |
| Admin and invitations | Project administration, hashed project invites, encrypted transactional SMTP outbox | Reuse lifecycle and outbox patterns for operator-reviewed early access, with sending disabled by default. |

The audited release information is from local source and handoffs. This audit made no calls to production data, billing, AI or mail.
