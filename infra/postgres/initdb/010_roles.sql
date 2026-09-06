\set ON_ERROR_STOP on

\getenv migration_password HEDEFORA_DEV_POSTGRES_MIGRATION_PASSWORD
\getenv app_password HEDEFORA_DEV_POSTGRES_APP_PASSWORD
\getenv worker_password HEDEFORA_DEV_POSTGRES_WORKER_PASSWORD

SELECT
  pg_catalog.octet_length(:'migration_password') >= 12
  AND pg_catalog.octet_length(:'app_password') >= 12
  AND pg_catalog.octet_length(:'worker_password') >= 12
  AS credentials_valid
\gset

\if :credentials_valid
\else
  DO $invalid_local_role_credentials$
  BEGIN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'local role credentials must be at least 12 bytes';
  END
  $invalid_local_role_credentials$;
\endif

BEGIN;

CREATE ROLE hedefora_migration
  LOGIN
  NOINHERIT
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOREPLICATION
  NOBYPASSRLS
  PASSWORD :'migration_password';

CREATE ROLE hedefora_app
  LOGIN
  NOINHERIT
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOREPLICATION
  NOBYPASSRLS
  PASSWORD :'app_password';

CREATE ROLE hedefora_worker
  LOGIN
  NOINHERIT
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOREPLICATION
  NOBYPASSRLS
  PASSWORD :'worker_password';

CREATE ROLE hedefora_readonly
  NOLOGIN
  NOINHERIT
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOREPLICATION
  NOBYPASSRLS;

REVOKE ALL PRIVILEGES ON DATABASE hedefora_dev FROM PUBLIC;
REVOKE ALL PRIVILEGES ON DATABASE hedefora_dev
  FROM hedefora_migration, hedefora_app, hedefora_worker, hedefora_readonly;

DO $database_acl$
DECLARE
  database_name name;
BEGIN
  IF pg_catalog.current_database() <> 'hedefora_dev' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'unexpected bootstrap database';
  END IF;

  FOR database_name IN
    SELECT datname
    FROM pg_catalog.pg_database
    WHERE datallowconn
      AND datname <> pg_catalog.current_database()
  LOOP
    EXECUTE pg_catalog.format(
      'REVOKE ALL PRIVILEGES ON DATABASE %I FROM PUBLIC, hedefora_migration, hedefora_app, hedefora_worker, hedefora_readonly',
      database_name
    );
  END LOOP;
END
$database_acl$;

GRANT CONNECT, CREATE ON DATABASE hedefora_dev TO hedefora_migration;
GRANT CONNECT ON DATABASE hedefora_dev
  TO hedefora_app, hedefora_worker;

REVOKE EXECUTE ON FUNCTION
  pg_catalog.pg_advisory_lock(bigint),
  pg_catalog.pg_advisory_lock(integer, integer),
  pg_catalog.pg_advisory_lock_shared(bigint),
  pg_catalog.pg_advisory_lock_shared(integer, integer),
  pg_catalog.pg_advisory_xact_lock(bigint),
  pg_catalog.pg_advisory_xact_lock(integer, integer),
  pg_catalog.pg_advisory_xact_lock_shared(bigint),
  pg_catalog.pg_advisory_xact_lock_shared(integer, integer),
  pg_catalog.pg_try_advisory_lock(bigint),
  pg_catalog.pg_try_advisory_lock(integer, integer),
  pg_catalog.pg_try_advisory_lock_shared(bigint),
  pg_catalog.pg_try_advisory_lock_shared(integer, integer),
  pg_catalog.pg_try_advisory_xact_lock(bigint),
  pg_catalog.pg_try_advisory_xact_lock(integer, integer),
  pg_catalog.pg_try_advisory_xact_lock_shared(bigint),
  pg_catalog.pg_try_advisory_xact_lock_shared(integer, integer)
FROM PUBLIC, hedefora_migration, hedefora_app, hedefora_worker, hedefora_readonly;

GRANT EXECUTE ON FUNCTION pg_catalog.pg_advisory_xact_lock(bigint)
  TO hedefora_migration;

REVOKE ALL PRIVILEGES ON SCHEMA public FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SCHEMA public
  FROM hedefora_migration, hedefora_app, hedefora_worker, hedefora_readonly;

ALTER ROLE hedefora_migration IN DATABASE hedefora_dev
  SET search_path = pg_catalog, hedefora;
ALTER ROLE hedefora_app IN DATABASE hedefora_dev
  SET search_path = pg_catalog, hedefora;
ALTER ROLE hedefora_worker IN DATABASE hedefora_dev
  SET search_path = pg_catalog, hedefora;

COMMIT;
