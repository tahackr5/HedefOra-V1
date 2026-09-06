// The live runner owns admission, authentication, process lifecycle,
// secret redaction, cleanup, and the immutable-file/static preflight.
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";

export const UP_SHA256 =
  "86768275fac32ba13bb235f9a10599e430e3b4f5bd6fec3a1f27c6403256bea7";
export const DOWN_SHA256 =
  "25360d8052134a0678329398f8f3a14837f699ff7eb83ac7327fe1a277f7dbf0";
export const MIGRATION_LOCK = "5216686130049544801";
export const DATABASE = "hedefora_dev";
export const ROLE_NAMES = Object.freeze({
  admin: "hedefora_dev",
  migration: "hedefora_migration",
  app: "hedefora_app",
  worker: "hedefora_worker",
  readonly: "hedefora_readonly",
});
export const LIMITS = Object.freeze({
  commandMs: 12_000,
  sessionMs: 45_000,
  sessionQueryMs: 22_000,
  lockMinMs: 2_800,
  lockMaxMs: 6_000,
  statementMinMs: 14_500,
  statementMaxMs: 20_000,
  idleMinMs: 14_500,
  idleMaxMs: 20_000,
  backendCleanupMs: 3_000,
  pollMs: 200,
  stdoutBytes: 65_536,
});
const SAFE_CASE = /^[a-z][a-z0-9.-]{0,95}$/;
const SAFE_STATE = /^[0-9A-Z]{5}$/;
const LOGIN_KEYS = Object.freeze(["migration", "app", "worker"]);
const MANAGED_KEYS = Object.freeze([...LOGIN_KEYS, "readonly"]);
const lit = (value) => `'${String(value).replaceAll("'", "''")}'`;
const ident = (value) => `"${String(value).replaceAll('"', '""')}"`;
const sqlRoles = MANAGED_KEYS.map((key) => lit(ROLE_NAMES[key])).join(",");

export class SqlAcceptanceError extends Error {
  constructor(caseId, code) {
    super(
      `PG_SQL_ACCEPTANCE:${SAFE_CASE.test(caseId) ? caseId : "invalid-case"}:${code}`,
    );
    this.name = "SqlAcceptanceError";
    this.caseId = SAFE_CASE.test(caseId) ? caseId : "invalid-case";
    this.code = code;
  }
}
function check(value, caseId, code) {
  if (!value) throw new SqlAcceptanceError(caseId, code);
}
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export function verifyMigrationBundle(bundle) {
  const id = "preflight";
  check(bundle && typeof bundle === "object", id, "BUNDLE_MISSING");
  for (const [key, digest] of [
    ["upSql", UP_SHA256],
    ["downSql", DOWN_SHA256],
  ]) {
    check(typeof bundle[key] === "string", id, "SQL_BYTES_MISSING");
    check(
      createHash("sha256").update(bundle[key], "utf8").digest("hex") === digest,
      id,
      "IMMUTABLE_SQL_HASH_MISMATCH",
    );
  }
  const plan = bundle.plan;
  check(
    Array.isArray(plan) && plan.length === 1,
    id,
    "PLAN_INVENTORY_MISMATCH",
  );
  const item = plan[0];
  check(
    item.version === 1 &&
      item.versionToken === "000001" &&
      item.name === "database_foundation" &&
      item.up?.checksum === UP_SHA256 &&
      item.down?.checksum === DOWN_SHA256 &&
      item.up?.fileName === "000001_database_foundation.up.sql" &&
      item.down?.fileName === "000001_database_foundation.down.sql",
    id,
    "PLAN_IDENTITY_MISMATCH",
  );
  return Object.freeze({ upSql: bundle.upSql, downSql: bundle.downSql, plan });
}

// A returned SQLSTATE is admissible only when the executor establishes its
// PostgreSQL origin. A harness timeout/cancel/channel-close is never a SQL error.
export function validateResult(
  result,
  caseId,
  { states = null, persistent = false } = {},
) {
  check(SAFE_CASE.test(caseId), "invalid-case", "CASE_ID_INVALID");
  check(
    result && typeof result === "object",
    caseId,
    "EXECUTOR_RESULT_MISSING",
  );
  check(
    Number.isFinite(result.elapsedMs) && result.elapsedMs >= 0,
    caseId,
    "DURATION_MISSING",
  );
  check(
    typeof result.stdout === "string" &&
      Buffer.byteLength(result.stdout, "utf8") <= LIMITS.stdoutBytes,
    caseId,
    "OUTPUT_SHAPE_INVALID",
  );
  check(
    result.origin !== "timeout" &&
      result.origin !== "cancel" &&
      result.origin !== "channel",
    caseId,
    "EXECUTOR_TERMINATED",
  );
  if (states) {
    check(
      Number.isInteger(result.rawExit) && result.rawExit !== 0,
      caseId,
      "EXPECTED_FAILURE_SUCCEEDED",
    );
    check(
      result.origin === "postgres" &&
        typeof result.sqlState === "string" &&
        SAFE_STATE.test(result.sqlState) &&
        states.includes(result.sqlState),
      caseId,
      "SQLSTATE_MISMATCH",
    );
    check(
      result.connectionClosed === true,
      caseId,
      "ERROR_CONNECTION_NOT_CLOSED",
    );
  } else {
    check(result.origin === "postgres", caseId, "SUCCESS_ORIGIN_MISMATCH");
    check(
      result.rawExit === 0 &&
        (result.sqlState === null || result.sqlState === undefined),
      caseId,
      "EXPECTED_SUCCESS_FAILED",
    );
    check(
      result.connectionClosed === !persistent,
      caseId,
      "CONNECTION_LIFECYCLE_MISMATCH",
    );
  }
  return result;
}
export function parseJsonOutput(result, caseId) {
  const lines = result.stdout.split(/\r?\n/).filter((line) => line.trim());
  check(lines.length === 1, caseId, "JSON_FRAME_COUNT_MISMATCH");
  let value;
  try {
    value = JSON.parse(lines[0]);
  } catch {
    throw new SqlAcceptanceError(caseId, "JSON_INVALID");
  }
  check(
    value !== null && typeof value === "object" && !Array.isArray(value),
    caseId,
    "JSON_OBJECT_REQUIRED",
  );
  return value;
}

const JSON_CLOCK = "SELECT json_build_object('now', clock_timestamp());";
const JSON_LEDGER_PRESENT =
  "SELECT json_build_object('present', to_regclass('hedefora_meta.schema_migrations') IS NOT NULL);";
const JSON_LEDGER = `SELECT json_build_object('rows', COALESCE(json_agg(row_to_json(m) ORDER BY version), '[]'::json)) FROM hedefora_meta.schema_migrations AS m;`;
const JSON_STATE = `
SELECT json_build_object(
 'schemas', (SELECT COALESCE(json_agg(row_to_json(x) ORDER BY nspname), '[]'::json) FROM
  (SELECT nspname,nspowner,nspacl FROM pg_namespace WHERE nspname IN ('hedefora','hedefora_meta','public')) x),
 'relations', (SELECT COALESCE(json_agg(row_to_json(x) ORDER BY nspname,relname), '[]'::json) FROM
  (SELECT n.nspname,c.relname,c.relkind,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('hedefora','hedefora_meta')) x),
 'columns', (SELECT COALESCE(json_agg(row_to_json(x) ORDER BY nspname,relname,attnum), '[]'::json) FROM
  (SELECT n.nspname,c.relname,a.attnum,a.attname,a.atttypid,a.attnotnull,a.attidentity,pg_get_expr(d.adbin,d.adrelid) AS default_expr
   FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
   WHERE n.nspname IN ('hedefora','hedefora_meta') AND a.attnum>0 AND NOT a.attisdropped) x),
 'constraints', (SELECT COALESCE(json_agg(row_to_json(x) ORDER BY nspname,conname), '[]'::json) FROM
  (SELECT n.nspname,c.conname,c.contype,c.conrelid,pg_get_constraintdef(c.oid) AS definition
   FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname IN ('hedefora','hedefora_meta')) x),
 'routines', (SELECT COALESCE(json_agg(row_to_json(x) ORDER BY nspname,proname,args), '[]'::json) FROM
  (SELECT n.nspname,p.proname,p.proowner,p.proacl,pg_get_function_identity_arguments(p.oid) AS args,p.prosrc
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('hedefora','hedefora_meta')) x),
 'types', (SELECT COALESCE(json_agg(row_to_json(x) ORDER BY nspname,typname), '[]'::json) FROM
  (SELECT n.nspname,t.typname,t.typowner,t.typacl FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
   WHERE n.nspname IN ('hedefora','hedefora_meta')) x),
 'defaults', (SELECT COALESCE(json_agg(row_to_json(x) ORDER BY defaclrole,defaclnamespace,defaclobjtype), '[]'::json) FROM
  (SELECT defaclrole,defaclnamespace,defaclobjtype,defaclacl FROM pg_default_acl WHERE defaclrole=(SELECT oid FROM pg_roles WHERE rolname='hedefora_migration')) x),
 'databases', (SELECT COALESCE(json_agg(row_to_json(x) ORDER BY datname), '[]'::json) FROM
  (SELECT datname,datdba,datacl,datallowconn FROM pg_database) x),
 'roles', (SELECT COALESCE(json_agg(row_to_json(x) ORDER BY rolname), '[]'::json) FROM
  (SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls FROM pg_roles WHERE rolname IN (${sqlRoles})) x),
 'memberships', (SELECT COALESCE(json_agg(row_to_json(x) ORDER BY roleid,member,grantor), '[]'::json) FROM
  (SELECT m.* FROM pg_auth_members m WHERE m.member IN (SELECT oid FROM pg_roles WHERE rolname IN (${sqlRoles}))
   OR m.roleid IN (SELECT oid FROM pg_roles WHERE rolname IN (${sqlRoles}))) x),
 'ledgerPresent', to_regclass('hedefora_meta.schema_migrations') IS NOT NULL,
 'renamedLedgerPresent', to_regclass('hedefora_meta.matrix_missing_ledger') IS NOT NULL,
 'fixturePresent', to_regclass('hedefora.matrix_rows') IS NOT NULL,
 'sequencePresent', to_regclass('hedefora.matrix_sequence') IS NOT NULL);`;

const ADVISORY_BASES = Object.freeze([
  "pg_advisory_lock",
  "pg_advisory_lock_shared",
  "pg_advisory_xact_lock",
  "pg_advisory_xact_lock_shared",
  "pg_try_advisory_lock",
  "pg_try_advisory_lock_shared",
  "pg_try_advisory_xact_lock",
  "pg_try_advisory_xact_lock_shared",
]);
export const ADVISORY_CASES = Object.freeze(
  ADVISORY_BASES.flatMap((name) => [
    Object.freeze({
      name,
      signature: `${name}(bigint)`,
      expression: `pg_catalog.${name}(${MIGRATION_LOCK}::bigint)`,
      allowedMigration: name === "pg_advisory_xact_lock",
    }),
    Object.freeze({
      name,
      signature: `${name}(integer,integer)`,
      expression: `pg_catalog.${name}(1214604391::integer,1::integer)`,
      allowedMigration: false,
    }),
  ]),
);

const FIXTURES = `
BEGIN;
CREATE TYPE hedefora.matrix_mood AS ENUM ('ready','done');
CREATE TABLE hedefora.matrix_rows (id bigint PRIMARY KEY, label text NOT NULL, mood hedefora.matrix_mood NOT NULL);
CREATE SEQUENCE hedefora.matrix_sequence;
CREATE FUNCTION hedefora.matrix_fn() RETURNS integer LANGUAGE sql IMMUTABLE AS 'SELECT 7';
INSERT INTO hedefora.matrix_rows VALUES (100,'seed','ready');
COMMIT;`;

/**
 * No process/fs/network capability is used here. This module may only be invoked
 * after the caller admits an immutable runtime and validates all source files.
 * See README.md for the executor and persistent-session contracts.
 */
export async function runLiveSqlAcceptance({
  verifyBeforeConnect,
  psql,
  openSession,
}) {
  check(
    typeof verifyBeforeConnect === "function" &&
      typeof psql === "function" &&
      typeof openSession === "function",
    "preflight",
    "EXECUTOR_CONTRACT_MISSING",
  );
  let supplied;
  try {
    supplied = await verifyBeforeConnect();
  } catch {
    throw new SqlAcceptanceError("preflight", "STATIC_PREFLIGHT_FAILED");
  }
  const source = verifyMigrationBundle(supplied); // Before every connection.
  const evidence = [];
  let backendSerial = 0;
  const record = (id, detail = {}) =>
    evidence.push(Object.freeze({ caseId: id, status: "PASS", ...detail }));
  async function call(
    id,
    role,
    inputSql,
    {
      variables = {},
      database = DATABASE,
      timeoutMs = LIMITS.commandMs,
      states = null,
    } = {},
  ) {
    let result;
    try {
      result = await psql({
        caseId: id,
        role,
        database,
        inputSql,
        variables,
        timeoutMs,
      });
    } catch {
      throw new SqlAcceptanceError(id, "EXECUTOR_REJECTED");
    }
    return validateResult(result, id, { states });
  }
  async function json(id, role, inputSql, options) {
    return parseJsonOutput(await call(id, role, inputSql, options), id);
  }
  async function snapshot(id) {
    const state = await json(`${id}.state`, "admin", JSON_STATE);
    if (state.ledgerPresent)
      state.ledger = await json(`${id}.ledger`, "admin", JSON_LEDGER);
    if (state.renamedLedgerPresent)
      state.renamedLedger = await json(
        `${id}.renamed-ledger`,
        "admin",
        "SELECT json_build_object('rows',COALESCE(json_agg(row_to_json(m) ORDER BY version),'[]'::json)) FROM hedefora_meta.matrix_missing_ledger m;",
      );
    if (state.fixturePresent)
      state.fixture = await json(
        `${id}.rows`,
        "admin",
        "SELECT json_build_object('rows',json_agg(row_to_json(r) ORDER BY id)) FROM hedefora.matrix_rows r;",
      );
    if (state.sequencePresent)
      state.sequence = await json(
        `${id}.seq`,
        "admin",
        "SELECT json_build_object('lastValue',last_value,'isCalled',is_called) FROM hedefora.matrix_sequence;",
      );
    return canonical(state);
  }
  async function negative(id, role, inputSql, states, options = {}) {
    const before = await snapshot(id);
    const result = await call(id, role, inputSql, { ...options, states });
    check((await snapshot(id)) === before, id, "FAILURE_NOT_ATOMIC");
    record(id, { sqlState: result.sqlState });
    return result;
  }
  async function requireV0(id) {
    const observed = await json(
      id,
      "admin",
      "SELECT json_build_object('ledger',to_regclass('hedefora_meta.schema_migrations') IS NOT NULL,'schema',EXISTS(SELECT 1 FROM pg_namespace WHERE nspname IN ('hedefora','hedefora_meta')));",
    );
    check(
      observed.ledger === false && observed.schema === false,
      id,
      "EXPECTED_V0_MISSING",
    );
  }
  async function ledger(id) {
    const present = await json(`${id}.present`, "admin", JSON_LEDGER_PRESENT);
    if (!present.present) return [];
    const value = await json(id, "admin", JSON_LEDGER);
    check(Array.isArray(value.rows), id, "LEDGER_ROWS_MISSING");
    return value.rows;
  }
  async function applyPending(id) {
    const rows = await ledger(`${id}.before`);
    if (rows.length) {
      check(
        rows.length === 1 &&
          rows[0].version === 1 &&
          rows[0].name === "database_foundation" &&
          rows[0].up_checksum_sha256 === UP_SHA256,
        id,
        "LEDGER_DRIFT",
      );
      return 0;
    }
    await call(id, "migration", source.upSql, {
      variables: { migration_checksum: UP_SHA256 },
    });
    return 1;
  }
  const downOptions = { variables: { expected_up_checksum: UP_SHA256 } };
  const version = await json(
    "engine.pg17",
    "admin",
    "SELECT json_build_object('version',current_setting('server_version_num')::integer,'database',current_database(),'user',current_user,'auth',system_user);",
  );
  check(
    Number.isInteger(version.version) &&
      version.version >= 170000 &&
      version.version < 180000 &&
      version.database === DATABASE &&
      version.user === ROLE_NAMES.admin &&
      version.auth === `scram-sha-256:${ROLE_NAMES.admin}`,
    "engine.pg17",
    "ENGINE_OR_ADMIN_MISMATCH",
  );
  record("engine.pg17", { serverVersionNum: version.version });
  await requireV0("migration.initial-v0");
  record("migration.initial-v0");

  const roles = await json(
    "roles.catalog",
    "admin",
    `SELECT json_build_object('roles',(SELECT json_agg(row_to_json(r) ORDER BY rolname) FROM
    (SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,
     rolpassword IS NULL AS password_null,rolpassword LIKE 'SCRAM-SHA-256$%' AS password_scram FROM pg_authid WHERE rolname IN (${sqlRoles})) r),
    'memberships',(SELECT count(*) FROM pg_auth_members WHERE member IN (SELECT oid FROM pg_roles WHERE rolname IN (${sqlRoles})) OR roleid IN (SELECT oid FROM pg_roles WHERE rolname IN (${sqlRoles}))),
    'passwordEncryption',current_setting('password_encryption'));
  `,
  );
  check(
    Array.isArray(roles.roles) &&
      roles.roles.length === 4 &&
      roles.memberships === 0 &&
      roles.passwordEncryption === "scram-sha-256",
    "roles.catalog",
    "ROLE_INVENTORY_OR_MEMBERSHIP_MISMATCH",
  );
  for (const key of MANAGED_KEYS) {
    const row = roles.roles.find((item) => item.rolname === ROLE_NAMES[key]);
    check(
      row &&
        [
          "rolsuper",
          "rolinherit",
          "rolcreaterole",
          "rolcreatedb",
          "rolreplication",
          "rolbypassrls",
        ].every((attr) => row[attr] === false) &&
        row.rolcanlogin === (key !== "readonly") &&
        row.password_null === (key === "readonly") &&
        (key === "readonly"
          ? row.password_scram === null
          : row.password_scram === true),
      "roles.catalog",
      "ROLE_ATTRIBUTE_OR_SCRAM_MISMATCH",
    );
  }
  record("roles.catalog");
  for (const key of LOGIN_KEYS) {
    const identity = await json(
      `roles.${key}.login`,
      key,
      "SELECT json_build_object('sessionUser',session_user,'currentUser',current_user,'auth',system_user,'searchPath',current_setting('search_path'));",
    );
    check(
      identity.sessionUser === ROLE_NAMES[key] &&
        identity.currentUser === ROLE_NAMES[key] &&
        identity.auth === `scram-sha-256:${ROLE_NAMES[key]}` &&
        identity.searchPath === "pg_catalog, hedefora",
      `roles.${key}.login`,
      "REAL_LOGIN_OR_SEARCH_PATH_MISMATCH",
    );
    record(`roles.${key}.login`);
  }
  // The startup code is server-correlated by the executor. NOLOGIN is proven
  // jointly by the catalog above; a password error alone is not that proof.
  await negative("roles.readonly.login-denied", "readonly", "SELECT 1;", [
    "28000",
    "28P01",
  ]);
  const databaseAcl = await json(
    "roles.database-acl",
    "admin",
    `SELECT json_build_object('rows',(SELECT json_agg(row_to_json(x) ORDER BY rolname,datname) FROM
    (SELECT r.rolname,d.datname,d.datallowconn,d.datdba=r.oid AS owned,
     has_database_privilege(r.oid,d.oid,'CONNECT') AS connect,has_database_privilege(r.oid,d.oid,'CREATE') AS create,
     has_database_privilege(r.oid,d.oid,'TEMP') AS temp,
     has_database_privilege(r.oid,d.oid,'CONNECT WITH GRANT OPTION,CREATE WITH GRANT OPTION,TEMP WITH GRANT OPTION') AS grant_option
     FROM pg_roles r CROSS JOIN pg_database d WHERE r.rolname IN (${sqlRoles})) x),
    'publicGranted',(SELECT count(*) FROM pg_database d CROSS JOIN LATERAL aclexplode(COALESCE(d.datacl,acldefault('d',d.datdba))) a WHERE a.grantee=0 AND d.datallowconn));`,
  );
  check(
    Array.isArray(databaseAcl.rows) && databaseAcl.publicGranted === 0,
    "roles.database-acl",
    "DATABASE_PUBLIC_ACL_MISMATCH",
  );
  for (const row of databaseAcl.rows) {
    if (!row.datallowconn) continue; // template0 cannot accept any connection.
    check(
      row.owned === false &&
        row.temp === false &&
        row.grant_option === false &&
        row.connect ===
          (row.datname === DATABASE && row.rolname !== ROLE_NAMES.readonly) &&
        row.create ===
          (row.datname === DATABASE && row.rolname === ROLE_NAMES.migration),
      "roles.database-acl",
      "DATABASE_ROLE_ACL_MISMATCH",
    );
  }
  const others = [
    ...new Set(
      databaseAcl.rows
        .filter((row) => row.datallowconn && row.datname !== DATABASE)
        .map((row) => row.datname),
    ),
  ].sort();
  check(
    canonical(others) === canonical(["postgres", "template1"]),
    "roles.database-acl",
    "UNEXPECTED_DATABASE_INVENTORY",
  );
  record("roles.database-acl");
  for (const key of LOGIN_KEYS)
    for (const database of others)
      await negative(
        `roles.${key}.${database}-connect-denied`,
        key,
        "SELECT 1;",
        ["42501"],
        { database },
      );

  await negative("migration.missing-up-checksum", "migration", source.upSql, [
    "22023",
  ]);
  await negative(
    "migration.after-create-rollback",
    "migration",
    source.upSql,
    ["23514"],
    { variables: { migration_checksum: "invalid_checksum" } },
  );
  await requireV0("migration.after-create-v0");
  const rollbackLock = await json(
    "migration.after-create-lock-release",
    "admin",
    `SELECT json_build_object('available',pg_try_advisory_xact_lock(${MIGRATION_LOCK}));`,
  );
  check(
    rollbackLock.available === true,
    "migration.after-create-lock-release",
    "ROLLBACK_LOCK_NOT_RELEASED",
  );
  record("migration.after-create-lock-release");
  const beforeClock = await json(
    "migration.up-clock-before",
    "admin",
    JSON_CLOCK,
  );
  check(
    (await applyPending("migration.first-up")) === 1,
    "migration.first-up",
    "PENDING_COUNT_MISMATCH",
  );
  const afterClock = await json(
    "migration.up-clock-after",
    "admin",
    JSON_CLOCK,
  );
  const appliedRows = await ledger("migration.applied-ledger");
  const applied = appliedRows[0];
  check(
    appliedRows.length === 1 &&
      applied.version === 1 &&
      applied.name === "database_foundation" &&
      applied.up_checksum_sha256 === UP_SHA256 &&
      applied.applied_by === ROLE_NAMES.migration &&
      Number.isFinite(Date.parse(applied.applied_at)) &&
      Date.parse(applied.applied_at) >= Date.parse(beforeClock.now) &&
      Date.parse(applied.applied_at) <= Date.parse(afterClock.now),
    "migration.first-up",
    "LEDGER_CONTENT_MISMATCH",
  );
  record("migration.first-up");
  const rerunBefore = await snapshot("migration.rerun");
  check(
    (await applyPending("migration.rerun")) === 0 &&
      (await snapshot("migration.rerun")) === rerunBefore,
    "migration.rerun",
    "RERUN_CHANGED_STATE",
  );
  record("migration.rerun", { pendingCount: 0 });
  await negative(
    "migration.duplicate-up-direct",
    "migration",
    source.upSql,
    ["42P06"],
    { variables: { migration_checksum: UP_SHA256 } },
  );
  await negative(
    "migration.missing-down-checksum",
    "migration",
    source.downSql,
    ["22023"],
  );
  await negative(
    "migration.checksum-mismatch",
    "migration",
    source.downSql,
    ["55000"],
    { variables: { expected_up_checksum: "0".repeat(64) } },
  );
  await call(
    "migration.nonlast-setup",
    "admin",
    `INSERT INTO hedefora_meta.schema_migrations(version,name,up_checksum_sha256) VALUES(2,'matrix_later',${lit(UP_SHA256)});`,
  );
  try {
    await negative(
      "migration.nonlast",
      "migration",
      source.downSql,
      ["55000"],
      downOptions,
    );
  } finally {
    await call(
      "migration.nonlast-cleanup",
      "admin",
      "DELETE FROM hedefora_meta.schema_migrations WHERE version=2 AND name='matrix_later';",
    );
  }
  await call(
    "migration.missing-row-setup",
    "admin",
    "DELETE FROM hedefora_meta.schema_migrations WHERE version=1;",
  );
  try {
    await negative(
      "migration.missing-ledger-row",
      "migration",
      source.downSql,
      ["55000"],
      downOptions,
    );
  } finally {
    await call(
      "migration.missing-row-cleanup",
      "admin",
      `INSERT INTO hedefora_meta.schema_migrations(version,name,up_checksum_sha256,applied_at,applied_by) VALUES(1,'database_foundation',${lit(UP_SHA256)},${lit(applied.applied_at)}::timestamptz,${lit(applied.applied_by)}::name);`,
    );
  }
  await call(
    "migration.missing-ledger-setup",
    "admin",
    "ALTER TABLE hedefora_meta.schema_migrations RENAME TO matrix_missing_ledger;",
  );
  try {
    await negative(
      "migration.missing-ledger-relation",
      "migration",
      source.downSql,
      ["42P01"],
      downOptions,
    );
  } finally {
    await call(
      "migration.missing-ledger-cleanup",
      "admin",
      "ALTER TABLE hedefora_meta.matrix_missing_ledger RENAME TO schema_migrations;",
    );
  }
  await call("migration.empty-down", "migration", source.downSql, downOptions);
  await requireV0("migration.empty-down-v0");
  record("migration.empty-down");
  await negative(
    "migration.down-on-v0",
    "migration",
    source.downSql,
    ["42P01"],
    downOptions,
  );
  check(
    (await applyPending("migration.reapply-up")) === 1,
    "migration.reapply-up",
    "PENDING_COUNT_MISMATCH",
  );
  record("migration.reapply-up");

  await call("acl.fixture-create", "migration", FIXTURES);
  const objectAcl = await json(
    "acl.objects",
    "admin",
    `SELECT json_build_object('rows',(SELECT json_agg(row_to_json(x) ORDER BY rolname) FROM
    (SELECT r.rolname,
     has_schema_privilege(r.oid,'hedefora','USAGE') AS schema_usage,has_schema_privilege(r.oid,'hedefora','CREATE') AS schema_create,
     has_schema_privilege(r.oid,'hedefora_meta','USAGE') AS meta_usage,has_schema_privilege(r.oid,'hedefora_meta','CREATE') AS meta_create,
     has_schema_privilege(r.oid,'public','USAGE') AS public_usage,has_schema_privilege(r.oid,'public','CREATE') AS public_create,
     has_table_privilege(r.oid,'hedefora.matrix_rows','SELECT') AS t_select,has_table_privilege(r.oid,'hedefora.matrix_rows','INSERT') AS t_insert,
     has_table_privilege(r.oid,'hedefora.matrix_rows','UPDATE') AS t_update,has_table_privilege(r.oid,'hedefora.matrix_rows','DELETE') AS t_delete,
     has_table_privilege(r.oid,'hedefora.matrix_rows','TRUNCATE') AS t_truncate,has_table_privilege(r.oid,'hedefora.matrix_rows','REFERENCES') AS t_references,
     has_table_privilege(r.oid,'hedefora.matrix_rows','TRIGGER') AS t_trigger,has_table_privilege(r.oid,'hedefora.matrix_rows','MAINTAIN') AS t_maintain,
     has_table_privilege(r.oid,'hedefora_meta.schema_migrations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') AS ledger_any,
     has_sequence_privilege(r.oid,'hedefora.matrix_sequence','USAGE') AS seq_usage,has_sequence_privilege(r.oid,'hedefora.matrix_sequence','SELECT') AS seq_select,
     has_sequence_privilege(r.oid,'hedefora.matrix_sequence','UPDATE') AS seq_update,
     has_function_privilege(r.oid,'hedefora.matrix_fn()','EXECUTE') AS fn_execute,has_type_privilege(r.oid,'hedefora.matrix_mood','USAGE') AS type_usage,
     (has_schema_privilege(r.oid,'hedefora','USAGE WITH GRANT OPTION,CREATE WITH GRANT OPTION')
       OR has_table_privilege(r.oid,'hedefora.matrix_rows','SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION,DELETE WITH GRANT OPTION,TRUNCATE WITH GRANT OPTION,REFERENCES WITH GRANT OPTION,TRIGGER WITH GRANT OPTION,MAINTAIN WITH GRANT OPTION')
       OR has_sequence_privilege(r.oid,'hedefora.matrix_sequence','USAGE WITH GRANT OPTION,SELECT WITH GRANT OPTION,UPDATE WITH GRANT OPTION')
       OR has_function_privilege(r.oid,'hedefora.matrix_fn()','EXECUTE WITH GRANT OPTION')
       OR has_type_privilege(r.oid,'hedefora.matrix_mood','USAGE WITH GRANT OPTION')) AS object_grant_option,
     EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('hedefora','hedefora_meta') AND c.relowner=r.oid) AS owns_relation
     FROM pg_roles r WHERE r.rolname IN (${sqlRoles})) x),
    'ownersCorrect',
      (SELECT bool_and(nspowner=(SELECT oid FROM pg_roles WHERE rolname='hedefora_migration')) FROM pg_namespace WHERE nspname IN ('hedefora','hedefora_meta'))
      AND (SELECT bool_and(c.relowner=(SELECT oid FROM pg_roles WHERE rolname='hedefora_migration')) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('hedefora','hedefora_meta'))
      AND (SELECT proowner=(SELECT oid FROM pg_roles WHERE rolname='hedefora_migration') FROM pg_proc WHERE oid='hedefora.matrix_fn()'::regprocedure)
      AND (SELECT typowner=(SELECT oid FROM pg_roles WHERE rolname='hedefora_migration') FROM pg_type WHERE oid='hedefora.matrix_mood'::regtype),
    'publicObjectGrants',(SELECT count(*) FROM (
      SELECT a.grantee FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END,c.relowner))) a WHERE n.nspname IN ('hedefora','hedefora_meta')
      UNION ALL SELECT a.grantee FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE n.nspname='hedefora'
      UNION ALL SELECT a.grantee FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace CROSS JOIN LATERAL aclexplode(COALESCE(t.typacl,acldefault('T',t.typowner))) a WHERE n.nspname='hedefora' AND t.typname='matrix_mood'
    ) grants WHERE grantee=0));`,
  );
  check(
    Array.isArray(objectAcl.rows) &&
      objectAcl.rows.length === 4 &&
      objectAcl.publicObjectGrants === 0 &&
      objectAcl.ownersCorrect === true,
    "acl.objects",
    "PUBLIC_OBJECT_ACL_OR_OWNER_MISMATCH",
  );
  for (const row of objectAcl.rows) {
    const migration = row.rolname === ROLE_NAMES.migration;
    const writable = [ROLE_NAMES.app, ROLE_NAMES.worker].includes(row.rolname);
    check(
      row.schema_usage === true &&
        row.schema_create === migration &&
        row.meta_usage === migration &&
        row.meta_create === migration &&
        row.public_usage === false &&
        row.public_create === false &&
        row.t_select === true &&
        [
          "t_insert",
          "t_update",
          "t_delete",
          "seq_usage",
          "seq_select",
          "fn_execute",
        ].every((key) => row[key] === (migration || writable)) &&
        [
          "t_truncate",
          "t_references",
          "t_trigger",
          "t_maintain",
          "ledger_any",
          "seq_update",
          "owns_relation",
          "object_grant_option",
        ].every((key) => row[key] === migration) &&
        row.type_usage === true,
      "acl.objects",
      "OBJECT_ROLE_ACL_MISMATCH",
    );
  }
  record("acl.objects");
  for (const [offset, key] of ["app", "worker"].entries()) {
    const id = 201 + offset;
    await call(
      `dml.${key}.insert`,
      key,
      `INSERT INTO hedefora.matrix_rows VALUES(${id},'${key}-insert','ready'::hedefora.matrix_mood);`,
    );
    await call(
      `dml.${key}.update`,
      key,
      `UPDATE hedefora.matrix_rows SET label='${key}-update',mood='done' WHERE id=${id};`,
    );
    const observed = await json(
      `dml.${key}.select`,
      key,
      `SELECT json_build_object('count',count(*),'label',min(label),'mood',min(mood::text)) FROM hedefora.matrix_rows WHERE id=${id};`,
    );
    check(
      observed.count === 1 &&
        observed.label === `${key}-update` &&
        observed.mood === "done",
      `dml.${key}`,
      "DML_RESULT_MISMATCH",
    );
    const capability = await json(
      `dml.${key}.defaults`,
      key,
      "SELECT json_build_object('sequence',nextval('hedefora.matrix_sequence'),'fn',hedefora.matrix_fn(),'type','ready'::hedefora.matrix_mood::text);",
    );
    check(
      Number.isInteger(capability.sequence) &&
        capability.sequence > 0 &&
        capability.fn === 7 &&
        capability.type === "ready",
      `dml.${key}`,
      "DEFAULT_OBJECT_CAPABILITY_MISMATCH",
    );
    const seq = await json(
      `dml.${key}.sequence-select`,
      key,
      "SELECT json_build_object('value',last_value) FROM hedefora.matrix_sequence;",
    );
    check(
      seq.value === capability.sequence,
      `dml.${key}`,
      "SEQUENCE_SELECT_MISMATCH",
    );
    await call(
      `dml.${key}.delete`,
      key,
      `DELETE FROM hedefora.matrix_rows WHERE id=${id};`,
    );
    const removed = await json(
      `dml.${key}.delete-check`,
      key,
      `SELECT json_build_object('count',count(*)) FROM hedefora.matrix_rows WHERE id=${id};`,
    );
    check(removed.count === 0, `dml.${key}`, "DELETE_RESULT_MISMATCH");
    record(`dml.${key}`);
  }
  const readonlyWrap = (sql) =>
    `BEGIN; SET LOCAL ROLE hedefora_readonly; ${sql} COMMIT;`;
  const readonly = await json(
    "readonly.capability",
    "admin",
    readonlyWrap(
      "SELECT json_build_object('sessionUser',session_user,'currentUser',current_user,'count',(SELECT count(*) FROM hedefora.matrix_rows),'type','ready'::hedefora.matrix_mood::text);",
    ),
  );
  check(
    readonly.sessionUser === ROLE_NAMES.admin &&
      readonly.currentUser === ROLE_NAMES.readonly &&
      readonly.count === 1 &&
      readonly.type === "ready",
    "readonly.capability",
    "READONLY_CAPABILITY_MISMATCH",
  );
  record("readonly.capability");
  await negative(
    "migration.nonempty-down",
    "migration",
    source.downSql,
    ["2BP01"],
    downOptions,
  );
  const commonDenials = [
    ["schema-create", "CREATE SCHEMA matrix_forbidden;"],
    ["schema-ddl", "CREATE TABLE hedefora.matrix_forbidden(id integer);"],
    ["public-ddl", "CREATE TABLE public.matrix_forbidden(id integer);"],
    [
      "alter-table",
      "ALTER TABLE hedefora.matrix_rows ADD COLUMN forbidden integer;",
    ],
    ["drop-table", "DROP TABLE hedefora.matrix_rows;"],
    ["truncate", "TRUNCATE hedefora.matrix_rows;"],
    ["temp", "CREATE TEMP TABLE matrix_forbidden(id integer);"],
    ["meta-select", "SELECT version FROM hedefora_meta.schema_migrations;"],
    [
      "meta-insert",
      `INSERT INTO hedefora_meta.schema_migrations(version,name,up_checksum_sha256) VALUES(9,'matrix_forbidden',${lit(UP_SHA256)});`,
    ],
    [
      "meta-update",
      "UPDATE hedefora_meta.schema_migrations SET name='matrix_forbidden' WHERE version=1;",
    ],
    [
      "meta-delete",
      "DELETE FROM hedefora_meta.schema_migrations WHERE version=1;",
    ],
    ["meta-ddl", "CREATE TABLE hedefora_meta.matrix_forbidden(id integer);"],
    ["create-role", "CREATE ROLE matrix_forbidden NOLOGIN;"],
    ["elevate-self", "ALTER ROLE CURRENT_USER SUPERUSER;"],
    ["sequence-update", "SELECT setval('hedefora.matrix_sequence',999);"],
  ];
  for (const key of ["app", "worker", "readonly"]) {
    const role = key === "readonly" ? "admin" : key;
    const wrap = key === "readonly" ? readonlyWrap : (sql) => sql;
    for (const [name, sql] of commonDenials)
      await negative(`deny.${key}.${name}`, role, wrap(sql), ["42501"]);
    for (const target of ["admin", ...MANAGED_KEYS].filter(
      (item) => item !== key,
    )) {
      // Test the three LOGIN sessions directly. SET ROLE from a superuser-authenticated
      // readonly capability could legitimately use session_user's authority instead.
      if (key === "readonly") continue;
      await negative(
        `deny.${key}.set-role-${target}`,
        key,
        `SET ROLE ${ident(ROLE_NAMES[target])};`,
        ["42501"],
      );
    }
    for (const [index, advisory] of ADVISORY_CASES.entries())
      await negative(
        `deny.${key}.advisory-${index + 1}`,
        role,
        wrap(`SELECT ${advisory.expression};`),
        ["42501"],
      );
  }
  for (const [name, sql] of [
    [
      "insert",
      "INSERT INTO hedefora.matrix_rows VALUES(401,'forbidden','ready');",
    ],
    [
      "update",
      "UPDATE hedefora.matrix_rows SET label='forbidden' WHERE id=100;",
    ],
    ["delete", "DELETE FROM hedefora.matrix_rows WHERE id=100;"],
    ["sequence-usage", "SELECT nextval('hedefora.matrix_sequence');"],
    ["sequence-select", "SELECT last_value FROM hedefora.matrix_sequence;"],
    ["function", "SELECT hedefora.matrix_fn();"],
  ])
    await negative(`deny.readonly.${name}`, "admin", readonlyWrap(sql), [
      "42501",
    ]);
  for (const target of ["admin", "app", "worker", "readonly"])
    await negative(
      `deny.migration.set-role-${target}`,
      "migration",
      `SET ROLE ${ident(ROLE_NAMES[target])};`,
      ["42501"],
    );
  for (const name of ["public-ddl", "temp", "create-role", "elevate-self"]) {
    const [, sql] = commonDenials.find(([key]) => key === name);
    await negative(`deny.migration.${name}`, "migration", sql, ["42501"]);
  }
  for (const [index, advisory] of ADVISORY_CASES.entries())
    if (!advisory.allowedMigration)
      await negative(
        `deny.migration.advisory-${index + 1}`,
        "migration",
        `SELECT ${advisory.expression};`,
        ["42501"],
      );

  async function backendStatus(id, pid) {
    check(Number.isInteger(pid) && pid > 0, id, "BACKEND_PID_INVALID");
    return json(
      `${id}.backend-${++backendSerial}`,
      "admin",
      `SELECT json_build_object('alive',EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=${pid}),'advisoryLocks',(SELECT count(*) FROM pg_locks WHERE pid=${pid} AND locktype='advisory'),'lockAvailable',pg_try_advisory_xact_lock(${MIGRATION_LOCK}));`,
    );
  }
  async function ensureBackendGone(id, pid) {
    const start = performance.now();
    while (true) {
      const observed = await backendStatus(id, pid);
      if (!observed.alive) {
        check(
          observed.advisoryLocks === 0 && observed.lockAvailable === true,
          id,
          "BACKEND_LOCK_NOT_RELEASED",
        );
        return;
      }
      check(
        performance.now() - start < LIMITS.backendCleanupMs,
        id,
        "BACKEND_NOT_CLOSED",
      );
      await delay(LIMITS.pollMs);
    }
  }
  async function sessionQuery(session, id, sql, states = null) {
    let result;
    try {
      result = await session.query(sql, {
        caseId: id,
        timeoutMs: LIMITS.sessionQueryMs,
      });
    } catch {
      throw new SqlAcceptanceError(id, "SESSION_QUERY_REJECTED");
    }
    return validateResult(result, id, { states, persistent: !states });
  }
  async function inSession(id, body) {
    let session;
    let pid;
    try {
      try {
        session = await openSession({
          caseId: id,
          role: "migration",
          database: DATABASE,
          timeoutMs: LIMITS.sessionMs,
        });
      } catch {
        throw new SqlAcceptanceError(id, "SESSION_OPEN_REJECTED");
      }
      check(
        session &&
          typeof session.query === "function" &&
          typeof session.disconnect === "function" &&
          session.closed &&
          typeof session.closed.then === "function",
        id,
        "SESSION_CONTRACT_MISSING",
      );
      const identity = parseJsonOutput(
        await sessionQuery(
          session,
          `${id}.identity`,
          "SELECT json_build_object('pid',pg_backend_pid(),'sessionUser',session_user,'currentUser',current_user,'auth',system_user);",
        ),
        `${id}.identity`,
      );
      pid = identity.pid;
      check(
        Number.isInteger(pid) &&
          pid > 0 &&
          identity.sessionUser === ROLE_NAMES.migration &&
          identity.currentUser === ROLE_NAMES.migration &&
          identity.auth === `scram-sha-256:${ROLE_NAMES.migration}`,
        id,
        "SESSION_LOGIN_MISMATCH",
      );
      await body(session, pid);
    } finally {
      if (session) {
        let closed;
        try {
          closed = await session.disconnect();
        } catch {
          throw new SqlAcceptanceError(id, "SESSION_DISCONNECT_REJECTED");
        }
        check(closed?.closed === true, id, "CLIENT_NOT_CLOSED");
        if (pid) await ensureBackendGone(id, pid);
      }
    }
  }
  const beginAndLock = (
    marker = null,
  ) => `BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='15s'; SET LOCAL idle_in_transaction_session_timeout='15s';
    SELECT pg_advisory_xact_lock(${MIGRATION_LOCK}); ${marker ? `CREATE TABLE hedefora.${ident(marker)}(id integer);` : ""}
    SELECT json_build_object('pid',pg_backend_pid(),'lockTimeout',current_setting('lock_timeout'),'statementTimeout',current_setting('statement_timeout'),'idleTimeout',current_setting('idle_in_transaction_session_timeout'));`;
  async function acquire(session, id, pid, marker = null) {
    // The void-returning lock SELECT contributes an empty line, which the JSON
    // decoder ignores. Framing/control output is removed by the executor.
    const acquired = await sessionQuery(
      session,
      `${id}.acquire`,
      beginAndLock(marker),
    );
    const completedAt = performance.now();
    const result = parseJsonOutput(acquired, `${id}.acquire`);
    check(
      result.pid === pid &&
        result.lockTimeout === "3s" &&
        result.statementTimeout === "15s" &&
        result.idleTimeout === "15s",
      id,
      "SESSION_BUDGET_OR_BACKEND_MISMATCH",
    );
    const observed = await backendStatus(id, pid);
    check(
      observed.alive === true &&
        observed.advisoryLocks > 0 &&
        observed.lockAvailable === false,
      id,
      "LOCK_NOT_ACTUALLY_HELD",
    );
    return completedAt;
  }
  for (const action of ["COMMIT", "ROLLBACK", "DISCONNECT"]) {
    const id = `locks.release-${action.toLowerCase()}`;
    const contentionBefore =
      action === "COMMIT" ? await snapshot("locks.contention") : null;
    await inSession(id, async (session, pid) => {
      await acquire(session, id, pid);
      if (action === "COMMIT") {
        const result = await call(
          "locks.contention",
          "migration",
          source.downSql,
          { ...downOptions, states: ["55P03"] },
        );
        check(
          result.elapsedMs >= LIMITS.lockMinMs &&
            result.elapsedMs <= LIMITS.lockMaxMs,
          "locks.contention",
          "LOCK_TIMEOUT_DURATION_MISMATCH",
        );
        record("locks.contention", {
          sqlState: result.sqlState,
          elapsedMs: Math.round(result.elapsedMs),
          configuredLockTimeoutMs: 3_000,
        });
      }
      if (action !== "DISCONNECT") {
        const observed = parseJsonOutput(
          await sessionQuery(
            session,
            `${id}.end`,
            `${action}; SELECT json_build_object('pid',pg_backend_pid());`,
          ),
          `${id}.end`,
        );
        check(observed.pid === pid, id, "SESSION_BACKEND_CHANGED");
        const released = await backendStatus(id, pid);
        check(
          released.alive === true &&
            released.advisoryLocks === 0 &&
            released.lockAvailable === true,
          id,
          "TRANSACTION_LOCK_NOT_RELEASED",
        );
      }
    });
    if (action === "COMMIT")
      check(
        (await snapshot("locks.contention")) === contentionBefore,
        "locks.contention",
        "LOCK_FAILURE_NOT_ATOMIC",
      );
    record(id);
  }
  const statementBefore = await snapshot("timeouts.statement");
  await inSession("timeouts.statement", async (session, pid) => {
    await acquire(
      session,
      "timeouts.statement",
      pid,
      "matrix_statement_rollback",
    );
    const result = await sessionQuery(
      session,
      "timeouts.statement.wait",
      "SELECT pg_sleep(60);",
      ["57014"],
    );
    check(
      result.elapsedMs >= LIMITS.statementMinMs &&
        result.elapsedMs <= LIMITS.statementMaxMs,
      "timeouts.statement",
      "STATEMENT_DURATION_MISMATCH",
    );
    await ensureBackendGone("timeouts.statement", pid);
    record("timeouts.statement", {
      sqlState: result.sqlState,
      elapsedMs: Math.round(result.elapsedMs),
      configuredStatementTimeoutMs: 15_000,
    });
  });
  check(
    (await snapshot("timeouts.statement")) === statementBefore,
    "timeouts.statement",
    "STATEMENT_FAILURE_NOT_ATOMIC",
  );
  const idleBefore = await snapshot("timeouts.idle");
  await inSession("timeouts.idle", async (session, pid) => {
    const start = await acquire(
      session,
      "timeouts.idle",
      pid,
      "matrix_idle_rollback",
    );
    let elapsed;
    while (true) {
      const observed = await backendStatus("timeouts.idle", pid);
      elapsed = performance.now() - start;
      if (!observed.alive) {
        check(
          observed.advisoryLocks === 0 && observed.lockAvailable === true,
          "timeouts.idle",
          "IDLE_LOCK_NOT_RELEASED",
        );
        break;
      }
      check(
        elapsed < LIMITS.idleMaxMs,
        "timeouts.idle",
        "SERVER_IDLE_TIMEOUT_NOT_OBSERVED",
      );
      await delay(LIMITS.pollMs);
    }
    check(
      elapsed >= LIMITS.idleMinMs && elapsed <= LIMITS.idleMaxMs,
      "timeouts.idle",
      "IDLE_DURATION_MISMATCH",
    );
    // psql may block on stdin instead of reading the server FATAL immediately.
    // A post-disappearance query must return the retained, server-correlated fatal.
    await sessionQuery(session, "timeouts.idle.terminal", "SELECT 1;", [
      "25P03",
    ]);
    let terminal;
    try {
      terminal = await Promise.race([
        session.closed,
        delay(2_000).then(() => null),
      ]);
    } catch {
      throw new SqlAcceptanceError("timeouts.idle", "TERMINAL_EVENT_REJECTED");
    }
    check(
      terminal?.connectionClosed === true &&
        terminal.origin === "postgres" &&
        terminal.sqlState === "25P03",
      "timeouts.idle",
      "SERVER_FATAL_EVIDENCE_MISSING",
    );
    record("timeouts.idle", {
      sqlState: "25P03",
      observedBackendExitMs: Math.round(elapsed),
      configuredIdleTimeoutMs: 15_000,
    });
  });
  check(
    (await snapshot("timeouts.idle")) === idleBefore,
    "timeouts.idle",
    "IDLE_FAILURE_NOT_ATOMIC",
  );
  await call(
    "acl.fixture-cleanup",
    "migration",
    "BEGIN; DROP TABLE hedefora.matrix_rows; DROP SEQUENCE hedefora.matrix_sequence; DROP FUNCTION hedefora.matrix_fn(); DROP TYPE hedefora.matrix_mood; COMMIT;",
  );
  await call(
    "migration.final-empty-down",
    "migration",
    source.downSql,
    downOptions,
  );
  await requireV0("migration.final-v0");
  check(
    (await applyPending("migration.final-up")) === 1,
    "migration.final-up",
    "FINAL_REAPPLY_FAILED",
  );
  const finalRows = await ledger("migration.final-ledger");
  check(
    finalRows.length === 1 &&
      finalRows[0].up_checksum_sha256 === UP_SHA256 &&
      finalRows[0].applied_by === ROLE_NAMES.migration,
    "migration.final-up",
    "FINAL_LEDGER_MISMATCH",
  );
  record("migration.final-up");
  return Object.freeze({
    scope: "actual-postgresql-engine-sql-only",
    status: "PASS",
    serverVersionNum: version.version,
    sourceSha256: { up: UP_SHA256, down: DOWN_SHA256 },
    cases: evidence,
  });
}
