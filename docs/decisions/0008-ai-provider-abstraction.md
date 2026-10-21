# ADR 0008: Ai Provider Abstraction

Status: accepted · 2026-10-21

## Context

Models vary in capability, privacy, cost and streaming behavior.

## Decision

Pure provider-neutral interfaces now; server adapters and verified provenance later. No paid Phase 00 calls.

## Alternatives considered

Hardwired SDK/provider; generic autonomous agent framework; fake AI preview.

## Reasoning

Small contracts preserve model choice without a framework or unsupported production claims.

## Consequences

Usage ledgers and citation verification are product responsibilities; failover must not double-spend or widen data scope.

## Revisit conditions

Actual adapter capability mismatch demonstrates missing contract fields.
