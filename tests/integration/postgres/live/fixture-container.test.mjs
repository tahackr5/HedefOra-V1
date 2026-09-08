import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { constants } from "node:fs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { GO_IMAGE, createPrivateRunSecrets } from "./live-runtime.mjs";
import { command } from "./process.mjs";
import {
  createNativePsqlExecutor,
  PG_BIN,
  classifyNativeFailure,
  NATIVE_FAILURE_CATEGORIES,
} from "./fixture-native-psql.mjs";
import {
  FIXTURE_IMAGE,
  GO_PACKAGES,
  validateFixtureRun,
  validateToolBundle,
  validateSelfIsolation,
  validateGoEvents,
  runGoPackage,
  startPostmaster,
  postgresConfiguration,
  RO_PROBE_PATH,
  RO_PROBE_CONTENT,
  probeReadOnlyInputs,
  verifyFiles,
  ensurePostmasterStarted,
  readinessFailureCode,
  collectGoAssertionSites,
  classifyGoFailure,
} from "./fixture-container.mjs";

const now = Date.parse("2026-09-07T12:00:00.000Z");
test("repeated postmaster start verifies readiness without a replacement", async () => {
  let ready = 0;
  await ensurePostmasterStarted({
    current: {
      isRunning: () => true,
      get closed() {
        throw new Error("must not await running server");
      },
    },
    restart: async () => assert.fail("must not restart"),
    readiness: async () => {
      ready++;
    },
  });
  assert.equal(ready, 1);
  await assert.rejects(
    ensurePostmasterStarted({
      current: { isRunning: () => true },
      restart: async () => assert.fail(),
      readiness: async () => {
        throw new Error("not ready");
      },
    }),
    /not ready/,
  );
});
test("stopped postmaster requires observed clean close and real restart readiness", async () => {
  const order = [];
  await ensurePostmasterStarted({
    current: {
      isRunning: () => false,
      closed: Promise.resolve({
        rawExit: 0,
        origin: "exit",
        connectionClosed: true,
      }),
    },
    restart: async () => order.push("restart"),
    readiness: async () => order.push("readiness"),
  });
  assert.deepEqual(order, ["restart", "readiness"]);
  for (const closed of [
    undefined,
    { rawExit: 1, origin: "exit", connectionClosed: true },
    { rawExit: 0, origin: "channel", connectionClosed: true },
    { rawExit: 0, origin: "exit", connectionClosed: false },
  ])
    await assert.rejects(
      ensurePostmasterStarted({
        current: { isRunning: () => false, closed: Promise.resolve(closed) },
        restart: async () => assert.fail("unclean close"),
        readiness: async () => assert.fail("unclean close"),
      }),
      /FIXTURE_START_UNCLEAN_CLOSE/,
    );
});
test("readiness failure emits bounded phase and numeric state without arbitrary diagnostics", () => {
  assert.equal(
    readinessFailureCode(
      "primary",
      "postgres",
      { rawExit: 2, sqlState: "28P01" },
      "AUTHENTICATION",
    ),
    "FIXTURE_READINESS_P_INIT_EXIT_2_STATE_28P01_AUTHENTICATION",
  );
  const safe = readinessFailureCode(
    "secret-user",
    "secret-db",
    { rawExit: "secret", sqlState: "secret-password" },
    "secret-diagnostic",
  );
  assert.equal(
    safe,
    "FIXTURE_READINESS_U_UNKNOWN_EXIT_UNKNOWN_STATE_NONE_UNKNOWN",
  );
  for (const category of NATIVE_FAILURE_CATEGORIES) {
    const code = readinessFailureCode(
      "negative",
      "hedefora_dev",
      { rawExit: 255, sqlState: "XXXXX" },
      category,
    );
    assert.match(code, /^[A-Z][A-Z0-9_]{0,95}$/);
  }
});
test("native diagnostics classify failure only into a closed non-secret category", () => {
  for (const [stderr, category] of [
    ["password authentication failed for user secret", "AUTHENTICATION"],
    ["SSL error: certificate verify failed secret", "TLS"],
    ["connection refused secret", "CONNECT"],
    ["invalid value for parameter secret", "CLIENT_CONFIGURATION"],
    ["sensitive arbitrary error secret", "SERVER_SQL_OTHER"],
  ])
    assert.equal(
      classifyNativeFailure({
        rawExit: 2,
        origin: "exit",
        connectionClosed: true,
        stderr,
      }),
      category,
    );
  for (const raw of [
    { rawExit: -1, origin: "channel", stderr: "secret" },
    { rawExit: -1, origin: "timeout", stderr: "secret" },
    { rawExit: 0, origin: "exit", connectionClosed: true, stderr: "secret" },
  ]) {
    const category = classifyNativeFailure(raw);
    assert.ok(NATIVE_FAILURE_CATEGORIES.includes(category));
    assert.doesNotMatch(category, /secret/i);
  }
});
function run() {
  return {
    schema: "hedefora.pg17.fixture-run.v1",
    runId: "a".repeat(32),
    sourceCommit: "b".repeat(40),
    sourceTree: "c".repeat(40),
    imageManifestDigest: FIXTURE_IMAGE.manifest,
    imageConfigDigest: FIXTURE_IMAGE.config,
    approvalSha256: "d".repeat(64),
    bundleSha256: "e".repeat(64),
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 1200000).toISOString(),
  };
}
function bundle() {
  return {
    schema: "hedefora.pg17.fixture-tools.v1",
    sourceCommit: run().sourceCommit,
    sourceTree: run().sourceTree,
    goVersion: "go1.26.7",
    goImage: GO_IMAGE,
    race: true,
    integration: true,
    files: ["node", "tlsfixture", "test2json", "postgres.test", "app.test"].map(
      (name) => ({ name, bytes: 1, sha256: "a".repeat(64) }),
    ),
    sourceFiles: [
      {
        path: "tests/integration/postgres/live/fixture-container.mjs",
        bytes: 0,
        sha256: "f".repeat(64),
      },
    ],
  };
}
test("fixture metadata is exact, fixed image and bounded twenty-minute lease", () => {
  assert.deepEqual(validateFixtureRun(run(), now), run());
  assert.deepEqual(validateToolBundle(bundle(), run()), bundle());
});
test("metadata identities and hashes cannot use coercible array values", () => {
  for (const key of Object.keys(run())) {
    const value = run();
    value[key] = [value[key]];
    assert.throws(() => validateFixtureRun(value, now), /FIXTURE_RUN_FIELDS/);
  }
  for (const entry of ["files", "sourceFiles"]) {
    const value = bundle();
    value[entry][0].sha256 = [value[entry][0].sha256];
    assert.throws(() => validateToolBundle(value, run()), /FIXTURE_/);
  }
});
for (const [name, mutate] of [
  [
    "unknown-key",
    (v) => {
      v.password = "synthetic-secret";
    },
  ],
  [
    "wrong-manifest",
    (v) => {
      v.imageManifestDigest = `sha256:${"f".repeat(64)}`;
    },
  ],
  [
    "wrong-config",
    (v) => {
      v.imageConfigDigest = v.imageManifestDigest;
    },
  ],
  [
    "source-short",
    (v) => {
      v.sourceCommit = "abc";
    },
  ],
  [
    "expired",
    (v) => {
      v.expiresAt = v.issuedAt;
    },
  ],
  [
    "future",
    (v) => {
      v.issuedAt = new Date(now + 1).toISOString();
    },
  ],
  [
    "overlong",
    (v) => {
      v.expiresAt = new Date(now + 1200001).toISOString();
    },
  ],
  [
    "noncanonical-time",
    (v) => {
      v.issuedAt = "2026-09-07T12:00:00Z";
    },
  ],
])
  test(`fixture metadata rejects ${name}`, () => {
    const value = run();
    mutate(value);
    assert.throws(() => validateFixtureRun(value, now), /FIXTURE_/);
  });
for (const [name, mutate] of [
  [
    "wrong-version",
    (v) => {
      v.goVersion = "go1.26.0";
    },
  ],
  [
    "wrong-go-image",
    (v) => {
      v.goImage = "golang:latest";
    },
  ],
  [
    "wrong-source",
    (v) => {
      v.sourceTree = "a".repeat(40);
    },
  ],
  [
    "no-race",
    (v) => {
      v.race = false;
    },
  ],
  [
    "duplicate-tool",
    (v) => {
      v.files[0] = v.files[1];
    },
  ],
  [
    "extra-tool",
    (v) => {
      v.files.push({ name: "bash", bytes: 1, sha256: "a".repeat(64) });
    },
  ],
  [
    "oversized-tool",
    (v) => {
      v.files[0].bytes = 268435457;
    },
  ],
  [
    "traversal",
    (v) => {
      v.sourceFiles[0].path = "../secret";
    },
  ],
  [
    "secret-path",
    (v) => {
      v.sourceFiles[0].path = ".env";
    },
  ],
  [
    "duplicate-source",
    (v) => {
      v.sourceFiles.push(v.sourceFiles[0]);
    },
  ],
  [
    "source-extra-field",
    (v) => {
      v.sourceFiles[0].credential = "x";
    },
  ],
  [
    "reserved-canary-path",
    (v) => {
      v.sourceFiles[0].path = RO_PROBE_PATH;
    },
  ],
  [
    "reserved-canary-directory",
    (v) => {
      v.sourceFiles[0].path = ".fixture-ro-probe/extra";
    },
  ],
])
  test(`bundle rejects ${name}`, () => {
    const value = bundle();
    mutate(value);
    assert.throws(() => validateToolBundle(value, run()), /FIXTURE_/);
  });

function isolation() {
  return {
    platform: "linux",
    pid: 1,
    uid: 26,
    gid: 102,
    groups: [102],
    status:
      "Uid:\t26\t26\t26\t26\nGid:\t102\t102\t102\t102\nCapInh:\t0000000000000000\nCapPrm:\t0000000000000000\nCapEff:\t0000000000000000\nCapBnd:\t0000000000000000\nCapAmb:\t0000000000000000\nNoNewPrivs:\t1\nSeccomp:\t2\n",
    mounts: [
      "1 0 0:1 / / ro - overlay overlay ro",
      "2 1 0:2 / /source ro - ext4 source ro",
      "3 1 0:3 / /tools ro - ext4 tools ro",
      "4 1 0:4 / /input ro - ext4 input ro",
      "5 1 0:5 / /fixture rw,noexec,nosuid,nodev - tmpfs tmpfs rw,size=524288k,uid=26,gid=102,mode=700",
      "6 1 0:6 / /tmp rw,noexec,nosuid,nodev - tmpfs tmpfs rw,size=65536k,uid=26,gid=102,mode=700",
    ].join("\n"),
    devices: ["lo"],
    routes: "Iface Destination Gateway Flags\n",
    routes6: "0 0 0 lo\n",
  };
}
test("self observation checks actual process, loopback-only route and readonly/tmpfs layout", () => {
  assert.equal(
    validateSelfIsolation(isolation()).authority,
    "self-observation-only",
  );
});
for (const [name, mutate] of [
  [
    "root",
    (v) => {
      v.uid = 0;
    },
  ],
  [
    "non-pid1",
    (v) => {
      v.pid = 123;
    },
  ],
  [
    "extra-group",
    (v) => {
      v.groups.push(0);
    },
  ],
  [
    "capability",
    (v) => {
      v.status = v.status.replace(
        "CapEff:\t0000000000000000",
        "CapEff:\t0000000000000001",
      );
    },
  ],
  [
    "seccomp",
    (v) => {
      v.status = v.status.replace("Seccomp:\t2", "Seccomp:\t0");
    },
  ],
  [
    "rw-source",
    (v) => {
      v.mounts = v.mounts.replace("/source ro", "/source rw");
    },
  ],
  [
    "nested-mount",
    (v) => {
      v.mounts += "\n7 2 0:7 / /source/file rw - ext4 x rw";
    },
  ],
  [
    "exec-tmpfs",
    (v) => {
      v.mounts = v.mounts.replace("rw,noexec,nosuid,nodev", "rw,nosuid,nodev");
    },
  ],
  [
    "tmpfs-size",
    (v) => {
      v.mounts = v.mounts.replace("size=524288k", "size=1048576k");
    },
  ],
  [
    "external-interface",
    (v) => {
      v.devices.push("eth0");
    },
  ],
  [
    "external-route",
    (v) => {
      v.routes += "eth0 00000000 00000001 0003\n";
    },
  ],
  [
    "external-ipv6",
    (v) => {
      v.routes6 += "0 0 0 eth0\n";
    },
  ],
])
  test(`self observation rejects ${name}`, () => {
    const value = isolation();
    mutate(value);
    assert.throws(() => validateSelfIsolation(value), /FIXTURE_/);
  });

const inputRoots = ["/source", "/tools", "/input"];
function canaryFixture({ fileMode = 0o666, rootMode = 0o555 } = {}) {
  const metadata = new Map(),
    contents = new Map(),
    reads = [];
  let inode = 0n,
    closes = 0;
  function info(directory, mode, bytes = 0) {
    return {
      dev: 1n,
      ino: ++inode,
      nlink: directory ? 2n : 1n,
      mode: BigInt((directory ? 0o40000 : 0o100000) | mode),
      uid: 0n,
      gid: 0n,
      size: BigInt(bytes),
      mtimeNs: 1n,
      ctimeNs: 1n,
      isDirectory: () => directory,
      isFile: () => !directory,
      isSymbolicLink: () => false,
    };
  }
  metadata.set("/", info(true, 0o755));
  for (const root of inputRoots) {
    metadata.set(root, info(true, rootMode));
    metadata.set(`${root}/.fixture-ro-probe`, info(true, 0o777));
    const path = `${root}/${RO_PROBE_PATH}`;
    const bytes = Buffer.from(RO_PROBE_CONTENT);
    metadata.set(path, info(false, fileMode, bytes.length));
    contents.set(path, bytes);
  }
  return {
    metadata,
    contents,
    reads,
    get closes() {
      return closes;
    },
    options: {
      uid: 26,
      gid: 102,
      groups: [102],
      realpathFile: async (path) => path,
      lstatFile: async (path) => ({ ...metadata.get(path) }),
      openFile: async (path, flags) => {
        assert.equal(flags, constants.O_RDONLY | constants.O_NOFOLLOW);
        reads.push(path);
        return {
          stat: async () => ({ ...metadata.get(path) }),
          read: async (buffer, offset, length, position) => ({
            bytesRead: contents
              .get(path)
              .copy(buffer, offset, position, position + length),
          }),
          close: async () => {
            closes++;
          },
        };
      },
    },
  };
}
const roFailure = (code = "EROFS") =>
  Object.assign(new Error("synthetic"), { code });
for (const fileMode of [0o666, 0o777])
  test(`calibrated canaries with mode ${fileMode.toString(8)} require exactly six EROFS observations`, async () => {
    const fixture = canaryFixture({
        fileMode,
        rootMode: fileMode === 0o777 ? 0o777 : 0o555,
      }),
      calls = [];
    await probeReadOnlyInputs(async (path, flags, mode) => {
      calls.push({ path, flags, mode });
      throw roFailure();
    }, fixture.options);
    assert.equal(calls.length, 6);
    assert.equal(fixture.closes, 3);
    for (const [index, root] of inputRoots.entries()) {
      const existing = calls[index * 2],
        create = calls[index * 2 + 1];
      assert.equal(existing.path, `${root}/${RO_PROBE_PATH}`);
      assert.equal(existing.flags, constants.O_WRONLY | constants.O_NOFOLLOW);
      assert.match(
        create.path,
        new RegExp(`^${root}/\\.fixture-ro-probe/\\.create-[a-f0-9]{32}$`),
      );
      assert.equal(
        create.flags,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW,
      );
      assert.equal(create.mode, 0o600);
      for (const call of [existing, create])
        assert.equal(call.flags & (constants.O_TRUNC | constants.O_APPEND), 0);
    }
    assert.equal(
      new Set(calls.filter((_, index) => index % 2).map((call) => call.path))
        .size,
      3,
    );
  });

for (const code of ["EACCES", "EPERM", "ENOENT", "EIO", undefined])
  for (const failedOpen of [0, 1])
    test(`calibrated canary ${failedOpen ? "create" : "existing"} probe rejects ${code}`, async () => {
      let calls = 0;
      await assert.rejects(
        probeReadOnlyInputs(async () => {
          const next = calls++ === failedOpen ? code : "EROFS";
          throw Object.assign(new Error("synthetic"), { code: next });
        }, canaryFixture().options),
        /FIXTURE_RO_PROBE_ERROR/,
      );
      assert.equal(calls, failedOpen + 1);
    });
for (const successfulOpen of [0, 1])
  test(`unexpected successful ${successfulOpen ? "create" : "existing"} open closes without writing or truncating and fails`, async () => {
    let calls = 0,
      closed = 0;
    await assert.rejects(
      probeReadOnlyInputs(async (_path, flags) => {
        assert.equal(flags & (constants.O_TRUNC | constants.O_APPEND), 0);
        if (calls++ !== successfulOpen) throw roFailure();
        return {
          close: async () => {
            closed++;
          },
          write: () => assert.fail("must not write"),
        };
      }, canaryFixture().options),
      /FIXTURE_RO_PROBE_WRITABLE/,
    );
    assert.equal(closed, 1);
    assert.equal(calls, successfulOpen + 1);
  });

for (const [name, mutate, expected] of [
  [
    "wrong-effective-uid",
    (v) => {
      v.options.uid = 0;
    },
    /FIXTURE_RO_PROBE_IDENTITY/,
  ],
  [
    "wrong-effective-gid",
    (v) => {
      v.options.gid = 0;
    },
    /FIXTURE_RO_PROBE_IDENTITY/,
  ],
  [
    "extra-supplementary-group",
    (v) => {
      v.options.groups.push(0);
    },
    /FIXTURE_RO_PROBE_IDENTITY/,
  ],
  [
    "root-not-traversable",
    (v) => {
      v.metadata.get("/").mode = 0o40750n;
    },
    /FIXTURE_RO_PROBE_CALIBRATION/,
  ],
  [
    "mount-not-traversable",
    (v) => {
      v.metadata.get("/source").mode = 0o40750n;
    },
    /FIXTURE_RO_PROBE_CALIBRATION/,
  ],
  [
    "probe-directory-not-writable",
    (v) => {
      v.metadata.get("/source/.fixture-ro-probe").mode = 0o40755n;
    },
    /FIXTURE_RO_PROBE_CALIBRATION/,
  ],
  [
    "probe-directory-owner-class-readonly",
    (v) => {
      Object.assign(v.metadata.get("/source/.fixture-ro-probe"), {
        mode: 0o40577n,
        uid: 26n,
      });
    },
    /FIXTURE_RO_PROBE_CALIBRATION/,
  ],
  [
    "probe-directory-symlink",
    (v) => {
      v.metadata.get("/source/.fixture-ro-probe").isSymbolicLink = () => true;
    },
    /FIXTURE_RO_PROBE_DIRECTORY/,
  ],
  [
    "mount-symlink",
    (v) => {
      v.metadata.get("/source").isSymbolicLink = () => true;
    },
    /FIXTURE_RO_PROBE_DIRECTORY/,
  ],
  [
    "probe-directory-alias",
    (v) => {
      v.options.realpathFile = async (path) =>
        path.endsWith(".fixture-ro-probe") ? "/other" : path;
    },
    /FIXTURE_RO_PROBE_DIRECTORY/,
  ],
  [
    "file-readonly",
    (v) => {
      v.metadata.get(`/source/${RO_PROBE_PATH}`).mode = 0o100444n;
    },
    /FIXTURE_RO_PROBE_CALIBRATION/,
  ],
  [
    "file-owner-class-readonly",
    (v) => {
      Object.assign(v.metadata.get(`/source/${RO_PROBE_PATH}`), {
        mode: 0o100466n,
        uid: 26n,
      });
    },
    /FIXTURE_RO_PROBE_CALIBRATION/,
  ],
  [
    "file-group-class-readonly",
    (v) => {
      Object.assign(v.metadata.get(`/source/${RO_PROBE_PATH}`), {
        mode: 0o100646n,
        gid: 102n,
      });
    },
    /FIXTURE_RO_PROBE_CALIBRATION/,
  ],
  [
    "file-symlink",
    (v) => {
      v.metadata.get(`/source/${RO_PROBE_PATH}`).isSymbolicLink = () => true;
    },
    /FIXTURE_RO_PROBE_FILE/,
  ],
  [
    "file-alias",
    (v) => {
      v.options.realpathFile = async (path) =>
        path.endsWith("/canary") ? "/other" : path;
    },
    /FIXTURE_RO_PROBE_FILE/,
  ],
  [
    "file-hardlink",
    (v) => {
      v.metadata.get(`/source/${RO_PROBE_PATH}`).nlink = 2n;
    },
    /FIXTURE_RO_PROBE_FILE/,
  ],
  [
    "file-not-regular",
    (v) => {
      v.metadata.get(`/source/${RO_PROBE_PATH}`).isFile = () => false;
    },
    /FIXTURE_RO_PROBE_FILE/,
  ],
  [
    "empty-file",
    (v) => {
      v.metadata.get(`/source/${RO_PROBE_PATH}`).size = 0n;
    },
    /INPUT_FILE/,
  ],
  [
    "oversized-file",
    (v) => {
      v.metadata.get(`/source/${RO_PROBE_PATH}`).size += 1n;
    },
    /INPUT_FILE/,
  ],
  [
    "truncated-file",
    (v) => {
      v.contents.set(`/source/${RO_PROBE_PATH}`, Buffer.from("short"));
    },
    /INPUT_CHANGED/,
  ],
  [
    "wrong-content",
    (v) => {
      v.contents.get(`/source/${RO_PROBE_PATH}`)[0] ^= 1;
    },
    /FIXTURE_RO_PROBE_HASH/,
  ],
  [
    "replaced-before-open",
    (v) => {
      const original = v.options.openFile;
      v.options.openFile = async (...args) => {
        v.metadata.get(args[0]).ino += 1n;
        return original(...args);
      };
    },
    /FIXTURE_RO_PROBE_CHANGED/,
  ],
  [
    "metadata-changed-during-read",
    (v) => {
      const original = v.options.openFile;
      v.options.openFile = async (...args) => {
        const handle = await original(...args),
          read = handle.read;
        handle.read = async (...readArgs) => {
          v.metadata.get(args[0]).ctimeNs += 1n;
          return read(...readArgs);
        };
        return handle;
      };
    },
    /INPUT_CHANGED/,
  ],
])
  test(`canary calibration rejects ${name} before any write-open attempt`, async () => {
    const fixture = canaryFixture();
    mutate(fixture);
    let writes = 0;
    await assert.rejects(
      probeReadOnlyInputs(async () => {
        writes++;
        throw roFailure();
      }, fixture.options),
      expected,
    );
    assert.equal(writes, 0);
    assert.equal(fixture.closes, fixture.reads.length);
  });

function inventoryFixture() {
  const canaries = canaryFixture(),
    value = bundle();
  const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
  value.sourceFiles[0].sha256 = digest("");
  value.files.forEach((item) => {
    item.sha256 = digest("x");
  });
  const inventories = new Map([
    [
      "/source",
      [...value.sourceFiles.map((item) => item.path), RO_PROBE_PATH].sort(),
    ],
    [
      "/tools",
      [
        ...value.files.map((item) => item.name),
        "bundle.json",
        RO_PROBE_PATH,
      ].sort(),
    ],
    ["/input", [RO_PROBE_PATH, "run.json"]],
  ]);
  return {
    value,
    canaries,
    inventories,
    options: {
      probeOptions: canaries.options,
      inventoryFiles: async (path) => inventories.get(path),
      readFile: async (path) =>
        Buffer.from(path.startsWith("/source/") ? "" : "x"),
    },
  };
}
test("exact inventories accept only one fixed canary alongside unchanged source/tool/input files", async () => {
  const fixture = inventoryFixture();
  await verifyFiles(fixture.value, fixture.options);
  assert.equal(fixture.canaries.closes, 3);
  assert.equal(
    fixture.value.sourceFiles.some((item) => item.path === RO_PROBE_PATH),
    false,
  );
});
for (const root of inputRoots)
  for (const mutation of [
    "missing",
    "duplicate",
    "extra-sibling",
    "extra-prefix",
    "wrong-case",
  ])
    test(`exact ${root} inventory rejects canary ${mutation}`, async () => {
      const fixture = inventoryFixture(),
        entries = fixture.inventories.get(root);
      if (mutation === "missing")
        entries.splice(entries.indexOf(RO_PROBE_PATH), 1);
      else if (mutation === "duplicate") entries.push(RO_PROBE_PATH);
      else if (mutation === "extra-sibling")
        entries.push(".fixture-ro-probe/extra");
      else if (mutation === "extra-prefix")
        entries.push(".fixture-ro-probe-other/canary");
      else entries[entries.indexOf(RO_PROBE_PATH)] = ".fixture-ro-probe/Canary";
      entries.sort();
      await assert.rejects(
        verifyFiles(fixture.value, fixture.options),
        /FIXTURE_(SOURCE_INVENTORY_DRIFT|MOUNT_INVENTORY)/,
      );
    });
test("post-test verification rehashes every canary against the constant", async () => {
  const fixture = inventoryFixture();
  await verifyFiles(fixture.value, fixture.options);
  fixture.canaries.contents.get(`/input/${RO_PROBE_PATH}`)[0] ^= 1;
  await assert.rejects(
    verifyFiles(fixture.value, fixture.options),
    /FIXTURE_RO_PROBE_HASH/,
  );
  assert.equal(fixture.canaries.closes, 6);
});
test("post-test verification also rejects source and tool content drift", async () => {
  for (const root of ["/source", "/tools"]) {
    const fixture = inventoryFixture();
    await verifyFiles(fixture.value, fixture.options);
    const original = fixture.options.readFile;
    fixture.options.readFile = async (path) =>
      path.startsWith(`${root}/`) ? Buffer.from("changed") : original(path);
    await assert.rejects(
      verifyFiles(fixture.value, fixture.options),
      /FIXTURE_(SOURCE|TOOL)_HASH/,
    );
  }
});

const packages = Object.keys(GO_PACKAGES),
  packageName = packages[0];
const exited = { rawExit: 0, origin: "exit", connectionClosed: true };
function events(pkg = packageName) {
  return [
    { Action: "start", Package: pkg },
    ...GO_PACKAGES[pkg].flatMap((Test) => [
      { Action: "run", Package: pkg, Test },
      {
        Action: "output",
        Package: pkg,
        Test,
        Output: "synthetic-pg17-secret PRIVATE KEY token do-not-emit\n",
      },
      { Action: "pass", Package: pkg, Test, Elapsed: 0.1 },
    ]),
    { Action: "pass", Package: pkg, Elapsed: 1 },
  ];
}
const json = (values) =>
  values.map((value) => JSON.stringify(value)).join("\n") + "\n";
test("all six exact package-qualified tests require package PASS and two observed zero exits", () => {
  const receipts = packages.map((pkg) =>
    validateGoEvents(json(events(pkg)), pkg, exited, exited),
  );
  assert.equal(receipts.flatMap((item) => item.requiredTests).length, 6);
  assert.doesNotMatch(JSON.stringify(receipts), /synthetic-|PRIVATE KEY|token/);
});
for (const [name, mutate] of [
  [
    "wrong-package",
    (v) => {
      v[1].Package = packages[1];
    },
  ],
  [
    "skip",
    (v) => {
      v[3].Action = "skip";
    },
  ],
  [
    "fail",
    (v) => {
      v[3].Action = "fail";
    },
  ],
  [
    "duplicate-pass",
    (v) => {
      v.splice(4, 0, { ...v[3] });
    },
  ],
  [
    "duplicate-run",
    (v) => {
      v.splice(2, 0, { ...v[1] });
    },
  ],
  [
    "missing-test",
    (v) => {
      v.splice(1, 3);
    },
  ],
  [
    "unrequested-test",
    (v) => {
      v[1].Test = "TestPG17Unexpected";
    },
  ],
  [
    "missing-package-pass",
    (v) => {
      v.pop();
    },
  ],
  [
    "duplicate-package-pass",
    (v) => {
      v.push({ ...v.at(-1) });
    },
  ],
  [
    "event-after-package-pass",
    (v) => {
      v.push({ Action: "output", Package: packageName, Output: "x" });
    },
  ],
  [
    "unfinished-subtest",
    (v) => {
      v.splice(3, 0, {
        Action: "run",
        Package: packageName,
        Test: `${GO_PACKAGES[packageName][0]}/unfinished`,
      });
    },
  ],
  [
    "missing-start",
    (v) => {
      v.shift();
    },
  ],
])
  test(`Go JSON rejects ${name}`, () => {
    const values = events();
    mutate(values);
    assert.throws(
      () => validateGoEvents(json(values), packageName, exited, exited),
      /FIXTURE_GO/,
    );
  });
test("Go rejects truncated, malformed, oversized and unobserved converter/binary close", () => {
  for (const text of [
    json(events()).slice(0, -1),
    "{bad}\n",
    " ".repeat(1048577),
  ])
    assert.throws(
      () => validateGoEvents(text, packageName, exited, exited),
      /FIXTURE_GO/,
    );
  for (const result of [
    { ...exited, rawExit: 1 },
    { ...exited, origin: "timeout" },
    { ...exited, connectionClosed: false },
  ]) {
    assert.throws(
      () => validateGoEvents(json(events()), packageName, result, exited),
      /FIXTURE_GO_PROCESS/,
    );
    assert.throws(
      () => validateGoEvents(json(events()), packageName, exited, result),
      /FIXTURE_GO_PROCESS/,
    );
  }
});

function fakeChild() {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kills = [];
  child.kill = (signal) => {
    child.kills.push(signal);
    queueMicrotask(() => {
      child.stdout.end();
      child.stderr.end();
      child.emit("close", signal === "SIGINT" ? 0 : null);
    });
    return true;
  };
  return child;
}
test("Go binary and converter are separately monitored direct children with explicit pipe", async () => {
  const seen = [],
    children = [];
  const evidence = await runGoPackage({
    packageName,
    env: { LC_ALL: "C" },
    timeoutMs: 2000,
    spawnImpl(executable, args, options) {
      const child = fakeChild();
      seen.push({ executable, args, options });
      children.push(child);
      if (children.length === 2)
        queueMicrotask(() => {
          const [converter, binary] = children;
          binary.stdout.write("binary-output");
          binary.stdout.end();
          binary.emit("close", 0);
          converter.stdout.end(json(events()));
          converter.emit("close", 0);
        });
      return child;
    },
  });
  assert.equal(evidence.status, "PASS");
  assert.deepEqual(
    seen.map((item) => item.executable),
    ["/tools/test2json", "/tools/postgres.test"],
  );
  assert.deepEqual(seen[0].args, ["-p", packageName]);
  assert.ok(seen[1].args.includes("-test.v=test2json"));
  assert.equal(seen[1].options.shell, false);
  assert.deepEqual(seen[1].options.env, { LC_ALL: "C" });
  assert.equal(children[0].stdin.read().toString(), "binary-output");
});
test("Go timeout kills both children and cannot validate a buffered PASS", async () => {
  const children = [];
  await assert.rejects(
    runGoPackage({
      packageName,
      env: {},
      timeoutMs: 20,
      spawnImpl() {
        const child = fakeChild();
        children.push(child);
        if (children.length === 1)
          queueMicrotask(() => child.stdout.write(json(events())));
        return child;
      },
    }),
    /FIXTURE_GO_CHANNEL/,
  );
  assert.deepEqual(
    children.map((child) => child.kills),
    [["SIGKILL"], ["SIGKILL"]],
  );
});
test("converter exit0 plus binary nonzero cannot PASS", async () => {
  const children = [];
  await assert.rejects(
    runGoPackage({
      packageName,
      env: {},
      timeoutMs: 1000,
      spawnImpl() {
        const child = fakeChild();
        children.push(child);
        if (children.length === 2)
          queueMicrotask(() => {
            children[0].stdout.end(json(events()));
            children[0].emit("close", 0);
            child.stdout.end();
            child.emit("close", 1);
          });
        return child;
      },
    }),
    /FIXTURE_GO_PROCESS/,
  );
});
test("missing direct-child close is bounded and never accepted as PASS", async () => {
  const children = [];
  await assert.rejects(
    runGoPackage({
      packageName,
      env: {},
      timeoutMs: 10,
      spawnImpl() {
        const child = fakeChild();
        child.kill = (signal) => {
          child.kills.push(signal);
          return false;
        };
        children.push(child);
        if (children.length === 1)
          queueMicrotask(() => child.stdout.write(json(events())));
        return child;
      },
    }),
    /FIXTURE_GO_CHANNEL/,
  );
  assert.deepEqual(
    children.map((child) => child.kills),
    [["SIGKILL"], ["SIGKILL"]],
  );
});
test("spawn failure cancels and reaps the already started converter", async () => {
  const converter = fakeChild();
  let calls = 0;
  await assert.rejects(
    runGoPackage({
      packageName,
      env: {},
      timeoutMs: 1000,
      spawnImpl() {
        if (++calls === 2) throw new Error("synthetic-secret");
        return converter;
      },
    }),
    /FIXTURE_GO_SPAWN/,
  );
  assert.deepEqual(converter.kills, ["SIGKILL"]);
});
test("postmaster lifetime may exceed five minutes but stops only after real close", async () => {
  const child = fakeChild();
  let seen;
  const server = startPostmaster({
    directory: "/fixture/primary",
    lifetimeMs: 1200000,
    spawnImpl(executable, args, options) {
      seen = { executable, args, options };
      return child;
    },
  });
  assert.equal(server.isRunning(), true);
  assert.equal(seen.executable, `${PG_BIN}/postgres`);
  assert.deepEqual(seen.args, ["-D", "/fixture/primary"]);
  child.stderr.write("ho_aaaaaaaaaaaaaaaa_1 42501 ERROR:  42501: secret\n");
  assert.match(server.readLogs(), /42501/);
  assert.equal((await server.stop()).connectionClosed, true);
  assert.equal(server.isRunning(), false);
  assert.deepEqual(child.kills, ["SIGINT"]);
});
test("postmaster expired lease and unobserved close remain failure", async () => {
  const child = fakeChild();
  const server = startPostmaster({
    directory: "/fixture/negative",
    lifetimeMs: 10,
    spawnImpl: () => child,
  });
  await delay(30);
  await assert.rejects(server.stop(), /FIXTURE_POSTMASTER_STOP/);
  assert.ok(child.kills.includes("SIGKILL"));
  assert.throws(
    () => startPostmaster({ directory: "/outside", lifetimeMs: 1000 }),
    /FIXTURE_POSTMASTER_REQUEST/,
  );
});

test("postmaster log snapshots bind a unique generation and preserve immutable cursors", async () => {
  const child = fakeChild();
  const server = startPostmaster({
    directory: "/fixture/primary",
    lifetimeMs: 1000,
    spawnImpl: () => child,
  });
  const before = server.logSnapshot();
  assert.deepEqual(Object.keys(before).sort(), [
    "evicted",
    "generation",
    "text",
  ]);
  assert.match(before.generation, /^[a-f0-9]{32}$/);
  assert.equal(Object.isFrozen(before), true);
  assert.equal(before.evicted, false);
  assert.equal(before.text, "");
  child.stderr.write("[unknown] 00000 LOG: bounded synthetic line\n");
  const after = server.logSnapshot();
  assert.equal(after.generation, before.generation);
  assert.equal(after.evicted, false);
  assert.equal(after.text, server.readLogs());
  assert.equal(before.text, "");
  await server.stop();
  const replacement = startPostmaster({
    directory: "/fixture/primary",
    lifetimeMs: 1000,
    spawnImpl: () => fakeChild(),
  });
  assert.notEqual(replacement.logSnapshot().generation, before.generation);
  await replacement.stop();
});

test("postmaster log eviction is sticky even after subsequent short log writes", async () => {
  const child = fakeChild();
  const server = startPostmaster({
    directory: "/fixture/primary",
    lifetimeMs: 1000,
    spawnImpl: () => child,
  });
  const before = server.logSnapshot();
  child.stderr.write("x".repeat(131073) + "\n");
  const evicted = server.logSnapshot();
  assert.equal(evicted.generation, before.generation);
  assert.equal(evicted.evicted, true);
  assert.ok(Buffer.byteLength(evicted.text) <= 131072);
  child.stderr.write("[unknown] 00000 LOG: later synthetic line\n");
  const later = server.logSnapshot();
  assert.equal(later.evicted, true);
  assert.equal(later.generation, before.generation);
  assert.ok(Buffer.byteLength(later.text) <= 131072);
  assert.equal(before.evicted, false);
  await server.stop();
});
test("native psql launches real fixed native argv with role-specific environment", async () => {
  let seen;
  const secrets = createPrivateRunSecrets();
  const executor = createNativePsqlExecutor({
    runId: run().runId,
    passwords: secrets.passwords,
    readLogs: async () => "",
    markOrphanRisk() {},
    start(options) {
      seen = options;
      return {
        closed: Promise.resolve({ ...exited, stdout: "1\n", elapsedMs: 1 }),
        cancel() {},
      };
    },
  });
  assert.equal(
    (
      await executor.psql({
        caseId: "native.test",
        role: "app",
        timeoutMs: 1000,
        inputSql: "SELECT 1;",
      })
    ).origin,
    "postgres",
  );
  assert.equal(seen.executable, `${PG_BIN}/psql`);
  assert.deepEqual(seen.args, [
    "-X",
    "-Atq",
    "-w",
    "--set=ON_ERROR_STOP=1",
    "--set=VERBOSITY=sqlstate",
  ]);
  assert.equal(seen.env.PGUSER, "hedefora_app");
  assert.equal(seen.env.PGPASSWORD, secrets.passwords.app);
  assert.equal(seen.env.PGSSLMODE, "verify-full");
  assert.equal(seen.env.PGPORT, "5432");
  assert.doesNotMatch(JSON.stringify(seen.args), /synthetic-|docker|exec/);
});
test("SSL-off witness is socket-only and never plaintext authenticated TCP", async () => {
  let seen;
  const executor = createNativePsqlExecutor({
    negative: true,
    runId: run().runId,
    passwords: createPrivateRunSecrets().passwords,
    readLogs: async () => "",
    markOrphanRisk() {},
    start(options) {
      seen = options;
      return {
        closed: Promise.resolve({ ...exited, stdout: "1\n", elapsedMs: 1 }),
        cancel() {},
      };
    },
  });
  await executor.psql({
    caseId: "negative.test",
    role: "admin",
    timeoutMs: 1000,
    inputSql: "SELECT 1;",
  });
  assert.equal(seen.env.PGHOST, "/fixture/negative");
  assert.equal(seen.env.PGPORT, "5433");
  assert.equal(seen.env.PGSSLMODE, "disable");
});
async function runNativeErrorWithLog(renderLog) {
  let logs = "",
    application;
  const executor = createNativePsqlExecutor({
    runId: run().runId,
    passwords: createPrivateRunSecrets().passwords,
    readLogs: async () => logs,
    markOrphanRisk() {},
    start(options) {
      application = options.env.PGAPPNAME;
      setTimeout(() => {
        logs = renderLog(application);
      }, 20);
      return {
        closed: Promise.resolve({
          ...exited,
          rawExit: 1,
          stdout: "",
          stderr: "wrong 23505",
          elapsedMs: 1,
        }),
        cancel() {},
      };
    },
  });
  return executor.psql({
    caseId: "native.late-error",
    role: "app",
    timeoutMs: 1000,
    inputSql: "SELECT 1;",
  });
}
test("native error waits for an independently delivered matching verbose postmaster log", async () => {
  const result = await runNativeErrorWithLog(
    (application) =>
      `${application} 42501 [fixture:hedefora_app:hedefora_dev] ERROR:  42501: synthetic-secret\n`,
  );
  assert.equal(result.origin, "postgres");
  assert.equal(result.sqlState, "42501");
  assert.doesNotMatch(JSON.stringify(result), /synthetic-|23505/);
});
for (const [name, renderLog] of [
  [
    "missing verbose body state",
    (application) =>
      `${application} 42501 [fixture:hedefora_app:hedefora_dev] ERROR: synthetic-secret\n`,
  ],
  [
    "mismatched verbose body state",
    (application) =>
      `${application} 42501 [fixture:hedefora_app:hedefora_dev] ERROR:  28P01: synthetic-secret\n`,
  ],
])
  test(`native error rejects ${name} as PostgreSQL evidence`, async () => {
    const result = await runNativeErrorWithLog(renderLog);
    assert.equal(result.origin, "channel");
    assert.equal(result.sqlState, null);
    assert.doesNotMatch(JSON.stringify(result), /synthetic-|23505/);
  });
test("fixed PG configs retain redaction and durable engine semantics", () => {
  assert.match(postgresConfiguration(false), /ssl = on/);
  assert.match(postgresConfiguration(true), /ssl = off/);
  for (const text of [
    postgresConfiguration(false),
    postgresConfiguration(true),
  ]) {
    assert.match(text, /log_min_error_statement = 'panic'/);
    assert.match(text, /log_parameter_max_length_on_error = 0/);
    assert.ok(text.includes("log_line_prefix = '%a %e [fixture:%u:%d] '"));
    assert.ok(text.includes("log_error_verbosity = 'verbose'"));
    assert.ok(text.includes("log_connections = off"));
    assert.match(text, /fsync = on/);
    assert.match(text, /password_encryption = 'scram-sha-256'/);
  }
});
test("direct CLI outside the admitted PID1 container rejects without leaking synthetic environment", async () => {
  const result = await command({
    executable: process.execPath,
    args: [fileURLToPath(new URL("./fixture-container.mjs", import.meta.url))],
    env: {
      PGPASSWORD: "synthetic-pg17-private-value",
      TOKEN: "synthetic-control-private-value",
    },
    timeoutMs: 5000,
  });
  assert.equal(result.rawExit, 1);
  assert.equal(result.stderr, "");
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.status, "FAIL");
  assert.equal(receipt.code, "FIXTURE_ENTRYPOINT");
  assert.doesNotMatch(result.stdout, /synthetic-|PRIVATE KEY|PGPASSWORD|TOKEN/);
});

const diagnosticSource =
  'package postgres\nfunc witness() {\n\tt.Fatal("static assertion")\n\tt.Error("static cleanup")\n}\n';
const diagnosticSites = collectGoAssertionSites(packageName, diagnosticSource);
const failedReport = (name = GO_PACKAGES[packageName][0]) =>
  `\x16--- FAIL: ${name} (0.01s)\n`;
const assertionReport = (
  message = "static assertion",
  file = "pool_integration_test.go",
) => `    ${file}:999: ${message}\n`;
const diagnosticOutput = assertionReport() + failedReport();
const unknownDiagnostic = {
  assertionLine: "UNKNOWN",
  caseId: "go.postgres.unknown",
};

test("Go diagnostic dictionary uses exact public literal source lines, not reported helper call sites", () => {
  assert.deepEqual(diagnosticSites, [
    { message: "static assertion", line: 3 },
    { message: "static cleanup", line: 4 },
  ]);
  assert.ok(Object.isFrozen(diagnosticSites));
  assert.ok(diagnosticSites.every(Object.isFrozen));
  for (const output of [
    diagnosticOutput,
    "\x16" + diagnosticOutput,
    diagnosticOutput.replaceAll("\n", "\r\n"),
  ])
    assert.deepEqual(
      classifyGoFailure(packageName, output, "", diagnosticSites),
      {
        assertionLine: "3",
        caseId: "go.postgres.tls-scram",
      },
    );
});
test("Go diagnostic dictionary ignores comments and raw-string pseudo assertions", () => {
  const source = [
    "package postgres",
    '// t.Fatal("comment assertion")',
    "var query = `SELECT",
    't.Fatal("raw assertion")',
    "`",
    "func witness() {",
    '\tt.Fatal("actual assertion")',
    "}",
    "",
  ].join("\n");
  assert.deepEqual(collectGoAssertionSites(packageName, source), [
    { message: "actual assertion", line: 7 },
  ]);
});
for (const [name, source] of [
  [
    "unknown package",
    diagnosticSource.replace("package postgres", "package app"),
  ],
  ["missing package", diagnosticSource.replace("package postgres", "")],
  ["duplicate package", "package postgres\n" + diagnosticSource],
  [
    "block comment",
    diagnosticSource + '/*\nt.Fatal("comment assertion")\n*/\n',
  ],
  ["dynamic call", diagnosticSource + "t.Fatal(value)\n"],
  ["spaced call", diagnosticSource + 't.Fatal ("static assertion")\n'],
  [
    "inline call",
    diagnosticSource + 'if condition { t.Fatal("static assertion") }\n',
  ],
  ["formatted call", diagnosticSource + 't.Fatalf("static %s", value)\n'],
  ["partial call", diagnosticSource + 't.Error("partial"\n'],
  ["extra argument", diagnosticSource + 't.Error("static assertion", value)\n'],
  ["Go escape", diagnosticSource + 't.Fatal("escaped\\nvalue")\n'],
  ["JSON-only escape", diagnosticSource + 't.Fatal("invalid\\/value")\n'],
  ["trailing expression", diagnosticSource + 't.Fatal("value"); dangerous()\n'],
  ["unclosed raw string", diagnosticSource + "var value = `unfinished\n"],
  ["oversized source", diagnosticSource + " ".repeat(131073)],
  ["too many source lines", diagnosticSource + "\n".repeat(2000)],
])
  test(`Go diagnostic dictionary fails closed for ${name}`, () => {
    assert.deepEqual(collectGoAssertionSites(packageName, source), []);
  });
test("Go diagnostic literal duplicates and malformed dictionaries cannot produce an assertion line", () => {
  const duplicate = collectGoAssertionSites(
    packageName,
    diagnosticSource + 't.Fatal("static assertion")\n',
  );
  for (const sites of [
    duplicate,
    [],
    null,
    [{ message: "static assertion", line: 0 }],
    [{ message: "static assertion", line: 2001 }],
  ])
    assert.equal(
      classifyGoFailure(packageName, diagnosticOutput, "", sites).assertionLine,
      "UNKNOWN",
    );
});
for (const message of [
  "static assertion suffix",
  "prefix static assertion",
  " static assertion",
  "static assertion ",
  "dynamic private token",
  "static assertio",
])
  test(`Go assertion matching is literal equality: ${JSON.stringify(message)}`, () => {
    assert.equal(
      classifyGoFailure(
        packageName,
        assertionReport(message) + failedReport(),
        "",
        diagnosticSites,
      ).assertionLine,
      "UNKNOWN",
    );
  });
test("Go diagnostic cases are restricted to the six package-qualified top-level tests", () => {
  const expected = [
    "tls-scram",
    "tls-auth-failures",
    "ambient-discovery",
    "pool-capacity",
    "query-cancel",
  ];
  GO_PACKAGES[packageName].forEach((name, index) => {
    assert.equal(
      classifyGoFailure(packageName, failedReport(name), "").caseId,
      `go.postgres.${expected[index]}`,
    );
  });
  const appPackage = packages[1],
    name = GO_PACKAGES[appPackage][0];
  const source = 'package app\nt.Fatal("app assertion")\n';
  assert.deepEqual(
    classifyGoFailure(
      appPackage,
      assertionReport("app assertion", "api_integration_test.go") +
        failedReport(name),
      "",
      collectGoAssertionSites(appPackage, source),
    ),
    {
      assertionLine: "2",
      caseId: "go.app.startup-recovery",
    },
  );
  assert.deepEqual(
    classifyGoFailure(
      "untrusted-package",
      diagnosticOutput,
      "",
      diagnosticSites,
    ),
    { assertionLine: "UNKNOWN", caseId: "go.unknown.unknown" },
  );
});
for (const [name, stdout, stderr] of [
  ["unmarked FAIL", diagnosticOutput.replace("\x16", ""), ""],
  ["duplicate top FAIL", diagnosticOutput + failedReport(), ""],
  [
    "multiple top FAIL",
    diagnosticOutput + failedReport(GO_PACKAGES[packageName][1]),
    "",
  ],
  [
    "unknown top FAIL",
    assertionReport() + failedReport("TestPG17Untrusted"),
    "",
  ],
  [
    "wrong package test",
    assertionReport() + failedReport(GO_PACKAGES[packages[1]][0]),
    "",
  ],
  [
    "subtest alone",
    assertionReport() + failedReport(GO_PACKAGES[packageName][0] + "/child"),
    "",
  ],
  ["partial stdout", diagnosticOutput.slice(0, -1), ""],
  ["partial stderr", diagnosticOutput, "partial private token"],
  ["split streams", diagnosticOutput.slice(0, -1), "\n"],
  ["stderr FAIL", assertionReport(), failedReport()],
  [
    "wrong assertion file",
    assertionReport("static assertion", "api_integration_test.go") +
      failedReport(),
    "",
  ],
  [
    "unapproved path",
    assertionReport().replace("pool_integration", "/private/pool_integration") +
      failedReport(),
    "",
  ],
  [
    "additional foreign assertion",
    diagnosticOutput + "    another_test.go:100: private assertion\n",
    "",
  ],
  ["reported line bound", diagnosticOutput.replace(":999:", ":2001:"), ""],
  ["malformed frame", diagnosticOutput.replace("    pool", "pool"), ""],
  ["unknown duration", diagnosticOutput.replace("0.01s", "NaNs"), ""],
  ["oversized output", diagnosticOutput + " ".repeat(1048576) + "\n", ""],
])
  test(`Go failure diagnostic rejects ${name}`, () => {
    assert.deepEqual(
      classifyGoFailure(packageName, stdout, stderr, diagnosticSites),
      unknownDiagnostic,
    );
  });
test("Go diagnostic does not expose subtests or choose among multiple assertion candidates", () => {
  const subtest = failedReport(
    GO_PACKAGES[packageName][0] + "/private-subtest",
  );
  assert.deepEqual(
    classifyGoFailure(
      packageName,
      assertionReport() + subtest + failedReport(),
      "",
      diagnosticSites,
    ),
    {
      assertionLine: "3",
      caseId: "go.postgres.tls-scram",
    },
  );
  for (const [stdout, stderr] of [
    [diagnosticOutput + assertionReport("static cleanup"), ""],
    [diagnosticOutput, assertionReport("static cleanup")],
  ])
    assert.deepEqual(
      classifyGoFailure(packageName, stdout, stderr, diagnosticSites),
      {
        assertionLine: "UNKNOWN",
        caseId: "go.postgres.tls-scram",
      },
    );
  assert.doesNotMatch(
    JSON.stringify(
      classifyGoFailure(
        packageName,
        assertionReport("synthetic-private-token") + subtest + failedReport(),
        "",
        diagnosticSites,
      ),
    ),
    /private|token|static assertion|\.go|999|message|stdout|stderr/,
  );
});
test("Go diagnostic dictionaries recognize both current fixed public source files", async () => {
  for (const [pkg, relative, expectedLine] of [
    [
      packages[0],
      "../../../../internal/platform/postgres/pool_integration_test.go",
      52,
    ],
    [
      packages[1],
      "../../../../internal/platform/app/api_integration_test.go",
      53,
    ],
  ]) {
    const source = await readFile(new URL(relative, import.meta.url), "utf8");
    const sites = collectGoAssertionSites(pkg, source);
    assert.ok(sites.length > 20);
    assert.equal(
      sites.find(
        (site) => site.message === "PG17_INTEGRATION_ADMISSION_REQUIRED",
      )?.line,
      expectedLine,
    );
  }
});
test("Go diagnostic package allowlist excludes inherited object properties", () => {
  for (const name of ["constructor", "toString", "__proto__"]) {
    assert.deepEqual(collectGoAssertionSites(name, diagnosticSource), []);
    assert.deepEqual(
      classifyGoFailure(name, diagnosticOutput, "", diagnosticSites),
      {
        assertionLine: "UNKNOWN",
        caseId: "go.unknown.unknown",
      },
    );
  }
});

async function diagnosticProcessFailure(scenario, timeoutMs = 1000) {
  const children = [];
  let failure;
  try {
    await runGoPackage({
      packageName,
      env: {},
      timeoutMs,
      spawnImpl() {
        const child = fakeChild();
        children.push(child);
        if (children.length === 2)
          queueMicrotask(() => scenario(children[0], children[1]));
        return child;
      },
    });
    assert.fail("failed Go execution must not PASS");
  } catch (error) {
    failure = error;
  }
  assert.match(failure.code, /^FIXTURE_GO_/);
  assert.doesNotMatch(
    JSON.stringify(failure),
    /static assertion|synthetic-private|pool_integration|PRIVATE KEY|Output|stdout|stderr/,
  );
  return { failure, children };
}
function primeDiagnosticOutput(converter, binary) {
  converter.stdout.write(json([{ Action: "start", Package: packageName }]));
  binary.stdout.write(diagnosticOutput);
}
test("failed binary raw text survives converter cancellation without changing its immediate reap", async () => {
  const { failure, children } = await diagnosticProcessFailure(
    (converter, binary) => {
      primeDiagnosticOutput(converter, binary);
      binary.stdout.end();
      binary.stderr.end();
      binary.emit("close", 1);
    },
  );
  assert.match(
    failure.code,
    /^FIXTURE_GO_PROCESS_P_B1_CUNKNOWN_BC_CC_LUNKNOWN$/,
  );
  assert.equal(failure.caseId, "go.postgres.tls-scram");
  assert.deepEqual(
    children.map((child) => child.kills),
    [["SIGKILL"], []],
  );
});
for (const [name, malformedStream] of [
  ["stderr", "stderr"],
  ["stdout", "stdout"],
])
  test(`malformed UTF-8 in private ${name} invalidates both diagnostic streams`, async () => {
    const { failure } = await diagnosticProcessFailure((converter, binary) => {
      if (malformedStream === "stdout") {
        converter.stdout.write(
          json([{ Action: "start", Package: packageName }]),
        );
        binary.stdout.write(failedReport());
        binary.stderr.write(assertionReport());
      } else primeDiagnosticOutput(converter, binary);
      binary[malformedStream].write(Buffer.from([0xff]));
      binary[malformedStream].write("\n");
      binary.stdout.end();
      binary.stderr.end();
      binary.emit("close", 1);
    });
    assert.match(failure.code, /^FIXTURE_GO_PROCESS_.*_LUNKNOWN$/);
    assert.equal(failure.caseId, "go.postgres.unknown");
  });
for (const [name, scenario] of [
  [
    "private aggregate overflow",
    (converter, binary) => {
      primeDiagnosticOutput(converter, binary);
      binary.stdout.write(Buffer.alloc(600000, 0x61));
      binary.stderr.write(Buffer.alloc(600000, 0x62));
    },
  ],
  [
    "all-stream output overflow",
    (converter, binary) => {
      primeDiagnosticOutput(converter, binary);
      converter.stdout.write(Buffer.alloc(2097153, 0x61));
    },
  ],
  [
    "converter output overflow",
    (converter, binary) => {
      primeDiagnosticOutput(converter, binary);
      converter.stdout.write(Buffer.alloc(1048577, 0x61));
    },
  ],
  [
    "converter stderr",
    (converter, binary) => {
      primeDiagnosticOutput(converter, binary);
      converter.stderr.write("synthetic-private-converter-failure\n");
    },
  ],
  [
    "converter channel error",
    (converter, binary) => {
      primeDiagnosticOutput(converter, binary);
      converter.stdin.emit("error", new Error("synthetic-private-channel"));
    },
  ],
  [
    "binary channel error",
    (converter, binary) => {
      primeDiagnosticOutput(converter, binary);
      binary.stderr.emit("error", new Error("synthetic-private-channel"));
    },
  ],
])
  test(`earlier apparent failure yields no hint after ${name}`, async () => {
    const { failure, children } = await diagnosticProcessFailure(scenario);
    assert.match(
      failure.code,
      /^FIXTURE_GO_CHANNEL_P_BUNKNOWN_CUNKNOWN_.*_LUNKNOWN$/,
    );
    assert.equal(failure.caseId, "go.postgres.unknown");
    assert.deepEqual(
      children.map((child) => child.kills),
      [["SIGKILL"], ["SIGKILL"]],
    );
  });
test("converter-driven binary cancellation cannot authorize an earlier diagnostic assertion", async () => {
  const { failure, children } = await diagnosticProcessFailure(
    (converter, binary) => {
      primeDiagnosticOutput(converter, binary);
      binary.kill = (signal) => {
        binary.kills.push(signal);
        queueMicrotask(() => {
          binary.stdout.end();
          binary.stderr.end();
          binary.emit("close", 1);
        });
        return true;
      };
      converter.stdout.end();
      converter.stderr.end();
      converter.emit("close", 1);
    },
  );
  assert.match(failure.code, /^FIXTURE_GO_PROCESS_P_B1_C1_BC_CC_LUNKNOWN$/);
  assert.equal(failure.caseId, "go.postgres.unknown");
  assert.deepEqual(
    children.map((child) => child.kills),
    [[], ["SIGKILL"]],
  );
});
test("timeout with synthetic close0 never becomes raw exit0 or a diagnostic hint", async () => {
  const { failure } = await diagnosticProcessFailure((converter, binary) => {
    primeDiagnosticOutput(converter, binary);
    for (const child of [converter, binary])
      child.kill = (signal) => {
        child.kills.push(signal);
        queueMicrotask(() => {
          child.stdout.end();
          child.stderr.end();
          child.emit("close", 0);
        });
        return true;
      };
  }, 20);
  assert.equal(
    failure.code,
    "FIXTURE_GO_CHANNEL_P_BUNKNOWN_CUNKNOWN_BC_CC_LUNKNOWN",
  );
  assert.equal(failure.caseId, "go.postgres.unknown");
});
test("unobserved binary close cannot use apparently complete diagnostic text", async () => {
  const { failure } = await diagnosticProcessFailure((converter, binary) => {
    primeDiagnosticOutput(converter, binary);
    converter.stdout.end();
    converter.stderr.end();
    converter.emit("close", 0);
    binary.kill = (signal) => {
      binary.kills.push(signal);
      return false;
    };
  }, 10);
  assert.equal(failure.code, "FIXTURE_GO_CHANNEL_P_BUNKNOWN_C0_BM_CC_LUNKNOWN");
  assert.equal(failure.caseId, "go.postgres.unknown");
});
test("binary raw exit0 cannot authorize failure-like diagnostic text", async () => {
  const { failure } = await diagnosticProcessFailure((converter, binary) => {
    primeDiagnosticOutput(converter, binary);
    binary.stdout.end();
    binary.stderr.end();
    binary.emit("close", 0);
    converter.stdout.end();
    converter.stderr.end();
    converter.emit("close", 1);
  });
  assert.match(failure.code, /^FIXTURE_GO_PROCESS_P_B0_C1_BC_CC_LUNKNOWN$/);
  assert.equal(failure.caseId, "go.postgres.unknown");
});
for (const [rawExit, rawToken, caseId] of [
  [255, "255", "go.postgres.tls-scram"],
  [256, "UNKNOWN", "go.postgres.unknown"],
  [-1, "UNKNOWN", "go.postgres.unknown"],
  ["1", "UNKNOWN", "go.postgres.unknown"],
])
  test(`Go diagnostic exit tokens enforce numeric bounds for ${JSON.stringify(rawExit)}`, async () => {
    const { failure } = await diagnosticProcessFailure((converter, binary) => {
      primeDiagnosticOutput(converter, binary);
      binary.stdout.end();
      binary.stderr.end();
      binary.emit("close", rawExit);
    });
    assert.equal(
      failure.code,
      `FIXTURE_GO_PROCESS_P_B${rawToken}_CUNKNOWN_BC_CC_LUNKNOWN`,
    );
    assert.equal(failure.caseId, caseId);
  });
