import { randomBytes } from "node:crypto";
import {
  mkdir,
  writeFile,
  chmod,
  realpath,
  lstat,
  readdir,
  open,
} from "node:fs/promises";
import { resolve, dirname, basename, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { startProcess, requireLive } from "./process.mjs";
import {
  hash,
  strict,
  readSealed,
} from "../../../../scripts/postgres-image/apk-runtime/sealed-io.mjs";
import {
  admitFixture,
  fixtureArchive,
  validateAdmittedRun,
} from "./fixture-admission.mjs";
import { FIXTURE_IMAGE } from "./fixture-container.mjs";
import {
  fixtureCreateArgs,
  verifyFixtureInspect,
  verifyFixtureReceipt,
  verifyFixtureImageInspect,
} from "./fixture-host-policy.mjs";
import { prepareFixtureTools, prepareReadOnlyProbe } from "./fixture-build.mjs";
import { readBoundedRegularHandle } from "./live-runtime.mjs";

const ok = (result) =>
  result?.rawExit === 0 &&
  result.origin === "exit" &&
  result.connectionClosed === true;
const safePath = (path) => resolve(path).replaceAll("\\", "/");
async function boundedInput(path, maximum) {
  requireLive(
    (await realpath(path)) === resolve(path) &&
      !(await lstat(path)).isSymbolicLink(),
    "FIXTURE_INPUT_PATH",
  );
  const file = await open(path, "r");
  try {
    return await readBoundedRegularHandle(file, maximum);
  } finally {
    await file.close();
  }
}
export async function exactInventory(root, expected) {
  const found = [];
  let nodes = 0;
  async function visit(relative = "") {
    const path = resolve(root, relative),
      info = await lstat(path);
    requireLive(
      info.isDirectory() && !info.isSymbolicLink(),
      "FIXTURE_POST_DIRECTORY",
    );
    const entries = await readdir(path, { withFileTypes: true });
    requireLive(entries.length > 0, "FIXTURE_POST_EMPTY_DIRECTORY");
    for (const entry of entries) {
      requireLive(
        ++nodes <= 20000 && !entry.isSymbolicLink(),
        "FIXTURE_POST_INVENTORY_BOUND",
      );
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      requireLive(name.split("/").length <= 64, "FIXTURE_POST_DEPTH");
      if (entry.isDirectory()) await visit(name);
      else {
        requireLive(entry.isFile(), "FIXTURE_POST_FILE");
        found.push(name);
      }
    }
  }
  await visit();
  requireLive(
    JSON.stringify(found.sort()) === JSON.stringify([...expected].sort()),
    "FIXTURE_POST_INVENTORY",
  );
}
export async function verifyFixturePostInputs({
  sourceDirectory,
  toolsDirectory,
  inputDirectory,
  run,
  runBytes,
}) {
  const bundleBytes = await readSealed(
    toolsDirectory,
    "bundle.json",
    { sha256: run.bundleSha256 },
    4194304,
  );
  const bundle = strict(bundleBytes, "FIXTURE_POST_BUNDLE", 4194304);
  const probePath = ".fixture-ro-probe/canary";
  const probeBytes = Buffer.from("hedefora.pg17.read-only-probe.v1\n");
  await exactInventory(sourceDirectory, [
    ...bundle.sourceFiles.map((item) => item.path),
    probePath,
  ]);
  await exactInventory(toolsDirectory, [
    ...bundle.files.map((item) => item.name),
    "bundle.json",
    probePath,
  ]);
  await exactInventory(inputDirectory, ["run.json", probePath]);
  for (const directory of [sourceDirectory, toolsDirectory, inputDirectory])
    await readSealed(
      directory,
      probePath,
      { sha256: hash(probeBytes), size: probeBytes.length },
      128,
    );
  await readSealed(
    inputDirectory,
    "run.json",
    { sha256: hash(runBytes), size: runBytes.length },
    8192,
  );
  for (const item of bundle.sourceFiles)
    await readSealed(
      sourceDirectory,
      item.path,
      { sha256: item.sha256, size: item.bytes },
      16777216,
    );
  for (const item of bundle.files)
    await readSealed(
      toolsDirectory,
      item.name,
      { sha256: item.sha256, size: item.bytes },
      268435456,
    );
}
function ownContainer(inspect, run, name, id) {
  requireLive(
    Array.isArray(inspect) && inspect.length === 1,
    "FIXTURE_OWNED_COUNT",
  );
  const value = inspect[0],
    labels = value?.Config?.Labels;
  requireLive(
    /^[a-f0-9]{64}$/.test(value?.Id) &&
      (!id || value.Id === id) &&
      value.Name === `/${name}` &&
      value.Image === FIXTURE_IMAGE.manifest &&
      labels?.["io.hedefora.pg17.fixture.run"] === run.runId &&
      labels?.["io.hedefora.pg17.fixture.source"] === run.sourceCommit &&
      labels?.["io.hedefora.pg17.fixture.approval"] === run.approvalSha256 &&
      labels?.["io.hedefora.pg17.fixture.scope"] === "local-ci-test-only",
    "FIXTURE_OWNED_IDENTITY",
  );
  return value.Id;
}

// Transport seam is in-process test-only; the CLI always constructs the actual CLI transport.
export async function executeFixtureLifecycle({
  run,
  name,
  createArgs,
  mountSources,
  transport,
  persist,
  aborted = () => false,
  signal,
  sleep = delay,
  clock = () => performance.now(),
  inspectValidator = verifyFixtureInspect,
  receiptValidator = verifyFixtureReceipt,
}) {
  let id,
    receipt,
    failure,
    creationAttempted = false,
    createAcknowledged = false,
    removalObserved = false,
    cleaning = false;
  const events = [],
    start = clock(),
    lifetime = Date.parse(run.expiresAt) - Date.now();
  const remaining = () =>
    Math.floor(
      Math.min(
        lifetime - (clock() - start),
        Date.parse(run.expiresAt) - Date.now(),
      ),
    );
  const lease = () =>
    requireLive(
      !aborted() && !signal?.aborted && remaining() > 0,
      "FIXTURE_HOST_LEASE",
    );
  const call = async (args, budget = 15000) => {
    if (!cleaning) {
      lease();
      budget = Math.min(budget, remaining());
    }
    const result = await transport(
      args,
      budget,
      "",
      cleaning ? undefined : signal,
    );
    events.push({
      operation: args.slice(0, 2).join(" "),
      rawExit: result.rawExit,
      origin: result.origin,
      connectionClosed: result.connectionClosed,
      stdoutSha256: hash(result.stdout),
      stderrSha256: hash(result.stderr),
    });
    return result;
  };
  const inspect = async (target) => {
    const result = await call(["container", "inspect", target]);
    requireLive(ok(result), "FIXTURE_INSPECT_PROCESS");
    return strict(result.stdout, "FIXTURE_INSPECT", 1048576);
  };
  const absence = async () => {
    const result = await call([
      "container",
      "ls",
      "--all",
      "--no-trunc",
      "--filter",
      `name=^/${name}$`,
      "--format",
      "{{.ID}}",
    ]);
    requireLive(ok(result) && result.stdout.trim() === "", "FIXTURE_ABSENCE");
  };
  try {
    lease();
    await absence();
    // Persist intent before create: a lost create ACK still enters owned cleanup.
    await persist("intent.json", {
      schema: "hedefora.pg17.fixture-intent.v1",
      run,
      name,
      mountSources,
    });
    creationAttempted = true;
    const created = await call(createArgs, 30000);
    requireLive(
      ok(created) && /^[a-f0-9]{64}\s*$/.test(created.stdout),
      "FIXTURE_CREATE_PROCESS",
    );
    id = created.stdout.trim();
    createAcknowledged = true;
    const before = await inspect(id);
    ownContainer(before, run, name, id);
    inspectValidator(before, { run, name, id, mountSources, phase: "created" });
    await persist("inspect-created.json", before);
    lease();
    const started = await call(["container", "start", id], 30000);
    requireLive(
      ok(started) && started.stdout.trim() === id,
      "FIXTURE_START_PROCESS",
    );
    const during = await inspect(id);
    ownContainer(during, run, name, id);
    inspectValidator(during, { run, name, id, mountSources, phase: "running" });
    await persist("inspect-running.json", during);
    let after;
    while (true) {
      lease();
      await sleep(1000);
      after = await inspect(id);
      ownContainer(after, run, name, id);
      if (after[0].State?.Running === false) break;
      inspectValidator(after, {
        run,
        name,
        id,
        mountSources,
        phase: "running",
      });
    }
    await persist("inspect-exited.json", after);
    if (after[0].State.ExitCode !== 0) {
      const failedLogs = await call(["container", "logs", id]);
      if (ok(failedLogs) && failedLogs.stderr === "") {
        const value = strict(
          failedLogs.stdout,
          "FIXTURE_FAILURE_RECEIPT",
          65536,
        );
        if (
          value.status === "FAIL" &&
          /^[A-Z][A-Z0-9_]{0,95}$/.test(value.code)
        ) {
          await persist("container-failure.json", {
            status: "FAIL",
            code: value.code,
            failedCase:
              typeof value.failedCase === "string" &&
              /^[a-z][a-z0-9.-]{0,95}$/.test(value.failedCase)
                ? value.failedCase
                : null,
          });
        }
      }
    }
    inspectValidator(after, { run, name, id, mountSources, phase: "exited" });
    const waited = await call(["container", "wait", id]);
    requireLive(
      ok(waited) &&
        waited.stdout.trim() === "0" &&
        after[0].State.ExitCode === 0,
      "FIXTURE_WAIT_EXIT",
    );
    const logs = await call(["container", "logs", id]);
    requireLive(ok(logs) && logs.stderr === "", "FIXTURE_LOG_CHANNEL");
    receipt = receiptValidator(logs.stdout, {
      run,
      rawExit: after[0].State.ExitCode,
    });
    await persist(
      "container-receipt.json",
      strict(logs.stdout, "FIXTURE_RECEIPT", 65536),
    );
    lease();
  } catch (error) {
    failure =
      typeof error?.code === "string"
        ? error.code
        : /^[A-Z0-9_:]+$/.test(error?.message || "")
          ? error.message
          : "FIXTURE_HOST_EXECUTION";
  } finally {
    cleaning = true;
    try {
      if (creationAttempted) {
        // Resolve only our nonce/name; never remove a foreign ID after a lost ACK.
        let listed = await call([
          "container",
          "ls",
          "--all",
          "--no-trunc",
          "--filter",
          `name=^/${name}$`,
          "--format",
          "{{.ID}}",
        ]);
        for (
          let retry = 0;
          !createAcknowledged &&
          ok(listed) &&
          !listed.stdout.trim() &&
          retry < 3;
          retry++
        ) {
          await sleep(250);
          listed = await call([
            "container",
            "ls",
            "--all",
            "--no-trunc",
            "--filter",
            `name=^/${name}$`,
            "--format",
            "{{.ID}}",
          ]);
        }
        requireLive(ok(listed), "FIXTURE_CLEANUP_LIST");
        if (listed.stdout.trim()) {
          requireLive(
            /^[a-f0-9]{64}$/.test(listed.stdout.trim()),
            "FIXTURE_CLEANUP_COUNT",
          );
          const observed = await inspect(listed.stdout.trim());
          id = ownContainer(observed, run, name, id);
          const removed = await call(["container", "rm", "--force", id], 30000);
          requireLive(
            ok(removed) && removed.stdout.trim() === id,
            "FIXTURE_CLEANUP_REMOVE",
          );
          removalObserved = true;
        }
        requireLive(
          createAcknowledged || removalObserved,
          "FIXTURE_CREATE_COMPLETION_UNPROVEN",
        );
      }
      await absence();
    } catch {
      failure = "FIXTURE_HOST_CLEANUP";
    }
  }
  const result = {
    schema: "hedefora.pg17.fixture-host-result.v1",
    status: failure ? "FAIL" : "PASS",
    run,
    containerId: id || null,
    receipt: receipt || null,
    cleanup: {
      status: failure === "FIXTURE_HOST_CLEANUP" ? "FAIL" : "PASS",
      ownedRemovalAndAbsence: failure !== "FIXTURE_HOST_CLEANUP",
    },
    events,
    ...(failure ? { code: failure } : {}),
  };
  await persist("host-result.json", result);
  return result;
}

function dockerEnvironment(outputRoot) {
  const value = {
    DOCKER_CONFIG: safePath(resolve(outputRoot, "docker-config")),
    HOME: safePath(outputRoot),
    LANG: "C",
    LC_ALL: "C",
    TZ: "UTC",
  };
  if (process.platform === "win32") {
    requireLive(
      typeof process.env.SystemRoot === "string" &&
        isAbsolute(process.env.SystemRoot),
      "FIXTURE_SYSTEM_ROOT",
    );
    value.SystemRoot = process.env.SystemRoot;
    value.TEMP = outputRoot;
    value.TMP = outputRoot;
    value.DOCKER_HOST = "npipe:////./pipe/dockerDesktopLinuxEngine";
  } else {
    value.DOCKER_HOST = "unix:///var/run/docker.sock";
    value.TMPDIR = outputRoot;
  }
  return value;
}
async function executable(spec) {
  requireLive(
    spec &&
      Object.keys(spec).sort().join(",") === "path,sha256" &&
      isAbsolute(spec.path) &&
      /^[a-f0-9]{64}$/.test(spec.sha256),
    "FIXTURE_EXECUTABLE_SPEC",
  );
  await readSealed(
    dirname(spec.path),
    basename(spec.path),
    { sha256: spec.sha256 },
    150000000,
  );
  return spec.path;
}
export async function runFixtureHost(config) {
  requireLive(
    process.version === "v24.20.0" &&
      ["win32", "linux"].includes(process.platform),
    "FIXTURE_HOST_NODE",
  );
  requireLive(
    config &&
      Object.keys(config).sort().join(",") ===
        [
          "repository",
          "evidenceDirectory",
          "licenseInventoryPath",
          "outputRoot",
          "git",
          "docker",
          "goModCache",
          "linuxNode",
        ]
          .sort()
          .join(","),
    "FIXTURE_HOST_CONFIG",
  );
  const root = safePath(config.outputRoot);
  requireLive(
    isAbsolute(root) &&
      root !== safePath(config.repository) &&
      root.length > 10,
    "FIXTURE_OUTPUT_ROOT",
  );
  await mkdir(root, { mode: 0o700 });
  await mkdir(resolve(root, "docker-config"), { mode: 0o700 });
  const env = dockerEnvironment(root),
    docker = await executable(config.docker);
  const transport = async (args, timeoutMs = 15000, input = "", signal) => {
    const child = startProcess({
      executable: docker,
      args,
      env,
      cwd: root,
      timeoutMs,
      maxBytes: 1048576,
      input,
    });
    const cancel = () => child.cancel("cancel");
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    try {
      return await child.closed;
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
  };
  const daemon = await transport(["version", "--format", "{{json .}}"]);
  requireLive(ok(daemon), "FIXTURE_DOCKER_IDENTITY");
  const version = strict(daemon.stdout, "FIXTURE_DOCKER_VERSION", 65536);
  requireLive(
    version.Client.Version === "29.7.2" &&
      version.Server.Version === "29.7.2" &&
      version.Server.Os === "linux" &&
      version.Server.Arch === "amd64",
    "FIXTURE_DOCKER_VERSION",
  );
  const prepared = await prepareFixtureTools({
    ...config,
    outputRoot: resolve(root, "build"),
    dockerEnv: env,
  });
  const capability = await admitFixture({ ...config });
  const loaded = await transport(
    ["image", "load"],
    300000,
    fixtureArchive(capability),
  );
  requireLive(ok(loaded), "FIXTURE_IMAGE_LOAD");
  const image = await transport(["image", "inspect", FIXTURE_IMAGE.manifest]);
  requireLive(ok(image), "FIXTURE_IMAGE_INSPECT_PROCESS");
  verifyFixtureImageInspect(
    strict(image.stdout, "FIXTURE_IMAGE_INSPECT", 1048576),
  );
  const inputDirectory = safePath(resolve(root, "input"));
  await mkdir(inputDirectory, { mode: 0o700 });
  const now = Date.now(),
    run = {
      schema: "hedefora.pg17.fixture-run.v1",
      runId: randomBytes(16).toString("hex"),
      sourceCommit: prepared.sourceCommit,
      sourceTree: prepared.sourceTree,
      imageManifestDigest: FIXTURE_IMAGE.manifest,
      imageConfigDigest: FIXTURE_IMAGE.config,
      approvalSha256: capability.approvalSha256,
      bundleSha256: prepared.bundleSha256,
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(
        Math.min(now + 1200000, Date.parse(capability.expiresAt)),
      ).toISOString(),
    };
  validateAdmittedRun(capability, run);
  const runBytes = Buffer.from(JSON.stringify(run));
  await writeFile(resolve(inputDirectory, "run.json"), runBytes, {
    flag: "wx",
    mode: 0o444,
  });
  await prepareReadOnlyProbe(resolve(inputDirectory));
  await chmod(inputDirectory, 0o555);
  const name = `hedefora-pg17-fixture-${run.runId}`;
  const sourceDirectory = safePath(prepared.sourceDirectory),
    toolsDirectory = safePath(prepared.toolsDirectory);
  const mountSources = {
    "/source": sourceDirectory,
    "/tools": toolsDirectory,
    "/input": inputDirectory,
  };
  const persist = async (name, value) =>
    writeFile(resolve(root, name), JSON.stringify(value, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
  await persist("admission.json", capability);
  await persist("build-evidence.json", prepared.buildEvidence);
  const controller = new AbortController();
  let cancelled = false;
  const cancel = () => {
    cancelled = true;
    controller.abort();
  };
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  try {
    const result = await executeFixtureLifecycle({
      run,
      name,
      mountSources,
      createArgs: fixtureCreateArgs({
        run,
        name,
        sourceDirectory,
        toolsDirectory,
        inputDirectory,
      }),
      transport,
      persist,
      aborted: () => cancelled,
      signal: controller.signal,
    });
    // Re-read the exact mount inventory after execution; host/daemon are trusted,
    // and no concurrent snapshot writer is allowed (not an ABA-proof claim).
    await verifyFixturePostInputs({
      sourceDirectory,
      toolsDirectory,
      inputDirectory,
      run,
      runBytes,
    });
    requireLive(
      (await realpath(inputDirectory)) === resolve(inputDirectory) &&
        (await lstat(inputDirectory)).isDirectory(),
      "FIXTURE_POST_INPUT",
    );
    await persist("final-result.json", {
      ...result,
      sourceAndToolsPostHash: "PASS",
      archiveSha256: capability.archiveSha256,
    });
    return {
      status: result.status,
      code: result.code,
      sourceCommit: run.sourceCommit,
      sourceTree: run.sourceTree,
      outputRoot: root,
    };
  } finally {
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    requireLive(process.argv.length === 3, "FIXTURE_CONFIG_ARGUMENT");
    const config = strict(
      await boundedInput(process.argv[2], 16384),
      "FIXTURE_HOST_CONFIG",
      16384,
    );
    const result = await runFixtureHost(config);
    process.stdout.write(JSON.stringify(result) + "\n");
    process.exitCode = result.status === "PASS" ? 0 : 1;
  } catch (error) {
    process.stdout.write(
      JSON.stringify({
        status: "FAIL",
        code:
          error?.code ||
          (/^[A-Z0-9_:]+$/.test(error?.message || "")
            ? error.message
            : "FIXTURE_HOST_FAILURE"),
      }) + "\n",
    );
    process.exitCode = 1;
  }
}
