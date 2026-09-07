// Pure host-side checks. A child receipt cannot authorize execution or prove
// Docker isolation/removal; the host separately owns admission and lifecycle.
import { posix, win32 } from "node:path";
import {
  FIXTURE_IMAGE,
  GO_PACKAGES,
  ROLES_SHA256,
  validateFixtureRun,
} from "./fixture-container.mjs";
import { UP_SHA256, DOWN_SHA256, LIMITS, canonical } from "../live-sql.mjs";
import { strict } from "../../../../scripts/postgres-image/apk-runtime/sealed-io.mjs";
import { requireLive } from "./process.mjs";

const ENTRYPOINT = "/tools/node";
const SCRIPT = "/source/tests/integration/postgres/live/fixture-container.mjs";
const DESTINATIONS = ["/source", "/tools", "/input"];
const ZERO_TIME = "0001-01-01T00:00:00Z";
const ENV = Object.freeze([
  "PATH=/usr/lib/postgresql/17/bin:/usr/bin:/bin",
  "HOME=/nonexistent",
  "TMPDIR=/fixture",
  "LC_ALL=C",
  "LANG=C.UTF-8",
  "TZ=UTC",
]);
const TMPFS = Object.freeze({
  "/fixture": "rw,noexec,nosuid,nodev,size=512m,mode=0700,uid=26,gid=102",
  "/tmp": "rw,noexec,nosuid,nodev,size=64m,mode=0700,uid=26,gid=102",
});
const DIFF_IDS = Object.freeze([
  "sha256:411a86676185cb54d695a805b238194a64e9b77e0c723f3802fbb87d333ea0b3",
  "sha256:7ce657c8b06dc881764c1ad9db44dbd0a1b42b48db843c7877dd03294fbbbba2",
  "sha256:562746f9c7adead5654d3eb444fbde428bdf91849f0956f7ef6991f2b335b51c",
]);
const IMAGE_LABELS = Object.freeze({
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
});
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const same = (a, b) => canonical(a) === canonical(b);
const emptyList = (value) =>
  value === null || (Array.isArray(value) && value.length === 0);
const emptyMap = (value) =>
  value === null || (object(value) && Object.keys(value).length === 0);
function keys(value, expected, code) {
  requireLive(
    object(value) && same(Object.keys(value).sort(), [...expected].sort()),
    code,
  );
}
function runIdentity(run) {
  // Identity/lease syntax is checked even when collecting evidence after expiry.
  validateFixtureRun(run, Date.parse(run?.issuedAt));
}
function ownerLabels(run) {
  return {
    "io.hedefora.pg17.fixture.run": run.runId,
    "io.hedefora.pg17.fixture.source": run.sourceCommit,
    "io.hedefora.pg17.fixture.approval": run.approvalSha256,
    "io.hedefora.pg17.fixture.scope": "local-ci-test-only",
  };
}
function hostPath(value) {
  requireLive(
    typeof value === "string" &&
      value.length <= 4096 &&
      !/[\x00-\x1f\x7f,"\\]/.test(value) &&
      !value.endsWith("/") &&
      !value
        .split("/")
        .some(
          (part) =>
            part === "." ||
            part === ".." ||
            part.endsWith(" ") ||
            part.endsWith("."),
        ),
    "FIXTURE_HOST_PATH",
  );
  const windows = /^[A-Z]:\//.test(value);
  requireLive(
    windows
      ? win32.isAbsolute(value) &&
          value.length > 3 &&
          win32.normalize(value).replaceAll("\\", "/") === value &&
          !value.slice(2).includes(":")
      : posix.isAbsolute(value) &&
          value.length > 1 &&
          posix.normalize(value) === value &&
          !value.includes(":"),
    "FIXTURE_HOST_PATH",
  );
  return value;
}

export function fixtureCreateArgs({
  run,
  name,
  sourceDirectory,
  toolsDirectory,
  inputDirectory,
}) {
  validateFixtureRun(run);
  requireLive(
    name === `hedefora-pg17-fixture-${run.runId}`,
    "FIXTURE_CONTAINER_NAME",
  );
  const paths = [sourceDirectory, toolsDirectory, inputDirectory].map(hostPath);
  requireLive(
    new Set(paths).size === 3 &&
      !paths.some((a, index) =>
        paths.some((b, other) => index !== other && a.startsWith(`${b}/`)),
      ),
    "FIXTURE_MOUNT_OVERLAP",
  );
  const args = [
    "container",
    "create",
    "--name",
    name,
    "--pull=never",
    "--platform=linux/amd64",
    "--user=26:102",
    "--network=none",
    "--ipc=private",
    "--cgroupns=private",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--read-only",
    "--cpus=2",
    "--memory=1536m",
    "--memory-swap=1536m",
    "--pids-limit=256",
    "--shm-size=128m",
    "--restart=no",
    "--stop-signal=SIGTERM",
    "--stop-timeout=5",
    "--hostname=fixture",
    "--log-driver=json-file",
    "--log-opt=max-size=1m",
    "--log-opt=max-file=1",
    "--workdir=/source",
  ];
  for (const [label, value] of Object.entries(ownerLabels(run)))
    args.push("--label", `${label}=${value}`);
  for (const entry of ENV) args.push("--env", entry);
  for (const [destination, options] of Object.entries(TMPFS))
    args.push("--tmpfs", `${destination}:${options}`);
  for (const [index, destination] of DESTINATIONS.entries())
    args.push(
      "--mount",
      `type=bind,src=${paths[index]},dst=${destination},readonly,bind-propagation=rprivate`,
    );
  // Docker 29's containerd image store addresses this imported OCI artifact by
  // its platform manifest; the separately verified OCI config is not a handle.
  args.push(`--entrypoint=${ENTRYPOINT}`, FIXTURE_IMAGE.manifest, SCRIPT);
  return args;
}

export function verifyFixtureImageInspect(inspect) {
  requireLive(
    Array.isArray(inspect) && inspect.length === 1,
    "FIXTURE_IMAGE_INSPECT_COUNT",
  );
  const image = inspect[0],
    config = image?.Config;
  requireLive(
    image?.Id === FIXTURE_IMAGE.manifest &&
      same(image.Descriptor, {
        mediaType: "application/vnd.oci.image.manifest.v1+json",
        digest: FIXTURE_IMAGE.manifest,
        size: 1950,
      }) &&
      image.Os === "linux" &&
      image.Architecture === "amd64" &&
      image.RootFS?.Type === "layers" &&
      same(image.RootFS.Layers, DIFF_IDS) &&
      object(config) &&
      config.User === "26" &&
      emptyMap(config.Volumes ?? null) &&
      emptyMap(config.ExposedPorts ?? null) &&
      emptyList(config.Entrypoint ?? null) &&
      same(config.Cmd, ["bash"]) &&
      same(config.Env, [
        "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/lib/postgresql/17/bin",
      ]) &&
      same(config.Labels, IMAGE_LABELS) &&
      [undefined, ""].includes(config.WorkingDir) &&
      [undefined, ""].includes(config.StopSignal) &&
      config.Healthcheck === undefined &&
      config.OnBuild === undefined,
    "FIXTURE_IMAGE_IDENTITY",
  );
  return Object.freeze({
    status: "PASS",
    imageManifestDigest: image.Id,
    imageConfigDigest: FIXTURE_IMAGE.config,
    os: "linux",
    architecture: "amd64",
  });
}

// mountSources is the host's independently established exact daemon path map.
// There is intentionally no Windows/WSL/case-folding/realpath guess here.
export function verifyFixtureInspect(
  inspect,
  { run, name, id, mountSources, phase },
) {
  runIdentity(run);
  requireLive(
    ["created", "running", "exited"].includes(phase) &&
      /^[a-f0-9]{64}$/.test(id) &&
      name === `hedefora-pg17-fixture-${run.runId}`,
    "FIXTURE_INSPECT_REQUEST",
  );
  keys(mountSources, DESTINATIONS, "FIXTURE_MOUNT_SOURCE_MAP");
  for (const source of Object.values(mountSources)) hostPath(source);
  requireLive(
    new Set(Object.values(mountSources)).size === 3,
    "FIXTURE_MOUNT_SOURCE_MAP",
  );
  requireLive(
    Array.isArray(inspect) && inspect.length === 1,
    "FIXTURE_INSPECT_COUNT",
  );
  const value = inspect[0],
    config = value?.Config,
    host = value?.HostConfig,
    state = value?.State;
  requireLive(
    value?.Id === id &&
      value.Name === `/${name}` &&
      value.Image === FIXTURE_IMAGE.manifest &&
      value.Path === ENTRYPOINT &&
      same(value.Args, [SCRIPT]) &&
      value.RestartCount === 0 &&
      object(config) &&
      object(host) &&
      object(state),
    "FIXTURE_INSPECT_IDENTITY",
  );
  requireLive(
    config.Image === FIXTURE_IMAGE.manifest &&
      config.User === "26:102" &&
      config.WorkingDir === "/source" &&
      same(config.Entrypoint, [ENTRYPOINT]) &&
      same(config.Cmd, [SCRIPT]) &&
      same([...config.Env].sort(), [...ENV].sort()) &&
      same(config.Labels, { ...IMAGE_LABELS, ...ownerLabels(run) }) &&
      config.Hostname === "fixture" &&
      config.Domainname === "" &&
      config.Tty === false &&
      config.OpenStdin === false &&
      config.StdinOnce === false &&
      config.AttachStdin === false &&
      config.StopSignal === "SIGTERM" &&
      config.StopTimeout === 5 &&
      emptyMap(config.Volumes) &&
      emptyMap(config.ExposedPorts ?? null) &&
      config.Healthcheck === undefined &&
      emptyList(config.OnBuild ?? null),
    "FIXTURE_INSPECT_CONFIG",
  );
  requireLive(
    host.Privileged === false &&
      host.ReadonlyRootfs === true &&
      same(host.CapDrop, ["ALL"]) &&
      emptyList(host.CapAdd) &&
      emptyList(host.GroupAdd) &&
      same(host.SecurityOpt, ["no-new-privileges"]) &&
      host.NetworkMode === "none" &&
      host.PidMode === "" &&
      host.IpcMode === "private" &&
      host.CgroupnsMode === "private" &&
      host.UTSMode === "" &&
      host.UsernsMode === "" &&
      emptyMap(host.PortBindings) &&
      host.PublishAllPorts === false &&
      host.AutoRemove === false &&
      host.Init !== true &&
      emptyList(host.Devices) &&
      emptyList(host.DeviceRequests) &&
      emptyList(host.DeviceCgroupRules) &&
      emptyList(host.Links) &&
      emptyList(host.ExtraHosts) &&
      emptyList(host.VolumesFrom) &&
      emptyList(host.Binds) &&
      emptyList(host.Dns) &&
      emptyList(host.DnsOptions) &&
      emptyList(host.DnsSearch) &&
      emptyMap(host.Sysctls ?? null) &&
      emptyMap(host.StorageOpt ?? null) &&
      same(host.RestartPolicy, { Name: "no", MaximumRetryCount: 0 }) &&
      same(host.LogConfig, {
        Type: "json-file",
        Config: { "max-size": "1m", "max-file": "1" },
      }),
    "FIXTURE_INSPECT_ISOLATION",
  );
  requireLive(
    host.Memory === 1610612736 &&
      host.MemorySwap === 1610612736 &&
      host.NanoCpus === 2000000000 &&
      host.PidsLimit === 256 &&
      host.ShmSize === 134217728 &&
      host.MemoryReservation === 0 &&
      host.CpuPeriod === 0 &&
      host.CpuQuota === 0 &&
      host.CpuRealtimePeriod === 0 &&
      host.CpuRealtimeRuntime === 0 &&
      host.CpusetCpus === "" &&
      host.CpusetMems === "" &&
      host.OomKillDisable !== true,
    "FIXTURE_INSPECT_LIMITS",
  );
  requireLive(
    same(host.Tmpfs, TMPFS) &&
      Array.isArray(host.Mounts) &&
      host.Mounts.length === 3 &&
      Array.isArray(value.Mounts) &&
      value.Mounts.length === 3,
    "FIXTURE_INSPECT_MOUNT_COUNT",
  );
  for (const destination of DESTINATIONS) {
    const declared = host.Mounts.filter(
      (mount) => mount.Target === destination,
    );
    const mounted = value.Mounts.filter(
      (mount) => mount.Destination === destination,
    );
    requireLive(
      declared.length === 1 && mounted.length === 1,
      "FIXTURE_INSPECT_MOUNT_TARGET",
    );
    const declaration = declared[0],
      actual = mounted[0];
    keys(
      declaration,
      ["Type", "Source", "Target", "ReadOnly", "BindOptions"],
      "FIXTURE_INSPECT_MOUNT_FIELDS",
    );
    requireLive(
      declaration.Type === "bind" &&
        declaration.Source === mountSources[destination] &&
        declaration.ReadOnly === true &&
        same(declaration.BindOptions, { Propagation: "rprivate" }) &&
        actual.Type === "bind" &&
        actual.Source === mountSources[destination] &&
        actual.RW === false &&
        actual.Propagation === "rprivate" &&
        ["", "ro"].includes(actual.Mode) &&
        actual.Name === undefined &&
        actual.Driver === undefined,
      "FIXTURE_INSPECT_MOUNT_BINDING",
    );
  }
  const network = value.NetworkSettings;
  requireLive(
    object(network) &&
      emptyMap(network.Ports) &&
      object(network.Networks) &&
      same(Object.keys(network.Networks), ["none"]),
    "FIXTURE_INSPECT_NETWORK",
  );
  const endpoint = network.Networks.none;
  requireLive(
    object(endpoint) &&
      endpoint.IPAddress === "" &&
      endpoint.Gateway === "" &&
      endpoint.MacAddress === "" &&
      endpoint.IPPrefixLen === 0 &&
      endpoint.GlobalIPv6Address === "" &&
      endpoint.GlobalIPv6PrefixLen === 0 &&
      endpoint.IPv6Gateway === "" &&
      emptyList(endpoint.Aliases) &&
      emptyList(endpoint.Links) &&
      endpoint.IPAMConfig === null &&
      emptyMap(endpoint.DriverOpts),
    "FIXTURE_INSPECT_ENDPOINT",
  );
  for (const key of [
    "IPAddress",
    "Gateway",
    "GlobalIPv6Address",
    "IPv6Gateway",
    "MacAddress",
  ])
    requireLive(
      network[key] === undefined || network[key] === "",
      "FIXTURE_INSPECT_NETWORK_ADDRESS",
    );
  requireLive(
    state.Status === phase &&
      state.Running === (phase === "running") &&
      state.Paused === false &&
      state.Restarting === false &&
      state.OOMKilled === false &&
      state.Dead === false &&
      state.Error === "" &&
      state.ExitCode === 0 &&
      Number.isSafeInteger(state.Pid) &&
      (phase === "running" ? state.Pid > 0 : state.Pid === 0),
    "FIXTURE_INSPECT_STATE",
  );
  const created = Date.parse(value.Created),
    issued = Date.parse(run.issuedAt),
    expires = Date.parse(run.expiresAt);
  requireLive(
    Number.isFinite(created) && created >= issued && created < expires,
    "FIXTURE_INSPECT_CREATED_AT",
  );
  const started = Date.parse(state.StartedAt),
    finished = Date.parse(state.FinishedAt);
  if (phase === "created")
    requireLive(
      state.StartedAt === ZERO_TIME && state.FinishedAt === ZERO_TIME,
      "FIXTURE_INSPECT_UNSTARTED",
    );
  else
    requireLive(
      Number.isFinite(started) &&
        started >= created &&
        started < expires &&
        (phase === "running"
          ? state.FinishedAt === ZERO_TIME
          : Number.isFinite(finished) &&
            finished >= started &&
            finished <= expires),
      "FIXTURE_INSPECT_LIFETIME",
    );
  return Object.freeze({
    status: "PASS",
    authority: "host-docker-inspect",
    id,
    name,
    phase,
    imageManifestDigest: value.Image,
    imageConfigDigest: FIXTURE_IMAGE.config,
  });
}

function sqlCases() {
  const entries = [];
  const add = (id, detail = {}) => entries.push({ caseId: id, ...detail });
  const denied = (id, states = ["42501"]) => add(id, { states });
  add("engine.pg17", { serverVersionNum: 170011 });
  add("migration.initial-v0");
  add("roles.catalog");
  for (const role of ["migration", "app", "worker"]) add(`roles.${role}.login`);
  denied("roles.readonly.login-denied", ["28000", "28P01"]);
  add("roles.database-acl");
  for (const role of ["migration", "app", "worker"])
    for (const db of ["postgres", "template1"])
      denied(`roles.${role}.${db}-connect-denied`);
  denied("migration.missing-up-checksum", ["22023"]);
  denied("migration.after-create-rollback", ["23514"]);
  add("migration.after-create-lock-release");
  add("migration.first-up");
  add("migration.rerun", { pendingCount: 0 });
  for (const [id, state] of [
    ["duplicate-up-direct", "42P06"],
    ["missing-down-checksum", "22023"],
    ["checksum-mismatch", "55000"],
    ["nonlast", "55000"],
    ["missing-ledger-row", "55000"],
    ["missing-ledger-relation", "42P01"],
  ])
    denied(`migration.${id}`, [state]);
  add("migration.empty-down");
  denied("migration.down-on-v0", ["42P01"]);
  add("migration.reapply-up");
  add("acl.objects");
  add("dml.app");
  add("dml.worker");
  add("readonly.capability");
  denied("migration.nonempty-down", ["2BP01"]);
  const common = [
    "schema-create",
    "schema-ddl",
    "public-ddl",
    "alter-table",
    "drop-table",
    "truncate",
    "temp",
    "meta-select",
    "meta-insert",
    "meta-update",
    "meta-delete",
    "meta-ddl",
    "create-role",
    "elevate-self",
    "sequence-update",
  ];
  for (const role of ["app", "worker", "readonly"]) {
    for (const action of common) denied(`deny.${role}.${action}`);
    if (role !== "readonly")
      for (const target of [
        "admin",
        "migration",
        "app",
        "worker",
        "readonly",
      ].filter((target) => target !== role))
        denied(`deny.${role}.set-role-${target}`);
    for (let number = 1; number <= 16; number++)
      denied(`deny.${role}.advisory-${number}`);
  }
  for (const action of [
    "insert",
    "update",
    "delete",
    "sequence-usage",
    "sequence-select",
    "function",
  ])
    denied(`deny.readonly.${action}`);
  for (const target of ["admin", "app", "worker", "readonly"])
    denied(`deny.migration.set-role-${target}`);
  for (const action of ["public-ddl", "temp", "create-role", "elevate-self"])
    denied(`deny.migration.${action}`);
  for (let number = 1; number <= 16; number++)
    if (number !== 5) denied(`deny.migration.advisory-${number}`);
  add("locks.contention", {
    states: ["55P03"],
    elapsedMs: [LIMITS.lockMinMs, LIMITS.lockMaxMs],
    configuredLockTimeoutMs: 3000,
  });
  for (const action of ["commit", "rollback", "disconnect"])
    add(`locks.release-${action}`);
  add("timeouts.statement", {
    states: ["57014"],
    elapsedMs: [LIMITS.statementMinMs, LIMITS.statementMaxMs],
    configuredStatementTimeoutMs: 15000,
  });
  add("timeouts.idle", {
    states: ["25P03"],
    observedBackendExitMs: [LIMITS.idleMinMs, LIMITS.idleMaxMs],
    configuredIdleTimeoutMs: 15000,
  });
  add("migration.final-up");
  return entries;
}
export const FIXTURE_SQL_CASES = Object.freeze(
  sqlCases().map((entry) => {
    for (const value of Object.values(entry))
      if (Array.isArray(value)) Object.freeze(value);
    return Object.freeze(entry);
  }),
);

export function verifyFixtureReceipt(text, { run, rawExit }) {
  runIdentity(run);
  requireLive(
    rawExit === 0 && typeof text === "string" && text.endsWith("\n"),
    "FIXTURE_RECEIPT_PROCESS",
  );
  const value = strict(text, "FIXTURE_RECEIPT", 65536);
  const binding = [
    "runId",
    "sourceCommit",
    "sourceTree",
    "imageManifestDigest",
    "imageConfigDigest",
    "approvalSha256",
    "bundleSha256",
  ];
  keys(
    value,
    [
      "schema",
      "status",
      ...binding,
      "isolation",
      "bootstrap",
      "sqlEvidence",
      "goEvidence",
      "cleanup",
    ],
    "FIXTURE_RECEIPT_FIELDS",
  );
  requireLive(
    value.schema === "hedefora.pg17.fixture-result.v1" &&
      value.status === "PASS" &&
      binding.every((key) => value[key] === run[key]),
    "FIXTURE_RECEIPT_BINDING",
  );
  requireLive(
    same(value.isolation, {
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
    }),
    "FIXTURE_RECEIPT_SELF_ISOLATION",
  );
  requireLive(
    same(value.bootstrap, {
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
    }),
    "FIXTURE_RECEIPT_BOOTSTRAP",
  );
  const sql = value.sqlEvidence;
  keys(
    sql,
    ["scope", "status", "serverVersionNum", "sourceSha256", "cases"],
    "FIXTURE_RECEIPT_SQL_FIELDS",
  );
  requireLive(
    sql.scope === "actual-postgresql-engine-sql-only" &&
      sql.status === "PASS" &&
      sql.serverVersionNum === 170011 &&
      same(sql.sourceSha256, { up: UP_SHA256, down: DOWN_SHA256 }) &&
      Array.isArray(sql.cases) &&
      sql.cases.length === FIXTURE_SQL_CASES.length,
    "FIXTURE_RECEIPT_SQL",
  );
  for (const [index, expected] of FIXTURE_SQL_CASES.entries()) {
    const row = sql.cases[index],
      fields = Object.keys(expected).map((key) =>
        key === "states" ? "sqlState" : key,
      );
    keys(row, [...fields, "status"], "FIXTURE_RECEIPT_SQL_CASE_FIELDS");
    requireLive(
      row.status === "PASS" && row.caseId === expected.caseId,
      "FIXTURE_RECEIPT_SQL_CASE_ID",
    );
    for (const [key, wanted] of Object.entries(expected)) {
      if (key === "states")
        requireLive(wanted.includes(row.sqlState), "FIXTURE_RECEIPT_SQL_STATE");
      else if (Array.isArray(wanted))
        requireLive(
          Number.isSafeInteger(row[key]) &&
            row[key] >= wanted[0] &&
            row[key] <= wanted[1],
          "FIXTURE_RECEIPT_SQL_TIMING",
        );
      else requireLive(row[key] === wanted, "FIXTURE_RECEIPT_SQL_CASE_VALUE");
    }
  }
  const go = value.goEvidence;
  keys(
    go,
    ["status", "goVersion", "race", "integration", "packages"],
    "FIXTURE_RECEIPT_GO_FIELDS",
  );
  requireLive(
    go.status === "PASS" &&
      go.goVersion === "go1.26.7" &&
      go.race === true &&
      go.integration === true &&
      Array.isArray(go.packages) &&
      go.packages.length === Object.keys(GO_PACKAGES).length,
    "FIXTURE_RECEIPT_GO",
  );
  for (const [index, [packageName, names]] of Object.entries(
    GO_PACKAGES,
  ).entries())
    requireLive(
      same(go.packages[index], {
        package: packageName,
        status: "PASS",
        requiredTests: names,
        packagePass: true,
        binaryExit: 0,
        converterExit: 0,
        skipped: 0,
        failed: 0,
      }),
      "FIXTURE_RECEIPT_GO_PACKAGE",
    );
  requireLive(
    same(value.cleanup, {
      status: "PASS",
      postmasters: 2,
      hostRemoval: "NOT_OBSERVED",
    }),
    "FIXTURE_RECEIPT_CLEANUP",
  );
  return value;
}
