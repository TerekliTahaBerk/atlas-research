# Product requirements

Current delivery state: see the [A00 capability/status matrix](phases/A00_REPOSITORY_HARDENING_REPORT.md#canonical-capabilitystatus-matrix). The journeys below are product requirements; Phase 01–04 services exist in `master`, with hosted activation blockers. Communication and advanced modules remain planned. Phase 00 descriptions refer only to the historical foundation and its preview.

## Positioning and scope

Researchers currently lose source context when discovery, PDFs, notes, task lists, and conversations live in separate systems. Atlas preserves the relationships between these artifacts, helping individuals and teams trace a claim back to evidence and carry a question through research work.

Target customers: independent academics, graduate students, laboratories, university research teams, and eventually institutions. The differentiator is a connected research journey and source provenance rather than superficial feature aggregation. A personal organization/workspace supports unaffiliated researchers; a lab can own multiple workspaces and projects. University administration is future scope.

Primary use cases: build a project library, read/annotate sources, write grounded notes, assign research work, discuss findings, and answer questions with auditable citations. Not in Phase 00: production auth, search providers, PDF ingestion, AI requests, editor, tasks, messaging, compilation, execution, payments, or enterprise management.

## Personas

| Persona                  | Goals and common workflow                                   | Collaboration                                   | Pain points                                      | Required permissions                                        | Most valuable modules                        |
| ------------------------ | ----------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------- | -------------------------------------------- |
| Independent researcher   | Form a question → collect papers → take notes → write       | Optional invitation to a private project        | Fragmentation, citation loss, limited budget     | Own personal org/workspace, private project owner           | Library, documents, AI                       |
| Graduate/PhD student     | Review literature → annotate → plan study → report findings | Supervisor review and limited lab access        | Repeated searches, unclear provenance, deadlines | Workspace member, project editor, no tenant admin           | Discovery, library, tasks, AI                |
| Lab member               | Read assigned sources → run research → share findings       | Project channels, assignments, shared artifacts | Lost context, scattered results                  | Explicit editor/viewer in relevant projects only            | Tasks, channels, library                     |
| PI/lab manager           | Define projects → invite researchers → oversee work         | Membership administration and scientific review | Visibility versus confidential work, turnover    | Org/workspace admin; content needs explicit project grant   | Projects, memberships, notifications         |
| University administrator | Manage institutions and governance in future                | Delegated workspace oversight                   | Compliance, provisioning, export                 | Metadata administration; no implicit private-content access | Administration, audit, usage, future billing |

## Primary journey and recovery

| Step                  | Expected behavior (see current status matrix)                 | Failure                                     | Recovery                                                   |
| --------------------- | ------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------- |
| Register              | Verified Supabase identity, one linked profile                | Expired link, provider unavailable          | Resend with rate limit; clear retry state                  |
| Create/join workspace | Personal bootstrap or scoped invitation                       | Duplicate request, revoked invite           | Idempotent transaction; fresh invitation                   |
| Create project        | Private by default, explicit owner                            | Invalid name, membership removed            | Retain draft, revalidate permission                        |
| Discover papers       | Search licensed provider, normalize metadata                  | Timeout, rate limit, partial metadata       | Backoff, retry, disclose provider availability             |
| Save sources          | Deduplicate paper, create project association                 | Same DOI/import repeated                    | Return existing association; don't duplicate               |
| Read/annotate         | Signed private file access and stable anchors                 | Unsupported PDF, stale URL, scan failure    | Refresh authorization; show processing error; retry upload |
| Ask grounded AI       | Authorized retrieval, answer with verified passage references | No sources, unsafe request, provider outage | Say insufficient evidence; retry with usage safeguards     |
| Create notes          | Save versions with source links                               | Concurrent edit, disconnect                 | Preserve local draft, resolve version conflict             |
| Assign tasks          | Project-authorized assignees and linked artifacts             | Removed assignee, stale version             | Refresh eligible members and retry                         |
| Discuss findings      | Persist then broadcast project-authorized message             | Connection loss, write rejection            | Idempotent resend and cursor backfill                      |
| Connect artifacts     | Typed links between authorized same-project objects           | Deleted target, cross-project attempt       | Tombstone references or reject without leaking target      |

Phase 00 provides navigation, themes, and sample shells for the journey; no above business action is enabled.

## Metrics and measurement plan

All targets below are **hypotheses for pilot evaluation**, not customer results. Use consent-aware first-party events with pseudonymous IDs; never capture paper content, prompts, titles, or message bodies in analytics.

| Metric                            | Definition / denominator                                                               | Hypothesis                                       |
| --------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Onboarding success                | Verified registrations with workspace within 24h / verified registrations              | ≥70%                                             |
| Time to first project             | Median elapsed verified registration → project created                                 | <5 min                                           |
| Time to first saved paper         | Median elapsed project creation → source saved                                         | <10 min                                          |
| First collaboration               | Workspaces with a second member's authorized action in 7d / team workspaces            | ≥40%                                             |
| Weekly active research workspaces | Unique workspaces with a source/note/task/message action in 7d                         | Track cohort trend; no count target before pilot |
| Verifiable AI citations           | Returned source claims with permission-valid exact passage verification / cited claims | ≥95%; unsupported claims explicitly withheld     |
| First-week retention              | Week-0 activated users with a meaningful action on days 7–13 / activated users         | ≥35%                                             |
| Critical journey success          | Successful scripted journey runs / all runs                                            | ≥99% in beta staging                             |

Segment personal/team cohorts and inspect failures before setting production SLOs. Accessibility, lawful ingestion, privacy, and citation honesty are non-negotiable release gates regardless of adoption metrics.
