# ADR 0004: Supabase Boundaries

Status: accepted · 2026-10-21

## Context

Auth, private files and initial realtime are required managed capabilities.

## Decision

Supabase owns identity/storage/realtime; Prisma accesses Postgres server-side. No direct browser private-table access.

## Alternatives considered

Full browser Supabase Data API; custom identity/storage; reuse existing product infrastructure.

## Reasoning

Keeps domain authorization centralized while using mature managed services and isolated Atlas resources.

## Consequences

RLS, storage and realtime policies must align with server policy; service-role bypass is prohibited for normal traffic.

## Revisit conditions

Supabase service limits, region or compliance requirements with measured evidence.
