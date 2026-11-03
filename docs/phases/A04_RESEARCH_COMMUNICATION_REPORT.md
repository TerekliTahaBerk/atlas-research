# A04 — Research communication, collaboration and notifications

Roadmap mapping: [Phase 05 — Communication hub](PHASE_05.md) (historical specification). Date: 3 November 2026. Base: `master` `be788eb` (PR #22 merged; master CI run [41599480389](https://github.com/TerekliTahaBerk/atlas-research/actions/runs/41599480389) green).

**Verdict: A04 CODE COMPLETE in disposable environments. NOT HOSTED VERIFIED** — the additive migration has not been applied to the Atlas development Supabase project; that requires the approval packet in §13. No production readiness is claimed. A01–A03 execution receipts are unchanged.

## 1. Scope and architecture

Modular monolith unchanged: Next.js route → `features/communication/server` services → `atlas_private.mutate` SQL boundary → PostgreSQL/RLS. PostgreSQL is the only source of truth; Supabase Realtime is a best-effort hint channel. No new service, WebSocket cluster, Redis, queue, paid provider or worker was introduced. Delivery uses the existing Supabase Realtime product (DB-native `realtime.send` to private topics) dispatched by the web tier after each commit.

New code: `packages/core/src/communication.ts` (contracts, safe body parser), `apps/web/src/features/communication/{server/*, live-channels, composer, message-item, message-body, channel-dialogs, atlas-panel, live-inbox, realtime, timeline, client}`. The Phase 00.5 synthetic `channels-screen.tsx` preview is untouched and still served only in preview mode; live mode routes `/app/projects/:id/channels` and `/app/inbox` to the real implementation.

## 2. User journey audit

| Journey                                                                                                                                                             | Evidence                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| A normal collaboration (create, join, send, receive live, thread reply, reaction, mention, notification, reload persistence)                                        | `tests/integration/communication.test.ts` "Journey A"; `tests/auth/e2e/communication.spec.ts` steps 1–8 in two real browser sessions        |
| B offline recovery (lost ack, same-key retry incl. concurrent, reconnect backfill, exactly-once, order)                                                             | Integration "Journey B" (120-message paging and change backfill); `tests/realtime/realtime.test.ts` disconnect/reconnect over real Realtime |
| C restricted channel (grant, private subscribe, revoke, retained socket silence, fresh-request denial, remaining members still receive)                             | Integration "Journey C" (topic policy as the `authenticated` role, outbox contents); realtime test over real WebSockets; browser step 12    |
| D research sharing (paper, note, cited passage; navigation; source-version/page identity; revoke/archive safe rendering)                                            | Integration "Journey D"; browser step 6                                                                                                     |
| E contextual Atlas (exact authorized context, cross-thread isolation, cross-project injection denial, paid provider disabled, persisted prompt excludes discussion) | Integration "Journey E"; browser step 11 with the deterministic loopback fixture                                                            |

## 3. New schema

Migration `20261103090000_research_communication` (additive; no earlier object altered except wrapping `atlas_private.mutate` → `mutate_a03`, the established pattern). Tables: `channels`, `channel_members`, `channel_messages`, `message_mentions`, `message_reactions`, `message_references`, `notifications`, `communication_outbox`; schema `atlas_realtime`; triggers on `project_memberships`, `workspace_memberships`, `organization_memberships` (DELETE), `projects` (UPDATE) and `tasks` (assignee). A separate `MessageThread` table was unnecessary: `thread_root_id` with a composite same-channel FK is sufficient.

## 4. Channel permission model

`channel_allowed(profile, channel, cap)` is the single definition used by RLS, commands and the Realtime policy; it returns strictly `true/false` (a NULL-propagation defect found by the integration suite — an editor could manage an owner's channel — was fixed before commit).

| Capability       | Rule                                                                         |
| ---------------- | ---------------------------------------------------------------------------- |
| `channel.read`   | live `project.read` AND (PROJECT channel OR explicit member row)             |
| `channel.post`   | read AND not archived AND live `project.write` (viewers read only)           |
| `channel.manage` | `project.write` AND (MANAGER member OR, for PROJECT channels, project owner) |

Organization/workspace administrators without a project grant and project owners without a restricted-channel grant get `NOT_FOUND`. The last manager of a restricted channel cannot leave or be removed. Archived channels stay readable and reject sends, edits, reactions and new grants.

## 5. Message and thread invariants

Per-channel `seq` (order) and `change_seq` (backfill cursor) are assigned under the channel row lock; `UNIQUE(author_id, client_key)` + server-computed `request_hash` make retries return the committed message and reused keys with different intent `CONFLICT`; thread roots are top-level messages of the same project and channel (FK + command check, no nesting); bodies are ≤4,000 visible characters of plain text, ≤20 mentions, ≤10 references, control characters rejected; edits use `expectedVersion` (a retried, already-committed edit is recognized); deletion is a tombstone that erases body, mentions, reactions and references; editing a tombstone is `CONFLICT`. Runtime has SELECT only; all writes go through definer functions.

## 6. Realtime delivery and recovery model

1. Command commits rows **and** identifier-only outbox events in one transaction.
2. After commit the server calls `atlas_private.comm_dispatch`, which sends each pending event with `realtime.send(..., private => true)`; failures stay queued (abandoned after 5 attempts, pruned after a day). If Realtime is not installed the function is a no-op.
3. Clients join only `atlas:channel:<id>:<epoch>` and `atlas:user:<id>` with their own Supabase access token, and on every event, (re)subscription, focus and `online` call `GET …/messages?since=<changeSeq>`; merging is idempotent by ID/change cursor. A 15 s backfill poll runs whenever the socket is not live; the UI shows connecting/live/reconnecting/offline/unavailable/backfilling states.

Guarantees: committed messages are never lost by delivery failure and appear once after replay/backfill; order is the server sequence. Not guaranteed: event delivery, latency or order — by design.

## 7. Revocation and subscription security

Supabase caches join authorization for an open subscription, so revocation does not rely on RLS alone: every audience-shrinking change rotates the channel epoch in the revoking transaction. Retained sockets receive one content-free `topic.rotated` and then nothing (verified on a real socket for 3 s after a new post); the stale but unexpired JWT cannot join the old or new topic; every API read returns `NOT_FOUND`. Remaining members refetch the new topic and continue to receive events. No `service_role` key, permissive `USING (true)` policy or INSERT policy on `realtime.messages` was created; browser roles have no table privileges and EXECUTE only on `atlas_realtime.topic_allowed(text)`.

## 8. Notifications

Kinds: MENTION, THREAD_REPLY, ARTIFACT_SHARED (a mention in a message that shares research — one logical event, one notification), TASK_ASSIGNED (trigger inside the task write; self-assignment excluded), CHANNEL_ADDED, CHANNEL_REMOVED (channel name not revealed). `UNIQUE(recipient, dedup_key)`; recipients must currently read the channel; `notify = NONE|MENTIONS|ALL` preferences apply. Rows store no text; inbox items re-derive titles/snippets under the recipient's live RLS. Read and read-all are recipient-scoped and idempotent; cursor pagination; unread badge in the live sidebar updated by the private user topic plus focus/60 s refresh. No email or push.

## 9. Artifact sharing

References use the existing artifact registry (`(project_id, artifact_id, kind)` FK — cross-project references are unrepresentable). The sender's reference must be active in the channel's project; citations require a READY source version of that paper and, optionally, a PROJECT-visible live annotation whose page must match; private annotations are refused. Cards are resolved per viewer through `resolveArtifacts` and RLS-joined source/annotation rows: unavailable targets show "Shared research you can't access" with no title, archived notes are hidden from non-writers, deleted annotations drop their quote. Links reuse research-journey routes (`library?paper=`, `documents?doc=`, `tasks?task=`, `reader?paper&source&page&annotation`). Direct file attachments remain out of scope (no scanner bypass).

## 10. Contextual Atlas AI behavior

Explicit invocation from the channel or thread ("Ask Atlas"). `GET /channels/:id/atlas` shows the exact message IDs and shared papers before consent. `runInput.discussion` makes `prepareRun` re-derive one channel's main timeline or one thread (≤40 messages, ≤12,000 characters, USER messages only) under the actor's RLS; a channel of another project is `NOT_FOUND`; discussion runs cannot reuse a conversation; the discussion block is labelled untrusted, passed only in the provider request and never persisted in `ai_runs.prompt`; shared papers become ordinary references, so existing retrieval, evidence revalidation and citation verification apply. Output is labelled "Generated analysis · not research evidence"; posting it (kind ATLAS, bound to the actor's own completed run) and creating notes/tasks (existing `ProposalActions`) each require confirmation. When activation is absent the panel states AI is unavailable and sends nothing. Paid providers remain disabled (`ATLAS_AI_PAID_REQUESTS` not approved).

## 11. API contracts

See [API contracts — A04](../API_CONTRACTS.md#a04-implemented-interfaces). Rate buckets: `inbox-count` 60/min (sidebar unread badge), `message` 60/min, `reaction` 120/min, `read-state` 240/min, management `write` 30/min, `atlas-context` 30/min.

## 12. Test evidence (local, disposable, 3 November 2026)

| Check                                                                              | Result                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm db:validate`             | PASS                                                                                                                                                                                                                                                                                   |
| `pnpm test` (unit)                                                                 | PASS 318 (29 files; 10 new A04)                                                                                                                                                                                                                                                        |
| `pnpm test:integration` (pgvector PG17, non-owner runtime)                         | PASS 168 (10 files; 35 new A04); A01–A03 suites unchanged and green                                                                                                                                                                                                                    |
| `pnpm test:realtime` (real GoTrue v2.197.0 + Supabase Realtime v2.143.1 + gateway) | PASS 6/6, three consecutive runs                                                                                                                                                                                                                                                       |
| `pnpm test:auth:e2e` (real GoTrue + Storage + Realtime, Chromium)                  | PASS 14/14 (13 existing A01–A03 journeys + new A04 two-browser journey). A first full run showed the new sidebar unread badge pushed read-heavy journeys over the shared 120/min `read` bucket; fixed with a separate `inbox-count` bucket and no duplicate refresh on first subscribe |
| `pnpm build`, `pnpm test:e2e` (preview)                                            | see PR/CI                                                                                                                                                                                                                                                                              |

Harness changes: Realtime service, logical WAL, Supabase bootstrap roles, gateway `/realtime/v1/` route (publishable key exchanged for the disposable anon JWT, as the hosted gateway does), `GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated` (hosted default), and the app CSP now allows the configured Supabase origin's `ws(s)://` form (without it browsers blocked Realtime). Limitation: the self-hosted Realtime image is not byte-identical to hosted Supabase Realtime; hosted subscribe/reconnect/revoke remains unverified until §13.

## 13. Hosted activation status — approval packet (NOT APPLIED)

- Target: Atlas development project `hgngonpirctrwbckhbmy` only; migration owner `postgres`; current baseline 12/12 migrations (A01 execution record).
- Batch: one additive migration `20261103090000_research_communication`, SHA-256 `921bafff95e7fdd3db3a0842a0c5f414d49f85da1b6d3f8ff17acb4c77709720` (recompute at approval time).
- Recovery baseline: the A01 G2 capture procedure (`ops/recovery`) must be refreshed immediately before applying.
- Rehearsal: restore to an isolated clone, `prisma migrate status/deploy/status/deploy`, then confirm the `atlas_private_topic_read` policy exists on `realtime.messages` (requires `postgres` to be able to create policies there — verify in rehearsal), RLS on the eight new tables, zero browser table grants, and the A01 history gate.
- Hosted test after approval: two approved synthetic users, private subscribe → message → revoke → silence/denial → reconnect backfill; then delete synthetic data and record receipts.
- Effects: new tables/policies/functions/triggers; no existing data modified; no new paid service. Rollback: forward-fix only (no destructive down-migration).

## 14. Known limitations

- Hosted Realtime behaviour unverified (above). DB-native broadcast on hosted depends on the project's Realtime "broadcast from database" support.
- Delivery is post-commit best effort from the web request; there is no background sweeper, so queued events from a crashed dispatch go out with the next command (clients still recover by backfill/polling).
- An invoker's own completed Atlas answer remains in their private AI history after later channel revocation (they had access at generation time).
- Unread counts are tracked for joined members only; no message search, edit history, DMs, attachments, email/push or presence.
- Restricted channels whose managers all lose project access cannot be recovered through the UI (owners deliberately have no bypass).

## 15. Next-phase (Phase 06 beta) entry criteria

Hosted A04 verification receipts (§13); green CI on `master` including `test:realtime`; a measured fanout/latency check on hosted Realtime; a security review of the outbox dispatcher's failure modes; pilot feedback on notification noise and restricted-channel recovery.
