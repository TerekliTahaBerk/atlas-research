# Deployment preparation

Intended host: a **new Atlas Vercel project**, repository TerekliTahaBerk/atlas-research, Root Directory `apps/web`, Next.js framework, Node 24.x. `apps/web/vercel.json` installs from workspace root with frozen lockfile and runs the root build. Include files outside root directory in Vercel project settings so workspace packages are available. Never select an existing Scholara project, database, integration, or environment.

## Preview procedure

1. Verify team identity and the new project name `atlas-research`; connect only the Atlas GitHub repository. The MCP identity endpoint returned `404 User not found`, but team-scoped access subsequently verified the yulaco team (`team_1foVBHG3EF94VyGJuzL461Vj`) and confirmed no existing `atlas-research` project. Automatic approval review then rejected creating a new project, classifying persistent hosted provisioning as an unapproved external change. No project or deployment was created. Human approval for that concrete new protected-preview project is the remaining deployment gate.
2. Import repository with Root Directory `apps/web`, Node 24.x, pnpm 11.25.0 from packageManager. Keep production branch main; use an Atlas feature branch/PR for preview. Configure Deployment Protection if available. No Supabase/AI keys are needed for the UI preview.
3. Run local/CI gates before deploying. Vercel Git integration can produce preview builds; otherwise install a reviewed pinned Vercel CLI, `vercel link` to the explicitly verified new Atlas project, then `vercel deploy` from apps/web (preview only). Do not promote to production during Phase 00.
4. Verify deployment status READY and the returned URL, then test /, /app, navigation, both themes, mobile and 404 in that actual preview. Protected previews require the official protection access workflow; never make them public merely for tests.
5. Record project/team/commit/environment/URL and build result in handover. No successful deployment is claimed without these results.

## Later data-backed deployment

Create separate Atlas Supabase dev/staging/prod projects, region near Vercel compute. Provision Auth redirect allowlists, non-owner database runtime role/policies, private Storage and Realtime policies before exposing services. Keep migration direct connection separate from pooled runtime URL. Add secrets in environment scope, not source. Migration is a reviewed explicit release step with backup/restore evidence and expand/backfill/contract plan. Builds never auto-migrate. Production release needs beta/security gates in Phase 06.
