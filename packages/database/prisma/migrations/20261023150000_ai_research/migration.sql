-- Phase 03, additive. Apply only to an identified approved development target.
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='atlas_ai_worker') THEN CREATE ROLE atlas_ai_worker NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION; END IF; END $$;
GRANT USAGE ON SCHEMA atlas_private,public TO atlas_ai_worker;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
-- Fail closed if the preexisting extension lives somewhere different.
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='vector' AND n.nspname='extensions') THEN RAISE EXCEPTION 'VECTOR_SCHEMA_REVIEW_REQUIRED'; END IF; END $$;

CREATE TABLE ai_conversations (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL, workspace_id uuid NOT NULL, project_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
 title varchar(120) NOT NULL CHECK(length(title)>0), archived_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1,
 UNIQUE(project_id,id), UNIQUE(project_id,actor_id,id),
 FOREIGN KEY(organization_id,workspace_id,project_id) REFERENCES projects(organization_id,workspace_id,id) ON DELETE RESTRICT
);
CREATE INDEX ai_conversations_actor ON ai_conversations(actor_id,project_id,created_at,id);
CREATE TABLE ai_runs (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL, workspace_id uuid NOT NULL, project_id uuid NOT NULL,
 actor_id uuid NOT NULL, conversation_id uuid NOT NULL, idempotency_key uuid NOT NULL, request_hash char(64) NOT NULL,
 state varchar(16) NOT NULL DEFAULT 'RESERVED' CHECK(state IN('RESERVED','RUNNING','COMPLETED','FAILED','CANCELLED','UNCERTAIN')),
 provider varchar(30) NOT NULL, model varchar(120) NOT NULL, prompt varchar(6000) NOT NULL,
 evidence_json jsonb NOT NULL DEFAULT '[]', references_json jsonb NOT NULL DEFAULT '[]', answer text NOT NULL DEFAULT '', citations jsonb NOT NULL DEFAULT '[]', limitations jsonb NOT NULL DEFAULT '[]',
 error varchar(80), input_tokens integer CHECK(input_tokens>=0), output_tokens integer CHECK(output_tokens>=0),
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '3 minutes',
 UNIQUE(actor_id,idempotency_key), UNIQUE(project_id,id),
 FOREIGN KEY(project_id,actor_id,conversation_id) REFERENCES ai_conversations(project_id,actor_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,workspace_id,project_id) REFERENCES projects(organization_id,workspace_id,id) ON DELETE RESTRICT,
 CHECK(octet_length(answer)<=100000 AND jsonb_array_length(citations)<=24 AND jsonb_array_length(references_json)<=12)
);
CREATE INDEX ai_runs_conversation ON ai_runs(conversation_id,created_at,id);
-- Reservation and settlement are one row per operation, including embedding operations.
CREATE TABLE ai_usage (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL, workspace_id uuid NOT NULL, project_id uuid NOT NULL, actor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
 run_id uuid UNIQUE, operation_key varchar(160) NOT NULL, kind varchar(20) NOT NULL CHECK(kind IN('generation','embedding')),
 reserved_micros integer NOT NULL CHECK(reserved_micros BETWEEN 1 AND 1000000), charged_micros integer NOT NULL CHECK(charged_micros>=0), settled_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(actor_id,operation_key),
 FOREIGN KEY(project_id,run_id) REFERENCES ai_runs(project_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,workspace_id,project_id) REFERENCES projects(organization_id,workspace_id,id) ON DELETE RESTRICT
);
CREATE INDEX ai_usage_period ON ai_usage(created_at,organization_id,actor_id);
CREATE TABLE source_chunks (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL, workspace_id uuid NOT NULL, project_id uuid NOT NULL,
 project_paper_id uuid NOT NULL, source_version_id uuid NOT NULL, source_sha256 char(64) NOT NULL,
 extraction_version varchar(80) NOT NULL, ordinal integer NOT NULL CHECK(ordinal>=0), page integer NOT NULL CHECK(page BETWEEN 1 AND 500),
 start_offset integer NOT NULL CHECK(start_offset>=0), end_offset integer NOT NULL,
 text text NOT NULL CHECK(length(text) BETWEEN 1 AND 4000 AND end_offset>start_offset),
 checksum char(64) NOT NULL, embedding_provider varchar(20) NOT NULL, embedding_revision varchar(30) NOT NULL, embedding_dimensions integer NOT NULL DEFAULT 768 CHECK(embedding_dimensions=768), embedding_model varchar(160) NOT NULL, embedding extensions.vector(768) NOT NULL,
 search_document tsvector GENERATED ALWAYS AS(to_tsvector('simple',text)) STORED,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(project_id,id), UNIQUE(source_version_id,extraction_version,embedding_model,ordinal),
 FOREIGN KEY(organization_id,workspace_id,project_id) REFERENCES projects(organization_id,workspace_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(project_id,project_paper_id) REFERENCES project_papers(project_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(project_id,source_version_id) REFERENCES source_versions(project_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(project_paper_id,source_version_id) REFERENCES source_versions(project_paper_id,id) ON DELETE RESTRICT
);
CREATE INDEX source_chunks_scope ON source_chunks(project_id,source_version_id,embedding_model);
CREATE INDEX source_chunks_keyword ON source_chunks USING gin(search_document);
CREATE TABLE ai_processing_jobs (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL, workspace_id uuid NOT NULL, project_id uuid NOT NULL,
 source_version_id uuid NOT NULL, actor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
 extraction_version varchar(80) NOT NULL, embedding_model varchar(160) NOT NULL,
 state varchar(16) NOT NULL DEFAULT 'QUEUED' CHECK(state IN('QUEUED','RUNNING','READY','RETRYABLE','FAILED','CANCELLED')),
 completion_started_at timestamptz, attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3), locked_until timestamptz, available_at timestamptz NOT NULL DEFAULT now(), error varchar(80),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_version_id,extraction_version,embedding_model),
 FOREIGN KEY(organization_id,workspace_id,project_id) REFERENCES projects(organization_id,workspace_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(project_id,source_version_id) REFERENCES source_versions(project_id,id) ON DELETE RESTRICT
);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['ai_conversations','ai_runs','ai_usage','source_chunks','ai_processing_jobs'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,atlas_runtime',t);
 EXECUTE format('GRANT SELECT ON public.%I TO atlas_runtime',t);
 EXECUTE format('CREATE POLICY read_scope ON public.%I FOR SELECT TO atlas_runtime USING (atlas_private.can(''project'',project_id,''project.read'') %s)',t,CASE WHEN t='source_chunks' THEN 'AND EXISTS(SELECT 1 FROM public.source_versions s WHERE s.id=source_version_id AND s.project_id=source_chunks.project_id AND s.state=''READY'' AND s.sha256=source_sha256)' WHEN t='ai_processing_jobs' THEN '' ELSE 'AND actor_id=(SELECT atlas_private.actor())' END);
 END LOOP;
END $$;
GRANT USAGE ON SCHEMA extensions TO atlas_runtime;

CREATE FUNCTION atlas_private.ai_conversation(op text,p uuid,c uuid,title text,expected integer) RETURNS uuid
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
 ELSIF op='archive' THEN
 IF EXISTS(SELECT 1 FROM ai_runs WHERE conversation_id=c AND state IN('RESERVED','RUNNING')) THEN RAISE EXCEPTION 'CONFLICT'; END IF;
 UPDATE ai_conversations SET archived_at=now(),version=version+1,updated_at=now() WHERE id=c;
 ELSE RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 END IF;
 RETURN c;
END $$;

CREATE FUNCTION atlas_private.ai_reserve(p uuid,operation text,kind text,amount integer,cap integer,run_id uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a uuid:=atlas_private.actor(); scope projects; existing ai_usage; result uuid:=gen_random_uuid();
BEGIN
 PERFORM pg_advisory_xact_lock_shared(71001,1);
 -- One budget lock avoids different actors racing the organization/global caps.
 PERFORM pg_advisory_xact_lock(71003,1);
 IF a IS NULL OR NOT atlas_private.can('project',p,'project.read') THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 SELECT * INTO STRICT scope FROM projects WHERE id=p;
 SELECT * INTO existing FROM ai_usage u WHERE u.actor_id=a AND u.operation_key=operation;
 IF existing.id IS NOT NULL THEN RAISE EXCEPTION 'CONFLICT'; END IF;
 IF amount<1 OR amount>1000000 OR cap<1 OR cap>10000000 OR amount>cap THEN RAISE EXCEPTION 'RATE_LIMITED'; END IF;
 IF EXISTS(SELECT 1 FROM ai_usage u WHERE u.created_at>=date_trunc('month',now()) HAVING sum(u.charged_micros)+amount>cap)
 OR EXISTS(SELECT 1 FROM ai_usage u WHERE u.created_at>=date_trunc('month',now()) AND (u.actor_id=a OR u.organization_id=scope.organization_id OR u.workspace_id=scope.workspace_id OR u.project_id=p) HAVING sum(u.charged_micros)+amount>cap)
 OR (SELECT count(*) FROM ai_runs WHERE actor_id=a AND state IN('RESERVED','RUNNING') AND expires_at>now() AND id IS DISTINCT FROM ai_reserve.run_id)>=2 THEN RAISE EXCEPTION 'RATE_LIMITED'; END IF;
 INSERT INTO ai_usage VALUES(result,scope.organization_id,scope.workspace_id,p,a,run_id,operation,kind,amount,amount,NULL,now());
 RETURN result;
END $$;

CREATE FUNCTION atlas_private.ai_begin(input jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a uuid:=atlas_private.actor(); p uuid:=(input->>'projectId')::uuid; c uuid:=(input->>'conversationId')::uuid; r uuid:=(input->>'id')::uuid; old ai_runs; scope projects;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(71001,1);
 PERFORM pg_advisory_xact_lock(71003,1);
 IF a IS NULL OR NOT atlas_private.can('project',p,'project.read') THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 SELECT * INTO old FROM ai_runs WHERE actor_id=a AND idempotency_key=(input->>'idempotencyKey')::uuid;
 IF old.id IS NOT NULL THEN
 IF old.project_id<>p OR old.request_hash<>input->>'hash' THEN RAISE EXCEPTION 'CONFLICT'; END IF;
 RETURN old.id;
 END IF;
 SELECT * INTO STRICT scope FROM projects WHERE id=p;
 IF (input->>'createConversation')::boolean THEN PERFORM atlas_private.ai_conversation('create',p,c,left(input->>'text',120),1); END IF;
 IF NOT EXISTS(SELECT 1 FROM ai_conversations WHERE id=c AND project_id=p AND actor_id=a AND archived_at IS NULL) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF EXISTS(SELECT 1 FROM ai_runs WHERE conversation_id=c AND state IN('RESERVED','RUNNING') AND expires_at>now()) THEN RAISE EXCEPTION 'CONFLICT'; END IF;
 INSERT INTO ai_runs(id,organization_id,workspace_id,project_id,actor_id,conversation_id,idempotency_key,request_hash,provider,model,prompt,references_json)
 VALUES(r,scope.organization_id,scope.workspace_id,p,a,c,(input->>'idempotencyKey')::uuid,input->>'hash',input->>'provider',input->>'model',input->>'text',input->'references');
 PERFORM atlas_private.ai_reserve(p,'run:'||r,'generation',(input->>'amount')::integer,(input->>'cap')::integer,r);
 RETURN r;
END $$;

CREATE FUNCTION atlas_private.ai_update(r uuid,op text,payload jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a uuid:=atlas_private.actor(); v ai_runs; permitted boolean; charge integer; citation jsonb; citation_ordinal integer:=0;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(71001,1);
 SELECT * INTO v FROM ai_runs WHERE id=r AND actor_id=a FOR UPDATE;
 IF v.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 permitted:=atlas_private.can('project',v.project_id,'project.read');
 IF v.state NOT IN('RESERVED','RUNNING') THEN RETURN false; END IF;
 IF v.expires_at<=now() THEN op:='uncertain'; END IF;
 IF NOT permitted THEN op:='cancel'; END IF;
 IF op='dispatch' AND v.state='RESERVED' THEN UPDATE ai_runs SET state='RUNNING',evidence_json=payload->'evidence',version=version+1,updated_at=now() WHERE id=r;
 ELSIF op='delta' AND v.state='RUNNING' AND permitted THEN
 UPDATE ai_runs SET answer=answer||(payload->>'text'),version=version+1,updated_at=now() WHERE id=r;
 ELSIF op IN('complete','fail','cancel','uncertain') THEN
 IF op='complete' AND v.state<>'RUNNING' THEN RAISE EXCEPTION 'CONFLICT'; END IF;
 UPDATE ai_runs SET state=CASE op WHEN 'complete' THEN 'COMPLETED' WHEN 'fail' THEN 'FAILED' WHEN 'cancel' THEN 'CANCELLED' ELSE 'UNCERTAIN' END,
 answer=CASE WHEN op='complete' THEN payload->>'text' WHEN NOT permitted THEN '' ELSE answer END,
 citations=CASE WHEN op='complete' THEN payload->'citations' ELSE '[]'::jsonb END,
 limitations=CASE WHEN op='complete' THEN payload->'limitations' ELSE '[]'::jsonb END,
 error=CASE WHEN op='complete' THEN NULL ELSE left(coalesce(payload->>'error','INTERRUPTED'),80) END,
 input_tokens=(payload->>'inputTokens')::integer,output_tokens=(payload->>'outputTokens')::integer,version=version+1,updated_at=now() WHERE id=r;
 SELECT CASE WHEN v.state='RESERVED' THEN 0 WHEN op='complete' THEN greatest((payload->>'costMicros')::integer,0) ELSE reserved_micros END INTO charge FROM ai_usage WHERE run_id=r;
 UPDATE ai_usage SET charged_micros=charge,settled_at=now() WHERE run_id=r AND settled_at IS NULL;
 IF op='complete' THEN
 FOR citation IN SELECT value FROM jsonb_array_elements(payload->'citations') LOOP
 INSERT INTO ai_citations(project_id,run_id,ordinal,project_paper_id,source_version_id,source_chunk_id,page,quote,start_offset,end_offset,checksum,kind)
 VALUES(v.project_id,r,citation_ordinal,(citation->>'projectPaperId')::uuid,(citation->>'sourceVersionId')::uuid,CASE WHEN citation->>'kind'='full-text' THEN (citation->>'evidenceId')::uuid ELSE NULL END,(citation->>'page')::integer,citation->>'quote',(citation->>'startOffset')::integer,(citation->>'endOffset')::integer,citation->>'checksum',citation->>'kind');
 citation_ordinal:=citation_ordinal+1;
 END LOOP;
 END IF;

 ELSE RAISE EXCEPTION 'CONFLICT'; END IF;
 RETURN permitted AND op NOT IN('cancel','uncertain');
END $$;

-- Crash recovery never retries uncertain provider dispatch or refunds it automatically.
CREATE FUNCTION atlas_private.ai_reconcile() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE n integer; BEGIN
 UPDATE ai_runs SET state=CASE WHEN state='RUNNING' THEN 'UNCERTAIN' ELSE 'CANCELLED' END,error='LEASE_EXPIRED',version=version+1,updated_at=now() WHERE state IN('RESERVED','RUNNING') AND expires_at<=now() AND actor_id=atlas_private.actor();
 GET DIAGNOSTICS n=ROW_COUNT;
 UPDATE ai_usage u SET settled_at=now(),charged_micros=CASE WHEN r.state='CANCELLED' THEN 0 ELSE u.reserved_micros END FROM ai_runs r WHERE u.run_id=r.id AND r.actor_id=atlas_private.actor() AND r.state IN('UNCERTAIN','CANCELLED') AND u.settled_at IS NULL;
 UPDATE ai_usage SET settled_at=now() WHERE actor_id=atlas_private.actor() AND run_id IS NULL AND settled_at IS NULL AND created_at<now()-interval '10 minutes';
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION atlas_private.ai_conversation(text,uuid,uuid,text,integer),atlas_private.ai_reserve(uuid,text,text,integer,integer,uuid),atlas_private.ai_begin(jsonb),atlas_private.ai_update(uuid,text,jsonb),atlas_private.ai_reconcile() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION atlas_private.ai_conversation(text,uuid,uuid,text,integer),atlas_private.ai_reserve(uuid,text,text,integer,integer,uuid),atlas_private.ai_begin(jsonb),atlas_private.ai_update(uuid,text,jsonb),atlas_private.ai_reconcile() TO atlas_runtime;

CREATE FUNCTION atlas_private.ai_enqueue(sid uuid,ev text,em text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a uuid:=atlas_private.actor(); s source_versions; result uuid; BEGIN
 PERFORM pg_advisory_xact_lock_shared(71001,1);
 SELECT * INTO s FROM source_versions WHERE id=sid AND state='READY';
 IF s.id IS NULL OR a IS NULL OR NOT EXISTS(SELECT 1 FROM project_papers WHERE id=s.project_paper_id AND archived_at IS NULL) OR ev<>'poppler-v1:1600:200' OR em !~ '^(openai|google):[A-Za-z0-9._-]{1,100}:[A-Za-z0-9._-]{1,30}:768$' OR NOT atlas_private.can('project',s.project_id,'project.write') THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 INSERT INTO ai_processing_jobs(id,organization_id,workspace_id,project_id,source_version_id,actor_id,extraction_version,embedding_model)
 VALUES(gen_random_uuid(),s.organization_id,s.workspace_id,s.project_id,s.id,a,ev,em)
 ON CONFLICT(source_version_id,extraction_version,embedding_model) DO UPDATE SET state=CASE WHEN ai_processing_jobs.state IN('FAILED','CANCELLED') AND ai_processing_jobs.attempts<3 THEN 'QUEUED' ELSE ai_processing_jobs.state END
 RETURNING id INTO result;
 RETURN result;
END $$;
CREATE FUNCTION atlas_private.ai_claim() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE j ai_processing_jobs; BEGIN
 PERFORM pg_advisory_xact_lock_shared(71001,1);
 UPDATE ai_processing_jobs revoked SET state='CANCELLED',error='ACCESS_CHANGED',locked_until=NULL,updated_at=now() WHERE state IN('QUEUED','RETRYABLE','RUNNING') AND (NOT coalesce(atlas_private.allowed(revoked.actor_id,'project',revoked.project_id,'project.write'),false) OR NOT EXISTS(SELECT 1 FROM source_versions s JOIN project_papers p ON p.id=s.project_paper_id WHERE s.id=revoked.source_version_id AND s.state='READY' AND p.archived_at IS NULL));
 UPDATE ai_processing_jobs SET state='FAILED',error='ATTEMPTS_EXHAUSTED' WHERE attempts>=3 AND state IN('RETRYABLE','RUNNING') AND coalesce(locked_until,now())<=now();
 SELECT q.* INTO j FROM ai_processing_jobs q JOIN source_versions s ON s.id=q.source_version_id AND s.state='READY'
 WHERE q.attempts<3 AND q.available_at<=now() AND (q.state IN('QUEUED','RETRYABLE') OR(q.state='RUNNING' AND q.locked_until<now()))
 AND coalesce(atlas_private.allowed(q.actor_id,'project',q.project_id,'project.write'),false)
 ORDER BY q.created_at,q.id FOR UPDATE OF q SKIP LOCKED LIMIT 1;
 IF j.id IS NULL THEN RETURN NULL; END IF;
 UPDATE ai_processing_jobs SET state='RUNNING',completion_started_at=NULL,attempts=attempts+1,locked_until=now()+interval '5 minutes',updated_at=now() WHERE id=j.id;
 RETURN jsonb_build_object('jobId',j.id,'attempt',j.attempts+1);
END $$;
CREATE FUNCTION atlas_private.ai_job(jid uuid,attempt integer) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('jobId',j.id,'projectId',j.project_id,'actorId',j.actor_id,'sourceVersionId',s.id,'projectPaperId',s.project_paper_id,'sha256',s.sha256,'byteSize',s.byte_size::integer,'objectKey',s.object_key,'extractionVersion',j.extraction_version,'embeddingModel',j.embedding_model)
 FROM ai_processing_jobs j JOIN source_versions s ON s.id=j.source_version_id
 WHERE j.id=jid AND j.attempts=attempt AND j.state='RUNNING' AND j.locked_until>now() AND s.state='READY'
 AND coalesce(atlas_private.allowed(j.actor_id,'project',j.project_id,'project.write'),false) AND EXISTS(SELECT 1 FROM project_papers p WHERE p.id=s.project_paper_id AND p.archived_at IS NULL)
$$;
CREATE FUNCTION atlas_private.ai_index(jid uuid,attempt integer,chunks jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE j ai_processing_jobs; s source_versions; item jsonb; BEGIN
 PERFORM pg_advisory_xact_lock_shared(71001,1);
 SELECT * INTO j FROM ai_processing_jobs WHERE id=jid AND actor_id=atlas_private.actor() FOR UPDATE;
 IF j.id IS NULL OR j.state<>'RUNNING' OR j.attempts<>attempt OR j.locked_until<=now() OR NOT atlas_private.can('project',j.project_id,'project.write') THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 SELECT * INTO s FROM source_versions WHERE id=j.source_version_id AND state='READY';
 IF s.id IS NULL OR jsonb_typeof(chunks)<>'array' OR jsonb_array_length(chunks) NOT BETWEEN 1 AND 512 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(chunks) LOOP
 IF item->>'checksum' !~ '^[a-f0-9]{64}$' OR item->>'checksum'<>encode(sha256(convert_to(item->>'text','UTF8')),'hex') THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 INSERT INTO source_chunks(id,organization_id,workspace_id,project_id,project_paper_id,source_version_id,source_sha256,extraction_version,ordinal,page,start_offset,end_offset,text,checksum,embedding_provider,embedding_revision,embedding_model,embedding)
 VALUES((item->>'id')::uuid,j.organization_id,j.workspace_id,j.project_id,s.project_paper_id,s.id,s.sha256,j.extraction_version,(item->>'ordinal')::integer,(item->>'page')::integer,(item->>'startOffset')::integer,(item->>'endOffset')::integer,item->>'text',item->>'checksum',split_part(j.embedding_model,':',1),split_part(j.embedding_model,':',3),j.embedding_model,(item->>'vector')::extensions.vector);
 END LOOP;
 UPDATE ai_processing_jobs SET state='READY',locked_until=NULL,error=NULL,updated_at=now() WHERE id=jid;
 RETURN true;
END $$;
CREATE FUNCTION atlas_private.ai_job_fail(jid uuid,attempt integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 UPDATE ai_processing_jobs SET state=CASE WHEN attempts>=3 THEN 'FAILED' ELSE 'RETRYABLE' END,error='PROCESSING_FAILED',available_at=now()+interval '5 minutes',locked_until=NULL,updated_at=now() WHERE id=jid AND attempts=attempt AND state='RUNNING';
END $$;
CREATE FUNCTION atlas_private.ai_settle(uid uuid,charge integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 UPDATE ai_usage SET charged_micros=greatest(charge,0),settled_at=now() WHERE id=uid AND actor_id=atlas_private.actor() AND run_id IS NULL AND settled_at IS NULL;
END $$;
REVOKE ALL ON FUNCTION atlas_private.ai_enqueue(uuid,text,text),atlas_private.ai_claim(),atlas_private.ai_job(uuid,integer),atlas_private.ai_index(uuid,integer,jsonb),atlas_private.ai_job_fail(uuid,integer),atlas_private.ai_settle(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION atlas_private.ai_enqueue(uuid,text,text),atlas_private.ai_settle(uuid,integer) TO atlas_runtime;
GRANT EXECUTE ON FUNCTION atlas_private.ai_claim(),atlas_private.ai_job(uuid,integer),atlas_private.ai_index(uuid,integer,jsonb),atlas_private.ai_job_fail(uuid,integer) TO atlas_ai_worker;

-- An authenticated extraction completion may dispatch embeddings once per lease.
CREATE FUNCTION atlas_private.ai_accept_extraction(jid uuid,attempt integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 UPDATE ai_processing_jobs j SET completion_started_at=now() WHERE j.id=jid AND j.attempts=attempt AND state='RUNNING' AND locked_until>now() AND completion_started_at IS NULL AND coalesce(atlas_private.allowed(j.actor_id,'project',j.project_id,'project.write'),false);
 IF NOT FOUND THEN RAISE EXCEPTION 'CONFLICT'; END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION atlas_private.ai_accept_extraction(uuid,integer) FROM PUBLIC,anon,authenticated,atlas_runtime;
GRANT EXECUTE ON FUNCTION atlas_private.ai_accept_extraction(uuid,integer) TO atlas_ai_worker;
CREATE FUNCTION atlas_private.immutable_ai_chunk() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'IMMUTABLE_SOURCE_CHUNK'; END $$;
REVOKE ALL ON FUNCTION atlas_private.immutable_ai_chunk() FROM PUBLIC,anon,authenticated,atlas_runtime;
CREATE TRIGGER immutable_source_chunks BEFORE UPDATE OR DELETE ON source_chunks FOR EACH ROW EXECUTE FUNCTION atlas_private.immutable_ai_chunk();
CREATE FUNCTION atlas_private.ai_tool_audit(p uuid,r uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 IF NOT coalesce(atlas_private.can('project',p,'project.read'),false) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 INSERT INTO audit_events(id,organization_id,actor_id,action,resource_id,request_id) SELECT gen_random_uuid(),organization_id,atlas_private.actor(),'ai.research.retrieve',p,r FROM projects WHERE id=p;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION atlas_private.ai_tool_audit(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION atlas_private.ai_tool_audit(uuid,uuid) TO atlas_runtime;

-- Citations have relational provenance as well as the bounded rendered snapshot.
CREATE TABLE ai_citations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, run_id uuid NOT NULL, ordinal integer NOT NULL CHECK(ordinal BETWEEN 0 AND 23),
 project_paper_id uuid NOT NULL, source_version_id uuid, source_chunk_id uuid, page integer CHECK(page BETWEEN 1 AND 500),
 quote text NOT NULL CHECK(length(quote) BETWEEN 1 AND 2000), start_offset integer NOT NULL CHECK(start_offset>=0),end_offset integer NOT NULL CHECK(end_offset>start_offset),
 checksum char(64) NOT NULL, kind varchar(20) NOT NULL CHECK(kind IN('full-text','abstract','metadata','annotation')),
 verification varchar(30) NOT NULL DEFAULT 'verified-location' CHECK(verification='verified-location'), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(run_id,ordinal), FOREIGN KEY(project_id,run_id) REFERENCES ai_runs(project_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(project_id,project_paper_id) REFERENCES project_papers(project_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(project_paper_id,source_version_id) REFERENCES source_versions(project_paper_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(project_id,source_chunk_id) REFERENCES source_chunks(project_id,id) ON DELETE RESTRICT,
 CHECK(kind<>'full-text' OR (source_version_id IS NOT NULL AND source_chunk_id IS NOT NULL AND page IS NOT NULL)),
 CHECK(kind NOT IN('abstract','metadata') OR (source_version_id IS NULL AND source_chunk_id IS NULL AND page IS NULL))
);
ALTER TABLE ai_citations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ai_citations FROM PUBLIC,anon,authenticated,atlas_runtime;
GRANT SELECT ON ai_citations TO atlas_runtime;
CREATE POLICY read_scope ON ai_citations FOR SELECT TO atlas_runtime USING(EXISTS(SELECT 1 FROM ai_runs r WHERE r.id=run_id AND r.project_id=ai_citations.project_id));
CREATE FUNCTION atlas_private.ai_evidence_visible(items jsonb) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(items) e WHERE
 CASE e->>'kind'
 WHEN 'full-text' THEN NOT EXISTS(SELECT 1 FROM source_chunks c JOIN source_versions s ON s.id=c.source_version_id AND s.state='READY' JOIN project_papers p ON p.id=c.project_paper_id AND p.archived_at IS NULL WHERE c.id=(e->>'id')::uuid AND c.project_id=(e->>'projectId')::uuid AND c.text=e->>'text' AND c.source_sha256=e->>'checksum')
 WHEN 'annotation' THEN NOT EXISTS(SELECT 1 FROM paper_annotations n JOIN project_papers p ON p.id=n.project_paper_id AND p.archived_at IS NULL WHERE n.id=replace(e->>'id','annotation:','')::uuid AND n.project_id=(e->>'projectId')::uuid AND n.deleted_at IS NULL AND n.body=e->>'text')
 ELSE NOT EXISTS(SELECT 1 FROM project_papers p WHERE p.id=(e->>'projectPaperId')::uuid AND p.project_id=(e->>'projectId')::uuid AND p.archived_at IS NULL AND encode(sha256(convert_to(left(coalesce(p.metadata->>'abstract',p.private_title,p.metadata->>'title','Untitled'),4000),'UTF8')),'hex')=e->>'checksum') END)
$$;
REVOKE ALL ON FUNCTION atlas_private.ai_evidence_visible(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION atlas_private.ai_evidence_visible(jsonb) TO atlas_runtime;
DROP POLICY read_scope ON ai_runs;
CREATE POLICY read_scope ON ai_runs FOR SELECT TO atlas_runtime USING(actor_id=atlas_private.actor() AND atlas_private.can('project',project_id,'project.read') AND atlas_private.ai_evidence_visible(evidence_json));
