BEGIN;

-- Metadata is retained after byte removal so versions, annotations and citation
-- locators stay referentially intact. Only a privileged project action marks it.
ALTER TABLE app.file_objects ADD COLUMN "deletedAt" timestamptz;
ALTER TABLE app.file_objects DROP CONSTRAINT file_objects_bytes_check;
ALTER TABLE app.file_objects ADD CONSTRAINT file_objects_bytes_check CHECK (bytes BETWEEN 1 AND 104857600);
ALTER TABLE app.upload_intents DROP CONSTRAINT "upload_intents_expectedBytes_check";
ALTER TABLE app.upload_intents ADD CONSTRAINT upload_intents_expected_bytes_check CHECK ("expectedBytes" BETWEEN 1 AND 104857600);
ALTER TABLE ops.file_jobs
  ADD COLUMN "reservedIndexBytes" integer NOT NULL DEFAULT 0 CHECK ("reservedIndexBytes" BETWEEN 0 AND 5242880),
  ADD COLUMN "reservationExpiresAt" timestamptz,
  ADD CONSTRAINT file_job_reservation_expiry CHECK ("reservedIndexBytes" = 0 OR "reservationExpiresAt" IS NOT NULL);

CREATE INDEX projects_active_workspace_resource ON app.projects ("workspaceId")
  WHERE "archivedAt" IS NULL AND "deletedAt" IS NULL;
CREATE INDEX file_objects_workspace_resource ON app.file_objects ("workspaceId", "createdAt");
CREATE INDEX upload_intents_workspace_hold ON app.upload_intents ("workspaceId", "expiresAt")
  WHERE state='uploading';
CREATE INDEX upload_intents_blob_lookup ON app.upload_intents ("workspaceId", "projectId", "fileId");
ALTER TABLE app.source_versions ADD COLUMN "indexedBytes" integer NOT NULL DEFAULT 0 CHECK ("indexedBytes">=0);
-- FORCE RLS remains in place. Read and backfill the historical rows using the
-- existing non-login policy role with temporary column grants.
GRANT SELECT(id),UPDATE("indexedBytes") ON app.source_versions TO atlas_policy;
GRANT SELECT(id,"versionId") ON app.source_pages TO atlas_policy;
GRANT SELECT("pageId",text) ON app.source_chunks TO atlas_policy;
SET LOCAL ROLE atlas_policy;
UPDATE app.source_versions sv SET "indexedBytes"=stored.bytes
FROM (
  SELECT p."versionId",sum(octet_length(c.text)) AS bytes
  FROM app.source_chunks c JOIN app.source_pages p ON p.id=c."pageId"
  GROUP BY p."versionId"
) stored WHERE sv.id=stored."versionId";
RESET ROLE;
REVOKE SELECT(id),UPDATE("indexedBytes") ON app.source_versions FROM atlas_policy;
REVOKE SELECT(id,"versionId") ON app.source_pages FROM atlas_policy;
REVOKE SELECT("pageId",text) ON app.source_chunks FROM atlas_policy;
CREATE INDEX source_version_workspace_index_bytes ON app.source_versions ("workspaceId") INCLUDE ("indexedBytes")
  WHERE "indexedBytes">0;
CREATE INDEX file_jobs_workspace_hold ON ops.file_jobs ("workspaceId", "reservationExpiresAt")
  WHERE state IN ('pending','running','failed');

GRANT UPDATE ("deletedAt") ON app.file_objects TO atlas_runtime;
CREATE POLICY file_tombstone ON app.file_objects FOR UPDATE TO atlas_runtime
  USING ("deletedAt" IS NULL AND app.can_write_research("workspaceId","projectId")
    AND app.has_project_role("workspaceId","projectId",ARRAY['owner','admin']))
  WITH CHECK ("deletedAt" IS NOT NULL AND app.can_write_research("workspaceId","projectId")
    AND app.has_project_role("workspaceId","projectId",ARRAY['owner','admin']));

GRANT DELETE ON app.source_chunks TO atlas_runtime;
CREATE POLICY index_chunk_remove ON app.source_chunks FOR DELETE TO atlas_runtime
  USING (app.can_write_research("workspaceId","projectId"));

-- Editors already have research-write rights. They need the same project
-- serialization as owners; project edits still require their own RLS policy.
CREATE OR REPLACE FUNCTION app.lock_project(w uuid,p uuid,exclusive boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NOT app.lock_workspace(w,false) OR NOT app.has_project_role(w,p,ARRAY['owner','admin','editor','viewer']) THEN RETURN false; END IF;
  IF exclusive THEN
    IF NOT app.has_project_role(w,p,ARRAY['owner','admin','editor']) THEN RETURN false; END IF;
    PERFORM 1 FROM app.projects WHERE id=p AND "workspaceId"=w FOR UPDATE;
  ELSE
    PERFORM 1 FROM app.projects WHERE id=p AND "workspaceId"=w FOR SHARE;
  END IF;
  RETURN app.has_project_role(w,p,ARRAY['owner','admin','editor','viewer']);
END $$;

-- A bounded internal role can see usage across private sibling projects.
-- Runtime callers receive workspace totals, never the underlying rows.
GRANT USAGE ON SCHEMA ops TO atlas_policy;
GRANT CREATE ON SCHEMA app TO atlas_policy;
GRANT SELECT ON app.file_objects,app.upload_intents TO atlas_policy;
GRANT SELECT ("workspaceId","indexedBytes") ON app.source_versions TO atlas_policy;
GRANT SELECT ON ops.file_jobs TO atlas_policy;
GRANT SELECT ("reservedIndexBytes","reservationExpiresAt") ON ops.file_jobs TO atlas_runtime;
CREATE POLICY internal_file_meter ON app.file_objects FOR SELECT TO atlas_policy USING (true);
CREATE POLICY internal_upload_meter ON app.upload_intents FOR SELECT TO atlas_policy USING (true);
CREATE POLICY internal_index_meter ON app.source_versions FOR SELECT TO atlas_policy USING (true);
CREATE POLICY internal_job_meter ON ops.file_jobs FOR SELECT TO atlas_policy USING (true);

CREATE FUNCTION app.workspace_resource_usage(w uuid, period_start timestamptz, period_end timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT CASE WHEN app.is_workspace_member(w) AND period_start<period_end
      AND period_end-period_start<=interval '370 days' THEN jsonb_build_object(
    'activeProjects',(SELECT count(*) FROM app.projects WHERE "workspaceId"=w AND "archivedAt" IS NULL AND "deletedAt" IS NULL),
    'storageBytes',(SELECT coalesce(sum(bytes),0) FROM app.file_objects WHERE "workspaceId"=w AND "deletedAt" IS NULL),
    'monthlyUploads',(SELECT count(*) FROM app.file_objects WHERE "workspaceId"=w AND "createdAt">=period_start AND "createdAt"<period_end),
    'indexedBytes',(SELECT coalesce(sum("indexedBytes"),0) FROM app.source_versions
      WHERE "workspaceId"=w AND "indexedBytes">0),
    'storageReservedBytes',(SELECT coalesce(sum("expectedBytes"),0) FROM app.upload_intents WHERE "workspaceId"=w AND state='uploading' AND "expiresAt">now()),
    'monthlyUploadReservations',(SELECT count(*) FROM app.upload_intents WHERE "workspaceId"=w AND state='uploading' AND "expiresAt">now()),
    'indexReservedBytes',(SELECT coalesce(sum("reservedIndexBytes"),0) FROM ops.file_jobs
      WHERE "workspaceId"=w AND "reservationExpiresAt">now()
        AND (state IN ('pending','running') OR (state='failed' AND attempts<2)))
  ) END
$$;
ALTER FUNCTION app.workspace_resource_usage(uuid,timestamptz,timestamptz) OWNER TO atlas_policy;
REVOKE ALL ON FUNCTION app.workspace_resource_usage(uuid,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.workspace_resource_usage(uuid,timestamptz,timestamptz) TO atlas_runtime;

-- The isolated file worker gets only a yes/no unlink decision for a known path.
-- Pending uploads and committed live references always prevent removal.
CREATE FUNCTION app.collectable_pdf_blobs(w uuid,p uuid,files uuid[])
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT f FROM unnest(files) AS f WHERE cardinality(files)<=128
  AND NOT EXISTS(SELECT 1 FROM app.file_objects
    WHERE "workspaceId"=w AND "projectId"=p AND id=f AND "deletedAt" IS NULL)
  AND NOT EXISTS(SELECT 1 FROM app.upload_intents
    WHERE "workspaceId"=w AND "projectId"=p AND "fileId"=f AND state='uploading' AND "expiresAt">now())
$$;
ALTER FUNCTION app.collectable_pdf_blobs(uuid,uuid,uuid[]) OWNER TO atlas_policy;
REVOKE ALL ON FUNCTION app.collectable_pdf_blobs(uuid,uuid,uuid[]) FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO atlas_queue;
GRANT EXECUTE ON FUNCTION app.collectable_pdf_blobs(uuid,uuid,uuid[]) TO atlas_queue;
CREATE FUNCTION app.billing_resource_totals() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object(
 'storageBytes',(SELECT coalesce(sum(bytes),0) FROM app.file_objects WHERE "deletedAt" IS NULL),
 'indexedBytes',(SELECT coalesce(sum("indexedBytes"),0) FROM app.source_versions WHERE "indexedBytes">0),
 'pendingIndexJobs',(SELECT count(*) FROM ops.file_jobs WHERE state='pending'),
 'runningIndexJobs',(SELECT count(*) FROM ops.file_jobs WHERE state='running'),
 'failedIndexJobs',(SELECT count(*) FROM ops.file_jobs WHERE state='failed'))
 WHERE app.billing_operator()
$$;
ALTER FUNCTION app.billing_resource_totals() OWNER TO atlas_policy;
REVOKE ALL ON FUNCTION app.billing_resource_totals() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.billing_resource_totals() TO atlas_runtime;

REVOKE CREATE ON SCHEMA app FROM atlas_policy;

UPDATE ops.schema_revision SET revision='202611230102_resource_metering' WHERE id=1;
COMMIT;
