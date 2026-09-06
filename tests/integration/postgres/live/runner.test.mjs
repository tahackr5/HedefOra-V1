import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { request as httpRequest } from "node:http";
import { fileURLToPath } from "node:url";
import {
  mkdtemp,
  writeFile,
  appendFile,
  open,
  link,
  rm,
  rmdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { command, startProcess, correlatedSqlState } from "./process.mjs";
import { createPsqlExecutor, validateSqlRequest } from "./psql.mjs";
import {
  createExecutionGuard,
  createRunBudget,
  validateDescriptor,
  validateImageMetadata,
  verifyInputBinding,
  readBoundedRegularHandle,
  OwnedResources,
  createLifecycleController,
  createPrivateRunSecrets,
  runLivePg17,
} from "./live-runtime.mjs";
import { runPg17LiveGate } from "./run-live.mjs";

test("public dispatch has fixed null authority and cannot accept injected PASS", async () => {
  await assert.rejects(
    runPg17LiveGate({ admitted: true, authority: { status: "PASS" } }),
    /PG_IMAGE_ADMISSION_REQUIRED/,
  );
});
test("actual public CLI rejects fake admission flags and environment", async () => {
  const result = await command({
    executable: process.execPath,
    args: [
      fileURLToPath(new URL("./run-live.mjs", import.meta.url)),
      "--admitted",
      "--image=synthetic-only",
    ],
    env: {
      HEDEFORA_PG17_TEST_ADMISSION: "admitted-disposable-pg17-v1",
      PG_IMAGE_ADMISSION: "PASS",
    },
    timeoutMs: 5000,
  });
  assert.equal(result.rawExit, 1);
  assert.equal(result.origin, "exit");
  assert.equal(result.connectionClosed, true);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), {
    status: "BLOCKED_SECURITY",
    scope: "disposable-pg17-live",
    execution: "NOT_RUN",
    code: "PG_IMAGE_ADMISSION_REQUIRED",
  });
});
test("private run credentials are independent across roles and invocations", () => {
  const samples = [createPrivateRunSecrets(), createPrivateRunSecrets()];
  const entropy = [];
  for (const sample of samples) {
    assert.deepEqual(Object.keys(sample.passwords).sort(), [
      "admin",
      "app",
      "migration",
      "readonly",
      "worker",
    ]);
    for (const password of Object.values(sample.passwords)) {
      assert.match(password, /^synthetic-pg17-[a-f0-9]{64}$/);
      assert.ok(!password.includes(runId));
      entropy.push(password.slice("synthetic-pg17-".length));
    }
    assert.match(sample.controlToken, /^[a-f0-9]{64}$/);
    entropy.push(sample.controlToken);
  }
  assert.equal(new Set(entropy).size, 12);
});
test("global monotonic budget bounds new work and leaves owned cleanup available", async () => {
  let now = 0;
  const budget = createRunBudget({ maxMs: 100, now: () => now });
  assert.equal(budget.limit(1000), 100);
  now = 90;
  assert.equal(budget.limit(1000), 10);
  now = 100;
  assert.throws(budget.check, /RUN_BUDGET_EXPIRED/);
  assert.throws(() => budget.limit(1), /RUN_BUDGET_EXPIRED/);
  const h = resourceHarness();
  h.add("container", "expired-budget-cleanup");
  assert.equal((await h.owned.cleanup()).status, "PASS");
  assert.equal(h.present.size, 0);
});
test("actual grown file cannot exceed original size plus EOF byte", async () => {
  const root = await mkdtemp(join(tmpdir(), "ho-runner-grow-"));
  const path = join(root, "input");
  let file;
  try {
    await writeFile(path, "original", { flag: "wx", mode: 0o600 });
    file = await open(path, "r");
    let first = true,
      totalRequested = 0;
    const handle = {
      stat: (options) => file.stat(options),
      async read(...args) {
        totalRequested += args[2];
        if (first) {
          first = false;
          await appendFile(path, "x".repeat(200000));
        }
        return file.read(...args);
      },
    };
    await assert.rejects(
      readBoundedRegularHandle(handle, 1000),
      /INPUT_CHANGED/,
    );
    assert.equal(totalRequested, Buffer.byteLength("original") + 1);
  } finally {
    await file?.close();
    await rm(path);
    await rmdir(root);
  }
});
test("actual same-size mutation and hardlink are rejected", async () => {
  const root = await mkdtemp(join(tmpdir(), "ho-runner-change-"));
  const path = join(root, "input"),
    alias = join(root, "alias");
  let file,
    linked = false;
  try {
    await writeFile(path, "original", { flag: "wx", mode: 0o600 });
    file = await open(path, "r");
    let stats = 0;
    const handle = {
      async stat(options) {
        if (++stats === 2) {
          await delay(20);
          await writeFile(path, "modified");
        }
        return file.stat(options);
      },
      read: (...args) => file.read(...args),
    };
    await assert.rejects(
      readBoundedRegularHandle(handle, 1000),
      /INPUT_CHANGED/,
    );
    await link(path, alias);
    linked = true;
    await assert.rejects(readBoundedRegularHandle(file, 1000), /INPUT_FILE/);
  } finally {
    await file?.close();
    if (linked) await rm(alias);
    await rm(path);
    await rmdir(root);
  }
});

const runId = "a".repeat(32),
  controlToken = "d".repeat(64),
  imageDigest = `sha256:${"b".repeat(64)}`;
const fixedNow = Date.parse("2026-09-07T12:00:00Z");
function descriptor() {
  return {
    profile: "apk-runtime-data-assembly/v1",
    scope: "disposable-local-ci-only",
    runId,
    sourceCommit: "c".repeat(40),
    controllerCommit: "d".repeat(40),
    profileSha256: "e".repeat(64),
    closureLockSha256: "f".repeat(64),
    rootfsSha256: "1".repeat(64),
    evidenceIndexSha256: "2".repeat(64),
    scannerLockSha256: "3".repeat(64),
    imageManifestDigest: imageDigest,
    imageConfigDigest: `sha256:${"4".repeat(64)}`,
    dockerImageId: `sha256:${"4".repeat(64)}`,
    archive: { path: process.execPath, sha256: "5".repeat(64), size: 123 },
    databaseBuiltAt: "2026-09-07T11:00:00Z",
    issuedAt: "2026-09-07T11:45:00Z",
    expiresAt: "2026-09-07T12:30:00Z",
  };
}
function authorityFor(value) {
  const capability = Object.freeze({});
  const admitted = new WeakSet([capability]);
  return {
    capability,
    authority: {
      assertCapability(candidate) {
        assert.ok(admitted.has(candidate), "private capability required");
      },
      async revalidate() {
        return value;
      },
      async withVerifiedArchive() {
        throw new Error("No archive/engine in synthetic tests");
      },
    },
  };
}
for (const [name, mutate] of [
  ["missing", () => null],
  ["profile", (x) => ({ ...x, profile: "target-pass" })],
  ["run", (x) => ({ ...x, runId: "0".repeat(32) })],
  ["source", (x) => ({ ...x, sourceCommit: "0".repeat(40) })],
  [
    "manifest",
    (x) => ({ ...x, imageManifestDigest: `sha256:${"0".repeat(64)}` }),
  ],
  ["config-id", (x) => ({ ...x, dockerImageId: imageDigest })],
  [
    "archive-hash",
    (x) => ({ ...x, archive: { ...x.archive, sha256: "0".repeat(64) } }),
  ],
  ["archive-size", (x) => ({ ...x, archive: { ...x.archive, size: 0 } })],
  ["expired", (x) => ({ ...x, expiresAt: "2026-09-07T12:00:00Z" })],
  ["future-issued", (x) => ({ ...x, issuedAt: "2026-09-07T12:01:00Z" })],
  ["stale-db", (x) => ({ ...x, databaseBuiltAt: "2026-09-04T12:00:00Z" })],
  ["excessive-lease", (x) => ({ ...x, expiresAt: "2026-09-07T13:00:00Z" })],
])
  test(`admission ${name}: launch zero`, async () => {
    const expected = descriptor();
    const { capability, authority } = authorityFor(mutate(expected));
    let launched = 0;
    const guard = createExecutionGuard({
      capability,
      authority,
      expected,
      verifyInputs: async () => {},
      now: () => fixedNow,
    });
    await assert.rejects(async () => {
      await guard();
      launched++;
    });
    assert.equal(launched, 0);
  });
test("target-authored status/flag cannot become a capability", async () => {
  const expected = descriptor();
  const { authority } = authorityFor(expected);
  let launched = 0;
  const guard = createExecutionGuard({
    authority,
    capability: { status: "PASS", admitted: true },
    expected,
    verifyInputs: async () => {},
    now: () => fixedNow,
  });
  await assert.rejects(async () => {
    await guard();
    launched++;
  });
  assert.equal(launched, 0);
});
test("missing authority fails before any invocation", () =>
  assert.throws(() => createExecutionGuard({}), /ADMISSION_AUTHORITY/));
test("input/TOCTOU failure blocks first and subsequent protected action", async () => {
  const expected = descriptor();
  const { authority, capability } = authorityFor(expected);
  let changed = false,
    launched = 0;
  const guard = createExecutionGuard({
    authority,
    capability,
    expected,
    now: () => fixedNow,
    async verifyInputs() {
      assert.equal(changed, false, "sealed bytes changed");
    },
  });
  await guard();
  launched++;
  changed = true;
  await assert.rejects(async () => {
    await guard();
    launched++;
  });
  assert.equal(launched, 1);
});
test("descriptor config ID is distinct from provenance manifest", () => {
  const value = descriptor();
  assert.equal(validateDescriptor(value, value, fixedNow), value);
  assert.notEqual(value.dockerImageId, value.imageManifestDigest);
});
test("explicit two-layer bootstrap profile binds Env, entrypoint and ordered diffIDs", () => {
  const value = descriptor();
  const ids = [`sha256:${"6".repeat(64)}`, `sha256:${"7".repeat(64)}`];
  const config = {
    os: "linux",
    architecture: "amd64",
    config: {
      User: "70:70",
      Entrypoint: ["/usr/local/bin/hedefora-postgres"],
      Cmd: ["postgres"],
      WorkingDir: "/",
      StopSignal: "SIGINT",
      Env: [
        "PATH=/usr/libexec/postgresql17:/bin",
        "PGDATA=/var/lib/postgresql/data",
        "LANG=C.UTF-8",
        "TZ=UTC",
      ],
    },
    rootfs: { type: "layers", diff_ids: ids },
  };
  const manifest = {
    schemaVersion: 2,
    config: { digest: value.imageConfigDigest },
    layers: ids.map((digest) => ({
      digest,
      mediaType: "application/vnd.oci.image.layer.v1.tar",
      size: 123,
    })),
  };
  assert.deepEqual(
    validateImageMetadata(config, manifest, value, "apk-bootstrap-overlay/v1"),
    ids,
  );
  for (const mutate of [
    (x) => {
      x.config.Env.push("PGOPTIONS=-c session_authorization=hedefora_dev");
    },
    (x) => {
      x.config.Entrypoint = [];
    },
    (x) => {
      x.config.User = "0:0";
    },
    (x) => {
      x.rootfs.diff_ids.reverse();
    },
    (x) => {
      x.rootfs.diff_ids.pop();
    },
  ]) {
    const changed = structuredClone(config);
    mutate(changed);
    assert.throws(
      () =>
        validateImageMetadata(
          changed,
          manifest,
          value,
          "apk-bootstrap-overlay/v1",
        ),
      /IMAGE_CONFIGURATION/,
    );
  }
  assert.throws(
    () => validateImageMetadata(config, manifest, value, "implicit-fallback"),
    /IMAGE_BOOTSTRAP_PROFILE/,
  );
});
test("actual sealed file hash mutation blocks launch before and after first verification", async () => {
  const root = await mkdtemp(join(tmpdir(), "ho-runner-synthetic-file-"));
  const path = join(root, "manifest.json");
  const original = '{"schemaVersion":2}\n';
  const input = {
    path,
    sha256: createHash("sha256").update(original).digest("hex"),
  };
  const expected = descriptor();
  const { authority, capability } = authorityFor(expected);
  let launched = 0;
  const guard = createExecutionGuard({
    authority,
    capability,
    expected,
    now: () => fixedNow,
    async verifyInputs() {
      await verifyInputBinding(input);
    },
  });
  try {
    await writeFile(path, "changed", { flag: "wx", mode: 0o600 });
    await assert.rejects(async () => {
      await guard();
      launched++;
    }, /INPUT_HASH/);
    assert.equal(launched, 0);
    await writeFile(path, original);
    await guard();
    launched++;
    await writeFile(path, "changed-after-check");
    await assert.rejects(async () => {
      await guard();
      launched++;
    }, /INPUT_HASH/);
    assert.equal(launched, 1);
  } finally {
    await rm(path);
    await rmdir(root);
  }
});

test("real bounded Node child receives only explicit environment", async () => {
  const result = await command({
    executable: process.execPath,
    args: [
      "-e",
      "process.stdout.write(JSON.stringify({canary:process.env.HO_CANARY,pg:process.env.PGPASSWORD??null,argc:process.argv.length}))",
    ],
    env: { HO_CANARY: "synthetic-only" },
    timeoutMs: 5000,
  });
  assert.equal(result.rawExit, 0);
  assert.equal(result.origin, "exit");
  assert.deepEqual(JSON.parse(result.stdout), {
    canary: "synthetic-only",
    pg: null,
    argc: 1,
  });
});
test("real child timeout is not PostgreSQL error evidence", async () => {
  const result = await command({
    executable: process.execPath,
    args: ["-e", "setTimeout(()=>{},10000)"],
    env: {},
    timeoutMs: 100,
  });
  assert.equal(result.origin, "timeout");
  assert.notEqual(result.rawExit, 0);
  assert.ok(result.elapsedMs < 2000);
});
test("missing child close after failed kill cannot claim closed transport", async () => {
  let kills = 0;
  const child = new EventEmitter();
  Object.assign(child, {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill() {
      kills++;
      return false;
    },
  });
  const started = startProcess({
    executable: process.execPath,
    args: [],
    env: {},
    timeoutMs: 5000,
    spawnImpl: () => child,
  });
  started.cancel();
  const result = await started.closed;
  assert.equal(kills, 1);
  assert.equal(result.rawExit, -1);
  assert.equal(result.origin, "cancel");
  assert.equal(result.connectionClosed, false);
  assert.ok(result.elapsedMs >= 900 && result.elapsedMs < 3000);
});
test("real child output overflow fails closed and remains bounded", async () => {
  const result = await command({
    executable: process.execPath,
    args: [
      "-e",
      'process.stdout.write("x".repeat(10000));setTimeout(()=>{},10000)',
    ],
    env: {},
    timeoutMs: 3000,
    maxBytes: 10,
  });
  assert.equal(result.origin, "channel");
  assert.ok(result.stdout.length <= 10);
});
test("shell disabled and ambient environment excluded at spawn seam", async () => {
  let options;
  const child = startProcess({
    executable: process.execPath,
    args: ["literal;not-a-shell"],
    env: { SAFE: "x" },
    timeoutMs: 1000,
    spawnImpl(_exe, _args, supplied) {
      options = supplied;
      throw new Error("synthetic spawn fault");
    },
  });
  const result = await child.closed;
  assert.equal(options.shell, false);
  assert.equal(options.windowsHide, true);
  assert.deepEqual(options.env, { SAFE: "x" });
  assert.equal(result.rawExit, -1);
  assert.equal(result.origin, "channel");
  assert.equal(result.stderr, "");
  assert.equal(result.connectionClosed, false);
});
test("SQLSTATE requires exact app, severity and one unambiguous server code", () => {
  const app = `ho_${runId.slice(0, 16)}_1`;
  assert.equal(
    correlatedSqlState(
      `${app} 28P01 FATAL: synthetic\nother 42501 ERROR: ignored\n`,
      app,
    ),
    "28P01",
  );
  assert.equal(
    correlatedSqlState(
      `${app} 42501 NOTICE: not an error\n${app} 00000 ERROR: not a state`,
      app,
    ),
    null,
  );
  assert.throws(
    () =>
      correlatedSqlState(
        `${app} 28P01 FATAL: one\n${app} 42501 ERROR: two`,
        app,
      ),
    /SQLSTATE_AMBIGUOUS/,
  );
  assert.equal(
    correlatedSqlState("unrelated 28P01 FATAL: not this session", app),
    null,
  );
});

function fakeExecutor({
  state = null,
  timeout = false,
  split = false,
  idle = false,
  closeObserved = true,
  commandBudget,
} = {}) {
  const calls = [];
  let orphan = 0;
  const executor = createPsqlExecutor({
    ...(commandBudget ? { commandBudget } : {}),
    containerId: "6".repeat(64),
    runId,
    passwords: Object.fromEntries(
      ["admin", "migration", "app", "worker", "readonly"].map((role) => [
        role,
        `synthetic-pg17-${"c".repeat(64)}`,
      ]),
    ),
    markOrphanRisk() {
      orphan++;
    },
    async readLogs() {
      const app = calls.at(-1).options.env.PGAPPNAME;
      return state ? `${app} ${state} FATAL: synthetic-only` : "";
    },
    docker(args, options) {
      calls.push({ args, options });
      let resolve;
      const listeners = new Set();
      let done = false;
      const closed = new Promise((settle) => {
        resolve = settle;
      });
      const finish = (
        rawExit = state ? 3 : 0,
        origin = timeout ? "timeout" : "exit",
      ) => {
        if (done) return;
        done = true;
        resolve({
          rawExit,
          origin,
          stdout: "",
          stderr: "never expose synthetic password",
          elapsedMs: 5,
          connectionClosed: closeObserved,
        });
      };
      const output = (text) => {
        for (const fn of listeners) fn("stdout", text);
      };
      if (Object.hasOwn(options, "input")) queueMicrotask(() => finish());
      return {
        closed,
        cancel(origin) {
          finish(-1, origin);
        },
        end() {
          if (closeObserved) finish();
          else finish(-1, "cancel");
        },
        onOutput(fn) {
          listeners.add(fn);
          return () => listeners.delete(fn);
        },
        write(text) {
          if (state || idle) {
            queueMicrotask(() => finish(3));
            return;
          }
          const marker = /\\echo (ho_frame_[a-f0-9]{32})/.exec(text)[1];
          if (split) {
            output('{"ok":');
            output(`true}\n${marker}`);
            setTimeout(() => output("\n"), 20);
          } else queueMicrotask(() => output(`{"ok":true}\n${marker}\n`));
        },
      };
    },
  });
  return { executor, calls, orphan: () => orphan };
}
const request = {
  caseId: "synthetic.one",
  role: "app",
  database: "hedefora_dev",
  inputSql: "SELECT 1;",
  timeoutMs: 12000,
};
test("expired global budget prevents both SQL spawn and persistent query", async () => {
  let now = 0;
  const budget = createRunBudget({ maxMs: 100, now: () => now });
  const fake = fakeExecutor({ commandBudget: budget.limit });
  const session = await fake.executor.openSession({
    ...request,
    timeoutMs: 45000,
  });
  assert.equal(fake.calls[0].options.timeoutMs, 100);
  now = 100;
  await assert.rejects(fake.executor.psql(request), /RUN_BUDGET_EXPIRED/);
  await assert.rejects(
    session.query("SELECT 1;", {
      caseId: "synthetic.expired",
      timeoutMs: 22000,
    }),
    /RUN_BUDGET_EXPIRED/,
  );
  assert.equal(fake.calls.length, 1);
  assert.deepEqual(await session.disconnect(), { closed: true });
});
test("psql fixed arguments, key-only env forwarding, no password/raw stderr leakage", async () => {
  const fake = fakeExecutor();
  const result = await fake.executor.psql(request);
  const { args, options } = fake.calls[0];
  assert.equal(result.origin, "postgres");
  assert.equal(result.connectionClosed, true);
  assert.equal("stderr" in result, false);
  assert.ok(
    args.includes("-X") &&
      args.includes("-Atq") &&
      args.includes("--set=ON_ERROR_STOP=1") &&
      args.includes("--set=VERBOSITY=sqlstate"),
  );
  assert.ok(args.includes("/usr/libexec/postgresql17/psql"));
  assert.equal(
    args.some((arg) => arg.includes("synthetic-pg17")),
    false,
  );
  assert.equal(options.env.PGREQUIREAUTH, "scram-sha-256");
  assert.equal(options.env.PGSSLMODE, "verify-full");
  for (let i = 0; i < args.length; i++)
    if (args[i] === "--env") assert.equal(args[i + 1].includes("="), false);
});
test("startup error uses owned server correlation; stderr alone cannot claim SQLSTATE", async () => {
  const correlated = await fakeExecutor({ state: "28P01" }).executor.psql(
    request,
  );
  assert.equal(correlated.sqlState, "28P01");
  assert.equal(correlated.origin, "postgres");
  const timeout = fakeExecutor({ timeout: true });
  const result = await timeout.executor.psql(request);
  assert.equal(result.origin, "timeout");
  assert.equal(result.sqlState, null);
  assert.equal(timeout.orphan(), 1);
});
test("SQL identity, budgets, variables, psql file/program controls fail before spawn", async () => {
  const fake = fakeExecutor();
  for (const mutation of [
    { role: "postgres" },
    { database: "production" },
    { timeoutMs: 999999 },
    { variables: { bad: "x" } },
    { inputSql: "\\! id" },
    { inputSql: "SELECT 1; \\o /tmp/file" },
    { inputSql: "COPY t TO PROGRAM 'id'" },
    { caseId: "x\nlog" },
  ])
    await assert.rejects(fake.executor.psql({ ...request, ...mutation }));
  assert.equal(fake.calls.length, 0);
});
test("unchanged migration metacommands and exact variables are accepted", () => {
  assert.doesNotThrow(() =>
    validateSqlRequest({
      ...request,
      inputSql:
        "\\set ON_ERROR_STOP on\n\\if :{?migration_checksum}\n\\else\nSELECT 1;\n\\endif",
      variables: {
        migration_checksum: "invalid_checksum",
        expected_up_checksum: "a".repeat(64),
      },
    }),
  );
});
test("persistent split frame waits for newline and disconnect is idempotent", async () => {
  const fake = fakeExecutor({ split: true });
  const session = await fake.executor.openSession({
    ...request,
    role: "migration",
    timeoutMs: 45000,
  });
  let settled = false;
  const query = session
    .query("SELECT 1;", { caseId: "synthetic.frame", timeoutMs: 22000 })
    .then((x) => {
      settled = true;
      return x;
    });
  assert.equal(settled, false);
  const result = await query;
  assert.equal(result.connectionClosed, false);
  assert.deepEqual(JSON.parse(result.stdout), { ok: true });
  assert.deepEqual(await session.disconnect(), { closed: true });
  assert.deepEqual(await session.disconnect(), { closed: true });
  assert.equal((await session.closed).connectionClosed, true);
});
test("disconnect preserves unobserved close and records orphan failure", async () => {
  const fake = fakeExecutor({ closeObserved: false });
  const session = await fake.executor.openSession({
    ...request,
    timeoutMs: 45000,
  });
  assert.deepEqual(await session.disconnect(), { closed: false });
  assert.equal((await session.closed).connectionClosed, false);
  assert.equal(fake.orphan(), 1);
});
test("persistent server idle fatal resolves retained terminal evidence without rejection", async () => {
  const fake = fakeExecutor({ state: "25P03", idle: true });
  const session = await fake.executor.openSession({
    ...request,
    timeoutMs: 45000,
  });
  const result = await session.query("SELECT 1;", {
    caseId: "synthetic.idle",
    timeoutMs: 22000,
  });
  assert.equal(result.origin, "postgres");
  assert.equal(result.sqlState, "25P03");
  assert.equal(result.connectionClosed, true);
  assert.equal((await session.closed).sqlState, "25P03");
  assert.equal(
    (
      await session.query("SELECT 1;", {
        caseId: "synthetic.retained",
        timeoutMs: 22000,
      })
    ).sqlState,
    "25P03",
  );
  assert.deepEqual(await session.disconnect(), { closed: true });
});
test("persistent concurrent query fails instead of interleaving SQL", async () => {
  const fake = fakeExecutor({ split: true });
  const session = await fake.executor.openSession({
    ...request,
    timeoutMs: 45000,
  });
  const first = session.query("SELECT 1;", {
    caseId: "synthetic.first",
    timeoutMs: 22000,
  });
  await assert.rejects(
    session.query("SELECT 2;", {
      caseId: "synthetic.second",
      timeoutMs: 22000,
    }),
    /SQL_CONCURRENT_QUERY/,
  );
  await first;
  await session.disconnect();
});

function resourceHarness({
  foreign = false,
  failRemove = false,
  inspectFailure = false,
} = {}) {
  const present = new Map(),
    calls = [];
  const execute = async (args) => {
    calls.push(args);
    const [kind, action] = args;
    const key = `${kind}:${args.at(-1)}`;
    if (action === "inspect") {
      if (!present.has(key) || inspectFailure)
        return { rawExit: 1, stdout: "" };
      return { rawExit: 0, stdout: JSON.stringify([present.get(key)]) };
    }
    if (action === "ls")
      return {
        rawExit: inspectFailure ? 1 : 0,
        stdout: [...present.entries()]
          .filter(([key]) => key.startsWith(`${kind}:`))
          .map(([, x]) => x.Name)
          .join("\n"),
      };
    if (action === "rm") {
      if (!failRemove) present.delete(key);
      return { rawExit: failRemove ? 1 : 0, stdout: "" };
    }
    throw new Error("unexpected synthetic command");
  };
  const owned = new OwnedResources(runId, execute);
  function add(kind, suffix) {
    const name = `ho-pg17-${runId}-${suffix}`;
    owned.intend(kind, name);
    const labels = {
      "org.hedefora.pg17.run": foreign ? "foreign" : runId,
      "org.hedefora.pg17.owner": "trusted-live-controller-v1",
    };
    present.set(`${kind}:${name}`, {
      Name: name,
      Labels: labels,
      Config: { Labels: labels },
    });
  }
  return { owned, add, calls, present };
}
test("lost create ACK still removes exact owned resource and verifies absence", async () => {
  const h = resourceHarness();
  h.add("volume", "tls");
  h.add("container", "helper");
  h.add("network", "net");
  const result = await h.owned.cleanup();
  assert.equal(result.status, "PASS");
  assert.equal(h.present.size, 0);
  assert.equal(h.calls.find((args) => args[1] === "rm")[0], "container");
  assert.equal(
    h.calls.some((args) => args.includes("prune")),
    false,
  );
});
test("foreign labels never trigger destructive cleanup", async () => {
  const h = resourceHarness({ foreign: true });
  h.add("container", "collision");
  await assert.rejects(h.owned.cleanup(), /OWNED_CLEANUP_FAILED/);
  assert.equal(
    h.calls.some((args) => args[1] === "rm"),
    false,
  );
});
test("cleanup failure remains failure even when test body would pass", async () => {
  const h = resourceHarness({ failRemove: true });
  h.add("container", "failure");
  await assert.rejects(h.owned.cleanup(), /OWNED_CLEANUP_FAILED/);
  assert.equal(h.present.size, 1);
});
test("daemon inspection failure is not resource absence", async () => {
  const h = resourceHarness({ inspectFailure: true });
  h.add("volume", "uncertain");
  await assert.rejects(h.owned.cleanup(), /OWNED_CLEANUP_FAILED/);
  assert.equal(
    h.calls.some((args) => args[1] === "rm"),
    false,
  );
});

async function control(controller, action, overrides = {}) {
  return fetch(`http://${controller.address}/v1/pg17`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hedefora-control-token": controlToken,
    },
    body: JSON.stringify({
      action,
      run_id: runId,
      image_digest: imageDigest,
      ...overrides,
    }),
  });
}
test("real loopback controller serializes actions and ACK follows actual callback", async () => {
  const events = [];
  let active = 0;
  const controller = await createLifecycleController({
    runId,
    imageDigest,
    controlToken,
    async start() {
      assert.equal(active++, 0);
      events.push("start-began");
      await delay(25);
      events.push("start-ready");
      active--;
    },
    async stop() {
      assert.equal(active++, 0);
      events.push("stop-began");
      await delay(25);
      events.push("stop-ack");
      active--;
    },
  });
  try {
    const first = control(controller, "start");
    await delay(10);
    const second = control(controller, "stop");
    const [a, b] = await Promise.all([first, second]);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.deepEqual(await a.json(), {
      run_id: runId,
      image_digest: imageDigest,
      action: "start",
      state: "accepting-scram-tls",
    });
    assert.deepEqual(events, [
      "start-began",
      "start-ready",
      "stop-began",
      "stop-ack",
    ]);
  } finally {
    await controller.close();
  }
});
test("controller malformed identity/method/content/body and callback failures cannot ACK", async () => {
  let called = 0;
  const controller = await createLifecycleController({
    runId,
    imageDigest,
    controlToken,
    async start() {
      called++;
      throw new Error("synthetic sensitive detail");
    },
    async stop() {
      called++;
    },
  });
  try {
    assert.equal(
      (await control(controller, "start", { run_id: "wrong" })).status,
      503,
    );
    assert.equal((await control(controller, "execute-shell")).status, 503);
    assert.equal(
      (await control(controller, "start", { extra: "x" })).status,
      503,
    );
    assert.equal(
      (await fetch(`http://${controller.address}/v1/pg17`)).status,
      400,
    );
    const huge = await fetch(`http://${controller.address}/v1/pg17`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hedefora-control-token": controlToken,
      },
      body: "x".repeat(2049),
    });
    assert.equal(huge.status, 503);
    assert.equal(called, 0);
    const failed = await control(controller, "start");
    assert.equal(failed.status, 503);
    assert.deepEqual(await failed.json(), { error: "control_action_failed" });
    assert.equal(called, 1);
  } finally {
    await controller.close();
  }
});
test("public runner without capability never executes an engine", async () => {
  await assert.rejects(
    runLivePg17({}),
    /LIVE_ENGINE_REQUIRES_LINUX|ADMISSION_AUTHORITY/,
  );
});
test("real controller rejects missing wrong malformed and duplicate private token", async () => {
  let called = 0;
  await assert.rejects(
    createLifecycleController({ runId, imageDigest }),
    /CONTROL_TOKEN_REQUIRED/,
  );
  const controller = await createLifecycleController({
    runId,
    imageDigest,
    controlToken,
    async start() {
      called++;
    },
    async stop() {
      called++;
    },
  });
  try {
    for (const token of [
      undefined,
      "e".repeat(64),
      runId,
      controlToken.toUpperCase(),
      `${controlToken}, ${controlToken}`,
    ]) {
      const response = await fetch(`http://${controller.address}/v1/pg17`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { "x-hedefora-control-token": token } : {}),
        },
        body: JSON.stringify({
          run_id: runId,
          image_digest: imageDigest,
          action: "start",
        }),
      });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        error: "invalid_control_request",
      });
    }
    const duplicateStatus = await new Promise((resolve, reject) => {
      const req = httpRequest(
        `http://${controller.address}/v1/pg17`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-hedefora-control-token": [controlToken, controlToken],
          },
        },
        (res) => {
          res.resume();
          res.once("end", () => resolve(res.statusCode));
        },
      );
      req.once("error", reject);
      req.end(
        JSON.stringify({
          run_id: runId,
          image_digest: imageDigest,
          action: "stop",
        }),
      );
    });
    assert.equal(duplicateStatus, 400);
    assert.equal(called, 0);
    const valid = await control(controller, "start");
    assert.equal(valid.status, 200);
    assert.ok(!(await valid.text()).includes(controlToken));
    assert.equal(called, 1);
  } finally {
    await controller.close();
  }
});
