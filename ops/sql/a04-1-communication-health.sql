-- Read-only A04.1 communication health. Counts, ages and catalog facts only:
-- no message bodies, topics, payloads or identities. Run as postgres.
BEGIN READ ONLY;
SELECT jsonb_build_object(
 'outbox',atlas_private.comm_outbox_health(),
 'realtime_policy',(SELECT jsonb_agg(jsonb_build_object('name',polname,'cmd',polcmd,'roles',polroles::regrole[]::text[]))
   FROM pg_policy WHERE polrelid=to_regclass('realtime.messages') AND polname LIKE 'atlas_%'),
 'realtime_insert_policies',(SELECT count(*) FROM pg_policy WHERE polrelid=to_regclass('realtime.messages') AND polcmd IN ('a','*')
   AND polname LIKE 'atlas_%'),
 'communication_tables_without_rls',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname IN ('channels','channel_members','channel_messages','message_mentions',
   'message_reactions','message_references','notifications','communication_outbox') AND NOT c.relrowsecurity),
 'browser_table_grants',(SELECT count(*) FROM pg_roles r CROSS JOIN unnest(ARRAY['channels','channel_members','channel_messages',
   'message_mentions','message_reactions','message_references','notifications','communication_outbox']) t
   CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
   WHERE r.rolname IN ('anon','authenticated') AND has_table_privilege(r.rolname,'public.'||t,p)),
 'browser_private_functions',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN pg_roles r
   WHERE n.nspname='atlas_private' AND r.rolname IN ('anon','authenticated') AND has_function_privilege(r.oid,p.oid,'EXECUTE')),
 'channels',(SELECT count(*) FROM channels),
 'messages',(SELECT count(*) FROM channel_messages),
 'orphaned_restricted_channels',(SELECT count(*) FROM channels c WHERE c.visibility='RESTRICTED'
   AND NOT atlas_private.comm_channel_managed(c.id))
) AS a04_1_health;
SELECT to_regclass('cron.job') IS NOT NULL AS has_cron \gset
\if :has_cron
SELECT jsonb_build_object(
 'schedule',(SELECT jsonb_agg(jsonb_build_object('schedule',schedule,'active',active)) FROM cron.job WHERE jobname='atlas-comm-dispatch'),
 'runs_last_hour',(SELECT count(*) FROM cron.job_run_details d JOIN cron.job j ON j.jobid=d.jobid
   WHERE j.jobname='atlas-comm-dispatch' AND d.start_time>now()-interval '1 hour'),
 'failed_runs_last_hour',(SELECT count(*) FROM cron.job_run_details d JOIN cron.job j ON j.jobid=d.jobid
   WHERE j.jobname='atlas-comm-dispatch' AND d.status<>'succeeded' AND d.start_time>now()-interval '1 hour')
) AS a04_1_schedule;
\else
SELECT '{"schedule":null,"reason":"pg_cron not installed"}'::jsonb AS a04_1_schedule;
\endif
COMMIT;
