import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { open, lstat, realpath, readdir, unlink } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { connect } from "node:net";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  createPrivateRunSecrets,
  createLifecycleController,
  createRunBudget,
  readBoundedRegularHandle,
  GO_IMAGE,
} from "./live-runtime.mjs";
import { command, requireLive, LiveError } from "./process.mjs";
import {
  createNativePsqlExecutor,
  PG_BIN,
  NATIVE_FAILURE_CATEGORIES,
} from "./fixture-native-psql.mjs";
import { runStaticChecks, collectMigrationPlan } from "../run.mjs";
import {
  runLiveSqlAcceptance,
  verifyMigrationBundle,
  SqlAcceptanceError,
} from "../live-sql.mjs";
import { strict } from "../../../../scripts/postgres-image/apk-runtime/sealed-io.mjs";

export const FIXTURE_IMAGE = Object.freeze({
  manifest:
    "sha256:74bd7677a9d9bde0258dc3593106539a1fd5a0b23fecb4ee97dfb67589f8b6f2",
  config:
    "sha256:2479c67c1284d28d3d03a0eb8f0cff34d1388a20b5e11f8ea0f9756e918b21bb",
});
export const ROLES_SHA256 =
  "807d591779783d83ea0c4759d58076101db672a9d4fb93a95d754026aedd222a";
const HEX = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const ROOT = "/source";
export const RO_PROBE_PATH = ".fixture-ro-probe/canary";
export const RO_PROBE_CONTENT = "hedefora.pg17.read-only-probe.v1\n";
const INPUT_ROOTS = [ROOT, "/tools", "/input"];
let readOnlyInputsVerified = false;
const BASE_ENV = Object.freeze({
  PATH: `${PG_BIN}:/usr/bin:/bin`,
  HOME: "/nonexistent",
  TMPDIR: "/fixture",
  LC_ALL: "C",
  LANG: "C.UTF-8",
  TZ: "UTC",
});
const TOOL_NAMES = [
  "app.test",
  "node",
  "postgres.test",
  "test2json",
  "tlsfixture",
];
const RUN_FIELDS = [
  "schema",
  "runId",
  "sourceCommit",
  "sourceTree",
  "imageManifestDigest",
  "imageConfigDigest",
  "approvalSha256",
  "bundleSha256",
  "issuedAt",
  "expiresAt",
];
export const GO_PACKAGES = Object.freeze({
  "github.com/tahackr5/HedefOra-V1/internal/platform/postgres": Object.freeze([
    "TestPG17TLSAndSCRAM",
    "TestPG17TLSAndAuthenticationFailuresDoNotFallback",
    "TestPG17AmbientDiscoveryCannotChangeTheEndpoint",
    "TestPG17PoolCapacityDeadlineReuseAndClose",
    "TestPG17InflightQueryCancellationAndClose",
  ]),
  "github.com/tahackr5/HedefOra-V1/internal/platform/app": Object.freeze([
    "TestPG17APIStartupOutageRecoveryAndDrain",
  ]),
});
const exactKeys = (value, keys) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join(",") === [...keys].sort().join(",");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function validateFixtureRun(value, now = Date.now()) {
  requireLive(
    exactKeys(value, RUN_FIELDS) &&
      RUN_FIELDS.every((key) => typeof value[key] === "string"),
    "FIXTURE_RUN_FIELDS",
  );
  requireLive(
    value.schema === "hedefora.pg17.fixture-run.v1" &&
      /^[a-f0-9]{32}$/.test(value.runId) &&
      COMMIT.test(value.sourceCommit) &&
      COMMIT.test(value.sourceTree) &&
      value.imageManifestDigest === FIXTURE_IMAGE.manifest &&
      value.imageConfigDigest === FIXTURE_IMAGE.config &&
      HEX.test(value.approvalSha256) &&
      HEX.test(value.bundleSha256),
    "FIXTURE_RUN_BINDING",
  );
  const issued = Date.parse(value.issuedAt),
    expires = Date.parse(value.expiresAt);
  requireLive(
    typeof value.issuedAt === "string" &&
      typeof value.expiresAt === "string" &&
      Number.isFinite(issued) &&
      Number.isFinite(expires) &&
      Number.isFinite(now) &&
      new Date(issued).toISOString() === value.issuedAt &&
      new Date(expires).toISOString() === value.expiresAt &&
      issued <= now &&
      expires > now &&
      expires > issued &&
      expires - issued <= 1200000,
    "FIXTURE_LEASE",
  );
  return Object.freeze({ ...value });
}

export function validateToolBundle(bundle, run) {
  requireLive(
    exactKeys(bundle, [
      "schema",
      "sourceCommit",
      "sourceTree",
      "goVersion",
      "goImage",
      "race",
      "integration",
      "files",
      "sourceFiles",
    ]),
    "FIXTURE_BUNDLE_FIELDS",
  );
  requireLive(
    bundle.schema === "hedefora.pg17.fixture-tools.v1" &&
      bundle.sourceCommit === run.sourceCommit &&
      bundle.sourceTree === run.sourceTree &&
      bundle.goVersion === "go1.26.7" &&
      bundle.goImage === GO_IMAGE &&
      bundle.race === true &&
      bundle.integration === true,
    "FIXTURE_BUNDLE_BINDING",
  );
  requireLive(
    Array.isArray(bundle.files) &&
      bundle.files.length === TOOL_NAMES.length &&
      bundle.files
        .map((item) => item?.name)
        .sort()
        .join(",") === TOOL_NAMES.join(","),
    "FIXTURE_TOOL_INVENTORY",
  );
  for (const item of bundle.files)
    requireLive(
      exactKeys(item, ["name", "sha256", "bytes"]) &&
        typeof item.name === "string" &&
        typeof item.sha256 === "string" &&
        HEX.test(item.sha256) &&
        Number.isSafeInteger(item.bytes) &&
        item.bytes > 0 &&
        item.bytes <= 268435456,
      "FIXTURE_TOOL_ENTRY",
    );
  requireLive(
    Array.isArray(bundle.sourceFiles) &&
      bundle.sourceFiles.length > 0 &&
      bundle.sourceFiles.length <= 10000,
    "FIXTURE_SOURCE_INVENTORY",
  );
  let previous = "",
    total = 0;
  for (const item of bundle.sourceFiles) {
    requireLive(
      exactKeys(item, ["path", "sha256", "bytes"]) &&
        typeof item.path === "string" &&
        /^[A-Za-z0-9_.@/-]+$/.test(item.path) &&
        item.path.split("/")[0] !== ".fixture-ro-probe" &&
        !item.path
          .split("/")
          .some(
            (part) =>
              !part ||
              part === "." ||
              part === ".." ||
              part === ".git" ||
              part === ".env",
          ) &&
        item.path > previous &&
        typeof item.sha256 === "string" &&
        HEX.test(item.sha256) &&
        Number.isSafeInteger(item.bytes) &&
        item.bytes >= 0 &&
        item.bytes <= 16777216,
      "FIXTURE_SOURCE_ENTRY",
    );
    total += item.bytes;
    previous = item.path;
  }
  requireLive(total <= 268435456, "FIXTURE_SOURCE_BOUND");
  return bundle;
}

function parseMounts(text) {
  requireLive(
    typeof text === "string" && Buffer.byteLength(text) <= 131072,
    "FIXTURE_MOUNT_BOUND",
  );
  return text
    .trim()
    .split("\n")
    .map((line) => {
      const parts = line.split(" "),
        dash = parts.indexOf("-");
      requireLive(
        dash >= 6 && parts.length === dash + 4 && !parts[4].includes("\\"),
        "FIXTURE_MOUNT_FORMAT",
      );
      return {
        path: parts[4],
        flags: new Set(parts[5].split(",")),
        type: parts[dash + 1],
        options: new Set(parts[dash + 3].split(",")),
      };
    });
}
export function validateSelfIsolation({
  platform,
  pid,
  uid,
  gid,
  groups,
  status,
  mounts,
  devices,
  routes,
  routes6,
}) {
  requireLive(
    platform === "linux" &&
      pid === 1 &&
      uid === 26 &&
      gid === 102 &&
      Array.isArray(groups) &&
      groups.every((group) => group === 102),
    "FIXTURE_IDENTITY",
  );
  const fields = Object.fromEntries(
    status
      .trim()
      .split("\n")
      .map((line) => {
        const index = line.indexOf(":");
        return [line.slice(0, index), line.slice(index + 1).trim()];
      }),
  );
  requireLive(
    ["CapInh", "CapPrm", "CapEff", "CapBnd", "CapAmb"].every(
      (field) => fields[field] === "0000000000000000",
    ) &&
      fields.NoNewPrivs === "1" &&
      fields.Seccomp === "2" &&
      fields.Uid?.split(/\s+/).join(",") === "26,26,26,26" &&
      fields.Gid?.split(/\s+/).join(",") === "102,102,102,102",
    "FIXTURE_CAPABILITIES",
  );
  requireLive(
    Array.isArray(devices) &&
      devices.length === 1 &&
      devices[0] === "lo" &&
      routes
        .trim()
        .split("\n")
        .slice(1)
        .every((line) => !line.trim() || line.split(/\s+/)[0] === "lo") &&
      routes6
        .trim()
        .split("\n")
        .every(
          (line) => !line.trim() || line.trim().split(/\s+/).at(-1) === "lo",
        ),
    "FIXTURE_NETWORK",
  );
  const observed = parseMounts(mounts);
  for (const path of ["/", "/source", "/tools", "/input"]) {
    const entries = observed.filter((entry) => entry.path === path);
    requireLive(
      entries.length === 1 && entries[0].flags.has("ro"),
      "FIXTURE_READONLY_MOUNT",
    );
    if (path !== "/")
      requireLive(
        !observed.some((entry) => entry.path.startsWith(`${path}/`)),
        "FIXTURE_NESTED_MOUNT",
      );
  }
  for (const [path, kilobytes] of [
    ["/fixture", 524288],
    ["/tmp", 65536],
  ]) {
    const entries = observed.filter((entry) => entry.path === path);
    requireLive(
      entries.length === 1 &&
        entries[0].type === "tmpfs" &&
        ["rw", "noexec", "nosuid", "nodev"].every((flag) =>
          entries[0].flags.has(flag),
        ) &&
        entries[0].options.has(`size=${kilobytes}k`) &&
        entries[0].options.has("uid=26") &&
        entries[0].options.has("gid=102") &&
        entries[0].options.has("mode=700"),
      "FIXTURE_TMPFS",
    );
  }
  requireLive(
    !observed.some((entry) =>
      ["/source/", "/tools/", "/input/", "/fixture/", "/tmp/"].some((prefix) =>
        entry.path.startsWith(prefix),
      ),
    ),
    "FIXTURE_NESTED_MOUNT",
  );
  return Object.freeze({
    status: "PASS",
    authority: "self-observation-only",
    uid: 26,
    gid: 102,
    pid: 1,
    capabilities: "none",
    noNewPrivileges: true,
    seccomp: "filter",
    interfaces: ["lo"],
    readOnlyRoot: true,
  });
}

// These public canaries make the write probes meaningful even when ordinary
// snapshot files are DAC-readonly. Mode calibration is not an ACL assertion:
// both actual write-open attempts must still return exactly EROFS.
export async function verifyProbeCanaries({
  openFile = open,
  lstatFile = lstat,
  realpathFile = realpath,
  uid = process.geteuid?.(),
  gid = process.getegid?.(),
  groups = process.getgroups?.(),
} = {}) {
  requireLive(
    uid === 26 &&
      gid === 102 &&
      Array.isArray(groups) &&
      groups.every((group) => group === 102),
    "FIXTURE_RO_PROBE_IDENTITY",
  );
  const effectiveBits = (info) => {
    const mode = Number(info.mode);
    if (Number(info.uid) === uid) return (mode >> 6) & 7;
    if (Number(info.gid) === gid || groups.includes(Number(info.gid)))
      return (mode >> 3) & 7;
    return mode & 7;
  };
  async function directory(path, required) {
    const info = await lstatFile(path, { bigint: true });
    requireLive(
      info.isDirectory() &&
        !info.isSymbolicLink() &&
        (await realpathFile(path)) === path,
      "FIXTURE_RO_PROBE_DIRECTORY",
    );
    requireLive(
      (Number(info.mode) & required) === required &&
        (effectiveBits(info) & required) === required,
      "FIXTURE_RO_PROBE_CALIBRATION",
    );
  }
  await directory("/", 1);
  for (const root of INPUT_ROOTS) {
    await directory(root, 1);
    await directory(`${root}/.fixture-ro-probe`, 7);
    const path = `${root}/${RO_PROBE_PATH}`;
    const before = await lstatFile(path, { bigint: true });
    requireLive(
      before.isFile() &&
        !before.isSymbolicLink() &&
        before.nlink === 1n &&
        (await realpathFile(path)) === path,
      "FIXTURE_RO_PROBE_FILE",
    );
    requireLive(
      (Number(before.mode) & 2) === 2 && (effectiveBits(before) & 2) === 2,
      "FIXTURE_RO_PROBE_CALIBRATION",
    );
    const file = await openFile(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const sameFile = (info) =>
        info.isFile() &&
        info.nlink === 1n &&
        [
          "dev",
          "ino",
          "nlink",
          "size",
          "mode",
          "uid",
          "gid",
          "mtimeNs",
          "ctimeNs",
        ].every(
          (key) => typeof before[key] === "bigint" && before[key] === info[key],
        );
      requireLive(
        sameFile(await file.stat({ bigint: true })),
        "FIXTURE_RO_PROBE_CHANGED",
      );
      const bytes = await readBoundedRegularHandle(
        file,
        Buffer.byteLength(RO_PROBE_CONTENT),
      );
      requireLive(
        bytes.equals(Buffer.from(RO_PROBE_CONTENT)) &&
          hash(bytes) === hash(RO_PROBE_CONTENT),
        "FIXTURE_RO_PROBE_HASH",
      );
      requireLive(
        sameFile(await file.stat({ bigint: true })) &&
          sameFile(await lstatFile(path, { bigint: true })) &&
          (await realpathFile(path)) === path,
        "FIXTURE_RO_PROBE_CHANGED",
      );
    } finally {
      await file.close();
    }
  }
}

export async function probeReadOnlyInputs(openFile = open, probeOptions = {}) {
  await verifyProbeCanaries(probeOptions);
  for (const root of INPUT_ROOTS) {
    for (const [path, flags] of [
      [`${root}/${RO_PROBE_PATH}`, constants.O_WRONLY | constants.O_NOFOLLOW],
      [
        `${root}/.fixture-ro-probe/.create-${randomBytes(16).toString("hex")}`,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW,
      ],
    ]) {
      let handle;
      try {
        handle = await openFile(path, flags, 0o600);
      } catch (error) {
        requireLive(error?.code === "EROFS", "FIXTURE_RO_PROBE_ERROR");
        continue;
      }
      await handle.close();
      throw new LiveError("FIXTURE_RO_PROBE_WRITABLE");
    }
  }
}

async function readRegular(path, maxBytes, readOnly = false) {
  requireLive(!readOnly || readOnlyInputsVerified, "FIXTURE_RO_NOT_VERIFIED");
  requireLive((await realpath(path)) === path, "FIXTURE_CANONICAL_PATH");
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await file.stat({ bigint: true });
    requireLive(info.isFile() && info.nlink === 1n, "FIXTURE_FILE_MODE");
    if (info.size === 0n) {
      const bytes = Buffer.alloc(1),
        { bytesRead } = await file.read(bytes, 0, 1, 0),
        after = await file.stat({ bigint: true });
      requireLive(
        bytesRead === 0 &&
          ["dev", "ino", "nlink", "size", "mtimeNs", "ctimeNs"].every(
            (key) => info[key] === after[key],
          ),
        "FIXTURE_FILE_CHANGED",
      );
      return Buffer.alloc(0);
    }
    return await readBoundedRegularHandle(file, maxBytes);
  } finally {
    await file.close();
  }
}
async function procText(path) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const bytes = Buffer.alloc(131073);
    let used = 0;
    while (used < bytes.length) {
      const read = await file.read(bytes, used, bytes.length - used, null);
      if (!read.bytesRead) break;
      used += read.bytesRead;
    }
    requireLive(used <= 131072, "FIXTURE_PROC_BOUND");
    return bytes.subarray(0, used).toString("utf8");
  } finally {
    await file.close();
  }
}
async function inventory(root) {
  const found = [];
  let entriesSeen = 0;
  async function visit(relative) {
    const path = relative ? `${root}/${relative}` : root;
    const info = await lstat(path);
    requireLive(
      readOnlyInputsVerified && info.isDirectory() && !info.isSymbolicLink(),
      "FIXTURE_DIRECTORY_MODE",
    );
    const entries = await readdir(path, { withFileTypes: true });
    requireLive(entries.length > 0, "FIXTURE_EMPTY_DIRECTORY");
    for (const entry of entries) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      requireLive(
        ++entriesSeen <= 20002 &&
          found.length < 10001 &&
          name.length < 512 &&
          name.split("/").length <= 64,
        "FIXTURE_INVENTORY_BOUND",
      );
      if (entry.isDirectory()) await visit(name);
      else {
        requireLive(
          entry.isFile() && !entry.isSymbolicLink(),
          "FIXTURE_INVENTORY_TYPE",
        );
        found.push(name);
      }
    }
  }
  await visit("");
  return found.sort();
}
export async function verifyFiles(
  bundle,
  { inventoryFiles = inventory, readFile = readRegular, probeOptions } = {},
) {
  requireLive(
    JSON.stringify(await inventoryFiles(ROOT)) ===
      JSON.stringify(
        [...bundle.sourceFiles.map((item) => item.path), RO_PROBE_PATH].sort(),
      ),
    "FIXTURE_SOURCE_INVENTORY_DRIFT",
  );
  requireLive(
    JSON.stringify(await inventoryFiles("/tools")) ===
      JSON.stringify([...TOOL_NAMES, "bundle.json", RO_PROBE_PATH].sort()) &&
      JSON.stringify(await inventoryFiles("/input")) ===
        JSON.stringify([RO_PROBE_PATH, "run.json"]),
    "FIXTURE_MOUNT_INVENTORY",
  );
  for (const item of bundle.sourceFiles) {
    const bytes = await readFile(`${ROOT}/${item.path}`, 16777216, true);
    requireLive(
      bytes.length === item.bytes && hash(bytes) === item.sha256,
      "FIXTURE_SOURCE_HASH",
    );
  }
  for (const item of bundle.files) {
    const bytes = await readFile(`/tools/${item.name}`, 268435456, true);
    requireLive(
      bytes.length === item.bytes && hash(bytes) === item.sha256,
      "FIXTURE_TOOL_HASH",
    );
  }
  await verifyProbeCanaries(probeOptions);
}

// Raw test output stays in bounded memory. Only known test names and numerical
// evidence are emitted. A package PASS without all six exact tests is rejected.
export function validateGoEvents(text, packageName, binary, converter) {
  requireLive(
    Object.hasOwn(GO_PACKAGES, packageName) &&
      typeof text === "string" &&
      Buffer.byteLength(text) <= 1048576 &&
      text.endsWith("\n"),
    "FIXTURE_GO_JSON_BOUND",
  );
  for (const result of [binary, converter])
    requireLive(
      result?.rawExit === 0 &&
        result.origin === "exit" &&
        result.connectionClosed === true,
      "FIXTURE_GO_PROCESS",
    );
  const states = new Map(),
    expected = new Set(GO_PACKAGES[packageName]);
  let packageStarted = false,
    packagePassed = false;
  for (const line of text.slice(0, -1).split("\n")) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      throw new LiveError("FIXTURE_GO_JSON");
    }
    requireLive(
      event &&
        !Array.isArray(event) &&
        event.Package === packageName &&
        !packagePassed &&
        Object.keys(event).every((key) =>
          ["Time", "Action", "Package", "Test", "Elapsed", "Output"].includes(
            key,
          ),
        ) &&
        ["start", "run", "pause", "cont", "output", "pass"].includes(
          event.Action,
        ),
      "FIXTURE_GO_EVENT",
    );
    requireLive(
      (event.Output === undefined || typeof event.Output === "string") &&
        (event.Elapsed === undefined ||
          (Number.isFinite(event.Elapsed) && event.Elapsed >= 0)),
      "FIXTURE_GO_EVENT_VALUE",
    );
    if (event.Action === "start") {
      requireLive(!packageStarted && !event.Test, "FIXTURE_GO_START");
      packageStarted = true;
      continue;
    }
    requireLive(packageStarted, "FIXTURE_GO_ORDER");
    if (event.Test !== undefined) {
      requireLive(
        typeof event.Test === "string" &&
          /^[A-Za-z0-9_/-]{1,256}$/.test(event.Test) &&
          expected.has(event.Test.split("/")[0]),
        "FIXTURE_GO_TEST_NAME",
      );
      const previous = states.get(event.Test);
      if (event.Action === "run") {
        requireLive(previous === undefined, "FIXTURE_GO_DUPLICATE");
        states.set(event.Test, "run");
      } else if (event.Action === "pass") {
        requireLive(
          previous === "run" || previous === "cont",
          "FIXTURE_GO_DUPLICATE",
        );
        states.set(event.Test, "pass");
      } else if (event.Action === "pause") {
        requireLive(previous === "run", "FIXTURE_GO_ORDER");
        states.set(event.Test, "pause");
      } else if (event.Action === "cont") {
        requireLive(previous === "pause", "FIXTURE_GO_ORDER");
        states.set(event.Test, "cont");
      } else
        requireLive(
          event.Action === "output" && previous !== undefined,
          "FIXTURE_GO_ORDER",
        );
    } else if (event.Action === "pass") {
      packagePassed = true;
    } else requireLive(event.Action === "output", "FIXTURE_GO_PACKAGE_EVENT");
  }
  requireLive(
    packagePassed &&
      [...expected].every((name) => states.get(name) === "pass") &&
      [...states.values()].every((state) => state === "pass"),
    "FIXTURE_GO_REQUIRED_TESTS",
  );
  return {
    package: packageName,
    status: "PASS",
    requiredTests: [...expected],
    packagePass: true,
    binaryExit: 0,
    converterExit: 0,
    skipped: 0,
    failed: 0,
  };
}

// Both binaries are direct children. The binary stdout is explicitly piped to
// the separately supervised converter. A close timeout on either kills both.
export async function runGoPackage({
  packageName,
  env,
  timeoutMs,
  spawnImpl = spawn,
}) {
  requireLive(
    Object.hasOwn(GO_PACKAGES, packageName) &&
      Number.isInteger(timeoutMs) &&
      timeoutMs > 0 &&
      timeoutMs <= 140000,
    "FIXTURE_GO_REQUEST",
  );
  const children = [];
  let output = "",
    total = 0,
    invalid = false,
    timedOut = false,
    timer;
  const cancel = () => {
    for (const entry of children) {
      if (entry.done || entry.cancelled) continue;
      entry.cancelled = true;
      try {
        entry.child.kill("SIGKILL");
      } catch {
        invalid = true;
      }
    }
  };
  const watch = (executable, args, converter = false) => {
    const child = spawnImpl(executable, args, {
      env: { ...env },
      cwd: ROOT,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const entry = { child, done: false };
    children.push(entry);
    entry.closed = new Promise((resolve) => {
      entry.resolve = resolve;
      child.once("error", () => {
        invalid = true;
        cancel();
      });
      child.once("close", (code) => {
        entry.done = true;
        if (code !== 0) cancel();
        resolve({
          rawExit: Number.isInteger(code) ? code : -1,
          origin: timedOut ? "timeout" : invalid ? "channel" : "exit",
          connectionClosed: true,
        });
      });
    });
    for (const stream of [child.stdout, child.stderr, child.stdin])
      stream.on("error", () => {
        invalid = true;
        cancel();
      });
    for (const [stream, retain] of [
      [child.stdout, converter],
      [child.stderr, false],
    ])
      stream.on("data", (bytes) => {
        total += bytes.length;
        if (total > 2097152 || (converter && !retain && bytes.length)) {
          invalid = true;
          cancel();
          return;
        }
        if (retain) {
          output += bytes.toString("utf8");
          if (Buffer.byteLength(output) > 1048576) {
            invalid = true;
            cancel();
          }
        }
      });
    return entry;
  };
  let converter, binary;
  try {
    converter = watch("/tools/test2json", ["-p", packageName], true);
    binary = watch(
      packageName.endsWith("/postgres")
        ? "/tools/postgres.test"
        : "/tools/app.test",
      [
        "-test.v=test2json",
        "-test.parallel=1",
        "-test.count=1",
        "-test.shuffle=on",
        "-test.timeout=120s",
        "-test.run=^TestPG17",
      ],
    );
    binary.child.stdout.pipe(converter.child.stdin);
    binary.child.stdin.end();
    timer = setTimeout(() => {
      timedOut = true;
      cancel();
    }, timeoutMs);
    // A missing close is bounded and remains an explicit failure. This fallback
    // never reports a connectionClosed result and cannot validate as PASS.
    const fallback = setTimeout(() => {
      timedOut = true;
      cancel();
      for (const entry of children)
        if (!entry.done)
          entry.resolve({
            rawExit: -1,
            origin: "timeout",
            connectionClosed: false,
          });
    }, timeoutMs + 2000);
    try {
      const [binaryResult, converterResult] = await Promise.all([
        binary.closed,
        converter.closed,
      ]);
      requireLive(!invalid && !timedOut, "FIXTURE_GO_CHANNEL");
      return validateGoEvents(
        output,
        packageName,
        binaryResult,
        converterResult,
      );
    } finally {
      clearTimeout(fallback);
    }
  } catch (error) {
    invalid = true;
    cancel();
    // Even a synchronous second spawn failure must reap the first child before
    // returning. A bounded fallback records missing close as failure.
    await Promise.all(
      children.map(async (entry) => {
        let end;
        const bounded = new Promise((resolve) => {
          end = setTimeout(resolve, 2000);
        });
        await Promise.race([entry.closed, bounded]);
        clearTimeout(end);
      }),
    );
    throw error instanceof LiveError
      ? error
      : new LiveError("FIXTURE_GO_SPAWN");
  } finally {
    clearTimeout(timer);
  }
}

export function startPostmaster({ directory, lifetimeMs, spawnImpl = spawn }) {
  requireLive(
    ["/fixture/primary", "/fixture/negative"].includes(directory) &&
      Number.isInteger(lifetimeMs) &&
      lifetimeMs > 0 &&
      lifetimeMs <= 1200000,
    "FIXTURE_POSTMASTER_REQUEST",
  );
  let child,
    finished = false,
    closeObserved = false,
    rawExit = -1,
    failure = false,
    logs = "",
    logsEvicted = false,
    total = 0,
    timer,
    fallback;
  const generation = randomBytes(16).toString("hex");
  let settle;
  const closed = new Promise((resolve) => {
    settle = resolve;
  });
  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    clearTimeout(fallback);
    settle({
      rawExit,
      connectionClosed: closeObserved,
      origin: failure ? "channel" : "exit",
    });
  }
  function kill() {
    failure = true;
    try {
      child?.kill("SIGKILL");
    } catch {
      /* unproven close fails */
    }
    if (!fallback) fallback = setTimeout(finish, 2000);
  }
  try {
    child = spawnImpl(`${PG_BIN}/postgres`, ["-D", directory], {
      env: { ...BASE_ENV },
      cwd: "/fixture",
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    for (const stream of [child.stdout, child.stderr]) {
      stream.on("data", (bytes) => {
        total += bytes.length;
        if (total > 4194304) {
          kill();
          return;
        }
        logs += bytes.toString("utf8");
        if (Buffer.byteLength(logs) > 131072) {
          logsEvicted = true;
          logs = Buffer.from(logs)
            .subarray(-131072)
            .toString("utf8")
            .split("\n")
            .slice(1)
            .join("\n");
        }
      });
      stream.on("error", kill);
    }
    child.once("error", kill);
    child.once("close", (code) => {
      closeObserved = true;
      rawExit = Number.isInteger(code) ? code : -1;
      finish();
    });
    timer = setTimeout(kill, lifetimeMs);
  } catch {
    kill();
  }
  return Object.freeze({
    closed,
    readLogs: () => logs,
    logSnapshot: () =>
      Object.freeze({ generation, evicted: logsEvicted, text: logs }),
    isRunning: () => !finished && !failure,
    async stop() {
      if (!finished) {
        try {
          child?.kill("SIGINT");
        } catch {
          kill();
        }
      }
      const limit = setTimeout(kill, 8000);
      const result = await closed;
      clearTimeout(limit);
      requireLive(
        result.rawExit === 0 &&
          result.origin === "exit" &&
          result.connectionClosed,
        "FIXTURE_POSTMASTER_STOP",
      );
      return result;
    },
  });
}

async function listenerClosed(port) {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    let settled = false;
    const finish = (value) => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(value);
      }
    };
    socket.setTimeout(1000, () => finish(false));
    socket.once("connect", () => finish(false));
    socket.once("error", (error) => finish(error.code === "ECONNREFUSED"));
  });
}
async function privateFile(path, bytes, replace = false) {
  const file = await open(
    path,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_NOFOLLOW |
      (replace ? constants.O_TRUNC : constants.O_EXCL),
    0o600,
  );
  try {
    await file.writeFile(bytes);
    await file.sync();
  } finally {
    await file.close();
  }
}
export function postgresConfiguration(negative) {
  const directory = negative ? "/fixture/negative" : "/fixture/primary";
  return [
    "listen_addresses = '127.0.0.1'",
    `port = ${negative ? 5433 : 5432}`,
    `unix_socket_directories = '${directory}'`,
    "unix_socket_permissions = 0700",
    "password_encryption = 'scram-sha-256'",
    `ssl = ${negative ? "off" : "on"}`,
    "ssl_cert_file = '/fixture/tls/server.crt'",
    "ssl_key_file = '/fixture/tls/server.key'",
    "ssl_min_protocol_version = 'TLSv1.2'",
    "logging_collector = off",
    "log_destination = 'stderr'",
    "log_statement = 'none'",
    "log_min_error_statement = 'panic'",
    "log_error_verbosity = 'verbose'",
    "log_line_prefix = '%a %e [fixture:%u:%d] '",
    "log_parameter_max_length = 0",
    "log_parameter_max_length_on_error = 0",
    "log_connections = off",
    "log_disconnections = off",
    "shared_buffers = '32MB'",
    "max_connections = 30",
    "max_wal_size = '64MB'",
    "min_wal_size = '32MB'",
    "wal_buffers = '1MB'",
    "fsync = on",
    "full_page_writes = on",
    "synchronous_commit = on",
    "timezone = 'UTC'",
    "lc_messages = 'C'",
    "shared_preload_libraries = ''",
    "session_preload_libraries = ''",
    "local_preload_libraries = ''",
    "",
  ].join("\n");
}
const HBA =
  "local all all scram-sha-256\nhostnossl all all 0.0.0.0/0 reject\nhostnossl all all ::/0 reject\nhostssl all all 127.0.0.1/32 scram-sha-256\nhost all all 0.0.0.0/0 reject\nhost all all ::/0 reject\n";

export function readinessFailureCode(key, database, result, category) {
  const server = key === "primary" ? "P" : key === "negative" ? "N" : "U";
  const phase =
    database === "postgres"
      ? "INIT"
      : database === "hedefora_dev"
        ? "APP"
        : "UNKNOWN";
  const exit =
    Number.isInteger(result?.rawExit) &&
    result.rawExit >= 0 &&
    result.rawExit <= 255
      ? String(result.rawExit)
      : "UNKNOWN";
  const state = /^[0-9A-Z]{5}$/.test(result?.sqlState ?? "")
    ? result.sqlState
    : "NONE";
  const safeCategory = NATIVE_FAILURE_CATEGORIES.includes(category)
    ? category
    : "UNKNOWN";
  return `FIXTURE_READINESS_${server}_${phase}_EXIT_${exit}_STATE_${state}_${safeCategory}`;
}

// A repeated start is acknowledged only after actual SQL readiness. A stopped
// postmaster must have an observed clean close before a replacement is created.
export async function ensurePostmasterStarted({ current, restart, readiness }) {
  requireLive(
    current &&
      typeof current.isRunning === "function" &&
      typeof restart === "function" &&
      typeof readiness === "function",
    "FIXTURE_START_REQUEST",
  );
  if (!current.isRunning()) {
    const closed = await current.closed;
    requireLive(
      closed?.connectionClosed === true &&
        closed.origin === "exit" &&
        closed.rawExit === 0,
      "FIXTURE_START_UNCLEAN_CLOSE",
    );
    await restart();
  }
  await readiness();
}

export async function runFixtureContainer() {
  let run = null,
    isolation = null,
    bootstrap = null,
    sqlEvidence = null,
    goEvidence = null,
    failure = null,
    failedCase = null,
    controller = null,
    orphanRisk = false;
  let cleaning = false;
  const executors = [],
    servers = new Map();
  let budget, leaseEnd, monotonicEnd;
  const lease = () => {
    requireLive(
      !cleaning && Date.now() < leaseEnd && performance.now() < monotonicEnd,
      "FIXTURE_LEASE_EXPIRED",
    );
    budget.check();
  };
  const limited = (milliseconds) => {
    lease();
    return budget.limit(milliseconds);
  };
  async function checked(
    executable,
    args,
    env = BASE_ENV,
    input = "",
    timeoutMs = 30000,
  ) {
    const result = await command({
      executable,
      args,
      env,
      input,
      cwd: "/fixture",
      timeoutMs: limited(timeoutMs),
      maxBytes: 131072,
    });
    requireLive(
      result.rawExit === 0 &&
        result.origin === "exit" &&
        result.connectionClosed,
      "FIXTURE_NATIVE_COMMAND",
    );
    return result;
  }
  async function stopServer(key) {
    const server = servers.get(key);
    if (server) await server.stop();
    requireLive(
      await listenerClosed(key === "primary" ? 5432 : 5433),
      "FIXTURE_LISTENER_NOT_CLOSED",
    );
  }
  try {
    requireLive(
      process.platform === "linux" &&
        process.pid === 1 &&
        process.execPath === "/tools/node" &&
        process.argv.length === 2 &&
        process.argv[1] ===
          `${ROOT}/tests/integration/postgres/live/fixture-container.mjs`,
      "FIXTURE_ENTRYPOINT",
    );
    process.umask(0o077);
    isolation = validateSelfIsolation({
      platform: process.platform,
      pid: process.pid,
      uid: process.getuid(),
      gid: process.getgid(),
      groups: process.getgroups(),
      status: await procText("/proc/self/status"),
      mounts: await procText("/proc/self/mountinfo"),
      devices: Object.keys(networkInterfaces()).sort(),
      routes: await procText("/proc/net/route"),
      routes6: await procText("/proc/net/ipv6_route"),
    });
    await probeReadOnlyInputs();
    readOnlyInputsVerified = true;
    run = validateFixtureRun(
      strict(
        await readRegular("/input/run.json", 8192, true),
        "FIXTURE_RUN",
        8192,
      ),
    );
    leaseEnd = Date.parse(run.expiresAt);
    const lifetime = Math.floor(leaseEnd - Date.now());
    monotonicEnd = performance.now() + lifetime;
    budget = createRunBudget({ maxMs: lifetime });
    const bundleBytes = await readRegular("/tools/bundle.json", 4194304, true);
    requireLive(hash(bundleBytes) === run.bundleSha256, "FIXTURE_BUNDLE_HASH");
    const bundle = validateToolBundle(
      strict(bundleBytes, "FIXTURE_BUNDLE", 4194304),
      run,
    );
    await verifyFiles(bundle);
    lease();
    for (const path of ["/fixture", "/tmp"]) {
      const info = await lstat(path);
      requireLive(
        info.isDirectory() &&
          info.uid === 26 &&
          info.gid === 102 &&
          (info.mode & 0o777) === 0o700 &&
          (await readdir(path)).length === 0,
        "FIXTURE_PRIVATE_ROOT",
      );
    }
    runStaticChecks();
    const migrationBundle = verifyMigrationBundle({
      plan: collectMigrationPlan(),
      upSql: (
        await readRegular(
          `${ROOT}/db/migrations/000001_database_foundation.up.sql`,
          262144,
          true,
        )
      ).toString("utf8"),
      downSql: (
        await readRegular(
          `${ROOT}/db/migrations/000001_database_foundation.down.sql`,
          262144,
          true,
        )
      ).toString("utf8"),
    });
    const roles = await readRegular(
      `${ROOT}/infra/postgres/initdb/010_roles.sql`,
      65536,
      true,
    );
    requireLive(hash(roles) === ROLES_SHA256, "FIXTURE_ROLES_HASH");
    const { passwords, controlToken } = createPrivateRunSecrets();
    await checked("/tools/tlsfixture", ["--output-dir", "/fixture/tls"]);
    await privateFile("/fixture/admin-password", `${passwords.admin}\n`);
    for (const key of ["primary", "negative"]) {
      lease();
      const version = await checked(`${PG_BIN}/initdb`, ["--version"]);
      requireLive(
        /^initdb \(PostgreSQL\) 17\.11(?:\s[^\r\n]*)?\r?\n$/.test(
          version.stdout,
        ),
        "FIXTURE_INITDB_VERSION",
      );
      await checked(
        `${PG_BIN}/initdb`,
        [
          "--pgdata",
          `/fixture/${key}`,
          "--username=hedefora_dev",
          "--pwfile=/fixture/admin-password",
          "--auth-local=scram-sha-256",
          "--auth-host=scram-sha-256",
          "--locale-provider=builtin",
          "--locale=C.UTF-8",
          "--encoding=UTF8",
          "--data-checksums",
          "--no-instructions",
        ],
        BASE_ENV,
        "",
        60000,
      );
      await privateFile(
        `/fixture/${key}/postgresql.conf`,
        postgresConfiguration(key === "negative"),
        true,
      );
      await privateFile(`/fixture/${key}/pg_hba.conf`, HBA, true);
      servers.set(
        key,
        startPostmaster({
          directory: `/fixture/${key}`,
          lifetimeMs: Math.max(
            1,
            Math.floor(
              Math.min(leaseEnd - Date.now(), monotonicEnd - performance.now()),
            ),
          ),
        }),
      );
    }
    await unlink("/fixture/admin-password");
    const common = {
      runId: run.runId,
      passwords,
      markOrphanRisk: () => {
        orphanRisk = true;
      },
      commandBudget: limited,
    };
    const primary = createNativePsqlExecutor({
      ...common,
      readLogs: async () => servers.get("primary").readLogs(),
      logSnapshot: () => servers.get("primary").logSnapshot(),
    });
    const negative = createNativePsqlExecutor({
      ...common,
      negative: true,
      readLogs: async () => servers.get("negative").readLogs(),
    });
    executors.push(primary, negative);
    async function readiness(
      executor,
      key,
      database = "hedefora_dev",
      milliseconds = 10000,
    ) {
      const end = performance.now() + milliseconds;
      let lastResult;
      while (performance.now() < end) {
        lease();
        requireLive(servers.get(key).isRunning(), "FIXTURE_POSTMASTER_EXITED");
        const result = await executor.psql({
          caseId: "engine.readiness",
          role: "admin",
          database,
          timeoutMs: 4000,
          inputSql:
            "SELECT json_build_object('version',current_setting('server_version_num')::int,'ssl',current_setting('ssl'),'auth',system_user,'checksums',current_setting('data_checksums'),'encoding',current_setting('server_encoding'),'provider',datlocprovider,'locale',datlocale) FROM pg_database WHERE datname=current_database();",
        });
        lastResult = result;
        if (
          result.rawExit === 0 &&
          result.connectionClosed &&
          result.origin === "postgres"
        ) {
          let value;
          try {
            value = JSON.parse(result.stdout.trim());
          } catch {
            throw new LiveError("FIXTURE_READINESS_JSON");
          }
          requireLive(
            value.version === 170011 &&
              value.ssl === (key === "primary" ? "on" : "off") &&
              value.auth === "scram-sha-256:hedefora_dev" &&
              value.checksums === "on" &&
              value.encoding === "UTF8" &&
              value.provider === "b" &&
              value.locale === "C.UTF-8",
            "FIXTURE_READINESS_IDENTITY",
          );
          return value;
        }
        await delay(100);
      }
      throw new LiveError(
        readinessFailureCode(
          key,
          database,
          lastResult,
          executor.lastFailureCategory(),
        ),
      );
    }
    await readiness(primary, "primary", "postgres", 15000);
    await readiness(negative, "negative", "postgres", 15000);
    const created = await primary.psql({
      caseId: "bootstrap.database",
      role: "admin",
      database: "postgres",
      timeoutMs: 12000,
      inputSql: "CREATE DATABASE hedefora_dev;",
    });
    requireLive(
      created.rawExit === 0 &&
        created.origin === "postgres" &&
        created.connectionClosed,
      "FIXTURE_DATABASE_BOOTSTRAP",
    );
    // The immutable bootstrap uses its own reviewed getenv instructions. It is
    // intentionally outside the matrix adapter's no-metacommand SQL interface.
    await checked(
      `${PG_BIN}/psql`,
      ["-X", "-Atq", "-w", "--set=ON_ERROR_STOP=1", "--set=VERBOSITY=sqlstate"],
      {
        ...BASE_ENV,
        PGHOST: "127.0.0.1",
        PGPORT: "5432",
        PGUSER: "hedefora_dev",
        PGDATABASE: "hedefora_dev",
        PGPASSWORD: passwords.admin,
        PGSSLMODE: "verify-full",
        PGSSLROOTCERT: "/fixture/tls/ca.crt",
        PGSSLMINPROTOCOLVERSION: "TLSv1.2",
        PGREQUIREAUTH: "scram-sha-256",
        PGGSSENCMODE: "disable",
        PGCONNECT_TIMEOUT: "3",
        PGPASSFILE: "/dev/null",
        PGSERVICEFILE: "/dev/null",
        PGSYSCONFDIR: "/nonexistent",
        HEDEFORA_DEV_POSTGRES_MIGRATION_PASSWORD: passwords.migration,
        HEDEFORA_DEV_POSTGRES_APP_PASSWORD: passwords.app,
        HEDEFORA_DEV_POSTGRES_WORKER_PASSWORD: passwords.worker,
      },
      roles,
    );
    bootstrap = {
      status: "PASS",
      serverVersionNum: (await readiness(primary, "primary")).version,
      rolesSha256: ROLES_SHA256,
      localeProvider: "builtin",
      locale: "C.UTF-8",
      encoding: "UTF8",
      dataChecksums: true,
      primaryAuth: "scram-sha-256",
      primaryTLS: true,
      negativeTLS: false,
    };
    controller = await createLifecycleController({
      runId: run.runId,
      imageDigest: run.imageManifestDigest,
      controlToken,
      start: async () => {
        lease();
        const current = servers.get("primary");
        await ensurePostmasterStarted({
          current,
          restart: async () => {
            servers.set(
              "primary",
              startPostmaster({
                directory: "/fixture/primary",
                lifetimeMs: Math.max(
                  1,
                  Math.floor(
                    Math.min(
                      leaseEnd - Date.now(),
                      monotonicEnd - performance.now(),
                    ),
                  ),
                ),
              }),
            );
          },
          readiness: () => readiness(primary, "primary"),
        });
      },
      stop: async () => {
        lease();
        await stopServer("primary");
      },
    });
    await privateFile(
      "/fixture/pg17-integration.json",
      JSON.stringify({
        schema: "hedefora.pg17.integration.v2",
        run_id: run.runId,
        source_sha: run.sourceCommit,
        image_digest: run.imageManifestDigest,
        synthetic_only: true,
        host: "127.0.0.1",
        tls_port: 5432,
        plaintext_port: 5433,
        root_ca_pem: (await readRegular("/fixture/tls/ca.crt", 16384)).toString(
          "utf8",
        ),
        password: passwords.app,
        control_address: controller.address,
        control_token: controlToken,
      }),
    );
    sqlEvidence = await runLiveSqlAcceptance({
      verifyBeforeConnect: async () => {
        lease();
        runStaticChecks();
        return migrationBundle;
      },
      psql: primary.psql,
      openSession: primary.openSession,
    });
    requireLive(sqlEvidence.status === "PASS", "FIXTURE_SQL_GATE");
    const packages = [];
    for (const packageName of Object.keys(GO_PACKAGES))
      packages.push(
        await runGoPackage({
          packageName,
          timeoutMs: limited(140000),
          env: {
            ...BASE_ENV,
            HEDEFORA_PG17_TEST_ADMISSION: "admitted-disposable-pg17-v1",
            HEDEFORA_PG17_TEST_FIXTURE: "/fixture/pg17-integration.json",
            HEDEFORA_PG17_TEST_SOURCE_SHA: run.sourceCommit,
            HEDEFORA_PG17_TEST_IMAGE_DIGEST: run.imageManifestDigest,
          },
        }),
      );
    goEvidence = {
      status: "PASS",
      goVersion: "go1.26.7",
      race: true,
      integration: true,
      packages,
    };
    lease();
    requireLive(!orphanRisk, "FIXTURE_CLIENT_LIFETIME");
    requireLive(
      [...servers.values()].every((server) => server.isRunning()),
      "FIXTURE_POSTMASTER_EXITED",
    );
    await verifyFiles(bundle);
    lease();
  } catch (error) {
    failure =
      error instanceof LiveError
        ? error.code
        : error instanceof SqlAcceptanceError &&
            /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code)
          ? `FIXTURE_SQL_${error.code}`
          : "FIXTURE_EXECUTION_FAILED";
    if (
      typeof error?.caseId === "string" &&
      /^[a-z][a-z0-9.-]{0,95}$/.test(error.caseId)
    )
      failedCase = error.caseId;
  } finally {
    cleaning = true;
    try {
      await controller?.close();
    } catch {
      failure = "FIXTURE_CONTROLLER_CLEANUP";
    }
    for (const executor of executors) {
      try {
        await executor.closeAll();
      } catch {
        failure = "FIXTURE_CLIENT_CLEANUP";
      }
    }
    for (const key of servers.keys()) {
      try {
        await stopServer(key);
      } catch {
        failure = "FIXTURE_POSTMASTER_CLEANUP";
      }
    }
    if (orphanRisk) failure = "FIXTURE_CLIENT_LIFETIME";
  }
  const cleanup = {
    status: failure?.includes("CLEANUP") || orphanRisk ? "FAIL" : "PASS",
    postmasters: servers.size,
    hostRemoval: "NOT_OBSERVED",
  };
  return {
    schema: "hedefora.pg17.fixture-result.v1",
    status: failure ? "FAIL" : "PASS",
    ...(run
      ? Object.fromEntries(
          RUN_FIELDS.filter(
            (key) => !["schema", "issuedAt", "expiresAt"].includes(key),
          ).map((key) => [key, run[key]]),
        )
      : {}),
    isolation,
    bootstrap,
    sqlEvidence,
    goEvidence,
    cleanup,
    ...(failure ? { code: failure, failedCase, execution: "FAILED" } : {}),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const receipt = await runFixtureContainer().catch(() => ({
    schema: "hedefora.pg17.fixture-result.v1",
    status: "FAIL",
    code: "FIXTURE_INTERNAL_FAILURE",
    execution: "FAILED",
  }));
  const bytes = JSON.stringify(receipt);
  if (Buffer.byteLength(bytes) <= 65536) process.stdout.write(`${bytes}\n`);
  else
    process.stdout.write(
      '{"schema":"hedefora.pg17.fixture-result.v1","status":"FAIL","code":"FIXTURE_RECEIPT_BOUND","execution":"FAILED"}\n',
    );
  process.exitCode =
    receipt.status === "PASS" && Buffer.byteLength(bytes) <= 65536 ? 0 : 1;
}
