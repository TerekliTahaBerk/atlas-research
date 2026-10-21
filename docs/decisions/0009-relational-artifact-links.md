# ADR 0009: Relational Artifact Links

Status: accepted · 2026-10-21

## Context

Research knowledge connects sources, notes, work and discussion.

## Decision

Project-scoped Artifact registry and typed relational edge table introduced with first real linking feature.

## Alternatives considered

Separate graph database; arbitrary polymorphic IDs; JSON edges in every entity.

## Reasoning

Composite FKs and allowed-kind service validation prevent dangling/cross-tenant links while keeping SQL queries simple.

## Consequences

Tombstones/version retention are needed for provenance; cross-project links deferred until explicit sharing.

## Revisit conditions

Measured graph traversal requirements cannot be met efficiently with SQL/indexes.
