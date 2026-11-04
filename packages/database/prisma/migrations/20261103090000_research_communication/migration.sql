-- A04 research communication: project channels, durable messages/threads,
-- mentions, reactions, typed research references, notifications and a
-- transactional Realtime outbox. Additive only: no earlier table, column,
-- policy, grant or function body is changed; the command boundary is wrapped
-- exactly like earlier phases. Apply only to an identified, approved target.
--
-- Invariants enforced here rather than trusted from the web tier:
--  * every row carries its (organization, workspace, project) identity and
--    composite foreign keys keep it inside one project and one channel;
--  * a thread root is a top-level message of the SAME channel;
--  * (author, client key) is unique, and a reused key with a different
--    request hash is a CONFLICT;
--  * message bodies are bounded plain text; a tombstone erases the body;
--  * Realtime events carry identifiers only and are written to the outbox in
--    the same transaction as the durable change (persist-before-deliver).

-- ------------------------------------------------------------------ channels
CREATE TABLE channels (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL, workspace_id uuid NOT NULL, project_id uuid NOT NULL,
 name varchar(80) NOT NULL CHECK (name ~ '^[a-z0-9][a-z0-9_-]{0,79}$'),
 description varchar(500) NOT NULL DEFAULT '' CHECK (description !~ '[[:cntrl:]]'),
 visibility varchar(12) NOT NULL DEFAULT 'PROJECT' CHECK (visibility IN ('PROJECT','RESTRICTED')),
 is_default boolean NOT NULL DEFAULT false,
 created_by_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
 -- Rotated whenever an audience can shrink; it is part of the private
 -- Realtime topic, so retained subscriptions stop receiving events.
 epoch uuid NOT NULL,
 last_seq bigint NOT NULL DEFAULT 0 CHECK (last_seq>=0),
 change_seq bigint NOT NULL DEFAULT 0 CHECK (change_seq>=0),
 version integer NOT NULL DEFAULT 1,
 archived_at timestamptz(3),
 archived_by_id uuid REFERENCES profiles(id) ON DELETE RESTRICT,
 created_at timestamptz(3) NOT NULL DEFAULT now(),
 updated_at timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE (project_id,id),
 UNIQUE (project_id,name),
 CHECK (NOT is_default OR visibility='PROJECT'),
 CHECK ((archived_at IS NULL)=(archived_by_id IS NULL)),
 FOREIGN KEY (organization_id,workspace_id,project_id) REFERENCES projects(organization_id,workspace_id,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX channels_one_default ON channels(project_id) WHERE is_default;
CREATE INDEX channels_project ON channels(project_id,archived_at,name);

-- Explicit channel grants. RESTRICTED channels are readable only through a
-- row here (plus live project read access); PROJECT channels use rows for
-- "joined" state, read position and notification preference.
CREATE TABLE channel_members (
 organization_id uuid NOT NULL, workspace_id uuid NOT NULL, project_id uuid NOT NULL,
 channel_id uuid NOT NULL,
 profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
 role varchar(10) NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('MANAGER','MEMBER')),
 notify varchar(10) NOT NULL DEFAULT 'ALL' CHECK (notify IN ('ALL','MENTIONS','NONE')),
 last_read_seq bigint NOT NULL DEFAULT 0 CHECK (last_read_seq>=0),
 added_by_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
 created_at timestamptz(3) NOT NULL DEFAULT now(),
 updated_at timestamptz(3) NOT NULL DEFAULT now(),
 PRIMARY KEY (channel_id,profile_id),
 FOREIGN KEY (project_id,channel_id) REFERENCES channels(project_id,id) ON DELETE RESTRICT,
 FOREIGN KEY (organization_id,workspace_id,project_id) REFERENCES projects(organization_id,workspace_id,id) ON DELETE RESTRICT
);
CREATE INDEX channel_members_profile ON channel_members(profile_id,project_id);

-- ------------------------------------------------------------------ messages
CREATE TABLE channel_messages (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL, workspace_id uuid NOT NULL, project_id uuid NOT NULL,
 channel_id uuid NOT NULL,
 -- Stable per-channel order assigned under the channel row lock.
 seq bigint NOT NULL CHECK (seq>=1),
 -- Per-channel change cursor: bumped by every edit/delete/reaction/reply so a
 -- reconnecting client backfills exactly the rows it has not seen.
 change_seq bigint NOT NULL CHECK (change_seq>=1),
 thread_root_id uuid,
 author_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
 kind varchar(10) NOT NULL DEFAULT 'USER' CHECK (kind IN ('USER','ATLAS')),
 -- Plain text; mentions are `<@profile-uuid>` tokens. Never HTML/Markdown.
 body text NOT NULL CHECK (length(body)<=8000 AND body !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'),
 client_key uuid NOT NULL,
 request_hash char(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
 ai_run_id uuid,
 version integer NOT NULL DEFAULT 1 CHECK (version>=1),
 reply_count integer NOT NULL DEFAULT 0 CHECK (reply_count>=0),
 last_reply_at timestamptz(3),
 created_at timestamptz(3) NOT NULL DEFAULT now(),
 edited_at timestamptz(3),
 deleted_at timestamptz(3),
 deleted_by_id uuid REFERENCES profiles(id) ON DELETE RESTRICT,
 UNIQUE (channel_id,seq),
 UNIQUE (author_id,client_key),
 UNIQUE (project_id,id),
 UNIQUE (project_id,channel_id,id),
 CHECK (thread_root_id IS NULL OR thread_root_id<>id),
 CHECK ((deleted_at IS NULL)=(deleted_by_id IS NULL)),
 CHECK (deleted_at IS NOT NULL OR length(btrim(body))>=1),
 CHECK (deleted_at IS NULL OR body=''),
 CHECK ((kind='ATLAS')=(ai_run_id IS NOT NULL)),
 FOREIGN KEY (project_id,channel_id) REFERENCES channels(project_id,id) ON DELETE RESTRICT,
 -- A reply's root must be a message of this same project AND channel.
 FOREIGN KEY (project_id,channel_id,thread_root_id) REFERENCES channel_messages(project_id,channel_id,id) ON DELETE RESTRICT,
 FOREIGN KEY (project_id,ai_run_id) REFERENCES ai_runs(project_id,id) ON DELETE RESTRICT,
 FOREIGN KEY (organization_id,workspace_id,project_id) REFERENCES projects(organization_id,workspace_id,id) ON DELETE RESTRICT
);
CREATE INDEX channel_messages_timeline ON channel_messages(channel_id,seq) WHERE thread_root_id IS NULL;
CREATE INDEX channel_messages_thread ON channel_messages(thread_root_id,seq) WHERE thread_root_id IS NOT NULL;
CREATE INDEX channel_messages_changes ON channel_messages(channel_id,change_seq);

CREATE TABLE message_mentions (
 project_id uuid NOT NULL, channel_id uuid NOT NULL, message_id uuid NOT NULL,
 profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
 PRIMARY KEY (message_id,profile_id),
 FOREIGN KEY (project_id,channel_id,message_id) REFERENCES channel_messages(project_id,channel_id,id) ON DELETE RESTRICT
);
CREATE INDEX message_mentions_profile ON message_mentions(profile_id);

CREATE TABLE message_reactions (
 project_id uuid NOT NULL, channel_id uuid NOT NULL, message_id uuid NOT NULL,
 profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
 emoji varchar(16) NOT NULL CHECK (emoji IN ('thumbs_up','heart','tada','eyes','check','thinking','pray','fire')),
 created_at timestamptz(3) NOT NULL DEFAULT now(),
 PRIMARY KEY (message_id,profile_id,emoji),
 FOREIGN KEY (project_id,channel_id,message_id) REFERENCES channel_messages(project_id,channel_id,id) ON DELETE RESTRICT
);

-- Typed references to the existing artifact registry. The composite FK makes
-- a cross-project reference unrepresentable; nothing here grants access and
-- no title, abstract or quote is copied into the message.
CREATE TABLE message_references (
 project_id uuid NOT NULL, channel_id uuid NOT NULL, message_id uuid NOT NULL,
 ordinal smallint NOT NULL CHECK (ordinal BETWEEN 0 AND 9),
 artifact_id uuid NOT NULL,
 artifact_kind varchar(30) NOT NULL CHECK (artifact_kind IN ('PAPER','DOCUMENT','TASK')),
 source_version_id uuid,
 annotation_id uuid,
 page integer CHECK (page IS NULL OR page BETWEEN 1 AND 100000),
 PRIMARY KEY (message_id,ordinal),
 CHECK (source_version_id IS NULL OR artifact_kind='PAPER'),
 CHECK (annotation_id IS NULL OR source_version_id IS NOT NULL),
 CHECK (page IS NULL OR source_version_id IS NOT NULL),
 FOREIGN KEY (project_id,channel_id,message_id) REFERENCES channel_messages(project_id,channel_id,id) ON DELETE RESTRICT,
 FOREIGN KEY (project_id,artifact_id,artifact_kind) REFERENCES artifacts(project_id,id,kind) ON DELETE RESTRICT,
 FOREIGN KEY (project_id,source_version_id) REFERENCES source_versions(project_id,id) ON DELETE RESTRICT
);
CREATE INDEX message_references_artifact ON message_references(project_id,artifact_id);

-- ------------------------------------------------------------- notifications
-- Recipient-scoped, content-free rows. Text is re-derived at read time under
-- the recipient's live RLS, so revoked targets expose nothing.
CREATE TABLE notifications (
 id uuid PRIMARY KEY,
 recipient_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
 organization_id uuid NOT NULL, workspace_id uuid NOT NULL, project_id uuid NOT NULL,
 kind varchar(20) NOT NULL CHECK (kind IN ('MENTION','THREAD_REPLY','ARTIFACT_SHARED','TASK_ASSIGNED','CHANNEL_ADDED','CHANNEL_REMOVED')),
 actor_id uuid REFERENCES profiles(id) ON DELETE RESTRICT,
 channel_id uuid, message_id uuid, task_id uuid,
 dedup_key varchar(200) NOT NULL,
 created_at timestamptz(3) NOT NULL DEFAULT now(),
 read_at timestamptz(3),
 UNIQUE (recipient_id,dedup_key),
 CHECK (message_id IS NULL OR channel_id IS NOT NULL),
 FOREIGN KEY (project_id,channel_id) REFERENCES channels(project_id,id) ON DELETE RESTRICT,
 FOREIGN KEY (project_id,channel_id,message_id) REFERENCES channel_messages(project_id,channel_id,id) ON DELETE RESTRICT,
 FOREIGN KEY (project_id,task_id) REFERENCES tasks(project_id,id) ON DELETE RESTRICT,
 FOREIGN KEY (organization_id,workspace_id,project_id) REFERENCES projects(organization_id,workspace_id,id) ON DELETE RESTRICT
);
CREATE INDEX notifications_inbox ON notifications(recipient_id,created_at DESC,id DESC);
CREATE INDEX notifications_unread ON notifications(recipient_id,created_at) WHERE read_at IS NULL;

-- ------------------------------------------------------------------- outbox
-- Written in the same transaction as the durable change; dispatched to
-- Realtime only after commit. Payloads are identifiers only.
CREATE TABLE communication_outbox (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 topic varchar(200) NOT NULL CHECK (topic ~ '^atlas:(channel|user):'),
 event varchar(40) NOT NULL,
 payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object' AND octet_length(payload::text)<=1024),
 created_at timestamptz(3) NOT NULL DEFAULT now(),
 attempts integer NOT NULL DEFAULT 0,
 delivered_at timestamptz(3),
 abandoned_at timestamptz(3)
);
CREATE INDEX communication_outbox_pending ON communication_outbox(id) WHERE delivered_at IS NULL AND abandoned_at IS NULL;

-- ------------------------------------------------------------------------ RLS
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON channels,channel_members,channel_messages,message_mentions,message_reactions,message_references,notifications,communication_outbox FROM PUBLIC;
REVOKE ALL ON SEQUENCE communication_outbox_id_seq FROM PUBLIC;
-- The outbox is never readable by the runtime; only definer functions use it.
GRANT SELECT ON channels,channel_members,channel_messages,message_mentions,message_reactions,message_references,notifications TO atlas_runtime;

-- --------------------------------------------------------------- capability
-- One definition of channel access, shared by RLS, commands and the private
-- Realtime topic policy. Project access is necessary but never sufficient for
-- a RESTRICTED channel; organization/workspace administrators without a live
-- project grant fail at `allowed(...,'project.read')`.
CREATE FUNCTION atlas_private.channel_allowed(profile uuid, ch uuid, cap text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c channels%ROWTYPE; m channel_members%ROWTYPE;
BEGIN
 IF profile IS NULL OR ch IS NULL THEN RETURN false; END IF;
 SELECT * INTO c FROM channels WHERE id=ch;
 IF c.id IS NULL OR NOT coalesce(atlas_private.allowed(profile,'project',c.project_id,'project.read'),false) THEN RETURN false; END IF;
 SELECT * INTO m FROM channel_members WHERE channel_id=ch AND profile_id=profile;
 IF c.visibility='RESTRICTED' AND m.profile_id IS NULL THEN RETURN false; END IF;
 -- Strictly true/false: a NULL here would make `IF NOT ...` guards pass.
 RETURN coalesce(CASE cap
  WHEN 'channel.read' THEN true
  WHEN 'channel.post' THEN c.archived_at IS NULL AND coalesce(atlas_private.allowed(profile,'project',c.project_id,'project.write'),false)
  WHEN 'channel.manage' THEN coalesce(atlas_private.allowed(profile,'project',c.project_id,'project.write'),false)
   AND (coalesce(m.role='MANAGER',false) OR (c.visibility='PROJECT' AND coalesce(atlas_private.allowed(profile,'project',c.project_id,'project.update'),false)))
  ELSE false END,false);
END $$;
CREATE FUNCTION atlas_private.can_channel(ch uuid, cap text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(atlas_private.channel_allowed(atlas_private.actor(),ch,cap),false)
$$;
CREATE FUNCTION atlas_private.channel_capabilities(ch uuid) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(array_agg(c),ARRAY[]::text[]) FROM unnest(ARRAY['channel.read','channel.post','channel.manage']) c
 WHERE atlas_private.can_channel(ch,c)
$$;

CREATE POLICY channel_read ON channels FOR SELECT TO atlas_runtime USING (atlas_private.can_channel(id,'channel.read'));
CREATE POLICY channel_member_read ON channel_members FOR SELECT TO atlas_runtime USING (atlas_private.can_channel(channel_id,'channel.read'));
CREATE POLICY channel_message_read ON channel_messages FOR SELECT TO atlas_runtime USING (atlas_private.can_channel(channel_id,'channel.read'));
CREATE POLICY message_mention_read ON message_mentions FOR SELECT TO atlas_runtime USING (atlas_private.can_channel(channel_id,'channel.read'));
CREATE POLICY message_reaction_read ON message_reactions FOR SELECT TO atlas_runtime USING (atlas_private.can_channel(channel_id,'channel.read'));
CREATE POLICY message_reference_read ON message_references FOR SELECT TO atlas_runtime USING (atlas_private.can_channel(channel_id,'channel.read'));
CREATE POLICY notification_read ON notifications FOR SELECT TO atlas_runtime USING (recipient_id=(SELECT atlas_private.actor()));
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['channels','channel_members','channel_messages','message_mentions','message_reactions','message_references','notifications','communication_outbox'] LOOP
  EXECUTE format('CREATE POLICY deny_insert ON public.%I FOR INSERT TO atlas_runtime WITH CHECK (false)',t);
  EXECUTE format('CREATE POLICY deny_update ON public.%I FOR UPDATE TO atlas_runtime USING (false) WITH CHECK (false)',t);
  EXECUTE format('CREATE POLICY deny_delete ON public.%I FOR DELETE TO atlas_runtime USING (false)',t);
 END LOOP;
 -- Supabase default privileges grant new public tables to browser roles.
 FOREACH t IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=t) THEN
   EXECUTE format('REVOKE ALL ON public.channels,public.channel_members,public.channel_messages,public.message_mentions,public.message_reactions,public.message_references,public.notifications,public.communication_outbox FROM %I',t);
   EXECUTE format('REVOKE ALL ON SEQUENCE public.communication_outbox_id_seq FROM %I',t);
  END IF;
 END LOOP;
END $$;

-- ------------------------------------------------------------ outbox helpers
CREATE FUNCTION atlas_private.comm_topic(ch channels) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT 'atlas:channel:'||ch.id::text||':'||ch.epoch::text $$;
CREATE FUNCTION atlas_private.comm_emit(topic text, event text, payload jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 INSERT INTO communication_outbox(topic,event,payload) VALUES(topic,event,payload)
$$;
-- Ends delivery to every subscription of the current topic. Remaining
-- members re-fetch the new topic through an authorized API request.
CREATE FUNCTION atlas_private.comm_rotate(ch uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c channels%ROWTYPE; BEGIN
 SELECT * INTO c FROM channels WHERE id=ch;
 IF c.id IS NULL THEN RETURN; END IF;
 PERFORM atlas_private.comm_emit(atlas_private.comm_topic(c),'topic.rotated',jsonb_build_object('channelId',c.id));
 UPDATE channels SET epoch=gen_random_uuid() WHERE id=c.id;
END $$;
CREATE FUNCTION atlas_private.comm_notify(recipient uuid, k text, p uuid, ch uuid, msg uuid, task uuid, dedup text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE pr projects%ROWTYPE; v_id uuid; BEGIN
 IF recipient IS NULL OR recipient=atlas_private.actor() THEN RETURN; END IF;
 SELECT * INTO pr FROM projects WHERE id=p;
 INSERT INTO notifications(id,recipient_id,organization_id,workspace_id,project_id,kind,actor_id,channel_id,message_id,task_id,dedup_key)
  VALUES(gen_random_uuid(),recipient,pr.organization_id,pr.workspace_id,pr.id,k,atlas_private.actor(),ch,msg,task,dedup)
  ON CONFLICT (recipient_id,dedup_key) DO NOTHING RETURNING id INTO v_id;
 IF v_id IS NOT NULL THEN
  PERFORM atlas_private.comm_emit('atlas:user:'||recipient::text,'notification.created',jsonb_build_object('id',v_id));
 END IF;
END $$;

-- Audience-shrinking events anywhere in the hierarchy rotate the affected
-- channel topics in the same transaction as the revocation.
CREATE FUNCTION atlas_private.comm_rotate_on_revoke() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r record; BEGIN
 IF TG_TABLE_NAME='project_memberships' THEN
  FOR r IN SELECT id FROM channels WHERE project_id=OLD.project_id LOOP PERFORM atlas_private.comm_rotate(r.id); END LOOP;
 ELSIF TG_TABLE_NAME='workspace_memberships' THEN
  FOR r IN SELECT id FROM channels WHERE workspace_id=OLD.workspace_id LOOP PERFORM atlas_private.comm_rotate(r.id); END LOOP;
 ELSIF TG_TABLE_NAME='organization_memberships' THEN
  FOR r IN SELECT id FROM channels WHERE organization_id=OLD.organization_id LOOP PERFORM atlas_private.comm_rotate(r.id); END LOOP;
 ELSIF TG_TABLE_NAME='projects' THEN
  IF NEW.visibility IS DISTINCT FROM OLD.visibility OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
   FOR r IN SELECT id FROM channels WHERE project_id=OLD.id LOOP PERFORM atlas_private.comm_rotate(r.id); END LOOP;
  END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER comm_rotate_project_member AFTER DELETE ON project_memberships FOR EACH ROW EXECUTE FUNCTION atlas_private.comm_rotate_on_revoke();
CREATE TRIGGER comm_rotate_workspace_member AFTER DELETE ON workspace_memberships FOR EACH ROW EXECUTE FUNCTION atlas_private.comm_rotate_on_revoke();
CREATE TRIGGER comm_rotate_organization_member AFTER DELETE ON organization_memberships FOR EACH ROW EXECUTE FUNCTION atlas_private.comm_rotate_on_revoke();
CREATE TRIGGER comm_rotate_project_scope AFTER UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION atlas_private.comm_rotate_on_revoke();

-- Trustworthy task event: assignment is observed inside the task write itself.
CREATE FUNCTION atlas_private.comm_task_assigned() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 IF NEW.assignee_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id) THEN
  PERFORM atlas_private.comm_notify(NEW.assignee_id,'TASK_ASSIGNED',NEW.project_id,NULL,NULL,NEW.id,'task-assigned:'||NEW.id::text||':'||NEW.version::text);
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER comm_task_assigned AFTER INSERT OR UPDATE OF assignee_id ON tasks FOR EACH ROW EXECUTE FUNCTION atlas_private.comm_task_assigned();

-- ------------------------------------------------------------ message helpers
CREATE FUNCTION atlas_private.comm_body(v text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE visible text; BEGIN
 IF v IS NULL OR length(btrim(v))=0 OR v ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 -- 4,000 visible characters; each mention token counts as one character.
 visible:=regexp_replace(v,'<@[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}>','@','g');
 IF length(visible)>4000 OR length(v)>8000 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 RETURN btrim(v);
END $$;

-- Mentions are server-parsed stable IDs. Every mentioned person must be able
-- to read this channel now; outsiders cannot be enumerated or notified.
CREATE FUNCTION atlas_private.comm_mentions(c channels, body text) RETURNS uuid[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ids uuid[]; v uuid; BEGIN
 SELECT coalesce(array_agg(DISTINCT m[1]::uuid),ARRAY[]::uuid[]) INTO ids
  FROM regexp_matches(body,'<@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})>','g') m;
 IF cardinality(ids)>20 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 FOREACH v IN ARRAY ids LOOP
  IF NOT atlas_private.channel_allowed(v,c.id,'channel.read') THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 END LOOP;
 RETURN ids;
END $$;

-- Typed research references: same project, active, and any page/annotation
-- must be a READY version / PROJECT-visible annotation of that same paper.
-- Private annotations cannot be shared through a message.
CREATE FUNCTION atlas_private.comm_references(c channels, msg uuid, refs jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r jsonb; n integer:=0; a artifacts%ROWTYPE; sv source_versions%ROWTYPE; an paper_annotations%ROWTYPE; v_page integer; seen uuid[]:=ARRAY[]::uuid[];
BEGIN
 IF refs IS NULL OR jsonb_typeof(refs)='null' THEN RETURN 0; END IF;
 IF jsonb_typeof(refs)<>'array' OR jsonb_array_length(refs)>10 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(refs) LOOP
  IF jsonb_typeof(r)<>'object' THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
  SELECT * INTO a FROM artifacts WHERE id=(r->>'artifactId')::uuid AND project_id=c.project_id;
  -- Foreign and missing artifacts are indistinguishable.
  IF a.id IS NULL OR a.kind NOT IN ('PAPER','DOCUMENT','TASK') THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT atlas_private.artifact_active(a.id) THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  sv:=NULL; an:=NULL; v_page:=NULL;
  IF r->>'sourceVersionId' IS NOT NULL THEN
   IF a.kind<>'PAPER' THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
   SELECT s.* INTO sv FROM source_versions s JOIN project_papers pp ON pp.id=s.project_paper_id
    WHERE s.id=(r->>'sourceVersionId')::uuid AND s.project_id=c.project_id AND pp.artifact_id=a.id AND s.state='READY';
   IF sv.id IS NULL THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
   v_page:=(r->>'page')::integer;
   IF r->>'annotationId' IS NOT NULL THEN
    SELECT * INTO an FROM paper_annotations WHERE id=(r->>'annotationId')::uuid AND source_version_id=sv.id
     AND deleted_at IS NULL AND visibility='PROJECT';
    IF an.id IS NULL THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
    IF v_page IS NULL THEN v_page:=(an.anchor->>'pageNumber')::integer;
    ELSIF v_page IS DISTINCT FROM (an.anchor->>'pageNumber')::integer THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
   END IF;
  ELSIF r->>'annotationId' IS NOT NULL OR r->>'page' IS NOT NULL THEN
   RAISE EXCEPTION 'VALIDATION_ERROR';
  END IF;
  IF a.id=ANY(seen) AND sv.id IS NULL THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
  seen:=seen||a.id;
  INSERT INTO message_references(project_id,channel_id,message_id,ordinal,artifact_id,artifact_kind,source_version_id,annotation_id,page)
   VALUES(c.project_id,c.id,msg,n,a.id,a.kind,sv.id,an.id,v_page);
  n:=n+1;
 END LOOP;
 RETURN n;
END $$;

-- ------------------------------------------------------------ fixed commands
CREATE FUNCTION atlas_private.mutate_communication(cmd text, input jsonb, request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
 actor uuid:=atlas_private.actor(); v_result jsonb; v_replay jsonb; v_key uuid; v_hash text; v_target uuid; v_project uuid;
 v_pr projects%ROWTYPE; v_ch channels%ROWTYPE; v_m channel_messages%ROWTYPE; v_root channel_messages%ROWTYPE;
 v_member channel_members%ROWTYPE; v_body text; v_mentions uuid[]; v_refs integer; v_seq bigint; v_change bigint;
 v_profile uuid; v_recipient record; v_audit boolean:=true; v_n integer;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
 IF jsonb_typeof(input)<>'object' OR octet_length(input::text)>40000 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=actor AND deleted_at IS NULL) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 -- Never interleaved with a revocation's capability change (exclusive 71001).
 PERFORM pg_advisory_xact_lock_shared(71001,1);
 v_key:=CASE WHEN input ? 'idempotencyKey' THEN (input->>'idempotencyKey')::uuid END;
 v_hash:=input->>'requestHash';

 IF cmd='channel.create' THEN
  SELECT * INTO v_pr FROM projects WHERE id=(input->>'projectId')::uuid;
  PERFORM atlas_private.require_cap('project',v_pr.id,'project.write');
  v_replay:=atlas_private.research_replay(actor,v_key,cmd,v_hash);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF coalesce(input->>'visibility','PROJECT') NOT IN ('PROJECT','RESTRICTED') THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
  IF coalesce(input->>'name','') !~ '^[a-z0-9][a-z0-9_-]{0,79}$' OR length(coalesce(input->>'description',''))>500 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
  IF EXISTS(SELECT 1 FROM channels WHERE project_id=v_pr.id AND name=input->>'name') THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  IF coalesce((input->>'isDefault')::boolean,false) AND EXISTS(SELECT 1 FROM channels WHERE project_id=v_pr.id AND is_default) THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  INSERT INTO channels(id,organization_id,workspace_id,project_id,name,description,visibility,is_default,created_by_id,epoch)
   VALUES(gen_random_uuid(),v_pr.organization_id,v_pr.workspace_id,v_pr.id,input->>'name',btrim(coalesce(input->>'description','')),
    coalesce(input->>'visibility','PROJECT'),coalesce((input->>'isDefault')::boolean,false),actor,gen_random_uuid()) RETURNING * INTO v_ch;
  INSERT INTO channel_members(organization_id,workspace_id,project_id,channel_id,profile_id,role,added_by_id)
   VALUES(v_ch.organization_id,v_ch.workspace_id,v_ch.project_id,v_ch.id,actor,'MANAGER',actor);
  v_target:=v_pr.id;
  v_result:=atlas_private.research_remember(actor,v_key,cmd,v_hash,jsonb_build_object('id',v_ch.id));

 ELSIF cmd IN ('channel.update','channel.archive','channel.restore') THEN
  SELECT * INTO v_ch FROM channels WHERE id=(input->>'id')::uuid FOR UPDATE;
  IF NOT atlas_private.can_channel(v_ch.id,'channel.read') THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT atlas_private.can_channel(v_ch.id,'channel.manage') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_ch.version IS DISTINCT FROM (input->>'expectedVersion')::integer THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  IF cmd='channel.update' THEN
   IF v_ch.archived_at IS NOT NULL THEN RAISE EXCEPTION 'CONFLICT'; END IF;
   IF input ? 'name' AND (coalesce(input->>'name','') !~ '^[a-z0-9][a-z0-9_-]{0,79}$'
    OR EXISTS(SELECT 1 FROM channels WHERE project_id=v_ch.project_id AND name=input->>'name' AND id<>v_ch.id)) THEN RAISE EXCEPTION 'CONFLICT'; END IF;
   IF input ? 'description' AND (length(coalesce(input->>'description',''))>500 OR coalesce(input->>'description','') ~ '[[:cntrl:]]') THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
   UPDATE channels SET name=CASE WHEN input ? 'name' THEN input->>'name' ELSE name END,
    description=CASE WHEN input ? 'description' THEN btrim(coalesce(input->>'description','')) ELSE description END,
    version=version+1,updated_at=now() WHERE id=v_ch.id;
  ELSE
   IF (cmd='channel.restore')<>(v_ch.archived_at IS NOT NULL) THEN RAISE EXCEPTION 'CONFLICT'; END IF;
   UPDATE channels SET archived_at=CASE WHEN cmd='channel.archive' THEN now() END,
    archived_by_id=CASE WHEN cmd='channel.archive' THEN actor END,version=version+1,updated_at=now() WHERE id=v_ch.id;
  END IF;
  SELECT * INTO v_ch FROM channels WHERE id=v_ch.id;
  PERFORM atlas_private.comm_emit(atlas_private.comm_topic(v_ch),'channel.changed',jsonb_build_object('channelId',v_ch.id,'version',v_ch.version));
  v_target:=v_ch.project_id; v_result:=jsonb_build_object('id',v_ch.id,'version',v_ch.version);

 ELSIF cmd IN ('channel.join','channel.leave') THEN
  SELECT * INTO v_ch FROM channels WHERE id=(input->>'id')::uuid FOR UPDATE;
  IF NOT atlas_private.can_channel(v_ch.id,'channel.read') THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  -- Joining never grants access: only already-readable PROJECT channels.
  IF v_ch.visibility<>'PROJECT' AND cmd='channel.join' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF cmd='channel.join' THEN
   INSERT INTO channel_members(organization_id,workspace_id,project_id,channel_id,profile_id,role,added_by_id,last_read_seq)
    VALUES(v_ch.organization_id,v_ch.workspace_id,v_ch.project_id,v_ch.id,actor,'MEMBER',actor,v_ch.last_seq) ON CONFLICT DO NOTHING;
  ELSE
   SELECT * INTO v_member FROM channel_members WHERE channel_id=v_ch.id AND profile_id=actor FOR UPDATE;
   IF v_member.profile_id IS NOT NULL THEN
    -- The last manager of a restricted channel cannot orphan it.
    IF v_ch.visibility='RESTRICTED' AND v_member.role='MANAGER'
     AND NOT EXISTS(SELECT 1 FROM channel_members WHERE channel_id=v_ch.id AND role='MANAGER' AND profile_id<>actor) THEN RAISE EXCEPTION 'CONFLICT'; END IF;
    DELETE FROM channel_members WHERE channel_id=v_ch.id AND profile_id=actor;
    IF v_ch.visibility='RESTRICTED' THEN PERFORM atlas_private.comm_rotate(v_ch.id); END IF;
   END IF;
  END IF;
  v_audit:=false; v_target:=v_ch.project_id; v_result:=jsonb_build_object('id',v_ch.id);

 ELSIF cmd IN ('channel.member.add','channel.member.remove') THEN
  SELECT * INTO v_ch FROM channels WHERE id=(input->>'id')::uuid FOR UPDATE;
  IF NOT atlas_private.can_channel(v_ch.id,'channel.read') THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT atlas_private.can_channel(v_ch.id,'channel.manage') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  v_profile:=(input->>'profileId')::uuid;
  IF cmd='channel.member.add' THEN
   IF v_ch.archived_at IS NOT NULL THEN RAISE EXCEPTION 'CONFLICT'; END IF;
   -- Grants go only to people who can independently read the project.
   IF v_profile IS NULL OR NOT coalesce(atlas_private.allowed(v_profile,'project',v_ch.project_id,'project.read'),false) THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
   IF coalesce(input->>'role','MEMBER') NOT IN ('MANAGER','MEMBER') THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
   INSERT INTO channel_members(organization_id,workspace_id,project_id,channel_id,profile_id,role,added_by_id)
    VALUES(v_ch.organization_id,v_ch.workspace_id,v_ch.project_id,v_ch.id,v_profile,coalesce(input->>'role','MEMBER'),actor)
    ON CONFLICT (channel_id,profile_id) DO UPDATE SET role=EXCLUDED.role,updated_at=now();
   PERFORM atlas_private.comm_notify(v_profile,'CHANNEL_ADDED',v_ch.project_id,v_ch.id,NULL,NULL,'channel-added:'||v_ch.id::text||':'||request_id::text);
  ELSE
   SELECT * INTO v_member FROM channel_members WHERE channel_id=v_ch.id AND profile_id=v_profile FOR UPDATE;
   IF v_member.profile_id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
   IF v_member.role='MANAGER' AND NOT EXISTS(SELECT 1 FROM channel_members WHERE channel_id=v_ch.id AND role='MANAGER' AND profile_id<>v_profile)
    AND v_ch.visibility='RESTRICTED' THEN RAISE EXCEPTION 'CONFLICT'; END IF;
   DELETE FROM channel_members WHERE channel_id=v_ch.id AND profile_id=v_profile;
   -- Close every retained subscription before anything new is delivered.
   PERFORM atlas_private.comm_rotate(v_ch.id);
   IF v_ch.visibility='RESTRICTED' THEN
    PERFORM atlas_private.comm_notify(v_profile,'CHANNEL_REMOVED',v_ch.project_id,v_ch.id,NULL,NULL,'channel-removed:'||v_ch.id::text||':'||request_id::text);
   END IF;
  END IF;
  SELECT * INTO v_ch FROM channels WHERE id=v_ch.id;
  PERFORM atlas_private.comm_emit(atlas_private.comm_topic(v_ch),'channel.changed',jsonb_build_object('channelId',v_ch.id,'version',v_ch.version));
  v_target:=v_ch.project_id; v_result:=jsonb_build_object('id',v_ch.id);

 ELSIF cmd IN ('channel.read','channel.preferences') THEN
  SELECT * INTO v_ch FROM channels WHERE id=(input->>'id')::uuid;
  IF NOT atlas_private.can_channel(v_ch.id,'channel.read') THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF cmd='channel.read' THEN
   -- Idempotent and monotonic; never beyond the committed sequence.
   UPDATE channel_members SET last_read_seq=GREATEST(last_read_seq,LEAST(coalesce((input->>'seq')::bigint,0),v_ch.last_seq)),updated_at=now()
    WHERE channel_id=v_ch.id AND profile_id=actor;
  ELSE
   IF input->>'notify' NOT IN ('ALL','MENTIONS','NONE') THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
   UPDATE channel_members SET notify=input->>'notify',updated_at=now() WHERE channel_id=v_ch.id AND profile_id=actor;
   IF NOT FOUND THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  END IF;
  v_audit:=false; v_target:=v_ch.project_id; v_result:=jsonb_build_object('id',v_ch.id);

 ELSIF cmd='message.send' THEN
  SELECT * INTO v_ch FROM channels WHERE id=(input->>'channelId')::uuid FOR UPDATE;
  IF NOT atlas_private.can_channel(v_ch.id,'channel.read') THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_ch.archived_at IS NOT NULL THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  IF NOT atlas_private.can_channel(v_ch.id,'channel.post') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_key IS NULL OR v_hash IS NULL OR v_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
  -- A lost response is retried with the same key: same intent returns the
  -- committed message; different content under the key is a conflict.
  SELECT * INTO v_m FROM channel_messages WHERE author_id=actor AND client_key=v_key;
  IF v_m.id IS NOT NULL THEN
   IF v_m.request_hash<>v_hash OR v_m.channel_id<>v_ch.id THEN RAISE EXCEPTION 'CONFLICT'; END IF;
   RETURN jsonb_build_object('id',v_m.id,'seq',v_m.seq,'changeSeq',v_m.change_seq,'replayed',true);
  END IF;
  IF input->>'aiRunId' IS NOT NULL THEN
   PERFORM atlas_private.require_completed_run((input->>'aiRunId')::uuid,v_ch.project_id);
  END IF;
  v_body:=atlas_private.comm_body(input->>'body');
  v_mentions:=atlas_private.comm_mentions(v_ch,v_body);
  IF input->>'threadRootId' IS NOT NULL THEN
   SELECT * INTO v_root FROM channel_messages WHERE id=(input->>'threadRootId')::uuid FOR UPDATE;
   -- Threads never cross channels or projects, and never nest.
   IF v_root.id IS NULL OR v_root.channel_id<>v_ch.id OR v_root.project_id<>v_ch.project_id THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
   IF v_root.thread_root_id IS NOT NULL THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
   IF v_root.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  END IF;
  v_seq:=v_ch.last_seq+1; v_change:=v_ch.change_seq+1;
  INSERT INTO channel_messages(id,organization_id,workspace_id,project_id,channel_id,seq,change_seq,thread_root_id,author_id,kind,body,client_key,request_hash,ai_run_id)
   VALUES(gen_random_uuid(),v_ch.organization_id,v_ch.workspace_id,v_ch.project_id,v_ch.id,v_seq,v_change,v_root.id,actor,
    CASE WHEN input->>'aiRunId' IS NULL THEN 'USER' ELSE 'ATLAS' END,v_body,v_key,v_hash,(input->>'aiRunId')::uuid) RETURNING * INTO v_m;
  INSERT INTO message_mentions(project_id,channel_id,message_id,profile_id) SELECT v_ch.project_id,v_ch.id,v_m.id,u FROM unnest(v_mentions) u;
  v_refs:=atlas_private.comm_references(v_ch,v_m.id,input->'references');
  IF v_root.id IS NOT NULL THEN
   v_change:=v_change+1;
   UPDATE channel_messages SET reply_count=reply_count+1,last_reply_at=v_m.created_at,change_seq=v_change WHERE id=v_root.id;
  END IF;
  UPDATE channels SET last_seq=v_seq,change_seq=v_change WHERE id=v_ch.id;
  UPDATE channel_members SET last_read_seq=GREATEST(last_read_seq,v_seq) WHERE channel_id=v_ch.id AND profile_id=actor AND v_root.id IS NULL;
  -- One logical event, one notification per recipient (dedup by message).
  FOR v_recipient IN
   SELECT u AS id FROM unnest(v_mentions) u
   WHERE NOT EXISTS(SELECT 1 FROM channel_members cm WHERE cm.channel_id=v_ch.id AND cm.profile_id=u AND cm.notify='NONE')
  LOOP
   PERFORM atlas_private.comm_notify(v_recipient.id,CASE WHEN v_refs>0 THEN 'ARTIFACT_SHARED' ELSE 'MENTION' END,
    v_ch.project_id,v_ch.id,v_m.id,NULL,'message:'||v_m.id::text);
  END LOOP;
  IF v_root.id IS NOT NULL THEN
   FOR v_recipient IN
    SELECT DISTINCT x.author_id AS id FROM channel_messages x
    WHERE (x.id=v_root.id OR x.thread_root_id=v_root.id) AND x.kind='USER' AND x.deleted_at IS NULL
     AND NOT (x.author_id=ANY(v_mentions))
     AND atlas_private.channel_allowed(x.author_id,v_ch.id,'channel.read')
     AND NOT EXISTS(SELECT 1 FROM channel_members cm WHERE cm.channel_id=v_ch.id AND cm.profile_id=x.author_id AND cm.notify<>'ALL')
   LOOP
    PERFORM atlas_private.comm_notify(v_recipient.id,'THREAD_REPLY',v_ch.project_id,v_ch.id,v_m.id,NULL,'message:'||v_m.id::text);
   END LOOP;
  END IF;
  PERFORM atlas_private.comm_emit(atlas_private.comm_topic(v_ch),'message.created',
   jsonb_build_object('channelId',v_ch.id,'id',v_m.id,'seq',v_seq,'changeSeq',v_change,'threadRootId',v_root.id));
  v_audit:=false; v_target:=v_ch.project_id;
  v_result:=jsonb_build_object('id',v_m.id,'seq',v_seq,'changeSeq',v_change);

 ELSIF cmd IN ('message.edit','message.delete') THEN
  SELECT * INTO v_m FROM channel_messages WHERE id=(input->>'id')::uuid;
  IF v_m.id IS NULL OR NOT atlas_private.can_channel(v_m.channel_id,'channel.read') THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO v_ch FROM channels WHERE id=v_m.channel_id FOR UPDATE;
  SELECT * INTO v_m FROM channel_messages WHERE id=v_m.id FOR UPDATE;
  -- Only the author edits or deletes; archived channels are read-only.
  IF v_m.author_id<>actor OR v_m.kind<>'USER' AND cmd='message.edit' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF NOT atlas_private.can_channel(v_ch.id,'channel.post') THEN
   IF v_ch.archived_at IS NOT NULL THEN RAISE EXCEPTION 'CONFLICT'; END IF;
   RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF v_m.deleted_at IS NOT NULL THEN
   IF cmd='message.delete' THEN RETURN jsonb_build_object('id',v_m.id,'version',v_m.version,'changeSeq',v_m.change_seq,'replayed',true); END IF;
   RAISE EXCEPTION 'CONFLICT';
  END IF;
  IF cmd='message.edit' THEN
   v_body:=atlas_private.comm_body(input->>'body');
   IF v_m.version IS DISTINCT FROM (input->>'expectedVersion')::integer THEN
    -- A retried edit whose result is already committed is not a conflict.
    IF v_m.version=(input->>'expectedVersion')::integer+1 AND v_m.body=v_body THEN
     RETURN jsonb_build_object('id',v_m.id,'version',v_m.version,'changeSeq',v_m.change_seq,'replayed',true);
    END IF;
    RAISE EXCEPTION 'CONFLICT';
   END IF;
   v_mentions:=atlas_private.comm_mentions(v_ch,v_body);
   v_change:=v_ch.change_seq+1;
   UPDATE channel_messages SET body=v_body,version=version+1,edited_at=now(),change_seq=v_change WHERE id=v_m.id;
   -- New mentions notify once; removed mentions stop rendering.
   DELETE FROM message_mentions WHERE message_id=v_m.id AND NOT (profile_id=ANY(v_mentions));
   INSERT INTO message_mentions(project_id,channel_id,message_id,profile_id)
    SELECT v_ch.project_id,v_ch.id,v_m.id,u FROM unnest(v_mentions) u ON CONFLICT DO NOTHING;
   FOR v_recipient IN SELECT u AS id FROM unnest(v_mentions) u
    WHERE NOT EXISTS(SELECT 1 FROM channel_members cm WHERE cm.channel_id=v_ch.id AND cm.profile_id=u AND cm.notify='NONE') LOOP
    PERFORM atlas_private.comm_notify(v_recipient.id,'MENTION',v_ch.project_id,v_ch.id,v_m.id,NULL,'message:'||v_m.id::text);
   END LOOP;
  ELSE
   IF v_m.version IS DISTINCT FROM (input->>'expectedVersion')::integer THEN RAISE EXCEPTION 'CONFLICT'; END IF;
   v_change:=v_ch.change_seq+1;
   -- Tombstone: identity, order and thread structure remain; content does not.
   DELETE FROM message_mentions WHERE message_id=v_m.id;
   DELETE FROM message_reactions WHERE message_id=v_m.id;
   DELETE FROM message_references WHERE message_id=v_m.id;
   UPDATE channel_messages SET body='',version=version+1,deleted_at=now(),deleted_by_id=actor,change_seq=v_change WHERE id=v_m.id;
   IF v_m.thread_root_id IS NOT NULL THEN
    v_change:=v_change+1;
    UPDATE channel_messages SET reply_count=GREATEST(reply_count-1,0),change_seq=v_change WHERE id=v_m.thread_root_id;
   END IF;
  END IF;
  UPDATE channels SET change_seq=v_change WHERE id=v_ch.id;
  SELECT * INTO v_m FROM channel_messages WHERE id=v_m.id;
  PERFORM atlas_private.comm_emit(atlas_private.comm_topic(v_ch),'message.changed',
   jsonb_build_object('channelId',v_ch.id,'id',v_m.id,'version',v_m.version,'changeSeq',v_change));
  v_audit:=(cmd='message.delete'); v_target:=v_ch.project_id;
  v_result:=jsonb_build_object('id',v_m.id,'version',v_m.version,'changeSeq',v_change);

 ELSIF cmd='reaction.set' THEN
  SELECT * INTO v_m FROM channel_messages WHERE id=(input->>'messageId')::uuid;
  IF v_m.id IS NULL OR NOT atlas_private.can_channel(v_m.channel_id,'channel.read') THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO v_ch FROM channels WHERE id=v_m.channel_id FOR UPDATE;
  IF v_ch.archived_at IS NOT NULL THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  IF NOT atlas_private.can_channel(v_ch.id,'channel.post') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_m.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  IF input->>'emoji' NOT IN ('thumbs_up','heart','tada','eyes','check','thinking','pray','fire') OR jsonb_typeof(input->'active')<>'boolean' THEN
   RAISE EXCEPTION 'VALIDATION_ERROR';
  END IF;
  IF (input->>'active')::boolean THEN
   INSERT INTO message_reactions(project_id,channel_id,message_id,profile_id,emoji) VALUES(v_ch.project_id,v_ch.id,v_m.id,actor,input->>'emoji')
    ON CONFLICT DO NOTHING;
  ELSE
   DELETE FROM message_reactions WHERE message_id=v_m.id AND profile_id=actor AND emoji=input->>'emoji';
  END IF;
  GET DIAGNOSTICS v_n=ROW_COUNT;
  v_change:=v_ch.change_seq;
  -- Idempotent: an unchanged set does not advance the cursor or emit.
  IF v_n>0 THEN
   v_change:=v_ch.change_seq+1;
   UPDATE channel_messages SET change_seq=v_change WHERE id=v_m.id;
   UPDATE channels SET change_seq=v_change WHERE id=v_ch.id;
   PERFORM atlas_private.comm_emit(atlas_private.comm_topic(v_ch),'message.changed',
    jsonb_build_object('channelId',v_ch.id,'id',v_m.id,'version',v_m.version,'changeSeq',v_change));
  END IF;
  v_audit:=false; v_target:=v_ch.project_id;
  v_result:=jsonb_build_object('id',v_m.id,'changeSeq',v_change,'changed',v_n>0);

 ELSIF cmd IN ('notification.read','notification.read-all') THEN
  -- Recipient-only and idempotent; already-read rows keep their timestamp.
  IF cmd='notification.read' THEN
   IF jsonb_typeof(input->'ids')<>'array' OR jsonb_array_length(input->'ids') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
   UPDATE notifications SET read_at=now() WHERE recipient_id=actor AND read_at IS NULL
    AND id IN (SELECT (value#>>'{}')::uuid FROM jsonb_array_elements(input->'ids'));
  ELSE
   UPDATE notifications SET read_at=now() WHERE recipient_id=actor AND read_at IS NULL
    AND created_at<=coalesce((input->>'before')::timestamptz,now());
  END IF;
  GET DIAGNOSTICS v_n=ROW_COUNT;
  IF v_n>0 THEN PERFORM atlas_private.comm_emit('atlas:user:'||actor::text,'notification.read',jsonb_build_object('count',v_n)); END IF;
  RETURN jsonb_build_object('id',actor,'updated',v_n);
 ELSE RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;

 -- Safe audit metadata only for management and deletion; never content.
 IF v_audit THEN
  INSERT INTO audit_events(id,organization_id,actor_id,action,resource_id,request_id)
   VALUES(gen_random_uuid(),(SELECT organization_id FROM projects WHERE id=v_target),actor,cmd,(v_result->>'id')::uuid,request_id);
 END IF;
 RETURN v_result;
END $$;

-- Extend the single command boundary without editing reviewed functions.
ALTER FUNCTION atlas_private.mutate(text,jsonb,uuid) RENAME TO mutate_a03;
REVOKE EXECUTE ON FUNCTION atlas_private.mutate_a03(text,jsonb,uuid) FROM atlas_runtime;
CREATE FUNCTION atlas_private.mutate(command text,input jsonb,request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 IF command IN ('channel.create','channel.update','channel.archive','channel.restore','channel.join','channel.leave',
  'channel.member.add','channel.member.remove','channel.read','channel.preferences','message.send','message.edit',
  'message.delete','reaction.set','notification.read','notification.read-all') THEN
  RETURN atlas_private.mutate_communication(command,input,request_id);
 END IF;
 RETURN atlas_private.mutate_a03(command,input,request_id);
END $$;

-- ----------------------------------------------------------------- delivery
-- Called after commit by the web tier. Pushes queued identifier-only events
-- to Supabase Realtime private topics when Realtime is installed; durable
-- rows never depend on this succeeding. Each row is attempted independently.
CREATE FUNCTION atlas_private.comm_dispatch(maximum integer) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r communication_outbox%ROWTYPE; n integer:=0; BEGIN
 IF maximum IS NULL OR maximum NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NOT NULL THEN
  FOR r IN SELECT * FROM communication_outbox WHERE delivered_at IS NULL AND abandoned_at IS NULL ORDER BY id LIMIT maximum FOR UPDATE SKIP LOCKED LOOP
   BEGIN
    EXECUTE 'SELECT realtime.send($1,$2,$3,true)' USING r.payload,r.event,r.topic;
    UPDATE communication_outbox SET delivered_at=now(),attempts=attempts+1 WHERE id=r.id;
    n:=n+1;
   EXCEPTION WHEN others THEN
    UPDATE communication_outbox SET attempts=attempts+1,abandoned_at=CASE WHEN attempts+1>=5 THEN now() END WHERE id=r.id;
   END;
  END LOOP;
 END IF;
 -- Events are ephemeral hints; the database cursor is the recovery path.
 DELETE FROM communication_outbox WHERE id IN (SELECT id FROM communication_outbox
  WHERE created_at<now()-interval '1 day' OR delivered_at<now()-interval '1 hour' ORDER BY id LIMIT 1000);
 RETURN n;
END $$;

-- ------------------------------------------------- private Realtime policy
-- A separate, non-API schema holds the single function the Realtime
-- `authenticated` role may execute. It reads only the verified JWT claims
-- Realtime sets, and answers for exactly one topic.
CREATE SCHEMA atlas_realtime;
REVOKE ALL ON SCHEMA atlas_realtime FROM PUBLIC;
CREATE FUNCTION atlas_realtime.topic_allowed(topic text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE claims jsonb; sub uuid; m text[];
 uuid_re constant text:='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
BEGIN
 BEGIN
  claims:=nullif(current_setting('request.jwt.claims',true),'')::jsonb;
 EXCEPTION WHEN others THEN RETURN false; END;
 IF claims IS NULL OR claims->>'role' IS DISTINCT FROM 'authenticated' OR coalesce(claims->>'is_anonymous','false')='true'
  OR coalesce(claims->>'sub','') !~ ('^'||uuid_re||'$') THEN RETURN false; END IF;
 sub:=(claims->>'sub')::uuid;
 IF topic IS NULL THEN RETURN false; END IF;
 m:=regexp_match(topic,'^atlas:user:('||uuid_re||')$');
 IF m IS NOT NULL THEN
  RETURN m[1]::uuid=sub AND EXISTS(SELECT 1 FROM profiles WHERE id=sub AND deleted_at IS NULL);
 END IF;
 m:=regexp_match(topic,'^atlas:channel:('||uuid_re||'):('||uuid_re||')$');
 IF m IS NULL THEN RETURN false; END IF;
 -- Only the current epoch is joinable, and only by a live channel reader.
 RETURN EXISTS(SELECT 1 FROM channels WHERE id=m[1]::uuid AND epoch=m[2]::uuid)
  AND atlas_private.channel_allowed(sub,m[1]::uuid,'channel.read');
END $$;
REVOKE ALL ON FUNCTION atlas_realtime.topic_allowed(text) FROM PUBLIC;

DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  GRANT USAGE ON SCHEMA atlas_realtime TO authenticated;
  GRANT EXECUTE ON FUNCTION atlas_realtime.topic_allowed(text) TO authenticated;
 END IF;
 -- Supabase Realtime installed: read-only broadcast authorization for Atlas
 -- topics. No INSERT policy exists, so browsers cannot broadcast, and no
 -- presence or other topic is authorized by this policy.
 IF to_regclass('realtime.messages') IS NOT NULL THEN
  EXECUTE $p$CREATE POLICY atlas_private_topic_read ON realtime.messages FOR SELECT TO authenticated
   USING (extension='broadcast' AND atlas_realtime.topic_allowed((SELECT realtime.topic())))$p$;
 END IF;
END $$;

-- Grants: new definer functions are runtime-callable only where intended.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA atlas_private FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('REVOKE ALL ON FUNCTION atlas_private.mutate(text,jsonb,uuid),atlas_private.mutate_communication(text,jsonb,uuid),atlas_private.comm_dispatch(integer),atlas_private.can_channel(uuid,text),atlas_private.channel_capabilities(uuid),atlas_private.channel_allowed(uuid,uuid,text) FROM %I',r);
  END IF;
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION atlas_private.mutate(text,jsonb,uuid),atlas_private.comm_dispatch(integer),
 atlas_private.can_channel(uuid,text),atlas_private.channel_capabilities(uuid) TO atlas_runtime;
