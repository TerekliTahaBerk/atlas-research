# ADR 0006: Roles And Authorization

Status: accepted · 2026-10-21

## Context

Metadata administration must not grant confidential project access.

## Decision

Three membership levels; role matrix in DATABASE; live server capability checks plus non-owner RLS. Workspace-visible grants read only.

## Alternatives considered

Flat global role; implicit org-admin access; ACL per object without project foundation.

## Reasoning

Explicit project grants keep privacy predictable; parent memberships constrain all effective access.

## Consequences

Last-owner/invitation/revocation operations need transactions; RLS policy parity must be tested.

## Revisit conditions

Need for explicit cross-project sharing or institution policy requiring additional reviewed grants.
