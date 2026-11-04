-- A04.1 communication reliability and revocation hardening. Additive follow-up
-- to 20261103090000_research_communication (which stays byte-identical).
-- Apply only to an identified, approved target.
--
--  1. Outbox delivery is retried with bounded exponential backoff, stale hints
--     expire, and an event addressed to a superseded channel epoch is never
--     sent (only the content-free `topic.rotated` may reach an old topic).
--     Dispatch is serialized with revocations through the existing 71001 lock.
--  2. A periodic database sweep (pg_cron, when the extension is installed)
--     delivers queued events without any user command. Durability never
--     depends on it: clients reconcile by cursor regardless.
--  3. Every audience-shrinking change rotates topics: organization/workspace
--     archival and profile deletion were not covered by the A04 triggers.
--  4. A RESTRICTED channel always keeps at least one MANAGER row, and an
--     explicit, audited `channel.recover` lets a project owner appoint a
--     manager only when no manager can still manage the channel. It never
--     happens implicitly and is never available for a managed channel.

-- -------------------------------------------------------- outbox lifecycle
ALTER TABLE communication_outbox
 -- Truncated, not rounded: a timestamptz(3) default of now() can round up
 -- past now() and make a fresh row briefly not due.
 ADD COLUMN next_attempt_at timestamptz(3) NOT NULL DEFAULT date_trunc('milliseconds',now()),
 ADD COLUMN last_error varchar(16);
-- Replaces the A04 pending index (empty, never-deployed table).
DROP INDEX communication_outbox_pending;
CREATE INDEX communication_outbox_due ON communication_outbox(next_attempt_at,id) WHERE delivered_at IS NULL AND abandoned_at IS NULL;

CREATE OR REPLACE FUNCTION atlas_private.comm_dispatch(maximum integer) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r communication_outbox%ROWTYPE; n integer:=0; m text[]; current_epoch uuid;
 uuid_re constant text:='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
BEGIN
 IF maximum IS NULL OR maximum NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 -- A revocation (exclusive 71001) and its epoch rotation can never interleave
 -- with the epoch check below and the send.
 PERFORM pg_advisory_xact_lock_shared(71001,1);
 -- Hints older than 15 minutes are useless: clients have reconciled since.
 UPDATE communication_outbox SET abandoned_at=now(),last_error='EXPIRED' WHERE id IN (
  SELECT id FROM communication_outbox WHERE delivered_at IS NULL AND abandoned_at IS NULL
   AND created_at<now()-interval '15 minutes' ORDER BY id LIMIT 1000);
 IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NOT NULL THEN
  FOR r IN SELECT * FROM communication_outbox WHERE delivered_at IS NULL AND abandoned_at IS NULL AND next_attempt_at<=now()
   ORDER BY id LIMIT maximum FOR UPDATE SKIP LOCKED LOOP
   m:=regexp_match(r.topic,'^atlas:channel:('||uuid_re||'):('||uuid_re||')$');
   IF m IS NOT NULL AND r.event<>'topic.rotated' THEN
    SELECT epoch INTO current_epoch FROM channels WHERE id=m[1]::uuid;
    IF current_epoch IS DISTINCT FROM m[2]::uuid THEN
     -- The audience may have shrunk since this was queued: never deliver.
     UPDATE communication_outbox SET abandoned_at=now(),last_error='SUPERSEDED' WHERE id=r.id;
     CONTINUE;
    END IF;
   END IF;
   BEGIN
    EXECUTE 'SELECT realtime.send($1,$2,$3,true)' USING r.payload,r.event,r.topic;
    UPDATE communication_outbox SET delivered_at=now(),attempts=attempts+1,last_error=NULL WHERE id=r.id;
    n:=n+1;
   EXCEPTION WHEN others THEN
    -- Category only (SQLSTATE); no payloads or messages are retained.
    UPDATE communication_outbox SET attempts=attempts+1,last_error=left(SQLSTATE,16),
     next_attempt_at=now()+make_interval(secs=>least(60,power(2,attempts+1))::integer),
     abandoned_at=CASE WHEN attempts+1>=8 THEN now() END WHERE id=r.id;
   END;
  END LOOP;
 END IF;
 -- Events are ephemeral hints; the database cursor is the recovery path.
 DELETE FROM communication_outbox WHERE id IN (SELECT id FROM communication_outbox
  WHERE created_at<now()-interval '1 day' OR delivered_at<now()-interval '1 hour' ORDER BY id LIMIT 1000);
 RETURN n;
END $$;

-- Operator monitoring (postgres only): counts and ages, never payloads.
CREATE FUNCTION atlas_private.comm_outbox_health() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object(
  'pending',count(*) FILTER (WHERE delivered_at IS NULL AND abandoned_at IS NULL),
  'due',count(*) FILTER (WHERE delivered_at IS NULL AND abandoned_at IS NULL AND next_attempt_at<=now()),
  'retrying',count(*) FILTER (WHERE delivered_at IS NULL AND abandoned_at IS NULL AND attempts>0),
  'oldestPendingSeconds',coalesce(extract(epoch FROM now()-min(created_at) FILTER (WHERE delivered_at IS NULL AND abandoned_at IS NULL))::integer,0),
  'abandonedLastHour',count(*) FILTER (WHERE abandoned_at>now()-interval '1 hour'),
  'abandonedByReason',coalesce((SELECT jsonb_object_agg(reason,n) FROM (SELECT coalesce(last_error,'UNKNOWN') reason,count(*) n
   FROM communication_outbox WHERE abandoned_at>now()-interval '1 hour' GROUP BY 1) x),'{}'::jsonb),
  'deliveredLastHour',count(*) FILTER (WHERE delivered_at>now()-interval '1 hour'))
 FROM communication_outbox
$$;

-- Independent periodic delivery inside the database (no web process or
-- worker host). Installed only when pg_cron already exists; on hosted
-- Supabase enabling pg_cron is a separate, explicitly approved step and
-- ops/sql/a04-1-dispatch-schedule.sql (idempotent) schedules it afterwards.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname='atlas-comm-dispatch';
  PERFORM cron.schedule('atlas-comm-dispatch','20 seconds','SELECT atlas_private.comm_dispatch(200)');
 END IF;
END $$;

-- ------------------------------------------------------ revocation coverage
-- Archiving an organization or workspace, or deleting a profile, removes
-- channel read access exactly like a membership deletion.
CREATE FUNCTION atlas_private.comm_rotate_on_scope_archive() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r record; BEGIN
 IF NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at THEN RETURN NULL; END IF;
 IF TG_TABLE_NAME='organizations' THEN
  FOR r IN SELECT id FROM channels WHERE organization_id=NEW.id LOOP PERFORM atlas_private.comm_rotate(r.id); END LOOP;
 ELSIF TG_TABLE_NAME='workspaces' THEN
  FOR r IN SELECT id FROM channels WHERE workspace_id=NEW.id LOOP PERFORM atlas_private.comm_rotate(r.id); END LOOP;
 ELSIF TG_TABLE_NAME='profiles' THEN
  -- Project read always requires workspace membership.
  FOR r IN SELECT c.id FROM channels c WHERE c.workspace_id IN (SELECT workspace_id FROM workspace_memberships WHERE profile_id=NEW.id) LOOP
   PERFORM atlas_private.comm_rotate(r.id);
  END LOOP;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER comm_rotate_organization_scope AFTER UPDATE OF deleted_at ON organizations FOR EACH ROW EXECUTE FUNCTION atlas_private.comm_rotate_on_scope_archive();
CREATE TRIGGER comm_rotate_workspace_scope AFTER UPDATE OF deleted_at ON workspaces FOR EACH ROW EXECUTE FUNCTION atlas_private.comm_rotate_on_scope_archive();
CREATE TRIGGER comm_rotate_profile_scope AFTER UPDATE OF deleted_at ON profiles FOR EACH ROW EXECUTE FUNCTION atlas_private.comm_rotate_on_scope_archive();

-- ------------------------------------------------- restricted management
-- At least one MANAGER row always exists for a RESTRICTED channel, whatever
-- the write path (the A04 member.add upsert could demote the last manager).
CREATE FUNCTION atlas_private.comm_keep_manager() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 IF OLD.role='MANAGER' AND EXISTS(SELECT 1 FROM channels WHERE id=OLD.channel_id AND visibility='RESTRICTED')
  AND NOT EXISTS(SELECT 1 FROM channel_members WHERE channel_id=OLD.channel_id AND role='MANAGER') THEN
  RAISE EXCEPTION 'CONFLICT';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER comm_keep_manager AFTER UPDATE OF role OR DELETE ON channel_members
 DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION atlas_private.comm_keep_manager();

-- A restricted channel is orphaned when no MANAGER can still manage it
-- (every manager lost project write access or left the hierarchy).
CREATE FUNCTION atlas_private.comm_channel_managed(ch uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM channel_members WHERE channel_id=ch AND role='MANAGER'
  AND atlas_private.channel_allowed(profile_id,ch,'channel.manage'))
$$;

-- Owner-only discovery of orphaned restricted channels: identity, name and
-- the members eligible for appointment. No messages, descriptions or counts.
CREATE FUNCTION atlas_private.channel_recovery(p uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 IF NOT coalesce(atlas_private.allowed(atlas_private.actor(),'project',p,'project.update'),false) THEN RETURN '[]'::jsonb; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'eligible',
   coalesce((SELECT jsonb_agg(cm.profile_id ORDER BY cm.created_at) FROM channel_members cm WHERE cm.channel_id=c.id
    AND coalesce(atlas_private.allowed(cm.profile_id,'project',c.project_id,'project.write'),false)),'[]'::jsonb)) ORDER BY c.name)
  FROM channels c WHERE c.project_id=p AND c.visibility='RESTRICTED' AND NOT atlas_private.comm_channel_managed(c.id)),'[]'::jsonb);
END $$;

-- Explicit, audited recovery. The appointee is an existing member who can
-- still write to the project, or — only if the owner names themself — the
-- owner, who then gains access visibly (member list, audit trail).
CREATE FUNCTION atlas_private.mutate_comm_recovery(cmd text, input jsonb, request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor uuid:=atlas_private.actor(); v_ch channels%ROWTYPE; v_profile uuid; BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
 IF cmd<>'channel.recover' OR jsonb_typeof(input)<>'object' THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 PERFORM pg_advisory_xact_lock_shared(71001,1);
 SELECT * INTO v_ch FROM channels WHERE id=(input->>'id')::uuid FOR UPDATE;
 IF v_ch.id IS NULL OR NOT coalesce(atlas_private.allowed(actor,'project',v_ch.project_id,'project.update'),false) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF v_ch.visibility<>'RESTRICTED' THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 -- Never a bypass: a channel someone can still manage is not recoverable.
 IF atlas_private.comm_channel_managed(v_ch.id) THEN RAISE EXCEPTION 'CONFLICT'; END IF;
 v_profile:=(input->>'profileId')::uuid;
 IF v_profile IS NULL OR NOT coalesce(atlas_private.allowed(v_profile,'project',v_ch.project_id,'project.write'),false)
  OR (v_profile<>actor AND NOT EXISTS(SELECT 1 FROM channel_members WHERE channel_id=v_ch.id AND profile_id=v_profile)) THEN
  RAISE EXCEPTION 'VALIDATION_ERROR';
 END IF;
 INSERT INTO channel_members(organization_id,workspace_id,project_id,channel_id,profile_id,role,added_by_id)
  VALUES(v_ch.organization_id,v_ch.workspace_id,v_ch.project_id,v_ch.id,v_profile,'MANAGER',actor)
  ON CONFLICT (channel_id,profile_id) DO UPDATE SET role='MANAGER',updated_at=now();
 PERFORM atlas_private.comm_notify(v_profile,'CHANNEL_ADDED',v_ch.project_id,v_ch.id,NULL,NULL,'channel-recovered:'||v_ch.id::text||':'||request_id::text);
 SELECT * INTO v_ch FROM channels WHERE id=v_ch.id;
 PERFORM atlas_private.comm_emit(atlas_private.comm_topic(v_ch),'channel.changed',jsonb_build_object('channelId',v_ch.id,'version',v_ch.version));
 INSERT INTO audit_events(id,organization_id,actor_id,action,resource_id,request_id)
  VALUES(gen_random_uuid(),v_ch.organization_id,actor,cmd,v_ch.id,request_id);
 RETURN jsonb_build_object('id',v_ch.id);
END $$;

-- Extend the single command boundary exactly like earlier phases.
ALTER FUNCTION atlas_private.mutate(text,jsonb,uuid) RENAME TO mutate_a04;
REVOKE EXECUTE ON FUNCTION atlas_private.mutate_a04(text,jsonb,uuid) FROM atlas_runtime;
CREATE FUNCTION atlas_private.mutate(command text,input jsonb,request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 IF command='channel.recover' THEN RETURN atlas_private.mutate_comm_recovery(command,input,request_id); END IF;
 RETURN atlas_private.mutate_a04(command,input,request_id);
END $$;

-- ------------------------------------------------------------------ grants
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA atlas_private FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('REVOKE ALL ON FUNCTION atlas_private.mutate(text,jsonb,uuid),atlas_private.mutate_a04(text,jsonb,uuid),atlas_private.mutate_comm_recovery(text,jsonb,uuid),atlas_private.comm_outbox_health(),atlas_private.channel_recovery(uuid),atlas_private.comm_channel_managed(uuid) FROM %I',r);
  END IF;
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION atlas_private.mutate(text,jsonb,uuid),atlas_private.channel_recovery(uuid) TO atlas_runtime;
