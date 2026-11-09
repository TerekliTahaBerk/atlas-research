# Design reference

Phase 02 update: the owner supplied `Handoff specification (2).zip` on 9 November 2026. Its Atlas.dc.html is 447,208 bytes, SHA-256 `fb98b5ca09dc1bf7fdb49aec20ad47ba2c49f0ca0ac61a7cd4822a30b90db53d`; Atlas Handoff.md is 8,732 bytes, SHA-256 `463968b03fd6cc8de053bb1b6484d7982c76197e66d855c708524bfe6d821e57`. The supplied HTML is the current visual reference for Phase 02. The older prose handoff still conflicts with its blue/sans tokens; actual HTML wins. Unrelated uploads in the ZIP are not product requirements and are not imported. The ZIP/raw assets remain local reference material, not newly authorized public repository assets.

## Current authoritative reference

The user selected the current Atlas design. The following live prototype was observed in the user's open browser on 9 November 2026:

https://claude.ai/design/p/c0ecedb8-87e2-4ad5-b313-63d75aef1817?file=Atlas.dc.html

File named by the design project: Atlas.dc.html.
Companion handoff named in its conversation: Atlas Handoff.md.

Phase 00 inspected this URL and downloaded both files on 9 November 2026. The user explicitly authorized publishing them. A privacy-sanitized HTML snapshot and the unmodified handoff are frozen under [reference/](reference/README.md), with original and published SHA-256 records. Personal names/emails were replaced in the HTML; CSS and behavior were preserved. The live URL remains mutable and may require the user's account. Older local files were not treated as the current revision.

## Observed direction

- Light theme by default, warm off-white sidebar, white main canvas, subtle dividing lines and blue accent.
- System sans-serif typography; compact, quiet academic workspace. No old neon-green or serif direction.
- Collapsible project navigation, Home/Inbox, project sections, Notes, Sources and Chats.
- Shared top tabs and consistent workspace context.
- Contextual AI chat on the right with a clear source/project scope; narrow layouts must not squeeze the reading area.
- Both light/dark themes and responsive interaction are part of the design target.
- The prototype also shows manuscripts, experiments, semantic maps and a graph. These are future scope, not automatic beta requirements.

## Phase 00 work

The completed source audit is in [REFERENCE_AUDIT](REFERENCE_AUDIT.md); measured values and planned corrections are in [DESIGN_SYSTEM](DESIGN_SYSTEM.md). The handoff predates the current HTML and is not authoritative where they conflict.

Test the combined sidebar/content/AI-panel widths, focus/keyboard behavior, scroll containers, empty/loading/error states and context switching. Preserve the reference's character while documenting any necessary usability correction.

The paragraph above records Phase 00. Phase 02 now implements the Research/Library/Reader subset; its reference adaptations and verification are recorded in [P02](../implementation/P02.md). Source measurements are distinguished from browser observations and planned corrections; full accessibility and per-screen responsive testing remain future acceptance work.
