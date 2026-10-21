# ADR 0010: Background Jobs

Status: accepted · 2026-10-21

## Context

Parsing, indexing and notification delivery are slow and retryable.

## Decision

Inngest when a real async workflow arrives; transactional outbox and versioned idempotency keys.

## Alternatives considered

Synchronous long requests; untracked fire-and-forget promises; distributed message bus.

## Reasoning

Durable retries and reconciliation fit a modular monolith without premature infrastructure.

## Consequences

No Inngest dependency until needed; jobs must reauthorize and maintain bounded retry/terminal states.

## Revisit conditions

Runtime/service limits or a demonstrated scheduling/throughput gap.
