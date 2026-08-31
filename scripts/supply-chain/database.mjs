import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export class DatabaseAcquisitionError extends Error {
  constructor(code, detail, cause) {
    super(`${code}: ${detail}`, cause ? { cause } : undefined);
    this.name = "DatabaseAcquisitionError";
    this.code = code;
  }
}

export async function downloadAdvisoryDatabase({
  ecosystem,
  url,
  destination,
  timeoutMs,
  maxBytes,
  fetchImpl = globalThis.fetch,
}) {
  requireNonemptyString(ecosystem, "ecosystem");
  requireNonemptyString(destination, "destination");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw acquisitionError(
      "INVALID_TIMEOUT",
      "timeoutMs must be a positive safe integer",
    );
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw acquisitionError(
      "INVALID_SIZE_LIMIT",
      "maxBytes must be a positive safe integer",
    );
  }
  if (typeof fetchImpl !== "function") {
    throw acquisitionError("INVALID_FETCH", "fetchImpl must be a function");
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (error) {
    throw acquisitionError("INVALID_URL", "database URL is invalid", error);
  }
  if (parsedUrl.protocol !== "https:") {
    throw acquisitionError("INSECURE_URL", "database URL must use HTTPS");
  }

  const signal = AbortSignal.timeout(timeoutMs);
  let response;
  try {
    response = await fetchImpl(parsedUrl, {
      cache: "no-store",
      redirect: "error",
      signal,
      headers: {
        accept: "application/zip, application/octet-stream;q=0.9",
        "user-agent": "HedefOra-R016/1",
      },
    });
  } catch (error) {
    const code = signal.aborted ? "DOWNLOAD_TIMEOUT" : "DOWNLOAD_FAILED";
    throw acquisitionError(
      code,
      `failed to download ${ecosystem} database`,
      error,
    );
  }

  if (!response || response.status !== 200) {
    throw acquisitionError(
      "UNEXPECTED_STATUS",
      `${ecosystem} database returned HTTP ${response?.status ?? "unknown"}`,
    );
  }
  if (!response.body) {
    throw acquisitionError(
      "EMPTY_RESPONSE",
      `${ecosystem} database response has no body`,
    );
  }

  const rawHeaders = requiredResponseHeaders(response.headers, ecosystem);
  const expectedLength = parsePositiveDecimal(
    rawHeaders["content-length"],
    `${ecosystem} content-length`,
  );
  if (expectedLength > maxBytes) {
    throw acquisitionError(
      "DOWNLOAD_TOO_LARGE",
      `${ecosystem} database content-length ${expectedLength} exceeds limit ${maxBytes}`,
    );
  }
  const expectedMd5 = extractGoogleMd5Hex(rawHeaders["x-goog-hash"]);
  const sha256 = createHash("sha256");
  const md5 = createHash("md5");
  let contentLength = 0;
  const digestingStream = new Transform({
    transform(chunk, _encoding, callback) {
      contentLength += chunk.length;
      if (contentLength > maxBytes) {
        callback(
          acquisitionError(
            "DOWNLOAD_TOO_LARGE",
            `${ecosystem} database body exceeds limit ${maxBytes}`,
          ),
        );
        return;
      }
      sha256.update(chunk);
      md5.update(chunk);
      callback(null, chunk);
    },
  });

  await mkdir(path.dirname(destination), { recursive: true });
  try {
    await pipeline(
      Readable.fromWeb(response.body),
      digestingStream,
      createWriteStream(destination, { flags: "wx", mode: 0o600 }),
      { signal },
    );
  } catch (error) {
    if (error instanceof DatabaseAcquisitionError) throw error;
    const code = signal.aborted ? "DOWNLOAD_TIMEOUT" : "WRITE_FAILED";
    throw acquisitionError(
      code,
      signal.aborted
        ? `${ecosystem} database body timed out`
        : `failed to persist ${ecosystem} database`,
      error,
    );
  }

  const calculatedMd5 = md5.digest("hex");
  const calculatedSha256 = sha256.digest("hex");
  if (contentLength !== expectedLength) {
    throw acquisitionError(
      "LENGTH_MISMATCH",
      `${ecosystem} database length ${contentLength} differs from header ${expectedLength}`,
    );
  }
  if (calculatedMd5 !== expectedMd5) {
    throw acquisitionError(
      "MD5_MISMATCH",
      `${ecosystem} database MD5 differs from x-goog-hash`,
    );
  }

  return {
    ecosystem,
    file: destination,
    contentLength,
    md5: calculatedMd5,
    sha256: calculatedSha256,
    headers: rawHeaders,
  };
}

export function extractGoogleMd5Hex(value) {
  const header = requireNonemptyString(value, "x-goog-hash");
  const candidates = header
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith("md5="));
  if (candidates.length !== 1) {
    throw acquisitionError(
      "INVALID_MD5_HEADER",
      "x-goog-hash must contain exactly one MD5 value",
    );
  }
  const encoded = candidates[0].slice(4);
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded)) {
    throw acquisitionError(
      "INVALID_MD5_HEADER",
      "x-goog-hash MD5 value is not canonical base64",
    );
  }
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.length !== 16 || decoded.toString("base64") !== encoded) {
    throw acquisitionError(
      "INVALID_MD5_HEADER",
      "x-goog-hash MD5 value must encode exactly 16 bytes",
    );
  }
  return decoded.toString("hex");
}

function requiredResponseHeaders(headers, ecosystem) {
  if (!headers || typeof headers.get !== "function") {
    throw acquisitionError(
      "MISSING_HEADERS",
      `${ecosystem} database response has no Headers interface`,
    );
  }
  const required = [
    "content-length",
    "etag",
    "last-modified",
    "x-goog-generation",
    "x-goog-hash",
  ];
  return Object.fromEntries(
    required.map((name) => {
      const value = headers.get(name);
      if (typeof value !== "string" || value.trim() === "") {
        throw acquisitionError(
          "MISSING_HEADER",
          `${ecosystem} database response is missing ${name}`,
        );
      }
      return [name, value.trim()];
    }),
  );
}

function parsePositiveDecimal(value, label) {
  if (!/^[0-9]+$/u.test(value)) {
    throw acquisitionError("INVALID_LENGTH", `${label} is not decimal`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw acquisitionError(
      "INVALID_LENGTH",
      `${label} must be a positive safe integer`,
    );
  }
  return parsed;
}

function requireNonemptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw acquisitionError(
      "INVALID_VALUE",
      `${label} must be a nonempty string`,
    );
  }
  if (value !== value.trim()) {
    throw acquisitionError(
      "INVALID_VALUE",
      `${label} has surrounding whitespace`,
    );
  }
  return value;
}

function acquisitionError(code, detail, cause) {
  return new DatabaseAcquisitionError(code, detail, cause);
}
