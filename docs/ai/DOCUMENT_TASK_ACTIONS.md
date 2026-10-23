# Document and task actions from Atlas AI

Context: on a live document Atlas receives the document identity chip and the existing project research reference only. Linked papers are **not** implied; users attach them explicitly with `@`. Document text is not sent as model evidence in Phase 04 (it would need a new Phase 03 evidence kind and provider review); "Ask Atlas" on a selection pre-fills a visible, editable prompt instead. Paid dispatch stays disabled; without providers, documents and tasks work fully and Atlas shows its existing unavailable state.

Proposals (`POST /api/v1/ai/proposals`, read-only):

```ts
type DocumentEditProposal = {
  type: 'document.insert';
  runId;
  documentId;
  expectedRevision;
  proposedContent: DocNode[];
  sourceReferences: ReferenceDto[];
  proposalHash;
};
type TaskProposal = {
  type: 'task.create';
  runId;
  projectId;
  tasks: {
    title;
    description;
    status: 'TODO';
    priority;
    references: ReferenceDto[];
  }[];
  proposalHash;
};
```

Built from the actor's own **completed** run read through RLS (evidence visibility re-checked): answer paragraphs/headings/lists become schema-valid blocks; `[n]` markers become citation atoms from the run's verified citations (chunk-located when available); list items become task proposals with their cited papers.

Approval: the message shows the exact proposal with Accept/Discard (tasks individually selectable). `ai.document-proposal.apply` / `ai.task-proposal.apply` require `approved: true` and the hash; the server re-derives the proposal (a changed run or document yields `CONFLICT`), then SQL applies normal write capability, schema/reference validation, assignee eligibility, idempotency and the document revision check, and verifies the run is the actor's completed run in that project. Stale proposals keep the preview and offer "Refresh proposal". Revoked users get 404. Applied revisions record `source = AI_PROPOSAL` and `ai_run_id`; tasks record `ai_run_id`.
