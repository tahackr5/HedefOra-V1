import test from "node:test";
import assert from "node:assert/strict";
import {
  fixtureCreateArgs,
  verifyFixtureInspect,
  verifyFixtureImageInspect,
  verifyFixtureReceipt,
  FIXTURE_SQL_CASES,
} from "./fixture-host-policy.mjs";
import {
  FIXTURE_IMAGE,
  GO_PACKAGES,
  ROLES_SHA256,
} from "./fixture-container.mjs";
import { UP_SHA256, DOWN_SHA256 } from "../live-sql.mjs";

const IMAGE_LABELS = {
  "org.opencontainers.image.authors": "The CloudNativePG Contributors",
  "org.opencontainers.image.base.digest":
    "sha256:d7e12182ce18b85b93007c1dedf31f2d29e01ccf3182cc4017c709b6259bc132",
  "org.opencontainers.image.base.name": "docker.io/library/debian:trixie-slim",
  "org.opencontainers.image.created": "2026-08-31T08:16:04Z",
  "org.opencontainers.image.description":
    "A minimal PostgreSQL 17.11 container image",
  "org.opencontainers.image.documentation":
    "https://github.com/cloudnative-pg/postgres-containers",
  "org.opencontainers.image.licenses": "Apache-2.0",
  "org.opencontainers.image.revision":
    "9f65985cea224d41cfd1866b74f005c520e8a1e1",
  "org.opencontainers.image.source":
    "https://github.com/cloudnative-pg/postgres-containers",
  "org.opencontainers.image.title": "CloudNativePG PostgreSQL 17.11 minimal",
  "org.opencontainers.image.url":
    "https://github.com/cloudnative-pg/postgres-containers",
  "org.opencontainers.image.vendor": "The CloudNativePG Contributors",
  "org.opencontainers.image.version": "17.11",
};
const ENV = [
  "PATH=/usr/lib/postgresql/17/bin:/usr/bin:/bin",
  "HOME=/nonexistent",
  "TMPDIR=/fixture",
  "LC_ALL=C",
  "LANG=C.UTF-8",
  "TZ=UTC",
];
const SCRIPT = "/source/tests/integration/postgres/live/fixture-container.mjs";
const ZERO = "0001-01-01T00:00:00Z";
function run() {
  const now = Date.now();
  return {
    schema: "hedefora.pg17.fixture-run.v1",
    runId: "1".repeat(32),
    sourceCommit: "2".repeat(40),
    sourceTree: "3".repeat(40),
    imageManifestDigest: FIXTURE_IMAGE.manifest,
    imageConfigDigest: FIXTURE_IMAGE.config,
    approvalSha256: "4".repeat(64),
    bundleSha256: "5".repeat(64),
    issuedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 1190000).toISOString(),
  };
}
function sample(phase = "created") {
  const value = run(),
    name = `hedefora-pg17-fixture-${value.runId}`,
    id = "a".repeat(64);
  const mountSources = {
    "/source": "/task/source",
    "/tools": "/task/tools",
    "/input": "/task/input",
  };
  const inspect = [
    {
      Id: id,
      Name: `/${name}`,
      Image: FIXTURE_IMAGE.manifest,
      Path: "/tools/node",
      Args: [SCRIPT],
      RestartCount: 0,
      Created: new Date(Date.parse(value.issuedAt) + 10).toISOString(),
      Config: {
        Image: FIXTURE_IMAGE.manifest,
        User: "26:102",
        WorkingDir: "/source",
        Entrypoint: ["/tools/node"],
        Cmd: [SCRIPT],
        Env: ENV,
        Labels: {
          ...IMAGE_LABELS,
          "io.hedefora.pg17.fixture.run": value.runId,
          "io.hedefora.pg17.fixture.source": value.sourceCommit,
          "io.hedefora.pg17.fixture.approval": value.approvalSha256,
          "io.hedefora.pg17.fixture.scope": "local-ci-test-only",
        },
        Hostname: "fixture",
        Domainname: "",
        Tty: false,
        OpenStdin: false,
        StdinOnce: false,
        AttachStdin: false,
        StopSignal: "SIGTERM",
        StopTimeout: 5,
        Volumes: null,
        ExposedPorts: null,
      },
      HostConfig: {
        Privileged: false,
        ReadonlyRootfs: true,
        CapDrop: ["ALL"],
        CapAdd: null,
        GroupAdd: null,
        SecurityOpt: ["no-new-privileges"],
        NetworkMode: "none",
        PidMode: "",
        IpcMode: "private",
        CgroupnsMode: "private",
        UTSMode: "",
        UsernsMode: "",
        PortBindings: {},
        PublishAllPorts: false,
        AutoRemove: false,
        Devices: [],
        DeviceRequests: null,
        DeviceCgroupRules: null,
        Links: null,
        ExtraHosts: null,
        VolumesFrom: null,
        Binds: null,
        Dns: [],
        DnsOptions: [],
        DnsSearch: [],
        RestartPolicy: { Name: "no", MaximumRetryCount: 0 },
        LogConfig: {
          Type: "json-file",
          Config: { "max-size": "1m", "max-file": "1" },
        },
        Memory: 1610612736,
        MemorySwap: 1610612736,
        NanoCpus: 2000000000,
        PidsLimit: 256,
        ShmSize: 134217728,
        MemoryReservation: 0,
        CpuPeriod: 0,
        CpuQuota: 0,
        CpuRealtimePeriod: 0,
        CpuRealtimeRuntime: 0,
        CpusetCpus: "",
        CpusetMems: "",
        OomKillDisable: false,
        Tmpfs: {
          "/fixture":
            "rw,noexec,nosuid,nodev,size=512m,mode=0700,uid=26,gid=102",
          "/tmp": "rw,noexec,nosuid,nodev,size=64m,mode=0700,uid=26,gid=102",
        },
        Mounts: Object.entries(mountSources).map(([Target, Source]) => ({
          Type: "bind",
          Source,
          Target,
          ReadOnly: true,
          BindOptions: { Propagation: "rprivate" },
        })),
      },
      Mounts: Object.entries(mountSources).map(([Destination, Source]) => ({
        Type: "bind",
        Source,
        Destination,
        RW: false,
        Propagation: "rprivate",
        Mode: "",
      })),
      NetworkSettings: {
        Ports: {},
        Networks: {
          none: {
            IPAddress: "",
            Gateway: "",
            MacAddress: "",
            IPPrefixLen: 0,
            GlobalIPv6Address: "",
            GlobalIPv6PrefixLen: 0,
            IPv6Gateway: "",
            Aliases: null,
            Links: null,
            IPAMConfig: null,
            DriverOpts: null,
          },
        },
      },
      State: {
        Status: phase,
        Running: phase === "running",
        Paused: false,
        Restarting: false,
        OOMKilled: false,
        Dead: false,
        Error: "",
        ExitCode: 0,
        Pid: phase === "running" ? 9876 : 0,
        StartedAt:
          phase === "created"
            ? ZERO
            : new Date(Date.parse(value.issuedAt) + 20).toISOString(),
        FinishedAt:
          phase === "exited"
            ? new Date(Date.parse(value.issuedAt) + 30).toISOString()
            : ZERO,
      },
    },
  ];
  return { inspect, options: { run: value, name, id, mountSources, phase } };
}
function receipt(value) {
  return {
    schema: "hedefora.pg17.fixture-result.v1",
    status: "PASS",
    ...Object.fromEntries(
      [
        "runId",
        "sourceCommit",
        "sourceTree",
        "imageManifestDigest",
        "imageConfigDigest",
        "approvalSha256",
        "bundleSha256",
      ].map((key) => [key, value[key]]),
    ),
    isolation: {
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
    },
    bootstrap: {
      status: "PASS",
      serverVersionNum: 170011,
      rolesSha256: ROLES_SHA256,
      localeProvider: "builtin",
      locale: "C.UTF-8",
      encoding: "UTF8",
      dataChecksums: true,
      primaryAuth: "scram-sha-256",
      primaryTLS: true,
      negativeTLS: false,
    },
    sqlEvidence: {
      scope: "actual-postgresql-engine-sql-only",
      status: "PASS",
      serverVersionNum: 170011,
      sourceSha256: { up: UP_SHA256, down: DOWN_SHA256 },
      cases: FIXTURE_SQL_CASES.map((item) => ({
        status: "PASS",
        ...Object.fromEntries(
          Object.entries(item).map(([key, wanted]) =>
            key === "states"
              ? ["sqlState", wanted[0]]
              : [key, Array.isArray(wanted) ? wanted[0] : wanted],
          ),
        ),
      })),
    },
    goEvidence: {
      status: "PASS",
      goVersion: "go1.26.7",
      race: true,
      integration: true,
      packages: Object.entries(GO_PACKAGES).map(([packageName, names]) => ({
        package: packageName,
        status: "PASS",
        requiredTests: [...names],
        packagePass: true,
        binaryExit: 0,
        converterExit: 0,
        skipped: 0,
        failed: 0,
      })),
    },
    cleanup: { status: "PASS", postmasters: 2, hostRemoval: "NOT_OBSERVED" },
  };
}

test("fixture create is manifest-ID-only, network none, capability-free and three readonly binds", () => {
  const { options } = sample();
  const args = fixtureCreateArgs({
    ...options,
    sourceDirectory: "/task/source",
    toolsDirectory: "/task/tools",
    inputDirectory: "/task/input",
  });
  assert.deepEqual(args.slice(-3), [
    "--entrypoint=/tools/node",
    FIXTURE_IMAGE.manifest,
    SCRIPT,
  ]);
  for (const flag of [
    "--pull=never",
    "--network=none",
    "--user=26:102",
    "--cap-drop=ALL",
    "--read-only",
    "--security-opt=no-new-privileges",
    "--memory=1536m",
    "--memory-swap=1536m",
    "--cpus=2",
    "--pids-limit=256",
    "--ipc=private",
  ])
    assert.ok(args.includes(flag), flag);
  assert.equal(args.filter((arg) => arg === "--mount").length, 3);
  assert.equal(args.filter((arg) => arg === "--tmpfs").length, 2);
  assert.equal(args.filter((arg) => arg === "--env").length, 6);
  assert.ok(
    !args.some((arg) =>
      /^--(publish|volume|cap-add|privileged|group-add|device)(=|$)/.test(arg),
    ),
  );
});
test("fixture create rejects expired lease, foreign name, mount overlap and delimiter/path aliases", () => {
  const { options } = sample();
  const request = {
    ...options,
    sourceDirectory: "/task/source",
    toolsDirectory: "/task/tools",
    inputDirectory: "/task/input",
  };
  for (const sourceDirectory of [
    "/",
    "../source",
    "/task/../source",
    "/task/source/",
    "/task/source,readonly=false",
    "/task/source\n",
    "C:/",
    "C:/task/../source",
    "C://task/source",
    "C:\\task\\source",
    "//server/share",
    "/task/source//child",
  ])
    assert.throws(
      () => fixtureCreateArgs({ ...request, sourceDirectory }),
      /FIXTURE_/,
    );
  assert.throws(
    () =>
      fixtureCreateArgs({ ...request, toolsDirectory: "/task/source/tools" }),
    /OVERLAP/,
  );
  assert.throws(
    () => fixtureCreateArgs({ ...request, name: "foreign" }),
    /NAME/,
  );
  assert.throws(
    () =>
      fixtureCreateArgs({
        ...request,
        run: {
          ...request.run,
          expiresAt: new Date(Date.now() - 1).toISOString(),
        },
      }),
    /LEASE/,
  );
  assert.ok(
    fixtureCreateArgs({
      ...request,
      sourceDirectory: "C:/task/source directory",
    }).includes(
      "type=bind,src=C:/task/source directory,dst=/source,readonly,bind-propagation=rprivate",
    ),
  );
});
test("actual inspect must match all three real lifecycle phases", () => {
  for (const phase of ["created", "running", "exited"]) {
    const { inspect, options } = sample(phase);
    assert.equal(
      verifyFixtureInspect(inspect, options).authority,
      "host-docker-inspect",
    );
  }
});
test("Docker privilege, namespace, devices, resources and environment mutations are rejected", () => {
  const mutations = [
    (v) => (v.HostConfig.Privileged = true),
    (v) => (v.HostConfig.ReadonlyRootfs = false),
    (v) => (v.HostConfig.CapDrop = []),
    (v) => (v.HostConfig.CapAdd = ["NET_ADMIN"]),
    (v) => (v.HostConfig.GroupAdd = ["0"]),
    (v) => v.HostConfig.SecurityOpt.push("seccomp=unconfined"),
    (v) => (v.HostConfig.SecurityOpt = []),
    (v) => (v.HostConfig.NetworkMode = "bridge"),
    (v) => (v.HostConfig.PidMode = "host"),
    (v) => (v.HostConfig.IpcMode = "host"),
    (v) => (v.HostConfig.CgroupnsMode = "host"),
    (v) => (v.HostConfig.UTSMode = "host"),
    (v) => (v.HostConfig.UsernsMode = "host"),
    (v) => (v.HostConfig.PortBindings = { "5432/tcp": [{ HostPort: "5432" }] }),
    (v) => (v.HostConfig.PublishAllPorts = true),
    (v) => (v.HostConfig.Devices = [{ PathOnHost: "/dev/mem" }]),
    (v) => (v.HostConfig.DeviceRequests = [{}]),
    (v) => (v.HostConfig.DeviceCgroupRules = ["a *:* rwm"]),
    (v) => (v.HostConfig.Memory = 0),
    (v) => (v.HostConfig.MemorySwap = -1),
    (v) => (v.HostConfig.PidsLimit = -1),
    (v) => (v.HostConfig.NanoCpus = 0),
    (v) => v.HostConfig.ShmSize++,
    (v) => (v.HostConfig.OomKillDisable = true),
    (v) => (v.HostConfig.RestartPolicy.Name = "always"),
    (v) => (v.HostConfig.AutoRemove = true),
    (v) => (v.HostConfig.Init = true),
    (v) => (v.Config.Env = [...v.Config.Env, "PGPASSWORD=forbidden"]),
    (v) => (v.Config.User = "0:0"),
    (v) => (v.Config.Cmd = ["/bin/sh"]),
    (v) => (v.Config.Volumes = { "/data": {} }),
    (v) => (v.Config.Healthcheck = { Test: ["CMD", "sh"] }),
    (v) => (v.HostConfig.LogConfig.Config["max-size"] = "100g"),
    (v) => (v.HostConfig.ExtraHosts = ["host:host-gateway"]),
  ];
  for (const mutate of mutations) {
    const { inspect, options } = sample();
    mutate(inspect[0]);
    assert.throws(
      () => verifyFixtureInspect(inspect, options),
      /FIXTURE_/,
      mutate.toString(),
    );
  }
});
test("actual and configured mount closed inventories reject writable, hidden and translated sources", () => {
  const mutations = [
    (v) =>
      v.Mounts.push({
        Type: "bind",
        Source: "/var/run/docker.sock",
        Destination: "/socket",
        RW: true,
      }),
    (v) => (v.Mounts[0].RW = true),
    (v) => (v.Mounts[0].Type = "volume"),
    (v) => (v.Mounts[0].Source = "/foreign/source"),
    (v) => (v.Mounts[0].Source = "/run/desktop/mnt/host/c/task/source"),
    (v) => (v.Mounts[0].Propagation = "rshared"),
    (v) => (v.Mounts[0].Name = "anonymous"),
    (v) => (v.HostConfig.Mounts[0].ReadOnly = false),
    (v) => (v.HostConfig.Mounts[0].BindOptions.NonRecursive = true),
    (v) => (v.HostConfig.Mounts[0].Consistency = "delegated"),
    (v) => (v.HostConfig.Tmpfs["/fixture"] = "rw,exec,size=512m"),
    (v) => (v.HostConfig.Tmpfs["/extra"] = "rw"),
    (v) => (v.HostConfig.Binds = ["/:/host:ro"]),
    (v) => (v.HostConfig.VolumesFrom = ["foreign"]),
    (v) => (v.Mounts[0].Destination = "/tools"),
    (v) => (v.HostConfig.Mounts[0].Target = "/tools"),
  ];
  for (const mutate of mutations) {
    const { inspect, options } = sample();
    mutate(inspect[0]);
    assert.throws(
      () => verifyFixtureInspect(inspect, options),
      /FIXTURE_/,
      mutate.toString(),
    );
  }
});
test("actual inspect rejects foreign identifiers/labels, status aliases, network endpoints and lifetime failures", () => {
  const mutations = [
    (v) => (v.Id = "b".repeat(64)),
    (v) => (v.Name = "/foreign"),
    (v) => (v.Image = "sha256:" + "0".repeat(64)),
    (v) => (v.Image = FIXTURE_IMAGE.config),
    (v) => (v.Config.Image = FIXTURE_IMAGE.config),
    (v) => (v.Config.Labels["io.hedefora.pg17.fixture.run"] = "0".repeat(32)),
    (v) => (v.Config.Labels["io.hedefora.pg17.fixture.scope"] = "production"),
    (v) => (v.Config.Labels.extra = "unknown"),
    (v) => (v.State.Running = true),
    (v) => (v.State.Dead = true),
    (v) => (v.State.OOMKilled = true),
    (v) => (v.State.ExitCode = 137),
    (v) => (v.State.Error = "failed"),
    (v) => (v.State.Pid = 1),
    (v) => (v.RestartCount = 1),
    (v) => (v.Created = ZERO),
    (v) => (v.State.StartedAt = v.Created),
    (v) => (v.State.FinishedAt = ""),
    (v) => (v.NetworkSettings.Networks.bridge = {}),
    (v) => (v.NetworkSettings.Networks.none.IPAddress = "172.20.0.2"),
    (v) => (v.NetworkSettings.Networks.none.Gateway = "172.20.0.1"),
    (v) => (v.NetworkSettings.Ports = { "5432/tcp": [] }),
    (v) => (v.NetworkSettings.Networks.none.Aliases = ["db"]),
    (v) => (v.NetworkSettings.Networks.none.DriverOpts = { bridge: "host" }),
  ];
  for (const mutate of mutations) {
    const { inspect, options } = sample();
    mutate(inspect[0]);
    assert.throws(
      () => verifyFixtureInspect(inspect, options),
      /FIXTURE_/,
      mutate.toString(),
    );
  }
  const { inspect, options } = sample("exited");
  inspect[0].State.FinishedAt = new Date(
    Date.parse(options.run.expiresAt) + 1,
  ).toISOString();
  assert.throws(() => verifyFixtureInspect(inspect, options), /LIFETIME/);
  assert.throws(() => verifyFixtureInspect([], options), /COUNT/);
  assert.throws(
    () => verifyFixtureInspect(inspect, { ...options, mountSources: {} }),
    /MAP/,
  );
});
test("successful receipt validates every fixed SQL case and exactly six package-qualified Go tests", () => {
  const value = run(),
    data = receipt(value);
  // Independently enumerated from runLiveSqlAcceptance: 33 + 101 + 29 + 7.
  assert.equal(FIXTURE_SQL_CASES.length, 170);
  assert.equal(
    new Set(FIXTURE_SQL_CASES.map((row) => row.caseId)).size,
    FIXTURE_SQL_CASES.length,
  );
  assert.equal(
    data.goEvidence.packages.reduce(
      (sum, item) => sum + item.requiredTests.length,
      0,
    ),
    6,
  );
  assert.equal(
    verifyFixtureReceipt(JSON.stringify(data) + "\n", {
      run: value,
      rawExit: 0,
    }).status,
    "PASS",
  );
  assert.equal(data.sqlEvidence.cases.at(-1).caseId, "migration.final-up");
  assert.throws(
    () => FIXTURE_SQL_CASES.find((entry) => entry.states).states.push("00000"),
    TypeError,
  );
});
test("receipt is closed, bounded, duplicate-key rejecting and never upgrades child authority", () => {
  const value = run(),
    data = receipt(value),
    options = { run: value, rawExit: 0 };
  const text = JSON.stringify(data) + "\n";
  for (const rawExit of [null, undefined, 1, -1, 137])
    assert.throws(() => verifyFixtureReceipt(text, { ...options, rawExit }));
  for (const invalid of [
    text.slice(0, -1),
    text + text,
    text.replace('"status":"PASS"', '"status":"FAIL","status":"PASS"'),
    text.slice(0, 200),
    " ".repeat(65536) + text,
  ])
    assert.throws(() => verifyFixtureReceipt(invalid, options));
  for (const mutate of [
    (v) => (v.extra = "forbidden"),
    (v) => (v.status = "FAIL"),
    (v) => (v.sourceCommit = "0".repeat(40)),
    (v) => (v.isolation.authority = "host-docker-inspect"),
    (v) => v.isolation.interfaces.push("eth0"),
    (v) => (v.bootstrap.rolesSha256 = "0".repeat(64)),
    (v) => (v.bootstrap.primaryTLS = false),
    (v) => (v.cleanup.postmasters = 1),
    (v) => (v.cleanup.hostRemoval = "PASS"),
    (v) => (v.cleanup.status = "FAIL"),
  ]) {
    const changed = structuredClone(data);
    mutate(changed);
    assert.throws(
      () => verifyFixtureReceipt(JSON.stringify(changed) + "\n", options),
      /FIXTURE_/,
      mutate.toString(),
    );
  }
});
test("receipt rejects count-preserving name/package substitutions, skip/fail/duplicates and raw exit failures", () => {
  const value = run(),
    options = { run: value, rawExit: 0 };
  const mutations = [
    (v) => (v.goEvidence.packages[0].requiredTests[0] = "TestPG17Fake"),
    (v) =>
      (v.goEvidence.packages[0].requiredTests[0] =
        v.goEvidence.packages[0].requiredTests[1]),
    (v) => (v.goEvidence.packages[0].package = Object.keys(GO_PACKAGES)[1]),
    (v) => v.goEvidence.packages.reverse(),
    (v) => (v.goEvidence.packages[0].skipped = 1),
    (v) => (v.goEvidence.packages[0].failed = 1),
    (v) => (v.goEvidence.packages[0].binaryExit = 1),
    (v) => (v.goEvidence.packages[0].converterExit = 1),
    (v) => (v.goEvidence.packages[0].packagePass = false),
    (v) => (v.goEvidence.race = false),
    (v) => (v.sqlEvidence.cases[0].caseId = "engine.fake"),
    (v) => (v.sqlEvidence.cases[1].caseId = v.sqlEvidence.cases[2].caseId),
    (v) => v.sqlEvidence.cases.pop(),
    (v) => (v.sqlEvidence.cases[0].rawSql = "forbidden"),
    (v) => (v.sqlEvidence.cases.find((row) => row.sqlState).sqlState = "00000"),
    (v) =>
      (v.sqlEvidence.cases.find(
        (row) => row.caseId === "locks.contention",
      ).elapsedMs = 0),
    (v) =>
      (v.sqlEvidence.cases.find(
        (row) => row.caseId === "timeouts.idle",
      ).observedBackendExitMs = 20001),
    (v) => (v.sqlEvidence.sourceSha256.up = "0".repeat(64)),
  ];
  for (const mutate of mutations) {
    const changed = receipt(value);
    mutate(changed);
    assert.throws(
      () => verifyFixtureReceipt(JSON.stringify(changed) + "\n", options),
      /FIXTURE_/,
      mutate.toString(),
    );
  }
});
test("loaded image binds exact diff IDs and bootstrap config; labels are not signature verification", () => {
  const image = {
    Id: FIXTURE_IMAGE.manifest,
    Descriptor: {
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      digest: FIXTURE_IMAGE.manifest,
      size: 1950,
    },
    Os: "linux",
    Architecture: "amd64",
    RootFS: {
      Type: "layers",
      Layers: [
        "sha256:411a86676185cb54d695a805b238194a64e9b77e0c723f3802fbb87d333ea0b3",
        "sha256:7ce657c8b06dc881764c1ad9db44dbd0a1b42b48db843c7877dd03294fbbbba2",
        "sha256:562746f9c7adead5654d3eb444fbde428bdf91849f0956f7ef6991f2b335b51c",
      ],
    },
    Config: {
      User: "26",
      Cmd: ["bash"],
      Env: [
        "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/lib/postgresql/17/bin",
      ],
      Labels: IMAGE_LABELS,
    },
  };
  assert.equal(verifyFixtureImageInspect([image]).status, "PASS");
  for (const mutate of [
    (v) => (v.Id = FIXTURE_IMAGE.config),
    (v) => (v.Descriptor.digest = FIXTURE_IMAGE.config),
    (v) => (v.Descriptor.size = 1951),
    (v) => (v.Descriptor.mediaType = "application/vnd.oci.image.index.v1+json"),
    (v) => delete v.Descriptor,
    (v) => v.RootFS.Layers.reverse(),
    (v) => (v.Config.Volumes = { "/data": {} }),
    (v) => (v.Config.User = "0"),
    (v) => v.Config.Env.push("PGPASSWORD=forbidden"),
    (v) => (v.Config.Entrypoint = ["/bin/sh"]),
    (v) => (v.Config.Healthcheck = {}),
    (v) => (v.Architecture = "arm64"),
    (v) => (v.Config.Labels["org.opencontainers.image.revision"] = "unknown"),
  ]) {
    const changed = structuredClone(image);
    mutate(changed);
    assert.throws(() => verifyFixtureImageInspect([changed]), /FIXTURE_/);
  }
});
