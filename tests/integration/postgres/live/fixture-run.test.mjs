import test from "node:test";
import assert from "node:assert/strict";
import {
  executeFixtureLifecycle,
  verifyFixturePostInputs,
} from "./fixture-run.mjs";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { FIXTURE_IMAGE } from "./fixture-container.mjs";

function setup(options = {}) {
  const now = Date.now(),
    run = {
      schema: "hedefora.pg17.fixture-run.v1",
      runId: "a".repeat(32),
      sourceCommit: "b".repeat(40),
      sourceTree: "c".repeat(40),
      imageManifestDigest: FIXTURE_IMAGE.manifest,
      imageConfigDigest: FIXTURE_IMAGE.config,
      approvalSha256: "d".repeat(64),
      bundleSha256: "e".repeat(64),
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 60000).toISOString(),
    };
  const id = "f".repeat(64),
    name = `hedefora-pg17-fixture-${run.runId}`,
    calls = [],
    files = new Map();
  let exists = false,
    phase = "created",
    aborted = false;
  const value = () => [
    {
      Id: id,
      Name: `/${name}`,
      Image: FIXTURE_IMAGE.manifest,
      Config: {
        Labels: {
          "io.hedefora.pg17.fixture.run": options.foreign
            ? "0".repeat(32)
            : run.runId,
          "io.hedefora.pg17.fixture.source": run.sourceCommit,
          "io.hedefora.pg17.fixture.approval": run.approvalSha256,
          "io.hedefora.pg17.fixture.scope": "local-ci-test-only",
        },
      },
      State: { Running: phase === "running", ExitCode: options.exit || 0 },
    },
  ];
  const result = (
    stdout = "",
    rawExit = 0,
    origin = "exit",
    connectionClosed = true,
  ) => ({ stdout, stderr: "", rawExit, origin, connectionClosed });
  const transport = async (args) => {
    const operation = args[1];
    calls.push(operation);
    if (operation === "ls")
      return options.listFailure && exists
        ? result("", 1)
        : result(exists ? `${id}\n` : "");
    if (operation === "create") {
      assert.ok(files.has("intent.json"));
      exists = true;
      return options.lostCreate
        ? result("", -1, "timeout", false)
        : result(`${id}\n`);
    }
    if (operation === "inspect") return result(JSON.stringify(value()));
    if (operation === "start") {
      phase = "running";
      return options.lostStart
        ? result("", -1, "timeout", false)
        : result(`${id}\n`);
    }
    if (operation === "wait") return result(`${options.exit || 0}\n`);
    if (operation === "logs")
      return result('{"status":"PASS"}\n', options.logFailure ? 1 : 0);
    if (operation === "rm") {
      if (options.removeFailure) return result("", 1);
      exists = false;
      return result(`${id}\n`);
    }
    throw Error(`unexpected ${operation}`);
  };
  return {
    calls,
    files,
    exists: () => exists,
    params: {
      run,
      name,
      createArgs: ["container", "create"],
      mountSources: {
        "/source": "/source",
        "/tools": "/tools",
        "/input": "/input",
      },
      transport,
      persist: async (name, value) => files.set(name, value),
      sleep: async () => {
        phase = "exited";
        aborted = Boolean(options.cancel);
      },
      aborted: () => aborted,
      inspectValidator: () => {
        if (options.policyFailure) throw Error("FIXTURE_POLICY");
      },
      receiptValidator: () => {
        if (options.receiptFailure) throw Error("FIXTURE_RECEIPT");
        return { status: "PASS" };
      },
    },
  };
}
test("actual host lifecycle requires intent, pre/during/post inspect, wait, receipt and absence", async () => {
  const f = setup(),
    result = await executeFixtureLifecycle(f.params);
  assert.equal(result.status, "PASS");
  assert.equal(f.exists(), false);
  for (const name of [
    "intent.json",
    "inspect-created.json",
    "inspect-running.json",
    "inspect-exited.json",
    "container-receipt.json",
    "host-result.json",
  ])
    assert.ok(f.files.has(name));
  assert.ok(f.calls.indexOf("wait") < f.calls.indexOf("rm"));
  assert.equal(f.calls.at(-1), "ls");
});
for (const name of [
  "lostCreate",
  "lostStart",
  "policyFailure",
  "receiptFailure",
  "cancel",
  "logFailure",
])
  test(`host ${name} fails and removes only the owned container`, async () => {
    const f = setup({ [name]: true }),
      result = await executeFixtureLifecycle(f.params);
    assert.equal(result.status, "FAIL");
    assert.equal(f.exists(), false);
    assert.ok(f.calls.includes("rm"));
    assert.equal(result.cleanup.status, "PASS");
  });
for (const name of ["removeFailure", "listFailure", "foreign"])
  test(`host ${name} cannot assert cleanup`, async () => {
    const f = setup({ [name]: true }),
      result = await executeFixtureLifecycle(f.params);
    assert.equal(result.status, "FAIL");
    assert.equal(result.code, "FIXTURE_HOST_CLEANUP");
    assert.equal(result.cleanup.status, "FAIL");
    assert.equal(f.exists(), true);
    if (name === "foreign") assert.ok(!f.calls.includes("rm"));
  });
test("nonzero actual engine exit cannot pass even with a PASS log", async () => {
  const f = setup({ exit: 1 }),
    result = await executeFixtureLifecycle(f.params);
  assert.equal(result.status, "FAIL");
  assert.equal(f.exists(), false);
});
test("preexisting same name is never adopted or removed", async () => {
  const f = setup();
  f.params.transport = async () => ({
    rawExit: 0,
    origin: "exit",
    connectionClosed: true,
    stdout: "f".repeat(64) + "\n",
    stderr: "",
  });
  const result = await executeFixtureLifecycle(f.params);
  assert.equal(result.status, "FAIL");
  assert.equal(result.cleanup.status, "FAIL");
  assert.ok(!f.files.has("intent.json"));
});
test("every execution command is capped to remaining lease; cleanup has independent bounded time", async () => {
  const f = setup(),
    actual = f.params.transport,
    budgets = [];
  let elapsed = 0;
  f.params.clock = () => elapsed;
  f.params.transport = async (args, budget) => {
    budgets.push({ operation: args[1], budget });
    const result = await actual(args);
    if (args[1] === "create") elapsed = 59900;
    if (args[1] === "start") elapsed = 60001;
    return result;
  };
  const result = await executeFixtureLifecycle(f.params);
  assert.equal(result.status, "FAIL");
  assert.equal(f.exists(), false);
  assert.ok(budgets.find((x) => x.operation === "start").budget <= 100);
  assert.equal(budgets.find((x) => x.operation === "rm").budget, 30000);
  assert.equal(f.files.has("inspect-running.json"), false);
});
test("aborted signal propagates to active execution transport but not cleanup", async () => {
  const f = setup(),
    controller = new AbortController(),
    actual = f.params.transport,
    seen = [];
  f.params.signal = controller.signal;
  f.params.transport = async (args, budget, input, signal) => {
    seen.push({ operation: args[1], signal });
    const result = await actual(args);
    if (args[1] === "start") controller.abort();
    return result;
  };
  const result = await executeFixtureLifecycle(f.params);
  assert.equal(result.status, "FAIL");
  assert.equal(f.exists(), false);
  assert.equal(
    seen.find((x) => x.operation === "start").signal,
    controller.signal,
  );
  assert.equal(seen.find((x) => x.operation === "rm").signal, undefined);
});
test("lost create ACK with no observed completion never claims cleanup PASS", async () => {
  const f = setup({ lostCreate: true }),
    actual = f.params.transport;
  f.params.transport = async (args, budget) =>
    args[1] === "ls"
      ? {
          rawExit: 0,
          origin: "exit",
          connectionClosed: true,
          stdout: "",
          stderr: "",
        }
      : actual(args, budget);
  const result = await executeFixtureLifecycle(f.params);
  assert.equal(result.status, "FAIL");
  assert.equal(result.cleanup.status, "FAIL");
  assert.equal(result.cleanup.ownedRemovalAndAbsence, false);
});
test("lost create ACK delayed after first empty list is reconciled and owned removed", async () => {
  const f = setup({ lostCreate: true }),
    actual = f.params.transport;
  let lists = 0;
  f.params.transport = async (args, budget) => {
    if (args[1] === "ls" && ++lists === 2)
      return {
        rawExit: 0,
        origin: "exit",
        connectionClosed: true,
        stdout: "",
        stderr: "",
      };
    return actual(args, budget);
  };
  const result = await executeFixtureLifecycle(f.params);
  assert.equal(result.status, "FAIL");
  assert.equal(result.cleanup.status, "PASS");
  assert.equal(f.exists(), false);
});
test("post execution rejects added inventory, changed run bytes and changed source/tool bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "hedefora-fixture-post-test-"));
  const sha = (b) => createHash("sha256").update(b).digest("hex");
  try {
    const sourceDirectory = join(root, "source"),
      toolsDirectory = join(root, "tools"),
      inputDirectory = join(root, "input");
    for (const path of [sourceDirectory, toolsDirectory, inputDirectory])
      await mkdir(path);
    await writeFile(join(sourceDirectory, "public.txt"), "source");
    await writeFile(join(toolsDirectory, "tool"), "tool");
    const bundleBytes = Buffer.from(
      JSON.stringify({
        sourceFiles: [{ path: "public.txt", sha256: sha("source"), bytes: 6 }],
        files: [{ name: "tool", sha256: sha("tool"), bytes: 4 }],
      }),
    );
    await writeFile(join(toolsDirectory, "bundle.json"), bundleBytes);
    const runBytes = Buffer.from('{"synthetic":true}');
    await writeFile(join(inputDirectory, "run.json"), runBytes);
    const params = {
      sourceDirectory,
      toolsDirectory,
      inputDirectory,
      run: { bundleSha256: sha(bundleBytes) },
      runBytes,
    };
    await verifyFixturePostInputs(params);
    for (const path of [sourceDirectory, toolsDirectory, inputDirectory]) {
      await writeFile(join(path, "extra"), "x");
      await assert.rejects(
        verifyFixturePostInputs(params),
        /FIXTURE_POST_INVENTORY/,
      );
      await rm(join(path, "extra"));
    }
    for (const [path, original] of [
      [join(sourceDirectory, "public.txt"), "source"],
      [join(toolsDirectory, "tool"), "tool"],
      [join(inputDirectory, "run.json"), runBytes],
    ]) {
      await writeFile(path, "mutation");
      await assert.rejects(verifyFixturePostInputs(params));
      await writeFile(path, original);
    }
    await verifyFixturePostInputs(params);
  } finally {
    assert.equal(await realpath(root), resolve(root));
    assert.ok(root.startsWith(join(tmpdir(), "hedefora-fixture-post-test-")));
    await rm(root, { recursive: true, force: true });
  }
});
