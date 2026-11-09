# Library experience

Owner-requested Library-only increment, 9 November 2026. The current supplied Atlas.dc.html (`fb98b5ca…`) is the reference; prior phase reports are historical evidence. Existing Reader, writing, collaboration and AI implementations remain the integration targets.

## Delivered behavior

- One project Library with **My Library / Discover** views, a 196 px collection/reading rail, a single search/action row, compact source rows and an optional 368 px details panel. The project scope is explicit, including narrow screens. The old project `/discover` and `/sources/:id` URLs redirect while preserving query context.
- Combined title/author/DOI/venue/tag search and collection, tag, personal reading, PDF availability and publication-year filters. Individually removable chips; added/edited/title/year sorting; 30 rows per page with an actual total. Selected-source actions explicitly cover the current page. Full active-library export has no silent 2,000-source truncation.
- Collections can be created, renamed, assigned/unassigned and removed without deleting their sources. Counts exclude archived sources. Tags normalize Unicode, whitespace, case and leading `#`; shared tags/collections require editor access. Owner/admin archive is reversible through Archived.
- Atomic bulk collection/tag/reading/archive/restore actions validate every source and collection in the same project. Failed operations keep the selection/input. Idempotent collection assignment does not advance metadata revisions; changes do, and metadata forms retain their opening revision to reject stale edits. Viewer bulk reading updates only that actor's status and preserves the PDF locator.
- Add source supports Discover, DOI lookup, article links/manual bibliography and private PDF upload. Duplicate DOI/link records open the existing source; attaching a chosen PDF to it requires an explicit action. Stored metadata remains reachable if upload fails. Immutable PDF versions and processing/retry behavior use the existing private volume.
- Discover uses real Crossref metadata, with details/abstract when supplied, saved-state links and pagination. No synthetic analysis. Its existing 51-page browsing policy is now explicit at the boundary instead of silently repeating the last page; refine the query to continue. Saved-source Library pagination is independent of this provider boundary.
- Details include metadata editing, collections/tags, personal reading status, original links, reference copy/export, exact PDF versions/jobs/retry, anchored annotation links and existing linked research actions. Library filters and scroll are account/project scoped; exact Reader links carry the return context.

## Scope and data safety

No account, source, PDF, annotation, document, collection membership or reading-state reset. Schema 008 adds only the runtime permission/RLS policy for authorized collection removal and advances the readiness revision. Removal unlinks collection memberships in the same transaction before removing the collection; source/PDF/citation records remain. Runtime/migrator separation and current session/project checks remain in force. Archived sources cannot receive metadata edits or new PDF uploads until restored.

No provider key, deployment volume, server setting, email/S3 setting or AI-call gate changes. Paid AI calls remain prohibited. Existing pre-beta operational, real-email, independent-recovery and real-model gates are outside this increment.

## Verification

The focused production-browser harness is `node --import tsx scripts/test-integration.ts --library-browser`. It creates disposable PostgreSQL and controlled accounts, exercises the Library journey and changed access/write boundaries, and keeps PDFs/screenshots outside the repository. Reference and application are inspected at 1440×1000 and 390×900, including dark details. Browser plugin is unavailable; local Playwright supplies fixture verification and Chrome supplies live verification.

Typecheck, lint and production build passed. The focused journey passed against the production build: real Crossref DOI save and duplicate UI, normalized tags and collections, combined filters/sort, private PDF/exact-version/return, bulk retry and selection retention, real BibTeX/RIS downloads, mixed-ID atomic rejection, idempotent revision behavior, viewer own-state and shared-write denial, collection rename conflict/removal preservation, archive/restore, 33 sources across two pages, preserved scroll and reload, desktop/dark/narrow surfaces. A final keyboard guard keeps Escape scoped to an open action menu before closing details; it is checked during the live review.

Deployment commit and observed live results are recorded in the Library PR after verification. Local checks do not establish deferred live phase gates.
