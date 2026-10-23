# Autosave and draft recovery

`features/documents/use-autosave.ts`:

- Debounce 1.5 s after the last change, at most 10 s while typing continues; Ctrl/⌘+S saves now.
- States: Unsaved changes, Saving…, Saved (only after the server confirms the commit), Offline, Failed, Conflict, plus a recoverable-draft banner.
- Each distinct content attempt gets a `clientRequestId`; a retry of the same content reuses it, so a lost response never creates a duplicate revision. Network/429/500 failures retry with bounded backoff (max ~64 s) and on the browser `online` event.
- `CONFLICT` stops autosave. The user keeps their editor content and chooses: compare revisions, **Save mine as a new revision** (explicitly saves on top; the other revision stays in history) or **Discard mine and load latest**. Nothing is overwritten silently.
- `beforeunload` warns while unsaved content exists. An approved Atlas proposal reloads an open document only when it has no unsaved edits.

Local draft store (`features/documents/drafts.ts`):

- Key `atlas:draft:v1:<actorId>:<projectId>:<documentId>`; value `{content, baseRevision, savedAt}`; at most ~450 KB.
- Written on every change, removed after a confirmed save, expired after 7 days.
- On opening a document, drafts of other accounts and expired drafts are purged; all drafts are purged on sign-out.
- A draft that differs from the server revision is only restored after an explicit **Recover draft** choice; the banner states when the draft was based on an older revision.
- It is never authoritative and is never sent anywhere except through the normal save command.

Tabs: two tabs of the same account share the draft key; concurrent saves are still serialized by the revision check, so the second tab gets the conflict flow. Known limitation: the shared key keeps only the latest tab's draft.
