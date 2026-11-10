# UI audit corrections

10 November 2026 owner-requested fixes for the 20 findings from the live desktop/narrow audit of main `8d9d2b4`. Existing components, tokens and connected workflow are retained. No schema, dependency or infrastructure change is required.

| Finding | Correction |
| --- | --- |
| 1. Working-page menu squeezed titles | Fixed-size reorder/close buttons; remaining width belongs to the truncated, labelled link. |
| 2. Discover result text collapsed | Explicit text/action grid, with actions below the full-width text on small screens. |
| 3. Narrow popovers clipped | Shared popover placement clamps to the viewport on open, resize and scroll. |
| 4. Discover toolbar stacked on desktop | Explicit horizontal form layout and flexible search width. |
| 5. Documents search icon detached | One horizontal bordered search control. |
| 6. Dialog focus started on Close | Initial focus moves to the first editable field; opener focus is restored on close. |
| 7. Empty compact AI composer scrolled | Correct line height, padding and mobile wrapping. |
| 8. Compact AI hid project/scope | Project name and selected research-item count remain visible, with a full scope tooltip. |
| 9. AI could not be dismissed | Labelled Hide AI action, persisted for this account/project/browser tab; Ask Atlas reopens it. |
| 10. Notes plus dock squeezed the PDF | Opening the AI dock closes Reader notes, including delayed AI mount after reload; reopening notes compacts AI. |
| 11. Dock reserved unused bottom space | Docked/hidden presentation removes floating-island bottom padding. |
| 12. Mobile export had no accessible name | Explicit Export Markdown label and tooltip. |
| 13. Settings nested main landmarks | Named settings section inside the shared main. |
| 14. Small targets and faint ellipsis | Larger mobile chrome/editor targets and a visible three-dot icon. |
| 15. Document list showed raw reference markers | Strip internal reference placeholders from the display excerpt only; stored/exported document content is unchanged. |
| 16. Dates and plural grammar varied | Readable month-name dates/minute precision; singular source/collection labels. |
| 17. Long source form hid Save | Scrollable modal body, fixed heading and sticky source-save action. |
| 18. Disabled auth copy contradicted itself | Unavailable title/description, one return link, no new-account footnote on recovery. |
| 19. Menu alignment/destructive hierarchy | Left-aligned menu labels and separated danger actions. |
| 20. Control styling and AI management clutter | Shared field borders/type; conversation management grouped under Conversation options. |

## Verification

The existing production Chromium/disposable PostgreSQL joined journey now also checks 320, 390, 768, 1024 and 1440px widths, Discover readability, working-page overflow, bounded filters, search/task initial focus, source-save visibility, labelled export, empty AI textarea geometry, persistent AI hiding, dock/Reader layout, a single Settings main, dark theme and disabled registration/recovery copy. The first Crossref lookup is real; responsive repeats replay that same response in memory. No provider response is committed.

The joined journey uses synthetic collaborators and the matching public arXiv PDF. It verifies Library → exact PDF note → acknowledged document → assigned task → discussion/reply → Inbox → exact original PDF location, navigation recovery and private search boundaries. It creates one evidence preview and no model run. Screenshots stay outside Git.

Commands: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, then `node --import tsx scripts/test-integration.ts --connected-browser`. Browser plugin is unavailable; the repository's Playwright Chromium harness is used. This is Chromium coverage, not Safari/Firefox or full beta acceptance. Existing email, backup and real-model beta gates remain open. Live release SHA/readiness and post-deploy screenshots are recorded separately in the delivery conversation.
