// Unit/contract tests only: these do not start PostgreSQL or admit an image.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collectMigrationPlan } from "./run.mjs";
import { test } from "node:test";
import {
  ADVISORY_CASES,
  DOWN_SHA256,
  UP_SHA256,
  SqlAcceptanceError,
  canonical,
  parseJsonOutput,
  runLiveSqlAcceptance,
  validateResult,
  verifyMigrationBundle,
} from "./live-sql.mjs";

const bundle = {
  upSql: readFileSync(
    new URL(
      "../../../db/migrations/000001_database_foundation.up.sql",
      import.meta.url,
    ),
    "utf8",
  ),
  downSql: readFileSync(
    new URL(
      "../../../db/migrations/000001_database_foundation.down.sql",
      import.meta.url,
    ),
    "utf8",
  ),
  plan: collectMigrationPlan(),
};
const success = {
  rawExit: 0,
  sqlState: null,
  stdout: '{"ok":true}\n',
  elapsedMs: 1,
  connectionClosed: true,
  origin: "postgres",
};
const failure = {
  rawExit: 3,
  sqlState: "42501",
  stdout: "",
  elapsedMs: 1,
  connectionClosed: true,
  origin: "postgres",
};
const rejectsCode = (code) => (error) =>
  error instanceof SqlAcceptanceError && error.code === code;

test("unit-only: exact immutable source and v1 plan accepted", () => {
  const verified = verifyMigrationBundle(bundle);
  assert.equal(verified.upSql, bundle.upSql);
  assert.equal(verified.downSql, bundle.downSql);
  assert.equal(verified.plan.length, 1);
});
for (const key of ["upSql", "downSql"]) {
  test(`unit-only: altered ${key} rejected`, () => {
    assert.throws(
      () => verifyMigrationBundle({ ...bundle, [key]: `${bundle[key]}\n` }),
      rejectsCode("IMMUTABLE_SQL_HASH_MISMATCH"),
    );
  });
  test(`unit-only: CRLF ${key} rejected before connect`, () => {
    assert.throws(
      () =>
        verifyMigrationBundle({
          ...bundle,
          [key]: bundle[key].replaceAll("\n", "\r\n"),
        }),
      rejectsCode("IMMUTABLE_SQL_HASH_MISMATCH"),
    );
  });
}
test("unit-only: missing/extra/wrong plan cannot become live evidence", () => {
  for (const plan of [[], [...bundle.plan, bundle.plan[0]]])
    assert.throws(
      () => verifyMigrationBundle({ ...bundle, plan }),
      rejectsCode("PLAN_INVENTORY_MISMATCH"),
    );
  for (const patch of [
    { version: 2 },
    { versionToken: "000002" },
    { name: "different" },
    { up: { ...bundle.plan[0].up, checksum: DOWN_SHA256 } },
  ]) {
    assert.throws(
      () =>
        verifyMigrationBundle({
          ...bundle,
          plan: [{ ...bundle.plan[0], ...patch }],
        }),
      rejectsCode("PLAN_IDENTITY_MISMATCH"),
    );
  }
});
test("unit-only: static preflight failure makes zero executor calls and redacts error", async () => {
  let calls = 0;
  const execute = async () => {
    calls += 1;
    throw new Error("must not run");
  };
  await assert.rejects(
    runLiveSqlAcceptance({
      verifyBeforeConnect: async () => {
        throw new Error("CANARY_DO_NOT_PRINT_01");
      },
      psql: execute,
      openSession: execute,
    }),
    (error) => {
      assert.equal(
        error.message,
        "PG_SQL_ACCEPTANCE:preflight:STATIC_PREFLIGHT_FAILED",
      );
      assert.equal(error.cause, undefined);
      return true;
    },
  );
  assert.equal(calls, 0);
});
test("unit-only: corrupted SQL makes zero executor calls after preflight callback", async () => {
  let calls = 0;
  const execute = async () => {
    calls += 1;
    throw new Error("must not run");
  };
  await assert.rejects(
    runLiveSqlAcceptance({
      verifyBeforeConnect: async () => ({ ...bundle, downSql: "changed" }),
      psql: execute,
      openSession: execute,
    }),
    rejectsCode("IMMUTABLE_SQL_HASH_MISMATCH"),
  );
  assert.equal(calls, 0);
});
test("unit-only: first actual-executor request follows preflight and redacts rejection", async () => {
  const events = [];
  await assert.rejects(
    runLiveSqlAcceptance({
      verifyBeforeConnect: async () => {
        events.push("preflight");
        return bundle;
      },
      psql: async (args) => {
        events.push("psql");
        assert.equal(args.caseId, "engine.pg17");
        assert.equal(args.role, "admin");
        assert.equal(args.database, "hedefora_dev");
        assert.equal(Object.keys(args).includes("password"), false);
        throw new Error("CANARY_DO_NOT_PRINT_02");
      },
      openSession: async () => {
        throw new Error("unexpected session");
      },
    }),
    (error) =>
      error.message === "PG_SQL_ACCEPTANCE:engine.pg17:EXECUTOR_REJECTED" &&
      !error.cause,
  );
  assert.deepEqual(events, ["preflight", "psql"]);
});
test("unit-only: exact expected SQLSTATE and server origin are both necessary", () => {
  assert.equal(
    validateResult(failure, "unit.failure", { states: ["42501"] }),
    failure,
  );
  for (const patch of [
    { sqlState: "42601" },
    { sqlState: null },
    { origin: "unknown" },
    { sqlState: "ERROR 42501" },
  ]) {
    assert.throws(
      () =>
        validateResult({ ...failure, ...patch }, "unit.failure", {
          states: ["42501"],
        }),
      rejectsCode("SQLSTATE_MISMATCH"),
    );
  }
});
test("unit-only: cancellation/deadline/channel termination never passes SQL-negative gate", () => {
  for (const origin of ["timeout", "cancel", "channel"]) {
    assert.throws(
      () =>
        validateResult({ ...failure, origin }, "unit.failure", {
          states: ["42501"],
        }),
      rejectsCode("EXECUTOR_TERMINATED"),
    );
  }
});
test("unit-only: unexpected success, live failed connection, and malformed duration reject", () => {
  assert.throws(
    () => validateResult(success, "unit.failure", { states: ["42501"] }),
    rejectsCode("EXPECTED_FAILURE_SUCCEEDED"),
  );
  assert.throws(
    () =>
      validateResult({ ...failure, connectionClosed: false }, "unit.failure", {
        states: ["42501"],
      }),
    rejectsCode("ERROR_CONNECTION_NOT_CLOSED"),
  );
  assert.throws(
    () => validateResult({ ...success, elapsedMs: NaN }, "unit.failure"),
    rejectsCode("DURATION_MISSING"),
  );
});
test("unit-only: persistent success is distinct from closed one-shot process", () => {
  assert.equal(validateResult(success, "unit.success"), success);
  assert.throws(
    () => validateResult(success, "unit.success", { persistent: true }),
    rejectsCode("CONNECTION_LIFECYCLE_MISMATCH"),
  );
  const persistent = { ...success, connectionClosed: false };
  assert.equal(
    validateResult(persistent, "unit.success", { persistent: true }),
    persistent,
  );
});
test("unit-only: JSON decoder permits empty void rows but no arbitrary extra output", () => {
  assert.deepEqual(
    parseJsonOutput({ stdout: '\n{"ok":true}\n\n' }, "unit.json"),
    { ok: true },
  );
  assert.throws(
    () =>
      parseJsonOutput(
        { stdout: '{"ok":true}\nCANARY_DO_NOT_PRINT_03' },
        "unit.json",
      ),
    (error) =>
      error.message === "PG_SQL_ACCEPTANCE:unit.json:JSON_FRAME_COUNT_MISMATCH",
  );
  assert.throws(
    () => parseJsonOutput({ stdout: "CANARY_DO_NOT_PRINT_04" }, "unit.json"),
    (error) => error.message === "PG_SQL_ACCEPTANCE:unit.json:JSON_INVALID",
  );
  assert.throws(
    () => parseJsonOutput({ stdout: "[]" }, "unit.json"),
    rejectsCode("JSON_OBJECT_REQUIRED"),
  );
});
test("unit-only: oversized/unstructured output fails without returning raw data", () => {
  for (const stdout of ["x".repeat(65_537), null])
    assert.throws(
      () => validateResult({ ...success, stdout }, "unit.output"),
      rejectsCode("OUTPUT_SHAPE_INVALID"),
    );
});
test("unit-only: canonical fingerprints retain nested state, ignore object key order", () => {
  assert.equal(
    canonical({ b: [{ a: 1, c: 2 }], a: null }),
    canonical({ a: null, b: [{ c: 2, a: 1 }] }),
  );
  assert.notEqual(canonical({ rows: [1, 2] }), canonical({ rows: [2, 1] }));
  assert.notEqual(
    canonical({ sequence: { isCalled: false } }),
    canonical({ sequence: { isCalled: true } }),
  );
});
test("unit-only: all sixteen advisory overloads covered, exactly one migration allowance", () => {
  assert.equal(ADVISORY_CASES.length, 16);
  assert.equal(new Set(ADVISORY_CASES.map((item) => item.signature)).size, 16);
  assert.deepEqual(
    ADVISORY_CASES.filter((item) => item.allowedMigration).map(
      (item) => item.signature,
    ),
    ["pg_advisory_xact_lock(bigint)"],
  );
});

test("unit-only: success requires explicit PostgreSQL origin", () => {
  for (const origin of [undefined, null, "unknown", "mock"]) {
    assert.throws(
      () => validateResult({ ...success, origin }, "unit.success"),
      rejectsCode("SUCCESS_ORIGIN_MISMATCH"),
    );
  }
});
