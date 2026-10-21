# ADR 0002: Next App Router

Status: accepted · 2026-10-21

## Context

The required stack needs SSR, deep links and server/client separation.

## Decision

Next.js 16.4.2 App Router with React 19.3.1, strict TypeScript and small client islands.

## Alternatives considered

Vite SPA plus API; Pages Router; separate backend.

## Reasoning

Matches requested stack, supports authenticated server pages and co-located route handlers. Registry peer ranges verified and install/build checks recorded.

## Consequences

Next server APIs stay at transport edges; no business logic tied to request objects.

## Revisit conditions

Framework incompatibility or documented runtime constraint.

## Compatibility references

[Next.js installation](https://nextjs.org/docs/app/getting-started/installation) and the installed Next.js `dist/docs/01-app` guide were checked. See the local not-found/loading/generateStaticParams guides for the streaming status-code behavior fixed by static preview route enumeration.
