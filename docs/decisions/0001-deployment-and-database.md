# ADR 0001 — Coolify and self-hosted PostgreSQL

Date: 2026-11-09
Status: selected for the new plan; implementation/provisioning not started.

## Decision

Use Docker-based application deployment managed by Coolify and a self-hosted PostgreSQL database in the same controlled infrastructure. Plan Next.js/React/TypeScript as a modular monolith and Prisma for database access/migrations. Phase 00 researched a candidate supported version matrix in [ARCHITECTURE](../ARCHITECTURE.md); exact patch/image pins and integration verification are the first implementation gate in Phase 01, not an installed-toolchain claim.

Use a dedicated Atlas database and least-privilege runtime role. Keep the database private on the appropriate internal network; use persistent storage and separate development/production data. Plan PostgreSQL full-text search first and evaluate pgvector in Phase 04 when semantic retrieval is needed. No mandatory Redis dependency is introduced.

## Why

Atlas has relational project/membership/permission data, linked research artifacts and transactional collaboration needs. PostgreSQL fits that model while keeping infrastructure under the user's Coolify deployment. The decision avoids a required hosted database subscription.

PostgreSQL does not itself supply authentication, private object storage or realtime product behavior. Phase 00 must specify those boundaries rather than silently inheriting old Supabase dependencies.

## Operations

Phase 00 documents the Docker build, internal networking, health/readiness, resource budgets, migrations, secrets, backup storage/retention, database-plus-file restore rehearsal, deployment and rollback. Provisioning and the first real deployment belong to Phase 01; do not touch old services now.

Do not treat a local volume on the same host as the only backup. Choose the actual independent backup destination during deployment planning, considering the user's cost preference; do not purchase a service automatically.

## Official references

- https://coolify.io/docs/databases/postgresql
- https://coolify.io/docs/databases/backups
- https://www.postgresql.org/docs/

No exact PostgreSQL major, package version, provider credential or external resource identifier was pinned by the preparation step. Phase 00's conceptual candidate does not provision or change any existing resource. Operational detail is in [COOLIFY_PLAN](../COOLIFY_PLAN.md).
