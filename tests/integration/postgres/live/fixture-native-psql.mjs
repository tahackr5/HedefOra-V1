import { createPsqlCore } from "./psql.mjs";
import { startProcess, correlatedSqlState, requireLive } from "./process.mjs";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";

export const PG_BIN = "/usr/lib/postgresql/17/bin";
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
    readonlyAttempted = false,
    startupProof = null;
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
      while (true) {
        const logs = await readLogs(request);
        if (
          correlatedSqlState(logs, request.application) ||
          performance.now() >= deadline
        )
          return logs;
        await delay(10);
      }
    },
    launchClient(args, processOptions) {
      const proof = startupProof;
      try {
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
  function isReadonlyRequest(request) {
    return (
      request?.role === "readonly" ||
      request?.caseId === "roles.readonly.login-denied"
    );
  }
  function consumeReadonlyAttempt() {
    const previous = readonlyAttempted;
    readonlyAttempted = true;
    requireLive(!previous, "SQL_NATIVE_STARTUP_ALREADY_ATTEMPTED");
  }
  async function psql(request) {
    const readonly = isReadonlyRequest(request);
    if (readonly) consumeReadonlyAttempt();
    requireLive(startupProof === null, "SQL_NATIVE_STARTUP_EXCLUSIVE");
    if (!readonly) {
      active++;
      try {
        return await core.psql(request);
      } finally {
        active--;
      }
    }
    requireLive(
      !negative &&
        request.role === "readonly" &&
        request.caseId === "roles.readonly.login-denied" &&
        (request.database === undefined ||
          request.database === "hedefora_dev") &&
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
      // Startup authentication precedes application_name. This single reviewed
      // denial is proven only from an exclusive, same-postmaster fresh suffix;
      // it never supplies a generic client-stderr or server-log fallback.
      const result = await core.psql(request);
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
        /^\[unknown\] (28000|28P01) FATAL:  \1: (role "hedefora_readonly" is not permitted to log in|password authentication failed for user "hedefora_readonly")$/.exec(
          errors[0],
        );
      requireLive(
        accepted &&
          ((accepted[1] === "28000" &&
            accepted[2] ===
              'role "hedefora_readonly" is not permitted to log in') ||
            (accepted[1] === "28P01" &&
              accepted[2] ===
                'password authentication failed for user "hedefora_readonly"')),
        "SQL_NATIVE_STARTUP_LOG_DENIAL",
      );
      return { ...result, origin: "postgres", sqlState: accepted[1] };
    } finally {
      active--;
      startupProof = null;
    }
  }
  async function openSession(request) {
    if (isReadonlyRequest(request)) {
      consumeReadonlyAttempt();
      requireLive(false, "SQL_NATIVE_STARTUP_REQUEST");
    }
    requireLive(startupProof === null, "SQL_NATIVE_STARTUP_EXCLUSIVE");
    active++;
    try {
      const session = await core.openSession(request);
      session.closed.then(
        () => {
          active--;
        },
        () => {
          active--;
          unsafeLifetime = true;
        },
      );
      return session;
    } catch (error) {
      active--;
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
