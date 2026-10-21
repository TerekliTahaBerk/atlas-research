# ADR 0007: Realtime Communication

Status: accepted · 2026-10-21

## Context

Clients can disconnect and broadcasts can duplicate or arrive late.

## Decision

Persist messages and outbox first, then private Supabase Realtime delivery; cursor backfill and idempotency.

## Alternatives considered

Realtime as source of truth; custom WebSocket cluster; browser writes directly to messages.

## Reasoning

DB durability and scoped backfill support predictable recovery with limited infrastructure.

## Consequences

At-least-once events require dedup; membership revoke must close topic eligibility. No realtime installed in Phase 00.

## Revisit conditions

Measured fanout/latency/throughput exceeds service limits or voice needs distinct infrastructure.
