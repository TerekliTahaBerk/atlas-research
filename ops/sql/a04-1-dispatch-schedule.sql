-- A04.1 independent outbox delivery schedule. Run as the migration owner
-- (postgres) ONLY on an explicitly approved target, AFTER pg_cron has been
-- enabled there as a separately approved step and AFTER migration
-- 20261104090000_communication_reliability is installed. Idempotent: it
-- replaces only the job named atlas-comm-dispatch. Never prints payloads.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
  RAISE EXCEPTION 'pg_cron is not installed on this target';
 END IF;
 IF to_regprocedure('atlas_private.comm_outbox_health()') IS NULL THEN
  RAISE EXCEPTION 'A04.1 migration is not installed on this target';
 END IF;
END $$;
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname='atlas-comm-dispatch';
SELECT cron.schedule('atlas-comm-dispatch','20 seconds','SELECT atlas_private.comm_dispatch(200)') AS jobid;
COMMIT;
SELECT jobname, schedule, command, active FROM cron.job WHERE jobname='atlas-comm-dispatch';
