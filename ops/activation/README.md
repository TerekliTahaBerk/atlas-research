# Approved Atlas development execution

These are evidence-specific operator scripts for the owner-approved
`hgngonpirctrwbckhbmy` development target and protected Vercel `web` branch
`test/a01-hosted-activation-execution`. They are not an unattended provisioning
API and never load another product's configuration. See the
[execution record](../../docs/operations/A01_HOSTED_EXECUTION_2026-11-02.md).

Private inputs and receipts live outside Git under the approved FileVault
recovery directory, with owner-only permissions. Never print those files or
pass their values as command-line arguments. The stored runtime configuration
uses narrow, separate web/worker roles. The recovery owner's libpq service is
used only by reviewed operator verification/fixture cleanup, never by deployed
web, brokers or parsers.

- `credential-intake.mjs` is a bounded, nonce/Host/Origin-protected loopback
  intake, closed after setup. It validates only this project's private buckets.
- `hosted-smoke.mjs` establishes normal synthetic provider sessions in memory
  and bounds fixture accounts to eight. Research, interchange, permissions and
  Zotero scripts record redacted result summaries. The completed run cannot be
  reused or silently recreated. Zotero fixture testing requires a separate
  development-only loopback app/provider; it is not live Zotero verification.
- `cleanup-fixtures.py` rehearses and rolls back by default; `--execute` commits
  only the marker/ownership-checked disposable graph. Its administrator-only
  transaction-local replication mode permits removal of immutable synthetic
  snapshots; protected row hashes and all public foreign keys must pass before
  commit. `cleanup-fixtures.mjs` coordinates normal session revocation, exact
  fixture Storage objects, public cleanup and marker-checked Auth deletion.
- `final-verification.mjs` is read-only: exact migration hashes, history/RLS/
  privilege checks, fixture absence, retained original counts and anonymous
  Data API denial. It records client TLS separately from the pooler's backend.
- `refresh-vercel-access.py` obtains only the normal short-lived identity for
  the exact existing Vercel project/team. No long-lived protection bypass is
  created; the broker sends this identity only to the approved HTTPS origin.
- `local-monitor.py` checks the real broker heartbeat, signatures, process and
  network/secret isolation. `--run` starts the existing Colima/Compose stack,
  refreshes identity hourly and writes local health every minute. It does not
  send alerts, index AI evidence or process paid model requests.

The installed user launchd service is
`com.atlasresearch.development-workers`. Its plist is in the user's
`~/Library/LaunchAgents`; redacted health/logs are in the protected activation
directory. Mac shutdown, sleep, logout, expired CLI authorization and network
outages remain service limitations. Docker restart policies do not turn this
Mac into an always-on cloud host. Stop/restart must target this service and
`atlas-hosted-development` only; never use global process/container cleanup.

The AI indexing broker profile remains disabled because its existing claim
path includes the separately unapproved embedding/provider gate. The isolated
Poppler parser is running and was tested with the accepted hosted synthetic
PDF. No hosted fixture transport or invented vectors substitute for AI review.
