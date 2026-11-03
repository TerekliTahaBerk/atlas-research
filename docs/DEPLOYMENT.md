# Deployment preparation

**Execution update, 3 November 2026:** [Current evidence](operations/A01_HOSTED_EXECUTION_2026-11-02.md) supersedes earlier gate blockers: G1–G3 PASS; all 12 migrations are installed. Approved G4 development Storage/scanner and isolated extraction services are running; G5 non-AI hosted journeys and the loopback Zotero fixture passed, and all test identities/content were cleaned. Automatic AI indexing, paid AI, live Zotero credentials and production remain outside this verification.

Current consolidation evidence and unresolved hosted approvals: [A01–A03 final closure](phases/A01_A02_A03_FINAL_CLOSURE_REPORT.md). Historical status paragraphs below retain their original observation dates.

## Current activation gate

Current evidence and controlled execution: [A01 readiness report](phases/A01_INFRASTRUCTURE_READINESS_REPORT.md) and [G1–G7 approval manifest](operations/A01_APPROVAL_MANIFEST.md). Read-only closure checks on 2 November 2026 report ACTIVE_HEALTHY, Free/PG17.11, three installed migrations and zero Storage buckets/objects. The default main / PRODUCTION classification still requires an explicit development/staging decision before any mutation. G1 authenticated denial and G2 recovery remain open; the final nine-file pending migration batch requires separate G3 approval. No deployment is authorized by these preparation documents.

Phases 01–04 have repository implementations. Hosted Phase 02–04 activation is blocked; follow the [A00/A01 prerequisites](phases/A00_REPOSITORY_HARDENING_REPORT.md) and the ordered [Phase 02](phases/PHASE_02_ACTIVATION_PLAN.md), [Phase 03](phases/PHASE_03_ACTIVATION_PLAN.md) and [Phase 04](phases/PHASE_04_ACTIVATION_PLAN.md) plans. The three-migration instructions below describe historical Phase 01 activation only, not a current release procedure. Builds must never apply migrations automatically.

## Phase 01 activation

The live platform requires `ATLAS_MODE=live` at both build and runtime, an isolated Atlas Supabase environment, exact Auth callback allowlists and a dedicated non-owner `atlas_runtime` database login. See [environment setup and verification gates](identity/ENVIRONMENTS.md) and `.env.example`. Keep `DIRECT_URL` only in reviewed migration jobs; web builds do not migrate. Apply the three reviewed migrations through Prisma against an explicitly named development target first. Validate the auth identity FK, runtime grants, RLS under the actual hosted pooler and transaction-local actor cleanup before enabling live traffic.

Do not enable Google without provider credentials or production invitation creation without an approved delivery mechanism. Preview mode remains a credential-free design environment. No Phase 01 Vercel deployment, production promotion or billing resource was created by this implementation. The historical foundation procedure below is not a record of Phase 01 deployment.

Intended host: a **new Atlas Vercel project**, repository TerekliTahaBerk/atlas-research, Root Directory `apps/web`, Next.js framework, Node 24.x. `apps/web/vercel.json` installs from workspace root with frozen lockfile and runs the root build. Include files outside root directory in Vercel project settings so workspace packages are available. Never select an existing Scholara project, database, integration, or environment.

## Preview procedure

1. Verify team identity and the new project name `atlas-research`; connect only the Atlas GitHub repository. The MCP identity endpoint returned `404 User not found`, but team-scoped access subsequently verified the yulaco team (`team_1foVBHG3EF94VyGJuzL461Vj`) and confirmed no existing `atlas-research` project. Automatic approval review then rejected creating a new project, classifying persistent hosted provisioning as an unapproved external change. No project or deployment was created. Human approval for that concrete new protected-preview project is the remaining deployment gate.
2. Import repository with Root Directory `apps/web`, Node 24.x, pnpm 11.25.0 from packageManager. Keep production branch `master`; use an Atlas feature branch/PR for preview. Configure Deployment Protection if available. No Supabase/AI keys are needed for the UI preview.
3. Run local/CI gates before deploying. Vercel Git integration can produce preview builds; otherwise install a reviewed pinned Vercel CLI, `vercel link` to the explicitly verified new Atlas project, then `vercel deploy` from apps/web (preview only). Do not promote to production during Phase 00.
4. Verify deployment status READY and the returned URL, then test /, /app, navigation, both themes, mobile and 404 in that actual preview. Protected previews require the official protection access workflow; never make them public merely for tests.
5. Record project/team/commit/environment/URL and build result in handover. No successful deployment is claimed without these results.

## Later data-backed deployment

Create separate Atlas Supabase dev/staging/prod projects, region near Vercel compute. Provision Auth redirect allowlists, non-owner database runtime role/policies, private Storage and Realtime policies before exposing services. Keep migration direct connection separate from pooled runtime URL. Add secrets in environment scope, not source. Migration is a reviewed explicit release step with backup/restore evidence and expand/backfill/contract plan. Builds never auto-migrate. Production release needs beta/security gates in Phase 06.
