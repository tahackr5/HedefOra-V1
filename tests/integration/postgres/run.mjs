import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { TextDecoder } from "node:util";
import { fileURLToPath } from "node:url";

export const POSTGRES_CANDIDATE_IMAGE =
  "postgres:17.11-bookworm@sha256:051f7b7b3abdd564d5d1bd1e8c4b9c1b6e77087d1dd22020ede611c096a272e0";
export const EXPECTED_UP_SHA256 =
  "86768275fac32ba13bb235f9a10599e430e3b4f5bd6fec3a1f27c6403256bea7";
export const EXPECTED_DOWN_SHA256 =
  "25360d8052134a0678329398f8f3a14837f699ff7eb83ac7327fe1a277f7dbf0";

const MAX_FILE_BYTES = 1024 * 1024;
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const SQL_FILE_PATTERN =
  /^(?<version>[0-9]{6})_(?<name>[a-z][a-z0-9_]*)(?<direction>\.up|\.down)\.sql$/u;
const CHECKSUM_LINE_PATTERN =
  /^(?<digest>[0-9a-f]{64})  (?<file>[0-9]{6}_[a-z][a-z0-9_]*\.(?:up|down)\.sql)$/u;

const sourceFile = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(sourceFile), "../../..");
const composeFile = path.join(repositoryRoot, "infra", "compose.dev.yml");
const initFile = path.join(
  repositoryRoot,
  "infra",
  "postgres",
  "initdb",
  "010_roles.sql",
);
const migrationsDirectory = path.join(repositoryRoot, "db", "migrations");
const migrationContractFile = path.join(
  repositoryRoot,
  "contracts",
  "database",
  "migrations.yaml",
);
const roleContractFile = path.join(
  repositoryRoot,
  "contracts",
  "database",
  "roles.yaml",
);

export class HarnessError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "HarnessError";
  }
}

function invariant(condition, message) {
  if (!condition) {
    throw new HarnessError(message);
  }
}

function canonical(lines) {
  return lines.join("\n") + "\n";
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizedPath(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function assertRepositoryPath(value, label) {
  const root = normalizedPath(repositoryRoot) + path.sep;
  invariant(
    normalizedPath(value).startsWith(root),
    label + " repository dışında",
  );
}

function readBoundedRegularFile(filePath, label) {
  const stat = lstatSync(filePath);
  invariant(stat.isFile(), label + " regular file değil");
  invariant(!stat.isSymbolicLink(), label + " symlink olamaz");
  invariant(stat.size <= MAX_FILE_BYTES, label + " byte sınırını aşıyor");
  const realPath = realpathSync(filePath);
  assertRepositoryPath(realPath, label);
  return readFileSync(realPath);
}

function decodeCanonicalText(bytes, label) {
  invariant(bytes.length > 0, label + " boş olamaz");
  invariant(!bytes.includes(0), label + " NUL içeremez");
  invariant(!bytes.includes(13), label + " CR içeremez");
  invariant(bytes.at(-1) === 10, label + " final LF taşımalıdır");
  try {
    return UTF8_DECODER.decode(bytes);
  } catch (error) {
    throw new HarnessError(label + " geçerli UTF-8 değil", { cause: error });
  }
}

function readCanonicalText(filePath, label) {
  return decodeCanonicalText(readBoundedRegularFile(filePath, label), label);
}

export function parseChecksumManifest(text) {
  invariant(typeof text === "string", "SHA256SUMS metin olmalıdır");
  invariant(text.length > 0, "SHA256SUMS boş olamaz");
  invariant(!text.includes("\r"), "SHA256SUMS CR içeremez");
  invariant(!text.includes("\0"), "SHA256SUMS NUL içeremez");
  invariant(text.endsWith("\n"), "SHA256SUMS final LF taşımalıdır");
  const lines = text.slice(0, -1).split("\n");
  invariant(
    lines.every((line) => line.length > 0),
    "SHA256SUMS boş satır içeremez",
  );
  const checksums = new Map();
  let previousFile = "";
  for (const line of lines) {
    const match = CHECKSUM_LINE_PATTERN.exec(line);
    invariant(match?.groups, "Geçersiz SHA256SUMS satırı: " + line);
    const digest = match.groups.digest;
    const file = match.groups.file;
    invariant(!checksums.has(file), "Tekrarlanan SHA256SUMS girdisi: " + file);
    invariant(
      compareAscii(previousFile, file) < 0,
      "SHA256SUMS girdileri byte-stable dosya sırasıyla yazılmalıdır",
    );
    checksums.set(file, digest);
    previousFile = file;
  }
  invariant(checksums.size > 0, "SHA256SUMS en az bir SQL girdisi taşımalıdır");
  return checksums;
}

export function buildMigrationPlan(sqlFiles, checksumText) {
  invariant(sqlFiles instanceof Map, "SQL inventory Map olmalıdır");
  const checksums = parseChecksumManifest(checksumText);
  const actualNames = [...sqlFiles.keys()].sort(compareAscii);
  const recordedNames = [...checksums.keys()];
  invariant(
    JSON.stringify(recordedNames) === JSON.stringify(actualNames),
    "SHA256SUMS inventory farkı",
  );
  const byVersion = new Map();
  for (const fileName of actualNames) {
    const match = SQL_FILE_PATTERN.exec(fileName);
    invariant(match?.groups, "Geçersiz migration dosya adı: " + fileName);
    const bytes = sqlFiles.get(fileName);
    invariant(Buffer.isBuffer(bytes), "Migration bytes Buffer olmalıdır");
    decodeCanonicalText(bytes, fileName);
    const actualDigest = sha256(bytes);
    invariant(
      actualDigest === checksums.get(fileName),
      "Migration checksum mismatch: " + fileName,
    );
    const version = Number.parseInt(match.groups.version, 10);
    invariant(Number.isSafeInteger(version), "Geçersiz migration version");
    const migration = byVersion.get(version) ?? {
      version,
      versionToken: match.groups.version,
      name: match.groups.name,
    };
    invariant(
      migration.name === match.groups.name,
      "Migration version adı uyuşmuyor",
    );
    const direction = match.groups.direction === ".up" ? "up" : "down";
    invariant(
      migration[direction] === undefined,
      "Tekrarlanan migration direction",
    );
    migration[direction] = { checksum: actualDigest, fileName };
    byVersion.set(version, migration);
  }
  const plan = [...byVersion.values()].sort(
    (left, right) => left.version - right.version,
  );
  let previousVersion = 0;
  for (const migration of plan) {
    invariant(
      migration.version > previousVersion,
      "Migration version sırası bozuk",
    );
    invariant(migration.up, "Eksik up migration");
    invariant(migration.down, "Eksik down migration");
    previousVersion = migration.version;
  }
  return plan;
}

function collectMigrationPlan() {
  const entries = readdirSync(migrationsDirectory, { withFileTypes: true });
  const sqlFiles = new Map();
  for (const entry of entries) {
    invariant(
      entry.isFile(),
      "db/migrations yalnız regular file taşımalıdır: " + entry.name,
    );
    if (entry.name === "SHA256SUMS") {
      continue;
    }
    invariant(
      SQL_FILE_PATTERN.test(entry.name),
      "Beklenmeyen migration artifact'i: " + entry.name,
    );
    sqlFiles.set(
      entry.name,
      readBoundedRegularFile(
        path.join(migrationsDirectory, entry.name),
        "migration " + entry.name,
      ),
    );
  }
  invariant(
    entries.length === sqlFiles.size + 1,
    "db/migrations exact SQL + SHA256SUMS inventory'si taşımalıdır",
  );
  return buildMigrationPlan(
    sqlFiles,
    readCanonicalText(
      path.join(migrationsDirectory, "SHA256SUMS"),
      "SHA256SUMS",
    ),
  );
}

export const EXPECTED_COMPOSE_TEXT = canonical([
  "# Inert contract only. No PostgreSQL service can be created from this file until",
  "# a canonical exact-digest scan and owner/security admission promote a reviewed",
  "# candidate into \x60services\x60.",
  "x-hedefora-postgres-candidate:",
  "  admission: BLOCKED_SECURITY",
  "  blocked_reason: exact_digest_vulnerability_admission_pending",
  "  planned-service:",
  "    image: " + POSTGRES_CANDIDATE_IMAGE,
  "    platform: linux/amd64",
  "    command:",
  "      - postgres",
  "      - -c",
  "      - password_encryption=scram-sha-256",
  "    postgres:",
  "      database: hedefora_dev",
  "      bootstrap-admin-role: hedefora_dev",
  "      initdb-arguments:",
  "        - --auth-host=scram-sha-256",
  "        - --data-checksums",
  "        - --encoding=UTF8",
  "    credential-policy:",
  "      source: environment",
  "      minimum-bytes: 12",
  "      required-variable-names:",
  "        - HEDEFORA_DEV_POSTGRES_PASSWORD",
  "        - HEDEFORA_DEV_POSTGRES_MIGRATION_PASSWORD",
  "        - HEDEFORA_DEV_POSTGRES_APP_PASSWORD",
  "        - HEDEFORA_DEV_POSTGRES_WORKER_PASSWORD",
  "        - HEDEFORA_DEV_POSTGRES_READONLY_PASSWORD",
  "    network-boundary:",
  "      host-address: 127.0.0.1",
  "      host-port-variable-name: HEDEFORA_DEV_POSTGRES_PORT",
  "      container-port: 5432",
  "    storage-contract:",
  "      data-volume-name: postgres_data",
  "      data-target: /var/lib/postgresql/data",
  "      read-only-bind-targets:",
  "        ./postgres/initdb/010_roles.sql: /docker-entrypoint-initdb.d/010_roles.sql",
  "        ../db/migrations: /opt/hedefora/migrations",
  "    healthcheck-contract:",
  "      authentication: scram-sha-256",
  "      interval: 5s",
  "      timeout: 5s",
  "      retries: 12",
  "      start-period: 10s",
  "      validates:",
  "        - tcp-accepting-connections",
  "        - managed-role-attributes",
  "        - managed-role-scram-verifiers",
  "    security_opt:",
  "      - no-new-privileges:true",
  "    shm_size: 128mb",
  "    stop_grace_period: 30s",
  "    logging:",
  "      driver: json-file",
  "      options:",
  '        max-file: "3"',
  "        max-size: 10m",
  "",
  "services: {}",
]);

export function validateComposeContractText(text) {
  invariant(
    text === EXPECTED_COMPOSE_TEXT,
    "compose.dev.yml exact inert candidate profile drift",
  );
}

function renderExpectedMigrationContract(plan) {
  invariant(
    Array.isArray(plan) && plan.length === 1,
    "Migration plan exact v0->v1 olmalıdır",
  );
  const migration = plan[0];
  invariant(migration.version === 1, "Migration version 1 olmalıdır");
  invariant(
    migration.name === "database_foundation",
    "Migration name database_foundation olmalıdır",
  );
  invariant(
    migration.up.checksum === EXPECTED_UP_SHA256,
    "Approved up migration SHA-256 drift",
  );
  invariant(
    migration.down.checksum === EXPECTED_DOWN_SHA256,
    "Approved down migration SHA-256 drift",
  );
  return canonical([
    "contract_version: 1",
    "postgresql_major: 17",
    "compatibility_classification: additive",
    "current_version: 1",
    "previous_release_version: 0",
    "required_extensions: []",
    "",
    "runner:",
    "  client: psql",
    "  client_major: 17",
    "  psqlrc: disabled",
    "  on_error_stop: required",
    "  connection_role: hedefora_migration",
    "  transaction_owner: migration_file",
    "  pending_versions_only: true",
    "  verify_before_connect: true",
    "  checksum:",
    "    algorithm: sha256",
    "    encoding: lowercase_hex",
    "    manifest: db/migrations/SHA256SUMS",
    "    exact_inventory: true",
    "    reject_symlink_or_non_regular: true",
    "  advisory_lock:",
    "    function: pg_catalog.pg_advisory_xact_lock",
    "    scope: transaction",
    "    key: 5216686130049544801",
    "  transaction_timeouts:",
    "    enforcement: set_local_before_advisory_lock",
    "    lock: 3s",
    "    statement: 15s",
    "    idle_in_transaction_session: 15s",
    "  failure_behavior:",
    "    partial_commit: forbidden",
    "    continue_after_error: forbidden",
    "    checksum_mismatch: fail_closed",
    "    lock_bypass: forbidden",
    "",
    "ledger:",
    "  relation: hedefora_meta.schema_migrations",
    "  owner: hedefora_migration",
    "  runtime_access: none",
    "  primary_key: version",
    "  recorded_fields:",
    "    - version",
    "    - name",
    "    - up_checksum_sha256",
    "    - applied_at",
    "    - applied_by",
    "",
    "migrations:",
    "  - version: 1",
    "    name: database_foundation",
    "    previous_version: 0",
    "    up: db/migrations/" + migration.up.fileName,
    "    down: db/migrations/" + migration.down.fileName,
    "    up_checksum_sha256: " + migration.up.checksum,
    "    down_checksum_sha256: " + migration.down.checksum,
    "    transaction: required",
    "    advisory_lock: required",
    "    immutable_after_merge: true",
    "    destructive_up: false",
    "    down_policy: only_when_latest_and_application_schema_empty",
    "    upgrade_from: [0]",
  ]);
}

export function validateMigrationContractText(text, plan) {
  invariant(
    text === renderExpectedMigrationContract(plan),
    "migrations.yaml exact SQL/SHA/timeout profile drift",
  );
}

const EXPECTED_ROLE_CONTRACT_TEXT = canonical([
  "contract_version: 1",
  "postgresql_major: 17",
  "",
  "database:",
  "  owner: environment_bootstrap_admin",
  "  runtime_must_not_own_database: true",
  "  public_privileges:",
  "    connect: false",
  "    temporary: false",
  "",
  "roles:",
  "  migration:",
  "    name: hedefora_migration",
  "    login: true",
  "    inherit: false",
  "    superuser: false",
  "    create_database: false",
  "    create_role: false",
  "    replication: false",
  "    bypass_row_level_security: false",
  "    memberships: []",
  "    credential_source: environment_secret",
  "    runtime: false",
  "    database_privileges: [connect, create]",
  "    owns:",
  "      - schema: hedefora",
  "      - schema: hedefora_meta",
  "      - relation: hedefora_meta.schema_migrations",
  "",
  "  app:",
  "    name: hedefora_app",
  "    login: true",
  "    inherit: false",
  "    superuser: false",
  "    create_database: false",
  "    create_role: false",
  "    replication: false",
  "    bypass_row_level_security: false",
  "    memberships: []",
  "    credential_source: environment_secret",
  "    runtime: true",
  "    database_privileges: [connect]",
  "    owns: []",
  "",
  "  worker:",
  "    name: hedefora_worker",
  "    login: true",
  "    inherit: false",
  "    superuser: false",
  "    create_database: false",
  "    create_role: false",
  "    replication: false",
  "    bypass_row_level_security: false",
  "    memberships: []",
  "    credential_source: environment_secret",
  "    runtime: true",
  "    database_privileges: [connect]",
  "    owns: []",
  "",
  "  readonly:",
  "    name: hedefora_readonly",
  "    login: true",
  "    inherit: false",
  "    superuser: false",
  "    create_database: false",
  "    create_role: false",
  "    replication: false",
  "    bypass_row_level_security: false",
  "    memberships: []",
  "    credential_source: environment_secret",
  "    runtime: true",
  "    default_transaction_read_only: true",
  "    database_privileges: [connect]",
  "    owns: []",
  "",
  "schemas:",
  "  hedefora:",
  "    owner: hedefora_migration",
  "    public_privileges: []",
  "    role_privileges:",
  "      hedefora_app: [usage]",
  "      hedefora_worker: [usage]",
  "      hedefora_readonly: [usage]",
  "    default_object_privileges:",
  "      tables:",
  "        hedefora_app: [select, insert, update, delete]",
  "        hedefora_worker: [select, insert, update, delete]",
  "        hedefora_readonly: [select]",
  "      sequences:",
  "        hedefora_app: [usage, select]",
  "        hedefora_worker: [usage, select]",
  "        hedefora_readonly: []",
  "      functions:",
  "        hedefora_app: [execute]",
  "        hedefora_worker: [execute]",
  "        hedefora_readonly: []",
  "      types:",
  "        hedefora_app: [usage]",
  "        hedefora_worker: [usage]",
  "        hedefora_readonly: [usage]",
  "",
  "  hedefora_meta:",
  "    owner: hedefora_migration",
  "    public_privileges: []",
  "    role_privileges:",
  "      hedefora_app: []",
  "      hedefora_worker: []",
  "      hedefora_readonly: []",
  "    runtime_relation_privileges: []",
  "",
  "migration_creator_public_defaults:",
  "  tables: []",
  "  sequences: []",
  "  functions: []",
  "  types: []",
  "",
  "required_negative_assertions:",
  "  - runtime_roles_do_not_own_database_or_objects",
  "  - runtime_roles_cannot_create_in_hedefora",
  "  - runtime_roles_cannot_access_hedefora_meta",
  "  - readonly_cannot_insert_update_or_delete",
  "  - app_and_worker_cannot_change_schema_or_role_policy",
  "  - public_cannot_connect_or_access_application_schemas",
]);

export function validateRoleContractText(text) {
  invariant(
    text === EXPECTED_ROLE_CONTRACT_TEXT,
    "roles.yaml exact role/ACL/default-privilege profile drift",
  );
}

const EXPECTED_INIT_TEXT = canonical([
  "\\set ON_ERROR_STOP on",
  "",
  "\\getenv migration_password HEDEFORA_DEV_POSTGRES_MIGRATION_PASSWORD",
  "\\getenv app_password HEDEFORA_DEV_POSTGRES_APP_PASSWORD",
  "\\getenv worker_password HEDEFORA_DEV_POSTGRES_WORKER_PASSWORD",
  "\\getenv readonly_password HEDEFORA_DEV_POSTGRES_READONLY_PASSWORD",
  "",
  "SELECT",
  "  pg_catalog.octet_length(:'migration_password') >= 12",
  "  AND pg_catalog.octet_length(:'app_password') >= 12",
  "  AND pg_catalog.octet_length(:'worker_password') >= 12",
  "  AND pg_catalog.octet_length(:'readonly_password') >= 12",
  "  AS credentials_valid",
  "\\gset",
  "",
  "\\if :credentials_valid",
  "\\else",
  "  DO $invalid_local_role_credentials$",
  "  BEGIN",
  "    RAISE EXCEPTION USING",
  "      ERRCODE = '22023',",
  "      MESSAGE = 'local role credentials must be at least 12 bytes';",
  "  END",
  "  $invalid_local_role_credentials$;",
  "\\endif",
  "",
  "BEGIN;",
  "",
  "CREATE ROLE hedefora_migration",
  "  LOGIN",
  "  NOINHERIT",
  "  NOSUPERUSER",
  "  NOCREATEDB",
  "  NOCREATEROLE",
  "  NOREPLICATION",
  "  NOBYPASSRLS",
  "  PASSWORD :'migration_password';",
  "",
  "CREATE ROLE hedefora_app",
  "  LOGIN",
  "  NOINHERIT",
  "  NOSUPERUSER",
  "  NOCREATEDB",
  "  NOCREATEROLE",
  "  NOREPLICATION",
  "  NOBYPASSRLS",
  "  PASSWORD :'app_password';",
  "",
  "CREATE ROLE hedefora_worker",
  "  LOGIN",
  "  NOINHERIT",
  "  NOSUPERUSER",
  "  NOCREATEDB",
  "  NOCREATEROLE",
  "  NOREPLICATION",
  "  NOBYPASSRLS",
  "  PASSWORD :'worker_password';",
  "",
  "CREATE ROLE hedefora_readonly",
  "  LOGIN",
  "  NOINHERIT",
  "  NOSUPERUSER",
  "  NOCREATEDB",
  "  NOCREATEROLE",
  "  NOREPLICATION",
  "  NOBYPASSRLS",
  "  PASSWORD :'readonly_password';",
  "",
  "REVOKE ALL PRIVILEGES ON DATABASE hedefora_dev FROM PUBLIC;",
  "REVOKE ALL PRIVILEGES ON DATABASE hedefora_dev",
  "  FROM hedefora_migration, hedefora_app, hedefora_worker, hedefora_readonly;",
  "",
  "GRANT CONNECT, CREATE ON DATABASE hedefora_dev TO hedefora_migration;",
  "GRANT CONNECT ON DATABASE hedefora_dev",
  "  TO hedefora_app, hedefora_worker, hedefora_readonly;",
  "",
  "REVOKE ALL PRIVILEGES ON SCHEMA public FROM PUBLIC;",
  "REVOKE ALL PRIVILEGES ON SCHEMA public",
  "  FROM hedefora_migration, hedefora_app, hedefora_worker, hedefora_readonly;",
  "",
  "ALTER ROLE hedefora_migration IN DATABASE hedefora_dev",
  "  SET search_path = pg_catalog, hedefora;",
  "ALTER ROLE hedefora_app IN DATABASE hedefora_dev",
  "  SET search_path = pg_catalog, hedefora;",
  "ALTER ROLE hedefora_worker IN DATABASE hedefora_dev",
  "  SET search_path = pg_catalog, hedefora;",
  "ALTER ROLE hedefora_readonly IN DATABASE hedefora_dev",
  "  SET search_path = pg_catalog, hedefora;",
  "ALTER ROLE hedefora_readonly",
  "  SET default_transaction_read_only = on;",
  "",
  "COMMIT;",
]);

export function validateInitSourceText(text) {
  invariant(
    text === EXPECTED_INIT_TEXT,
    "010_roles.sql exact active role/init guard profile drift",
  );
}

export function runStaticChecks() {
  const plan = collectMigrationPlan();
  validateComposeContractText(
    readCanonicalText(composeFile, "compose.dev.yml"),
  );
  validateMigrationContractText(
    readCanonicalText(migrationContractFile, "migrations.yaml"),
    plan,
  );
  validateRoleContractText(readCanonicalText(roleContractFile, "roles.yaml"));
  validateInitSourceText(readCanonicalText(initFile, "010_roles.sql"));
  return {
    composeCandidateImage: POSTGRES_CANDIDATE_IMAGE,
    liveImageAdmission: "BLOCKED_SECURITY",
    migrationCount: plan.length,
    migrationVersions: plan.map((migration) => migration.version),
    timeoutProfile: {
      lock: "3s",
      statement: "15s",
      idleInTransactionSession: "15s",
    },
  };
}

function isMainModule() {
  if (!process.argv[1]) {
    return false;
  }
  return normalizedPath(process.argv[1]) === normalizedPath(sourceFile);
}

function main() {
  const args = process.argv.slice(2);
  invariant(args.length === 1, "Beklenmeyen argument");
  if (args[0] === "--live") {
    throw new HarnessError(
      "IMAGE_ADMISSION_BLOCKED: live PostgreSQL execution owner/security admission bekliyor",
    );
  }
  if (args[0] === "--static") {
    const result = runStaticChecks();
    process.stdout.write(
      JSON.stringify({ status: "PASS", mode: "static", ...result }) + "\n",
    );
    return;
  }
  throw new HarnessError(
    "Kullanım: node tests/integration/postgres/run.mjs --static|--live",
  );
}

if (isMainModule()) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      "PostgreSQL integration harness FAIL: " + message + "\n",
    );
    process.exitCode = 1;
  }
}
