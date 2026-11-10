BEGIN;
CREATE TABLE app.user_preferences (
 "actorId" text PRIMARY KEY REFERENCES identity.users(id),
 assignment boolean NOT NULL DEFAULT true, reply boolean NOT NULL DEFAULT true, mention boolean NOT NULL DEFAULT true,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0), "updatedAt" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.user_preferences FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON app.user_preferences TO atlas_runtime;
GRANT SELECT ON app.user_preferences TO atlas_policy,atlas_backup;
CREATE POLICY preferences_own ON app.user_preferences TO atlas_runtime USING("actorId"=app.actor_id() AND app.is_active_actor()) WITH CHECK("actorId"=app.actor_id() AND app.is_active_actor());
CREATE POLICY preferences_policy ON app.user_preferences FOR SELECT TO atlas_policy USING(true);
GRANT CREATE ON SCHEMA app TO atlas_policy;
CREATE FUNCTION app.notification_enabled(w uuid,p uuid,u text,e text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT CASE WHEN app.can_write_research(w,p) AND app.eligible_member(w,p,u,false) THEN
 COALESCE((SELECT CASE e WHEN 'assignment' THEN assignment WHEN 'reply' THEN reply WHEN 'mention' THEN mention ELSE false END FROM app.user_preferences WHERE "actorId"=u),e IN ('assignment','reply','mention')) ELSE false END
$$;
ALTER FUNCTION app.notification_enabled(uuid,uuid,text,text) OWNER TO atlas_policy;
REVOKE ALL ON FUNCTION app.notification_enabled(uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.notification_enabled(uuid,uuid,text,text) TO atlas_runtime;
REVOKE CREATE ON SCHEMA app FROM atlas_policy;
ALTER TABLE app.messages ADD CONSTRAINT message_notification_scope UNIQUE("workspaceId","projectId","discussionId",id);
ALTER TABLE app.notifications ADD COLUMN "actorId" text REFERENCES identity.users(id), ADD COLUMN "messageId" uuid;
ALTER TABLE app.notifications ADD CONSTRAINT notification_message_scope FOREIGN KEY("workspaceId","projectId","targetId","messageId") REFERENCES app.messages("workspaceId","projectId","discussionId",id);
ALTER TABLE app.notifications ADD CONSTRAINT notification_assignment_message CHECK(event<>'assignment' OR "messageId" IS NULL);
DROP POLICY notification_create ON app.notifications;
CREATE POLICY notification_create ON app.notifications FOR INSERT TO atlas_runtime WITH CHECK("actorId"=app.actor_id() AND app.notification_enabled("workspaceId","projectId","recipientId",event));
CREATE INDEX notifications_page ON app.notifications("recipientId","createdAt" DESC,id DESC);
UPDATE ops.schema_revision SET revision='202611100014_inbox_settings' WHERE id=1;
COMMIT;
