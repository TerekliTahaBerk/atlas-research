# Development

## Prerequisites/setup

Clone the Atlas repository, select Node 24.21.0 from .nvmrc, install pnpm 11.25.0, then `pnpm install --frozen-lockfile`. Node 24.19+ in the 24 LTS line is supported. pnpm workspace discovery requires root invocation. The lockfile is authoritative; dependency updates require compatibility review. Native dependency scripts are allowlisted in pnpm-workspace.yaml, not globally enabled. No Docker, database, Supabase, provider account, or environment file is needed for UI development.

`pnpm dev` → http://127.0.0.1:3000. App Router server pages compose small client islands for theme, dialogs, menus and navigation. Source imports from workspace packages are transpiled by Next.js. Tailwind scans shared UI explicitly. No external font download is needed.

## Branch workflow

`master` is the canonical/default integration branch. Create feature branches from the current `master` and target `master` when opening pull requests. `test/phase-00-foundation` remains the Phase 00 working branch; it is not the repository default. Git branches have commit ancestry rather than a permanent parent-child setting, so use the PR base to express this relationship. Keep local feature branches tracking their matching remote branches, not `origin/master`.

The quality workflow runs on pull requests and pushes to `master`. Configure a future Vercel project's production branch as `master`; feature branches produce previews.

## Commands

| Command                             | Effect                                                    |
| ----------------------------------- | --------------------------------------------------------- |
| pnpm dev                            | Single web dev server                                     |
| pnpm build / pnpm start             | Generate Prisma client, build Next app / serve production |
| pnpm lint                           | ESLint Next, hooks, TypeScript, no explicit any           |
| pnpm typecheck                      | Generate client and check all five workspace packages     |
| pnpm test                           | Vitest core/environment/components tests                  |
| pnpm test:e2e                       | Playwright production smoke suite (build first)           |
| pnpm format / pnpm format:check     | Prettier write / verify                                   |
| pnpm db:validate / pnpm db:generate | Offline Prisma schema validate / client generation        |
| pnpm db:migrate --name change_name  | Reviewed development migration (explicit DB URL required) |

## Environment/configuration

Root `.env` is loaded by Prisma CLI; Next.js reads `apps/web/.env.local`. Copy only needed values from `.env.example`. Environment schema runs during Next config loading, validates configured URLs and key pairs without printing values, and only permits preview mode until real identity/services ship. Future secrets remain optional and unused in Phase 00. Never use another product's credentials. No AI key is requested or paid call made.

## Domain implementation convention

Future `features/<domain>/server` contains service/policy/repository modules marked server-only. Validate route input via core contracts; resolve auth/scope before calling a service. Return public DTOs. Add integration tests against a disposable DB plus authorization matrices, then expose UI states. Keep domain services independent of Next request objects where feasible. Do not create empty packages for future integrations.

## Routes

See ROUTES.md for the full inventory. Preview IDs are literal `sample`; unknown IDs/modules call notFound. Future APIs require UUIDs. Deep links and contextual active navigation work without a client store.

## Database workflow

Read DATABASE.md and SECURITY.md before changing schema. Create your own empty dev DB; set DIRECT_URL explicitly. Review generated SQL and RLS changes. Use local migration history, never `db push` to staging/production. Run integration fixtures only in an identified disposable DB. Migrate deploy is an explicit release step, never part of preview build/install. Regenerate client after schema edits; generated sources remain ignored.

## Troubleshooting

Missing Prisma client: `pnpm db:generate`. Schema engine download/network restrictions: allow official Prisma engine host; do not claim validation passed if blocked. Playwright missing executable: `pnpm exec playwright install chromium` (CI uses --with-deps). Port 3100 conflict: stop the conflicting test server; Playwright intentionally does not reuse an unknown server. Workspace UI styles missing: verify global Tailwind @source, semantic variables, and transpilePackages. CI frozen-lockfile error: run reviewed `pnpm install`, retain updated lockfile, rerun checks. Do not suppress failures.

## Restricted build environments

Phase 00.5 validation encountered a Turbopack CSS worker `EPERM` while binding a local port. Keep the default `pnpm build` script unchanged. If that host restriction applies, `pnpm build --webpack` runs Next.js’s supported alternate production bundler, including type checks and static generation. Run `pnpm test:e2e` against that production output and report the default build failure separately. Do not alter assertions or disable checks to hide the restriction.
