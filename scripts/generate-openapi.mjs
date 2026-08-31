import { createHash } from "node:crypto";
import { constants as fileConstants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TextDecoder } from "node:util";

export const canonicalContractRelativePath = "contracts/openapi/openapi.yaml";
export const generatedArtifactRelativePath =
  "internal/generated/openapi/openapi.gen.go";
export const expectedContractBytes = 5604;
export const expectedContractSha256 =
  "5d157cd1d6627d781030212454ceaa075e994cdfa22a6f1f1929d26265af85ab";

const maximumContractBytes = 64 * 1024;
const maximumContractLines = 512;
const maximumLineBytes = 2048;
const maximumGeneratedBytes = 32 * 1024;
const temporaryArtifactName = ".openapi.gen.go.hedefora.tmp";
const generatedOutputDirectory = path.posix.dirname(
  generatedArtifactRelativePath,
);
const allowedInternalReferences = new Set([
  "#/components/headers/CacheControl",
  "#/components/headers/ContentTypeOptions",
  "#/components/headers/RequestId",
  "#/components/headers/RetryAfter",
  "#/components/headers/VaryAccept",
  "#/components/schemas/ErrorCode",
  "#/components/schemas/ErrorEnvelope",
  "#/components/schemas/HealthLiveResponse",
  "#/components/schemas/RequestId",
  "#/components/schemas/ServiceUnavailableError",
]);
const allowedVendorExtensionLines = new Set([
  "x-hedefora-auth: public",
  "x-hedefora-concurrency: none",
  "x-hedefora-idempotency: inherent",
  "x-hedefora-rate-limit: health",
]);

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptPath), "..");

export class GeneratorError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "GeneratorError";
    this.code = code;
  }
}

export function parseGeneratorMode(arguments_) {
  if (arguments_.length !== 1) {
    throw new GeneratorError(
      "INVALID_ARGUMENTS",
      "exactly one generator mode is required",
    );
  }
  if (arguments_[0] !== "--check" && arguments_[0] !== "--write") {
    throw new GeneratorError(
      "INVALID_ARGUMENTS",
      "only --check or --write is accepted",
    );
  }
  return arguments_[0];
}

export function generateArtifactFromSource(sourceBytes) {
  const bytes = asBuffer(sourceBytes);
  preflightSource(bytes);

  if (bytes.length !== expectedContractBytes) {
    throw new GeneratorError(
      "SOURCE_SEAL_MISMATCH",
      "the canonical source byte length does not match the sealed profile",
    );
  }

  const sourceSha256 = sha256(bytes);
  if (sourceSha256 !== expectedContractSha256) {
    throw new GeneratorError(
      "SOURCE_SEAL_MISMATCH",
      "the canonical source digest does not match the sealed profile",
    );
  }

  const contents = renderGoArtifact(sourceSha256);
  const artifactBytes = Buffer.from(contents, "utf8");
  if (artifactBytes.length > maximumGeneratedBytes) {
    throw new GeneratorError(
      "OUTPUT_LIMIT_EXCEEDED",
      "the generated artifact exceeds its fixed byte limit",
    );
  }
  return Object.freeze({
    bytes: artifactBytes,
    relativePath: generatedArtifactRelativePath,
    sha256: sha256(artifactBytes),
    sourceSha256,
  });
}

export async function checkGeneratedArtifact(root = repositoryRoot) {
  const sourceBytes = await readCanonicalContract(root);
  const expected = generateArtifactFromSource(sourceBytes);
  const outputDirectory = await inspectExistingDirectory(
    root,
    generatedOutputDirectory,
    "OUTPUT_BOUNDARY_INVALID",
  );
  await assertExactOutputInventory(outputDirectory);
  const actual = await readExactRegularFile(
    root,
    generatedArtifactRelativePath,
    "OUTPUT_BOUNDARY_INVALID",
  );
  if (!actual.equals(expected.bytes)) {
    throw new GeneratorError(
      "GENERATED_DRIFT",
      "the committed generated artifact differs from sealed regeneration",
    );
  }
  return expected;
}

export async function writeGeneratedArtifact(root = repositoryRoot) {
  const sourceBytes = await readCanonicalContract(root);
  const expected = generateArtifactFromSource(sourceBytes);
  const outputDirectory = await ensureOutputDirectory(root);
  await assertWritableOutputInventory(outputDirectory);

  const targetPath = path.join(
    outputDirectory,
    path.basename(generatedArtifactRelativePath),
  );
  const current = await readOptionalExactRegularFile(
    root,
    generatedArtifactRelativePath,
  );
  if (current?.equals(expected.bytes)) {
    return Object.freeze({ ...expected, changed: false });
  }

  const temporaryPath = path.join(outputDirectory, temporaryArtifactName);
  await assertPathMissing(temporaryPath, "OUTPUT_BOUNDARY_INVALID");

  let temporaryCreated = false;
  try {
    const handle = await open(
      temporaryPath,
      fileConstants.O_CREAT |
        fileConstants.O_EXCL |
        fileConstants.O_WRONLY |
        (fileConstants.O_NOFOLLOW ?? 0),
      0o600,
    );
    temporaryCreated = true;
    try {
      await handle.writeFile(expected.bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await chmod(temporaryPath, 0o644);

    const staged = await readExactRegularPath(
      root,
      temporaryPath,
      "OUTPUT_BOUNDARY_INVALID",
    );
    if (!staged.equals(expected.bytes)) {
      throw new GeneratorError(
        "OUTPUT_VERIFICATION_FAILED",
        "the staged generated artifact failed byte verification",
      );
    }

    try {
      await rename(temporaryPath, targetPath);
      temporaryCreated = false;
    } catch {
      throw new GeneratorError(
        "ATOMIC_REPLACE_FAILED",
        "the generated artifact could not be atomically replaced",
      );
    }

    const written = await readExactRegularFile(
      root,
      generatedArtifactRelativePath,
      "OUTPUT_BOUNDARY_INVALID",
    );
    if (!written.equals(expected.bytes)) {
      throw new GeneratorError(
        "OUTPUT_VERIFICATION_FAILED",
        "the written generated artifact failed byte verification",
      );
    }
    await assertExactOutputInventory(outputDirectory);
    return Object.freeze({ ...expected, changed: true });
  } finally {
    if (temporaryCreated) {
      await rm(temporaryPath, { force: true });
    }
  }
}

async function readCanonicalContract(root) {
  return readExactRegularFile(
    root,
    canonicalContractRelativePath,
    "INPUT_BOUNDARY_INVALID",
  );
}

function preflightSource(bytes) {
  if (bytes.length === 0 || bytes.length > maximumContractBytes) {
    throw new GeneratorError(
      "SOURCE_SIZE_INVALID",
      "the canonical source is empty or exceeds its fixed byte limit",
    );
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    throw new GeneratorError(
      "SOURCE_BOM_FORBIDDEN",
      "the canonical source must not contain a byte-order mark",
    );
  }

  let source;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new GeneratorError(
      "SOURCE_UTF8_INVALID",
      "the canonical source is not valid UTF-8",
    );
  }
  if (source.includes("\0")) {
    throw new GeneratorError(
      "SOURCE_CONTROL_FORBIDDEN",
      "the canonical source contains a NUL byte",
    );
  }
  if (source.includes("\r")) {
    throw new GeneratorError(
      "SOURCE_CARRIAGE_RETURN_FORBIDDEN",
      "the canonical source must use LF line endings",
    );
  }
  if (source.includes("\t")) {
    throw new GeneratorError(
      "SOURCE_TAB_FORBIDDEN",
      "the canonical source must not contain tab characters",
    );
  }
  if (source.includes("\\")) {
    throw new GeneratorError(
      "SOURCE_ESCAPE_FORBIDDEN",
      "the canonical source contains forbidden escape syntax",
    );
  }

  const lines = source.split("\n");
  if (lines.length > maximumContractLines) {
    throw new GeneratorError(
      "SOURCE_STRUCTURE_LIMIT_EXCEEDED",
      "the canonical source exceeds its fixed line limit",
    );
  }

  for (const line of lines) {
    if (Buffer.byteLength(line, "utf8") > maximumLineBytes) {
      throw new GeneratorError(
        "SOURCE_STRUCTURE_LIMIT_EXCEEDED",
        "the canonical source contains an overlong line",
      );
    }
    const trimmed = line.trim();
    if (/^(?:---|\.\.\.)(?:\s*(?:#.*)?)?$/u.test(trimmed)) {
      throw new GeneratorError(
        "SOURCE_DOCUMENT_MARKER_FORBIDDEN",
        "the canonical source must contain exactly one implicit YAML document",
      );
    }
    if (/^%/u.test(trimmed)) {
      throw new GeneratorError(
        "SOURCE_DIRECTIVE_FORBIDDEN",
        "YAML directives are forbidden in the sealed source",
      );
    }
    if (/(?:^|[\s[\]{},:])&[A-Za-z0-9_-]+/u.test(line)) {
      throw new GeneratorError(
        "SOURCE_ANCHOR_FORBIDDEN",
        "YAML anchors are forbidden in the sealed source",
      );
    }
    if (/(?:^|[\s[\]{},:])\*[A-Za-z0-9_-]+/u.test(line)) {
      throw new GeneratorError(
        "SOURCE_ALIAS_FORBIDDEN",
        "YAML aliases are forbidden in the sealed source",
      );
    }
    if (/^<<\s*:/u.test(trimmed)) {
      throw new GeneratorError(
        "SOURCE_MERGE_FORBIDDEN",
        "YAML merge keys are forbidden in the sealed source",
      );
    }
    if (/(?:^|[\s[\]{},:])![^\s]/u.test(line)) {
      throw new GeneratorError(
        "SOURCE_TAG_FORBIDDEN",
        "custom YAML tags are forbidden in the sealed source",
      );
    }
    if (/x-go-/iu.test(line)) {
      throw new GeneratorError(
        "SOURCE_GO_EXTENSION_FORBIDDEN",
        "Go code-generation extensions are forbidden at every depth",
      );
    }
    if (/\$(?:dynamicRef|recursiveRef)\s*:/iu.test(line)) {
      throw new GeneratorError(
        "SOURCE_REFERENCE_FORBIDDEN",
        "dynamic and recursive references are forbidden",
      );
    }
    if (/^(?:__proto__|constructor|prototype)\s*:/iu.test(trimmed)) {
      throw new GeneratorError(
        "SOURCE_PROPERTY_FORBIDDEN",
        "prototype-affecting property names are forbidden",
      );
    }
    if (line.includes("$ref")) {
      const match = line.match(/^\s+\$ref: "([^"]+)"\s*$/u);
      if (!match || !allowedInternalReferences.has(match[1])) {
        throw new GeneratorError(
          "SOURCE_REFERENCE_FORBIDDEN",
          "only exact allowlisted internal references are accepted",
        );
      }
    }
    if (/^x-hedefora-[A-Za-z0-9-]+\s*:/iu.test(trimmed)) {
      if (!allowedVendorExtensionLines.has(trimmed)) {
        throw new GeneratorError(
          "SOURCE_EXTENSION_FORBIDDEN",
          "only the four exact HedefOra operation extensions are accepted",
        );
      }
    }
  }
}

function renderGoArtifact(sourceSha256) {
  if (!/^[0-9a-f]{64}$/u.test(sourceSha256)) {
    throw new GeneratorError(
      "INTERNAL_PROFILE_INVALID",
      "the sealed source digest is not canonical lowercase SHA-256",
    );
  }
  return `// Code generated by HedefOra sealed OpenAPI renderer. DO NOT EDIT.
// Source: contracts/openapi/openapi.yaml
// Source SHA-256: ${sourceSha256}

package openapi

import "context"

const (
	GetHealthLiveOperationID = "getHealthLive"
	GetHealthLiveMethod      = "GET"
	GetHealthLivePath        = "/health/live"
)

type RequestID string

type HealthLiveStatus string

const HealthLiveStatusLive HealthLiveStatus = "live"

type HealthLiveResponse struct {
	Status HealthLiveStatus \`json:"status"\`
}

type ErrorCode string

const (
	ErrorCodeInvalidRequest       ErrorCode = "invalid_request"
	ErrorCodeMethodNotAllowed     ErrorCode = "method_not_allowed"
	ErrorCodeNotAcceptable        ErrorCode = "not_acceptable"
	ErrorCodeRouteNotFound        ErrorCode = "route_not_found"
	ErrorCodeServiceUnavailable   ErrorCode = "service_unavailable"
	ErrorCodeUnsupportedMediaType ErrorCode = "unsupported_media_type"
	ErrorCodeInternalError        ErrorCode = "internal_error"
)

type ErrorEnvelope struct {
	Code              ErrorCode \`json:"code"\`
	Message           string    \`json:"message"\`
	RequestID         RequestID \`json:"request_id"\`
	Retryable         bool      \`json:"retryable"\`
	RetryAfterSeconds *int      \`json:"retry_after_seconds,omitempty"\`
}

type ServiceUnavailableCode string

const ServiceUnavailableCodeValue ServiceUnavailableCode = "service_unavailable"

type ServiceUnavailableError struct {
	Code              ServiceUnavailableCode \`json:"code"\`
	Message           string                 \`json:"message"\`
	RequestID         RequestID              \`json:"request_id"\`
	Retryable         bool                   \`json:"retryable"\`
	RetryAfterSeconds int                    \`json:"retry_after_seconds"\`
}

type GetHealthLiveRequestObject struct{}

type GetHealthLiveResponseObject interface {
	isGetHealthLiveResponseObject()
}

type GetHealthLive200JSONResponse struct {
	Body HealthLiveResponse
}

func (GetHealthLive200JSONResponse) isGetHealthLiveResponseObject() {}

type GetHealthLive503JSONResponse struct {
	Body ServiceUnavailableError
}

func (GetHealthLive503JSONResponse) isGetHealthLiveResponseObject() {}

type StrictServerInterface interface {
	GetHealthLive(context.Context, GetHealthLiveRequestObject) (GetHealthLiveResponseObject, error)
}
`;
}

async function ensureOutputDirectory(root) {
  const canonicalRoot = await inspectRepositoryRoot(root);
  let current = canonicalRoot;
  for (const part of generatedOutputDirectory.split("/")) {
    current = path.join(current, part);
    try {
      const stats = await lstat(current);
      if (stats.isSymbolicLink() || !stats.isDirectory()) {
        throw new GeneratorError(
          "OUTPUT_BOUNDARY_INVALID",
          "a generated output ancestor is not a regular directory",
        );
      }
    } catch (error) {
      if (error instanceof GeneratorError) throw error;
      if (error?.code !== "ENOENT") {
        throw new GeneratorError(
          "OUTPUT_BOUNDARY_INVALID",
          "a generated output ancestor could not be inspected",
        );
      }
      try {
        await mkdir(current, { mode: 0o755 });
      } catch {
        throw new GeneratorError(
          "OUTPUT_BOUNDARY_INVALID",
          "a generated output ancestor could not be created",
        );
      }
    }
    await assertResolvedPath(current, current, "OUTPUT_BOUNDARY_INVALID");
    assertContained(canonicalRoot, current, "OUTPUT_BOUNDARY_INVALID");
  }
  return current;
}

async function inspectExistingDirectory(root, relativePath, errorCode) {
  const canonicalRoot = await inspectRepositoryRoot(root);
  const target = resolveRelative(canonicalRoot, relativePath, errorCode);
  let stats;
  try {
    stats = await lstat(target);
  } catch {
    throw new GeneratorError(errorCode, "the required directory is missing");
  }
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new GeneratorError(
      errorCode,
      "the required path is not a regular directory",
    );
  }
  await assertResolvedPath(target, target, errorCode);
  return target;
}

async function inspectRepositoryRoot(root) {
  const absoluteRoot = path.resolve(root);
  let stats;
  try {
    stats = await lstat(absoluteRoot);
  } catch {
    throw new GeneratorError(
      "REPOSITORY_BOUNDARY_INVALID",
      "the repository root could not be inspected",
    );
  }
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new GeneratorError(
      "REPOSITORY_BOUNDARY_INVALID",
      "the repository root is not a regular directory",
    );
  }
  let resolved;
  try {
    resolved = await realpath(absoluteRoot);
  } catch {
    throw new GeneratorError(
      "REPOSITORY_BOUNDARY_INVALID",
      "the repository root could not be resolved",
    );
  }
  if (!samePath(resolved, absoluteRoot)) {
    throw new GeneratorError(
      "REPOSITORY_BOUNDARY_INVALID",
      "the repository root must not traverse a link",
    );
  }
  return resolved;
}

async function readExactRegularFile(root, relativePath, errorCode) {
  const canonicalRoot = await inspectRepositoryRoot(root);
  const target = resolveRelative(canonicalRoot, relativePath, errorCode);
  return readExactRegularPath(canonicalRoot, target, errorCode);
}

async function readOptionalExactRegularFile(root, relativePath) {
  const canonicalRoot = await inspectRepositoryRoot(root);
  const target = resolveRelative(
    canonicalRoot,
    relativePath,
    "OUTPUT_BOUNDARY_INVALID",
  );
  try {
    await lstat(target);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new GeneratorError(
      "OUTPUT_BOUNDARY_INVALID",
      "the generated artifact could not be inspected",
    );
  }
  return readExactRegularPath(canonicalRoot, target, "OUTPUT_BOUNDARY_INVALID");
}

async function readExactRegularPath(root, target, errorCode) {
  assertContained(root, target, errorCode);
  let pathStats;
  try {
    pathStats = await lstat(target);
  } catch {
    throw new GeneratorError(errorCode, "the required file is missing");
  }
  if (
    pathStats.isSymbolicLink() ||
    !pathStats.isFile() ||
    pathStats.nlink !== 1
  ) {
    throw new GeneratorError(
      errorCode,
      "the required file must be regular, non-link and single-linked",
    );
  }
  await assertResolvedPath(target, target, errorCode);

  let handle;
  try {
    handle = await open(
      target,
      fileConstants.O_RDONLY | (fileConstants.O_NOFOLLOW ?? 0),
    );
    const handleStats = await handle.stat();
    if (!handleStats.isFile() || handleStats.nlink !== 1) {
      throw new GeneratorError(
        errorCode,
        "the opened file is not regular and single-linked",
      );
    }
    if (
      handleStats.dev !== pathStats.dev ||
      handleStats.ino !== pathStats.ino ||
      handleStats.size !== pathStats.size
    ) {
      throw new GeneratorError(
        errorCode,
        "the required file changed while it was inspected",
      );
    }
    return await handle.readFile();
  } catch (error) {
    if (error instanceof GeneratorError) throw error;
    throw new GeneratorError(errorCode, "the required file could not be read");
  } finally {
    await handle?.close();
  }
}

async function assertExactOutputInventory(outputDirectory) {
  let entries;
  try {
    entries = await readdir(outputDirectory, { withFileTypes: true });
  } catch {
    throw new GeneratorError(
      "OUTPUT_BOUNDARY_INVALID",
      "the generated output inventory could not be read",
    );
  }
  if (
    entries.length !== 1 ||
    entries[0].name !== path.basename(generatedArtifactRelativePath) ||
    !entries[0].isFile() ||
    entries[0].isSymbolicLink()
  ) {
    throw new GeneratorError(
      "OUTPUT_INVENTORY_INVALID",
      "the generated output inventory is not the single allowlisted file",
    );
  }
}

async function assertWritableOutputInventory(outputDirectory) {
  let entries;
  try {
    entries = await readdir(outputDirectory, { withFileTypes: true });
  } catch {
    throw new GeneratorError(
      "OUTPUT_BOUNDARY_INVALID",
      "the generated output inventory could not be read",
    );
  }
  if (
    entries.some(
      (entry) =>
        entry.name !== path.basename(generatedArtifactRelativePath) ||
        !entry.isFile() ||
        entry.isSymbolicLink(),
    )
  ) {
    throw new GeneratorError(
      "OUTPUT_INVENTORY_INVALID",
      "the generated output directory contains an unexpected entry",
    );
  }
}

async function assertPathMissing(target, errorCode) {
  try {
    await lstat(target);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw new GeneratorError(errorCode, "a path could not be inspected");
  }
  throw new GeneratorError(errorCode, "a stale temporary artifact exists");
}

async function assertResolvedPath(target, expected, errorCode) {
  let resolved;
  try {
    resolved = await realpath(target);
  } catch {
    throw new GeneratorError(
      errorCode,
      "a boundary path could not be resolved",
    );
  }
  if (!samePath(resolved, expected)) {
    throw new GeneratorError(errorCode, "a boundary path traverses a link");
  }
}

function resolveRelative(root, relativePath, errorCode) {
  if (
    path.isAbsolute(relativePath) ||
    relativePath.split(/[\\/]/u).some((part) => part === "..")
  ) {
    throw new GeneratorError(errorCode, "a repository path is not canonical");
  }
  const target = path.join(root, ...relativePath.split("/"));
  assertContained(root, target, errorCode);
  return target;
}

function assertContained(root, target, errorCode) {
  const relative = path.relative(root, target);
  if (
    relative === "" ||
    relative === "." ||
    (!relative.startsWith(".." + path.sep) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  ) {
    return;
  }
  throw new GeneratorError(errorCode, "a path escapes the repository root");
}

function samePath(left, right) {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function asBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError("sourceBytes must be a Buffer or Uint8Array");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function main() {
  try {
    const mode = parseGeneratorMode(process.argv.slice(2));
    const result =
      mode === "--check"
        ? await checkGeneratedArtifact(repositoryRoot)
        : await writeGeneratedArtifact(repositoryRoot);
    if (mode === "--check") {
      console.log(
        `PASS: sealed OpenAPI source and ${result.relativePath} are byte-identical to deterministic regeneration (${result.sha256}).`,
      );
    } else {
      console.log(
        `PASS: ${result.changed ? "wrote" : "verified"} the single sealed OpenAPI artifact (${result.sha256}).`,
      );
    }
  } catch (error) {
    const code =
      error instanceof GeneratorError ? error.code : "UNEXPECTED_FAILURE";
    console.error(`ERROR: sealed OpenAPI renderer failed (${code}).`);
    process.exitCode = 1;
  }
}

if (path.resolve(process.argv[1] ?? "") === path.resolve(scriptPath)) {
  await main();
}
