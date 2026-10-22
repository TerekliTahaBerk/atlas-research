# Atlas Research OS

## Phase 01 core platform

The Phase 01 implementation adds real Supabase Auth flows, server-verified identity, profiles, recoverable onboarding, personal/shared organizations, workspaces, projects, invitations and membership authorization. The approved UI remains available as the default explicit design preview; configure `ATLAS_MODE=live` at build and runtime to use the real platform. See [environments](docs/identity/ENVIRONMENTS.md), [authentication](docs/identity/AUTHENTICATION.md), [authorization](docs/identity/AUTHORIZATION.md) and the [implementation report](docs/phases/PHASE_01_IMPLEMENTATION_REPORT.md) for actual verification and release blockers. Hosted database/TLS/pooler compatibility checks pass in the approved development project; hosted Auth email/OAuth and deployment remain separate gates; no production-readiness claim is made.

Live mode rejects sample identifiers and uses authorized DTOs for navigation/Home/settings. Research processing, AI, documents, messages, compilation and execution remain later-phase features; no synthetic research is attached to live projects. Invitation emails are not configured; only explicit loopback development links can be created.

Additional checks: `pnpm test:integration` requires explicit disposable PostgreSQL test URLs. `pnpm test:auth:e2e` uses the disposable GoTrue/email harness in `tests/auth/compose.yml`; it never requires hosted credentials. Explicit non-mutating hosted compatibility checks are documented in `docs/TESTING.md` and require the approved development target.

An independent foundation for a connected academic research workspace. Phase 00 implements architecture, contracts, tenant schema and tooling. Phase 00.5 extends it with a cohesive UI system, ten module screens, contextual Atlas AI presentation, and authentication/onboarding design previews. No Scholara code, credentials, schema, or infrastructure is used.

## Start

Use Node **24.21.0** (`nvm install && nvm use`) and **pnpm 11.25.0** (`npm install --global pnpm@11.25.0`). The supported engine range is Node 24.19–24.x; the execution host also validated Node 24.19.0 through its bundled pnpm runtime.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://127.0.0.1:3000. No environment file or external account is required. `/app` opens a clearly labelled sample workspace. Only theme and sidebar preferences are saved locally. Notes, tasks, messages, reading lists, and onboarding choices are explicit in-memory demonstrations that reset when you leave their screen. Authentication, research data persistence, AI, uploads, and collaboration are not implemented.

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm format:check
pnpm db:validate
```

`pnpm start` serves the production build. Playwright launches its own production server on port 3100; build first. For restricted local environments where Turbopack cannot bind its CSS worker port, `pnpm build --webpack` runs the same production checks through Next.js’s supported Webpack bundler. See [Development](docs/DEVELOPMENT.md), [Testing](docs/TESTING.md), and [deployment procedure](docs/DEPLOYMENT.md).

## Workspace

| Path                | Responsibility                                                     |
| ------------------- | ------------------------------------------------------------------ |
| `apps/web`          | Next.js App Router, shell, preview screens, environment validation |
| `packages/ui`       | shadcn/Radix component source and shared class utility             |
| `packages/core`     | Zod inputs, API errors, tenant scope contracts                     |
| `packages/database` | Prisma schema, client factory, migrations                          |
| `packages/ai`       | Provider-neutral interfaces; no provider implementation            |
| `tests`             | Unit, component, browser, and isolated database verification       |
| `docs`              | Product, architecture, security, design, decisions, phase plans    |

Start future changes with [AGENTS.md](AGENTS.md), [master plan](docs/MASTER_PLAN.md), and the relevant phase specification. [Phase 00 handover](docs/HANDOVER.md) records actual validation and remaining external work. See the [UX blueprint](docs/UX_MASTER_BLUEPRINT.md), [screen map](docs/SCREEN_MAP.md), and [Phase 00.5 delivery record](docs/phases/PHASE_00_5.md). No production security, authentication, source verification, or AI execution claim is made by the preview.
