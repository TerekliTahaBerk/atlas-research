# PDF Reader experience

Owner-requested Reader-only increment, 9 November 2026. Built on the completed Library release `02590d2f`. The current supplied Atlas.dc.html (SHA-256 `fb98b5ca09dc1bf7fdb49aec20ad47ba2c49f0ca0ac61a7cd4822a30b90db53d`) is the design reference. Previous delivery reports were not substituted for current PDF testing.

## Delivered behavior

- One compact Reader control row under the existing workspace tabs; neutral page surround, white PDF, 24 px page gaps and an optional 320 px Notes / Outline / Source panel. Long titles remain in workspace tabs. Narrow screens use a focus-managed notes dialog. Dark mode changes the interface without inverting the PDF.
- Continuous PDF.js viewing mounts visible pages and adjacent pages only. Canvas density is capped at 2×, with a 16 million pixel budget per canvas. Physical page input submits on Enter; previous/next, visible-page tracking, manual zoom, fit width/page, PDF bookmarks and distinct printed page labels are functional. Zoom and panel changes preserve the page-relative anchor.
- Full-document literal, case-insensitive text search has counts, previous/next, current-match scrolling and temporary marks. It does not create annotations. The PDF.js text layer uses the canvas viewport; real multi-span academic text selection is verified.
- A viewport-clamped selection toolbar copies text, saves normalized highlights, opens a comment/color form, or connects evidence to existing document/task flows. The selection snapshot survives dialogs and failed requests. Client-generated annotation request IDs make retries after an uncertain response idempotent. Clipboard denial leaves a native-copy fallback.
- Notes retain immutable source/version/page/quote/geometry/author, separate quotation from commentary, support colors, revision-aware editing, soft deletion and Undo, page notes without text, simple query/page filtering, folded long quotes and bidirectional highlight navigation. Author display uses existing project membership data.
- Existing document insertion can include the selected quotation as safe editor JSON plus its citation. Existing document revisions, task/discussion artifact links and project authorization remain the implementation. Citations return to the exact immutable version, physical page and highlight.
- Reading position is actor- and version-specific, saved after an 800 ms debounce with serialized writes, visible retry and navigation/visibility flush. Returning to Library preserves its query context. Transient source-refresh failures preserve the last authorized Reader; access/session denial clears private content. PDF viewing and page notes remain independent of text extraction/AI preparation. Original download explicitly excludes Atlas annotations.

## Data and scope

Schema `202611090009_reader_experience` adds `reading_positions` with a version/user primary key, composite source/version foreign key, immutable scope trigger and forced actor/project RLS. Runtime has SELECT/INSERT/UPDATE, backup has SELECT; migration authority remains separate. Existing `reading_states` rows remain the fallback until a version is first saved. No backfill resets positions. The existing page constraints increase from 500 to 100,000 so viewing is not coupled to the extraction limit.

Existing PDFs, file hashes/versions, annotations, citations, Library collections and unrelated research remain intact. No replacement file store, annotation export engine, Writer redesign or AI engine change. Email, S3 and paid model calls stay disabled; no key, volume, server or other application setting changes are required. Deployment only advances the existing Atlas commit/release marker and applies the additive migration.

## Design comparison

Reference and application were inspected at 1440×1000 and 390×900, with desktop light/dark and narrow notes. Before/after and controlled fixture screenshots are saved outside the repository. This is a faithful product layout comparison, not a pixel-parity claim against the reference's simulated paper.

The deliberate differences are the 42 px Reader controls below the workspace's existing 48 px tabs (keeps long/open research tabs from squeezing controls), continuous real PDF pages instead of the simulated single paper, and Source provenance in the third panel tab. Existing AI remains a separate mutually exclusive workspace surface, subject to its unchanged call gate. The prototype's mobile overflow is corrected rather than reproduced.

## Verification and remaining boundaries

Typecheck, lint and production build passed on the final product code. `node --import tsx scripts/test-integration.ts --reader-browser` uses disposable PostgreSQL 18.6 and separate controlled accounts against the production build. The Browser plugin is unavailable; local Playwright supplies fixture verification and Chrome supplies live verification. No paid AI calls or real invitations are used.

The focused journey passed with Head et al. (2015), *The Extent and Consequences of P-Hacking in Science*, DOI `10.1371/journal.pbio.1002106` (PLOS Biology, CC BY): Library → pages/zoom/fit → search → multi-span copy and selected highlight/comment → network-response-loss retry without duplicate → edit/color/page note → quotation in an existing document → exact citation return → linked task → old PDF version → independent positions → reload/relogin. A controlled synthetic graphics-only PDF verifies no-text page notes, Roman printed labels and bookmarks. Viewer shared-annotation writes, anonymous and foreign-project private-file access are denied. Bounded canvases, normalized highlight geometry, desktop/dark/narrow layout and Library return context are checked.

Live deployment SHA, readiness revision and controlled live outcomes are recorded in the Reader PR after observation; local results do not establish unrelated live phase gates.

Remaining limits: selections create one page anchor at a time (native cross-page copying remains available); image-only PDFs need page notes because OCR is outside scope; search is literal rather than linguistic; abrupt browser/process termination before a save can lose the most recent debounced movement. Original PDF downloads do not embed Atlas annotations. Broader touch-device/browser, load, independent recovery, real-email and real-model acceptance remain on the existing beta list.
