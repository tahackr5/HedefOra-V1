import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { TextDecoder } from "node:util";

const defaultMaxOutputBytes = 128 * 1024 * 1024;

export async function runProcess({
  command,
  args = [],
  cwd,
  env = process.env,
  timeoutMs,
  maxOutputBytes = defaultMaxOutputBytes,
}) {
  if (typeof command !== "string" || command.length === 0) {
    throw new TypeError("command must be a non-empty string");
  }
  if (
    !Array.isArray(args) ||
    !args.every((value) => typeof value === "string")
  ) {
    throw new TypeError("args must be an array of strings");
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("timeoutMs must be a positive safe integer");
  }
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes <= 0) {
    throw new TypeError("maxOutputBytes must be a positive safe integer");
  }

  const startedAt = performance.now();
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdout = [];
    const stderr = [];
    let capturedBytes = 0;
    let timedOut = false;
    let outputLimitExceeded = false;
    let settled = false;

    const capture = (target) => (chunk) => {
      capturedBytes += chunk.length;
      if (capturedBytes > maxOutputBytes) {
        outputLimitExceeded = true;
        child.kill("SIGKILL");
        return;
      }
      target.push(chunk);
    };
    child.stdout.on("data", capture(stdout));
    child.stderr.on("data", capture(stderr));

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    timeout.unref();

    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(
        new ProcessLaunchError(
          `failed to launch ${command}: ${error.message}`,
          error,
        ),
      );
    });
    child.once("close", (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const stdoutBytes = Buffer.concat(stdout);
      const stderrBytes = Buffer.concat(stderr);
      const stdoutDecoded = decodeUtf8(stdoutBytes);
      const stderrDecoded = decodeUtf8(stderrBytes);
      const result = {
        command,
        args: [...args],
        exitCode,
        signal,
        timedOut,
        outputLimitExceeded,
        stdout: stdoutDecoded.text,
        stderr: stderrDecoded.text,
        stdoutBytes,
        stderrBytes,
        stdoutUtf8Valid: stdoutDecoded.valid,
        stderrUtf8Valid: stderrDecoded.valid,
        durationMs: Math.round(performance.now() - startedAt),
      };
      const invalidStreams = [];
      if (!stdoutDecoded.valid) invalidStreams.push("stdout");
      if (!stderrDecoded.valid) invalidStreams.push("stderr");
      if (invalidStreams.length > 0) {
        reject(
          new ProcessOutputEncodingError(
            `${command} emitted invalid UTF-8 on ${invalidStreams.join(" and ")}`,
            result,
            invalidStreams,
            stdoutDecoded.error ?? stderrDecoded.error,
          ),
        );
        return;
      }
      resolve(result);
    });
  });
}

function decodeUtf8(bytes) {
  try {
    return {
      error: null,
      text: new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true,
      }).decode(bytes),
      valid: true,
    };
  } catch (error) {
    return { error, text: "", valid: false };
  }
}

export function requireProcessSuccess(result, label) {
  if (result.timedOut) {
    throw new ProcessContractError(`${label} timed out`, "TIMEOUT", result);
  }
  if (result.outputLimitExceeded) {
    throw new ProcessContractError(
      `${label} exceeded the output limit`,
      "OUTPUT_LIMIT",
      result,
    );
  }
  if (result.signal !== null) {
    throw new ProcessContractError(
      `${label} terminated by signal ${result.signal}`,
      "SIGNAL",
      result,
    );
  }
  if (result.exitCode !== 0) {
    throw new ProcessContractError(
      `${label} exited with ${result.exitCode}`,
      "NONZERO_EXIT",
      result,
    );
  }
  return result;
}

export class ProcessLaunchError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = "ProcessLaunchError";
  }
}

export class ProcessOutputEncodingError extends Error {
  constructor(message, result, streams, cause) {
    super(message, { cause });
    this.name = "ProcessOutputEncodingError";
    this.reason = "INVALID_UTF8";
    this.result = result;
    this.streams = [...streams];
  }
}

export class ProcessContractError extends Error {
  constructor(message, reason, result) {
    super(message);
    this.name = "ProcessContractError";
    this.reason = reason;
    this.result = result;
  }
}
