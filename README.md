# Atlas Research OS

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
