\set ON_ERROR_STOP on
\if :{?migration_checksum}
\else
  DO $missing_migration_checksum$
  BEGIN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'migration_checksum is required';
  END
  $missing_migration_checksum$;
\endif

BEGIN;

SET LOCAL ROLE hedefora_migration;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';
SET LOCAL idle_in_transaction_session_timeout = '15s';

SELECT pg_catalog.pg_advisory_xact_lock(5216686130049544801);

DO $postgresql_version_check$
BEGIN
  IF current_setting('server_version_num')::integer < 170000
     OR current_setting('server_version_num')::integer >= 180000 THEN
    RAISE EXCEPTION USING
      ERRCODE = '0A000',
      MESSAGE = 'PostgreSQL 17 is required';
  END IF;
END
$postgresql_version_check$;

CREATE SCHEMA hedefora AUTHORIZATION hedefora_migration;
CREATE SCHEMA hedefora_meta AUTHORIZATION hedefora_migration;

REVOKE ALL ON SCHEMA hedefora FROM PUBLIC;
REVOKE ALL ON SCHEMA hedefora_meta FROM PUBLIC;

GRANT USAGE ON SCHEMA hedefora
  TO hedefora_app, hedefora_worker, hedefora_readonly;

CREATE TABLE hedefora_meta.schema_migrations (
  version bigint PRIMARY KEY CHECK (version > 0),
  name text NOT NULL CHECK (name ~ '^[a-z][a-z0-9_]*$'),
  up_checksum_sha256 text NOT NULL
    CHECK (up_checksum_sha256 ~ '^[0-9a-f]{64}$'),
  applied_at timestamp with time zone NOT NULL DEFAULT statement_timestamp(),
  applied_by name NOT NULL DEFAULT CURRENT_USER
);

ALTER TABLE hedefora_meta.schema_migrations OWNER TO hedefora_migration;

REVOKE ALL ON TABLE hedefora_meta.schema_migrations
  FROM PUBLIC, hedefora_app, hedefora_worker, hedefora_readonly;

ALTER DEFAULT PRIVILEGES FOR ROLE hedefora_migration
  REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE hedefora_migration IN SCHEMA hedefora
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES
  TO hedefora_app, hedefora_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE hedefora_migration IN SCHEMA hedefora
  GRANT SELECT ON TABLES TO hedefora_readonly;

ALTER DEFAULT PRIVILEGES FOR ROLE hedefora_migration
  REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE hedefora_migration IN SCHEMA hedefora
  GRANT USAGE, SELECT ON SEQUENCES TO hedefora_app, hedefora_worker;

ALTER DEFAULT PRIVILEGES FOR ROLE hedefora_migration
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE hedefora_migration IN SCHEMA hedefora
  GRANT EXECUTE ON FUNCTIONS TO hedefora_app, hedefora_worker;

ALTER DEFAULT PRIVILEGES FOR ROLE hedefora_migration
  REVOKE USAGE ON TYPES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE hedefora_migration IN SCHEMA hedefora
  GRANT USAGE ON TYPES TO hedefora_app, hedefora_worker, hedefora_readonly;

INSERT INTO hedefora_meta.schema_migrations (
  version,
  name,
  up_checksum_sha256
)
VALUES (
  1,
  'database_foundation',
  :'migration_checksum'
);

COMMIT;
