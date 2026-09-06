import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import {
  open,
  realpath,
  mkdir,
  mkdtemp,
  chmod,
  readFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { performance } from "node:perf_hooks";
import { startProcess, command, requireLive, LiveError } from "./process.mjs";
import { createPsqlExecutor } from "./psql.mjs";

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const HEX = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
export const GO_IMAGE =
  "golang@sha256:e8c859f5632dcfde7b32d2012b4351728f6437930887c2f6a91ea242459e5514";
export const IMAGE_BOOTSTRAP_PROFILE = "apk-bootstrap-overlay/v1";
const imageEnv = [
  "PATH=/usr/libexec/postgresql17:/bin",
  "PGDATA=/var/lib/postgresql/data",
  "LANG=C.UTF-8",
  "TZ=UTC",
];
const LABEL = "org.hedefora.pg17.run";
const OWNER = "org.hedefora.pg17.owner=trusted-live-controller-v1";
const expectedTests = new Set([
  "TestPG17TLSAndSCRAM",
  "TestPG17TLSAndAuthenticationFailuresDoNotFallback",
  "TestPG17AmbientDiscoveryCannotChangeTheEndpoint",
  "TestPG17PoolCapacityDeadlineReuseAndClose",
  "TestPG17InflightQueryCancellationAndClose",
  "TestPG17APIStartupOutageRecoveryAndDrain",
]);
export function createRunBudget({
  maxMs = 1200000,
  now = () => performance.now(),
} = {}) {
  requireLive(
    Number.isInteger(maxMs) && maxMs > 0 && maxMs <= 1200000,
    "RUN_BUDGET_BOUND",
  );
  const deadline = now() + maxMs;
  const remaining = () => {
    const current = now();
    requireLive(
      Number.isFinite(current) && current < deadline,
      "RUN_BUDGET_EXPIRED",
    );
    return deadline - current;
  };
  const check = () => {
    remaining();
  };
  return Object.freeze({
    check,
    limit(requested) {
      const available = remaining();
      requireLive(
        Number.isInteger(requested) && requested > 0 && requested <= 300000,
        "COMMAND_BUDGET_BOUND",
      );
      return Math.max(1, Math.min(requested, Math.ceil(available)));
    },
  });
}

// Consistency is NOT admission: root's separately reviewed private-brand check
// must execute first. This module cannot manufacture a trusted capability.
export function validateDescriptor(value, expected, now = Date.now()) {
  requireLive(
    value &&
      value.profile === "apk-runtime-data-assembly/v1" &&
      value.scope === "disposable-local-ci-only",
    "ADMISSION_PROFILE",
  );
  requireLive(
    /^[a-f0-9]{32}$/.test(value.runId) && value.runId === expected.runId,
    "ADMISSION_RUN",
  );
  requireLive(
    COMMIT.test(value.sourceCommit) &&
      value.sourceCommit === expected.sourceCommit &&
      COMMIT.test(value.controllerCommit) &&
      value.controllerCommit === expected.controllerCommit,
    "ADMISSION_SOURCE",
  );
  for (const field of [
    "profileSha256",
    "closureLockSha256",
    "rootfsSha256",
    "evidenceIndexSha256",
    "scannerLockSha256",
  ])
    requireLive(
      HEX.test(value[field]) && value[field] === expected[field],
      "ADMISSION_HASH",
    );
  for (const field of [
    "imageManifestDigest",
    "imageConfigDigest",
    "dockerImageId",
  ])
    requireLive(
      DIGEST.test(value[field]) && value[field] === expected[field],
      "ADMISSION_DIGEST",
    );
  requireLive(
    value.dockerImageId === value.imageConfigDigest,
    "ADMISSION_CONFIG_ID",
  );
  requireLive(
    value.archive &&
      isAbsolute(value.archive.path) &&
      HEX.test(value.archive.sha256) &&
      value.archive.sha256 === expected.archive.sha256 &&
      value.archive.path === expected.archive.path &&
      value.archive.size === expected.archive.size &&
      Number.isSafeInteger(value.archive.size) &&
      value.archive.size > 0 &&
      value.archive.size <= 536870912,
    "ADMISSION_ARCHIVE",
  );
  for (const field of ["databaseBuiltAt", "issuedAt", "expiresAt"])
    requireLive(
      typeof value[field] === "string" &&
        /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value[field]),
      "ADMISSION_TIMESTAMP",
    );
  const built = Date.parse(value.databaseBuiltAt),
    issued = Date.parse(value.issuedAt),
    expires = Date.parse(value.expiresAt);
  requireLive(
    [built, issued, expires].every(Number.isFinite) &&
      built <= issued &&
      issued <= now &&
      now < expires &&
      expires <= built + 48 * 3600000 &&
      expires <= issued + 3600000,
    "ADMISSION_FRESHNESS",
  );
  return value;
}
export function validateImageMetadata(
  config,
  manifest,
  descriptor,
  bootstrapProfile,
) {
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  requireLive(
    bootstrapProfile === IMAGE_BOOTSTRAP_PROFILE,
    "IMAGE_BOOTSTRAP_PROFILE",
  );
  requireLive(
    config.os === "linux" &&
      config.architecture === "amd64" &&
      config.config?.User === "70:70" &&
      equal(config.config.Entrypoint, ["/usr/local/bin/hedefora-postgres"]) &&
      equal(config.config.Cmd, ["postgres"]) &&
      equal(config.config.Env, imageEnv) &&
      config.config.WorkingDir === "/" &&
      config.config.StopSignal === "SIGINT" &&
      config.rootfs?.type === "layers" &&
      Array.isArray(config.rootfs.diff_ids) &&
      config.rootfs.diff_ids.length === 2 &&
      config.rootfs.diff_ids.every((digest) => DIGEST.test(digest)) &&
      manifest.schemaVersion === 2 &&
      manifest.config?.digest === descriptor.imageConfigDigest &&
      Array.isArray(manifest.layers) &&
      manifest.layers.length === 2 &&
      manifest.layers.every(
        (layer, index) =>
          layer.digest === config.rootfs.diff_ids[index] &&
          layer.mediaType === "application/vnd.oci.image.layer.v1.tar" &&
          Number.isSafeInteger(layer.size) &&
          layer.size > 0,
      ),
    "IMAGE_CONFIGURATION",
  );
  // The ordered pair is bound by raw manifest/config SHA and the trusted
  // closure proof. A merged rootfs identity is NOT an individual layer diffID.
  return config.rootfs.diff_ids;
}
export function createExecutionGuard({
  authority,
  capability,
  expected,
  verifyInputs,
  now = Date.now,
}) {
  requireLive(
    typeof authority?.assertCapability === "function" &&
      typeof authority?.revalidate === "function" &&
      typeof authority?.withVerifiedArchive === "function" &&
      typeof verifyInputs === "function",
    "ADMISSION_AUTHORITY",
  );
  return async () => {
    authority.assertCapability(capability);
    const descriptor = validateDescriptor(
      await authority.revalidate(capability),
      expected,
      now(),
    );
    await verifyInputs();
    return descriptor;
  };
}
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function bytesFromFile(path, maxBytes) {
  requireLive(
    isAbsolute(path) && (await realpath(path)) === path,
    "INPUT_CANONICAL_PATH",
  );
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    return await readBoundedRegularHandle(file, maxBytes);
  } finally {
    await file.close();
  }
}
// Internal test seam. The production caller always supplies its own O_NOFOLLOW
// file handle. Never readFile() after fstat: a growing file must not allocate
// beyond the original approved size plus one explicit EOF probe byte.
export async function readBoundedRegularHandle(file, maxBytes) {
  requireLive(
    Number.isInteger(maxBytes) && maxBytes > 0 && maxBytes <= 268435456,
    "INPUT_BOUND",
  );
  const before = await file.stat({ bigint: true });
  requireLive(
    before.isFile() &&
      before.nlink === 1n &&
      before.size > 0n &&
      before.size <= BigInt(maxBytes),
    "INPUT_FILE",
  );
  const expected = Number(before.size);
  const bytes = Buffer.alloc(expected + 1);
  let offset = 0;
  while (offset < bytes.length) {
    const { bytesRead } = await file.read(
      bytes,
      offset,
      Math.min(65536, bytes.length - offset),
      offset,
    );
    requireLive(
      Number.isInteger(bytesRead) &&
        bytesRead >= 0 &&
        bytesRead <= Math.min(65536, bytes.length - offset),
      "INPUT_READ",
    );
    if (bytesRead === 0) break;
    offset += bytesRead;
  }
  const after = await file.stat({ bigint: true });
  requireLive(
    offset === expected &&
      after.isFile() &&
      after.nlink === 1n &&
      ["dev", "ino", "nlink", "size", "mtimeNs", "ctimeNs"].every(
        (key) => typeof before[key] === "bigint" && before[key] === after[key],
      ),
    "INPUT_CHANGED",
  );
  return bytes.subarray(0, expected);
}
export async function verifyInputBinding(input) {
  requireLive(input && HEX.test(input.sha256), "INPUT_BINDING");
  const bytes = await bytesFromFile(input.path, 4194304);
  requireLive(hash(bytes) === input.sha256, "INPUT_HASH");
  return bytes;
}
async function verifyTool(tool) {
  requireLive(tool && HEX.test(tool.sha256), "TOOL_PIN");
  requireLive(
    hash(await bytesFromFile(tool.path, 268435456)) === tool.sha256,
    "TOOL_HASH",
  );
}

// A resource is registered before creation to cover lost-ACK failures. Removal
// requires exact nonce labels and, once known, the immutable returned ID.
export class OwnedResources {
  constructor(runId, execute) {
    this.runId = runId;
    this.execute = execute;
    this.items = [];
  }
  intend(kind, name) {
    requireLive(
      ["container", "volume", "network"].includes(kind) &&
        name.startsWith(`ho-pg17-${this.runId}-`) &&
        /^[a-z0-9-]+$/.test(name),
      "RESOURCE_NAME",
    );
    requireLive(
      !this.items.some((item) => item.kind === kind && item.name === name),
      "RESOURCE_DUPLICATE",
    );
    const item = { kind, name, id: null };
    this.items.push(item);
    return item;
  }
  async inspect(item) {
    const result = await this.execute([item.kind, "inspect", item.name], {
      maxBytes: 1048576,
    });
    if (result.rawExit !== 0) {
      // Do not interpret a generic daemon/channel failure as absence.
      const listed = await this.execute([
        item.kind,
        "ls",
        ...(item.kind === "container" ? ["--all"] : []),
        "--format",
        item.kind === "container" ? "{{.Names}}" : "{{.Name}}",
      ]);
      requireLive(
        listed.rawExit === 0 &&
          !listed.stdout.split(/\r?\n/).includes(item.name),
        "RESOURCE_INSPECTION",
      );
      return null;
    }
    let value;
    try {
      const array = JSON.parse(result.stdout);
      requireLive(array.length === 1, "RESOURCE_INSPECTION");
      [value] = array;
    } catch {
      throw new LiveError("RESOURCE_INSPECTION");
    }
    const labels =
      item.kind === "container" ? value.Config?.Labels : value.Labels;
    requireLive(
      labels?.[LABEL] === this.runId &&
        labels?.["org.hedefora.pg17.owner"] === "trusted-live-controller-v1",
      "RESOURCE_FOREIGN",
    );
    if (item.id)
      requireLive(
        (value.Id ?? value.ID ?? value.Name) === item.id,
        "RESOURCE_REPLACED",
      );
    return value;
  }
  async cleanup() {
    const failures = [];
    // Containers before their volumes/network, even when initialization failed.
    const ordered = [...this.items]
      .reverse()
      .sort(
        (a, b) =>
          Number(b.kind === "container") - Number(a.kind === "container"),
      );
    for (const item of ordered) {
      try {
        if (!(await this.inspect(item))) continue;
        const args = [
          item.kind,
          "rm",
          ...(item.kind === "container" ? ["--force"] : []),
          item.id ?? item.name,
        ];
        const removed = await this.execute(args);
        requireLive(
          removed.rawExit === 0 && (await this.inspect(item)) === null,
          "RESOURCE_CLEANUP",
        );
      } catch {
        failures.push(`${item.kind}:${item.name}`);
      }
    }
    requireLive(failures.length === 0, "OWNED_CLEANUP_FAILED");
    return { status: "PASS", ownedResources: this.items.length };
  }
}

// These private credentials are independent of the public resource nonce.
export function createPrivateRunSecrets() {
  return Object.freeze({
    passwords: Object.freeze(
      Object.fromEntries(
        ["admin", "migration", "app", "worker", "readonly"].map((role) => [
          role,
          `synthetic-pg17-${randomBytes(32).toString("hex")}`,
        ]),
      ),
    ),
    controlToken: randomBytes(32).toString("hex"),
  });
}

export async function createLifecycleController({
  runId,
  imageDigest,
  controlToken,
  start,
  stop,
}) {
  requireLive(
    typeof controlToken === "string" && HEX.test(controlToken),
    "CONTROL_TOKEN_REQUIRED",
  );
  const expectedToken = Buffer.from(controlToken, "hex");
  let queue = Promise.resolve(),
    closing = false,
    pendingActions = 0;
  const server = createServer(
    { maxHeaderSize: 4096, requestTimeout: 5000, headersTimeout: 5000 },
    async (req, res) => {
      req.setTimeout(5000, () => req.destroy());
      const reply = (status, value) => {
        res.writeHead(status, {
          "content-type": "application/json",
          connection: "close",
        });
        res.end(JSON.stringify(value));
      };
      if (
        closing ||
        req.socket.remoteAddress !== "127.0.0.1" ||
        req.method !== "POST" ||
        req.url !== "/v1/pg17" ||
        req.headers["content-type"] !== "application/json"
      )
        return reply(400, { error: "invalid_control_request" });
      const suppliedToken = req.headers["x-hedefora-control-token"];
      const tokenHeaders = req.rawHeaders.filter(
        (value, index) =>
          index % 2 === 0 && value.toLowerCase() === "x-hedefora-control-token",
      );
      if (
        tokenHeaders.length !== 1 ||
        typeof suppliedToken !== "string" ||
        !HEX.test(suppliedToken) ||
        !timingSafeEqual(expectedToken, Buffer.from(suppliedToken, "hex"))
      )
        return reply(400, { error: "invalid_control_request" });
      let bytes = 0,
        body = "";
      try {
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 2048) throw new Error();
          body += chunk;
        }
        req.setTimeout(0); // Body deadline ends here; the serialized action has its own run/command bounds.
        const value = JSON.parse(body);
        requireLive(
          value &&
            Object.keys(value).sort().join(",") ===
              "action,image_digest,run_id" &&
            value.run_id === runId &&
            value.image_digest === imageDigest &&
            ["start", "stop"].includes(value.action),
          "CONTROL_BINDING",
        );
        requireLive(pendingActions < 4, "CONTROL_QUEUE_BOUND");
        pendingActions++;
        const action = queue
          .then(async () => {
            requireLive(!closing, "CONTROL_CLOSED");
            await (value.action === "start" ? start() : stop());
          })
          .finally(() => {
            pendingActions--;
          });
        queue = action.catch(() => {});
        await action;
        reply(200, {
          run_id: runId,
          image_digest: imageDigest,
          action: value.action,
          state: value.action === "start" ? "accepting-scram-tls" : "stopped",
        });
      } catch {
        if (!res.headersSent) reply(503, { error: "control_action_failed" });
      }
    },
  );
  server.maxConnections = 8;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    address: `127.0.0.1:${server.address().port}`,
    async close() {
      closing = true;
      await queue;
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

// No CLI/JSON entrypoint is supplied. A trusted controller imports this function
// only after its private capability resolver and exact source preflight pass.
export async function runLivePg17({
  capability,
  authority,
  trusted,
  runLiveSqlAcceptance,
  verifyBeforeConnect,
}) {
  requireLive(process.platform === "linux", "LIVE_ENGINE_REQUIRES_LINUX");
  const budget = createRunBudget();
  requireLive(
    typeof authority?.assertCapability === "function" &&
      typeof authority?.revalidate === "function" &&
      typeof authority?.withVerifiedArchive === "function",
    "ADMISSION_AUTHORITY",
  );
  authority.assertCapability(capability); // Must throw for target-authored values.
  requireLive(
    typeof trusted?.verifySource === "function" &&
      typeof runLiveSqlAcceptance === "function" &&
      typeof verifyBeforeConnect === "function",
    "TRUSTED_PIPELINE",
  );
  const expected = structuredClone(trusted.descriptor);
  const root = await mkdtemp(join(tmpdir(), "hedefora-pg17-live-"));
  await chmod(root, 0o700);
  const privateConfig = join(root, "docker");
  await mkdir(privateConfig, { mode: 0o700 });
  const baseEnv = {
    PATH: "/usr/bin:/bin",
    HOME: root,
    DOCKER_CONFIG: privateConfig,
    DOCKER_HOST: "unix:///var/run/docker.sock",
    LC_ALL: "C",
    TZ: "UTC",
  };
  const snapshots = {};
  let descriptor,
    resources,
    controller,
    executors = [],
    orphanRisk = false,
    cleaning = false;
  let primary, negative, sqlEvidence, goEvidence, cleanupEvidence, failure;
  async function sourceCheck() {
    requireLive(
      (await trusted.verifySource()) === expected.sourceCommit,
      "SOURCE_CHANGED",
    );
  }
  const guarded = createExecutionGuard({
    authority,
    capability,
    expected,
    async verifyInputs() {
      await sourceCheck();
      for (const [name, entry] of Object.entries(snapshots))
        requireLive(
          hash(await bytesFromFile(entry.path, 4194304)) === entry.sha256,
          `SEALED_INPUT_CHANGED_${name}`,
        );
    },
  });
  async function gate() {
    budget.check();
    descriptor = await guarded();
    budget.check();
  }
  async function raw(args, options = {}) {
    if (!cleaning) budget.check();
    await verifyTool(trusted.docker);
    return command({
      executable: trusted.docker.path,
      args,
      cwd: root,
      env: { ...baseEnv, ...options.env },
      timeoutMs: cleaning
        ? (options.timeoutMs ?? 15000)
        : budget.limit(options.timeoutMs ?? 15000),
      maxBytes: options.maxBytes ?? 131072,
      input: options.input,
    });
  }
  async function checked(args, options = {}) {
    const result = await raw(args, options);
    requireLive(
      result.rawExit === 0 && result.origin === "exit",
      "DOCKER_COMMAND_FAILED",
    );
    return result;
  }
  const labels = () => [
    "--label",
    `${LABEL}=${descriptor.runId}`,
    "--label",
    OWNER,
  ];
  const nameFor = (suffix) => `ho-pg17-${descriptor.runId}-${suffix}`;
  async function createResource(kind, suffix, extra = [], env = {}) {
    await gate();
    const name = nameFor(suffix);
    // Refuse an existing name even if a matching label was forged externally.
    requireLive(
      (await resources.inspect({ kind, name, id: null })) === null,
      "RESOURCE_NAME_EXISTS",
    );
    const item = resources.intend(kind, name);
    const args =
      kind === "container"
        ? ["container", "create", "--name", item.name, ...labels(), ...extra]
        : [kind, "create", ...labels(), ...extra, item.name];
    await gate();
    const result = await checked(args, { timeoutMs: 30000, env });
    const id = result.stdout.trim();
    requireLive(
      kind === "volume" ? id === item.name : /^[a-f0-9]{64}$/.test(id),
      "RESOURCE_ACK",
    );
    item.id = id;
    await resources.inspect(item);
    return item;
  }
  const isolated = [
    "--pull=never",
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--memory=512m",
    "--memory-swap=512m",
    "--cpus=1",
    "--pids-limit=128",
  ];
  async function helper(suffix, args, env = {}) {
    const item = await createResource("container", suffix, args, env);
    await gate();
    await checked(["container", "start", item.id]);
    const result = await checked(["container", "wait", item.id], {
      timeoutMs: 120000,
    });
    requireLive(result.stdout.trim() === "0", "TOOL_HELPER_FAILED");
    return item;
  }
  async function initializeVolume(volume, suffix) {
    await helper(suffix, [
      ...isolated,
      "--network=none",
      "--user=0:0",
      "--cap-add=CHOWN",
      "--mount",
      `type=volume,src=${volume.name},dst=/fixture`,
      "--entrypoint=/bin/sh",
      GO_IMAGE,
      "-ec",
      "chmod 0700 /fixture\nchown 70:70 /fixture",
    ]);
  }
  async function executorFor(item, passwords, socketOnly = false) {
    const value = createPsqlExecutor({
      containerId: item.id,
      runId: descriptor.runId,
      passwords,
      socketOnly,
      commandBudget: budget.limit,
      markOrphanRisk() {
        orphanRisk = true;
      },
      docker(args, options) {
        // Source/tool/image validation precedes matrix entry; no target callbacks
        // are invoked between this exact argument construction and spawn.
        return startProcess({
          executable: trusted.docker.path,
          args,
          cwd: root,
          env: { ...baseEnv, ...options.env },
          timeoutMs: options.timeoutMs,
          maxBytes: options.maxBytes,
          ...(Object.hasOwn(options, "input") ? { input: options.input } : {}),
        });
      },
      async readLogs({ since }) {
        await resources.inspect(item);
        const result = await checked([
          "container",
          "logs",
          "--since",
          since,
          "--tail",
          "200",
          item.id,
        ]);
        requireLive(
          Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr) <=
            131072,
          "SERVER_LOG_BOUND",
        );
        return result.stdout + result.stderr;
      },
    });
    executors.push(value);
    return value;
  }
  async function readiness(executor, ssl, timeoutMs = 45000) {
    const began = Date.now();
    while (Date.now() - began < timeoutMs) {
      const result = await executor.psql({
        caseId: "engine.readiness",
        role: "admin",
        database: "hedefora_dev",
        timeoutMs: 4000,
        inputSql:
          "SELECT json_build_object('version',current_setting('server_version_num')::int,'ssl',current_setting('ssl'),'auth',system_user);",
      });
      if (result.rawExit === 0) {
        let row;
        try {
          row = JSON.parse(result.stdout.trim());
        } catch {
          throw new LiveError("READINESS_FORMAT");
        }
        requireLive(
          row.version === 170011 &&
            row.ssl === ssl &&
            row.auth === "scram-sha-256:hedefora_dev",
          "READINESS_IDENTITY",
        );
        return;
      }
      // Startup connection refusal is expected here, not a matrix SQL result.
      await delay(200);
    }
    throw new LiveError("READINESS_TIMEOUT");
  }
  try {
    await gate();
    await verifyTool(trusted.docker);
    await verifyTool(trusted.go);
    requireLive(trusted.goImage === GO_IMAGE, "GO_TOOLING_PIN");
    for (const name of [
      "entrypoint",
      "roles",
      "tlsGenerator",
      "manifest",
      "config",
    ]) {
      const input = trusted.inputs[name];
      const bytes = await verifyInputBinding(input);
      const path = join(root, name);
      const file = await open(
        path,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
        0o444,
      );
      try {
        await file.writeFile(bytes);
      } finally {
        await file.close();
      }
      snapshots[name] = { path, sha256: input.sha256 };
    }
    requireLive(
      `sha256:${snapshots.manifest.sha256}` ===
        descriptor.imageManifestDigest &&
        `sha256:${snapshots.config.sha256}` === descriptor.imageConfigDigest,
      "IMAGE_INPUT_BINDING",
    );
    const config = JSON.parse(await readFile(snapshots.config.path, "utf8"));
    const manifest = JSON.parse(
      await readFile(snapshots.manifest.path, "utf8"),
    );
    validateImageMetadata(
      config,
      manifest,
      descriptor,
      trusted.imageBootstrapProfile,
    );
    await gate();
    // The resolver owns both archive hash verification and the retained fd.
    // A load receives that same stream, not a reopened attacker-controlled path.
    await authority.withVerifiedArchive(capability, async (stream) => {
      requireLive(
        stream && typeof stream.pipe === "function",
        "ARCHIVE_STREAM",
      );
      await gate();
      await checked(["image", "load"], { input: stream, timeoutMs: 120000 });
    });
    const inspect = JSON.parse(
      (
        await checked(["image", "inspect", descriptor.dockerImageId], {
          maxBytes: 1048576,
        })
      ).stdout,
    );
    requireLive(
      inspect.length === 1 &&
        inspect[0].Id === descriptor.imageConfigDigest &&
        inspect[0].Os === "linux" &&
        inspect[0].Architecture === "amd64" &&
        inspect[0].Config?.User === "70:70" &&
        JSON.stringify(inspect[0].RootFS?.Layers) ===
          JSON.stringify(config.rootfs.diff_ids) &&
        JSON.stringify(inspect[0].Config.Entrypoint) ===
          JSON.stringify(config.config.Entrypoint) &&
        JSON.stringify(inspect[0].Config.Cmd) ===
          JSON.stringify(config.config.Cmd) &&
        JSON.stringify(inspect[0].Config.Env) ===
          JSON.stringify(config.config.Env) &&
        inspect[0].Config.WorkingDir === "/" &&
        inspect[0].Config.StopSignal === "SIGINT",
      "LOADED_IMAGE_IDENTITY",
    );
    requireLive(
      (
        await checked(["version", "--format", "{{.Client.Version}}"])
      ).stdout.trim() === "29.7.2",
      "DOCKER_VERSION",
    );
    const version = await command({
      executable: trusted.go.path,
      args: ["version"],
      env: baseEnv,
      cwd: root,
      timeoutMs: 10000,
    });
    requireLive(
      version.rawExit === 0 &&
        /^go version go1\.26\.7 linux\/amd64\s*$/.test(version.stdout),
      "GO_VERSION",
    );
    resources = new OwnedResources(descriptor.runId, raw);
    const network = await createResource("network", "net", ["--internal"]);
    const tls = await createResource("volume", "tls");
    await initializeVolume(tls, "tls-owner");
    const tlsHelper = await helper(
      "tls-generate",
      [
        ...isolated,
        "--network=none",
        "--user=70:70",
        "--tmpfs",
        "/tmp:rw,exec,nosuid,nodev,size=512m,mode=0700,uid=70,gid=70",
        "--mount",
        `type=volume,src=${tls.name},dst=/tmp/fixture`,
        "--mount",
        `type=bind,src=${snapshots.tlsGenerator.path},dst=/source/main.go,readonly`,
        "--env",
        "GOTOOLCHAIN",
        "--env",
        "GOENV",
        "--env",
        "GOWORK",
        "--env",
        "GOPROXY",
        "--env",
        "GOSUMDB",
        "--env",
        "GOCACHE",
        "--entrypoint=/usr/local/go/bin/go",
        GO_IMAGE,
        "run",
        "/source/main.go",
        "-output-dir",
        "/tmp/fixture/tls",
      ],
      {
        GOTOOLCHAIN: "local",
        GOENV: "off",
        GOWORK: "off",
        GOPROXY: "off",
        GOSUMDB: "off",
        GOCACHE: "/tmp/gocache",
      },
    );
    const caPath = join(root, "ca.crt"),
      wrongCaPath = join(root, "wrong-ca.crt");
    for (const [source, target] of [
      ["ca.crt", caPath],
      ["wrong-ca.crt", wrongCaPath],
    ]) {
      await checked([
        "container",
        "cp",
        `${tlsHelper.id}:/tmp/fixture/tls/${source}`,
        target,
      ]);
      await chmod(target, 0o600);
      const cert = await bytesFromFile(target, 16384);
      requireLive(
        cert.toString().startsWith("-----BEGIN CERTIFICATE-----"),
        "PUBLIC_CA_COPY",
      );
    }
    const { passwords, controlToken } = createPrivateRunSecrets();
    const bootstrapEnv = {
      HEDEFORA_DEV_POSTGRES_PASSWORD: passwords.admin,
      HEDEFORA_DEV_POSTGRES_MIGRATION_PASSWORD: passwords.migration,
      HEDEFORA_DEV_POSTGRES_APP_PASSWORD: passwords.app,
      HEDEFORA_DEV_POSTGRES_WORKER_PASSWORD: passwords.worker,
    };
    async function database(suffix, ssl) {
      const data = await createResource("volume", `${suffix}-data`);
      await initializeVolume(data, `${suffix}-owner`);
      const args = [
        ...isolated,
        "--network",
        network.id,
        "--user=70:70",
        "--publish",
        "127.0.0.1::5432",
        "--tmpfs",
        "/run/postgresql:rw,noexec,nosuid,nodev,size=16m,mode=0700,uid=70,gid=70",
        "--tmpfs",
        "/tmp:rw,noexec,nosuid,nodev,size=16m,mode=0700,uid=70,gid=70",
        "--mount",
        `type=volume,src=${data.name},dst=/var/lib/postgresql/data`,
        "--mount",
        `type=volume,src=${tls.name},dst=/fixture,readonly`,
        "--mount",
        `type=bind,src=${snapshots.roles.path},dst=/docker-entrypoint-initdb.d/010_roles.sql,readonly`,
      ];
      for (const key of Object.keys(bootstrapEnv)) args.push("--env", key);
      args.push(
        "--entrypoint=/usr/local/bin/hedefora-postgres",
        descriptor.dockerImageId,
        "postgres",
        "-c",
        `ssl=${ssl}`,
        "-c",
        "ssl_cert_file=/fixture/tls/server.crt",
        "-c",
        "ssl_key_file=/fixture/tls/server.key",
        "-c",
        "ssl_min_protocol_version=TLSv1.2",
        "-c",
        "log_line_prefix=%a %e ",
        "-c",
        "log_error_verbosity=verbose",
        "-c",
        "log_statement=none",
        "-c",
        "log_min_error_statement=panic",
        "-c",
        "log_parameter_max_length=0",
        "-c",
        "log_parameter_max_length_on_error=0",
        "-c",
        "max_connections=32",
      );
      await gate();
      requireLive(
        (await resources.inspect({
          kind: "container",
          name: nameFor(suffix),
          id: null,
        })) === null,
        "RESOURCE_NAME_EXISTS",
      );
      const item = resources.intend("container", nameFor(suffix));
      await gate();
      const result = await checked(
        ["container", "create", "--name", item.name, ...labels(), ...args],
        { env: bootstrapEnv, timeoutMs: 30000 },
      );
      requireLive(/^[a-f0-9]{64}$/.test(result.stdout.trim()), "RESOURCE_ACK");
      item.id = result.stdout.trim();
      await resources.inspect(item);
      await gate();
      await checked(["container", "start", item.id]);
      return item;
    }
    primary = await database("tls-pg", "on");
    negative = await database("plain-negative-pg", "off");
    const mainExecutor = await executorFor(primary, passwords);
    const negativeExecutor = await executorFor(negative, passwords, true);
    await readiness(mainExecutor, "on");
    await readiness(negativeExecutor, "off");
    async function startPrimary() {
      await gate();
      const state = await resources.inspect(primary);
      if (!state.State?.Running)
        await checked(["container", "start", primary.id]);
      await readiness(mainExecutor, "on", 10000);
    }
    async function stopPrimary() {
      const state = await resources.inspect(primary);
      if (state.State?.Running)
        await checked(["container", "stop", "--time", "5", primary.id], {
          timeoutMs: 10000,
        });
      requireLive(
        (await resources.inspect(primary)).State?.Running === false,
        "STOP_NOT_ACKNOWLEDGED",
      );
    }
    controller = await createLifecycleController({
      runId: descriptor.runId,
      imageDigest: descriptor.imageManifestDigest,
      controlToken,
      start: startPrimary,
      stop: stopPrimary,
    });
    async function port(item) {
      const state = await resources.inspect(item);
      const mapping = state.NetworkSettings?.Ports?.["5432/tcp"];
      requireLive(
        Array.isArray(mapping) &&
          mapping.length === 1 &&
          mapping[0].HostIp === "127.0.0.1" &&
          /^[0-9]+$/.test(mapping[0].HostPort) &&
          +mapping[0].HostPort > 0 &&
          +mapping[0].HostPort <= 65535,
        "LOOPBACK_PORT",
      );
      return +mapping[0].HostPort;
    }
    const fixture = {
      schema: "hedefora.pg17.integration.v2",
      run_id: descriptor.runId,
      source_sha: descriptor.sourceCommit,
      image_digest: descriptor.imageManifestDigest,
      synthetic_only: true,
      host: "127.0.0.1",
      tls_port: await port(primary),
      plaintext_port: await port(negative),
      root_ca_pem: await readFile(caPath, "utf8"),
      password: passwords.app,
      control_address: controller.address,
      control_token: controlToken,
    };
    requireLive(fixture.tls_port !== fixture.plaintext_port, "PORT_COLLISION");
    const fixturePath = join(root, "pg17-integration.json");
    const fixtureFile = await open(
      fixturePath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
      0o600,
    );
    try {
      await fixtureFile.writeFile(JSON.stringify(fixture));
    } finally {
      await fixtureFile.close();
    }
    await gate();
    sqlEvidence = await runLiveSqlAcceptance({
      verifyBeforeConnect,
      psql: mainExecutor.psql,
      openSession: mainExecutor.openSession,
    });
    requireLive(
      sqlEvidence?.status === "PASS" &&
        sqlEvidence?.scope === "actual-postgresql-engine-sql-only",
      "SQL_GATE_FAILED",
    );
    await gate();
    await verifyTool(trusted.go);
    const result = await command({
      executable: trusted.go.path,
      cwd: trusted.repositoryPath,
      args: [
        "test",
        "-json",
        "-tags=integration",
        "-p=1",
        "-parallel=1",
        "-count=1",
        "-shuffle=on",
        "-race",
        "-timeout=120s",
        "-run=^TestPG17",
        "./internal/platform/postgres",
        "./internal/platform/app",
      ],
      env: {
        PATH: "/usr/bin:/bin",
        HOME: root,
        TMPDIR: root,
        LC_ALL: "C",
        TZ: "UTC",
        GOTOOLCHAIN: "local",
        GOENV: "off",
        GOWORK: "off",
        GOPROXY: "off",
        GOSUMDB: "off",
        GOCACHE: join(root, "gocache"),
        GOMODCACHE: trusted.goModuleCache,
        GOFLAGS: "-mod=readonly",
        HEDEFORA_PG17_TEST_ADMISSION: "admitted-disposable-pg17-v1",
        HEDEFORA_PG17_TEST_FIXTURE: fixturePath,
        HEDEFORA_PG17_TEST_SOURCE_SHA: descriptor.sourceCommit,
        HEDEFORA_PG17_TEST_IMAGE_DIGEST: descriptor.imageManifestDigest,
      },
      timeoutMs: budget.limit(280000),
      maxBytes: 1048576,
    });
    requireLive(
      result.rawExit === 0 && result.origin === "exit",
      "GO_LIVE_GATE_FAILED",
    );
    const passed = new Set();
    let skipped = 0;
    for (const line of result.stdout.trim().split("\n")) {
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        throw new LiveError("GO_RESULT_FORMAT");
      }
      if (event.Action === "skip") skipped++;
      if (event.Action === "pass" && event.Test && !event.Test.includes("/"))
        passed.add(event.Test);
    }
    requireLive(
      skipped === 0 &&
        passed.size === expectedTests.size &&
        [...expectedTests].every((name) => passed.has(name)),
      "GO_REQUIRED_TESTS",
    );
    goEvidence = {
      status: "PASS",
      goVersion: "go1.26.7",
      requiredTests: [...passed],
      skipped,
    };
    requireLive(!orphanRisk, "EXEC_LIFETIME_UNPROVEN");
    budget.check();
  } catch (error) {
    failure = error instanceof LiveError ? error.code : "LIVE_GATE_FAILED";
  } finally {
    cleaning = true; // Cleanup is permitted even after global/admission expiry.
    try {
      await controller?.close();
      for (const executor of executors) await executor.closeAll();
    } catch {
      failure = "SESSION_CLEANUP_FAILED";
    }
    try {
      cleanupEvidence = resources
        ? await resources.cleanup()
        : { status: "PASS", ownedResources: 0 };
    } catch {
      failure = "OWNED_CLEANUP_FAILED";
    }
  }
  // The private TEMP directory contains synthetic credentials only. Retained
  // evidence is a redacted structured receipt; keys never left the TLS volume.
  requireLive(
    !failure && !orphanRisk,
    failure ?? (orphanRisk ? "EXEC_LIFETIME_UNPROVEN" : "LIVE_GATE_FAILED"),
  );
  return Object.freeze({
    status: "PASS",
    scope: "disposable-pg17-live",
    runId: descriptor.runId,
    sourceCommit: descriptor.sourceCommit,
    imageManifestDigest: descriptor.imageManifestDigest,
    sql: sqlEvidence,
    go: goEvidence,
    cleanup: cleanupEvidence,
  });
}
