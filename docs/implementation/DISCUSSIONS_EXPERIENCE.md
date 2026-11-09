# Discussions experience

10 November 2026 owner-requested increment, based on main `a144f67`. Existing discussions, message IDs/client IDs, artifact edges, recipients and notifications remain authoritative. No DM, realtime service, email delivery or AI-call setting is added or enabled.

## Behavior

A consistent 220 px topic rail, server title search, active/archived views and 30-topic pages surround the selected conversation. The current HTML's Channels markup was read directly: 220 px rail, 48 px header, 32 px message avatars, 13–13.5 px text and compact research cards. Prototype DMs, fake presence/reactions and simulated AI are excluded. In a narrow conversation or with docked AI, the topic rail yields to readable messages; a Topics link restores search/page context. Focusing Reply compacts the same AI island without cancelling its request; the island measures the actual conversation area.

Topic creation retains its original request after acknowledgement loss. Rename uses the current topic revision and is restricted to its creator or project owner/admin; owner/admin can archive/restore. Archived topics retain all messages/links and reject new writes. Viewers read only. Existing author editing and owner/admin moderation stay server-enforced; edited messages are labelled. Concurrent edits retain local text and load the actual latest message for explicit review.

Replies keep text, selected research, mentions and client ID in an account/project/topic-scoped, 24-hour tab draft. Cmd/Ctrl+Enter sends; uncertain submission locks its original payload for retry. The existing message uniqueness and notification event IDs prevent duplicate messages or Inbox notifications. Active project members, including eligible readers, can be mentioned; unrelated/inactive identities cannot be notified. Old notification records are unchanged.

The latest 50 messages open first. Earlier/newer cursor pages have no total-message ceiling and use the database's precise timestamp/UUID order. New arrivals preserve the reader's scroll position and expose a jump/load-more indicator. Prepending history preserves the visible position. Ten-second polling/focus refresh replaces no realtime infrastructure. Per-message cards resolve all visible attachments, independently of the bounded related-research summary. Sources, immutable PDF annotations, documents and tasks retain authorized project/version/location links and existing backlinks.

## Verification and boundary

Final typecheck, lint and production build passed. The focused production Chromium/disposable PostgreSQL journey passed: task-origin topic → source/annotation/document sharing → committed-response-loss retry with one message and one event per recipient → editor reply → Inbox return → exact PDF annotation → rename/own-message edit → Viewer/outsider/wrong-author/invalid-mention denial → 50-message cursor pages, earlier-message conflict recovery, stable history/new-message indicator → archive/write rejection/restore → 31-topic pagination → light/dark desktop and narrow topic/conversation surfaces with AI. Browser exceptions were absent. Fixtures use synthetic users/PDF and local test SMTP; no external email or model call was made. Screenshots remain outside Git.

Migration 012 adds topic revision/archive fields, stored mention IDs and cursor/recent-topic indexes. It does not rewrite message bodies, links, existing timestamps or notifications. Historical messages have no reconstructed mention metadata. Legacy non-paged callers retain their earlier response shape; this UI always requests explicit pages.

Known limits: polling, not presence/read receipts or realtime delivery; a burst is fetched in consecutive 50-message batches. Automatic edit refresh covers recent messages; earlier loaded edits are refreshed when reopened/reloaded, with revision checks on every save. The related-research summary shows at most 100 cards and labels that boundary; message cards are resolved separately. Tab drafts are not an independent backup.

Chrome's saved origin permission blocked the local prototype. Earlier Coolify access was also denied. Browser reference comparison, current-live before/after capture, deployment and observed live SHA remain separate pending items until access is allowed; source inspection/local screenshots do not establish pixel parity or live acceptance. Merge and deployment outcomes are recorded on the PR. Broader beta gates remain open.
