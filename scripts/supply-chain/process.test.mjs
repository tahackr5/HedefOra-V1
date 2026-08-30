import assert from "node:assert/strict";
import test from "node:test";
import {
  ProcessContractError,
  ProcessLaunchError,
  ProcessOutputEncodingError,
  requireProcessSuccess,
  runProcess,
} from "./process.mjs";

test("runProcess captures a successful process without a shell", async () => {
  const result = await runProcess({
    command: process.execPath,
    args: ["-e", 'process.stdout.write("ok"); process.stderr.write("note")'],
    timeoutMs: 5_000,
  });

  assert.equal(requireProcessSuccess(result, "fixture"), result);
  assert.equal(result.stdout, "ok");
  assert.equal(result.stderr, "note");
  assert.deepEqual(result.stdoutBytes, Buffer.from("ok"));
  assert.deepEqual(result.stderrBytes, Buffer.from("note"));
  assert.equal(result.stdoutUtf8Valid, true);
  assert.equal(result.stderrUtf8Valid, true);
  assert.equal(result.exitCode, 0);
  assert.equal(result.signal, null);
  assert.equal(result.timedOut, false);
});

test("runProcess preserves and decodes multibyte UTF-8 output", async () => {
  const stdout = "T\u00fcrk\u00e7e \u2014 hedef \ud83c\udfaf";
  const stderr = "\u015f\u011f\u00fc";
  const result = await runProcess({
    command: process.execPath,
    args: [
      "-e",
      `process.stdout.write(${JSON.stringify(stdout)}); process.stderr.write(${JSON.stringify(stderr)})`,
    ],
    timeoutMs: 5_000,
  });

  assert.equal(requireProcessSuccess(result, "UTF-8 fixture"), result);
  assert.equal(result.stdout, stdout);
  assert.equal(result.stderr, stderr);
  assert.deepEqual(result.stdoutBytes, Buffer.from(stdout, "utf8"));
  assert.deepEqual(result.stderrBytes, Buffer.from(stderr, "utf8"));
  assert.equal(result.stdoutBytes.length, Buffer.byteLength(stdout, "utf8"));
  assert.ok(result.stdoutBytes.length > result.stdout.length);
});

test("invalid UTF-8 cannot become a successful valid JSON string", async () => {
  const invalidJsonStringBytes = Buffer.from([0x22, 0xff, 0x22]);
  assert.equal(JSON.parse(invalidJsonStringBytes.toString("utf8")), "\ufffd");

  await assert.rejects(
    runProcess({
      command: process.execPath,
      args: ["-e", "process.stdout.write(Buffer.from([0x22, 0xff, 0x22]))"],
      timeoutMs: 5_000,
    }),
    (error) => {
      assert.ok(error instanceof ProcessOutputEncodingError);
      assert.equal(error.reason, "INVALID_UTF8");
      assert.deepEqual(error.streams, ["stdout"]);
      assert.equal(error.result.exitCode, 0);
      assert.equal(error.result.stdoutUtf8Valid, false);
      assert.equal(error.result.stderrUtf8Valid, true);
      assert.equal(error.result.stdout, "");
      assert.deepEqual(error.result.stdoutBytes, invalidJsonStringBytes);
      return true;
    },
  );
});

test("nonzero scanner exit remains a control failure", async () => {
  const result = await runProcess({
    command: process.execPath,
    args: ["-e", "process.exit(127)"],
    timeoutMs: 5_000,
  });

  assert.throws(
    () => requireProcessSuccess(result, "scanner"),
    (error) =>
      error instanceof ProcessContractError &&
      error.reason === "NONZERO_EXIT" &&
      error.result.exitCode === 127,
  );
});

test("timeout kills the current process and cannot become success", async () => {
  const result = await runProcess({
    command: process.execPath,
    args: ["-e", "setInterval(() => {}, 1_000)"],
    timeoutMs: 50,
  });

  assert.equal(result.timedOut, true);
  assert.throws(
    () => requireProcessSuccess(result, "scanner"),
    (error) =>
      error instanceof ProcessContractError && error.reason === "TIMEOUT",
  );
});

test("output overflow kills the process and fails closed", async () => {
  const result = await runProcess({
    command: process.execPath,
    args: ["-e", 'process.stdout.write("x".repeat(16_384))'],
    timeoutMs: 5_000,
    maxOutputBytes: 64,
  });

  assert.equal(result.outputLimitExceeded, true);
  assert.throws(
    () => requireProcessSuccess(result, "scanner"),
    (error) =>
      error instanceof ProcessContractError && error.reason === "OUTPUT_LIMIT",
  );
});

test("output limit counts multibyte UTF-8 bytes rather than characters", async () => {
  const result = await runProcess({
    command: process.execPath,
    args: ["-e", 'process.stdout.write("\ud83c\udfaf")'],
    timeoutMs: 5_000,
    maxOutputBytes: 3,
  });

  assert.equal(Buffer.byteLength("\ud83c\udfaf", "utf8"), 4);
  assert.equal(result.outputLimitExceeded, true);
  assert.throws(
    () => requireProcessSuccess(result, "scanner"),
    (error) =>
      error instanceof ProcessContractError && error.reason === "OUTPUT_LIMIT",
  );
});

test("launch failure is distinct from a scanner result", async () => {
  await assert.rejects(
    runProcess({
      command: `missing-hedefora-command-${process.pid}`,
      timeoutMs: 5_000,
    }),
    ProcessLaunchError,
  );
});
