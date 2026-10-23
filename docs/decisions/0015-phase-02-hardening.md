# ADR 0015: Migration metadata and isolated scanner hardening

Status: accepted for local implementation; hosted activation requires approval.

## Context

The Atlas development audit found Prisma history reachable by browser roles through the Data API. Supabase defaults granted future `postgres` tables browser privileges. Scanner completion did not identify a claim attempt, and a Storage copy could survive a failed database completion without a cleanup record. A production scanner had not been selected or deployed.

## Decision

Revoke browser/PUBLIC history privileges and enable RLS without FORCE or policies, preserving privileged Prisma execution. Revoke browser/PUBLIC defaults only for future public tables/sequences created by the actual migration role; preserve managed schemas/roles and existing Phase 01 controls. Verify effective table/column privileges and actual Data API status, not just RLS flags.

Fence scanner messages to exact attempts, unexpired leases and fresh uploader capability checks. Hold the established hierarchy lock in shared mode and a short scanner transition lock in a consistent order; run Storage work outside database transactions. Reserve every unpredictable accepted-object key durably before copying; remove the winning reservation atomically with READY, and retry aged inactive unreferenced copies through Storage before acknowledging cleanup.

Provide a deployable development integration with three isolated roles: an HMAC-only broker, secret-free offline ClamAV/qpdf validator, and a signature updater with Internet access. No worker receives database or Storage service credentials. Parsing has resource/time/page limits and fails closed. Validate actual engine behavior independently of protocol fixtures. The web server retains Storage signing/copying and must be deployed with the matching attempt-aware protocol.

## Consequences

Existing scanner clients need the claim `attempt` in completions. Migration and server activation must be coordinated; old unfenced functions are removed. Definition freshness, image pinning, resource capacity, failed jobs and cleanup backlog need operational monitoring. Hosted activation requires a verified recovery snapshot and restore drill, an approved live origin/host and explicit authorization. There is no automatic production deployment, paid upgrade or Phase 03 scope.

## Revisit

Measure scanner transition-lock contention and cleanup queue size before scaling; add targeted indexes if needed. Review a per-job sandbox platform if the deployment threat model requires stronger parser/process isolation. Define quarantine retention separately. Do not use worker completion as evidence of copyright permission or scientific validity.
