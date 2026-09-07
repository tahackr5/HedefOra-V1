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
  ...options
}) {
  requireLive(typeof readLogs === "function", "SQL_TRANSPORT");
  let lastFailure = "NOT_RUN";
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
              return result;
            },
            (error) => {
              lastFailure = "SPAWN_OR_CHANNEL";
              throw error;
            },
          ),
        });
      } catch (error) {
        lastFailure = "SPAWN_OR_CHANNEL";
        throw error;
      }
    },
  });
  return Object.freeze({ ...core, lastFailureCategory: () => lastFailure });
}
