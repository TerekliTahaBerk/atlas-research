# ADR 0005: Tenant Hierarchy

Status: accepted · 2026-10-21

## Context

Individuals need personal spaces; labs need multiple contexts and confidential projects.

## Decision

Organization → Workspace → Project; private projects by default; composite scope FKs for all grants.

## Alternatives considered

Workspace-only tenancy; org-wide content access; per-user data silos.

## Reasoning

Supports personal organization bootstrap and scoped lab collaboration without changing hierarchy later.

## Consequences

IDs are stable UUIDs; preview sample IDs never become production authorization shortcuts.

## Revisit conditions

An evidenced institutional hierarchy that cannot be expressed through delegated administration.
