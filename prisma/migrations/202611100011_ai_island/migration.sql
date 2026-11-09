BEGIN;
ALTER TABLE app.ai_conversations ADD COLUMN "artifactIds" uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE app.ai_contexts ADD COLUMN artifacts jsonb NOT NULL DEFAULT '[]';
DO $$ DECLARE c text; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='app.ai_conversations'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%cardinality%' LOOP
 EXECUTE 'ALTER TABLE app.ai_conversations DROP CONSTRAINT ' || quote_ident(c);
 END LOOP;
END $$;
ALTER TABLE app.ai_conversations ADD CONSTRAINT ai_scope_size CHECK(cardinality("versionIds") BETWEEN 0 AND 10 AND cardinality("artifactIds") BETWEEN 0 AND 10 AND cardinality("versionIds")+cardinality("artifactIds")>0);
UPDATE ops.schema_revision SET revision='202611100011_ai_island' WHERE id=1;
COMMIT;
