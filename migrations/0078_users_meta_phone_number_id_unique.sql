-- Guarantee one Meta Cloud API phone number ID → one workspace for inbound webhook routing.
-- Null / unconnected users remain allowed (partial unique index).
--
-- Safety: if duplicate non-null values already exist, abort before creating the UNIQUE index.
-- Do not delete, merge, or reassign customer rows automatically.

BEGIN;

DO $$
DECLARE
  dup_groups integer;
BEGIN
  SELECT COUNT(*)::integer INTO dup_groups
  FROM (
    SELECT meta_phone_number_id
    FROM users
    WHERE meta_phone_number_id IS NOT NULL
    GROUP BY meta_phone_number_id
    HAVING COUNT(*) > 1
  ) dups;

  IF dup_groups > 0 THEN
    RAISE EXCEPTION
      'Migration 0078 blocked: % duplicate non-null meta_phone_number_id group(s) exist. Resolve ownership manually before applying UNIQUE index (users_meta_phone_number_id_uidx).',
      dup_groups;
  END IF;
END $$;

-- Replace the non-unique lookup index from 0029 with a unique partial index.
DROP INDEX IF EXISTS users_meta_phone_number_id_idx;

CREATE UNIQUE INDEX IF NOT EXISTS users_meta_phone_number_id_uidx
  ON users (meta_phone_number_id)
  WHERE meta_phone_number_id IS NOT NULL;

COMMIT;
