BEGIN;
-- Collection removal only unlinks organization. Sources, PDFs and all anchors remain intact.
GRANT DELETE ON app.collections TO atlas_runtime;
CREATE POLICY collection_remove ON app.collections FOR DELETE TO atlas_runtime
USING (app.can_write_research("workspaceId","projectId"));
UPDATE ops.schema_revision SET revision='202611090008_library_experience' WHERE id=1;
COMMIT;
