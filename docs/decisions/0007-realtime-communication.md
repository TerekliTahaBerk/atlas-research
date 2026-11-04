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

## A04.1 amendment (2026-11-04)

Events are hints that can be lost, not only duplicated or delayed. Clients therefore run a bounded cursor reconciliation in every connection state (30 s live, 15 s degraded, paused while hidden) and treat a change page that names a newer topic as a missed rotation. Queued events are retried independently of user commands: an in-database pg_cron schedule where the extension is approved, plus a throttled sweep after authorized cursor reads. Retries back off exponentially, expire after 15 minutes and are never sent to a superseded epoch. No always-on web process, worker host or paid service is assumed.

## Revisit conditions

Measured fanout/latency/throughput exceeds service limits or voice needs distinct infrastructure.
