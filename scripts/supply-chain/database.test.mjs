import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DatabaseAcquisitionError,
  downloadAdvisoryDatabase,
  extractGoogleMd5Hex,
} from "./database.mjs";

const body = Buffer.from("deterministic advisory database fixture", "utf8");
const md5Bytes = createHash("md5").update(body).digest();
const headers = {
  "content-length": String(body.length),
  etag: '"fixture-etag"',
  "last-modified": "Fri, 28 Aug 2026 10:00:00 GMT",
  "x-goog-generation": "1787900000000000",
  "x-goog-hash": `crc32c=AAAAAA==,md5=${md5Bytes.toString("base64")}`,
};

test("database download validates transport identity and calculated digests", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "hedefora-db-test-"));
  try {
    const destination = path.join(directory, "osv-scalibr", "npm", "all.zip");
    const metadata = await downloadAdvisoryDatabase({
      ecosystem: "npm",
      url: "https://storage.googleapis.com/osv-vulnerabilities/npm/all.zip",
      destination,
      timeoutMs: 1_000,
      maxBytes: 1_024,
      fetchImpl: async () => new Response(body, { status: 200, headers }),
    });

    assert.deepEqual(await readFile(destination), body);
    assert.equal(metadata.contentLength, body.length);
    assert.equal(metadata.md5, md5Bytes.toString("hex"));
    assert.equal(
      metadata.sha256,
      createHash("sha256").update(body).digest("hex"),
    );
    assert.equal(metadata.headers["x-goog-generation"], "1787900000000000");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("database download fails closed on length and MD5 mismatch", async (t) => {
  for (const fixture of [
    {
      name: "length",
      headers: { ...headers, "content-length": String(body.length + 1) },
      code: "LENGTH_MISMATCH",
    },
    {
      name: "md5",
      headers: {
        ...headers,
        "x-goog-hash": `md5=${Buffer.alloc(16).toString("base64")}`,
      },
      code: "MD5_MISMATCH",
    },
  ]) {
    await t.test(fixture.name, async () => {
      const directory = await mkdtemp(
        path.join(os.tmpdir(), "hedefora-db-test-"),
      );
      try {
        await assert.rejects(
          downloadAdvisoryDatabase({
            ecosystem: "npm",
            url: "https://storage.googleapis.com/osv-vulnerabilities/npm/all.zip",
            destination: path.join(directory, "all.zip"),
            timeoutMs: 1_000,
            maxBytes: 1_024,
            fetchImpl: async () =>
              new Response(body, { status: 200, headers: fixture.headers }),
          }),
          (error) =>
            error instanceof DatabaseAcquisitionError &&
            error.code === fixture.code,
        );
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
  }
});

test("network, missing header, and insecure URL cannot become success", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "hedefora-db-test-"));
  try {
    await assert.rejects(
      downloadAdvisoryDatabase({
        ecosystem: "npm",
        url: "https://storage.googleapis.com/osv-vulnerabilities/npm/all.zip",
        destination: path.join(directory, "network.zip"),
        timeoutMs: 1_000,
        maxBytes: 1_024,
        fetchImpl: async () => {
          throw new Error("network unavailable");
        },
      }),
      (error) =>
        error instanceof DatabaseAcquisitionError &&
        error.code === "DOWNLOAD_FAILED",
    );
    await assert.rejects(
      downloadAdvisoryDatabase({
        ecosystem: "npm",
        url: "https://storage.googleapis.com/osv-vulnerabilities/npm/all.zip",
        destination: path.join(directory, "headers.zip"),
        timeoutMs: 1_000,
        maxBytes: 1_024,
        fetchImpl: async () =>
          new Response(body, {
            status: 200,
            headers: { ...headers, "x-goog-generation": "" },
          }),
      }),
      (error) =>
        error instanceof DatabaseAcquisitionError &&
        error.code === "MISSING_HEADER",
    );
    await assert.rejects(
      downloadAdvisoryDatabase({
        ecosystem: "npm",
        url: "http://storage.googleapis.com/osv-vulnerabilities/npm/all.zip",
        destination: path.join(directory, "insecure.zip"),
        timeoutMs: 1_000,
        maxBytes: 1_024,
      }),
      (error) =>
        error instanceof DatabaseAcquisitionError &&
        error.code === "INSECURE_URL",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("one wall timeout covers a stalled database response body", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "hedefora-db-test-"));
  try {
    const stalled = new ReadableStream({
      pull() {
        return new Promise(() => {});
      },
    });
    await assert.rejects(
      downloadAdvisoryDatabase({
        ecosystem: "npm",
        url: "https://storage.googleapis.com/osv-vulnerabilities/npm/all.zip",
        destination: path.join(directory, "stalled.zip"),
        timeoutMs: 25,
        maxBytes: 1_024,
        fetchImpl: async () => new Response(stalled, { status: 200, headers }),
      }),
      (error) =>
        error instanceof DatabaseAcquisitionError &&
        error.code === "DOWNLOAD_TIMEOUT",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("database download enforces header and streamed byte limits", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "hedefora-db-test-"));
  try {
    await assert.rejects(
      downloadAdvisoryDatabase({
        ecosystem: "npm",
        url: "https://storage.googleapis.com/osv-vulnerabilities/npm/all.zip",
        destination: path.join(directory, "oversized-header.zip"),
        timeoutMs: 1_000,
        maxBytes: body.length - 1,
        fetchImpl: async () => new Response(body, { status: 200, headers }),
      }),
      (error) =>
        error instanceof DatabaseAcquisitionError &&
        error.code === "DOWNLOAD_TOO_LARGE",
    );

    const lyingHeaders = {
      ...headers,
      "content-length": String(body.length - 1),
    };
    await assert.rejects(
      downloadAdvisoryDatabase({
        ecosystem: "npm",
        url: "https://storage.googleapis.com/osv-vulnerabilities/npm/all.zip",
        destination: path.join(directory, "oversized-stream.zip"),
        timeoutMs: 1_000,
        maxBytes: body.length - 1,
        fetchImpl: async () =>
          new Response(body, { status: 200, headers: lyingHeaders }),
      }),
      (error) =>
        error instanceof DatabaseAcquisitionError &&
        error.code === "DOWNLOAD_TOO_LARGE",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("x-goog-hash parser rejects absent, duplicate, and malformed MD5", () => {
  assert.equal(
    extractGoogleMd5Hex(headers["x-goog-hash"]),
    md5Bytes.toString("hex"),
  );
  for (const invalid of [
    "crc32c=AAAAAA==",
    `md5=${md5Bytes.toString("base64")},md5=${md5Bytes.toString("base64")}`,
    "md5=not-base64!",
    `md5=${Buffer.alloc(15).toString("base64")}`,
  ]) {
    assert.throws(() => extractGoogleMd5Hex(invalid), DatabaseAcquisitionError);
  }
});
