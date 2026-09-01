\set ON_ERROR_STOP on

\getenv migration_password HEDEFORA_DEV_POSTGRES_MIGRATION_PASSWORD
\getenv app_password HEDEFORA_DEV_POSTGRES_APP_PASSWORD
\getenv worker_password HEDEFORA_DEV_POSTGRES_WORKER_PASSWORD
\getenv readonly_password HEDEFORA_DEV_POSTGRES_READONLY_PASSWORD

SELECT
  pg_catalog.octet_length(:'migration_password') >= 12
  AND pg_catalog.octet_length(:'app_password') >= 12
  AND pg_catalog.octet_length(:'worker_password') >= 12
  AND pg_catalog.octet_length(:'readonly_password') >= 12
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
  LOGIN
  NOINHERIT
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOREPLICATION
  NOBYPASSRLS
  PASSWORD :'readonly_password';

REVOKE ALL PRIVILEGES ON DATABASE hedefora_dev FROM PUBLIC;
REVOKE ALL PRIVILEGES ON DATABASE hedefora_dev
  FROM hedefora_migration, hedefora_app, hedefora_worker, hedefora_readonly;

GRANT CONNECT, CREATE ON DATABASE hedefora_dev TO hedefora_migration;
GRANT CONNECT ON DATABASE hedefora_dev
  TO hedefora_app, hedefora_worker, hedefora_readonly;

REVOKE ALL PRIVILEGES ON SCHEMA public FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SCHEMA public
  FROM hedefora_migration, hedefora_app, hedefora_worker, hedefora_readonly;

ALTER ROLE hedefora_migration IN DATABASE hedefora_dev
  SET search_path = pg_catalog, hedefora;
ALTER ROLE hedefora_app IN DATABASE hedefora_dev
  SET search_path = pg_catalog, hedefora;
ALTER ROLE hedefora_worker IN DATABASE hedefora_dev
  SET search_path = pg_catalog, hedefora;
ALTER ROLE hedefora_readonly IN DATABASE hedefora_dev
  SET search_path = pg_catalog, hedefora;
ALTER ROLE hedefora_readonly
  SET default_transaction_read_only = on;

COMMIT;
