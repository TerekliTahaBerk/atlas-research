# Product experience refinement

Observed against the owner's current HTML (`fb98b5ca…`) and live `33169e1`, 9 November 2026. Historical phase checks are not product-quality acceptance. Controlled public-paper data only; screenshots stay outside the repository.

| Screen/job | Expected | Observed / visual gap | Correction |
| --- | --- | --- | --- |
| Home / resume | Real work and counts, resume writing/reading | One source card; no recent writing/tasks; project preview only description | Authorized project summaries and real recent artifacts; PDF resumes saved position |
| Project / navigation | Search projects; reopen and close working tabs | Picker lacks search; top links are breadcrumbs; shell reload flashes Atlas/empty project | Searchable project picker, account-scoped working tabs and retained project context |
| Research / Library | Save, inspect, sort, combine filters and act on selection | Readable provider search exists; no sort/selection/bulk tools; metadata-only status implicit | Stable server sort, selected-source export and atomic collection assignment; explicit PDF state |
| PDF / notes | Paper first, compact annotation actions and return | Six repeated buttons per note; version/download options hard to discover | Group secondary actions, readable version labels and notes panel behavior; keep exact locators |
| Writer | Quiet page, quick formatting, understandable equations | Permanent two-row word toolbar, archive/checkpoint beside citation; no equation preview | Compact formatting and selection controls, block menu, live math preview; move maintenance actions |
| Tasks | Quick title/assignment/priority/date edits | Card only changes status; full page needed for every other field | Reuse task fields in quick-edit dialog; persist with revision conflict protection |
| Discussions | Searchable topic context, recoverable composer | Detached list; connected cards work but dominate messages; draft lost on navigation | Topic rail/search, compact linked artifacts and account-scoped unsent draft recovery |
| Inbox | Clear expectation and direct return | Empty state useful; read items need All; row copy is event-oriented | Clear action labels, unread count/read controls and preserve revoked-target redaction |
| AI | One private surface; one disabled state | Repeated limits/disclosures, raw hashes under evidence, consent form while calls disabled | Usage/provenance secondary; preview remains real, sending stays closed; no paid calls |
| Settings | Reachable account/session controls | Live Sessions shows unavailable | Diagnose and repair the actual session endpoint; retain account/security boundaries |

Verification follows one combined discovery → PDF/note → cited/math document → task → discussion → Inbox → export journey, focused changed-access checks, and reference/render comparison at matching desktop/narrow sizes. Delivery evidence is added only after observation.

## Observed verification

- The production Chromium journey completed against disposable PostgreSQL and controlled accounts: real Crossref DOI lookup/save; sorting and three-source collection assignment; selected BibTeX; repeated bulk assignment without another revision; mixed-ID and viewer denial; PDF page note/highlight; new and existing document citation; inline/block math; save failure/retry and two-tab recovery; quick priority/date edits; restored unsent reply; recipient Inbox and exact PDF locator; reload/sign-in and Markdown export. No model call was made.
- Typecheck, lint and production build passed. The final sheet-width adjustment uses the same CSS layout and is checked again live. No schema, infrastructure or volume change is required.
- Reference and application were inspected at **1440×1000** and **390×900**, using the current HTML's unchanged style/logic and a local bootstrap. The prototype's 420 ms loading overlay was allowed to finish before capture. Browser plugin was unavailable; the repository's Playwright production harness supplied local verification, and Chrome supplies the live check. Fifteen controlled application captures and the before/reference images remain outside the repository.
- Visual ledger: the 240 px warm sidebar, 48 px chrome, white canvas/blue accent, sans typography and 740 px writing column are retained. Working tabs replace breadcrumbs; compact insertion/selection controls replace the two-row toolbar; mobile controls no longer overlap; three-column source selection no longer displaces reading status; annotation actions and linked-message cards are compact; AI uses a single rail/sheet with secondary usage/provenance. Main copy is task-oriented. New labels describe actual selection, navigation, citation and recovery actions.

Intentional differences: real data and counts replace prototype fixtures; future modules, simulated co-editing and fake AI output are absent. Writing keeps accessible formatting controls; narrow layouts prioritize reading space. AI answers stay disabled; preview is excerpt retrieval only. Email and S3 remain off. Real-model evaluation, independent recovery and the existing pre-beta operational/accessibility reviews are not closed by this product check. Home activity summaries are bounded to 50 projects; existing per-project list limits remain.
