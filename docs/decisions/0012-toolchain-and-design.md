# ADR 0012: Toolchain And Design

Status: accepted · 2026-10-21

## Context

Fresh repo needs reproducible installs, accessible UI and compatible stable tools.

## Decision

Node 24 LTS (.nvmrc 24.21.0), pnpm 11.25.0, exact manifest pins/lockfile, Tailwind 4.3.3, shadcn CLI 4.21.0 source, Radix, Lucide, system fonts, Vitest/RTL/Playwright. ESLint 9.39.5 remains pinned because Next’s React/import/accessibility plugins do not declare ESLint 10 support; a trial upgrade produced incompatible peer requirements and was reverted. This is explicit toolchain maintenance debt.

## Alternatives considered

Blind latest tags (Prisma latest was RC); custom UI primitives; heavyweight monorepo build orchestrator.

## Reasoning

Simple pnpm scripts suffice; mature accessible primitives and semantic tokens support consistent screens. Current shadcn CLI failed; its recommended prior version generated the foundation successfully.

## Consequences

Registry generated cn package imports were replaced by the single local utility; strict types and browser verification remain mandatory. No external fonts at build time.

## Revisit conditions

Upgrade to ESLint 10 when upstream plugin peer ranges support it; inspect advisories meanwhile. Supported runtime/dependency security updates or proven workspace orchestration bottlenecks.
