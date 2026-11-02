-- Shared provider control, no credentials or research data. Follow-up to A03;
-- historical migrations remain immutable. One leased request across replicas.
CREATE TABLE atlas_private.zotero_throttle (
 id boolean PRIMARY KEY DEFAULT true CHECK (id),
 lease uuid,
 lease_until timestamptz NOT NULL DEFAULT '-infinity',
 blocked_until timestamptz NOT NULL DEFAULT '-infinity'
);
ALTER TABLE atlas_private.zotero_throttle ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON atlas_private.zotero_throttle FROM PUBLIC, atlas_runtime;
INSERT INTO atlas_private.zotero_throttle(id) VALUES(true);

CREATE FUNCTION atlas_private.zotero_request(token uuid, cooldown integer DEFAULT NULL) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r atlas_private.zotero_throttle%ROWTYPE; remaining integer;
BEGIN
 IF token IS NULL OR cooldown<0 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 SELECT * INTO r FROM atlas_private.zotero_throttle WHERE id FOR UPDATE;
 IF cooldown IS NOT NULL THEN
  -- A late completion may extend backoff but cannot release a newer lease.
  UPDATE atlas_private.zotero_throttle SET
   blocked_until=greatest(blocked_until,clock_timestamp()+make_interval(secs=>cooldown)),
   lease=CASE WHEN lease=token THEN NULL ELSE lease END,
   lease_until=CASE WHEN lease=token THEN '-infinity'::timestamptz ELSE lease_until END WHERE id;
  RETURN 0;
 END IF;
 remaining:=greatest(0,ceil(extract(epoch FROM greatest(r.blocked_until,r.lease_until)-clock_timestamp())));
 IF remaining>0 THEN RETURN remaining; END IF;
 UPDATE atlas_private.zotero_throttle SET lease=token,lease_until=clock_timestamp()+interval '15 seconds' WHERE id;
 RETURN 0;
END $$;
REVOKE ALL ON FUNCTION atlas_private.zotero_request(uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION atlas_private.zotero_request(uuid,integer) TO atlas_runtime;
