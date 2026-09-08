import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn as spawnChild } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import path from "node:path";
import { constants } from "node:fs";
import * as fs from "node:fs/promises";
import os from "node:os";
import { runInNewContext } from "node:vm";
import * as crypto from "node:crypto";
import { GO_IMAGE } from "./live-runtime.mjs";
import { withFixtureHostSignals } from "./fixture-run.mjs";
import {
  BUILD_ENV,
  BUILD_COMMANDS,
  LINUX_NODE_SHA256,
  validatePublicSourcePath,
  parseTrackedTree,
  verifyGitBlob,
  readGitBlob,
  fixtureCommand,
  materializePublicSnapshot,
  prepareReadOnlyProbe,
  buildContainerArguments,
  validateBuilderInspect,
  OwnedFixtureBuilder,
  validateBuildMetadata,
  VERIFY_SOURCE_SCRIPT,
  runVerifiedCompileCommands,
} from "./fixture-build.mjs";

for (const mutation of [
  "none",
  "hash",
  "hardlink",
  "extra-file",
  "same-size-rewrite",
  "missing-probe",
  "probe-hash",
  "probe-extra-file",
  "probe-symlink",
  "probe-in-manifest",
]) {
  test(`actual in-builder source-verifier script: ${mutation}`, () => {
    const bytes = Buffer.from("public source\n");
    const probeBytes = Buffer.from("hedefora.pg17.read-only-probe.v1\n");
    const fileBytes = (file) =>
      file === "/source/.fixture-ro-probe/canary"
        ? mutation === "probe-hash"
          ? Buffer.alloc(probeBytes.length, "x")
          : probeBytes
        : bytes;
    let stats = 0,
      stdout = "",
      stderr = "";
    const stdin = new EventEmitter();
    const childProcess = {
      stdin,
      stdout: {
        write(value) {
          stdout += value;
        },
      },
      stderr: {
        write(value) {
          stderr += value;
        },
      },
      exitCode: 0,
      exit(code) {
        this.exitCode = code;
        throw new Error("exit");
      },
    };
    const stat = (file) => ({
      isFile: () => true,
      dev: 1n,
      ino: 1n,
      nlink: mutation === "hardlink" ? 2n : 1n,
      size: BigInt(fileBytes(file).length),
      mtimeNs: mutation === "same-size-rewrite" ? BigInt(++stats) : 1n,
      ctimeNs: 1n,
    });
    const io = {
      constants,
      readdirSync(directory) {
        const names =
          directory === "/source"
            ? [
                "file.go",
                ...(mutation === "missing-probe" ? [] : [".fixture-ro-probe"]),
                ...(mutation === "extra-file" ? ["unexpected"] : []),
              ]
            : [
                "canary",
                ...(mutation === "probe-extra-file" ? ["unexpected"] : []),
              ];
        return names.map((name) => ({
          name,
          isDirectory: () =>
            name === ".fixture-ro-probe" && mutation !== "probe-symlink",
          isFile: () => name !== ".fixture-ro-probe",
          isSymbolicLink: () =>
            name === ".fixture-ro-probe" && mutation === "probe-symlink",
        }));
      },
      realpathSync(name) {
        return name;
      },
      openSync(file) {
        return file;
      },
      fstatSync: stat,
      closeSync() {},
      readSync(fd, buffer, offset, length, position) {
        const chunk = fileBytes(fd).subarray(position, position + length);
        chunk.copy(buffer, offset);
        return chunk.length;
      },
    };
    runInNewContext(VERIFY_SOURCE_SCRIPT, {
      Buffer,
      process: childProcess,
      require(name) {
        return {
          "node:fs": io,
          "node:path": path.posix,
          "node:crypto": crypto,
        }[name];
      },
    });
    const entry = {
      path: "file.go",
      bytes: bytes.length,
      sha256:
        mutation === "hash"
          ? "0".repeat(64)
          : createHash("sha256").update(bytes).digest("hex"),
    };
    stdin.emit(
      "data",
      JSON.stringify([
        entry,
        ...(mutation === "probe-in-manifest"
          ? [
              {
                path: ".fixture-ro-probe/canary",
                bytes: probeBytes.length,
                sha256: createHash("sha256").update(probeBytes).digest("hex"),
              },
            ]
          : []),
      ]),
    );
    stdin.emit("end");
    if (mutation === "none") {
      assert.equal(stdout, '{"status":"PASS","sourceFiles":1}\n');
      assert.equal(childProcess.exitCode, 0);
      assert.equal(stderr, "");
    } else {
      assert.equal(childProcess.exitCode, 1);
      assert.equal(stdout, "");
      assert.equal(stderr, "FIXTURE_BUILD_SOURCE_VERIFY_FAILED\n");
    }
  });
}

const oid = (bytes) =>
  createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
const sourceBytes = Buffer.from("public committed LF source\n"),
  sourceObject = oid(sourceBytes);
const runId = "a".repeat(32),
  name = `ho-pg17-build-${runId}`,
  imageId = `sha256:${"b".repeat(64)}`,
  id = "c".repeat(64);
const mounts = {
  sourceDirectory: "C:\\private\\build\\source",
  toolsDirectory: "C:\\private\\build\\tools",
  goModCache: "C:\\cache\\gomod",
};
const ok = (stdout = "") => ({
  stdout,
  stderr: "",
  rawExit: 0,
  origin: "exit",
  connectionClosed: true,
});

test("tracked public snapshot accepts regular Git objects, sorts paths and fixes exact Node", () => {
  const entries = parseTrackedTree(
    `100644 blob ${sourceObject}\tz/file.go\0` +
      `100755 blob ${sourceObject}\ta.mjs\0`,
  );
  assert.deepEqual(
    entries.map((item) => item.path),
    ["a.mjs", "z/file.go"],
  );
  assert.equal(
    verifyGitBlob(sourceBytes, sourceObject).bytes,
    sourceBytes.length,
  );
  assert.equal(
    LINUX_NODE_SHA256,
    "89af8424dd53e560b1933f87ba650d8bf57c83ca5a04600eefb31f416aabbae7",
  );
});
for (const value of [
  "../outside",
  "/absolute",
  "a/../outside",
  "a//b",
  ".git/config",
  ".env",
  ".env.production",
  "secrets.json",
  "a/id_rsa",
  "a/key.pem",
  "a/key.pfx",
  "a\\b",
  "a,b",
  "a\nfile",
  ".fixture-ro-probe",
  ".fixture-ro-probe/canary",
  ".FIXTURE-RO-PROBE/canary",
])
  test(`public snapshot denies unsafe/private path ${JSON.stringify(value)}`, () => {
    assert.throws(() => validatePublicSourcePath(value), /FIXTURE_BUILD_/);
  });
test("public environment examples are allowed without reading real environment files", () => {
  assert.equal(validatePublicSourcePath(".env.example"), ".env.example");
  assert.equal(
    validatePublicSourcePath("docs/.env.sample"),
    "docs/.env.sample",
  );
  assert.equal(
    validatePublicSourcePath(".fixture-ro-probe-copy/file"),
    ".fixture-ro-probe-copy/file",
  );
});
for (const [title, text] of [
  ["symlink", `120000 blob ${sourceObject}\tsymlink\0`],
  ["submodule", `160000 commit ${sourceObject}\tsubmodule\0`],
  ["directory", `040000 tree ${sourceObject}\tdirectory\0`],
  ["duplicate", `100644 blob ${sourceObject}\ta\0`.repeat(2)],
  [
    "case-collision",
    `100644 blob ${sourceObject}\ta\0` + `100644 blob ${sourceObject}\tA\0`,
  ],
  [
    "prefix-collision",
    `100644 blob ${sourceObject}\ta\0` + `100644 blob ${sourceObject}\ta/b\0`,
  ],
  ["truncated", `100644 blob ${sourceObject}\ta`],
])
  test(`tracked inventory rejects ${title}`, () => {
    assert.throws(() => parseTrackedTree(text), /FIXTURE_BUILD_/);
  });
test("blob binding rejects changed and oversized bytes and committed private keys", () => {
  assert.throws(
    () => verifyGitBlob(Buffer.from("changed"), sourceObject),
    /FIXTURE_BUILD_BLOB_HASH/,
  );
  assert.throws(
    () => verifyGitBlob(Buffer.alloc(16777217), sourceObject),
    /FIXTURE_BUILD_BLOB_BOUND/,
  );
  // This fixed, invalid PEM-shaped marker is public test data, never a key.
  const markerBytes = Buffer.from(
    "-----BEGIN " + "PRIVATE KEY-----\nsynthetic-only\n",
  );
  assert.throws(
    () => verifyGitBlob(markerBytes, oid(markerBytes)),
    /FIXTURE_BUILD_PRIVATE_BYTES/,
  );
});

function memoryIO({
  windowsModes = false,
  hardlink = false,
  ignoreChmod = false,
  umask = 0,
} = {}) {
  const records = new Map(),
    opens = [];
  return {
    records,
    opens,
    async realpath(name) {
      return name;
    },
    async mkdir(name, { mode }) {
      if (records.has(name)) throw new Error("EXISTS");
      records.set(name, { directory: true, mode: mode & ~umask });
    },
    async open(name, flags, mode) {
      assert.ok(flags & constants.O_EXCL);
      assert.ok(flags & constants.O_NOFOLLOW || process.platform === "win32");
      if (records.has(name)) throw new Error("EXISTS");
      opens.push(name);
      const row = {
        directory: false,
        mode: mode & ~umask,
        bytes: Buffer.alloc(0),
      };
      records.set(name, row);
      return {
        async writeFile(bytes) {
          row.bytes = Buffer.from(bytes);
        },
        async sync() {},
        async close() {},
      };
    },
    async chmod(name, mode) {
      if (!ignoreChmod) records.get(name).mode = mode;
    },
    async lstat(name) {
      const row = records.get(name);
      assert.ok(row);
      return {
        isDirectory: () => row.directory,
        isFile: () => !row.directory,
        isSymbolicLink: () => false,
        nlink: hardlink ? 2 : 1,
        size: row.bytes?.length ?? 0,
        mode: windowsModes ? 0o777 : row.mode,
      };
    },
  };
}
test("Windows snapshot writes exact Git blob LF/binary bytes, not CRLF worktree bytes", async () => {
  const io = memoryIO({ windowsModes: true });
  const binary = Buffer.from([0, 255, 128, 10]);
  const blobs = new Map([
    [sourceObject, sourceBytes],
    [oid(binary), binary],
  ]);
  const entries = [
    { path: "a/file.go", objectId: sourceObject },
    { path: "b.bin", objectId: oid(binary) },
  ];
  const result = await materializePublicSnapshot({
    directory: "C:\\private\\source",
    entries,
    blobReader: async (objectId) => blobs.get(objectId),
    io,
    paths: path.win32,
    platform: "win32",
  });
  assert.deepEqual(
    io.records.get("C:\\private\\source\\a\\file.go").bytes,
    sourceBytes,
  );
  assert.deepEqual(io.records.get("C:\\private\\source\\b.bin").bytes, binary);
  assert.equal(result.length, 2);
  assert.equal(io.records.get("C:\\private\\source").mode, 0o555);
  assert.equal(io.opens.length, 3);
  assert.ok(
    !result.some((entry) => entry.path.startsWith(".fixture-ro-probe")),
  );
  assert.equal(
    io.records.get("C:\\private\\source\\.fixture-ro-probe").mode,
    0o777,
  );
  assert.equal(
    io.records.get("C:\\private\\source\\.fixture-ro-probe\\canary").mode,
    0o666,
  );
  assert.ok(!io.opens.some((item) => item.includes(".git")));
});
test("Linux snapshot enforces real0555/0444 and rejects hardlink even on Windows", async () => {
  const args = {
    directory: "/private/source",
    entries: [{ path: "file.go", objectId: sourceObject }],
    blobReader: async () => sourceBytes,
    paths: path.posix,
  };
  const io = memoryIO();
  const manifest = await materializePublicSnapshot({
    ...args,
    io,
    platform: "linux",
  });
  assert.equal(io.records.get("/private/source").mode, 0o555);
  assert.equal(io.records.get("/private/source/file.go").mode, 0o444);
  assert.equal(io.records.get("/private/source/.fixture-ro-probe").mode, 0o777);
  assert.equal(
    io.records.get("/private/source/.fixture-ro-probe/canary").mode,
    0o666,
  );
  assert.deepEqual(
    manifest.map((entry) => entry.path),
    ["file.go"],
  );
  await assert.rejects(
    materializePublicSnapshot({
      ...args,
      io: memoryIO({ ignoreChmod: true }),
      platform: "linux",
    }),
    /FIXTURE_BUILD_SNAPSHOT_FILE/,
  );
  await assert.rejects(
    materializePublicSnapshot({
      ...args,
      io: memoryIO({ windowsModes: true, hardlink: true }),
      platform: "win32",
    }),
    /FIXTURE_BUILD_SNAPSHOT_FILE/,
  );
});
test("snapshot malformed private path fails before reading any Git blob", async () => {
  let calls = 0;
  await assert.rejects(
    materializePublicSnapshot({
      directory: "/public/source",
      entries: [{ path: ".env", objectId: sourceObject }],
      blobReader: async () => {
        calls++;
        return sourceBytes;
      },
      io: memoryIO(),
      paths: path.posix,
    }),
    /FIXTURE_BUILD_PRIVATE_PATH/,
  );
  assert.equal(calls, 0);
});

test("calibrated probe fixes exact public bytes and DAC modes after a strict umask", async () => {
  const io = memoryIO({ umask: 0o077 });
  await io.mkdir("/owned/tools", { mode: 0o700 });
  io.records.set("/owned/tools/node", {
    directory: false,
    mode: 0o555,
    bytes: sourceBytes,
  });
  await prepareReadOnlyProbe("/owned/tools", io, path.posix);
  assert.equal(io.records.get("/owned/tools").mode, 0o700);
  assert.equal(io.records.get("/owned/tools/node").mode, 0o555);
  assert.equal(io.records.get("/owned/tools/.fixture-ro-probe").mode, 0o777);
  const canary = io.records.get("/owned/tools/.fixture-ro-probe/canary");
  assert.equal(canary.mode, 0o666);
  assert.deepEqual(
    canary.bytes,
    Buffer.from("hedefora.pg17.read-only-probe.v1\n"),
  );
  assert.deepEqual(io.opens, ["/owned/tools/.fixture-ro-probe/canary"]);
});

test("real filesystem probe creates fixed public bytes and rejects a second call", async (t) => {
  const temporaryRoot = await fs.realpath(os.tmpdir());
  const directory = await fs.mkdtemp(
    path.join(temporaryRoot, "ho-pg17-probe-test-"),
  );
  t.after(async () => {
    assert.equal(path.dirname(directory), temporaryRoot);
    assert.ok(path.basename(directory).startsWith("ho-pg17-probe-test-"));
    await fs.rm(directory, { recursive: true, force: true });
  });
  await prepareReadOnlyProbe(directory);
  const probeDirectory = path.join(directory, ".fixture-ro-probe");
  const canary = path.join(probeDirectory, "canary");
  assert.equal(
    await fs.readFile(canary, "utf8"),
    "hedefora.pg17.read-only-probe.v1\n",
  );
  assert.deepEqual(await fs.readdir(probeDirectory), ["canary"]);
  assert.equal((await fs.lstat(canary)).nlink, 1);
  if (process.platform !== "win32") {
    assert.equal((await fs.lstat(probeDirectory)).mode & 0o777, 0o777);
    assert.equal((await fs.lstat(canary)).mode & 0o777, 0o666);
  }
  await assert.rejects(prepareReadOnlyProbe(directory), { code: "EEXIST" });
  assert.equal(
    await fs.readFile(canary, "utf8"),
    "hedefora.pg17.read-only-probe.v1\n",
  );
});

for (const existing of ["directory", "file", "canary"]) {
  test(`probe exclusive creation rejects pre-existing ${existing} without replacement`, async () => {
    const io = memoryIO();
    await io.mkdir("/owned/input", { mode: 0o700 });
    io.records.set("/owned/input/.fixture-ro-probe", {
      directory: existing !== "file",
      mode: 0o500,
      bytes: Buffer.from("preserved"),
    });
    if (existing === "canary")
      io.records.set("/owned/input/.fixture-ro-probe/canary", {
        directory: false,
        mode: 0o400,
        bytes: Buffer.from("existing canary"),
      });
    const before = [...io.records].map(([name, row]) => [
      name,
      { ...row, ...(row.bytes ? { bytes: Buffer.from(row.bytes) } : {}) },
    ]);
    await assert.rejects(
      prepareReadOnlyProbe("/owned/input", io, path.posix),
      /EXISTS/,
    );
    assert.deepEqual([...io.records], before);
    assert.equal(io.opens.length, 0);
  });
}

test("reserved probe paths are rejected before snapshot creation or any Git blob read", async () => {
  for (const reserved of [
    ".fixture-ro-probe",
    ".fixture-ro-probe/canary",
    ".FIXTURE-RO-PROBE/other",
  ]) {
    const io = memoryIO();
    let reads = 0;
    await assert.rejects(
      materializePublicSnapshot({
        directory: "/owned/source",
        entries: [
          { path: "ordinary.go", objectId: sourceObject },
          { path: reserved, objectId: sourceObject },
        ],
        blobReader: async () => {
          reads++;
          return sourceBytes;
        },
        io,
        paths: path.posix,
        platform: "linux",
      }),
      /FIXTURE_BUILD_RESERVED_PROBE_PATH/,
    );
    assert.equal(io.records.size, 0);
    assert.equal(reads, 0);
  }
});

function child() {
  const value = new EventEmitter();
  value.stdin = new PassThrough();
  value.stdout = new PassThrough();
  value.stderr = new PassThrough();
  value.kills = [];
  value.kill = (signal) => {
    value.kills.push(signal);
    queueMicrotask(() => value.emit("close", null));
    return true;
  };
  return value;
}
test("pre-aborted build command and Git blob never spawn", async () => {
  const controller = new AbortController();
  controller.abort();
  const spawnImpl = () => assert.fail("aborted work spawned");
  await assert.rejects(
    fixtureCommand({ spawnImpl }, controller.signal),
    /FIXTURE_COMMAND_ABORTED/,
  );
  await assert.rejects(
    readGitBlob({ signal: controller.signal, spawnImpl }),
    /FIXTURE_BUILD_ABORTED/,
  );
});
for (const missingClose of [false, true]) {
  test(`active build command abort reaps or fails missing close (${missingClose})`, async () => {
    const controller = new AbortController(),
      value = child();
    if (missingClose) value.kill = (signal) => value.kills.push(signal);
    await assert.rejects(
      fixtureCommand(
        {
          executable: process.execPath,
          args: [],
          env: {},
          timeoutMs: 30000,
          spawnImpl() {
            queueMicrotask(() => controller.abort());
            return value;
          },
        },
        controller.signal,
      ),
      /FIXTURE_COMMAND_ABORTED/,
    );
    assert.deepEqual(value.kills, ["SIGKILL"]);
    // Cleanup has its own budget and deliberately does not receive the abort.
    const clean = await fixtureCommand({
      executable: process.execPath,
      args: [],
      env: {},
      timeoutMs: 1000,
      spawnImpl() {
        const value = child();
        queueMicrotask(() => value.emit("close", 0));
        return value;
      },
    });
    assert.equal(clean.rawExit, 0);
    assert.equal(clean.connectionClosed, true);
  });
  test(`active Git blob abort rejects even with missing close (${missingClose})`, async () => {
    const controller = new AbortController(),
      value = child();
    if (missingClose) value.kill = (signal) => value.kills.push(signal);
    await assert.rejects(
      readGitBlob({
        git: { path: process.execPath },
        repository: "/public/repo",
        objectId: sourceObject,
        timeoutMs: 30000,
        signal: controller.signal,
        spawnImpl() {
          queueMicrotask(() => controller.abort());
          return value;
        },
      }),
      /FIXTURE_BUILD_BLOB_TRANSPORT/,
    );
    assert.deepEqual(value.kills, ["SIGKILL"]);
  });
}
test("raw Git blob transport preserves nonUTF8 bytes and observes actual close", async () => {
  const bytes = Buffer.from([255, 128, 0, 10]);
  let seen;
  const got = await readGitBlob({
    git: { path: process.execPath },
    repository: "/public/repo",
    objectId: oid(bytes),
    timeoutMs: 1000,
    spawnImpl(executable, args, options) {
      seen = { executable, args, options };
      const value = child();
      queueMicrotask(() => {
        value.stdout.write(bytes.subarray(0, 2));
        value.stdout.end(bytes.subarray(2));
        value.emit("close", 0);
      });
      return value;
    },
  });
  assert.deepEqual(got, bytes);
  assert.equal(seen.options.shell, false);
  assert.ok(seen.args.includes("core.fsmonitor=false"));
  assert.equal(seen.options.env.GIT_TERMINAL_PROMPT, "0");
});
for (const action of [
  "timeout",
  "stderr",
  "wrong-exit",
  "wrong-hash",
  "overflow",
])
  test(`raw Git transport rejects ${action}`, async () => {
    await assert.rejects(
      readGitBlob({
        git: { path: process.execPath },
        repository: "/public/repo",
        objectId: sourceObject,
        timeoutMs: 20,
        spawnImpl() {
          const value = child();
          queueMicrotask(() => {
            if (action === "stderr") value.stderr.write("synthetic-secret");
            else if (action === "wrong-exit") value.emit("close", 1);
            else if (action === "wrong-hash") {
              value.stdout.end("other");
              value.emit("close", 0);
            } else if (action === "overflow")
              value.stdout.write(Buffer.alloc(16777217));
          });
          return value;
        },
      }),
      /FIXTURE_BUILD_BLOB_/,
    );
  });

function inspected(running = false) {
  return {
    Id: id,
    Image: imageId,
    Name: `/${name}`,
    Config: {
      User: "1001:1001",
      WorkingDir: "/source",
      Image: GO_IMAGE,
      Entrypoint: ["/out/node"],
      Labels: {
        "org.hedefora.pg17.builder": "fixture-tools-v1",
        "org.hedefora.pg17.build-run": runId,
      },
      Env: Object.entries(BUILD_ENV).map(([key, value]) => `${key}=${value}`),
    },
    State: { Running: running, OOMKilled: false },
    HostConfig: {
      NetworkMode: "none",
      ReadonlyRootfs: true,
      Privileged: false,
      CapDrop: ["ALL"],
      CapAdd: null,
      SecurityOpt: ["no-new-privileges"],
      GroupAdd: [],
      PidMode: "",
      IpcMode: "private",
      NanoCpus: 2000000000,
      Memory: 1610612736,
      MemorySwap: 1610612736,
      PidsLimit: 256,
      Devices: [],
      DeviceRequests: [],
      PortBindings: {},
      Mounts: [
        {
          Type: "bind",
          Source: "C:/private/build/source",
          Target: "/source",
          ReadOnly: true,
        },
        {
          Type: "bind",
          Source: "C:/cache/gomod",
          Target: "/gomodcache",
          ReadOnly: true,
        },
        {
          Type: "bind",
          Source: "C:/private/build/tools",
          Target: "/out",
          ReadOnly: false,
        },
      ],
      Tmpfs: {
        "/tmp": "rw,nosuid,nodev,exec,size=1g,mode=0700,uid=1001,gid=1001",
      },
    },
    Mounts: [
      {
        Type: "bind",
        Source: "C:/private/build/source",
        Destination: "/source",
        RW: false,
      },
      {
        Type: "bind",
        Source: "C:/cache/gomod",
        Destination: "/gomodcache",
        RW: false,
      },
      {
        Type: "bind",
        Source: "C:/private/build/tools",
        Destination: "/out",
        RW: true,
      },
    ],
    NetworkSettings: { Ports: {} },
  };
}
test("builder args pin image/UID/caps/network and exact offline compiler flags", () => {
  const args = buildContainerArguments({ ...mounts, name, runId });
  assert.ok(args.includes(GO_IMAGE));
  assert.ok(args.includes("--pull=never"));
  assert.ok(args.includes("1001:1001"));
  assert.ok(args.includes("none"));
  assert.ok(args.includes("--read-only"));
  assert.equal(args.filter((x) => x === "--mount").length, 3);
  assert.ok(args.includes("GOPROXY=off"));
  assert.ok(args.includes("CGO_ENABLED=1"));
  assert.ok(
    args.includes("type=bind,src=C:/private/build/source,dst=/source,readonly"),
  );
  assert.ok(
    !args.some((arg) => arg.startsWith("type=bind,") && arg.includes("\\")),
  );
  assert.deepEqual(
    BUILD_COMMANDS.slice(0, 2).map((item) => item.args.slice(0, 6)),
    [
      [
        "test",
        "-c",
        "-race",
        "-tags=integration",
        "-trimpath",
        "-buildvcs=false",
      ],
      [
        "test",
        "-c",
        "-race",
        "-tags=integration",
        "-trimpath",
        "-buildvcs=false",
      ],
    ],
  );
  assert.equal(
    validateBuilderInspect(inspected(), {
      ...mounts,
      name,
      runId,
      imageId,
      running: false,
    }).Id,
    id,
  );
});
for (const [title, mutate] of [
  [
    "foreign-owner",
    (v) => {
      v.Config.Labels["org.hedefora.pg17.builder"] = "other";
    },
  ],
  [
    "wrong-image",
    (v) => {
      v.Image = `sha256:${"a".repeat(64)}`;
    },
  ],
  [
    "root",
    (v) => {
      v.Config.User = "0";
    },
  ],
  [
    "privileged",
    (v) => {
      v.HostConfig.Privileged = true;
    },
  ],
  [
    "capability",
    (v) => {
      v.HostConfig.CapAdd = ["SYS_ADMIN"];
    },
  ],
  [
    "network",
    (v) => {
      v.HostConfig.NetworkMode = "bridge";
    },
  ],
  [
    "rw-source",
    (v) => {
      v.Mounts[0].RW = true;
    },
  ],
  [
    "extra-mount",
    (v) => {
      v.Mounts.push({ Type: "bind", Destination: "/socket", RW: true });
    },
  ],
  [
    "proxy",
    (v) => {
      v.Config.Env = v.Config.Env.filter((x) => !x.startsWith("GOPROXY="));
      v.Config.Env.push("GOPROXY=https://unexpected.invalid");
    },
  ],
  [
    "extra-tmpfs",
    (v) => {
      v.HostConfig.Tmpfs["/outside"] = "rw";
    },
  ],
])
  test(`builder inspect rejects ${title}`, () => {
    const value = inspected();
    mutate(value);
    assert.throws(
      () =>
        validateBuilderInspect(value, {
          ...mounts,
          name,
          runId,
          imageId,
          running: false,
        }),
      /FIXTURE_BUILD_/,
    );
  });

function mockTransport({
  lostAck = false,
  foreign = false,
  removalFails = false,
  daemonFails = false,
  survivesRemoval = false,
  delayedVisibility = 0,
  neverVisible = false,
  unclosedCreate = false,
} = {}) {
  let exists = false,
    running = false,
    attempted = false,
    pendingEmpty = delayedVisibility;
  const calls = [];
  return {
    calls,
    async execute(args) {
      calls.push(args);
      if (args[1] === "ls") {
        if (attempted && pendingEmpty-- > 0) return ok("");
        if (daemonFails && exists) throw new Error("daemon unavailable");
        return ok(exists ? `${id}\n` : "");
      }
      if (args[1] === "create") {
        attempted = true;
        exists = !neverVisible;
        if (unclosedCreate)
          return { ...ok(`${id}\n`), connectionClosed: false };
        if (lostAck) throw new Error("lost ACK");
        return ok(`${id}\n`);
      }
      if (args[1] === "inspect") {
        const row = inspected(running);
        if (foreign) row.Config.Labels["org.hedefora.pg17.builder"] = "foreign";
        return ok(JSON.stringify([row]));
      }
      if (args[1] === "start") {
        running = true;
        return ok(id);
      }
      if (args[1] === "rm") {
        if (removalFails) throw new Error("removal unavailable");
        if (!survivesRemoval) exists = false;
        return ok(id);
      }
      throw new Error("unexpected command");
    },
  };
}
// The child receives real OS signals on POSIX. Windows cannot deliver catchable
// SIGINT/SIGTERM with child.kill, so its separately labelled branch uses IPC
// events. The daemon below is stateful synthetic data, never Docker or PG.
for (const signalName of ["SIGINT", "SIGTERM"]) {
  for (const phase of [
    "post-create",
    "post-start",
    "compile-wait",
    "lost-create-ack",
  ]) {
    test(`child signal scope and simulated builder cleanup: ${signalName}/${phase} (${process.platform === "win32" ? "Windows IPC event" : "POSIX OS signal"})`, async () => {
      const program = `
import {fixtureCommand,OwnedFixtureBuilder,BUILD_ENV} from ${JSON.stringify(new URL("./fixture-build.mjs", import.meta.url).href)};
import {withFixtureHostSignals} from ${JSON.stringify(new URL("./fixture-run.mjs", import.meta.url).href)};
import {GO_IMAGE} from ${JSON.stringify(new URL("./live-runtime.mjs", import.meta.url).href)};
const runId=${JSON.stringify(runId)}, name=${JSON.stringify(name)}, id=${JSON.stringify(id)}, imageId=${JSON.stringify(imageId)}, mounts=${JSON.stringify(mounts)};
const ok=${ok.toString()}, inspected=${inspected.toString()}, mockTransport=${mockTransport.toString()};
const phase=${JSON.stringify(phase)}, transport=mockTransport();
const before=[process.rawListeners('SIGINT'),process.rawListeners('SIGTERM')];
let cleanup, cleanupAnnounced=false, failure;
process.on('message',m=>{if(process.platform==='win32'&&m?.kind==='signal'&&['SIGINT','SIGTERM'].includes(m.signal))process.emit(m.signal);});
const cli=(signal,ms)=>fixtureCommand({executable:process.execPath,args:['-e','setTimeout(()=>process.exit(0),'+ms+')'],env:{},timeoutMs:3000},signal);
try {
 await withFixtureHostSignals(async signal=>{
  const waitForSignal=async()=>{const pending=cli(signal,2000);process.send({stage:'ready'});return pending;};
  const execute=async(args,options={})=>{
   if(options.cleanup){
    if(signal.aborted&&!cleanupAnnounced){cleanupAnnounced=true;process.send({stage:'cleanup'});await cli(undefined,150);}
    return transport.execute(args);
   }
   if(signal.aborted)throw Error('FIXTURE_COMMAND_ABORTED');
   const result=await transport.execute(args);
   if(phase==='lost-create-ack'&&args[1]==='create')return waitForSignal();
   return result;
  };
  const owner=new OwnedFixtureBuilder({execute,runId,imageId});
  try {
   await owner.create(mounts);
   if(phase==='post-create')await waitForSignal();
   await owner.start();
   if(phase==='post-start')await waitForSignal();
   await waitForSignal();
  }finally{cleanup=await owner.cleanup();}
 });
}catch(e){failure=e.code||e.message;}
const restored=['SIGINT','SIGTERM'].every((s,i)=>process.rawListeners(s).length===before[i].length&&process.rawListeners(s).every((f,j)=>f===before[i][j]));
process.stdout.write(JSON.stringify({status:failure?'FAIL':'PASS',code:failure,cleanup,restored,signalDelivery:process.platform==='win32'?'IPC-event':'OS-signal',removedIds:transport.calls.filter(a=>a[1]==='rm').map(a=>a[3]),lastOperation:transport.calls.at(-1)?.[1]})+'\\n');
process.exitCode=failure?1:0;process.disconnect();
`;
      const value = spawnChild(
        process.execPath,
        ["--input-type=module", "-e", program],
        {
          env:
            process.platform === "win32"
              ? { SystemRoot: process.env.SystemRoot }
              : {},
          shell: false,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe", "ipc"],
        },
      );
      let stdout = "",
        stderr = "",
        ready = 0,
        cleaning = 0,
        timedOut = false;
      const sendSignal = (signal) => {
        if (process.platform === "win32")
          value.send({ kind: "signal", signal });
        else value.kill(signal);
      };
      value.on("message", (message) => {
        if (message.stage === "ready") {
          ready++;
          sendSignal(signalName);
        }
        if (message.stage === "cleanup") {
          cleaning++;
          sendSignal(signalName);
          sendSignal(signalName === "SIGINT" ? "SIGTERM" : "SIGINT");
        }
      });
      value.stdout.on("data", (bytes) => {
        stdout += bytes;
        if (stdout.length > 4096) value.kill("SIGKILL");
      });
      value.stderr.on("data", (bytes) => {
        stderr += bytes;
        if (stderr.length > 4096) value.kill("SIGKILL");
      });
      const timeout = setTimeout(() => {
        timedOut = true;
        value.kill("SIGKILL");
      }, 10000);
      const closed = await new Promise((resolve, reject) => {
        value.once("error", reject);
        value.once("close", (code, signal) => resolve({ code, signal }));
      }).finally(() => clearTimeout(timeout));
      assert.equal(timedOut, false);
      assert.deepEqual(closed, { code: 1, signal: null });
      assert.equal(stderr, "");
      const result = JSON.parse(stdout);
      assert.equal(result.status, "FAIL");
      assert.equal(result.code, "FIXTURE_COMMAND_ABORTED");
      assert.equal(
        result.signalDelivery,
        process.platform === "win32" ? "IPC-event" : "OS-signal",
      );
      assert.equal(result.restored, true);
      assert.deepEqual(result.cleanup, {
        status: "PASS",
        removed: true,
        absent: true,
      });
      assert.deepEqual(result.removedIds, [id]);
      assert.equal(result.lastOperation, "ls");
      assert.equal(ready, 1);
      assert.equal(cleaning, 1);
    });
  }
}
test("owned builder checks create/start then removes exact ID and observes absence", async () => {
  const transport = mockTransport();
  const owner = new OwnedFixtureBuilder({
    execute: transport.execute,
    runId,
    imageId,
  });
  await owner.create(mounts);
  await owner.start();
  assert.deepEqual(await owner.cleanup(), {
    status: "PASS",
    removed: true,
    absent: true,
  });
  assert.deepEqual(
    transport.calls.find((args) => args[1] === "rm"),
    ["container", "rm", "--force", id],
  );
});
for (const operation of ["ls", "inspect", "rm"]) {
  test(`owned builder cleanup rejects missing ${operation} close`, async () => {
    const transport = mockTransport();
    let cleaning = false;
    const owner = new OwnedFixtureBuilder({
      runId,
      imageId,
      execute: async (args, options) => {
        const result = await transport.execute(args, options);
        return cleaning && args[1] === operation
          ? { ...result, connectionClosed: false }
          : result;
      },
    });
    await owner.create(mounts);
    cleaning = true;
    await assert.rejects(owner.cleanup(), /FIXTURE_BUILD_PROCESS/);
  });
}
for (const signalName of ["SIGINT", "SIGTERM"]) {
  for (const phase of [
    "post-create",
    "post-start",
    "compile-wait",
    "lost-create-ack",
  ]) {
    test(`simulated owned builder ${signalName} event during ${phase} cannot bypass cleanup`, async () => {
      const transport = mockTransport(),
        target = new EventEmitter();
      let cleanup, abortedSignal, cancelledChild;
      const cleanupSignals = [];
      await assert.rejects(
        withFixtureHostSignals(async (signal) => {
          abortedSignal = signal;
          const execute = async (args, options = {}) => {
            if (options.cleanup) {
              // Real cleanup transport omits the aborted signal even on repeats.
              cleanupSignals.push(signal.aborted);
              if (signal.aborted) target.emit(signalName);
              return transport.execute(args);
            }
            if (signal.aborted) throw Error("FIXTURE_COMMAND_ABORTED");
            const result =
              args[1] === "exec" ? ok("") : await transport.execute(args);
            if (
              (phase === "lost-create-ack" && args[1] === "create") ||
              args[1] === "exec"
            ) {
              return fixtureCommand(
                {
                  executable: process.execPath,
                  args: [],
                  env: {},
                  timeoutMs: 30000,
                  spawnImpl() {
                    cancelledChild = child();
                    queueMicrotask(() => target.emit(signalName));
                    return cancelledChild;
                  },
                },
                signal,
              );
            }
            return result;
          };
          const owner = new OwnedFixtureBuilder({ execute, runId, imageId });
          try {
            await owner.create(mounts);
            if (phase === "post-create") target.emit(signalName);
            await owner.start();
            if (phase === "post-start") target.emit(signalName);
            await execute([
              "container",
              "exec",
              owner.id,
              "controlled-compile-wait",
            ]);
          } finally {
            cleanup = await owner.cleanup();
          }
        }, target),
        /FIXTURE_COMMAND_ABORTED/,
      );
      assert.equal(abortedSignal.aborted, true);
      assert.deepEqual(cleanup, {
        status: "PASS",
        removed: true,
        absent: true,
      });
      assert.ok(cleanupSignals.some(Boolean));
      assert.equal(target.listenerCount("SIGINT"), 0);
      assert.equal(target.listenerCount("SIGTERM"), 0);
      assert.deepEqual(
        transport.calls.find((args) => args[1] === "rm"),
        ["container", "rm", "--force", id],
      );
      assert.equal(transport.calls.at(-1)[1], "ls");
      if (cancelledChild) assert.deepEqual(cancelledChild.kills, ["SIGKILL"]);
    });
  }
}
test("lost create ACK still cleans the exact random owned builder", async () => {
  const transport = mockTransport({ lostAck: true });
  const owner = new OwnedFixtureBuilder({
    execute: transport.execute,
    runId,
    imageId,
  });
  await assert.rejects(owner.create(mounts), /lost ACK/);
  assert.equal((await owner.cleanup()).absent, true);
});
test("lost create ACK reconciles delayed appearance after first empty list", async () => {
  const transport = mockTransport({ lostAck: true, delayedVisibility: 1 });
  const owner = new OwnedFixtureBuilder({
    execute: transport.execute,
    runId,
    imageId,
  });
  await assert.rejects(owner.create(mounts), /lost ACK/);
  assert.deepEqual(await owner.cleanup(), {
    status: "PASS",
    removed: true,
    absent: true,
  });
  assert.equal(transport.calls.filter((args) => args[1] === "rm").length, 1);
});
for (const option of [
  { lostAck: true, neverVisible: true },
  { unclosedCreate: true, neverVisible: true },
]) {
  test(`unproven create completion cannot PASS empty cleanup (${option.unclosedCreate ? "no-close" : "lost-ack"})`, async () => {
    const transport = mockTransport(option),
      owner = new OwnedFixtureBuilder({
        execute: transport.execute,
        runId,
        imageId,
      });
    await assert.rejects(owner.create(mounts));
    await assert.rejects(
      owner.cleanup(),
      /FIXTURE_BUILD_CREATE_COMPLETION_UNPROVEN/,
    );
    assert.equal(transport.calls.filter((args) => args[1] === "rm").length, 0);
    assert.equal(owner.createAcknowledged, false);
  });
}

for (const [title, mutate] of [
  [
    "actual-source",
    (v) => {
      v.Mounts[0].Source = "C:/foreign/source";
    },
  ],
  [
    "actual-output",
    (v) => {
      v.Mounts[2].Source = "C:/foreign/tools";
    },
  ],
  [
    "actual-cache",
    (v) => {
      v.Mounts[1].Source = "C:/foreign/cache";
    },
  ],
  [
    "configured-source",
    (v) => {
      v.HostConfig.Mounts[0].Source = "C:/foreign/source";
    },
  ],
  [
    "configured-output",
    (v) => {
      v.HostConfig.Mounts[2].Source = "C:/foreign/tools";
    },
  ],
  [
    "configured-cache-rw",
    (v) => {
      v.HostConfig.Mounts[1].ReadOnly = false;
    },
  ],
  [
    "configured-extra-mount",
    (v) => {
      v.HostConfig.Mounts.push({ ...v.HostConfig.Mounts[0] });
    },
  ],
  [
    "configured-volume",
    (v) => {
      v.HostConfig.Mounts[0].Type = "volume";
    },
  ],
  [
    "configured-legacy-bind",
    (v) => {
      v.HostConfig.Binds = ["C:/foreign:/source"];
    },
  ],
])
  test(`exact builder bind source rejects ${title}`, () => {
    const value = inspected();
    mutate(value);
    assert.throws(
      () =>
        validateBuilderInspect(value, {
          ...mounts,
          name,
          runId,
          imageId,
          running: false,
        }),
      /FIXTURE_BUILD_CONTAINER_MOUNTS/,
    );
  });

const moduleSources = [
  { path: "go.mod", sha256: "d".repeat(64) },
  { path: "go.sum", sha256: "e".repeat(64) },
];
test("offline go mod verify brackets every compile and binds source go.sum", async () => {
  const calls = [];
  const result = await runVerifiedCompileCommands({
    sourceFiles: moduleSources,
    exec: async (executable, args) => {
      calls.push(args);
      return ok(args[0] === "mod" ? "all modules verified\n" : "");
    },
  });
  assert.deepEqual(calls[0], ["mod", "verify"]);
  assert.deepEqual(calls.at(-1), ["mod", "verify"]);
  assert.equal(calls.length, 6);
  assert.equal(result.moduleVerification.goSumSha256, "e".repeat(64));
  assert.equal(result.moduleVerification.beforeCompile, "PASS");
  assert.equal(result.moduleVerification.afterCompile, "PASS");
  assert.equal(
    result.commands.every(
      (item) =>
        item.rawExit === 0 &&
        item.connectionClosed &&
        /^[a-f0-9]{64}$/.test(item.stdoutSha256),
    ),
    true,
  );
});
test("tampered or missing offline cache fails before compile and owned cleanup succeeds", async () => {
  for (const failure of [
    { ...ok("tampered cache\n"), rawExit: 1 },
    ok("missing cache\n"),
    { ...ok("all modules verified\n"), connectionClosed: false },
  ]) {
    const transport = mockTransport(),
      owner = new OwnedFixtureBuilder({
        execute: transport.execute,
        runId,
        imageId,
      });
    let compiled = 0;
    await owner.create(mounts);
    await owner.start();
    await assert.rejects(
      runVerifiedCompileCommands({
        sourceFiles: moduleSources,
        exec: async (executable, args) => {
          if (args[0] !== "mod") compiled++;
          return failure;
        },
      }),
      /FIXTURE_BUILD_/,
    );
    assert.equal(compiled, 0);
    assert.equal((await owner.cleanup()).status, "PASS");
  }
});
test("post-compile cache verification failure prevents bundle success", async () => {
  let verifications = 0,
    published = 0;
  await assert.rejects(
    runVerifiedCompileCommands({
      sourceFiles: moduleSources,
      exec: async (executable, args) => {
        if (args[0] === "mod")
          return ++verifications === 1
            ? ok("all modules verified\n")
            : { ...ok("changed cache\n"), rawExit: 1 };
        return ok();
      },
    }).then(() => {
      published++;
    }),
    /FIXTURE_BUILD_COMPILE_PROCESS/,
  );
  assert.equal(verifications, 2);
  assert.equal(published, 0);
});
test("foreign label and daemon failure never authorize builder deletion", async () => {
  for (const option of [{ foreign: true }, { daemonFails: true }]) {
    const transport = mockTransport(option),
      owner = new OwnedFixtureBuilder({
        execute: transport.execute,
        runId,
        imageId,
      });
    try {
      await owner.create(mounts);
    } catch {
      /* initial foreign inspect also fails */
    }
    await assert.rejects(owner.cleanup());
    assert.equal(transport.calls.filter((args) => args[1] === "rm").length, 0);
  }
});
test("failed or unproven removal remains FAIL", async () => {
  for (const option of [{ removalFails: true }, { survivesRemoval: true }]) {
    const transport = mockTransport(option),
      owner = new OwnedFixtureBuilder({
        execute: transport.execute,
        runId,
        imageId,
      });
    await owner.create(mounts);
    await assert.rejects(owner.cleanup());
  }
});

const metadata = (name) =>
  `/out/${name}: go1.26.7\n\tpath\tpublic/package\n\tbuild\tCGO_ENABLED=1\n\tbuild\tGOOS=linux\n\tbuild\tGOARCH=amd64\n\tbuild\tGOAMD64=v1\n\tbuild\t-trimpath=true\n${name.endsWith(".test") ? "\tbuild\t-race=true\n\tbuild\t-tags=integration\n" : ""}`;
test("Go build metadata independently binds compiler/race/integration/target", () => {
  assert.equal(
    validateBuildMetadata(metadata("postgres.test"), "postgres.test").race,
    true,
  );
  assert.equal(
    validateBuildMetadata(metadata("tlsfixture"), "tlsfixture").goVersion,
    "go1.26.7",
  );
  for (const text of [
    metadata("postgres.test").replace("go1.26.7", "go1.26.0"),
    metadata("postgres.test").replace("-race=true", "-race=false"),
    metadata("postgres.test").replace("-tags=integration", "-tags=unit"),
    metadata("postgres.test") + "\tbuild\tvcs.revision=unexpected\n",
    metadata("postgres.test") + "\tbuild\tGOOS=windows\n",
  ])
    assert.throws(
      () => validateBuildMetadata(text, "postgres.test"),
      /FIXTURE_BUILD_METADATA/,
    );
});
