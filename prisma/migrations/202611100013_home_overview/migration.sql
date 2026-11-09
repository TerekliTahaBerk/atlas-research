BEGIN;
CREATE TABLE app.work_visits(
 "actorId" text NOT NULL REFERENCES identity.users(id),"artifactId" uuid NOT NULL,
 "workspaceId" uuid NOT NULL,"projectId" uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('source','document')),
 "versionId" uuid REFERENCES app.source_versions(id),"openedAt" timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY("actorId","artifactId"),
 FOREIGN KEY("workspaceId","projectId","artifactId") REFERENCES app.artifacts("workspaceId","projectId",id)
);
ALTER TABLE app.work_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.work_visits FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON app.work_visits TO atlas_runtime;
GRANT SELECT ON app.work_visits TO atlas_backup;
CREATE POLICY work_visit_read ON app.work_visits FOR SELECT TO atlas_runtime USING("actorId"=app.actor_id() AND app.can_read_research("workspaceId","projectId"));
CREATE POLICY work_visit_write ON app.work_visits FOR INSERT TO atlas_runtime WITH CHECK("actorId"=app.actor_id() AND app.can_read_research("workspaceId","projectId") AND EXISTS(SELECT 1 FROM app.artifacts a WHERE a.id="artifactId" AND a."workspaceId"=work_visits."workspaceId" AND a."projectId"=work_visits."projectId" AND a.kind=work_visits.kind) AND ("versionId" IS NULL OR (kind='source' AND EXISTS(SELECT 1 FROM app.source_versions v WHERE v.id=work_visits."versionId" AND v."sourceId"=work_visits."artifactId" AND v."workspaceId"=work_visits."workspaceId" AND v."projectId"=work_visits."projectId" AND v."fileId" IS NOT NULL))));
CREATE POLICY work_visit_update ON app.work_visits FOR UPDATE TO atlas_runtime USING("actorId"=app.actor_id() AND app.can_read_research("workspaceId","projectId")) WITH CHECK("actorId"=app.actor_id() AND app.can_read_research("workspaceId","projectId") AND EXISTS(SELECT 1 FROM app.artifacts a WHERE a.id="artifactId" AND a."workspaceId"=work_visits."workspaceId" AND a."projectId"=work_visits."projectId" AND a.kind=work_visits.kind) AND ("versionId" IS NULL OR (kind='source' AND EXISTS(SELECT 1 FROM app.source_versions v WHERE v.id=work_visits."versionId" AND v."sourceId"=work_visits."artifactId" AND v."workspaceId"=work_visits."workspaceId" AND v."projectId"=work_visits."projectId" AND v."fileId" IS NOT NULL))));
CREATE INDEX work_visits_actor_recent ON app.work_visits("actorId","openedAt" DESC);
UPDATE ops.schema_revision SET revision='202611100013_home_overview' WHERE id=1;
COMMIT;
