# Phase 00.5B accessibility audit

Target: applicable WCAG 2.2 AA behavior in the synthetic UI preview. **PASS for the automated/keyboard scope below; NOT RUN for full manual accessibility conformance.** Browser: Playwright Chromium on macOS. Axe is evidence for detectable rules, not certification.

## Findings and fixes

| Issue                               | Severity | Before / impact                                                                                                         | Repair                                                                                                                                        | Evidence                                                                                           |
| ----------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| B01 competing modal focus           | P0       | Cmd/Ctrl+J can focus an AI modal hidden behind version history                                                          | Foreground dialog/menu owns shortcuts; search replaces AI Focus                                                                               | Foreground-dialog regression checks visible dialog, absence of second AI dialog and active element |
| B02 focus restoration               | P1       | Controlled history dialog has no registered Radix Trigger; composer cleanup can clear the newly mounted input reference | Shared modal remembers invoker; AI restores visible composer; cleanup unregisters only owning input                                           | Exact `toBeFocused` assertions after Escape                                                        |
| B03 offscreen document picker       | P1       | Phone picker beyond right edge; keyboard-selected option lacks an editor active-descendant connection                   | Body portal, collision bounds, above/below placement, scroll/resize updates, editor `aria-controls`/`aria-activedescendant`, option scrolling | 390px bounds, ArrowDown, Enter citation, slash Heading                                             |
| B05 narrow source editor            | P1       | ~197px source region with dock; difficult editing and resizing                                                          | 320px source minimum; canvas-aware tree/split fallback                                                                                        | Four docked widths, actual typing, ArrowRight resizer                                              |
| B06 inaccessible phone reader notes | P1       | Notes button has no rendered target on narrow screens                                                                   | Named/described Radix dialog, close button, focus trap/restore, bounded selection toolbar                                                     | 390px Notes→Outline→Escape plus axe                                                                |
| B07 clipped graph inspector         | P1       | Phone inspector's final actions cannot be reached by scrolling                                                          | Scroll owner on stacked region                                                                                                                | Scroll-to-action and keyboard activation                                                           |
| B08 graph text fading               | P1       | Group opacity dims labels/filters in addition to decorative edges                                                       | Keep text opaque; use border/weight and pressed state for emphasis                                                                            | Both-theme graph scans and visual review; semantic node list retained                              |

## Automated results

- **PASS**: existing axe route matrix, 17 routes × dark/light, tags `wcag2a`, `wcag2aa`, `wcag21aa`, no reported violations on the final run.
- **PASS**: new Share, command search and AI Focus scans in dark/light include `wcag22aa`.
- **PASS**: new mobile Reader notes dialog scan includes `wcag22aa`.
- **PASS**: native editor labels, dialog names/descriptions, landmark/headings and focus-visible tests included in the full browser suite.
- **PASS**: reduced-motion sample output is immediate; screenshot/axe scans stabilize transitions. Ordinary-motion geometry tests retain animation coverage by waiting for settled dimensions.

An initial scan caught a tooltip during its exit animation (transient opacity caused 1.22:1 computed contrast). The deterministic mobile audit now uses the same reduced-motion policy as the route/overlay matrix. The actual stable tooltip tokens did not require a palette change. No axe rule or element was excluded.

## Contrast and design tokens

The existing token audit checks the stylesheet against its documented table and calculates contrast pairs. White filled-button text uses `--acb` (`#2b7d46` dark / `#2d7f48` light), rather than the handoff accent that yielded roughly 3.5:1. Foreground/hover/meta/AI-input, danger/warning, green text and PDF ink pairs retain their AA adjustments. **PASS** for all audited pairs in the final unit suite. The handoff accent remains a non-text accent; focus indicators use its 3:1 audit. Do not revert accessible token adjustments to gain a closer pixel match.

A token check cannot prove every composited color pair. B08 illustrates why opacity and whole rendered states also need inspection. Graph edges are decorative; node buttons expose label, kind, link count and selected state, with a linked-items inspector as the meaningful accessible representation.

## Keyboard and focus review

**PASS** for tested paths: Tab/Shift+Tab trapping in drawer/dialog primitives; Escape and invoker restoration; Cmd/Ctrl+J/K; mention/slash arrows and Enter; selected-option scrolling; code-editor focus; keyboard splitter; local suggestion acceptance/discard; task Status menu as the keyboard equivalent to dragging. Text inputs/contenteditable regions keep ordinary question-mark entry. Status text supplements color. Local-only disclosures remain available as text.

New portal menu listeners, ResizeObserver and keyboard handlers all clean up. Same-origin framing remains restricted to the QA mobile view; no new framing permissions were added.

## Not tested / release limits

**NOT RUN**: manual VoiceOver/NVDA narration/reading order, speech control, switch input, 200% text-only zoom, OS high contrast/forced colors, physical touchscreen/virtual keyboard and IME combinations, Firefox/WebKit accessibility trees, exhaustive target-size and focus-not-obscured measurements for every control/state. Small desktop controls follow the compact design; WCAG 2.2 target-size exceptions/spacing still require a full manual review before a conformance claim.

The result supports this preview's code review. It does not certify WCAG 2.2 AA or replace the assistive-technology gate before an external pilot.
