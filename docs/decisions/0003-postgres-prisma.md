# ADR 0003: Postgres Prisma

Status: accepted · 2026-10-21

## Context

Tenancy, linked research and integrity need relational transactions.

## Decision

PostgreSQL with Prisma 7.10.1, explicit pg adapter, UUIDs and reviewed SQL migrations.

## Alternatives considered

Prisma 8 RC; raw SQL-only; document database.

## Reasoning

Prisma 8 was prerelease; stable 7 supports Node 24 and modern TypeScript. SQL remains available for RLS/vector.

## Consequences

Generated client is ignored; builds generate it. SQL-only policies require separate review and integration tests.

## Revisit conditions

Prisma stable major migration with compatibility/security need or query limitations.

## Compatibility reference

[Prisma 7 documentation](https://www.prisma.io/docs/orm/v7) confirms driver-adapter and ESM requirements; the configured schema/client/adapter were validated locally.
