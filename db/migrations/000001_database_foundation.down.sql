\set ON_ERROR_STOP on
\if :{?expected_up_checksum}
\else
  DO $missing_expected_up_checksum$
  BEGIN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'expected_up_checksum is required';
  END
  $missing_expected_up_checksum$;
\endif

BEGIN;

SET LOCAL ROLE hedefora_migration;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';
SET LOCAL idle_in_transaction_session_timeout = '15s';

SELECT pg_catalog.pg_advisory_xact_lock(5216686130049544801);
SELECT pg_catalog.set_config(
  'hedefora.expected_up_checksum',
  :'expected_up_checksum',
  true
);

DO $migration_state_check$
DECLARE
  recorded_checksum text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM hedefora_meta.schema_migrations
    WHERE version <> 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'migration 000001 is not the latest applied version';
  END IF;

  SELECT up_checksum_sha256
  INTO recorded_checksum
  FROM hedefora_meta.schema_migrations
  WHERE version = 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'migration 000001 is not applied';
  END IF;

  IF recorded_checksum IS DISTINCT FROM
     current_setting('hedefora.expected_up_checksum', true) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'migration 000001 checksum does not match the ledger';
  END IF;
END
$migration_state_check$;

ALTER DEFAULT PRIVILEGES FOR ROLE hedefora_migration IN SCHEMA hedefora
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES
  FROM hedefora_app, hedefora_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE hedefora_migration IN SCHEMA hedefora
  REVOKE SELECT ON TABLES FROM hedefora_readonly;

ALTER DEFAULT PRIVILEGES FOR ROLE hedefora_migration IN SCHEMA hedefora
  REVOKE USAGE, SELECT ON SEQUENCES FROM hedefora_app, hedefora_worker;

ALTER DEFAULT PRIVILEGES FOR ROLE hedefora_migration IN SCHEMA hedefora
  REVOKE EXECUTE ON FUNCTIONS FROM hedefora_app, hedefora_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE hedefora_migration
  GRANT EXECUTE ON FUNCTIONS TO PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE hedefora_migration IN SCHEMA hedefora
  REVOKE USAGE ON TYPES FROM hedefora_app, hedefora_worker, hedefora_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE hedefora_migration
  GRANT USAGE ON TYPES TO PUBLIC;

REVOKE USAGE ON SCHEMA hedefora
  FROM hedefora_app, hedefora_worker, hedefora_readonly;

DROP SCHEMA hedefora;
DROP TABLE hedefora_meta.schema_migrations;
DROP SCHEMA hedefora_meta;

COMMIT;
