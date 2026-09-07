import { createPsqlCore } from "./psql.mjs";
import { startProcess, correlatedSqlState, requireLive } from "./process.mjs";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";

export const PG_BIN = "/usr/lib/postgresql/17/bin";

// Only the SSL-off witness uses a private Unix socket. All SQL-matrix and
// primary-readiness clients authenticate over loopback TLS with SCRAM.
export function createNativePsqlExecutor({
  negative = false,
  start = startProcess,
  readLogs,
  ...options
}) {
  requireLive(typeof readLogs === "function", "SQL_TRANSPORT");
  return createPsqlCore({
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
      return start({
        ...processOptions,
        executable: `${PG_BIN}/psql`,
        args,
        cwd: "/fixture",
      });
    },
  });
}
