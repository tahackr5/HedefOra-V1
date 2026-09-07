import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import * as fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { startProcess, requireLive, LiveError } from "./process.mjs";
import {
  GO_IMAGE,
  createRunBudget,
  readBoundedRegularHandle,
} from "./live-runtime.mjs";

export const LINUX_NODE_SHA256 =
  "89af8424dd53e560b1933f87ba650d8bf57c83ca5a04600eefb31f416aabbae7";
const HEX = /^[a-f0-9]{64}$/;
const OID = /^[a-f0-9]{40}$/;
const MAX_SOURCE_FILE = 16777216;
const OWNER_LABEL = "org.hedefora.pg17.builder";
const OWNER_VALUE = "fixture-tools-v1";
const RUN_LABEL = "org.hedefora.pg17.build-run";
const GO = "/usr/local/go/bin/go";
const READ_ONLY_PROBE_DIRECTORY = ".fixture-ro-probe";
const READ_ONLY_PROBE_BYTES = Buffer.from("hedefora.pg17.read-only-probe.v1\n");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const BUILD_ENV = Object.freeze({
  PATH: "/usr/local/go/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
  HOME: "/nonexistent",
  TMPDIR: "/tmp",
  LC_ALL: "C",
  TZ: "UTC",
  GOWORK: "off",
  GOENV: "off",
  GOTOOLCHAIN: "local",
  GOFLAGS: "-mod=readonly",
  GOPROXY: "off",
  GOSUMDB: "off",
  GOCACHE: "/tmp/gocache",
  GOMODCACHE: "/gomodcache",
  GOTELEMETRY: "off",
  CGO_ENABLED: "1",
  GOOS: "linux",
  GOARCH: "amd64",
  GOAMD64: "v1",
});
export const BUILD_COMMANDS = Object.freeze([
  Object.freeze({
    name: "postgres.test",
    args: Object.freeze([
      "test",
      "-c",
      "-race",
      "-tags=integration",
      "-trimpath",
      "-buildvcs=false",
      "-o",
      "/out/postgres.test",
      "./internal/platform/postgres",
    ]),
  }),
  Object.freeze({
    name: "app.test",
    args: Object.freeze([
      "test",
      "-c",
      "-race",
      "-tags=integration",
      "-trimpath",
      "-buildvcs=false",
      "-o",
      "/out/app.test",
      "./internal/platform/app",
    ]),
  }),
  Object.freeze({
    name: "test2json",
    args: Object.freeze([
      "build",
      "-trimpath",
      "-buildvcs=false",
      "-o",
      "/out/test2json",
      "cmd/test2json",
    ]),
  }),
  Object.freeze({
    name: "tlsfixture",
    args: Object.freeze([
      "build",
      "-trimpath",
      "-buildvcs=false",
      "-o",
      "/out/tlsfixture",
      "./tests/integration/postgres/cmd/tlsfixture",
    ]),
  }),
]);
const TOOL_NAMES = [
  "app.test",
  "node",
  "postgres.test",
  "test2json",
  "tlsfixture",
];
const fixedChildEnv = () => ({
  LC_ALL: "C",
  TZ: "UTC",
  HOME: "/nonexistent",
  ...(process.platform === "win32"
    ? { SystemRoot: process.env.SystemRoot ?? "C:\\Windows" }
    : { PATH: "/usr/bin:/bin" }),
});
const gitEnv = () => ({
  ...fixedChildEnv(),
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
  GIT_TERMINAL_PROMPT: "0",
  GIT_OPTIONAL_LOCKS: "0",
  GIT_LFS_SKIP_SMUDGE: "1",
});
const gitArgs = (repository, args) => [
  "-c",
  "core.fsmonitor=false",
  "-c",
  "core.hooksPath=/nonexistent",
  "-c",
  "core.untrackedCache=false",
  "-C",
  repository,
  ...args,
];

// Abort owns the local CLI process only. Server-side work is reconciled by the
// builder's independently bounded cleanup, which deliberately passes no signal.
export async function fixtureCommand(options, signal) {
  requireLive(!signal?.aborted, "FIXTURE_COMMAND_ABORTED");
  const child = startProcess({ ...options, input: options.input ?? "" });
  const cancel = () => child.cancel("cancel");
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  try {
    const result = await child.closed;
    requireLive(!signal?.aborted, "FIXTURE_COMMAND_ABORTED");
    return result;
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}

export function validatePublicSourcePath(value) {
  requireLive(
    typeof value === "string" &&
      value.length > 0 &&
      value.length < 512 &&
      /^[A-Za-z0-9_.@/-]+$/.test(value),
    "FIXTURE_BUILD_SOURCE_PATH",
  );
  const parts = value.split("/");
  requireLive(
    parts[0].toLowerCase() !== READ_ONLY_PROBE_DIRECTORY,
    "FIXTURE_BUILD_RESERVED_PROBE_PATH",
  );
  requireLive(
    parts.length <= 64 &&
      parts.every(
        (part) => part && part !== "." && part !== ".." && part !== ".git",
      ),
    "FIXTURE_BUILD_SOURCE_PATH",
  );
  const name = parts.at(-1).toLowerCase();
  requireLive(
    name !== ".env" &&
      !/^\.env\.(?!example$|sample$|template$)/.test(name) &&
      !/\.(?:key|pem|p12|pfx|keystore)$/.test(name) &&
      ![
        "id_rsa",
        "id_ed25519",
        "credentials",
        "credentials.json",
        "secrets.json",
      ].includes(name),
    "FIXTURE_BUILD_PRIVATE_PATH",
  );
  return value;
}
export function parseTrackedTree(text) {
  requireLive(
    typeof text === "string" &&
      Buffer.byteLength(text) <= 4194304 &&
      text.endsWith("\0"),
    "FIXTURE_BUILD_TREE_BOUND",
  );
  const entries = text
    .slice(0, -1)
    .split("\0")
    .map((line) => {
      const match = /^(100644|100755) blob ([a-f0-9]{40})\t([^\0]+)$/.exec(
        line,
      );
      requireLive(match, "FIXTURE_BUILD_TREE_TYPE");
      return { path: validatePublicSourcePath(match[3]), objectId: match[2] };
    })
    .sort((left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
    );
  requireLive(
    entries.length > 0 &&
      entries.length <= 10000 &&
      new Set(entries.map((entry) => entry.path.toLowerCase())).size ===
        entries.length,
    "FIXTURE_BUILD_TREE_INVENTORY",
  );
  // Case-fold collisions fail on every host, preserving one portable snapshot.
  const names = new Set(entries.map((entry) => entry.path.toLowerCase()));
  for (const entry of entries) {
    const parts = entry.path.toLowerCase().split("/");
    for (let size = 1; size < parts.length; size++)
      requireLive(
        !names.has(parts.slice(0, size).join("/")),
        "FIXTURE_BUILD_TREE_COLLISION",
      );
  }
  return entries;
}
export function verifyGitBlob(bytes, objectId) {
  requireLive(
    Buffer.isBuffer(bytes) &&
      bytes.length <= MAX_SOURCE_FILE &&
      OID.test(objectId),
    "FIXTURE_BUILD_BLOB_BOUND",
  );
  requireLive(
    createHash("sha1")
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest("hex") === objectId,
    "FIXTURE_BUILD_BLOB_HASH",
  );
  // No private-key block is admitted even if accidentally committed. Other
  // secret scanning remains the separately required exact-source security gate.
  requireLive(
    !/-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/.test(
      bytes.toString("utf8"),
    ),
    "FIXTURE_BUILD_PRIVATE_BYTES",
  );
  return { sha256: sha256(bytes), bytes: bytes.length };
}

// Git blobs may be binary. The shared command helper handles text metadata;
// this bounded byte transport avoids a lossy UTF-8 stdout round trip.
export async function readGitBlob({
  git,
  repository,
  objectId,
  timeoutMs,
  signal,
  spawnImpl = spawn,
}) {
  requireLive(!signal?.aborted, "FIXTURE_BUILD_ABORTED");
  requireLive(
    OID.test(objectId) &&
      Number.isInteger(timeoutMs) &&
      timeoutMs > 0 &&
      timeoutMs <= 30000,
    "FIXTURE_BUILD_BLOB_REQUEST",
  );
  let child,
    timer,
    fallback,
    stopped = false,
    bad = false,
    total = 0,
    buffers = [],
    settle;
  const result = new Promise((resolve) => {
    settle = resolve;
  });
  function finish(code, closeObserved) {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    clearTimeout(fallback);
    settle({ code, closeObserved });
  }
  function cancel() {
    if (stopped) return;
    bad = true;
    try {
      child?.kill("SIGKILL");
    } catch {
      /* missing close fails */
    }
    if (!fallback) fallback = setTimeout(() => finish(-1, false), 1000);
  }
  try {
    child = spawnImpl(
      git.path,
      gitArgs(repository, ["cat-file", "blob", objectId]),
      {
        env: gitEnv(),
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.stdout.on("data", (bytes) => {
      if (stopped || bad) return;
      total += bytes.length;
      if (total > MAX_SOURCE_FILE) {
        buffers = [];
        cancel();
      } else buffers.push(Buffer.from(bytes));
    });
    child.stderr.on("data", () => cancel());
    child.stdout.on("error", cancel);
    child.stderr.on("error", cancel);
    child.once("error", cancel);
    child.once("close", (code) => finish(code, true));
    timer = setTimeout(cancel, timeoutMs);
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
  } catch {
    cancel();
  }
  let terminal;
  try {
    terminal = await result;
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
  requireLive(
    !signal?.aborted && !bad && terminal.code === 0 && terminal.closeObserved,
    "FIXTURE_BUILD_BLOB_TRANSPORT",
  );
  const bytes = Buffer.concat(buffers, total);
  verifyGitBlob(bytes, objectId);
  return bytes;
}

async function regularBytes(filePath, maximum) {
  requireLive(
    path.isAbsolute(filePath) && (await fs.realpath(filePath)) === filePath,
    "FIXTURE_BUILD_CANONICAL_FILE",
  );
  const file = await fs.open(
    filePath,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    return await readBoundedRegularHandle(file, maximum);
  } finally {
    await file.close();
  }
}
async function verifyExecutable(spec, expected = null) {
  requireLive(
    spec &&
      typeof spec.path === "string" &&
      path.isAbsolute(spec.path) &&
      typeof spec.sha256 === "string" &&
      HEX.test(spec.sha256) &&
      (!expected || spec.sha256 === expected),
    "FIXTURE_BUILD_TOOL_SPEC",
  );
  const bytes = await regularBytes(spec.path, 268435456);
  requireLive(sha256(bytes) === spec.sha256, "FIXTURE_BUILD_TOOL_HASH");
  return bytes;
}
async function createFile(filePath, bytes, mode, io = fs) {
  const file = await io.open(
    filePath,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await file.writeFile(bytes);
    await file.sync();
  } finally {
    await file.close();
  }
  await io.chmod(filePath, mode);
}
async function canonicalDirectory(directory, io = fs, paths = path) {
  requireLive(
    paths.isAbsolute(directory) &&
      paths.resolve(directory) === directory &&
      (await io.realpath(directory)) === directory,
    "FIXTURE_BUILD_DIRECTORY_PATH",
  );
  const info = await io.lstat(directory);
  requireLive(
    info.isDirectory() && !info.isSymbolicLink(),
    "FIXTURE_BUILD_DIRECTORY_TYPE",
  );
}

// Only this exact public canary is DAC-writable. Source/tool bytes retain their
// original modes; the private fixture ancestor and read-only bind isolate it.
export async function prepareReadOnlyProbe(directory, io = fs, paths = path) {
  await canonicalDirectory(directory, io, paths);
  const probeDirectory = paths.join(directory, READ_ONLY_PROBE_DIRECTORY);
  // Exclusive mkdir and createFile reject any pre-existing probe, including
  // links, without chmod or replacement of material not created by this call.
  await io.mkdir(probeDirectory, { mode: 0o700 });
  await io.chmod(probeDirectory, 0o777);
  const canary = paths.join(probeDirectory, "canary");
  await createFile(canary, READ_ONLY_PROBE_BYTES, 0o666, io);
  const directoryInfo = await io.lstat(probeDirectory);
  const fileInfo = await io.lstat(canary);
  requireLive(
    directoryInfo.isDirectory() &&
      !directoryInfo.isSymbolicLink() &&
      fileInfo.isFile() &&
      !fileInfo.isSymbolicLink() &&
      fileInfo.nlink === 1 &&
      fileInfo.size === READ_ONLY_PROBE_BYTES.length,
    "FIXTURE_BUILD_PROBE_TYPE",
  );
}

// Exported seam is filesystem-only: it receives verified Git-object bytes, not
// worktree files, and has no process/network/image execution capability.
export async function materializePublicSnapshot({
  directory,
  entries,
  blobReader,
  io = fs,
  paths = path,
  platform = process.platform,
}) {
  const dirs = new Set([directory]),
    manifest = [];
  let total = 0;
  for (const entry of entries) validatePublicSourcePath(entry.path);
  await io.mkdir(directory, { mode: 0o700 });
  for (const entry of entries) {
    validatePublicSourcePath(entry.path);
    const bytes = await blobReader(entry.objectId);
    const binding = verifyGitBlob(bytes, entry.objectId);
    total += bytes.length;
    requireLive(total <= 268435456, "FIXTURE_BUILD_SNAPSHOT_BOUND");
    let parent = directory;
    for (const component of entry.path.split("/").slice(0, -1)) {
      parent = paths.join(parent, component);
      if (!dirs.has(parent)) {
        await io.mkdir(parent, { mode: 0o700 });
        dirs.add(parent);
      }
    }
    const target = paths.join(directory, ...entry.path.split("/"));
    requireLive(
      target.startsWith(directory + paths.sep),
      "FIXTURE_BUILD_SNAPSHOT_ESCAPE",
    );
    await createFile(target, bytes, 0o444, io);
    const info = await io.lstat(target);
    requireLive(
      info.isFile() &&
        !info.isSymbolicLink() &&
        info.nlink === 1 &&
        info.size === bytes.length &&
        (platform === "win32" || (info.mode & 0o777) === 0o444),
      "FIXTURE_BUILD_SNAPSHOT_FILE",
    );
    manifest.push({ path: entry.path, ...binding });
  }
  await prepareReadOnlyProbe(directory, io, paths);
  for (const directoryPath of [...dirs].sort((a, b) => b.length - a.length)) {
    await io.chmod(directoryPath, 0o555);
    const info = await io.lstat(directoryPath);
    requireLive(
      info.isDirectory() &&
        !info.isSymbolicLink() &&
        (platform === "win32" || (info.mode & 0o777) === 0o555),
      "FIXTURE_BUILD_SNAPSHOT_DIRECTORY",
    );
  }
  return manifest;
}

function expectedBuilderMounts({
  sourceDirectory,
  toolsDirectory,
  goModCache,
}) {
  return [
    ["/source", sourceDirectory, false],
    ["/gomodcache", goModCache, false],
    ["/out", toolsDirectory, true],
  ].map(([target, directory, writable]) => {
    requireLive(
      typeof directory === "string" &&
        directory.length > 0 &&
        !/[\0,\r\n]/.test(directory),
      "FIXTURE_BUILD_MOUNT_PATH",
    );
    const source = directory.replaceAll("\\", "/");
    requireLive(
      (source.startsWith("/") || /^[A-Za-z]:\//.test(source)) &&
        !source.split("/").includes(".."),
      "FIXTURE_BUILD_MOUNT_PATH",
    );
    return { target, source, writable };
  });
}
export function buildContainerArguments({
  name,
  runId,
  sourceDirectory,
  toolsDirectory,
  goModCache,
}) {
  requireLive(
    /^ho-pg17-build-[a-f0-9]{32}$/.test(name) &&
      /^[a-f0-9]{32}$/.test(runId) &&
      name === `ho-pg17-build-${runId}`,
    "FIXTURE_BUILD_OWNER",
  );
  const mounts = expectedBuilderMounts({
    sourceDirectory,
    toolsDirectory,
    goModCache,
  });
  const args = [
    "container",
    "create",
    "--pull=never",
    "--name",
    name,
    "--label",
    `${OWNER_LABEL}=${OWNER_VALUE}`,
    "--label",
    `${RUN_LABEL}=${runId}`,
    "--network",
    "none",
    "--user",
    "1001:1001",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--read-only",
    "--cpus",
    "2",
    "--memory",
    "1536m",
    "--memory-swap",
    "1536m",
    "--pids-limit",
    "256",
    "--ipc",
    "private",
    "--tmpfs",
    "/tmp:rw,nosuid,nodev,exec,size=1g,mode=0700,uid=1001,gid=1001",
    "--workdir",
    "/source",
  ];
  for (const mount of mounts)
    args.push(
      "--mount",
      `type=bind,src=${mount.source},dst=${mount.target}${mount.writable ? "" : ",readonly"}`,
    );
  for (const [key, value] of Object.entries(BUILD_ENV))
    args.push("--env", `${key}=${value}`);
  // Node is the independently pinned public Linux binary, not repository code.
  // The child exists only to keep the private build/cache namespace alive.
  args.push(
    "--entrypoint",
    "/out/node",
    GO_IMAGE,
    "-e",
    "setTimeout(() => process.exit(1), 1200000); process.on('SIGTERM', () => process.exit(0));",
  );
  return args;
}
export function validateBuilderInspect(
  value,
  {
    name,
    runId,
    imageId,
    running,
    sourceDirectory,
    toolsDirectory,
    goModCache,
  },
) {
  const expectedMounts = expectedBuilderMounts({
    sourceDirectory,
    toolsDirectory,
    goModCache,
  });
  requireLive(
    value &&
      /^sha256:[a-f0-9]{64}$/.test(imageId) &&
      value.Image === imageId &&
      value.Name === `/${name}` &&
      /^[a-f0-9]{64}$/.test(value.Id) &&
      value.Config?.Labels?.[OWNER_LABEL] === OWNER_VALUE &&
      value.Config?.Labels?.[RUN_LABEL] === runId,
    "FIXTURE_BUILD_CONTAINER_IDENTITY",
  );
  const config = value.HostConfig;
  requireLive(
    value.Config.User === "1001:1001" &&
      value.Config.WorkingDir === "/source" &&
      value.Config.Image === GO_IMAGE &&
      JSON.stringify(value.Config.Entrypoint) === '["/out/node"]' &&
      value.State?.Running === running &&
      !value.State?.OOMKilled &&
      config?.NetworkMode === "none" &&
      config.ReadonlyRootfs === true &&
      config.Privileged === false &&
      JSON.stringify(config.CapDrop) === '["ALL"]' &&
      (!config.CapAdd || config.CapAdd.length === 0) &&
      JSON.stringify(config.SecurityOpt) === '["no-new-privileges"]' &&
      (!config.GroupAdd || config.GroupAdd.length === 0) &&
      !config.PidMode &&
      config.IpcMode === "private" &&
      config.NanoCpus === 2000000000 &&
      config.Memory === 1610612736 &&
      config.MemorySwap === 1610612736 &&
      config.PidsLimit === 256 &&
      (!config.Devices || config.Devices.length === 0) &&
      (!config.DeviceRequests || config.DeviceRequests.length === 0) &&
      (!config.PortBindings || Object.keys(config.PortBindings).length === 0) &&
      value.NetworkSettings?.Ports &&
      Object.keys(value.NetworkSettings.Ports).length === 0,
    "FIXTURE_BUILD_CONTAINER_ISOLATION",
  );
  requireLive(
    Array.isArray(value.Mounts) &&
      value.Mounts.length === 3 &&
      expectedMounts.every(
        (expected) =>
          value.Mounts.filter(
            (mount) =>
              mount.Type === "bind" &&
              mount.Destination === expected.target &&
              mount.Source === expected.source &&
              mount.RW === expected.writable,
          ).length === 1,
      ) &&
      Array.isArray(config.Mounts) &&
      config.Mounts.length === 3 &&
      expectedMounts.every(
        (expected) =>
          config.Mounts.filter(
            (mount) =>
              mount.Type === "bind" &&
              mount.Target === expected.target &&
              mount.Source === expected.source &&
              (expected.writable
                ? mount.ReadOnly === false || mount.ReadOnly === undefined
                : mount.ReadOnly === true) &&
              !mount.VolumeOptions &&
              !mount.TmpfsOptions,
          ).length === 1,
      ) &&
      (!config.Binds || config.Binds.length === 0),
    "FIXTURE_BUILD_CONTAINER_MOUNTS",
  );
  requireLive(
    config.Tmpfs &&
      Object.keys(config.Tmpfs).join(",") === "/tmp" &&
      config.Tmpfs["/tmp"] ===
        "rw,nosuid,nodev,exec,size=1g,mode=0700,uid=1001,gid=1001",
    "FIXTURE_BUILD_CONTAINER_TMPFS",
  );
  for (const [key, expected] of Object.entries(BUILD_ENV))
    requireLive(
      value.Config.Env?.filter((item) => item.startsWith(`${key}=`)).join(
        "",
      ) === `${key}=${expected}`,
      "FIXTURE_BUILD_CONTAINER_ENV",
    );
  return value;
}

// Every deletion is limited to the random, independently inspected owned ID.
// Listing errors never mean absence, including after a lost create ACK.
export class OwnedFixtureBuilder {
  constructor({ execute, runId, imageId }) {
    requireLive(
      typeof execute === "function" && /^[a-f0-9]{32}$/.test(runId),
      "FIXTURE_BUILD_OWNER",
    );
    this.execute = execute;
    this.runId = runId;
    this.name = `ho-pg17-build-${runId}`;
    this.imageId = imageId;
    this.intent = false;
    this.id = null;
    this.createAcknowledged = false;
    this.creationObserved = false;
    this.mounts = null;
  }
  async checked(args, options) {
    const result = await this.execute(args, options);
    requireLive(
      result?.rawExit === 0 &&
        result.origin === "exit" &&
        result.connectionClosed === true,
      "FIXTURE_BUILD_PROCESS",
    );
    return result;
  }
  async list() {
    const result = await this.checked(
      [
        "container",
        "ls",
        "--all",
        "--no-trunc",
        "--filter",
        `name=^/${this.name}$`,
        "--format",
        "{{.ID}}",
      ],
      { cleanup: true },
    );
    const ids = result.stdout.trim() ? result.stdout.trim().split("\n") : [];
    requireLive(
      ids.length <= 1 && ids.every((id) => /^[a-f0-9]{64}$/.test(id)),
      "FIXTURE_BUILD_LIST",
    );
    return ids;
  }
  async inspect(id, running, full = true) {
    const result = await this.checked(["container", "inspect", id], {
      cleanup: !full,
    });
    let rows;
    try {
      rows = JSON.parse(result.stdout);
    } catch {
      throw new LiveError("FIXTURE_BUILD_INSPECT_JSON");
    }
    requireLive(
      Array.isArray(rows) && rows.length === 1,
      "FIXTURE_BUILD_INSPECT_JSON",
    );
    const row = rows[0];
    requireLive(
      row.Id === id &&
        row.Name === `/${this.name}` &&
        row.Image === this.imageId &&
        row.Config?.Labels?.[OWNER_LABEL] === OWNER_VALUE &&
        row.Config?.Labels?.[RUN_LABEL] === this.runId,
      "FIXTURE_BUILD_FOREIGN_CONTAINER",
    );
    if (full)
      validateBuilderInspect(row, {
        ...this.mounts,
        name: this.name,
        runId: this.runId,
        imageId: this.imageId,
        running,
      });
    return row;
  }
  async create(mounts) {
    requireLive((await this.list()).length === 0, "FIXTURE_BUILD_NAME_EXISTS");
    expectedBuilderMounts(mounts);
    this.mounts = { ...mounts };
    this.intent = true;
    const result = await this.checked(
      buildContainerArguments({
        ...mounts,
        name: this.name,
        runId: this.runId,
      }),
    );
    const id = result.stdout.trim();
    requireLive(
      /^[a-f0-9]{64}$/.test(id) &&
        result.rawExit === 0 &&
        result.origin === "exit" &&
        result.connectionClosed === true,
      "FIXTURE_BUILD_CREATE_ACK",
    );
    this.id = id;
    this.createAcknowledged = true;
    await this.inspect(id, false);
    return id;
  }
  async start() {
    requireLive(this.id, "FIXTURE_BUILD_NOT_CREATED");
    await this.checked(["container", "start", this.id]);
    await this.inspect(this.id, true);
  }
  async cleanup() {
    if (!this.intent) return { status: "PASS", removed: false, absent: true };
    let ids = await this.list();
    if (!this.createAcknowledged && !this.creationObserved) {
      // A timed-out/lost create may appear after the first empty list. Empty
      // observations cannot prove that an unacknowledged mutation completed.
      for (let attempt = 0; !ids.length && attempt < 5; attempt++) {
        await delay(100);
        ids = await this.list();
      }
      requireLive(ids.length === 1, "FIXTURE_BUILD_CREATE_COMPLETION_UNPROVEN");
    }
    if (!ids.length) return { status: "PASS", removed: false, absent: true };
    requireLive(
      !this.id || this.id === ids[0],
      "FIXTURE_BUILD_FOREIGN_CONTAINER",
    );
    await this.inspect(ids[0], undefined, false);
    this.creationObserved = true;
    await this.checked(["container", "rm", "--force", ids[0]], {
      cleanup: true,
    });
    requireLive(
      (await this.list()).length === 0,
      "FIXTURE_BUILD_REMOVAL_UNPROVEN",
    );
    return { status: "PASS", removed: true, absent: true };
  }
}

// This fixed script checks the source actually visible inside Docker Desktop's
// bind mapping. Public hashes arrive through stdin; paths are never code.
export const VERIFY_SOURCE_SCRIPT = String.raw`
const fs = require('node:fs'); const path = require('node:path'); const crypto = require('node:crypto');
let input = ''; process.stdin.on('data', b => { input += b; if (Buffer.byteLength(input) > 4194304) process.exit(1); });
process.stdin.on('end', () => { try {
 const entries = JSON.parse(input); const seen = []; let count = 0;
 if (!Array.isArray(entries) || entries.some(e => typeof e.path !== 'string' || e.path.split('/')[0].toLowerCase() === '.fixture-ro-probe')) throw Error();
 const probeBytes = Buffer.from('hedefora.pg17.read-only-probe.v1\n');
 const expected = [...entries, {path:'.fixture-ro-probe/canary', bytes:probeBytes.length, sha256:crypto.createHash('sha256').update(probeBytes).digest('hex')}];
 const walk = (dir, prefix = '') => { const rows = fs.readdirSync(dir, {withFileTypes:true}); if (!rows.length) throw Error(); for (const row of rows) {
  if (++count > 20000) throw Error(); const name = prefix ? prefix + '/' + row.name : row.name; if (name.length > 511) throw Error();
  if (row.isDirectory()) walk(path.join(dir, row.name), name); else if (row.isFile() && !row.isSymbolicLink()) seen.push(name); else throw Error(); }};
 walk('/source'); seen.sort(); if (JSON.stringify(seen) !== JSON.stringify(expected.map(e => e.path).sort())) throw Error();
 for (const e of expected) { if (!/^[A-Za-z0-9_.@/-]+$/.test(e.path) || e.path.split('/').some(p => !p || p === '.' || p === '..')) throw Error();
  const p = '/source/' + e.path; if (fs.realpathSync(p) !== p) throw Error(); const fd = fs.openSync(p, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try { const a = fs.fstatSync(fd, {bigint:true}); if (!a.isFile() || a.nlink !== 1n || a.size !== BigInt(e.bytes) || a.size > 16777216n) throw Error();
   const b = Buffer.alloc(e.bytes + 1); let n = 0; while(n < b.length) { const got = fs.readSync(fd, b, n, Math.min(65536,b.length-n), n); if (!got) break; n += got; }
   const z = fs.fstatSync(fd, {bigint:true}); if (n !== e.bytes || ['dev','ino','nlink','size','mtimeNs','ctimeNs'].some(k => a[k] !== z[k]) || crypto.createHash('sha256').update(b.subarray(0,n)).digest('hex') !== e.sha256) throw Error();
  } finally { fs.closeSync(fd); }
 }
 process.stdout.write(JSON.stringify({status:'PASS',sourceFiles:entries.length}) + '\n');
 } catch { process.stderr.write('FIXTURE_BUILD_SOURCE_VERIFY_FAILED\n'); process.exitCode=1; }
});`;

export function validateBuildMetadata(text, name) {
  requireLive(
    typeof text === "string" &&
      Buffer.byteLength(text) <= 65536 &&
      text.startsWith(`/out/${name}: go1.26.7\n`),
    "FIXTURE_BUILD_METADATA",
  );
  const settings = new Map();
  for (const line of text.split("\n")) {
    const match = /^\tbuild\t([^=]+)=(.*)$/.exec(line);
    if (match) {
      requireLive(!settings.has(match[1]), "FIXTURE_BUILD_METADATA_DUPLICATE");
      settings.set(match[1], match[2]);
    }
  }
  for (const [key, value] of [
    ["CGO_ENABLED", "1"],
    ["GOOS", "linux"],
    ["GOARCH", "amd64"],
    ["GOAMD64", "v1"],
    ["-trimpath", "true"],
  ])
    requireLive(settings.get(key) === value, "FIXTURE_BUILD_METADATA_SETTING");
  if (name.endsWith(".test"))
    requireLive(
      settings.get("-race") === "true" &&
        settings.get("-tags") === "integration",
      "FIXTURE_BUILD_METADATA_TEST_FLAGS",
    );
  requireLive(
    ![...settings.keys()].some((key) => key.startsWith("vcs.")),
    "FIXTURE_BUILD_METADATA_VCS",
  );
  return {
    name,
    goVersion: "go1.26.7",
    cgo: true,
    goos: "linux",
    goarch: "amd64",
    trimpath: true,
    ...(name.endsWith(".test") ? { race: true, integration: true } : {}),
  };
}

export async function runVerifiedCompileCommands({ exec, sourceFiles }) {
  requireLive(
    typeof exec === "function" && Array.isArray(sourceFiles),
    "FIXTURE_BUILD_MODULE_VERIFY_INPUT",
  );
  const bindings = {};
  for (const name of ["go.mod", "go.sum"]) {
    const entries = sourceFiles.filter((entry) => entry.path === name);
    requireLive(
      entries.length === 1 &&
        typeof entries[0].sha256 === "string" &&
        HEX.test(entries[0].sha256),
      "FIXTURE_BUILD_MODULE_SOURCE_BINDING",
    );
    bindings[name === "go.mod" ? "goModSha256" : "goSumSha256"] =
      entries[0].sha256;
  }
  const commands = [];
  async function run(name, args, verify = false) {
    const result = await exec(GO, args, { timeoutMs: 300000 });
    requireLive(
      result?.rawExit === 0 &&
        result.origin === "exit" &&
        result.connectionClosed === true &&
        typeof result.stdout === "string" &&
        typeof result.stderr === "string",
      "FIXTURE_BUILD_COMPILE_PROCESS",
    );
    if (verify)
      requireLive(
        result.stdout === "all modules verified\n" && result.stderr === "",
        "FIXTURE_BUILD_MODULE_VERIFY_FAILED",
      );
    commands.push({
      name,
      executable: GO,
      args: [...args],
      rawExit: result.rawExit,
      connectionClosed: result.connectionClosed,
      stdoutSha256: sha256(Buffer.from(result.stdout)),
      stderrSha256: sha256(Buffer.from(result.stderr)),
      stdoutBytes: Buffer.byteLength(result.stdout),
      stderrBytes: Buffer.byteLength(result.stderr),
    });
  }
  await run("go-mod-verify-before", ["mod", "verify"], true);
  for (const item of BUILD_COMMANDS) await run(item.name, item.args);
  await run("go-mod-verify-after", ["mod", "verify"], true);
  return {
    commands,
    moduleVerification: {
      status: "PASS",
      beforeCompile: "PASS",
      afterCompile: "PASS",
      ...bindings,
    },
  };
}

export async function prepareFixtureTools({
  repository,
  outputRoot,
  git,
  docker,
  dockerEnv,
  goModCache,
  linuxNode,
  signal,
}) {
  const active = () => requireLive(!signal?.aborted, "FIXTURE_BUILD_ABORTED");
  active();
  // No test image is created here. This is a public-source/tools build stage,
  // separate from the PG17 admission and engine execution authority.
  requireLive(
    ["linux", "win32"].includes(process.platform),
    "FIXTURE_BUILD_PLATFORM",
  );
  requireLive(
    [
      repository,
      outputRoot,
      goModCache,
      git?.path,
      docker?.path,
      linuxNode?.path,
    ].every((value) => typeof value === "string" && path.isAbsolute(value)),
    "FIXTURE_BUILD_PATH_ARGUMENTS",
  );
  repository = path.resolve(repository);
  outputRoot = path.resolve(outputRoot);
  goModCache = path.resolve(goModCache);
  git = { ...git, path: path.resolve(git.path) };
  docker = { ...docker, path: path.resolve(docker.path) };
  linuxNode = { ...linuxNode, path: path.resolve(linuxNode.path) };
  await canonicalDirectory(repository);
  await canonicalDirectory(path.dirname(outputRoot));
  await canonicalDirectory(goModCache);
  requireLive(
    path.isAbsolute(outputRoot) &&
      path.resolve(outputRoot) === outputRoot &&
      outputRoot !== repository &&
      !outputRoot.startsWith(repository + path.sep) &&
      outputRoot !== goModCache &&
      !outputRoot.startsWith(goModCache + path.sep),
    "FIXTURE_BUILD_OUTPUT_PATH",
  );
  requireLive(
    dockerEnv &&
      !Array.isArray(dockerEnv) &&
      Object.entries(dockerEnv).every(
        ([key, value]) =>
          [
            "PATH",
            "SystemRoot",
            "SYSTEMROOT",
            "WINDIR",
            "DOCKER_HOST",
            "DOCKER_CONFIG",
            "HOME",
            "LANG",
            "LC_ALL",
            "TZ",
            "TEMP",
            "TMP",
            "TMPDIR",
          ].includes(key) &&
          typeof value === "string" &&
          !value.includes("\0"),
      ) &&
      [
        "unix:///var/run/docker.sock",
        "npipe:////./pipe/dockerDesktopLinuxEngine",
      ].includes(dockerEnv.DOCKER_HOST),
    "FIXTURE_BUILD_DOCKER_ENV",
  );
  await verifyExecutable(git);
  await verifyExecutable(docker);
  const nodeBytes = await verifyExecutable(linuxNode, LINUX_NODE_SHA256);
  const budget = createRunBudget();
  const runId = randomBytes(16).toString("hex");
  async function gitRead(args, maximum = 4194304) {
    const result = await fixtureCommand(
      {
        executable: git.path,
        args: gitArgs(repository, args),
        env: gitEnv(),
        input: "",
        timeoutMs: budget.limit(30000),
        maxBytes: maximum,
      },
      signal,
    );
    requireLive(
      result.rawExit === 0 &&
        result.origin === "exit" &&
        result.connectionClosed,
      "FIXTURE_BUILD_GIT_COMMAND",
    );
    return result.stdout;
  }
  async function identity() {
    requireLive(
      (
        await gitRead([
          "status",
          "--porcelain=v1",
          "--untracked-files=all",
          "--ignore-submodules=none",
        ])
      ).length === 0,
      "FIXTURE_BUILD_SOURCE_DIRTY",
    );
    const commit = (await gitRead(["rev-parse", "--verify", "HEAD"])).trim();
    requireLive(OID.test(commit), "FIXTURE_BUILD_SOURCE_IDENTITY");
    const tree = (
      await gitRead(["rev-parse", "--verify", `${commit}^{tree}`])
    ).trim();
    requireLive(
      OID.test(commit) && OID.test(tree),
      "FIXTURE_BUILD_SOURCE_IDENTITY",
    );
    return { sourceCommit: commit, sourceTree: tree };
  }
  const initial = await identity();
  const entries = parseTrackedTree(
    await gitRead(["ls-tree", "-rz", "--full-tree", initial.sourceCommit]),
  );
  // mkdir without recursive is an exclusive, non-overwriting ownership claim.
  await fs.mkdir(outputRoot, { mode: 0o700 });
  await fs.chmod(outputRoot, 0o700);
  const rootInfo = await fs.lstat(outputRoot);
  requireLive(
    rootInfo.isDirectory() &&
      !rootInfo.isSymbolicLink() &&
      (process.platform === "win32" || (rootInfo.mode & 0o777) === 0o700),
    "FIXTURE_BUILD_PRIVATE_ROOT",
  );
  const sourceDirectory = path.join(outputRoot, "source"),
    toolsDirectory = path.join(outputRoot, "tools");
  const sourceFiles = await materializePublicSnapshot({
    directory: sourceDirectory,
    entries,
    blobReader: (objectId) =>
      readGitBlob({
        git,
        repository,
        objectId,
        timeoutMs: budget.limit(30000),
        signal,
      }),
  });
  await fs.mkdir(toolsDirectory, { mode: 0o700 });
  // /out is public build material. A private0700 ancestor prevents host access;
  // mode0777 is needed only when the host UID differs from fixed builder1001.
  // Final artifact directories become0555. No credentials enter this subtree.
  if (process.platform === "linux" && process.getuid() !== 1001)
    await fs.chmod(toolsDirectory, 0o777);
  await createFile(path.join(toolsDirectory, "node"), nodeBytes, 0o555);
  const configDirectory = path.join(outputRoot, "docker-config");
  await fs.mkdir(configDirectory, { mode: 0o700 });
  const privateDockerEnv = { ...dockerEnv, DOCKER_CONFIG: configDirectory };
  async function execute(
    args,
    { cleanup = false, input = "", timeoutMs = 30000, maxBytes = 4194304 } = {},
  ) {
    const result = await fixtureCommand(
      {
        executable: docker.path,
        args,
        env: privateDockerEnv,
        cwd: repository,
        input,
        timeoutMs: cleanup ? 30000 : budget.limit(timeoutMs),
        maxBytes,
      },
      cleanup ? undefined : signal,
    );
    requireLive(
      result.rawExit === 0 &&
        result.origin === "exit" &&
        result.connectionClosed,
      cleanup
        ? "FIXTURE_BUILD_CLEANUP_COMMAND"
        : "FIXTURE_BUILD_DOCKER_COMMAND",
    );
    return result;
  }
  let builder,
    failure = null,
    evidence = null;
  try {
    const result = await execute(["image", "inspect", GO_IMAGE]);
    let images;
    try {
      images = JSON.parse(result.stdout);
    } catch {
      throw new LiveError("FIXTURE_BUILD_IMAGE_JSON");
    }
    requireLive(
      Array.isArray(images) &&
        images.length === 1 &&
        /^sha256:[a-f0-9]{64}$/.test(images[0].Id) &&
        images[0].Os === "linux" &&
        images[0].Architecture === "amd64",
      "FIXTURE_BUILD_IMAGE_IDENTITY",
    );
    builder = new OwnedFixtureBuilder({
      execute,
      runId,
      imageId: images[0].Id,
    });
    await builder.create({ sourceDirectory, toolsDirectory, goModCache });
    await builder.start();
    const exec = (executable, args, options) =>
      execute(
        [
          "container",
          "exec",
          "-i",
          "--user",
          "1001:1001",
          builder.id,
          executable,
          ...args,
        ],
        options,
      );
    const nodeVersion = await exec("/out/node", ["--version"]);
    requireLive(
      nodeVersion.stdout === "v24.20.0\n",
      "FIXTURE_BUILD_NODE_VERSION",
    );
    const sourceCheck = await exec("/out/node", ["-e", VERIFY_SOURCE_SCRIPT], {
      input: JSON.stringify(sourceFiles),
    });
    requireLive(
      sourceCheck.stdout ===
        JSON.stringify({ status: "PASS", sourceFiles: sourceFiles.length }) +
          "\n",
      "FIXTURE_BUILD_VISIBLE_SOURCE",
    );
    const version = await exec(GO, ["version"]);
    requireLive(
      version.stdout === "go version go1.26.7 linux/amd64\n",
      "FIXTURE_BUILD_GO_VERSION",
    );
    const { commands, moduleVerification } = await runVerifiedCompileCommands({
      exec,
      sourceFiles,
    });
    const metadata = [];
    for (const item of BUILD_COMMANDS)
      metadata.push(
        validateBuildMetadata(
          (await exec(GO, ["version", "-m", `/out/${item.name}`])).stdout,
          item.name,
        ),
      );
    await exec("/bin/chmod", [
      "0555",
      ...BUILD_COMMANDS.map((item) => `/out/${item.name}`),
    ]);
    await builder.inspect(builder.id, true);
    const after = await identity();
    requireLive(
      after.sourceCommit === initial.sourceCommit &&
        after.sourceTree === initial.sourceTree,
      "FIXTURE_BUILD_SOURCE_MOVED",
    );
    await verifyExecutable(git);
    await verifyExecutable(docker);
    await verifyExecutable(linuxNode, LINUX_NODE_SHA256);
    active();
    evidence = {
      status: "PASS",
      scope: "public-source-test-tools-only",
      goImage: GO_IMAGE,
      goImageDockerId: images[0].Id,
      goVersion: "go1.26.7",
      nodeVersion: "v24.20.0",
      nodeSha256: LINUX_NODE_SHA256,
      sourceVerifiedInBuilder: true,
      builderUid: 1001,
      network: "none",
      environmentProfile: "go1267-offline-race-builder-v1",
      commands,
      moduleVerification,
      metadata,
      sourceCommit: initial.sourceCommit,
      sourceTree: initial.sourceTree,
    };
  } catch (error) {
    failure =
      error instanceof LiveError
        ? error
        : new LiveError("FIXTURE_BUILD_FAILED");
  } finally {
    if (builder) {
      try {
        const cleanup = await builder.cleanup();
        if (evidence) evidence.cleanup = cleanup;
      } catch {
        failure = new LiveError("FIXTURE_BUILD_OWNED_CLEANUP_FAILED");
      }
    }
  }
  if (failure) throw failure;
  active();
  const found = await fs.readdir(toolsDirectory, { withFileTypes: true });
  requireLive(
    found.every((entry) => entry.isFile() && !entry.isSymbolicLink()) &&
      JSON.stringify(found.map((entry) => entry.name).sort()) ===
        JSON.stringify(TOOL_NAMES),
    "FIXTURE_BUILD_TOOL_INVENTORY",
  );
  const files = [];
  for (const name of TOOL_NAMES) {
    const filePath = path.join(toolsDirectory, name),
      bytes = await regularBytes(filePath, 268435456);
    const info = await fs.lstat(filePath);
    requireLive(
      process.platform === "win32" || (info.mode & 0o777) === 0o555,
      "FIXTURE_BUILD_EXECUTABLE_MODE",
    );
    files.push({ name, sha256: sha256(bytes), bytes: bytes.length });
  }
  requireLive(
    files.find((item) => item.name === "node").sha256 === LINUX_NODE_SHA256,
    "FIXTURE_BUILD_NODE_CHANGED",
  );
  const bundle = {
    schema: "hedefora.pg17.fixture-tools.v1",
    ...initial,
    goVersion: "go1.26.7",
    goImage: GO_IMAGE,
    race: true,
    integration: true,
    files,
    sourceFiles,
  };
  const bundleBytes = Buffer.from(JSON.stringify(bundle) + "\n");
  active();
  await createFile(
    path.join(toolsDirectory, "bundle.json"),
    bundleBytes,
    0o444,
  );
  await prepareReadOnlyProbe(toolsDirectory);
  await fs.chmod(toolsDirectory, 0o555);
  requireLive(
    process.platform === "win32" ||
      ((await fs.lstat(toolsDirectory)).mode & 0o777) === 0o555,
    "FIXTURE_BUILD_FINAL_DIRECTORY_MODE",
  );
  active();
  return {
    ...initial,
    sourceDirectory,
    toolsDirectory,
    bundleSha256: sha256(bundleBytes),
    buildEvidence: evidence,
  };
}
