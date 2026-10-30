# Autosave and draft recovery

`features/documents/use-autosave.ts`:

- Debounce 1.5 s after the last change, at most 10 s while typing continues; Ctrl/⌘+S saves now.
- States: Unsaved changes, Saving…, Saved (only after the server confirms the commit), Offline, Failed, Conflict, plus a recoverable-draft banner.
- Each distinct content attempt gets a `clientRequestId`; a retry of the same content reuses it, so a lost response never creates a duplicate revision. Network/429/500 failures retry with bounded backoff (max ~64 s) and on the browser `online` event.
- `CONFLICT` stops autosave. The user keeps their editor content and chooses: compare revisions, **Save mine as a new revision** (explicitly saves on top; the other revision stays in history) or **Discard mine and load latest**. Nothing is overwritten silently.
- Unmount cancels timers and invalidates in-flight completion callbacks: an old document cannot schedule another save/retry after navigation. The document subtree remounts per actor/project/document, retaining unsaved drafts until recovery (or the existing account/sign-out purge). A request already dispatched may still commit; reopening reconciles it with the server.
- `beforeunload` warns while unsaved content exists. An approved Atlas proposal reloads an open document only when it has no unsaved edits.

## Explicit save confirmation (R11-01 correction)

`save()` and `saveOnTop(latestRevision)` resolve a discriminated `SaveResult`; handled failures never imply success:

| Result      | Meaning and caller behavior                                                                                                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `confirmed` | A valid server response acknowledged this attempt's revision. `current` says whether its content still matches the editor; `unchanged` identifies an acknowledged server no-op. Only a current confirmation permits recovery success. |
| `unchanged` | Local content already matches the previously loaded/acknowledged content; no request was sent and no new revision is claimed. Restore may use this revision as its optimistic token; SQL still rechecks it.                           |
| `in-flight` | Another save is running. No request, rebase or success acknowledgement occurs; wait and retry explicitly.                                                                                                                             |
| `cancelled` | The component lifetime ended; no notification or follow-up write may run. An already dispatched request can still commit.                                                                                                             |
| `disabled`  | This editor cannot write; no request was sent.                                                                                                                                                                                        |
| `conflict`  | The revision was rejected, or an idempotent replay confirmed an older save superseded by a newer authorized revision. Keep the draft and review again.                                                                                |
| `uncertain` | A network, unreadable response or internal failure did not confirm an outcome. A commit may already exist. Keep the draft and retry/reconcile; do not assert definite failure or success.                                             |
| `failed`    | Validation, authorization or another explicit rejection, with its public code/message. Retain the draft; do not continue recovery.                                                                                                    |

**Save mine as a new revision** fetches the latest authorized document, then explicitly saves against that revision. It announces a new revision only after a current server acknowledgement; a server no-op has separate truthful feedback. A lost response retains the original request ID, content and expected revision even if the latest read sees that commit. Retry replays that exact attempt, preventing a duplicate revision. A newer revision observed during recovery remains a lower bound on subsequent background retries; an older replay requires another explicit conflict review.

**Restore version** stops after any unconfirmed prerequisite save, including an already-running request. After confirmation it uses the returned revision, rather than a stale React render value, for `expectedRevision`. A local unchanged result can supply the existing token. New edits during the prerequisite save block restoration. The editor and conflicting recovery actions are temporarily disabled during explicit recovery; Tiptap's editable state is updated on the existing editor instance. A lost restore response asks the user to check history before retrying; no confirmed restore or definite failure is claimed.

Both callers serialize recovery actions and invalidate pending continuations on document/project/actor remount. No fetch completion after navigation can trigger a new save, success toast, draft purge or reload. Background debounce, conflict stop, bounded retry delay and online retry remain handled. The request attempt itself is in memory, not persisted across navigation: reopening compares the retained draft with authorized server content; a differing newer revision requires explicit recovery. Immutable version history and server authorization are unchanged.

Regression coverage: `tests/unit/autosave.test.tsx` exercises result variants, acknowledgement/revision consistency, in-flight/no-op/unmount, unknown response/idempotent retry and superseded replay. `tests/unit/document-recovery.test.tsx` renders the real document caller, hook, draft store and toast provider with HTTP/editor/history boundaries replaced, checking visible success/uncertainty and prerequisite-save gating. The Auth browser recovery journey uses real SQL and Tiptap, commits a recovery while dropping its response, checks the editing lock, and retries the same request without creating another revision. See the [Phase 04 report](../phases/PHASE_04_IMPLEMENTATION_REPORT.md) for actual execution and environment limits.

Local draft store (`features/documents/drafts.ts`):

- Key `atlas:draft:v1:<actorId>:<projectId>:<documentId>`; value `{content, baseRevision, savedAt}`; at most ~450 KB.
- Written on every change, removed after a confirmed save, expired after 7 days.
- On opening a document, drafts of other accounts and expired drafts are purged; all drafts are purged on sign-out.
- A draft that differs from the server revision is only restored after an explicit **Recover draft** choice; the banner states when the draft was based on an older revision.
- It is never authoritative and is never sent anywhere except through the normal save command.

Tabs: two tabs of the same account share the draft key; concurrent saves are still serialized by the revision check, so the second tab gets the conflict flow. Known limitation: the shared key keeps only the latest tab's draft.
