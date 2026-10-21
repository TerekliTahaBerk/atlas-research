# Phase 05 — Communication hub

Status: planned; not implemented

## 1. Objective

Deliver communication hub as the phase outcome. Project channels, durable messages/threads, mentions, reactions, notifications, research sharing and explicitly invoked contextual Atlas AI.

## 2. Dependencies

Phase 01 policies; Phase 02/04 artifact sharing; Phase 03 needed only for contextual @Atlas AI; Atlas private Realtime available.

## 3. Exact scope

Project channels, durable messages/threads, mentions, reactions, notifications, research sharing and explicitly invoked contextual Atlas AI.

## 4. Out of scope

Voice/video rooms, federation, arbitrary bot execution, unbounded message search or advanced collaborative editing.

## 5. Detailed implementation tasks

1. Implement project channels with optional restricted membership, consistent grants and archived-channel states.
2. Persist messages/client idempotency keys/thread roots and outbox in one transaction; handle edits/tombstones with versioned payloads.
3. Broadcast through private Supabase topics after commit; dedup by message/version; backfill with authorized cursor after reconnect.
4. Add server-parsed mentions/reactions and recipient-scoped notification fanout with dedup keys and read state.
5. Share artifact references only when sender and recipient can access target; rendered cards reauthorize without leaking titles/snippets.
6. Implement @Atlas AI as explicit authorized request using channel/conversation/source intersection, quota checks and verified citations; membership revoke removes delivery eligibility.

## 6. Proposed files and directories

features/{communication,notifications}/server; components/channel; app/api/v1/{channels,messages,notifications}; packages/database policies and outbox migrations.

## 7. Data model changes

Channel, ChannelMembership, Message, MessageThread, Reaction, Mention, Notification, outbox. Unique client message key and recipient/event delivery keys; thread/channel FKs.

## 8. Required APIs

Channel CRUD/member grants; send/edit/delete/backfill messages; threads/reactions; inbox/read; private Realtime subscribe; contextual AI run reference.

## 9. UI states and workflows

No channels/messages, optimistic send/pending/failed/retry, offline/reconnecting/backfill, restricted/archived channel, revoked shared artifact, unread/mentions, AI consent/generating/error.

## 10. Security requirements

Server message auth plus topic RLS, recipient ACLs, XSS/URL-safe rendering, spam/rate limits, reconnect revoke tests, no hidden private artifact data in broadcasts.

## 11. Testing requirements

Persist-before-broadcast integration; duplicate sends/events; cursor ordering; thread scope checks; disconnect/reconnect/revoke; recipient notifications and contextual AI scope intersection tests.

## 12. Acceptance criteria

- [ ] A committed message survives disconnect and appears once after replay/backfill.
- [ ] Unauthorized subscriptions and revoked memberships receive no private messages.
- [ ] Threads cannot reference another channel.
- [ ] Notifications and shared previews do not reveal inaccessible research.
- [ ] Contextual AI uses only explicitly authorized channel/source scope.

## 13. Definition of Done

Each acceptance criterion has recorded evidence; applicable unit/integration/E2E and quality checks pass; migration SQL is reviewed against an identified environment; docs/API/security/ADRs reflect behavior; no unresolved critical defects; actual NOT RUN checks and external blockers are explicit. No later-phase behavior is implied by completion.

## 14. Dependencies on later phases

Phase 06 validates multi-user journeys; Phase 07 voice requires separate transport/privacy architecture, not reuse of durable message assumptions.

## 15. Risks and mitigation

Realtime ordering/delivery are not guaranteed; DB cursor and idempotency recover consistency. Fanout abuse needs rate limits and bounded batch jobs.

## 16. Suggested issue breakdown for coding agents

- P05-01: Implement project channels with optional restricted membership, consistent grants and archived-channel states. Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Establish contracts before dependent UI work.
- P05-02: Persist messages/client idempotency keys/thread roots and outbox in one transaction Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
- P05-03: Broadcast through private Supabase topics after commit Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
- P05-04: Add server-parsed mentions/reactions and recipient-scoped notification fanout with dedup keys and read state. Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
- P05-05: Share artifact references only when sender and recipient can access target Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
- P05-06: Implement @Atlas AI as explicit authorized request using channel/conversation/source intersection, quota checks and verified citations Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
