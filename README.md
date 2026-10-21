# Atlas Research OS

An independent foundation for a connected academic research workspace. Phase 00 implements the application shell, reusable UI, contracts, tenant schema, quality tooling, and architectural documentation. No Scholara code, credentials, schema, or infrastructure is used.

## Start

Use Node **24.21.0** (`nvm install && nvm use`) and **pnpm 11.25.0** (`npm install --global pnpm@11.25.0`). The supported engine range is Node 24.19–24.x; the execution host also validated Node 24.19.0 through its bundled pnpm runtime.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://127.0.0.1:3000. No environment file or external account is required. `/app` opens a clearly labelled sample workspace. Only theme preference is saved locally. Authentication, research data persistence, AI, uploads, and collaboration are not implemented.

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

`pnpm start` serves the production build. Playwright launches its own production server on port 3100; build first. See [Development](docs/DEVELOPMENT.md), [Testing](docs/TESTING.md), and [deployment procedure](docs/DEPLOYMENT.md).

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

Start future changes with [AGENTS.md](AGENTS.md), [master plan](docs/MASTER_PLAN.md), and the relevant phase specification. [Phase 00 handover](docs/HANDOVER.md) records actual validation and remaining external work. No production security or authentication claim is made by the preview.
