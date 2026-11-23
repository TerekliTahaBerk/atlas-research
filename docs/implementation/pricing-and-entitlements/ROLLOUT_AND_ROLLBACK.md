# Commercial rollout and rollback

## Environment

Retain the separate Coolify runtime, authentication, migration, queue and backup roles. Keep these defaults on initial schema rollout:

- `ATLAS_RESOURCE_LIMITS_ENABLED=0` on web and the files worker.
- `ATLAS_FOUNDING_INTAKE_ENABLED=0`.
- `ATLAS_FOUNDING_MAIL_ENABLED=0`.
- `ATLAS_AI_CALLS_ENABLED=false` and no new provider secrets until the configured versioned registry, daily workspace budget and privacy terms are reviewed.
- The sandbox signing secret and test provider switches belong only in disposable test environments. The production route rejects the sandbox.

## Application sequence

1. Take an encrypted backup and rehearse restoration in a disposable environment. Review preserved project, file, evidence and membership counts and validate capacity for existing shared workspaces.
2. Apply the three ordered additive migrations as the migrator. Build the web, mail and file services from the same revision. Observe all service heartbeats and `/health/ready`.
3. Provision the first operator by inserting a previously verified user ID into `ops.billing_operators` under authorized migration credentials. Never grant application access to privileged DB credentials. The next UI mutation requires a fresh application session. Review the app at `/admin/resources`.
4. Enable metering on both web and file worker together in the first restricted environment. Observe quota denials, reservation expiry, AI provider cost, PDF extraction, capped users and support volume before expanding.
5. Open public intake independently. Review applications and issue individual links. Keep live mail and billing off until they have separate authorization and verification.
6. Before enabling real AI, run the scoped provider verification with an approved model, verify actual invoices versus micro-USD, and confirm the USD 180 Founding budget and protection. The production payment/tax adapter, dedicated isolated Python and TeX execution services, and automation engine require their own release approval.

## Recovery

Disable the affected runtime flag. Keep the new schema and usage ledger during application rollback. No rollback should remove approved grants, raw research artifacts or financial receipts. If the old application requires the old exact readiness revision, pause writes, restore the known-good pre-release database and private volume to a new candidate, and plan replay of intervening acknowledged data before switching. Do not reset Prisma or change the readiness revision while mixed-version workers are active.
