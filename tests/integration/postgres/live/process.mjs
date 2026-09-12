import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";
import { performance } from "node:perf_hooks";

export class LiveError extends Error {
  constructor(code) {
    super(code);
    this.name = "LiveError";
    this.code = code;
  }
}
export function requireLive(condition, code) {
  if (!condition) throw new LiveError(code);
}

// No shell, ambient environment, raw diagnostics, or command line is persisted.
// The caller owns any server-side exec lifetime after cancellation.
export function startProcess({
  executable,
  args,
  env,
  cwd,
  timeoutMs,
  maxBytes = 131072,
  input,
  spawnImpl = spawn,
}) {
  requireLive(
    isAbsolute(executable) &&
      Array.isArray(args) &&
      args.every((x) => typeof x === "string" && !x.includes("\0")),
    "PROCESS_ARGUMENTS",
  );
  requireLive(
    env &&
      Object.values(env).every(
        (x) => typeof x === "string" && !x.includes("\0"),
      ),
    "PROCESS_ENV",
  );
  requireLive(
    Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 300000,
    "PROCESS_TIMEOUT",
  );
  requireLive(
    Number.isInteger(maxBytes) && maxBytes > 0 && maxBytes <= 4194304,
    "PROCESS_OUTPUT_LIMIT",
  );
  const began = performance.now();
  let origin = "exit",
    stdout = "",
    stderr = "",
    bytes = 0,
    done = false,
    closeObserved = false,
    child,
    timer,
    fallbackTimer;
  const listeners = new Set();
  let settle;
  const closed = new Promise((resolve) => {
    settle = resolve;
  });
  const finish = (rawExit) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    clearTimeout(fallbackTimer);
    settle(
      Object.freeze({
        rawExit: Number.isInteger(rawExit) ? rawExit : -1,
        origin,
        stdout,
        stderr,
        elapsedMs: performance.now() - began,
        connectionClosed: closeObserved,
      }),
    );
  };
  const cancel = (reason = "cancel") => {
    if (done) return;
    origin = reason;
    try {
      child?.kill("SIGKILL");
    } catch {
      /* terminal evidence remains channel failure */
    }
    // A missing close event is a channel failure, never proof of engine cleanup.
    if (!done && !fallbackTimer)
      fallbackTimer = setTimeout(() => finish(-1), 1000);
  };
  try {
    child = spawnImpl(executable, args, {
      cwd,
      env: { ...env },
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    for (const [stream, kind] of [
      [child.stdout, "stdout"],
      [child.stderr, "stderr"],
    ]) {
      stream.on("data", (data) => {
        if (done) return;
        bytes += data.length;
        if (bytes > maxBytes) {
          cancel("channel");
          return;
        }
        const text = data.toString("utf8");
        if (kind === "stdout") stdout += text;
        else stderr += text;
        for (const listener of listeners) listener(kind, text);
      });
      stream.on("error", () => cancel("channel"));
    }
    child.stdin.on("error", () => {
      /* EPIPE is classified by the terminal event. */
    });
    child.once("error", () => {
      origin = "channel";
      finish(-1);
    });
    child.once("close", (code) => {
      closeObserved = true;
      finish(code);
    });
    timer = setTimeout(() => cancel("timeout"), timeoutMs);
    if (typeof input === "string" || Buffer.isBuffer(input))
      child.stdin.end(input);
    else if (input) {
      input.once("error", () => cancel("channel"));
      input.pipe(child.stdin);
    }
  } catch {
    origin = "channel";
    finish(-1);
  }
  return Object.freeze({
    closed,
    cancel,
    write(text) {
      requireLive(!done && typeof text === "string", "PROCESS_CLOSED");
      child.stdin.write(text);
    },
    end() {
      if (!done) child.stdin.end();
    },
    onOutput(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}

export async function command(options) {
  return startProcess({ ...options, input: options.input ?? "" }).closed;
}

// Match only a unique application name in the owned server's exact log prefix.
// ERROR/FATAL/PANIC require the matching verbose body SQLSTATE. NOTICE/WARNING
// and unrelated applications cannot supply or invalidate error evidence.
export function correlatedSqlState(logs, applicationName) {
  requireLive(
    /^ho_[a-f0-9]{16}_[0-9]{1,7}$/.test(applicationName),
    "APPLICATION_NAME",
  );
  requireLive(
    typeof logs === "string" && Buffer.byteLength(logs) <= 131072,
    "SERVER_LOG_BOUND",
  );
  const states = new Set();
  for (const line of logs.split("\n")) {
    if (!line.startsWith(`${applicationName} `)) continue;
    const remainder = line.slice(applicationName.length + 1);
    const severe = /^(?:\S+\s+)?(?:ERROR|FATAL|PANIC)\s*:/.test(remainder);
    if (!severe) continue;
    const match =
      /^([0-9A-Z]{5}) (ERROR|FATAL|PANIC):  ([0-9A-Z]{5}):(?: |$)/.exec(
        remainder,
      );
    requireLive(
      match && match[1] === match[3] && match[1] !== "00000",
      "SQLSTATE_INVALID",
    );
    states.add(match[1]);
  }
  requireLive(states.size <= 1, "SQLSTATE_AMBIGUOUS");
  return states.size === 1 ? [...states][0] : null;
}
