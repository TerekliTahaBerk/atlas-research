# Database architecture

## Phase 02 research library (migrated locally; hosted activation pending)

Additive migration `20261023100000_research_library` adds `research_papers`, `paper_external_identifiers`, `artifacts`, `project_papers`, `paper_collections`, `collection_memberships`, `paper_tags`, `project_paper_tags`, `source_versions`, `upload_intents`, `ingestion_jobs`, `paper_annotations` and `research_command_keys`, plus enums `ReadingStatus`, `SourceState`, `AnnotationKind`, `AnnotationVisibility`, `JobState`. No Phase 01 object is dropped; deletes are `RESTRICT`. Composite keys bind every private row to `projects(organization_id, workspace_id, id)` and children to `(project_id, id)`; annotations bind `(project_paper_id, source_version_id)`. RLS is enabled on all thirteen tables with read policies through `atlas_private.can` (public papers only through a readable association; private annotations author-only) and explicit deny-DML policies. The runtime gains SELECT only; idempotency records and the scan outbox are not readable. Writes extend the existing command boundary: `atlas_private.mutate` dispatches research commands to `mutate_research`; scanner functions `claim_scan_jobs`, `scan_job_source` and `complete_scan` are separately granted. Triggers make source versions and annotation anchors immutable. Where `storage.buckets` exists the migration creates private `atlas-quarantine`/`atlas-sources` buckets (PDF only, 25 MB) and no object policies.

Verified on fresh disposable PostgreSQL 17 (migrate deploy, foundation constraints, 47 integration tests with a non-owner runtime) and on the disposable Supabase Auth + Storage harness. `prisma migrate diff` shows no table/column drift (only the hand-written FKs/checks/partial indexes, as in Phase 01). It has **not** been applied to the hosted development project. See [library model](library/LIBRARY_MODEL.md), [paper identity](research/PAPER_IDENTITY.md) and [ADR 0014](decisions/0014-research-library-boundary.md).

## Phase 01 migrated core

Additive migrations `20261022100000_core_platform` and `20261022110000_onboarding_drafts` extend the foundation. Profiles gain research attributes, avatar reference (no uploads), bounded server onboarding draft and completion timestamp. Unique personal-owner keys on organizations/workspaces protect bootstrap concurrency. Containers and memberships have optimistic versions. Projects gain creator/idempotency keys and retain `deleted_at` as archive state. New tables: invitations (composite scope FKs, role/scope checks, SHA-256 hash, seven-day expiry, accepted/revoked times), append-only audit events, and expiring distributed rate buckets. No Phase 02–07 table is added.

The reviewed SQL grants the non-owner `atlas_runtime` role scoped SELECT and constrained function EXECUTE only. RLS remains enabled on every domain table; direct DML is denied, with explicit `USING`/`WITH CHECK` deny policies as defense in depth. Security-definer capability helpers prevent recursive membership policies. The bounded mutation function resolves resource scope and enforces rights/invariants/audit within one transaction. No runtime ownership or BYPASSRLS is accepted. [Authorization](identity/AUTHORIZATION.md) documents actor propagation and the privileged function boundary.

On a compatible Supabase target, `profiles.id` is linked to `auth.users.id`; portable plain PostgreSQL tests omit that external FK. Existing personal rows are not guessed/backfilled. Review and identify every development target before migration; no existing or hosted database was reset. Migration-from-scratch, actual runtime-role isolation and concurrency evidence are in the implementation report. Actual Prisma/actor cleanup on both approved hosted development poolers passed; backup/restore, production topology and deployment verification remain separate.

## Implemented foundation

PostgreSQL 17-compatible schema through Prisma 7.10.1. Prisma 8 is excluded while prerelease. The `prisma-client` generator emits ignored TypeScript; the package exports an explicit PostgreSQL adapter factory with no import-time connection. CLI config loads root `.env`; schema validation/generation use an unreachable offline sentinel when no URL is provided. Migration commands require an explicit connection.

| Table                    | Key / uniqueness                                   | Scope / index                      | Deletion                                              |
| ------------------------ | -------------------------------------------------- | ---------------------------------- | ----------------------------------------------------- |
| profiles                 | id UUID from future Supabase Auth user             | profile id                         | Soft delete, restrict memberships                     |
| organizations            | id UUID                                            | deleted_at; personal flag          | Soft delete; restrict dependants                      |
| organization_memberships | org + profile PK                                   | profile/org index                  | Explicit removal only                                 |
| workspaces               | id UUID; unique org/id                             | org/deleted_at                     | Soft delete; restrict projects                        |
| workspace_memberships    | workspace/profile PK; unique org/workspace/profile | profile/org                        | Requires matching organization membership             |
| projects                 | id UUID; unique org/workspace/id                   | workspace/deleted_at/created_at/id | Soft delete; restrict research data                   |
| project_memberships      | project/profile PK                                 | workspace/profile                  | Requires same-tenant project and workspace membership |

Composite foreign keys prevent a member of org A being assigned to a workspace/project in org B. Names are bounded to 120 characters. Profile email is deliberately omitted: verified identity and email live in Supabase Auth. A future identity-link migration must bind `profiles.id` to verified `auth.users.id`; the current SQL remains portable to plain Postgres for isolated validation. `personal=true` describes intent; Phase 01 adds creator provisioning idempotency (unique personal owner) with a reviewed migration.

All IDs UUID, all physical names snake_case, Prisma models PascalCase, fields camelCase mapped to SQL. Timestamps use timestamptz(3); created_at defaults in DB, updated_at is Prisma-managed. Memberships are hard revoked; policy/actor/time recorded in future AuditEvent. Research containers archive with deleted_at; hard purge is a separate retention/export workflow. No unrestricted cascade deletion.

## Permission model

All three membership levels are necessary: organization membership gives tenant identity, workspace membership limits lab access, project membership supports private research and explicit editors. No role automatically grants private project contents merely because it administers tenant metadata.

| Role             | Effective privileges (Phase 01 service policy)                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| Org OWNER        | Metadata, admins, deletion/export policy, billing later; cannot implicitly read private projects                |
| Org ADMIN        | Workspace/membership administration except ownership transfer                                                   |
| Org MEMBER       | Own profile and explicitly granted workspace metadata                                                           |
| Workspace ADMIN  | Workspace metadata, invitations, projects list permitted by visibility; cannot implicitly read private projects |
| Workspace MEMBER | Create project; read workspace-visible projects; edit only with explicit project grant                          |
| Workspace VIEWER | Read workspace-visible projects, no creation                                                                    |
| Project OWNER    | Read/write/manage project members/archive; must retain at least one active owner                                |
| Project EDITOR   | Read/write research artifacts; no membership administration                                                     |
| Project VIEWER   | Read permitted project content                                                                                  |

An active organization + workspace membership is always required. Explicit project role controls capabilities. Workspace-visible projects grant read to active workspace members; private projects require explicit grant. A project grant never revives a removed parent membership. Workspace roles govern workspace-level actions; an explicitly granted project role governs that project (including an editor grant to a workspace viewer). This is deliberate scoped delegation, not implicit role inheritance. Invitations cannot exceed the inviter’s effective capability in the target scope. Effective permissions are computed in one server policy service, mirrored with tests in RLS. Last-owner protection and private→workspace visibility review are transactional Phase 01 work. A metadata administrator may remove access without obtaining the removed user's content rights.

## Future relational model (not migrated)

Unpublished/confidential user-provided sources must never create globally visible ResearchPaper metadata. Phase 02 permits a private source association with nullable public paper reference, retaining its title/metadata only in the project-scoped source record; enforce project/paper uniqueness only when that reference exists. Public metadata matching can attach a bibliographic reference later without changing file ownership.

Private entities below carry scope and composite foreign keys to their parent. Each gets UUID id and created_at/updated_at unless append-only. Indices start with scope, followed by ordering/filter fields. Audit/usage/version records are append-only.

| Entity               | Main fields, relations, invariants, indexes                                                                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ResearchPaper        | Public bibliographic metadata only: normalizedDoi unique when present; provider IDs unique per provider; title/authors/year/license/source/fetchedAt. No user PDFs or private notes in global metadata. No cascade into ProjectPaper |
| ProjectPaper         | org/workspace/project + paper; unique project/paper; private file object key, upload hash, provenance/status/version. Index project/created/id; association owns source access                                                       |
| PaperCollection      | project, name, archivedAt; index project/name/id                                                                                                                                                                                     |
| CollectionMembership | collection + projectPaper composite PK and project-matching FKs; index projectPaper                                                                                                                                                  |
| PaperAnnotation      | projectPaper, sourceVersion, author, page/quote/offset anchor, body, visibility; default project scope; private annotations require explicit author ACL and excluded retrieval                                                       |
| Document             | project, title, currentVersionId, visibility, archivedAt; index project/updated/id                                                                                                                                                   |
| DocumentVersion      | document, ordinal, author, immutable content/hash; unique document/ordinal; no purge while citations reference it                                                                                                                    |
| Task                 | project, title, state, dueAt, version, archivedAt; index project/state/due/id                                                                                                                                                        |
| TaskAssignment       | project + task + profile; unique task/profile; assignee must be active project participant; index profile/project                                                                                                                    |
| Channel              | project, name, visibility, archivedAt; project/name unique; restricted channel membership is additive gate                                                                                                                           |
| ChannelMembership    | project/channel/profile PK; same-scope constraints, project grant prerequisite                                                                                                                                                       |
| Message              | project/channel, author, clientMessageId, body, editedAt, deletedAt; unique channel/author/clientMessageId; index channel/created/id                                                                                                 |
| MessageThread        | project/channel/rootMessageId unique; messages have optional threadId; enforce same channel                                                                                                                                          |
| Conversation         | project, creator, title, scope (project/private), archivedAt; index project/creator/updated/id                                                                                                                                       |
| AIMessage            | conversation, role, status, content, runId, provider/model snapshot, usage; index conversation/created/id; private conversations remain creator scoped                                                                               |
| CitationReference    | project, owner artifact/message version, ProjectPaper/DocumentVersion source, chunk ID, exact quote, page/offset, verification status/method/time; immutable version references                                                      |
| ResearchArtifactLink | project, fromArtifactId, toArtifactId, typed relation, author; unique project/from/to/type; FK endpoints through Artifact registry; no arbitrary unchecked polymorphic IDs                                                           |
| Notification         | org/workspace/project as needed, recipient, eventId, readAt, safe payload; unique recipient/event/channel; index recipient/readAt/created/id                                                                                         |
| UsageEvent           | org/workspace/project, actor, idempotencyKey unique, provider/model, token units, reserved/settled cost; index org/created/id; never raw prompts                                                                                     |
| AuditEvent           | org, actor ID snapshot, action, resource ID, request ID, redacted metadata, createdAt; index org/created/id; retention controlled, no content                                                                                        |

Before these modules ship, introduce **Artifact** (project-scoped registry with kind and lifecycle) and **SourceVersion/SourceChunk** (immutable extraction/version/hash/page/offset records). Domain tables bind unique artifactId; link endpoints use `(projectId, artifactId)` FKs and a service-validated kind/relation matrix. On deletion retain a tombstone for provenance; source content purge follows retention and citation redaction rules. Links never confer access to their target.

```mermaid
erDiagram
 Organization ||--o{ Workspace : owns
 Workspace ||--o{ Project : contains
 Profile ||--o{ OrganizationMembership : joins
 Workspace ||--o{ WorkspaceMembership : grants
 Project ||--o{ ProjectMembership : grants
 Project ||--o{ Artifact : scopes
 Artifact ||--o{ ResearchArtifactLink : source
 Artifact ||--o{ ResearchArtifactLink : target
 ResearchPaper ||--o{ ProjectPaper : bibliographic_reference
 ProjectPaper ||--o{ SourceVersion : preserves
 SourceVersion ||--o{ SourceChunk : locates
 SourceChunk ||--o{ CitationReference : verifies
```

## Typed research graph

Allowed initial relationships: Paper→Document `cited_by`, Paper→Task `informs`, Paper→Message `discussed_in`, Document→Task `supports`, Document→Citation `contains`. Future: Task→Experiment `executes`, Experiment→Result `produces`, Result→Manuscript `supports`. Direction is canonical and reversible for browsing, not duplicated rows. Validate endpoint existence, both read rights, link-write permission, same project, and allowed kinds in one transaction. Cross-project linking is deferred until explicit sharing grants exist.

## Imports and DOI deduplication

Trim DOI URL/prefix wrappers, Unicode-normalize and lowercase canonical DOI; validate format without claiming DOI existence. Use provider/externalId uniqueness when no DOI; uncertain title/author matches are candidates for human merge, never automatic identity. Global metadata upsert and unique project association happen transactionally. Idempotency keys scoped to actor/project/operation include request hash; reject changed payload reuse. File SHA-256 is project scoped and never reveals another tenant's upload. License and provider provenance are retained; metadata availability does not grant PDF rights.

## Migrations and RLS

Initial migration is generated and tested only against a new disposable local cluster, never any existing database. RLS is enabled with no access policies for every foundation table: this denies non-owner SQL access until Phase 01 policies exist. Owner/migration roles can bypass RLS; the application must never use them in production. No database path is exposed by the Phase 00 web app. Schema migrations cannot express Supabase auth policies portably; hand-written SQL remains versioned beside generated DDL. See HANDOVER for actual execution evidence.

```sh
# Root .env or shell: a verified isolated development target only
DIRECT_URL=postgresql://USER:PASS@127.0.0.1:5432/atlas_dev pnpm db:migrate --name your_change
pnpm db:validate
pnpm db:generate
# Staging: review SQL and backup first, then run from packages/database
pnpm exec prisma migrate deploy
```

No pgvector columns/extensions are installed yet. Phase 03 uses a reviewed SQL migration enabling vector in the intended Supabase project and tenant/version-scoped embedding indexes. Supabase migration connection must be direct or session-capable (not transaction pooler); runtime uses the compatible pooled connection/adapter. Benchmark and verify transaction-local RLS context with the actual pooler before release.
