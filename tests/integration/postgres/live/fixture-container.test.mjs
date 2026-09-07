import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { GO_IMAGE, createPrivateRunSecrets } from "./live-runtime.mjs";
import { command } from "./process.mjs";
import { createNativePsqlExecutor, PG_BIN } from "./fixture-native-psql.mjs";
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
} from "./fixture-container.mjs";

const now = Date.parse("2026-09-07T12:00:00.000Z");
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
  child.stderr.write("ho_aaaaaaaaaaaaaaaa_1 42501 ERROR: secret\n");
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
test("native error waits for independently delivered matching postmaster log", async () => {
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
        logs = `${application} 42501 ERROR: synthetic-secret\n`;
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
  const result = await executor.psql({
    caseId: "native.late-error",
    role: "app",
    timeoutMs: 1000,
    inputSql: "SELECT 1;",
  });
  assert.equal(result.origin, "postgres");
  assert.equal(result.sqlState, "42501");
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
