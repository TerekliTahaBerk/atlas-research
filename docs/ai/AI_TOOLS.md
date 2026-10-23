# Research tools and future actions

The initial server registry exposes one bounded composite read tool, `research.retrieve`, covering permitted passages, saved paper metadata and explicitly attached notes. It has strict input/output Zod schemas, project scope, `project.read`, a ten-second result deadline, five-second retrieval SQL timeout, 100 KB result cap and a content-free `ai.research.retrieve` audit event. The server selects it during orchestration. Unknown tool names, injected actor fields and arbitrary SQL are rejected. No LLM response executes a tool.

The provider receives already-authorized evidence and no executable tools. This keeps prompt injection from granting privileges or invoking writes, even if a paper asks for database access or another tenant's files. Syntactically valid model prose can still misinterpret evidence; this boundary is not a semantic quality guarantee.

`aiActionProposal` describes future document/task/experiment/LaTeX drafts, required project write capability, typed references and proposed content. Its only accepted states are `approval:pending` and `execution:integration-pending`. The current live command picker exposes no future write actions. Phase 04/05 domain services, explicit user authorization, idempotency and transactional checks are required before adding execution.
