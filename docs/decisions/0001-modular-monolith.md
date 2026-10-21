# ADR 0001: Modular Monolith

Status: accepted · 2026-10-21

## Context

Research domains share transactions and tenant guards; the team must move quickly.

## Decision

Use one Next.js deployment and domain-oriented server modules, with four shared packages.

## Alternatives considered

Microservices; serverless function per domain; single unstructured app.

## Reasoning

Local transactions and one policy model reduce operational and consistency costs.

## Consequences

Boundaries are code conventions and import discipline; workers can run separately without making services independent.

## Revisit conditions

Measured load or team ownership demands independent release/scaling.
