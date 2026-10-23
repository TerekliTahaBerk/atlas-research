-- Additive Phase 03 content erasure; usage and run identity remain for accounting.
CREATE OR REPLACE FUNCTION atlas_private.ai_conversation(op text,p uuid,c uuid,title text,expected integer) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a uuid:=atlas_private.actor(); v ai_conversations; scope projects;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(71001,1);
 IF a IS NULL OR NOT atlas_private.can('project',p,'project.read') THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF op='create' THEN
 SELECT * INTO STRICT scope FROM projects WHERE id=p;
 INSERT INTO ai_conversations(id,organization_id,workspace_id,project_id,actor_id,title) VALUES(c,scope.organization_id,scope.workspace_id,p,a,left(title,120));
 ELSE
 SELECT * INTO v FROM ai_conversations WHERE id=c AND project_id=p AND actor_id=a FOR UPDATE;
 IF v.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF v.version<>expected THEN RAISE EXCEPTION 'CONFLICT'; END IF;
 IF op='rename' THEN UPDATE ai_conversations SET title=left(ai_conversation.title,120),version=version+1,updated_at=now() WHERE id=c;
 ELSIF op IN('archive','delete') THEN
 IF EXISTS(SELECT 1 FROM ai_runs WHERE conversation_id=c AND state IN('RESERVED','RUNNING')) THEN RAISE EXCEPTION 'CONFLICT'; END IF;
 UPDATE ai_conversations SET archived_at=now(),title=CASE WHEN op='delete' THEN 'Deleted conversation' ELSE ai_conversations.title END,version=version+1,updated_at=now() WHERE id=c;
 IF op='delete' THEN
 DELETE FROM ai_citations WHERE run_id IN(SELECT id FROM ai_runs WHERE conversation_id=c AND actor_id=a);
 UPDATE ai_runs SET prompt='[deleted]',answer='',evidence_json='[]',references_json='[]',citations='[]',limitations='[]',error=NULL,version=version+1,updated_at=now() WHERE conversation_id=c AND actor_id=a;
 END IF;
 ELSE RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 END IF;
 RETURN c;
END $$;

-- Read-triggered actor-scoped retention; operational scheduling is a separate activation step.
CREATE FUNCTION atlas_private.ai_retention(days integer) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c ai_conversations; n integer:=0; BEGIN
 IF days NOT BETWEEN 1 AND 365 OR atlas_private.actor() IS NULL THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 FOR c IN SELECT * FROM ai_conversations WHERE actor_id=atlas_private.actor() AND title<>'Deleted conversation' AND updated_at<now()-make_interval(days=>days) AND atlas_private.can('project',project_id,'project.read') LOOP
 PERFORM atlas_private.ai_conversation('delete',c.project_id,c.id,'Deleted conversation',c.version); n:=n+1;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION atlas_private.ai_retention(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION atlas_private.ai_retention(integer) TO atlas_runtime;
