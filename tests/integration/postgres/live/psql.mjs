import { randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";
import { requireLive, correlatedSqlState } from "./process.mjs";

const ROLES = Object.freeze({
  admin: "hedefora_dev",
  migration: "hedefora_migration",
  app: "hedefora_app",
  worker: "hedefora_worker",
  readonly: "hedefora_readonly",
});
const DATABASES = new Set(["hedefora_dev", "postgres", "template1"]);
const VARIABLES = new Set(["migration_checksum", "expected_up_checksum"]);
export function validateSqlRequest(request, persistent = false) {
  requireLive(
    request && /^[a-z][a-z0-9.-]{0,95}$/.test(request.caseId),
    "SQL_CASE_ID",
  );
  requireLive(
    Object.hasOwn(ROLES, request.role) &&
      DATABASES.has(request.database ?? "hedefora_dev"),
    "SQL_IDENTITY",
  );
  requireLive(
    Number.isInteger(request.timeoutMs) &&
      request.timeoutMs > 0 &&
      request.timeoutMs <= (persistent ? 45000 : 22000),
    "SQL_TIMEOUT",
  );
  const variables = request.variables ?? {};
  requireLive(
    variables &&
      !Array.isArray(variables) &&
      Object.entries(variables).every(
        ([key, value]) =>
          VARIABLES.has(key) &&
          typeof value === "string" &&
          (/^[a-f0-9]{64}$/.test(value) || value === "invalid_checksum"),
      ),
    "SQL_VARIABLES",
  );
  if (!persistent) validateSql(request.inputSql);
}
function validateSql(sql) {
  requireLive(
    typeof sql === "string" &&
      Buffer.byteLength(sql) <= 262144 &&
      !sql.includes("\0"),
    "SQL_INPUT",
  );
  // Only exact, reviewed in-process matrix SQL is accepted by the launcher.
  // This additional boundary rejects psql OS/file/process controls, including
  // inline escapes. It is not a parser or an authority for untrusted SQL.
  requireLive(
    !/\\(?:!|copy\b|include\b|i\b|ir\b|o\b|out\b|w\b|gexec\b|connect\b|c\b|quit\b|q\b|echo\b)/i.test(
      sql,
    ),
    "SQL_META_COMMAND",
  );
  requireLive(!/\bCOPY\s+[\s\S]*?\bPROGRAM\b/i.test(sql), "SQL_PROGRAM");
}

// docker is a private, root-reviewed lifecycle transport; it accepts only exact
// argv and explicit env. readLogs returns bounded memory, never an artifact.
export function createPsqlExecutor({
  docker,
  containerId,
  runId,
  passwords,
  readLogs,
  markOrphanRisk,
  socketOnly = false,
  commandBudget = (requested) => requested,
}) {
  requireLive(
    /^[a-f0-9]{64}$/.test(containerId) && /^[a-f0-9]{32}$/.test(runId),
    "SQL_CONTAINER",
  );
  requireLive(typeof docker === "function", "SQL_TRANSPORT");
  return createPsqlCore({
    runId,
    passwords,
    readLogs,
    markOrphanRisk,
    commandBudget,
    host: socketOnly ? "/run/postgresql" : "127.0.0.1",
    sslMode: socketOnly ? "disable" : "verify-full",
    launchClient(args, options) {
      const prefix = ["exec", "-i", "--user", "70:70"];
      for (const key of Object.keys(options.env)) prefix.push("--env", key);
      return docker(
        [...prefix, containerId, "/usr/libexec/postgresql17/psql", ...args],
        options,
      );
    },
  });
}

// Shared SQL validation/framing/evidence core. Native and Docker transports
// supply their real child launcher; neither transport emulates the other.
export function createPsqlCore({
  launchClient,
  runId,
  passwords,
  readLogs,
  markOrphanRisk,
  commandBudget = (requested) => requested,
  host = "127.0.0.1",
  port = "5432",
  sslMode = "verify-full",
}) {
  requireLive(/^[a-f0-9]{32}$/.test(runId), "SQL_CONTAINER");
  requireLive(
    typeof launchClient === "function" &&
      typeof readLogs === "function" &&
      typeof markOrphanRisk === "function",
    "SQL_TRANSPORT",
  );
  let serial = 0;
  const active = new Set();
  function launch(request, persistent) {
    validateSqlRequest(request, persistent);
    const timeoutMs = commandBudget(request.timeoutMs);
    requireLive(++serial < 10000000, "SQL_SESSION_LIMIT");
    const application = `ho_${runId.slice(0, 16)}_${serial}`;
    const env = {
      PGHOST: host,
      PGPORT: port,
      PGUSER: ROLES[request.role],
      PGDATABASE: request.database ?? "hedefora_dev",
      PGPASSWORD: passwords[request.role],
      PGAPPNAME: application,
      PGSSLMODE: sslMode,
      PGSSLROOTCERT: "/fixture/tls/ca.crt",
      PGSSLMINPROTOCOLVERSION: "TLSv1.2",
      PGREQUIREAUTH: "scram-sha-256",
      PGCONNECT_TIMEOUT: "3",
      PGGSSENCMODE: "disable",
      PGPASSFILE: "/dev/null",
      PGSERVICEFILE: "/dev/null",
      PGSYSCONFDIR: "/nonexistent",
      HOME: "/nonexistent",
      LC_ALL: "C",
      TZ: "UTC",
    };
    requireLive(
      typeof env.PGPASSWORD === "string" &&
        /^synthetic-pg17-[a-f0-9]{64}$/.test(env.PGPASSWORD),
      "SYNTHETIC_CREDENTIAL_REQUIRED",
    );
    const args = [
      "-X",
      "-Atq",
      "-w",
      "--set=ON_ERROR_STOP=1",
      "--set=VERBOSITY=sqlstate",
    ];
    for (const [key, value] of Object.entries(request.variables ?? {}))
      args.push(`--set=${key}=${value}`);
    const since = new Date().toISOString();
    const process = launchClient(args, {
      env,
      timeoutMs,
      maxBytes: 131072,
      ...(persistent ? {} : { input: request.inputSql }),
    });
    active.add(process);
    const terminal = process.closed.then(async (result) => {
      active.delete(process);
      if (result.origin !== "exit" || result.rawExit < 0) {
        markOrphanRisk();
        return {
          ...publicResult(result),
          origin: result.origin,
          sqlState: null,
        };
      }
      if (result.rawExit === 0)
        return { ...publicResult(result), origin: "postgres", sqlState: null };
      let sqlState = null;
      try {
        sqlState = correlatedSqlState(
          await readLogs({ since, application }),
          application,
        );
      } catch {
        /* fail closed */
      }
      return {
        ...publicResult(result),
        origin: sqlState ? "postgres" : "channel",
        sqlState,
      };
    });
    return { process, terminal };
  }
  async function psql(request) {
    return launch(request, false).terminal;
  }
  async function openSession(request) {
    const { process, terminal } = launch(request, true);
    let pending = null,
      finished = null,
      disconnecting = false;
    let buffer = "";
    const unsubscribe = process.onOutput((kind, text) => {
      if (kind !== "stdout") return;
      buffer += text;
      if (!pending) return;
      const lines = buffer.split("\n");
      const markerIndex = lines.findIndex(
        (line, index) =>
          index < lines.length - 1 &&
          line.replace(/\r$/, "") === pending.marker,
      );
      if (markerIndex < 0) return;
      // Any output after the marker is retained for the next frame.
      const stdout = lines.slice(0, markerIndex).join("\n");
      buffer = lines.slice(markerIndex + 1).join("\n");
      const current = pending;
      pending = null;
      clearTimeout(current.timer);
      current.resolve({
        rawExit: 0,
        sqlState: null,
        origin: "postgres",
        stdout,
        elapsedMs: performance.now() - current.began,
        connectionClosed: false,
      });
    });
    const closed = terminal.then((result) => {
      finished = result;
      unsubscribe();
      if (pending) {
        const current = pending;
        pending = null;
        clearTimeout(current.timer);
        current.resolve({
          ...result,
          stdout: buffer,
          elapsedMs: performance.now() - current.began,
        });
      }
      return result;
    });
    return Object.freeze({
      closed,
      async query(sql, { caseId, timeoutMs }) {
        validateSqlRequest({ ...request, caseId, timeoutMs, inputSql: sql });
        timeoutMs = commandBudget(timeoutMs);
        requireLive(!pending && !disconnecting, "SQL_CONCURRENT_QUERY");
        if (finished) return { ...finished, elapsedMs: 0 };
        const marker = `ho_frame_${randomBytes(16).toString("hex")}`;
        return new Promise((resolve) => {
          pending = {
            marker,
            resolve,
            began: performance.now(),
            timer: setTimeout(() => process.cancel("timeout"), timeoutMs),
          };
          try {
            process.write(`${sql}\n\\echo ${marker}\n`);
          } catch {
            process.cancel("channel");
          }
        });
      },
      async disconnect() {
        if (!disconnecting) {
          disconnecting = true;
          process.end();
        }
        const timer = setTimeout(() => process.cancel("cancel"), 1500);
        const result = await closed;
        clearTimeout(timer);
        return { closed: result.connectionClosed === true };
      },
    });
  }
  async function closeAll() {
    for (const process of active) process.cancel("cancel");
    await Promise.all([...active].map((process) => process.closed));
  }
  return Object.freeze({ psql, openSession, closeAll });
}
function publicResult({ rawExit, stdout, elapsedMs, connectionClosed }) {
  return { rawExit, stdout, elapsedMs, connectionClosed };
}
