# Storage and indexing

Activate metering with `ATLAS_RESOURCE_LIMITS_ENABLED=1` on the web and files services together after the billing and resource migrations. The flag retains the original 25 MiB per PDF, 250 MiB per project behavior while commercial metering is off. Metered limits use the workspace’s resolved plan in decimal bytes. The existing private volume and authenticated range proxy remain the storage backend.

## Uploaded PDFs

The authenticated upload checks the current project, exact source, role, file length, month, workspace capacity and filesystem space. A database intent holds bytes and one upload slot before the request body is read. The hold expires after an hour. The one-workspace transaction lock serializes capacity decisions across projects. A successful validated upload verifies PDF markers and hashes the content, links a private immutable object and commits its metadata and version in the same database transaction. The commit rechecks the latest plan and hold. Matching content for the same source reuses the stored version, while replaying a completed upload ID returns its prior result.

The storage meter counts live FileObject lengths, including files in archived projects. Monthly uploads count original committed FileObject receipts in the workspace’s current quota period, including removed files. This prevents repeated deletion from increasing upload allowances. Failed uploads release the hold and remove staging data. A linked final file may remain when the database commit outcome is uncertain. The files worker checks the database for a live reference or hold before removing a final object aged at least 24 hours.

Project owners and admins can remove a version’s PDF explicitly. The transaction tombstones the file and removes its searchable index without dropping version, source, notes, historical citation text or source locator rows. The authenticated range endpoint returns unavailable for that file, and the private worker collects disk bytes asynchronously. Archived projects remain readable within the existing access policy and release active project slots while retaining stored files.

## Text index

A newly stored PDF can be read immediately. An editor explicitly chooses **Index text** on a PDF version to run Poppler in the existing rootless files service. The request checks remaining workspace index capacity and reserves at most 5 MiB less the version’s currently indexed text. The reservation expires after 20 minutes. A short queue lease, bounded retry and attempt fencing prevent stale workers from publishing over later work. The worker rechecks current access, project/source state, file hash, lease and capacity before parsing and before commit. The current parser supports up to 500 pages and up to 2 MiB of extracted stdout.

Index consumption is the UTF-8 byte count of persisted searchable chunks, including deliberate chunk overlap. The parser records the exact total on the immutable version in the same transaction as index publication. Rebuild replaces older searchable chunks atomically. Removing an index zeros its searchable usage and preserves immutable page snapshots required by prior citation anchors. Archived sources do not enter new AI retrieval. Explicit removal revokes fresh retrieval and leaves historical citation context readable under its original access rules. Current upload and indexing are separate paths and neither uses paid AI credits.

Workspace usage uses a bounded aggregate over file/hold metadata and version byte totals. Migration 102 backfills index totals without deleting text or altering the research database identity model. Verify production capacity and cleanup times against realistic dataset sizes before opening the pilot.
