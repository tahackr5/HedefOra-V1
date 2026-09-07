import { createPsqlCore } from "./psql.mjs";
import { startProcess, correlatedSqlState, requireLive } from "./process.mjs";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";

export const PG_BIN = "/usr/lib/postgresql/17/bin";
const ROLE_USERS = Object.freeze({
  admin: "hedefora_dev",
  migration: "hedefora_migration",
  app: "hedefora_app",
  worker: "hedefora_worker",
  readonly: "hedefora_readonly",
});
const DATABASES = new Set(["hedefora_dev", "postgres", "template1"]);
const startupCases = new Map([
  [
    "roles.readonly.login-denied",
    {
      role: "readonly",
      database: "hedefora_dev",
      messages: {
        28000: 'role "hedefora_readonly" is not permitted to log in',
        "28P01": 'password authentication failed for user "hedefora_readonly"',
      },
    },
  ],
  ...["migration", "app", "worker"].flatMap((role) =>
    ["postgres", "template1"].map((database) => [
      `roles.${role}.${database}-connect-denied`,
      {
        role,
        database,
        messages: { 42501: `permission denied for database "${database}"` },
      },
    ]),
  ),
]);
const startupPairs = new Set(
  [...startupCases.values()].map(({ role, database }) => `${role}:${database}`),
);

// Ordinary SQL errors still require their exact application name. The native
// transport alone removes the fixed identity field after matching launch env;
// legacy or malformed target-application lines cannot supply partial evidence.
export function normalizeNativeLogs(logs, { application, user, database }) {
  requireLive(
    typeof logs === "string" &&
      logs.length <= 131072 &&
      Buffer.byteLength(logs) <= 131072 &&
      typeof application === "string" &&
      /^ho_[a-f0-9]{16}_[0-9]{1,7}$/.test(application) &&
      Object.values(ROLE_USERS).includes(user) &&
      DATABASES.has(database),
    "SQL_NATIVE_LOG_IDENTITY",
  );
  const normalized = [];
  const lines = logs.split("\n"),
    tail = lines.pop();
  for (const line of lines) {
    if (!line.startsWith(`${application} `)) continue;
    const match =
      /^(ho_[a-f0-9]{16}_[0-9]{1,7}) ([0-9A-Z]{5}) \[fixture:(hedefora_(?:dev|migration|app|worker|readonly)):(hedefora_dev|postgres|template1)\] ((?:DEBUG[1-5]|INFO|NOTICE|WARNING|ERROR|LOG|FATAL|PANIC|DETAIL|HINT|QUERY|CONTEXT|LOCATION|STATEMENT):.*)$/.exec(
        line,
      );
    requireLive(
      match && match[3] === user && match[4] === database,
      "SQL_NATIVE_LOG_IDENTITY",
    );
    normalized.push(`${match[1]} ${match[2]} ${match[5]}`);
  }
  // A later partial tail must not hide an already complete malformed line.
  requireLive(
    !tail || (!tail.startsWith(application) && !application.startsWith(tail)),
    "SQL_NATIVE_LOG_PARTIAL",
  );
  return normalized.join("\n");
}
export const NATIVE_FAILURE_CATEGORIES = Object.freeze([
  "NOT_RUN",
  "SUCCESS",
  "SPAWN_OR_CHANNEL",
  "TIMEOUT",
  "AUTHENTICATION",
  "TLS",
  "CONNECT",
  "CLIENT_CONFIGURATION",
  "SERVER_SQL_OTHER",
]);

// Diagnostic categories are not SQLSTATE or engine evidence. Never return any
// part of stderr, stdout, SQL, environment, or the supplied object itself.
export function classifyNativeFailure(result) {
  if (result === undefined || result === null) return "NOT_RUN";
  if (typeof result !== "object" || Array.isArray(result))
    return "SPAWN_OR_CHANNEL";
  if (result.origin === "timeout") return "TIMEOUT";
  if (
    result.origin !== "exit" ||
    result.connectionClosed !== true ||
    !Number.isInteger(result.rawExit) ||
    result.rawExit < 0 ||
    result.rawExit > 255
  )
    return "SPAWN_OR_CHANNEL";
  const stderr = result.stderr ?? "";
  if (
    typeof stderr !== "string" ||
    stderr.length > 131072 ||
    Buffer.byteLength(stderr) > 131072
  )
    return "SPAWN_OR_CHANNEL";
  if (result.rawExit === 0) return "SUCCESS";
  const text = stderr.toLowerCase();
  const contains = (phrases) => phrases.some((phrase) => text.includes(phrase));
  if (contains(["error while loading shared libraries", "exec format error"]))
    return "SPAWN_OR_CHANNEL";
  if (
    contains([
      "invalid value",
      "unrecognized parameter",
      "invalid connection option",
    ])
  )
    return "CLIENT_CONFIGURATION";
  if (
    contains([
      "password authentication failed",
      "no password supplied",
      "sasl authentication failed",
      "authentication method requirement",
    ])
  )
    return "AUTHENTICATION";
  if (
    contains([
      "certificate verify failed",
      "root certificate file",
      "server certificate",
      "ssl error",
      "ssl connection",
      "ssl is not enabled",
      "server does not support ssl",
      "could not establish ssl",
      "could not read certificate",
      "could not load ssl",
      "tlsv1 alert",
    ])
  )
    return "TLS";
  if (
    contains([
      "connection refused",
      "no such file or directory",
      "connection timed out",
      "timeout expired",
      "could not connect to server",
    ])
  )
    return "CONNECT";
  return "SERVER_SQL_OTHER";
}

// Only the SSL-off witness uses a private Unix socket. All SQL-matrix and
// primary-readiness clients authenticate over loopback TLS with SCRAM.
export function createNativePsqlExecutor({
  negative = false,
  start = startProcess,
  readLogs,
  logSnapshot,
  ...options
}) {
  requireLive(typeof readLogs === "function", "SQL_TRANSPORT");
  let lastFailure = "NOT_RUN",
    active = 0,
    unsafeLifetime = false,
    startupProof = null,
    launchOwner = null;
  const attempted = new Set(),
    identities = new Map();
  function invoke(method, request, owner) {
    const previous = launchOwner;
    launchOwner = owner;
    try {
      return core[method](request);
    } finally {
      launchOwner = previous;
    }
  }
  function release(owner) {
    for (const application of owner) identities.delete(application);
  }
  function snapshot() {
    try {
      requireLive(
        typeof logSnapshot === "function",
        "SQL_NATIVE_STARTUP_LOG_REQUIRED",
      );
      const value = logSnapshot();
      requireLive(
        value &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          Object.keys(value).sort().join(",") === "evicted,generation,text" &&
          typeof value.generation === "string" &&
          /^[a-f0-9]{32}$/.test(value.generation) &&
          value.evicted === false &&
          typeof value.text === "string" &&
          value.text.length <= 131072 &&
          Buffer.byteLength(value.text) <= 131072 &&
          (value.text === "" || value.text.endsWith("\n")),
        "SQL_NATIVE_STARTUP_LOG_INVALID",
      );
      return Object.freeze({
        generation: value.generation,
        evicted: false,
        text: value.text,
      });
    } catch {
      requireLive(false, "SQL_NATIVE_STARTUP_LOG_INVALID");
    }
  }
  const core = createPsqlCore({
    ...options,
    host: negative ? "/fixture/negative" : "127.0.0.1",
    port: negative ? "5433" : "5432",
    sslMode: negative ? "disable" : "verify-full",
    async readLogs(request) {
      // The postmaster stderr pipe and psql close event are independent. Await
      // the matching server record briefly instead of guessing from stderr or
      // depending on event-loop delivery order. The callback itself is bounded.
      const deadline = performance.now() + 500;
      let invalid = null,
        tainted = false;
      while (true) {
        let logs = null;
        try {
          logs = normalizeNativeLogs(await readLogs(request), {
            application: request.application,
            ...identities.get(request.application),
          });
        } catch (error) {
          invalid = error;
          if (error?.code !== "SQL_NATIVE_LOG_PARTIAL") tainted = true;
        }
        if (
          logs !== null &&
          !tainted &&
          correlatedSqlState(logs, request.application)
        )
          return logs;
        if (performance.now() >= deadline) {
          if (tainted || logs === null) throw invalid;
          return logs;
        }
        await delay(10);
      }
    },
    launchClient(args, processOptions) {
      const proof = startupProof;
      const application = processOptions.env.PGAPPNAME;
      try {
        requireLive(
          launchOwner && identities.size < 256 && !identities.has(application),
          "SQL_NATIVE_LOG_IDENTITY_BOUND",
        );
        identities.set(application, {
          user: processOptions.env.PGUSER,
          database: processOptions.env.PGDATABASE,
        });
        launchOwner.add(application);
        const child = start({
          ...processOptions,
          executable: `${PG_BIN}/psql`,
          args,
          cwd: "/fixture",
        });
        return Object.freeze({
          ...child,
          closed: child.closed.then(
            (result) => {
              lastFailure = classifyNativeFailure(result);
              if (result.connectionClosed !== true) unsafeLifetime = true;
              if (proof) {
                proof.raw = result;
                proof.closedAt = performance.now();
              }
              return result;
            },
            (error) => {
              lastFailure = "SPAWN_OR_CHANNEL";
              unsafeLifetime = true;
              throw error;
            },
          ),
        });
      } catch (error) {
        lastFailure = "SPAWN_OR_CHANNEL";
        unsafeLifetime = true;
        throw error;
      }
    },
  });
  function startupRequest(request) {
    const claimed = startupCases.get(request?.caseId);
    const role = request?.role,
      database = request?.database ?? "hedefora_dev";
    const actual =
      Object.hasOwn(ROLE_USERS, role) && DATABASES.has(database)
        ? `${role}:${database}`
        : null;
    const protectedRequest = Boolean(
      claimed || role === "readonly" || startupPairs.has(actual),
    );
    const keys = new Set();
    if (actual && (role === "readonly" || database !== "hedefora_dev"))
      keys.add(actual);
    if (role === "readonly") keys.add("readonly:hedefora_dev");
    if (claimed) keys.add(`${claimed.role}:${claimed.database}`);
    const previous = [...keys].some((key) => attempted.has(key));
    for (const key of keys) attempted.add(key);
    if (protectedRequest)
      requireLive(!previous, "SQL_NATIVE_STARTUP_ALREADY_ATTEMPTED");
    return { claimed, protectedRequest };
  }
  async function psql(request) {
    const { claimed, protectedRequest } = startupRequest(request);
    requireLive(startupProof === null, "SQL_NATIVE_STARTUP_EXCLUSIVE");
    const owner = new Set();
    if (!protectedRequest) {
      active++;
      try {
        return await invoke("psql", request, owner);
      } finally {
        active--;
        release(owner);
      }
    }
    requireLive(
      !negative &&
        claimed &&
        request.role === claimed.role &&
        (request.database === undefined ||
          request.database === claimed.database) &&
        (request.database ?? "hedefora_dev") === claimed.database &&
        request.inputSql === "SELECT 1;" &&
        (request.variables === undefined ||
          (request.variables !== null &&
            typeof request.variables === "object" &&
            !Array.isArray(request.variables) &&
            Object.keys(request.variables).length === 0)),
      "SQL_NATIVE_STARTUP_REQUEST",
    );
    requireLive(
      active === 0 && !unsafeLifetime,
      "SQL_NATIVE_STARTUP_EXCLUSIVE",
    );
    const proof = { raw: null, closedAt: null };
    startupProof = proof;
    active++;
    try {
      const before = snapshot();
      // Startup authentication/database permission checks precede application_name.
      // These seven denials require an exclusive, same-postmaster fresh suffix;
      // it never supplies a generic client-stderr or server-log fallback.
      const result = await invoke("psql", request, owner);
      requireLive(
        proof.raw?.origin === "exit" &&
          Number.isInteger(proof.raw.rawExit) &&
          proof.raw.rawExit > 0 &&
          proof.raw.rawExit <= 255 &&
          proof.raw.connectionClosed === true &&
          result.connectionClosed === true &&
          result.rawExit === proof.raw.rawExit &&
          result.origin === "channel" &&
          result.sqlState === null &&
          Number.isFinite(proof.closedAt),
        "SQL_NATIVE_STARTUP_PROCESS",
      );
      // Do not accept the first delivered FATAL: a duplicate or delayed second
      // error must remain visible throughout the entire settling window.
      while (performance.now() - proof.closedAt < 500)
        await delay(Math.max(1, 500 - (performance.now() - proof.closedAt)));
      const after = snapshot();
      requireLive(
        after.generation === before.generation &&
          after.text.startsWith(before.text),
        "SQL_NATIVE_STARTUP_LOG_CHANGED",
      );
      const suffix = after.text.slice(before.text.length);
      const errors = suffix
        .split("\n")
        .filter((line) => /\b(?:ERROR|FATAL|PANIC):/.test(line));
      requireLive(errors.length === 1, "SQL_NATIVE_STARTUP_LOG_AMBIGUOUS");
      const accepted =
        /^\[unknown\] (28000|28P01|42501) \[fixture:(hedefora_(?:readonly|migration|app|worker)):(hedefora_dev|postgres|template1)\] FATAL:  \1: (.*)$/.exec(
          errors[0],
        );
      requireLive(
        accepted &&
          accepted[2] === ROLE_USERS[claimed.role] &&
          accepted[3] === claimed.database &&
          Object.hasOwn(claimed.messages, accepted[1]) &&
          accepted[4] === claimed.messages[accepted[1]],
        "SQL_NATIVE_STARTUP_LOG_DENIAL",
      );
      return { ...result, origin: "postgres", sqlState: accepted[1] };
    } finally {
      active--;
      startupProof = null;
      release(owner);
    }
  }
  async function openSession(request) {
    if (startupRequest(request).protectedRequest) {
      requireLive(false, "SQL_NATIVE_STARTUP_REQUEST");
    }
    requireLive(startupProof === null, "SQL_NATIVE_STARTUP_EXCLUSIVE");
    active++;
    const owner = new Set();
    try {
      const session = await invoke("openSession", request, owner);
      session.closed.then(
        () => {
          active--;
          release(owner);
        },
        () => {
          active--;
          unsafeLifetime = true;
          release(owner);
        },
      );
      return session;
    } catch (error) {
      active--;
      release(owner);
      throw error;
    }
  }
  return Object.freeze({
    ...core,
    psql,
    openSession,
    lastFailureCategory: () => lastFailure,
  });
}
