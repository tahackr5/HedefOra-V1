import { createHash } from "node:crypto";
import path from "node:path";

import {
  ContractError,
  canonicalJson,
  parseStrictJson,
  sha256Hex,
} from "./policy.mjs";

const POSIX = path.posix;
const HEX_OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const PROCESS_ID = /^PROCESS-/u;
const PASS_TERMINAL_CHECK_IDS = [
  "R016-REPOSITORY-USE",
  "R016-EXECUTION-ENVIRONMENT",
  "R016-CONTROL-SOURCE-SEAL",
  "R016-OSV-MISSING-DB-NEGATIVE",
  "R016-OSV-VULNERABILITY-CANARY",
  "R016-OSV-VULNERABILITY-DEVELOPMENT-CANARY",
  "R016-OSV-GO-ADVISORY-CANARY",
  "R016-OSV-GO-LICENSE-DENIED-CANARY",
  "R016-OSV-LICENSE-DENIED-CANARY",
  "R016-OSV-LICENSE-UNKNOWN-CANARY",
  "R016-DB-ZIP",
  "R016-DB-SEAL",
  "R016-VULNERABILITY",
  "R016-LICENSE",
  "R016-SAST",
  "R016-SAST-NEGATIVE",
  "R016-SOURCE-SEAL",
  "R016-GATE",
];
const PASS_TOOL_NAMES = ["osv-scanner", "semgrep-ce", "go-toolchain"];
const PASS_INPUT_NAMES = [
  "controlPlane",
  "configuration",
  "repositoryUse",
  "pnpm",
  "go",
  "semgrepSources",
  "semgrepRules",
];
const HEDEFORA_REPOSITORY_ID = 1_349_011_765;
const HEDEFORA_REPOSITORY_FULL_NAME = "tahackr5/HedefOra-V1";
const SUPPORTED_SCHEMA_KEYWORDS = new Set([
  "$defs",
  "$id",
  "$ref",
  "$schema",
  "additionalProperties",
  "allOf",
  "const",
  "else",
  "enum",
  "format",
  "if",
  "items",
  "maxItems",
  "maximum",
  "minItems",
  "minLength",
  "minProperties",
  "minimum",
  "not",
  "oneOf",
  "pattern",
  "properties",
  "required",
  "then",
  "title",
  "type",
  "uniqueItems",
]);
const PASS_REQUIRED_PROCESS_IDS = [
  "PROCESS-GIT-TOP-LEVEL",
  "PROCESS-GIT-DIRECTORY",
  "PROCESS-GIT-HEAD",
  "PROCESS-GIT-TREE",
  "PROCESS-GIT-BRANCH",
  "PROCESS-GIT-STATUS",
  "PROCESS-GIT-INDEX",
  "PROCESS-GIT-INDEX-FLAGS",
  "PROCESS-DOCKER-VERSION",
  "PROCESS-OSV-SCANNER-PULL",
  "PROCESS-OSV-SCANNER-INSPECT",
  "PROCESS-OSV-SCANNER-INDEX",
  "PROCESS-OSV-SCANNER-VERSION",
  "PROCESS-SEMGREP-CE-PULL",
  "PROCESS-SEMGREP-CE-INSPECT",
  "PROCESS-SEMGREP-CE-INDEX",
  "PROCESS-SEMGREP-CE-VERSION",
  "PROCESS-GO-TOOLCHAIN-PULL",
  "PROCESS-GO-TOOLCHAIN-INSPECT",
  "PROCESS-GO-TOOLCHAIN-INDEX",
  "PROCESS-GO-TOOLCHAIN-VERSION",
  "PROCESS-RULES-GIT-INIT",
  "PROCESS-RULES-GIT-REMOTE",
  "PROCESS-RULES-GIT-FETCH",
  "PROCESS-RULES-COMMIT",
  "PROCESS-RULES-TREE",
  "PROCESS-OSV-MISSING-DATABASE-NEGATIVE",
  "PROCESS-OSV-VULNERABILITY-CANARY",
  "PROCESS-OSV-VULNERABILITY-DEVELOPMENT-CANARY",
  "PROCESS-OSV-GO-ADVISORY-CANARY",
  "PROCESS-OSV-GO-LICENSE-DENIED-CANARY",
  "PROCESS-OSV-LICENSE-DENIED-CANARY",
  "PROCESS-OSV-LICENSE-UNKNOWN-CANARY",
  "PROCESS-OSV-DATABASE-ZIP-VALIDATION",
  "PROCESS-OSV-VULNERABILITY",
  "PROCESS-OSV-LICENSE",
  "PROCESS-SEMGREP-REPOSITORY",
  "PROCESS-SEMGREP-BLOCKING-FIXTURES",
  "PROCESS-GIT-TOP-LEVEL-FINAL",
  "PROCESS-GIT-DIRECTORY-FINAL",
  "PROCESS-GIT-HEAD-FINAL",
  "PROCESS-GIT-TREE-FINAL",
  "PROCESS-GIT-STATUS-FINAL",
  "PROCESS-GIT-INDEX-FINAL",
  "PROCESS-GIT-INDEX-FLAGS-FINAL",
];

export function validateRepositoryUseBoundary(boundary) {
  requireRecord(boundary, "Semgrep repository use boundary");
  assertExactObjectKeys(
    boundary,
    [
      "repository",
      "purpose",
      "targetRelation",
      "forkPullRequests",
      "externalRepositoryScanning",
      "scanningAsAService",
      "ruleDistribution",
      "ruleContentPersistence",
    ],
    "Semgrep repository use boundary",
  );
  requireRecord(boundary.repository, "Semgrep repository use identity");
  assertExactObjectKeys(
    boundary.repository,
    ["id", "fullName", "allowedVisibilities"],
    "Semgrep repository use identity",
  );
  if (
    boundary.repository.id !== HEDEFORA_REPOSITORY_ID ||
    boundary.repository.fullName !== HEDEFORA_REPOSITORY_FULL_NAME ||
    canonicalJson(boundary.repository.allowedVisibilities) !==
      canonicalJson(["private", "public"]) ||
    boundary.purpose !== "owner-controlled-internal-ci" ||
    boundary.targetRelation !== "same-repository-only" ||
    boundary.forkPullRequests !== "reject-before-acquisition" ||
    boundary.externalRepositoryScanning !== "prohibited" ||
    boundary.scanningAsAService !== "prohibited" ||
    boundary.ruleDistribution !== "prohibited" ||
    boundary.ruleContentPersistence !== "ephemeral-temp-only"
  ) {
    throw new ContractError(
      "Semgrep repository use boundary differs from the owner-controlled first-party contract",
    );
  }
  return true;
}

export function validateRepositoryUseContext(context, boundary, githubActions) {
  validateRepositoryUseBoundary(boundary);
  requireRecord(context, "repository use context");
  assertExactObjectKeys(
    context,
    ["authority", "visibilityProof", "eventName", "base", "target", "relation"],
    "repository use context",
  );
  requireRecord(context.base, "repository use base");
  requireRecord(context.target, "repository use target");
  assertExactObjectKeys(
    context.base,
    ["repositoryId", "repositoryFullName", "visibility"],
    "repository use base",
  );
  assertExactObjectKeys(
    context.target,
    ["repositoryId", "repositoryFullName", "visibility", "fork"],
    "repository use target",
  );
  const expected = boundary.repository;
  for (const [identity, label] of [
    [context.base, "base"],
    [context.target, "target"],
  ]) {
    if (
      identity.repositoryId !== expected.id ||
      identity.repositoryFullName !== expected.fullName ||
      !expected.allowedVisibilities.includes(identity.visibility)
    ) {
      throw new ContractError(
        `R-016 ${label} repository identity or visibility is outside the locked first-party boundary`,
      );
    }
  }
  if (
    context.base.visibility !== context.target.visibility ||
    context.target.fork !== false ||
    context.relation !== "same-repository"
  ) {
    throw new ContractError(
      "R-016 target must be a non-fork source in the same HedefOra repository",
    );
  }
  if (context.authority === "github-context-claim") {
    if (
      context.visibilityProof !== false ||
      !["push", "pull_request_target"].includes(context.eventName) ||
      githubActions !== "true"
    ) {
      throw new ContractError(
        "GitHub repository use context must remain an externally unverified claim",
      );
    }
  } else if (
    context.authority !== "local-declaration" ||
    context.visibilityProof !== false ||
    context.eventName !== "local" ||
    githubActions === "true"
  ) {
    throw new ContractError(
      "local repository use context must remain an untrusted local declaration",
    );
  }
  return {
    authority: context.authority,
    visibilityProof: context.visibilityProof,
    eventName: context.eventName,
    base: { ...context.base },
    target: { ...context.target },
    relation: context.relation,
  };
}
const SPLIT_CONTROL_SOURCE_PROCESS_IDS = [
  "PROCESS-GIT-CONTROL-TOP-LEVEL",
  "PROCESS-GIT-CONTROL-DIRECTORY",
  "PROCESS-GIT-CONTROL-HEAD",
  "PROCESS-GIT-CONTROL-TREE",
  "PROCESS-GIT-CONTROL-BRANCH",
  "PROCESS-GIT-CONTROL-STATUS",
  "PROCESS-GIT-CONTROL-INDEX",
  "PROCESS-GIT-CONTROL-INDEX-FLAGS",
  "PROCESS-GIT-CONTROL-TOP-LEVEL-FINAL",
  "PROCESS-GIT-CONTROL-DIRECTORY-FINAL",
  "PROCESS-GIT-CONTROL-HEAD-FINAL",
  "PROCESS-GIT-CONTROL-TREE-FINAL",
  "PROCESS-GIT-CONTROL-STATUS-FINAL",
  "PROCESS-GIT-CONTROL-INDEX-FINAL",
  "PROCESS-GIT-CONTROL-INDEX-FLAGS-FINAL",
];
const PASS_DYNAMIC_PROCESS_PATTERNS = [
  /^PROCESS-GIT-BLOB-[0-9A-F]{20}$/u,
  /^PROCESS-GIT-CONTROL-BLOB-[0-9A-F]{20}$/u,
  /^PROCESS-RULE-BLOB-[0-9A-F]{20}$/u,
  /^PROCESS-GO-MOD-EDIT-[A-Z0-9._-]+$/u,
  /^PROCESS-GO-LIST-[A-Z0-9._-]+$/u,
  /^PROCESS-[A-Z0-9._-]+-CLEANUP-(?:BEFORE|AFTER|REMOVE)$/u,
];

const EMPTY_SHA256 = sha256Hex(Buffer.alloc(0));
const SEMGREP_ENGINE = "Semgrep Community Edition --oss-only";
const IMAGE_INDEX_MEDIA_TYPES = Object.freeze({
  "application/vnd.docker.distribution.manifest.list.v2+json":
    "application/vnd.docker.distribution.manifest.v2+json",
  "application/vnd.oci.image.index.v1+json":
    "application/vnd.oci.image.manifest.v1+json",
});
const DATABASE_VALIDATION_LIMITS = Object.freeze({
  max_entries: 300_000,
  max_entry_path_bytes: 4_096,
  max_entry_uncompressed_bytes: 134_217_728,
  max_archive_uncompressed_bytes: 8_589_934_592,
});

const CONTROL_PROTECTED_EXACT_PATHS = new Set([
  "security/supply-chain-policy.json",
  "security/scanners.lock.json",
  "security/osv-scanner.toml",
  "security/r016-evidence.schema.json",
  ".github/workflows/ci.yml",
  ".github/workflows/codeql.yml",
  ".github/workflows/r016-trusted-pr.yml",
]);
const CONTROL_PROTECTED_PREFIXES = Object.freeze([
  "scripts/fixtures/supply-chain/",
  "scripts/supply-chain/",
  "tools/osvdbcheck/",
]);
const CONTROL_ONLY_INPUT_PATHS = Object.freeze(["go.mod"]);
const TRACKED_CANARY_FIXTURES = Object.freeze([
  {
    path: "scripts/fixtures/supply-chain/vulnerable-pnpm-lock.yaml.txt",
    sha256: "cd4c80acc334311c3732e510d98dcf8773c0b005c0e1c3f9145ddf2b6de5cccf",
    size: 227,
  },
  {
    path: "scripts/fixtures/supply-chain/vulnerable-development-pnpm-lock.yaml.txt",
    sha256: "9271f0ca7b126ab32a6babd7ff7a19add161eaf68cded85b5f9f8883a252bcd6",
    size: 317,
  },
  {
    path: "scripts/fixtures/supply-chain/vulnerable-go.mod.txt",
    sha256: "101ff523fa5baf340172bc1d2f35bcca95f77085d701d82ce37f8f6d9d2e0311",
    size: 95,
  },
  {
    path: "scripts/fixtures/supply-chain/go-license-denied.mod.txt",
    sha256: "bfb4dfd318d706ac8a6f24ad61450818ca23e51dd5e54a0fea59f499c1eab9f6",
    size: 107,
  },
  {
    path: "scripts/fixtures/supply-chain/license-denied-pnpm-lock.yaml.txt",
    sha256: "ff0dd178fabdd8f3552c6687f628910273418c2cdcee988efa112298235b3cd1",
    size: 58,
  },
  {
    path: "scripts/fixtures/supply-chain/license-unknown-pnpm-lock.yaml.txt",
    sha256: "a03511895b007e5da0b2804cbea27ae986621e67073ddfbbb23998d6326e9863",
    size: 56,
  },
  {
    path: "scripts/fixtures/supply-chain/sast-go-blocking.go.txt",
    sha256: "5e61ac02abf84aeb5b6d1132d068faafca0d03a2fd0bf261b8834528fbb03313",
    size: 146,
  },
  {
    path: "scripts/fixtures/supply-chain/sast-typescript-blocking.ts.txt",
    sha256: "7ab546d1e0b094db952c930c056a4e072d27d2c2a2c7a0e7452b731701513756",
    size: 79,
  },
]);

export const EXPECTED_OSV_CONFIGURATION = `[[PackageOverrides]]
name = "reserved"
version = "0.1.2"
ecosystem = "npm"
license.override = ["MIT"]
effectiveUntil = 2027-08-28
reason = "Exact npm registry metadata and the package LICENSE-MIT identify reserved@0.1.2 as MIT; deps.dev currently reports UNKNOWN."
`;

export function validateOsvConfiguration(text) {
  if (typeof text !== "string" || text !== EXPECTED_OSV_CONFIGURATION) {
    throw new ContractError(
      "OSV configuration must match the exact license-only reserved@0.1.2 override",
    );
  }
  return {
    sha256: sha256Hex(text),
    package: { ecosystem: "npm", name: "reserved", version: "0.1.2" },
    licenseOverride: ["MIT"],
    effectiveUntil: "2027-08-28",
  };
}

export function parseGitIndex(text, label = "git index") {
  if (typeof text !== "string" || text === "") {
    throw new ContractError(`${label} is empty`);
  }
  if (!text.endsWith("\0")) {
    throw new ContractError(`${label} is not NUL terminated`);
  }
  const entries = [];
  const seen = new Set();
  for (const [index, record] of text.slice(0, -1).split("\0").entries()) {
    const match = /^(\d{6}) ([0-9a-f]+) ([0-3])\t([\s\S]+)$/u.exec(record);
    if (!match) {
      throw new ContractError(`${label} entry ${index} is malformed`);
    }
    const [, mode, objectId, stageText, repositoryPath] = match;
    validateRepositoryPath(repositoryPath, `${label} entry ${index} path`);
    if (!HEX_OBJECT_ID.test(objectId)) {
      throw new ContractError(`${label} entry ${index} object ID is invalid`);
    }
    const stage = Number(stageText);
    if (stage !== 0) {
      throw new ContractError(`${label} contains an unmerged stage`);
    }
    if (seen.has(repositoryPath)) {
      throw new ContractError(
        `${label} contains duplicate path ${repositoryPath}`,
      );
    }
    seen.add(repositoryPath);
    entries.push({ mode, objectId, path: repositoryPath, stage });
  }
  if (entries.length === 0) throw new ContractError(`${label} has no entries`);
  return entries;
}

export function validateGitIndexFlags(text, label = "git index flags") {
  if (typeof text !== "string" || text === "" || !text.endsWith("\0")) {
    throw new ContractError(`${label} is empty or not NUL terminated`);
  }
  for (const [index, record] of text.slice(0, -1).split("\0").entries()) {
    if (record.length < 3 || record[1] !== " ") {
      throw new ContractError(`${label} entry ${index} is malformed`);
    }
    const tag = record[0];
    const repositoryPath = record.slice(2);
    validateRepositoryPath(repositoryPath, `${label} entry ${index} path`);
    if (tag !== "H") {
      throw new ContractError(
        `${label} contains unsupported hidden or nonstandard flag ${tag} for ${repositoryPath}`,
      );
    }
  }
  return true;
}

export function gitBlobObjectId(bytes, objectIdLength = 40) {
  if (!(bytes instanceof Uint8Array)) {
    throw new ContractError("Git blob bytes must be a byte array");
  }
  const algorithm =
    objectIdLength === 40 ? "sha1" : objectIdLength === 64 ? "sha256" : null;
  if (!algorithm) {
    throw new ContractError("Git blob object ID length is unsupported");
  }
  const body = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return createHash(algorithm)
    .update(Buffer.from(`blob ${body.length}\0`, "utf8"))
    .update(body)
    .digest("hex");
}

export function assertGitBlobObjectId(bytes, objectId, label = "tracked file") {
  if (typeof objectId !== "string" || !HEX_OBJECT_ID.test(objectId)) {
    throw new ContractError(`${label} Git object ID is invalid`);
  }
  const calculated = gitBlobObjectId(bytes, objectId.length);
  if (calculated !== objectId) {
    throw new ContractError(
      `${label} bytes differ from captured Git object ${objectId}`,
    );
  }
  return true;
}

export function requireTrackedRegularFile(indexByPath, repositoryPath, label) {
  const entry = indexByPath.get(repositoryPath);
  if (!entry) throw new ContractError(`${label} is not tracked`);
  if (entry.mode !== "100644" && entry.mode !== "100755") {
    throw new ContractError(
      `${label} must be a tracked regular file, not mode ${entry.mode}`,
    );
  }
  return entry;
}

export function selectTrackedSourceFiles(entries, requiredLanguageGroups) {
  if (
    !requiredLanguageGroups ||
    typeof requiredLanguageGroups !== "object" ||
    Array.isArray(requiredLanguageGroups)
  ) {
    throw new ContractError("Semgrep language groups are invalid");
  }
  const extensionToGroup = new Map();
  for (const [group, extensions] of Object.entries(requiredLanguageGroups)) {
    if (
      typeof group !== "string" ||
      group === "" ||
      !Array.isArray(extensions) ||
      extensions.length === 0
    ) {
      throw new ContractError("Semgrep language group is invalid");
    }
    for (const extension of extensions) {
      if (
        typeof extension !== "string" ||
        !/^\.[a-z0-9]+$/u.test(extension) ||
        extensionToGroup.has(extension)
      ) {
        throw new ContractError(
          `Semgrep extension ${String(extension)} is invalid or duplicated`,
        );
      }
      extensionToGroup.set(extension, group);
    }
  }

  const selected = [];
  const groupCounts = Object.fromEntries(
    [...new Set(extensionToGroup.values())].map((group) => [group, 0]),
  );
  for (const entry of entries) {
    const extension = POSIX.extname(entry.path).toLowerCase();
    const languageGroup = extensionToGroup.get(extension);
    if (!languageGroup) continue;
    if (entry.mode !== "100644" && entry.mode !== "100755") {
      throw new ContractError(
        `Semgrep source ${entry.path} must be a tracked regular file`,
      );
    }
    groupCounts[languageGroup] += 1;
    selected.push({ ...entry, languageGroup });
  }
  for (const [group, count] of Object.entries(groupCounts)) {
    if (count === 0) {
      throw new ContractError(
        `Semgrep source inventory has zero ${group} files`,
      );
    }
  }
  selected.sort((left, right) => left.path.localeCompare(right.path, "en"));
  return { files: selected, groupCounts };
}

export function validateGoModEdit(document, label = "go.mod") {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new ContractError(`${label} edit JSON root is invalid`);
  }
  if (
    !document.Module ||
    typeof document.Module !== "object" ||
    Array.isArray(document.Module) ||
    typeof document.Module.Path !== "string" ||
    document.Module.Path === ""
  ) {
    throw new ContractError(`${label} has no canonical module path`);
  }
  if (
    document.Replace !== null &&
    (!Array.isArray(document.Replace) || document.Replace.length !== 0)
  ) {
    throw new ContractError(`${label} contains unsupported replace directives`);
  }
  if (!("Replace" in document)) {
    throw new ContractError(`${label} edit JSON omits Replace inventory`);
  }
  return { modulePath: document.Module.Path, replaceCount: 0 };
}

export function assertSemgrepSourceParity(
  document,
  expectedRepositoryPaths,
  containerRoot = "/src",
) {
  const parsed =
    typeof document === "string"
      ? parseStrictJson(document, "Semgrep parity JSON")
      : document;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ContractError("Semgrep parity JSON root is invalid");
  }
  if (!Array.isArray(parsed.paths?.scanned)) {
    throw new ContractError("Semgrep scanned path inventory is absent");
  }
  const expected = exactPathSet(expectedRepositoryPaths, "expected Semgrep");
  const actual = parsed.paths.scanned.map((entry, index) =>
    semgrepRepositoryPath(entry, containerRoot, index),
  );
  const actualSet = exactPathSet(actual, "actual Semgrep");
  const sortedPaths = (paths) =>
    [...paths].sort((left, right) => left.localeCompare(right, "en"));
  if (
    canonicalJson(sortedPaths(actualSet)) !==
    canonicalJson(sortedPaths(expected))
  ) {
    const missing = sortedPaths(
      [...expected].filter((entry) => !actualSet.has(entry)),
    );
    const extra = sortedPaths(
      [...actualSet].filter((entry) => !expected.has(entry)),
    );
    throw new ContractError(
      `Semgrep source parity failed: missing=${canonicalJson(missing)} extra=${canonicalJson(extra)}`,
    );
  }
  for (const [index, finding] of (parsed.results ?? []).entries()) {
    if (!finding || typeof finding !== "object" || Array.isArray(finding)) {
      throw new ContractError(`Semgrep result ${index} is invalid`);
    }
    const findingPath = semgrepRepositoryPath(
      finding.path,
      containerRoot,
      `result ${index}`,
    );
    if (!expected.has(findingPath)) {
      throw new ContractError(`Semgrep finding path is outside exact targets`);
    }
  }
  return {
    pathCount: actual.length,
    pathsSha256: sha256Hex(canonicalJson(sortedPaths(actualSet))),
  };
}

export function validateEvidenceDocument(
  evidence,
  schema,
  validationContext = {},
) {
  requireRecord(evidence, "evidence");
  if (schema !== undefined) validateEvidenceAgainstSchema(evidence, schema);
  if (evidence.schemaVersion !== 2 || evidence.gateId !== "R-016") {
    throw new ContractError("evidence schema/gate identity is invalid");
  }
  for (const name of ["runId", "status", "startedAt", "finishedAt"]) {
    requireNonemptyString(evidence[name], `evidence.${name}`);
  }
  for (const name of ["startedAt", "finishedAt"]) {
    const parsed = new Date(evidence[name]);
    if (
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString() !== evidence[name]
    ) {
      throw new ContractError(`evidence.${name} must be canonical UTC`);
    }
  }
  if (!Number.isInteger(evidence.exitCode)) {
    throw new ContractError("evidence.exitCode is invalid");
  }
  for (const name of [
    "source",
    "controlSource",
    "inputs",
    "environment",
    "tools",
  ]) {
    requireRecord(evidence[name], `evidence.${name}`);
  }
  for (const name of ["advisoryDatabases", "checks", "rawArtifacts"]) {
    if (!Array.isArray(evidence[name])) {
      throw new ContractError(`evidence.${name} must be an array`);
    }
  }
  if (evidence.status === "PASS") {
    if (Object.prototype.hasOwnProperty.call(evidence, "failure")) {
      throw new ContractError("PASS evidence cannot contain failure details");
    }
    if (evidence.exitCode !== 0) {
      throw new ContractError("PASS evidence must use exit code 0");
    }
    for (const sourceName of ["source", "controlSource"]) {
      for (const name of ["head", "tree"]) {
        requireNonemptyString(
          evidence[sourceName][name],
          `evidence.${sourceName}.${name}`,
        );
        if (!/^[0-9a-f]{40}$/u.test(evidence[sourceName][name])) {
          throw new ContractError(`evidence.${sourceName}.${name} is invalid`);
        }
      }
      for (const name of ["topLevel", "gitDirectory"]) {
        requireNonemptyString(
          evidence[sourceName][name],
          `evidence.${sourceName}.${name}`,
        );
        if (!path.isAbsolute(evidence[sourceName][name])) {
          throw new ContractError(
            `evidence.${sourceName}.${name} must be absolute`,
          );
        }
      }
    }
    const splitRoot = evidence.inputs?.controlPlane?.mode === "split-root";
    if (
      (evidence.environment.runner?.GITHUB_ACTIONS === "true" || splitRoot) &&
      evidence.source.expectedCheckoutSha !== evidence.source.head
    ) {
      throw new ContractError(
        "GitHub Actions and split-root PASS evidence must bind expected checkout SHA",
      );
    }
    requireNonemptyString(
      evidence.environment.runtime?.node,
      "evidence.environment.runtime.node",
    );
    requireNonemptyString(
      evidence.environment.docker?.clientVersion,
      "evidence.environment.docker.clientVersion",
    );
    requireNonemptyString(
      evidence.environment.docker?.serverVersion,
      "evidence.environment.docker.serverVersion",
    );
    requireRecord(
      evidence.environment.executables,
      "evidence.environment.executables",
    );
    assertExactObjectKeys(
      evidence.environment.executables,
      ["git", "docker"],
      "PASS evidence executable identities",
    );
    for (const name of ["git", "docker"]) {
      const executable = evidence.environment.executables[name];
      requireRecord(executable, `evidence.environment.executables.${name}`);
      requireNonemptyString(
        executable.path,
        `evidence.environment.executables.${name}.path`,
      );
      if (!path.isAbsolute(executable.path)) {
        throw new ContractError(
          `evidence.environment.executables.${name}.path must be absolute`,
        );
      }
      validateSha256(
        executable.sha256,
        `evidence.environment.executables.${name}.sha256`,
      );
      requireNonnegativeSafeInteger(
        executable.size,
        `evidence.environment.executables.${name}.size`,
      );
      if (executable.size === 0) {
        throw new ContractError(
          `evidence.environment.executables.${name}.size must be positive`,
        );
      }
    }
  } else if (evidence.status !== "FAIL") {
    throw new ContractError("evidence.status must be PASS or FAIL");
  } else if (evidence.exitCode === 0) {
    throw new ContractError("FAIL evidence cannot use exit code 0");
  } else {
    requireRecord(evidence.failure, "FAIL evidence.failure");
  }
  const checkIds = new Set();
  const processChecks = [];
  for (const [index, check] of evidence.checks.entries()) {
    requireRecord(check, `evidence.checks[${index}]`);
    requireNonemptyString(check.id, `evidence.checks[${index}].id`);
    if (checkIds.has(check.id)) {
      throw new ContractError(
        `evidence contains duplicate check ID ${check.id}`,
      );
    }
    checkIds.add(check.id);
    requireNonemptyString(check.status, `evidence.checks[${index}].status`);
    if (PROCESS_ID.test(check.id)) {
      processChecks.push(check);
      requireNonemptyString(check.command, `evidence.checks[${index}].command`);
      if (
        !Array.isArray(check.arguments) ||
        !check.arguments.every((entry) => typeof entry === "string") ||
        !Array.isArray(check.artifacts) ||
        check.artifacts.length !== 2 ||
        !check.artifacts.every((entry) => typeof entry === "string") ||
        new Set(check.artifacts).size !== 2 ||
        check.argumentCount !== check.arguments.length ||
        !Number.isSafeInteger(check.durationMs) ||
        check.durationMs < 0 ||
        !(Number.isInteger(check.rawExit) || check.rawExit === null)
      ) {
        throw new ContractError(
          `evidence process check ${index} command contract is invalid`,
        );
      }
    }
  }
  const artifactPaths = new Set();
  const artifactsByPath = new Map();
  for (const [index, artifact] of evidence.rawArtifacts.entries()) {
    requireRecord(artifact, `evidence.rawArtifacts[${index}]`);
    validateRepositoryPath(
      artifact.path,
      `evidence.rawArtifacts[${index}].path`,
    );
    if (artifactPaths.has(artifact.path)) {
      throw new ContractError(
        `evidence contains duplicate artifact path ${artifact.path}`,
      );
    }
    artifactPaths.add(artifact.path);
    artifactsByPath.set(artifact.path, artifact);
    if (!PROCESS_ID.test(artifact.processId)) {
      throw new ContractError(
        `evidence.rawArtifacts[${index}].processId is invalid`,
      );
    }
    if (artifact.stream !== "stdout" && artifact.stream !== "stderr") {
      throw new ContractError(
        `evidence.rawArtifacts[${index}].stream is invalid`,
      );
    }
    if (typeof artifact.redacted !== "boolean") {
      throw new ContractError(
        `evidence.rawArtifacts[${index}].redacted is invalid`,
      );
    }
    for (const digestName of ["rawSha256", "sha256"]) {
      if (!/^[0-9a-f]{64}$/u.test(artifact[digestName])) {
        throw new ContractError(
          `evidence.rawArtifacts[${index}].${digestName} is invalid`,
        );
      }
    }
    for (const sizeName of ["rawSize", "size"]) {
      if (!Number.isSafeInteger(artifact[sizeName]) || artifact[sizeName] < 0) {
        throw new ContractError(
          `evidence.rawArtifacts[${index}].${sizeName} is invalid`,
        );
      }
    }
    if (
      artifact.redacted === false &&
      (artifact.rawSha256 !== artifact.sha256 ||
        artifact.rawSize !== artifact.size)
    ) {
      throw new ContractError(
        `evidence.rawArtifacts[${index}] unredacted identities differ`,
      );
    }
  }
  validateProcessArtifactLinkage(processChecks, artifactsByPath);
  if (evidence.status === "PASS") {
    validatePassEvidence(evidence, checkIds, validationContext);
  }
  return true;
}

function validateProcessArtifactLinkage(processChecks, artifactsByPath) {
  const referenced = new Set();
  for (const check of processChecks) {
    const streams = new Set();
    for (const artifactPath of check.artifacts) {
      const artifact = artifactsByPath.get(artifactPath);
      if (
        !artifact ||
        artifact.processId !== check.id ||
        referenced.has(artifactPath)
      ) {
        throw new ContractError(
          `evidence process check ${check.id} artifact linkage is invalid`,
        );
      }
      referenced.add(artifactPath);
      streams.add(artifact.stream);
    }
    if (!streams.has("stdout") || !streams.has("stderr")) {
      throw new ContractError(
        `evidence process check ${check.id} must link stdout and stderr`,
      );
    }
  }
  if (referenced.size !== artifactsByPath.size) {
    throw new ContractError("evidence contains unlinked raw artifacts");
  }
}

function validateEvidenceAgainstSchema(evidence, schema) {
  requireRecord(schema, "evidence schema");
  validateSupportedSchemaKeywords(schema);
  validateSchemaValue(evidence, schema, "evidence", schema);
}

function validateSupportedSchemaKeywords(contract, label = "evidence schema") {
  requireRecord(contract, label);
  for (const keyword of Object.keys(contract)) {
    if (!SUPPORTED_SCHEMA_KEYWORDS.has(keyword)) {
      throw new ContractError(`${label} uses unsupported keyword ${keyword}`);
    }
  }
  for (const [containerName, container] of [
    ["$defs", contract.$defs],
    ["properties", contract.properties],
  ]) {
    if (container === undefined) continue;
    requireRecord(container, `${label} ${containerName}`);
    for (const [name, child] of Object.entries(container)) {
      validateSupportedSchemaKeywords(
        child,
        `${label} ${containerName}.${name}`,
      );
    }
  }
  if (contract.items !== undefined) {
    validateSupportedSchemaKeywords(contract.items, `${label} items`);
  }
  if (
    contract.additionalProperties !== undefined &&
    typeof contract.additionalProperties === "object"
  ) {
    validateSupportedSchemaKeywords(
      contract.additionalProperties,
      `${label} additionalProperties`,
    );
  }
  for (const keyword of ["allOf", "oneOf"]) {
    if (contract[keyword] === undefined) continue;
    if (!Array.isArray(contract[keyword])) {
      throw new ContractError(`${label} ${keyword} must be an array`);
    }
    for (const [index, child] of contract[keyword].entries()) {
      validateSupportedSchemaKeywords(child, `${label} ${keyword}[${index}]`);
    }
  }
  for (const keyword of ["if", "then", "else", "not"]) {
    if (contract[keyword] !== undefined) {
      validateSupportedSchemaKeywords(contract[keyword], `${label} ${keyword}`);
    }
  }
}

function validateSchemaValue(value, contract, label, rootSchema) {
  requireRecord(contract, `${label} schema`);
  if (contract.$ref !== undefined) {
    if (typeof contract.$ref !== "string" || !contract.$ref.startsWith("#/")) {
      throw new ContractError(`${label} uses an unsupported schema reference`);
    }
    let resolved = rootSchema;
    for (const rawSegment of contract.$ref.slice(2).split("/")) {
      const segment = rawSegment.replaceAll("~1", "/").replaceAll("~0", "~");
      if (
        !resolved ||
        typeof resolved !== "object" ||
        !Object.prototype.hasOwnProperty.call(resolved, segment)
      ) {
        throw new ContractError(`${label} schema reference is unresolved`);
      }
      resolved = resolved[segment];
    }
    validateSchemaValue(value, resolved, label, rootSchema);
  }
  if (Array.isArray(contract.allOf)) {
    for (const [index, branch] of contract.allOf.entries()) {
      validateSchemaValue(
        value,
        branch,
        `${label} allOf[${index}]`,
        rootSchema,
      );
    }
  }
  if (contract.if !== undefined) {
    const branch = schemaMatches(value, contract.if, label, rootSchema)
      ? contract.then
      : contract.else;
    if (branch !== undefined) {
      validateSchemaValue(value, branch, label, rootSchema);
    }
  }
  if (Array.isArray(contract.oneOf)) {
    const matches = contract.oneOf.filter((candidate) =>
      schemaMatches(value, candidate, label, rootSchema),
    ).length;
    if (matches !== 1) {
      throw new ContractError(`${label} violates schema oneOf`);
    }
  }
  if (
    contract.not !== undefined &&
    schemaMatches(value, contract.not, label, rootSchema)
  ) {
    throw new ContractError(`${label} violates schema not`);
  }
  if (contract.type !== undefined) {
    const types = Array.isArray(contract.type)
      ? contract.type
      : [contract.type];
    const valid = types.some((type) => schemaTypeMatches(value, type));
    if (!valid) throw new ContractError(`${label} violates schema type`);
  }
  if (
    Object.prototype.hasOwnProperty.call(contract, "const") &&
    canonicalJson(value) !== canonicalJson(contract.const)
  ) {
    throw new ContractError(`${label} violates schema const`);
  }
  if (
    Array.isArray(contract.enum) &&
    !contract.enum.some(
      (candidate) => canonicalJson(candidate) === canonicalJson(value),
    )
  ) {
    throw new ContractError(`${label} violates schema enum`);
  }
  if (
    contract.minLength !== undefined &&
    typeof value === "string" &&
    value.length < contract.minLength
  ) {
    throw new ContractError(`${label} violates schema minLength`);
  }
  if (
    contract.pattern !== undefined &&
    typeof value === "string" &&
    !new RegExp(contract.pattern, "u").test(value)
  ) {
    throw new ContractError(`${label} violates schema pattern`);
  }
  if (
    contract.minimum !== undefined &&
    typeof value === "number" &&
    value < contract.minimum
  ) {
    throw new ContractError(`${label} violates schema minimum`);
  }
  if (
    contract.maximum !== undefined &&
    typeof value === "number" &&
    value > contract.maximum
  ) {
    throw new ContractError(`${label} violates schema maximum`);
  }
  if (
    contract.minItems !== undefined &&
    Array.isArray(value) &&
    value.length < contract.minItems
  ) {
    throw new ContractError(`${label} violates schema minItems`);
  }
  if (
    contract.maxItems !== undefined &&
    Array.isArray(value) &&
    value.length > contract.maxItems
  ) {
    throw new ContractError(`${label} violates schema maxItems`);
  }
  if (contract.uniqueItems === true && Array.isArray(value)) {
    const identities = value.map((entry) => canonicalJson(entry));
    if (new Set(identities).size !== identities.length) {
      throw new ContractError(`${label} violates schema uniqueItems`);
    }
  }
  if (
    contract.minProperties !== undefined &&
    isRecordValue(value) &&
    Object.keys(value).length < contract.minProperties
  ) {
    throw new ContractError(`${label} violates schema minProperties`);
  }
  if (contract.format === "date-time") {
    const parsed = new Date(value);
    if (
      typeof value !== "string" ||
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString() !== value
    ) {
      throw new ContractError(`${label} violates schema date-time format`);
    }
  }
  if (contract.format === "uri" && typeof value === "string") {
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      throw new ContractError(`${label} violates schema uri format`);
    }
    if (parsed.protocol === "") {
      throw new ContractError(`${label} violates schema uri format`);
    }
  }
  if (Array.isArray(value) && contract.items !== undefined) {
    for (const [index, entry] of value.entries()) {
      validateSchemaValue(
        entry,
        contract.items,
        `${label}[${index}]`,
        rootSchema,
      );
    }
  }
  if (isRecordValue(value)) {
    const properties = isRecordValue(contract.properties)
      ? contract.properties
      : {};
    if (contract.required !== undefined) {
      if (
        !Array.isArray(contract.required) ||
        !contract.required.every((entry) => typeof entry === "string") ||
        new Set(contract.required).size !== contract.required.length
      ) {
        throw new ContractError(`${label} schema required fields are invalid`);
      }
      for (const name of contract.required) {
        if (!Object.prototype.hasOwnProperty.call(value, name)) {
          throw new ContractError(`${label} schema requires ${name}`);
        }
      }
    }
    for (const [name, propertySchema] of Object.entries(properties)) {
      if (!Object.prototype.hasOwnProperty.call(value, name)) continue;
      validateSchemaValue(
        value[name],
        propertySchema,
        `${label}.${name}`,
        rootSchema,
      );
    }
    if (contract.additionalProperties === false) {
      const permitted = new Set(Object.keys(properties));
      for (const name of Object.keys(value)) {
        if (!permitted.has(name)) {
          throw new ContractError(`${label} schema rejects property ${name}`);
        }
      }
    }
  }
}

function schemaMatches(value, contract, label, rootSchema) {
  try {
    validateSchemaValue(value, contract, label, rootSchema);
    return true;
  } catch (error) {
    if (error instanceof ContractError) return false;
    throw error;
  }
}

function schemaTypeMatches(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isRecordValue(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "number")
    return typeof value === "number" && Number.isFinite(value);
  if (type === "string") return typeof value === "string";
  if (type === "boolean") return typeof value === "boolean";
  throw new ContractError(`unsupported evidence schema type ${String(type)}`);
}

function isRecordValue(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validatePassEvidence(evidence, checkIds, validationContext) {
  const trusted = validatePassValidationContext(validationContext);
  const terminalIds = new Set(PASS_TERMINAL_CHECK_IDS);
  const processChecks = [];
  for (const check of evidence.checks) {
    if (PROCESS_ID.test(check.id)) {
      processChecks.push(check);
      if (
        check.status !== "RECORDED" ||
        check.timedOut !== false ||
        check.outputLimitExceeded !== false ||
        check.signal !== null
      ) {
        throw new ContractError(
          `PASS evidence process check ${check.id} is not cleanly recorded`,
        );
      }
      continue;
    }
    if (!terminalIds.has(check.id)) {
      throw new ContractError(
        `PASS evidence contains unsupported check ${check.id}`,
      );
    }
    if (check.status !== "PASS") {
      throw new ContractError(
        `PASS evidence terminal check ${check.id} did not pass`,
      );
    }
  }
  if (processChecks.length === 0) {
    throw new ContractError("PASS evidence must contain process checks");
  }
  validateTrustedEvidenceSeals(evidence, processChecks, trusted);
  for (const id of PASS_TERMINAL_CHECK_IDS) {
    if (!checkIds.has(id)) {
      throw new ContractError(`PASS evidence is missing terminal check ${id}`);
    }
  }

  assertExactObjectKeys(
    evidence.inputs,
    PASS_INPUT_NAMES,
    "PASS evidence inputs",
  );
  validatePassInputs(
    evidence.inputs,
    trusted,
    evidence.environment.runner?.GITHUB_ACTIONS,
  );
  validateRequiredProcessChecks(processChecks, evidence, trusted);
  assertExactObjectKeys(evidence.tools, PASS_TOOL_NAMES, "PASS evidence tools");
  for (const name of PASS_TOOL_NAMES) {
    validateEvidenceTool(evidence.tools[name], name, trusted.configuration);
    validateToolExecutionEvidence(
      evidence.tools[name],
      name,
      evidence,
      trusted.toolExecutionSeals[name],
    );
  }
  validateEvidenceDatabases(evidence.advisoryDatabases, trusted.configuration);
  validateDatabaseArchiveEvidence(
    evidence.databaseArchiveValidation,
    evidence,
    trusted.configuration,
  );
  validateDatabaseSealEvidence(evidence.databaseSeal, evidence);
  validateRawArtifactSeals(evidence.rawArtifacts, trusted.rawArtifactSeals);
  if (evidence.rawArtifacts.length === 0) {
    throw new ContractError("PASS evidence must contain raw artifacts");
  }
}

function validateRequiredProcessChecks(processChecks, evidence, trusted) {
  const inputs = evidence.inputs;
  const ids = new Set(processChecks.map(({ id }) => id));
  const required = new Set(PASS_REQUIRED_PROCESS_IDS);
  const controlIsSplit = evidence.inputs.controlPlane.mode === "split-root";
  if (controlIsSplit) {
    for (const id of SPLIT_CONTROL_SOURCE_PROCESS_IDS) required.add(id);
  }
  for (const id of required) {
    if (!ids.has(id)) {
      throw new ContractError(`PASS evidence is missing process check ${id}`);
    }
  }
  for (const check of processChecks) {
    const executable = path.basename(check.command).toLowerCase();
    if (
      /^docker(?:\.exe)?$/u.test(executable) &&
      check.arguments[0] === "run" &&
      !check.id.includes("-CLEANUP-")
    ) {
      for (const phase of ["BEFORE", "AFTER"]) {
        const cleanupId = `${check.id}-CLEANUP-${phase}`;
        required.add(cleanupId);
        if (!ids.has(cleanupId)) {
          throw new ContractError(
            `PASS evidence is missing cleanup process check ${cleanupId}`,
          );
        }
      }
    }
  }
  for (const check of processChecks) {
    if (
      !required.has(check.id) &&
      !PASS_DYNAMIC_PROCESS_PATTERNS.some((pattern) => pattern.test(check.id))
    ) {
      throw new ContractError(
        `PASS evidence contains unsupported process check ${check.id}`,
      );
    }
    validateProcessCommandShape(check, evidence, trusted);
    const acceptedRawExits = acceptedProcessRawExits(check.id);
    if (!acceptedRawExits.includes(check.rawExit)) {
      throw new ContractError(
        `PASS evidence process ${check.id} raw exit is invalid`,
      );
    }
  }
  for (const id of ids) {
    const cleanup =
      /^(PROCESS-[A-Z0-9._-]+)-CLEANUP-(?:BEFORE|AFTER|REMOVE)$/u.exec(id);
    if (cleanup && !ids.has(cleanup[1])) {
      throw new ContractError(
        `PASS evidence cleanup process ${id} has no scanner process`,
      );
    }
  }
  validateCleanupProcessRelationships(processChecks, evidence.rawArtifacts);
  const gitBlobs = processChecks.filter(({ id }) =>
    /^PROCESS-GIT-BLOB-[0-9A-F]{20}$/u.test(id),
  );
  const controlGitBlobs = processChecks.filter(({ id }) =>
    /^PROCESS-GIT-CONTROL-BLOB-[0-9A-F]{20}$/u.test(id),
  );
  const ruleBlobs = processChecks.filter(({ id }) =>
    /^PROCESS-RULE-BLOB-[0-9A-F]{20}$/u.test(id),
  );
  const goModEdits = processChecks.filter(
    ({ id }) =>
      /^PROCESS-GO-MOD-EDIT-[A-Z0-9._-]+$/u.test(id) &&
      !id.includes("-CLEANUP-"),
  );
  const goLists = processChecks.filter(
    ({ id }) =>
      /^PROCESS-GO-LIST-[A-Z0-9._-]+$/u.test(id) && !id.includes("-CLEANUP-"),
  );
  if (
    gitBlobs.length === 0 ||
    controlGitBlobs.length === 0 ||
    ruleBlobs.length !== inputs.semgrepRules.files.length ||
    goModEdits.length !== inputs.go.length ||
    goLists.length !== inputs.go.length
  ) {
    throw new ContractError(
      "PASS evidence dynamic process inventory is incomplete",
    );
  }
  validateDynamicBlobProcesses(processChecks, evidence, trusted);
  validateSourceProcessSemantics(
    processByIdFrom(processChecks),
    evidence,
    trusted,
  );
  validateControlSourceProcessSemantics(
    processByIdFrom(processChecks),
    evidence,
    trusted,
  );
  const terminalById = new Map(
    evidence.checks
      .filter(({ id }) => id.startsWith("R016-"))
      .map((check) => [check.id, check]),
  );
  const processById = new Map(processChecks.map((check) => [check.id, check]));
  for (const [processId, terminalId] of [
    ["PROCESS-OSV-MISSING-DATABASE-NEGATIVE", "R016-OSV-MISSING-DB-NEGATIVE"],
    ["PROCESS-OSV-VULNERABILITY-CANARY", "R016-OSV-VULNERABILITY-CANARY"],
    [
      "PROCESS-OSV-VULNERABILITY-DEVELOPMENT-CANARY",
      "R016-OSV-VULNERABILITY-DEVELOPMENT-CANARY",
    ],
    ["PROCESS-OSV-GO-ADVISORY-CANARY", "R016-OSV-GO-ADVISORY-CANARY"],
    [
      "PROCESS-OSV-GO-LICENSE-DENIED-CANARY",
      "R016-OSV-GO-LICENSE-DENIED-CANARY",
    ],
    ["PROCESS-OSV-LICENSE-DENIED-CANARY", "R016-OSV-LICENSE-DENIED-CANARY"],
    ["PROCESS-OSV-LICENSE-UNKNOWN-CANARY", "R016-OSV-LICENSE-UNKNOWN-CANARY"],
    ["PROCESS-OSV-DATABASE-ZIP-VALIDATION", "R016-DB-ZIP"],
    ["PROCESS-OSV-VULNERABILITY", "R016-VULNERABILITY"],
    ["PROCESS-OSV-LICENSE", "R016-LICENSE"],
    ["PROCESS-SEMGREP-REPOSITORY", "R016-SAST"],
    ["PROCESS-SEMGREP-BLOCKING-FIXTURES", "R016-SAST-NEGATIVE"],
  ]) {
    const processCheck = processById.get(processId);
    const terminalCheck = terminalById.get(terminalId);
    if (processCheck?.rawExit !== terminalCheck?.rawExit) {
      throw new ContractError(
        `PASS evidence terminal ${terminalId} raw exit does not match ${processId}`,
      );
    }
    validateTerminalArtifactReference(
      terminalCheck,
      processCheck,
      evidence.rawArtifacts,
    );
  }
  validateTerminalSemantics(evidence, terminalById, processById, trusted);
}

function processByIdFrom(processChecks) {
  return new Map(processChecks.map((check) => [check.id, check]));
}

function validateSourceProcessSemantics(processById, evidence, trusted) {
  const root = trusted.root;
  const trackedEntries = [...trusted.trackedIndex.values()];
  if (
    evidence.source.trackedFileCount !== trackedEntries.length ||
    evidence.source.trackedIndexSha256 !==
      sha256Hex(canonicalJson(trackedEntries))
  ) {
    throw new ContractError(
      "PASS evidence source inventory differs from the trusted Git index",
    );
  }
  const contracts = {
    "PROCESS-GIT-TOP-LEVEL": ["-C", root, "rev-parse", "--show-toplevel"],
    "PROCESS-GIT-DIRECTORY": ["-C", root, "rev-parse", "--absolute-git-dir"],
    "PROCESS-GIT-HEAD": ["-C", root, "rev-parse", "HEAD"],
    "PROCESS-GIT-TREE": ["-C", root, "rev-parse", "HEAD^{tree}"],
    "PROCESS-GIT-BRANCH": ["-C", root, "branch", "--show-current"],
    "PROCESS-GIT-STATUS": [
      "-C",
      root,
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ],
    "PROCESS-GIT-INDEX": ["-C", root, "ls-files", "--stage", "-z"],
    "PROCESS-GIT-INDEX-FLAGS": ["-C", root, "ls-files", "-v", "-z"],
    "PROCESS-GIT-TOP-LEVEL-FINAL": ["-C", root, "rev-parse", "--show-toplevel"],
    "PROCESS-GIT-DIRECTORY-FINAL": [
      "-C",
      root,
      "rev-parse",
      "--absolute-git-dir",
    ],
    "PROCESS-GIT-HEAD-FINAL": ["-C", root, "rev-parse", "HEAD"],
    "PROCESS-GIT-TREE-FINAL": ["-C", root, "rev-parse", "HEAD^{tree}"],
    "PROCESS-GIT-STATUS-FINAL": [
      "-C",
      root,
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ],
    "PROCESS-GIT-INDEX-FINAL": ["-C", root, "ls-files", "--stage", "-z"],
    "PROCESS-GIT-INDEX-FLAGS-FINAL": ["-C", root, "ls-files", "-v", "-z"],
  };
  for (const [id, arguments_] of Object.entries(contracts)) {
    if (
      canonicalJson(processById.get(id)?.arguments) !==
      canonicalJson(arguments_)
    ) {
      throw new ContractError(`PASS evidence source process ${id} is invalid`);
    }
  }
  for (const [id, output] of [
    ["PROCESS-GIT-HEAD", `${evidence.source.head}\n`],
    ["PROCESS-GIT-HEAD-FINAL", `${evidence.source.head}\n`],
    ["PROCESS-GIT-TREE", `${evidence.source.tree}\n`],
    ["PROCESS-GIT-TREE-FINAL", `${evidence.source.tree}\n`],
    [
      "PROCESS-GIT-BRANCH",
      evidence.source.branch === "DETACHED"
        ? ""
        : `${evidence.source.branch}\n`,
    ],
    ["PROCESS-GIT-STATUS", ""],
    ["PROCESS-GIT-STATUS-FINAL", ""],
    [
      "PROCESS-GIT-INDEX",
      trackedEntries
        .map(
          ({ mode, objectId, path: repositoryPath, stage }) =>
            `${mode} ${objectId} ${stage}\t${repositoryPath}\0`,
        )
        .join(""),
    ],
    [
      "PROCESS-GIT-INDEX-FINAL",
      trackedEntries
        .map(
          ({ mode, objectId, path: repositoryPath, stage }) =>
            `${mode} ${objectId} ${stage}\t${repositoryPath}\0`,
        )
        .join(""),
    ],
    [
      "PROCESS-GIT-INDEX-FLAGS",
      trackedEntries
        .map(({ path: repositoryPath }) => `H ${repositoryPath}\0`)
        .join(""),
    ],
    [
      "PROCESS-GIT-INDEX-FLAGS-FINAL",
      trackedEntries
        .map(({ path: repositoryPath }) => `H ${repositoryPath}\0`)
        .join(""),
    ],
  ]) {
    validateUnredactedProcessStdout(
      processById.get(id),
      output,
      evidence.rawArtifacts,
      id,
    );
  }
  const splitRoot = evidence.inputs.controlPlane.mode === "split-root";
  if (
    (splitRoot && evidence.source.expectedCheckoutSha === null) ||
    (evidence.source.expectedCheckoutSha !== null &&
      evidence.source.expectedCheckoutSha !== evidence.source.head)
  ) {
    throw new ContractError(
      "PASS evidence expected checkout SHA differs from exact source HEAD",
    );
  }
  for (const [id, expectedPath] of [
    ["PROCESS-GIT-TOP-LEVEL", trusted.root],
    ["PROCESS-GIT-TOP-LEVEL-FINAL", trusted.root],
    ["PROCESS-GIT-DIRECTORY", evidence.source.gitDirectory],
    ["PROCESS-GIT-DIRECTORY-FINAL", evidence.source.gitDirectory],
  ]) {
    validateUnredactedProcessStdoutVariants(
      processById.get(id),
      [
        `${path.resolve(expectedPath)}\n`,
        `${path.resolve(expectedPath).replaceAll("\\", "/")}\n`,
      ],
      evidence.rawArtifacts,
      id,
    );
  }
}

function validateControlSourceProcessSemantics(processById, evidence, trusted) {
  const control = evidence.controlSource;
  const terminal = evidence.checks.find(
    ({ id }) => id === "R016-CONTROL-SOURCE-SEAL",
  );
  const sameRoot = evidence.inputs.controlPlane.mode === "same-root";
  if (sameRoot) {
    if (
      canonicalJson(control) !== canonicalJson(evidence.source) ||
      terminal?.head !== control.head ||
      terminal?.tree !== control.tree ||
      terminal?.sameAsTarget !== true
    ) {
      throw new ContractError(
        "PASS evidence same-root control source semantics are invalid",
      );
    }
    return;
  }
  const root = trusted.controlRoot;
  const trackedEntries = [...trusted.controlTrackedIndex.values()];
  if (
    control.trackedFileCount !== trackedEntries.length ||
    control.trackedIndexSha256 !== sha256Hex(canonicalJson(trackedEntries)) ||
    control.expectedCheckoutSha !== control.head ||
    terminal?.head !== control.head ||
    terminal?.tree !== control.tree ||
    Object.hasOwn(terminal ?? {}, "sameAsTarget")
  ) {
    throw new ContractError(
      "PASS evidence split-root control source semantics are invalid",
    );
  }
  const contracts = {
    "PROCESS-GIT-CONTROL-TOP-LEVEL": [
      "-C",
      root,
      "rev-parse",
      "--show-toplevel",
    ],
    "PROCESS-GIT-CONTROL-DIRECTORY": [
      "-C",
      root,
      "rev-parse",
      "--absolute-git-dir",
    ],
    "PROCESS-GIT-CONTROL-HEAD": ["-C", root, "rev-parse", "HEAD"],
    "PROCESS-GIT-CONTROL-TREE": ["-C", root, "rev-parse", "HEAD^{tree}"],
    "PROCESS-GIT-CONTROL-BRANCH": ["-C", root, "branch", "--show-current"],
    "PROCESS-GIT-CONTROL-STATUS": [
      "-C",
      root,
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ],
    "PROCESS-GIT-CONTROL-INDEX": ["-C", root, "ls-files", "--stage", "-z"],
    "PROCESS-GIT-CONTROL-INDEX-FLAGS": ["-C", root, "ls-files", "-v", "-z"],
    "PROCESS-GIT-CONTROL-TOP-LEVEL-FINAL": [
      "-C",
      root,
      "rev-parse",
      "--show-toplevel",
    ],
    "PROCESS-GIT-CONTROL-DIRECTORY-FINAL": [
      "-C",
      root,
      "rev-parse",
      "--absolute-git-dir",
    ],
    "PROCESS-GIT-CONTROL-HEAD-FINAL": ["-C", root, "rev-parse", "HEAD"],
    "PROCESS-GIT-CONTROL-TREE-FINAL": ["-C", root, "rev-parse", "HEAD^{tree}"],
    "PROCESS-GIT-CONTROL-STATUS-FINAL": [
      "-C",
      root,
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ],
    "PROCESS-GIT-CONTROL-INDEX-FINAL": [
      "-C",
      root,
      "ls-files",
      "--stage",
      "-z",
    ],
    "PROCESS-GIT-CONTROL-INDEX-FLAGS-FINAL": [
      "-C",
      root,
      "ls-files",
      "-v",
      "-z",
    ],
  };
  for (const [id, expectedArguments] of Object.entries(contracts)) {
    if (
      canonicalJson(processById.get(id)?.arguments) !==
      canonicalJson(expectedArguments)
    ) {
      throw new ContractError(
        `PASS evidence control source process ${id} is invalid`,
      );
    }
  }
  const indexOutput = trackedEntries
    .map(
      ({ mode, objectId, path: repositoryPath, stage }) =>
        `${mode} ${objectId} ${stage}\t${repositoryPath}\0`,
    )
    .join("");
  const flagsOutput = trackedEntries
    .map(({ path: repositoryPath }) => `H ${repositoryPath}\0`)
    .join("");
  for (const [id, output] of [
    ["PROCESS-GIT-CONTROL-HEAD", `${control.head}\n`],
    ["PROCESS-GIT-CONTROL-HEAD-FINAL", `${control.head}\n`],
    ["PROCESS-GIT-CONTROL-TREE", `${control.tree}\n`],
    ["PROCESS-GIT-CONTROL-TREE-FINAL", `${control.tree}\n`],
    [
      "PROCESS-GIT-CONTROL-BRANCH",
      control.branch === "DETACHED" ? "" : `${control.branch}\n`,
    ],
    ["PROCESS-GIT-CONTROL-STATUS", ""],
    ["PROCESS-GIT-CONTROL-STATUS-FINAL", ""],
    ["PROCESS-GIT-CONTROL-INDEX", indexOutput],
    ["PROCESS-GIT-CONTROL-INDEX-FINAL", indexOutput],
    ["PROCESS-GIT-CONTROL-INDEX-FLAGS", flagsOutput],
    ["PROCESS-GIT-CONTROL-INDEX-FLAGS-FINAL", flagsOutput],
  ]) {
    validateUnredactedProcessStdout(
      processById.get(id),
      output,
      evidence.rawArtifacts,
      id,
    );
  }
  for (const [id, expectedPath] of [
    ["PROCESS-GIT-CONTROL-TOP-LEVEL", root],
    ["PROCESS-GIT-CONTROL-TOP-LEVEL-FINAL", root],
    ["PROCESS-GIT-CONTROL-DIRECTORY", control.gitDirectory],
    ["PROCESS-GIT-CONTROL-DIRECTORY-FINAL", control.gitDirectory],
  ]) {
    validateUnredactedProcessStdoutVariants(
      processById.get(id),
      [
        `${path.resolve(expectedPath)}\n`,
        `${path.resolve(expectedPath).replaceAll("\\", "/")}\n`,
      ],
      evidence.rawArtifacts,
      id,
    );
  }
}

function validateUnredactedProcessStdoutVariants(
  check,
  expectedValues,
  artifacts,
  label,
) {
  const stdout = artifacts.find(
    (artifact) =>
      artifact.processId === check?.id && artifact.stream === "stdout",
  );
  if (
    !stdout ||
    stdout.redacted !== false ||
    !expectedValues.some(
      (expected) =>
        stdout.sha256 === sha256Hex(expected) &&
        stdout.size === Buffer.byteLength(expected),
    )
  ) {
    throw new ContractError(
      `PASS evidence ${label} stdout identity is invalid`,
    );
  }
}

function validateUnredactedProcessStdout(check, expected, artifacts, label) {
  const stdout = artifacts.find(
    (artifact) =>
      artifact.processId === check?.id && artifact.stream === "stdout",
  );
  if (
    !stdout ||
    stdout.redacted !== false ||
    stdout.sha256 !== sha256Hex(expected) ||
    stdout.size !== Buffer.byteLength(expected)
  ) {
    throw new ContractError(
      `PASS evidence ${label} stdout identity is invalid`,
    );
  }
}

function acceptedProcessRawExits(id) {
  if (id === "PROCESS-OSV-MISSING-DATABASE-NEGATIVE") return [127];
  if (
    id === "PROCESS-OSV-VULNERABILITY-CANARY" ||
    id === "PROCESS-OSV-VULNERABILITY-DEVELOPMENT-CANARY" ||
    id === "PROCESS-OSV-GO-ADVISORY-CANARY" ||
    id === "PROCESS-OSV-GO-LICENSE-DENIED-CANARY" ||
    id === "PROCESS-OSV-LICENSE-DENIED-CANARY" ||
    id === "PROCESS-OSV-LICENSE-UNKNOWN-CANARY" ||
    id === "PROCESS-SEMGREP-BLOCKING-FIXTURES"
  ) {
    return [1];
  }
  if (id === "PROCESS-OSV-VULNERABILITY" || id === "PROCESS-OSV-LICENSE") {
    return [0, 1];
  }
  return [0];
}

function validateProcessCommandShape(check, evidence, trusted) {
  const configuration = trusted.configuration;
  const executable = path.basename(check.command).toLowerCase();
  const isGit =
    check.id.startsWith("PROCESS-GIT-") ||
    check.id.startsWith("PROCESS-RULES-") ||
    check.id.startsWith("PROCESS-RULE-BLOB-");
  if (isGit) {
    if (!/^git(?:\.exe)?$/u.test(executable)) {
      throw new ContractError(
        `PASS evidence process ${check.id} is not a bound Git command`,
      );
    }
    if (check.id.startsWith("PROCESS-RULES-")) {
      const rulesRoot = path.join(trusted.temporaryRoot, "semgrep-rules");
      const lock = configuration.scanners.semgrepRules;
      const expected = {
        "PROCESS-RULES-GIT-INIT": ["-C", rulesRoot, "init", "--quiet"],
        "PROCESS-RULES-GIT-REMOTE": [
          "-C",
          rulesRoot,
          "remote",
          "add",
          "origin",
          lock.repository,
        ],
        "PROCESS-RULES-GIT-FETCH": [
          "-c",
          "protocol.version=2",
          "-C",
          rulesRoot,
          "fetch",
          "--depth=1",
          "--no-tags",
          "origin",
          lock.commit,
        ],
        "PROCESS-RULES-COMMIT": ["-C", rulesRoot, "rev-parse", "FETCH_HEAD"],
        "PROCESS-RULES-TREE": [
          "-C",
          rulesRoot,
          "rev-parse",
          "FETCH_HEAD^{tree}",
        ],
      }[check.id];
      if (
        !expected ||
        canonicalJson(check.arguments) !== canonicalJson(expected)
      ) {
        throw new ContractError(
          `PASS evidence process ${check.id} rules acquisition arguments are invalid`,
        );
      }
      if (check.id === "PROCESS-RULES-COMMIT") {
        validateUnredactedProcessStdout(
          check,
          `${lock.commit}\n`,
          evidence.rawArtifacts,
          check.id,
        );
      }
      if (check.id === "PROCESS-RULES-TREE") {
        validateUnredactedProcessStdout(
          check,
          `${lock.tree}\n`,
          evidence.rawArtifacts,
          check.id,
        );
      }
      return;
    }
    if (check.arguments[0] !== "-C") {
      throw new ContractError(
        `PASS evidence process ${check.id} is not a bound Git command`,
      );
    }
    return;
  }
  if (!/^docker(?:\.exe)?$/u.test(executable)) {
    throw new ContractError(
      `PASS evidence process ${check.id} is not a Docker command`,
    );
  }
  const cleanup = /-CLEANUP-(BEFORE|AFTER|REMOVE)$/u.exec(check.id);
  if (cleanup) {
    const validList =
      cleanup[1] !== "REMOVE" &&
      check.arguments.length === 5 &&
      check.arguments[0] === "container" &&
      check.arguments[1] === "ls" &&
      check.arguments[2] === "-aq" &&
      check.arguments[3] === "--filter" &&
      /^name=\^\/hedefora-r016-[a-z0-9-]+\$$/u.test(check.arguments[4]);
    const validRemoval =
      cleanup[1] === "REMOVE" &&
      check.arguments.length >= 3 &&
      check.arguments[0] === "rm" &&
      check.arguments[1] === "--force" &&
      check.arguments.slice(2).every((id) => /^[0-9a-f]{12,64}$/u.test(id));
    if (!validList && !validRemoval) {
      throw new ContractError(
        `PASS evidence process ${check.id} cleanup arguments are invalid`,
      );
    }
    return;
  }
  if (check.arguments[0] !== "run") {
    const expected = expectedDockerUtilityArguments(check.id, configuration);
    if (canonicalJson(check.arguments) !== canonicalJson(expected)) {
      throw new ContractError(
        `PASS evidence process ${check.id} utility arguments are invalid`,
      );
    }
    return;
  }
  const actual = parseDockerRunArguments(check, trusted.root);
  const expected = expectedDockerRunContract(
    check.id,
    evidence,
    configuration,
    trusted.temporaryRoot,
  );
  if (
    actual.cidFile !== expected.cidFile ||
    actual.image !== expected.image ||
    actual.network !== expected.network ||
    actual.memory !== expected.memory ||
    actual.user !== expected.user ||
    actual.workdir !== expected.workdir ||
    actual.tmpfs !== expected.tmpfs ||
    canonicalJson(actual.mounts) !== canonicalJson(expected.mounts) ||
    canonicalJson(actual.environment) !== canonicalJson(expected.environment) ||
    canonicalJson(actual.commandArguments) !==
      canonicalJson(expected.commandArguments)
  ) {
    throw new ContractError(
      `PASS evidence process ${check.id} Docker run contract is invalid`,
    );
  }
}

function expectedDockerUtilityArguments(id, configuration) {
  if (id === "PROCESS-DOCKER-VERSION") {
    return ["version", "--format", "{{json .}}"];
  }
  const match =
    /^PROCESS-(OSV-SCANNER|SEMGREP-CE|GO-TOOLCHAIN)-(PULL|INSPECT|INDEX)$/u.exec(
      id,
    );
  if (!match) {
    throw new ContractError(
      `PASS evidence process ${id} is not a supported Docker utility`,
    );
  }
  const toolNames = {
    "OSV-SCANNER": "osv-scanner",
    "SEMGREP-CE": "semgrep-ce",
    "GO-TOOLCHAIN": "go-toolchain",
  };
  const image = evidenceToolLock(
    configuration.scanners,
    toolNames[match[1]],
  ).image;
  if (match[2] === "PULL") return ["pull", "--platform", "linux/amd64", image];
  if (match[2] === "INSPECT") return ["image", "inspect", image];
  return ["manifest", "inspect", image];
}

function parseDockerRunArguments(check, repositoryRoot) {
  const arguments_ = check.arguments;
  const expectedPrefix = [
    "run",
    "--rm",
    "--platform",
    "linux/amd64",
    "--cidfile",
  ];
  if (
    canonicalJson(arguments_.slice(0, expectedPrefix.length)) !==
      canonicalJson(expectedPrefix) ||
    !path.isAbsolute(arguments_[5] ?? "") ||
    arguments_[6] !== "--name" ||
    !/^hedefora-r016-[a-f0-9]{24}$/u.test(arguments_[7] ?? "") ||
    arguments_[8] !== "--network" ||
    arguments_[10] !== "--memory" ||
    arguments_[12] !== "--pids-limit" ||
    arguments_[13] !== "256" ||
    arguments_[14] !== "--cpus" ||
    arguments_[15] !== "2" ||
    arguments_[16] !== "--cap-drop" ||
    arguments_[17] !== "ALL" ||
    arguments_[18] !== "--security-opt" ||
    arguments_[19] !== "no-new-privileges" ||
    arguments_[20] !== "--read-only" ||
    arguments_[21] !== "--tmpfs"
  ) {
    throw new ContractError(
      `PASS evidence process ${check.id} Docker security prefix is invalid`,
    );
  }
  let index = 23;
  let user = null;
  let workdir = null;
  if (arguments_[index] === "--user") {
    user = arguments_[index + 1];
    index += 2;
  }
  if (arguments_[index] === "--workdir") {
    workdir = arguments_[index + 1];
    index += 2;
  }
  const mounts = [];
  const destinations = new Set();
  while (arguments_[index] === "--mount") {
    const mount = /^type=bind,src=(.+),dst=(\/[^,]+)(,readonly)?$/u.exec(
      arguments_[index + 1] ?? "",
    );
    if (!mount || !path.isAbsolute(mount[1]) || destinations.has(mount[2])) {
      throw new ContractError(
        `PASS evidence process ${check.id} Docker mount grammar is invalid`,
      );
    }
    destinations.add(mount[2]);
    mounts.push({
      source: path.resolve(mount[1]),
      destination: mount[2],
      readOnly: mount[3] === ",readonly",
    });
    index += 2;
  }
  const environment = Object.create(null);
  while (arguments_[index] === "--env") {
    const environmentEntry = /^([A-Z][A-Z0-9_]*)=(.*)$/u.exec(
      arguments_[index + 1] ?? "",
    );
    if (!environmentEntry || Object.hasOwn(environment, environmentEntry[1])) {
      throw new ContractError(
        `PASS evidence process ${check.id} Docker environment grammar is invalid`,
      );
    }
    environment[environmentEntry[1]] = environmentEntry[2];
    index += 2;
  }
  const image = arguments_[index];
  const commandArguments = arguments_.slice(index + 1);
  if (typeof image !== "string" || commandArguments.length === 0) {
    throw new ContractError(
      `PASS evidence process ${check.id} Docker image/command is absent`,
    );
  }
  const network = arguments_[9];
  if (network === "bridge") {
    for (const mount of mounts) {
      const relative = path.relative(
        path.resolve(repositoryRoot),
        mount.source,
      );
      if (
        relative === "" ||
        (!relative.startsWith(`..${path.sep}`) &&
          relative !== ".." &&
          !path.isAbsolute(relative))
      ) {
        throw new ContractError(
          `PASS evidence process ${check.id} networked mount enters the repository`,
        );
      }
    }
  }
  return {
    cidFile: path.resolve(arguments_[5]),
    commandArguments,
    containerName: arguments_[7],
    environment,
    image,
    memory: arguments_[11],
    mounts,
    network,
    tmpfs: arguments_[22],
    user,
    workdir,
  };
}

function expectedDockerRunContract(id, evidence, configuration, temporaryRoot) {
  const scanners = configuration.scanners;
  const allowedLicenses = configuration.policy.licenses.allowed.join(",");
  const osvBase = [
    "scan",
    "source",
    "--format",
    "json",
    "--all-packages",
    "--all-vulns",
  ];
  const offlineOsv = [...osvBase, "--offline", "--offline-vulnerabilities"];
  const productionLockfiles = [
    ...evidence.inputs.pnpm.documents.map(({ source }) => source),
    ...evidence.inputs.go.map(({ source }) => source),
  ];
  const lockfileArguments = (sources) =>
    sources.flatMap((source) => ["--lockfile", source]);
  const semgrep = [
    "semgrep",
    "scan",
    "--oss-only",
    "--json",
    "--error",
    "--strict",
    "--metrics",
    "off",
    "--disable-version-check",
    "--disable-nosem",
    "--jobs",
    "2",
    "--max-memory",
    "1200",
    "--timeout",
    "20",
    "--timeout-threshold",
    "1",
    "--no-git-ignore",
    "--x-ignore-semgrepignore-files",
    "--max-target-bytes",
    "0",
    "--no-exclude-binary-files",
    ...scanners.semgrepRules.files.flatMap(({ path: rulePath }) => [
      "--config",
      `/rules/${rulePath}`,
    ]),
  ];
  const osvEnvironment = {
    HOME: "/tmp/home",
    OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY: "/cache",
  };
  const semgrepEnvironment = {
    HOME: "/tmp/home",
    SEMGREP_ENABLE_VERSION_CHECK: "0",
    SEMGREP_SEND_METRICS: "off",
  };
  const goEnvironment = {
    GOCACHE: "/gocache",
    GOENV: "off",
    GOFLAGS: "-mod=readonly",
    GOINSECURE: "",
    GOMODCACHE: "/gomodcache",
    GONOPROXY: "",
    GONOSUMDB: "",
    GOPRIVATE: "",
    GOPROXY: "https://proxy.golang.org",
    GOSUMDB: "sum.golang.org",
    GOTOOLCHAIN: "local",
    GOVCS: "*:off",
    GOWORK: "off",
    HOME: "/tmp/home",
  };
  const contract = ({
    commandArguments,
    environment = {},
    image,
    memory,
    mounts = [],
    network = "none",
    temporaryStorage = "128m",
    tmpfsExecutable = false,
    user = null,
    workdir = null,
  }) => ({
    cidFile: path.resolve(
      temporaryRoot,
      "container-ids",
      `${id.slice("PROCESS-".length).toLowerCase()}.cid`,
    ),
    commandArguments,
    environment,
    image,
    memory,
    mounts: mounts.map((mount) => ({
      source: path.resolve(temporaryRoot, ...mount.source.split("/")),
      destination: mount.destination,
      readOnly: mount.readOnly,
    })),
    network,
    tmpfs: `/tmp:rw,${tmpfsExecutable ? "exec" : "noexec"},nosuid,size=${temporaryStorage}`,
    user,
    workdir,
  });
  if (id === "PROCESS-OSV-SCANNER-VERSION") {
    return contract({
      commandArguments: ["--version"],
      image: scanners.osvScanner.image,
      memory: "256m",
      user: "65534:65534",
    });
  }
  if (id === "PROCESS-SEMGREP-CE-VERSION") {
    return contract({
      commandArguments: ["semgrep", "--version"],
      environment: semgrepEnvironment,
      image: scanners.semgrep.image,
      memory: "256m",
    });
  }
  if (id === "PROCESS-GO-TOOLCHAIN-VERSION") {
    return contract({
      commandArguments: ["go", "version"],
      image: scanners.goToolchainImage.image,
      memory: "256m",
      user: "65534:65534",
    });
  }
  if (id === "PROCESS-OSV-MISSING-DATABASE-NEGATIVE") {
    return contract({
      commandArguments: [
        ...offlineOsv,
        ...lockfileArguments(productionLockfiles),
      ],
      environment: osvEnvironment,
      image: scanners.osvScanner.image,
      memory: "768m",
      mounts: [
        { source: "scan-input", destination: "/scan", readOnly: true },
        { source: "osv-empty-cache", destination: "/cache", readOnly: true },
      ],
      user: "65534:65534",
    });
  }
  if (
    id === "PROCESS-OSV-VULNERABILITY-CANARY" ||
    id === "PROCESS-OSV-VULNERABILITY-DEVELOPMENT-CANARY" ||
    id === "PROCESS-OSV-GO-ADVISORY-CANARY"
  ) {
    const lockfile =
      id === "PROCESS-OSV-GO-ADVISORY-CANARY"
        ? "/fixture/go.mod"
        : "/fixture/pnpm-lock.yaml";
    return contract({
      commandArguments: [...offlineOsv, "--lockfile", lockfile],
      environment: osvEnvironment,
      image: scanners.osvScanner.image,
      memory: "768m",
      mounts: [
        {
          source: id.slice("PROCESS-".length).toLowerCase(),
          destination: "/fixture",
          readOnly: true,
        },
        { source: "osv-cache", destination: "/cache", readOnly: true },
      ],
      user: "65534:65534",
    });
  }
  if (
    id === "PROCESS-OSV-LICENSE-DENIED-CANARY" ||
    id === "PROCESS-OSV-LICENSE-UNKNOWN-CANARY" ||
    id === "PROCESS-OSV-GO-LICENSE-DENIED-CANARY"
  ) {
    const lockfile =
      id === "PROCESS-OSV-GO-LICENSE-DENIED-CANARY"
        ? "/fixture/go.mod"
        : "/fixture/pnpm-lock.yaml";
    return contract({
      commandArguments: [
        ...osvBase,
        "--config",
        "/fixture/osv-scanner.toml",
        "--data-source",
        "deps.dev",
        `--licenses=${allowedLicenses}`,
        "--lockfile",
        lockfile,
      ],
      environment: { HOME: "/tmp/home" },
      image: scanners.osvScanner.image,
      memory: "768m",
      mounts: [
        {
          source: id.slice("PROCESS-".length).toLowerCase(),
          destination: "/fixture",
          readOnly: true,
        },
      ],
      network: "bridge",
      user: "65534:65534",
    });
  }
  if (id === "PROCESS-OSV-VULNERABILITY") {
    return contract({
      commandArguments: [
        ...offlineOsv,
        ...lockfileArguments(productionLockfiles),
      ],
      environment: osvEnvironment,
      image: scanners.osvScanner.image,
      memory: "1536m",
      mounts: [
        { source: "scan-input", destination: "/scan", readOnly: true },
        { source: "osv-cache", destination: "/cache", readOnly: true },
      ],
      user: "65534:65534",
    });
  }
  if (id === "PROCESS-OSV-LICENSE") {
    return contract({
      commandArguments: [
        ...osvBase,
        "--config",
        "/scan/osv-scanner.toml",
        "--data-source",
        "deps.dev",
        `--licenses=${allowedLicenses}`,
        ...lockfileArguments(productionLockfiles),
      ],
      environment: { HOME: "/tmp/home" },
      image: scanners.osvScanner.image,
      memory: "1536m",
      mounts: [{ source: "scan-input", destination: "/scan", readOnly: true }],
      network: "bridge",
      user: "65534:65534",
    });
  }
  if (id === "PROCESS-SEMGREP-REPOSITORY") {
    return contract({
      commandArguments: [...semgrep, "/src"],
      environment: semgrepEnvironment,
      image: scanners.semgrep.image,
      memory: "1536m",
      mounts: [
        { source: "semgrep-source", destination: "/src", readOnly: true },
        {
          source: "semgrep-rules-stage",
          destination: "/rules",
          readOnly: true,
        },
      ],
    });
  }
  if (id === "PROCESS-SEMGREP-BLOCKING-FIXTURES") {
    return contract({
      commandArguments: [...semgrep, "/fixtures"],
      environment: semgrepEnvironment,
      image: scanners.semgrep.image,
      memory: "768m",
      mounts: [
        { source: "sast-fixtures", destination: "/fixtures", readOnly: true },
        {
          source: "semgrep-rules-stage",
          destination: "/rules",
          readOnly: true,
        },
      ],
    });
  }
  if (id === "PROCESS-OSV-DATABASE-ZIP-VALIDATION") {
    return contract({
      commandArguments: [
        "go",
        "run",
        "./tools/osvdbcheck/cmd/osvdbcheck",
        "--",
        ...scanners.advisoryDatabases.map(
          ({ cachePath }) => `/db/${cachePath}`,
        ),
      ],
      environment: goEnvironment,
      image: scanners.goToolchainImage.image,
      memory: "1536m",
      mounts: [
        { source: "dbcheck-source", destination: "/validator", readOnly: true },
        { source: "osv-cache", destination: "/db", readOnly: true },
        {
          source: "dbcheck-build-cache",
          destination: "/gocache",
          readOnly: false,
        },
        {
          source: "dbcheck-module-cache",
          destination: "/gomodcache",
          readOnly: false,
        },
      ],
      temporaryStorage: "512m",
      tmpfsExecutable: true,
      user: "65534:65534",
      workdir: "/validator",
    });
  }
  const goProcess = /^PROCESS-GO-(MOD-EDIT|LIST)-(.+)$/u.exec(id);
  if (goProcess) {
    const module = evidence.inputs.go.find(
      ({ manifest }) =>
        manifest.replaceAll(/[^A-Za-z0-9._-]/gu, "-").toUpperCase() ===
        goProcess[2],
    );
    if (!module) {
      throw new ContractError(`PASS evidence process ${id} has no Go input`);
    }
    const moduleIndex = evidence.inputs.go.indexOf(module) + 1;
    return contract({
      commandArguments:
        goProcess[1] === "MOD-EDIT"
          ? ["go", "mod", "edit", "-json"]
          : ["go", "list", "-mod=readonly", "-m", "-json", "all"],
      environment: goEnvironment,
      image: scanners.goToolchainImage.image,
      memory: "768m",
      mounts: [
        {
          source: `scan-input/go-module-${moduleIndex}`,
          destination: "/module",
          readOnly: true,
        },
        {
          source: "go-module-cache",
          destination: "/gomodcache",
          readOnly: false,
        },
        { source: "go-build-cache", destination: "/gocache", readOnly: false },
      ],
      network: goProcess[1] === "LIST" ? "bridge" : "none",
      user: "65534:65534",
      workdir: "/module",
    });
  }
  throw new ContractError(
    `PASS evidence process ${id} has no Docker run contract`,
  );
}

function validatePassInputs(inputs, trusted, githubActions) {
  validateControlPlaneEvidence(inputs.controlPlane, trusted);
  requireRecord(inputs.configuration, "evidence.inputs.configuration");
  const configurationPaths = {
    policy: "security/supply-chain-policy.json",
    scanners: "security/scanners.lock.json",
    osvConfig: "security/osv-scanner.toml",
    evidenceSchema: "security/r016-evidence.schema.json",
  };
  assertExactObjectKeys(
    inputs.configuration,
    Object.keys(configurationPaths),
    "PASS evidence configuration inputs",
  );
  for (const [name, expectedPath] of Object.entries(configurationPaths)) {
    const identity = inputs.configuration[name];
    requireRecord(identity, `evidence.inputs.configuration.${name}`);
    if (identity.path !== expectedPath) {
      throw new ContractError(
        `evidence.inputs.configuration.${name}.path is invalid`,
      );
    }
    validateSha256(
      identity.sha256,
      `evidence.inputs.configuration.${name}.sha256`,
    );
    requireNonnegativeSafeInteger(
      identity.size,
      `evidence.inputs.configuration.${name}.size`,
    );
    if (identity.size === 0) {
      throw new ContractError(
        `evidence.inputs.configuration.${name}.size must be positive`,
      );
    }
  }
  if (
    canonicalJson(inputs.configuration) !==
    canonicalJson(trusted.configurationInputs)
  ) {
    throw new ContractError(
      "PASS evidence configuration input identities differ from trusted bytes",
    );
  }
  validateRepositoryUseContext(
    inputs.repositoryUse,
    trusted.configuration.scanners.semgrepRules.useBoundary,
    githubActions,
  );
  if (
    trusted.repositoryUseSeal !== undefined &&
    canonicalJson(inputs.repositoryUse) !==
      canonicalJson(trusted.repositoryUseSeal)
  ) {
    throw new ContractError(
      "PASS evidence repository use context differs from the opening seal",
    );
  }
  requireRecord(inputs.pnpm, "evidence.inputs.pnpm");
  if (!Array.isArray(inputs.go) || inputs.go.length === 0) {
    throw new ContractError("evidence.inputs.go must be a nonempty array");
  }
  requireRecord(inputs.semgrepSources, "evidence.inputs.semgrepSources");
  requireRecord(inputs.semgrepRules, "evidence.inputs.semgrepRules");
  for (const [value, label] of [
    [inputs.pnpm.documents, "evidence.inputs.pnpm.documents"],
    [inputs.semgrepSources.files, "evidence.inputs.semgrepSources.files"],
    [inputs.semgrepRules.files, "evidence.inputs.semgrepRules.files"],
  ]) {
    if (!Array.isArray(value) || value.length === 0) {
      throw new ContractError(`${label} must be a nonempty array`);
    }
  }
  validatePnpmInputEvidence(inputs.pnpm, trusted.configuration.policy);
  validateGoInputEvidence(inputs.go);
  validateSemgrepSourceEvidence(
    inputs.semgrepSources,
    trusted.configuration.policy.sast.requiredLanguageGroups,
  );
  validateSemgrepRuleEvidence(
    inputs.semgrepRules,
    trusted.configuration.scanners.semgrepRules,
  );
}

function isProtectedControlPath(repositoryPath) {
  return (
    CONTROL_PROTECTED_EXACT_PATHS.has(repositoryPath) ||
    CONTROL_PROTECTED_PREFIXES.some((prefix) =>
      repositoryPath.startsWith(prefix),
    )
  );
}

function validateControlPlaneEvidence(controlPlane, trusted) {
  requireRecord(controlPlane, "evidence.inputs.controlPlane");
  if (!Array.isArray(controlPlane.files) || controlPlane.files.length === 0) {
    throw new ContractError(
      "PASS evidence control-plane input inventory is empty",
    );
  }
  const controlProtectedEntries = [...trusted.controlTrackedIndex.values()]
    .filter(({ path: repositoryPath }) =>
      isProtectedControlPath(repositoryPath),
    )
    .map(({ mode, objectId, path: repositoryPath, stage }) => ({
      mode,
      objectId,
      path: repositoryPath,
      stage,
    }))
    .sort((left, right) => left.path.localeCompare(right.path, "en"));
  const targetProtectedEntries = [...trusted.trackedIndex.values()]
    .filter(({ path: repositoryPath }) =>
      isProtectedControlPath(repositoryPath),
    )
    .map(({ mode, objectId, path: repositoryPath, stage }) => ({
      mode,
      objectId,
      path: repositoryPath,
      stage,
    }))
    .sort((left, right) => left.path.localeCompare(right.path, "en"));
  if (
    controlProtectedEntries.length === 0 ||
    (controlPlane.mode === "split-root" &&
      canonicalJson(controlProtectedEntries) !==
        canonicalJson(targetProtectedEntries)) ||
    controlPlane.protectedParitySha256 !==
      sha256Hex(canonicalJson(controlProtectedEntries))
  ) {
    throw new ContractError(
      "PASS evidence control-plane protected parity is invalid",
    );
  }
  const expectedPaths = [
    ...new Set([
      ...controlProtectedEntries.map(
        ({ path: repositoryPath }) => repositoryPath,
      ),
      ...CONTROL_ONLY_INPUT_PATHS,
    ]),
  ].sort((left, right) => left.localeCompare(right, "en"));
  const actualPaths = controlPlane.files.map(
    ({ path: repositoryPath }) => repositoryPath,
  );
  if (
    canonicalJson(actualPaths) !== canonicalJson(expectedPaths) ||
    canonicalJson(
      [...trusted.controlTrackedBlobCache.keys()].sort((left, right) =>
        left.localeCompare(right, "en"),
      ),
    ) !== canonicalJson(expectedPaths)
  ) {
    throw new ContractError(
      "PASS evidence control-plane file inventory is incomplete or excessive",
    );
  }
  for (const [index, file] of controlPlane.files.entries()) {
    requireRecord(file, `evidence control-plane file ${index}`);
    const entry = trusted.controlTrackedIndex.get(file.path);
    const cached = trusted.controlTrackedBlobCache.get(file.path);
    if (
      !entry ||
      (entry.mode !== "100644" && entry.mode !== "100755") ||
      entry.stage !== 0 ||
      !cached ||
      !(cached.bytes instanceof Uint8Array) ||
      cached.objectId !== entry.objectId ||
      file.gitObjectId !== entry.objectId ||
      file.sha256 !== sha256Hex(cached.bytes) ||
      file.size !== cached.bytes.byteLength
    ) {
      throw new ContractError(
        `PASS evidence control-plane file ${file.path} differs from trusted Git bytes`,
      );
    }
    assertGitBlobObjectId(
      cached.bytes,
      entry.objectId,
      `control-plane input ${file.path}`,
    );
  }
  if (
    controlPlane.inventorySha256 !==
    sha256Hex(canonicalJson(controlPlane.files))
  ) {
    throw new ContractError(
      "PASS evidence control-plane file inventory hash is inconsistent",
    );
  }
}

function validatePnpmInputEvidence(pnpm, policy) {
  assertExactObjectKeys(
    pnpm,
    [
      "source",
      "documentCount",
      "packageCount",
      "directDependencyCount",
      "scopeCounts",
      "documents",
    ],
    "PASS evidence pnpm input",
  );
  requireRecord(pnpm.source, "evidence.inputs.pnpm.source");
  if (pnpm.source.path !== "pnpm-lock.yaml") {
    throw new ContractError("evidence.inputs.pnpm.source.path is invalid");
  }
  validateSha256(pnpm.source.sha256, "evidence.inputs.pnpm.source.sha256");
  requireNonnegativeSafeInteger(
    pnpm.source.size,
    "evidence.inputs.pnpm.source.size",
  );
  if (pnpm.source.size === 0) {
    throw new ContractError(
      "evidence.inputs.pnpm.source.size must be positive",
    );
  }
  if (
    pnpm.documentCount !== policy.pnpm.expectedDocumentCount ||
    pnpm.documents.length !== pnpm.documentCount
  ) {
    throw new ContractError(
      "evidence.inputs.pnpm document inventory differs from policy",
    );
  }
  let packageCount = 0;
  for (const [index, document] of pnpm.documents.entries()) {
    requireRecord(document, `evidence.inputs.pnpm.documents[${index}]`);
    const number = index + 1;
    if (
      document.documentNumber !== number ||
      document.source !== `/scan/pnpm-document-${number}/pnpm-lock.yaml`
    ) {
      throw new ContractError(
        `evidence.inputs.pnpm.documents[${index}] identity is invalid`,
      );
    }
    requireNonnegativeSafeInteger(
      document.packageCount,
      `evidence.inputs.pnpm.documents[${index}].packageCount`,
    );
    validateSha256(
      document.sha256,
      `evidence.inputs.pnpm.documents[${index}].sha256`,
    );
    packageCount += document.packageCount;
  }
  if (pnpm.packageCount !== packageCount) {
    throw new ContractError(
      "evidence.inputs.pnpm.packageCount is inconsistent",
    );
  }
  assertExactObjectKeys(
    pnpm.scopeCounts,
    [...policy.pnpm.requiredDirectScopes, "unknown"],
    "PASS evidence pnpm scope counts",
  );
  let directDependencyCount = 0;
  for (const [scope, count] of Object.entries(pnpm.scopeCounts)) {
    requireNonnegativeSafeInteger(
      count,
      `evidence.inputs.pnpm.scopeCounts.${scope}`,
    );
    directDependencyCount += count;
  }
  if (
    pnpm.scopeCounts.unknown !== 0 ||
    pnpm.directDependencyCount !== directDependencyCount
  ) {
    throw new ContractError(
      "evidence.inputs.pnpm direct dependency scope counts are inconsistent",
    );
  }
}

function validateGoInputEvidence(modules) {
  const manifests = new Set();
  for (const [index, module] of modules.entries()) {
    requireRecord(module, `evidence.inputs.go[${index}]`);
    assertExactObjectKeys(
      module,
      [
        "manifest",
        "source",
        "mainModule",
        "discoveredModuleCount",
        "thirdPartyModuleCount",
        "goModSha256",
        "goSumSha256",
        "editIdentity",
        "inventorySha256",
      ],
      `PASS evidence Go input ${index}`,
    );
    validateRepositoryPath(module.manifest, `evidence Go manifest ${index}`);
    if (
      POSIX.basename(module.manifest) !== "go.mod" ||
      manifests.has(module.manifest) ||
      module.source !== `/scan/go-module-${index + 1}/go.mod`
    ) {
      throw new ContractError(`evidence Go input ${index} identity is invalid`);
    }
    manifests.add(module.manifest);
    requireNonemptyString(
      module.mainModule,
      `evidence Go input ${index} module`,
    );
    requireNonnegativeSafeInteger(
      module.discoveredModuleCount,
      `evidence Go input ${index} discoveredModuleCount`,
    );
    requireNonnegativeSafeInteger(
      module.thirdPartyModuleCount,
      `evidence Go input ${index} thirdPartyModuleCount`,
    );
    if (module.discoveredModuleCount !== module.thirdPartyModuleCount + 1) {
      throw new ContractError(
        `evidence Go input ${index} module counts are inconsistent`,
      );
    }
    validateSha256(module.goModSha256, `evidence Go input ${index} go.mod`);
    if (module.goSumSha256 !== null) {
      validateSha256(module.goSumSha256, `evidence Go input ${index} go.sum`);
    }
    validateSha256(
      module.inventorySha256,
      `evidence Go input ${index} inventory`,
    );
    requireRecord(
      module.editIdentity,
      `evidence Go input ${index} edit identity`,
    );
    if (
      module.editIdentity.modulePath !== module.mainModule ||
      module.editIdentity.replaceCount !== 0
    ) {
      throw new ContractError(
        `evidence Go input ${index} edit identity is inconsistent`,
      );
    }
  }
}

function validateEvidenceTool(tool, name, configuration) {
  requireRecord(tool, `evidence.tools.${name}`);
  requireNonemptyString(tool.image, `evidence.tools.${name}.image`);
  for (const digestName of ["indexDigest", "linuxAmd64Digest"]) {
    if (!/^sha256:[0-9a-f]{64}$/u.test(tool[digestName])) {
      throw new ContractError(
        `evidence.tools.${name}.${digestName} is invalid`,
      );
    }
  }
  if (!tool.image.endsWith(`@${tool.indexDigest}`)) {
    throw new ContractError(
      `evidence.tools.${name}.image is not digest pinned`,
    );
  }
  requireNonemptyString(
    tool.runtimeVersion,
    `evidence.tools.${name}.runtimeVersion`,
  );
  requireNonemptyString(tool.runtimeUser, `evidence.tools.${name}.runtimeUser`);
  const runtimeUser = tool.runtimeUser.trim().toLowerCase().split(":", 1)[0];
  if (runtimeUser === "0" || runtimeUser === "root") {
    throw new ContractError(
      `evidence.tools.${name}.runtimeUser must be explicitly non-root`,
    );
  }
  if (name === "semgrep-ce") {
    requireNonemptyString(
      tool.sourceRepository,
      "evidence.tools.semgrep-ce.sourceRepository",
    );
    requireNonemptyString(
      tool.sourceRevision,
      "evidence.tools.semgrep-ce.sourceRevision",
    );
  }
  const lock = evidenceToolLock(configuration.scanners, name);
  for (const field of [
    "image",
    "indexDigest",
    "linuxAmd64Digest",
    "runtimeVersion",
  ]) {
    const expectedField = field === "runtimeVersion" ? "version" : field;
    if (tool[field] !== lock[expectedField]) {
      throw new ContractError(
        `evidence.tools.${name}.${field} differs from the scanner lock`,
      );
    }
  }
  if (
    name === "semgrep-ce" &&
    (tool.sourceRepository !== lock.imageSourceRepository ||
      tool.sourceRevision !== lock.imageSourceRevision)
  ) {
    throw new ContractError(
      "evidence.tools.semgrep-ce source labels differ from the scanner lock",
    );
  }
}

function validateToolExecutionEvidence(tool, name, evidence, seal) {
  requireRecord(seal, `trusted tool execution seal ${name}`);
  if (!Array.isArray(seal.inspection) || seal.inspection.length !== 1) {
    throw new ContractError(`trusted ${name} image inspection is invalid`);
  }
  validateTrustedImageIndex(seal.indexDocument, tool, name);
  const image = seal.inspection[0];
  const expectedRuntimeUser =
    name === "semgrep-ce" ? image?.Config?.User : "65534:65534";
  const expectedSourceRepository =
    image?.Config?.Labels?.["org.opencontainers.image.source"] ?? null;
  const expectedSourceRevision =
    image?.Config?.Labels?.["org.opencontainers.image.revision"] ?? null;
  if (
    image?.Architecture !== "amd64" ||
    image?.Os !== "linux" ||
    !Array.isArray(image.RepoDigests) ||
    !image.RepoDigests.some((digest) =>
      digest.endsWith(`@${tool.indexDigest}`),
    ) ||
    tool.inspectionSha256 !== sha256Hex(canonicalJson(seal.inspection)) ||
    tool.indexDocumentSha256 !== sha256Hex(canonicalJson(seal.indexDocument)) ||
    tool.runtimeUser !== expectedRuntimeUser ||
    tool.sourceRepository !== expectedSourceRepository ||
    tool.sourceRevision !== expectedSourceRevision
  ) {
    throw new ContractError(
      `PASS evidence tool ${name} differs from its trusted execution`,
    );
  }
  const processPrefix = `PROCESS-${name.toUpperCase()}`;
  for (const [suffix, stream, shaField, sizeField] of [
    ["INSPECT", "stdout", "inspectionStdoutSha256", "inspectionStdoutSize"],
    ["INDEX", "stdout", "indexStdoutSha256", "indexStdoutSize"],
    ["VERSION", "stdout", "versionStdoutSha256", "versionStdoutSize"],
    ["VERSION", "stderr", "versionStderrSha256", "versionStderrSize"],
  ]) {
    const artifact = evidence.rawArtifacts.find(
      (candidate) =>
        candidate.processId === `${processPrefix}-${suffix}` &&
        candidate.stream === stream,
    );
    if (
      !artifact ||
      artifact.redacted !== false ||
      artifact.rawSha256 !== seal[shaField] ||
      artifact.rawSize !== seal[sizeField]
    ) {
      throw new ContractError(
        `PASS evidence tool ${name} ${suffix.toLowerCase()} ${stream} differs from trusted execution`,
      );
    }
  }
}

function validateTrustedImageIndex(document, tool, name) {
  const label = `trusted ${name} image index`;
  requireRecord(document, label);
  if (document.schemaVersion !== 2) {
    throw new ContractError(`${label} schemaVersion must be exactly 2`);
  }
  const childMediaType = IMAGE_INDEX_MEDIA_TYPES[document.mediaType];
  if (!childMediaType) {
    throw new ContractError(`${label} mediaType is invalid`);
  }
  if (!Array.isArray(document.manifests)) {
    throw new ContractError(`${label} manifests must be an array`);
  }

  const concretePlatforms = new Set();
  const linuxAmd64 = [];
  for (const [index, descriptor] of document.manifests.entries()) {
    const descriptorLabel = `${label} descriptor ${index}`;
    requireRecord(descriptor, descriptorLabel);
    if (descriptor.mediaType !== childMediaType) {
      throw new ContractError(
        `${descriptorLabel} mediaType is not a direct compatible image manifest`,
      );
    }
    if (!/^sha256:[0-9a-f]{64}$/u.test(descriptor.digest)) {
      throw new ContractError(`${descriptorLabel} digest is invalid`);
    }
    if (!Number.isSafeInteger(descriptor.size) || descriptor.size <= 0) {
      throw new ContractError(`${descriptorLabel} size is invalid`);
    }
    requireRecord(descriptor.platform, `${descriptorLabel} platform`);
    const architecture = requireNonemptyString(
      descriptor.platform.architecture,
      `${descriptorLabel} platform architecture`,
    );
    const os = requireNonemptyString(
      descriptor.platform.os,
      `${descriptorLabel} platform OS`,
    );
    const variant = descriptor.platform.variant;
    if (variant !== undefined) {
      requireNonemptyString(variant, `${descriptorLabel} platform variant`);
    }

    const isUnknownAttestation =
      os === "unknown" && architecture === "unknown" && variant === undefined;
    if (!isUnknownAttestation) {
      const platformKey = canonicalJson([os, architecture, variant ?? null]);
      if (concretePlatforms.has(platformKey)) {
        throw new ContractError(
          `${label} contains a duplicate concrete platform`,
        );
      }
      concretePlatforms.add(platformKey);
    }
    if (os === "linux" && architecture === "amd64") {
      linuxAmd64.push(descriptor);
    }
  }

  if (
    linuxAmd64.length !== 1 ||
    linuxAmd64[0].digest !== tool.linuxAmd64Digest
  ) {
    throw new ContractError(
      `${label} linux/amd64 manifest differs from the scanner lock`,
    );
  }
}

function validateEvidenceDatabases(databases, configuration) {
  if (!Array.isArray(databases) || databases.length !== 2) {
    throw new ContractError("PASS evidence must contain exactly two databases");
  }
  const expected = Object.fromEntries(
    configuration.scanners.advisoryDatabases.map((database) => [
      database.ecosystem,
      { file: database.cachePath, url: database.url },
    ]),
  );
  const seen = new Set();
  for (const [index, database] of databases.entries()) {
    requireRecord(database, `evidence.advisoryDatabases[${index}]`);
    const orderedLock = configuration.scanners.advisoryDatabases[index];
    if (database.ecosystem !== orderedLock?.ecosystem) {
      throw new ContractError(
        "PASS evidence database order differs from the scanner lock",
      );
    }
    const locked = expected[database.ecosystem];
    if (!locked || seen.has(database.ecosystem)) {
      throw new ContractError("PASS evidence database ecosystems are invalid");
    }
    seen.add(database.ecosystem);
    if (database.url !== locked.url) {
      throw new ContractError(
        `evidence database ${database.ecosystem} URL is invalid`,
      );
    }
    requireRecord(
      database.headers,
      `evidence database ${database.ecosystem} headers`,
    );
    if (Object.keys(database.headers).length === 0) {
      throw new ContractError(
        `evidence database ${database.ecosystem} headers are empty`,
      );
    }
    const identity = database.identity;
    requireRecord(identity, `evidence database ${database.ecosystem} identity`);
    if (
      identity.ecosystem !== database.ecosystem ||
      identity.file !== locked.file ||
      !Number.isSafeInteger(identity.contentLength) ||
      identity.contentLength <= 0 ||
      typeof identity.etag !== "string" ||
      identity.etag === "" ||
      typeof identity.generation !== "string" ||
      identity.generation === "" ||
      !/^[0-9a-f]{32}$/u.test(identity.md5) ||
      !/^[0-9a-f]{64}$/u.test(identity.sha256)
    ) {
      throw new ContractError(
        `evidence database ${database.ecosystem} identity is invalid`,
      );
    }
    const lastModified = new Date(identity.lastModified);
    if (
      !Number.isFinite(lastModified.getTime()) ||
      lastModified.toISOString() !== identity.lastModified
    ) {
      throw new ContractError(
        `evidence database ${database.ecosystem} lastModified is invalid`,
      );
    }
    validateSha256(
      database.identitySha256,
      `evidence database ${database.ecosystem} identitySha256`,
    );
    if (database.identitySha256 !== sha256Hex(canonicalJson(identity))) {
      throw new ContractError(
        `evidence database ${database.ecosystem} identity hash is inconsistent`,
      );
    }
  }
  if (seen.size !== 2) {
    throw new ContractError("PASS evidence database ecosystems are incomplete");
  }
}

function validateDatabaseArchiveEvidence(report, evidence, configuration) {
  requireRecord(report, "evidence.databaseArchiveValidation");
  if (
    report.schema_version !== 1 ||
    !Array.isArray(report.archives) ||
    report.archives.length !== evidence.advisoryDatabases.length ||
    report.archives.length !==
      configuration.scanners.advisoryDatabases.length ||
    canonicalJson(report.limits) !== canonicalJson(DATABASE_VALIDATION_LIMITS)
  ) {
    throw new ContractError("evidence database archive report is incomplete");
  }
  for (const [index, archive] of report.archives.entries()) {
    requireRecord(archive, `evidence database archive ${index}`);
    if (
      archive.argument_index !== index ||
      !Number.isSafeInteger(archive.entry_count) ||
      archive.entry_count <= 0 ||
      archive.entry_count > report.limits.max_entries ||
      !Number.isSafeInteger(archive.uncompressed_bytes) ||
      archive.uncompressed_bytes <= 0 ||
      archive.uncompressed_bytes > report.limits.max_archive_uncompressed_bytes
    ) {
      throw new ContractError(`evidence database archive ${index} is invalid`);
    }
    validateSha256(
      archive.manifest_sha256,
      `evidence database archive ${index} manifest`,
    );
  }
  requireRecord(report.validatorSources, "evidence database validator sources");
  if (
    !Array.isArray(report.validatorSources.files) ||
    report.validatorSources.files.length === 0
  ) {
    throw new ContractError(
      "evidence database validator source inventory is empty",
    );
  }
  const sourcePaths = new Set();
  for (const [index, source] of report.validatorSources.files.entries()) {
    requireRecord(source, `evidence database validator source ${index}`);
    validateRepositoryPath(
      source.path,
      `evidence database validator source ${index} path`,
    );
    if (
      sourcePaths.has(source.path) ||
      !HEX_OBJECT_ID.test(source.gitObjectId)
    ) {
      throw new ContractError(
        "evidence database validator sources are invalid",
      );
    }
    sourcePaths.add(source.path);
    validateSha256(
      source.sha256,
      `evidence database validator source ${index} SHA-256`,
    );
    requireNonnegativeSafeInteger(
      source.size,
      `evidence database validator source ${index} size`,
    );
  }
  if (
    !sourcePaths.has("go.mod") ||
    !sourcePaths.has("tools/osvdbcheck/cmd/osvdbcheck/main.go")
  ) {
    throw new ContractError(
      "evidence database validator sources are incomplete",
    );
  }
  validateSha256(
    report.validatorSources.inventorySha256,
    "evidence database validator source inventory SHA-256",
  );
  if (
    report.validatorSources.inventorySha256 !==
    sha256Hex(canonicalJson(report.validatorSources.files))
  ) {
    throw new ContractError(
      "evidence database validator source inventory hash is inconsistent",
    );
  }
  const process = evidence.checks.find(
    ({ id }) => id === "PROCESS-OSV-DATABASE-ZIP-VALIDATION",
  );
  const terminal = evidence.checks.find(({ id }) => id === "R016-DB-ZIP");
  const stdout = evidence.rawArtifacts.find(
    (artifact) =>
      artifact.processId === process?.id && artifact.stream === "stdout",
  );
  const stderr = evidence.rawArtifacts.find(
    (artifact) =>
      artifact.processId === process?.id && artifact.stream === "stderr",
  );
  const rawReport = {
    schema_version: report.schema_version,
    limits: {
      max_entries: report.limits.max_entries,
      max_entry_path_bytes: report.limits.max_entry_path_bytes,
      max_entry_uncompressed_bytes: report.limits.max_entry_uncompressed_bytes,
      max_archive_uncompressed_bytes:
        report.limits.max_archive_uncompressed_bytes,
    },
    archives: report.archives.map((archive) => ({
      argument_index: archive.argument_index,
      entry_count: archive.entry_count,
      uncompressed_bytes: archive.uncompressed_bytes,
      manifest_sha256: archive.manifest_sha256,
    })),
  };
  const encoded = `${JSON.stringify(rawReport)}\n`;
  if (
    process?.rawExit !== 0 ||
    terminal?.rawExit !== 0 ||
    terminal.archiveCount !== report.archives.length ||
    !stdout ||
    stdout.redacted !== false ||
    stdout.sha256 !== sha256Hex(encoded) ||
    stdout.size !== Buffer.byteLength(encoded) ||
    !stderr ||
    stderr.redacted !== false ||
    stderr.sha256 !== EMPTY_SHA256 ||
    stderr.size !== 0
  ) {
    throw new ContractError(
      "evidence database archive report does not match exact process output",
    );
  }
}

function validateDatabaseSealEvidence(seal, evidence) {
  requireRecord(seal, "evidence.databaseSeal");
  if (seal.path !== "db-seal.json") {
    throw new ContractError("evidence.databaseSeal.path is invalid");
  }
  validateSha256(seal.sha256, "evidence.databaseSeal.sha256");
  const expectedSeal = {
    schemaVersion: 1,
    gateId: "R-016",
    runId: evidence.runId,
    source: evidence.source,
    controlSource: evidence.controlSource,
    databases: evidence.advisoryDatabases,
  };
  if (seal.sha256 !== sha256Hex(`${canonicalJson(expectedSeal)}\n`)) {
    throw new ContractError(
      "evidence.databaseSeal.sha256 does not bind exact database identities",
    );
  }
}

function validatePassValidationContext(context) {
  requireRecord(context, "PASS evidence validation context");
  for (const [name, label] of [
    ["root", "repository root"],
    ["controlRoot", "control repository root"],
    ["temporaryRoot", "temporary root"],
  ]) {
    if (typeof context[name] !== "string" || !path.isAbsolute(context[name])) {
      throw new ContractError(
        `PASS evidence validation requires trusted ${label}`,
      );
    }
  }
  assertExactObjectKeys(
    context.toolExecutionSeals,
    PASS_TOOL_NAMES,
    "PASS evidence trusted tool execution seals",
  );
  assertExactObjectKeys(
    context.verdictExecutionSeals,
    ["license", "vulnerability"],
    "PASS evidence trusted verdict execution seals",
  );
  requireRecord(
    context.verdictExecutionSeals.vulnerability,
    "PASS evidence trusted vulnerability verdict",
  );
  requireRecord(
    context.verdictExecutionSeals.license,
    "PASS evidence trusted license verdict",
  );
  if (!Array.isArray(context.databaseIdentitySeal)) {
    throw new ContractError(
      "PASS evidence validation requires trusted database identity seal",
    );
  }
  requireRecord(
    context.configuration,
    "PASS evidence validation configuration",
  );
  requireRecord(
    context.configuration.policy,
    "PASS evidence validation policy",
  );
  requireRecord(
    context.configuration.scanners,
    "PASS evidence validation scanner lock",
  );
  requireRecord(
    context.configurationInputs,
    "PASS evidence trusted configuration inputs",
  );
  if (!(context.rawArtifactSeals instanceof Map)) {
    throw new ContractError(
      "PASS evidence validation requires trusted raw artifact seals",
    );
  }
  for (const [name, label] of [
    ["trackedIndex", "tracked Git index"],
    ["trackedBlobCache", "tracked Git blob cache"],
    ["controlTrackedIndex", "control tracked Git index"],
    ["controlTrackedBlobCache", "control tracked Git blob cache"],
  ]) {
    if (!(context[name] instanceof Map)) {
      throw new ContractError(
        `PASS evidence validation requires trusted ${label}`,
      );
    }
  }
  for (const [name, label] of [
    ["sourceSeal", "source"],
    ["controlSourceSeal", "control source"],
    ["controlInputsSeal", "control input inventory"],
    ["environmentSeal", "execution environment"],
    ["dockerEnvironmentSeal", "Docker environment"],
    ["inputsSeal", "input inventory"],
    ["toolsSeal", "tool inventory"],
    ["databaseArchiveSeal", "database archive validation"],
    ["toolExecutionSeals", "tool execution"],
  ]) {
    requireRecord(
      context[name],
      `PASS evidence validation requires trusted ${label} seal`,
    );
  }
  if (!(context.processSeals instanceof Map)) {
    throw new ContractError(
      "PASS evidence validation requires trusted process seals",
    );
  }
  if (!(context.terminalSeals instanceof Map)) {
    throw new ContractError(
      "PASS evidence validation requires trusted terminal check seals",
    );
  }
  return context;
}

function validateTrustedEvidenceSeals(evidence, processChecks, trusted) {
  if (path.resolve(evidence.source.topLevel) !== path.resolve(trusted.root)) {
    throw new ContractError(
      "PASS evidence source top-level differs from the trusted repository root",
    );
  }
  if (
    path.resolve(evidence.controlSource.topLevel) !==
    path.resolve(trusted.controlRoot)
  ) {
    throw new ContractError(
      "PASS evidence control source top-level differs from the trusted control repository root",
    );
  }
  const sameRoot =
    path.resolve(trusted.root) === path.resolve(trusted.controlRoot);
  if (
    (sameRoot && evidence.inputs.controlPlane.mode !== "same-root") ||
    (!sameRoot && evidence.inputs.controlPlane.mode !== "split-root")
  ) {
    throw new ContractError(
      "PASS evidence control-plane mode differs from trusted repository roots",
    );
  }
  if (
    canonicalJson(evidence.advisoryDatabases) !==
    canonicalJson(trusted.databaseIdentitySeal)
  ) {
    throw new ContractError(
      "PASS evidence advisory databases differ from their trusted identity seal",
    );
  }
  for (const [actual, expected, label] of [
    [evidence.source, trusted.sourceSeal, "source"],
    [evidence.controlSource, trusted.controlSourceSeal, "control source"],
    [
      evidence.inputs.controlPlane,
      trusted.controlInputsSeal,
      "control input inventory",
    ],
    [evidence.environment, trusted.environmentSeal, "execution environment"],
    [evidence.inputs, trusted.inputsSeal, "input inventory"],
    [evidence.tools, trusted.toolsSeal, "tool inventory"],
    [
      evidence.databaseArchiveValidation,
      trusted.databaseArchiveSeal,
      "database archive validation",
    ],
  ]) {
    if (canonicalJson(actual) !== canonicalJson(expected)) {
      throw new ContractError(
        `PASS evidence ${label} differs from its trusted seal`,
      );
    }
  }
  if (
    evidence.environment.runtime?.node !==
    `v${trusted.configuration.policy.runtime.nodeVersion}`
  ) {
    throw new ContractError(
      "PASS evidence Node runtime differs from the locked policy",
    );
  }
  if (trusted.processSeals.size !== processChecks.length) {
    throw new ContractError(
      "PASS evidence process inventory differs from trusted process seals",
    );
  }
  for (const check of processChecks) {
    const sealed = trusted.processSeals.get(check.id);
    if (!sealed || canonicalJson(check) !== canonicalJson(sealed)) {
      throw new ContractError(
        `PASS evidence process ${check.id} differs from its trusted process seal`,
      );
    }
    const executableName = path.basename(check.command).toLowerCase();
    const trustedName = /^git(?:\.exe)?$/u.test(executableName)
      ? "git"
      : /^docker(?:\.exe)?$/u.test(executableName)
        ? "docker"
        : null;
    if (
      trustedName === null ||
      check.command !== evidence.environment.executables[trustedName].path
    ) {
      throw new ContractError(
        `PASS evidence process ${check.id} executable differs from the trusted executable identity`,
      );
    }
  }
  const terminalChecks = evidence.checks.filter(({ id }) =>
    id.startsWith("R016-"),
  );
  if (trusted.terminalSeals.size !== terminalChecks.length) {
    throw new ContractError(
      "PASS evidence terminal inventory differs from trusted terminal seals",
    );
  }
  for (const check of terminalChecks) {
    const sealed = trusted.terminalSeals.get(check.id);
    if (!sealed || canonicalJson(check) !== canonicalJson(sealed)) {
      throw new ContractError(
        `PASS evidence terminal ${check.id} differs from its trusted terminal seal`,
      );
    }
  }
}

function validateRawArtifactSeals(artifacts, trustedSeals) {
  if (trustedSeals.size !== artifacts.length) {
    throw new ContractError(
      "PASS evidence raw artifact inventory differs from trusted seals",
    );
  }
  for (const artifact of artifacts) {
    const trusted = trustedSeals.get(artifact.path);
    if (!trusted || canonicalJson(trusted) !== canonicalJson(artifact)) {
      throw new ContractError(
        `PASS evidence raw artifact ${artifact.path} differs from its trusted seal`,
      );
    }
  }
}

function evidenceToolLock(scanners, name) {
  const lock =
    name === "osv-scanner"
      ? scanners.osvScanner
      : name === "semgrep-ce"
        ? scanners.semgrep
        : name === "go-toolchain"
          ? scanners.goToolchainImage
          : null;
  requireRecord(lock, `scanner lock for ${name}`);
  return lock;
}

function validateSemgrepSourceEvidence(sources, requiredLanguageGroups) {
  requireRecord(sources, "evidence.inputs.semgrepSources");
  if (
    !Number.isSafeInteger(sources.fileCount) ||
    sources.fileCount !== sources.files.length
  ) {
    throw new ContractError(
      "evidence.inputs.semgrepSources.fileCount is inconsistent",
    );
  }
  requireRecord(
    sources.groupCounts,
    "evidence.inputs.semgrepSources.groupCounts",
  );
  assertExactObjectKeys(
    sources.groupCounts,
    Object.keys(requiredLanguageGroups),
    "PASS evidence Semgrep language groups",
  );
  const paths = new Set();
  const groupCounts = Object.create(null);
  for (const [index, file] of sources.files.entries()) {
    requireRecord(file, `evidence Semgrep source ${index}`);
    validateRepositoryPath(file.path, `evidence Semgrep source ${index} path`);
    if (paths.has(file.path) || !HEX_OBJECT_ID.test(file.gitObjectId)) {
      throw new ContractError("evidence Semgrep source inventory is invalid");
    }
    paths.add(file.path);
    requireNonemptyString(
      file.languageGroup,
      `evidence Semgrep source ${index} languageGroup`,
    );
    validateSha256(file.sha256, `evidence Semgrep source ${index} SHA-256`);
    requireNonnegativeSafeInteger(
      file.size,
      `evidence Semgrep source ${index} size`,
    );
    groupCounts[file.languageGroup] =
      (groupCounts[file.languageGroup] ?? 0) + 1;
  }
  if (
    canonicalJson(groupCounts) !== canonicalJson(sources.groupCounts) ||
    sources.inventorySha256 !== sha256Hex(canonicalJson(sources.files))
  ) {
    throw new ContractError(
      "evidence Semgrep source inventory hash/counts are inconsistent",
    );
  }
  for (const [group, count] of Object.entries(sources.groupCounts)) {
    if (!Number.isSafeInteger(count) || count <= 0) {
      throw new ContractError(
        `evidence Semgrep source inventory has no ${group} coverage`,
      );
    }
  }
}

function validateSemgrepRuleEvidence(rules, lock) {
  requireRecord(rules, "evidence.inputs.semgrepRules");
  requireRecord(lock, "scanner lock Semgrep rules");
  if (
    rules.repository !== lock.repository ||
    rules.commit !== lock.commit ||
    rules.tree !== lock.tree ||
    canonicalJson(rules.license) !== canonicalJson(lock.license)
  ) {
    throw new ContractError(
      "evidence Semgrep rule identity differs from the scanner lock",
    );
  }
  const expected = new Map(
    [...lock.files, lock.license].map((file) => [file.path, file.sha256]),
  );
  if (rules.files.length !== expected.size) {
    throw new ContractError("evidence Semgrep rule inventory is incomplete");
  }
  const seen = new Set();
  for (const [index, file] of rules.files.entries()) {
    requireRecord(file, `evidence Semgrep rule ${index}`);
    validateRepositoryPath(file.path, `evidence Semgrep rule ${index} path`);
    validateSha256(file.sha256, `evidence Semgrep rule ${index} SHA-256`);
    requireNonnegativeSafeInteger(
      file.size,
      `evidence Semgrep rule ${index} size`,
    );
    if (
      seen.has(file.path) ||
      expected.get(file.path) !== file.sha256 ||
      file.size === 0
    ) {
      throw new ContractError(
        "evidence Semgrep rule inventory differs from the scanner lock",
      );
    }
    seen.add(file.path);
  }
  if (rules.manifestSha256 !== sha256Hex(canonicalJson(rules.files))) {
    throw new ContractError(
      "evidence Semgrep rule manifest hash is inconsistent",
    );
  }
}

function validateCleanupProcessRelationships(processChecks, artifacts) {
  const byId = new Map(processChecks.map((check) => [check.id, check]));
  for (const check of processChecks) {
    if (check.arguments[0] !== "run") continue;
    const containerName = check.arguments[7];
    for (const phase of ["BEFORE", "AFTER"]) {
      const cleanup = byId.get(`${check.id}-CLEANUP-${phase}`);
      if (
        canonicalJson(cleanup?.arguments) !==
        canonicalJson([
          "container",
          "ls",
          "-aq",
          "--filter",
          `name=^/${containerName}$`,
        ])
      ) {
        throw new ContractError(
          `PASS evidence process ${check.id} cleanup ${phase.toLowerCase()} does not bind its exact container`,
        );
      }
    }
    const before = byId.get(`${check.id}-CLEANUP-BEFORE`);
    const after = byId.get(`${check.id}-CLEANUP-AFTER`);
    const removal = byId.get(`${check.id}-CLEANUP-REMOVE`);
    const removedIds = removal?.arguments.slice(2) ?? [];
    if (
      removal &&
      (canonicalJson(removal.arguments.slice(0, 2)) !==
        canonicalJson(["rm", "--force"]) ||
        removedIds.length === 0 ||
        new Set(removedIds).size !== removedIds.length ||
        !removedIds.every((id) => /^[0-9a-f]{12,64}$/u.test(id)))
    ) {
      throw new ContractError(
        `PASS evidence process ${check.id} cleanup removal is invalid`,
      );
    }
    const removedOutputVariants = removal
      ? [`${removedIds.join("\n")}\n`, `${removedIds.join("\r\n")}\r\n`]
      : [""];
    validateUnredactedProcessStreamVariants(
      before,
      "stdout",
      removedOutputVariants,
      artifacts,
      `${check.id} cleanup-before`,
    );
    if (removal) {
      validateUnredactedProcessStreamVariants(
        removal,
        "stdout",
        removedOutputVariants,
        artifacts,
        `${check.id} cleanup-remove`,
      );
    }
    validateUnredactedProcessStreamVariants(
      after,
      "stdout",
      [""],
      artifacts,
      `${check.id} cleanup-after`,
    );
    for (const cleanup of [before, removal, after].filter(Boolean)) {
      validateUnredactedProcessStreamVariants(
        cleanup,
        "stderr",
        [""],
        artifacts,
        `${check.id} ${cleanup.id} stderr`,
      );
    }
  }
}

function validateUnredactedProcessStreamVariants(
  check,
  stream,
  expectedValues,
  artifacts,
  label,
) {
  const artifact = artifacts.find(
    (candidate) =>
      candidate.processId === check?.id && candidate.stream === stream,
  );
  if (
    !artifact ||
    artifact.redacted !== false ||
    !expectedValues.some(
      (expected) =>
        artifact.sha256 === sha256Hex(expected) &&
        artifact.size === Buffer.byteLength(expected),
    )
  ) {
    throw new ContractError(
      `PASS evidence ${label} raw output identity is invalid`,
    );
  }
}

function validateDynamicBlobProcesses(processChecks, evidence, trusted) {
  const processById = new Map(processChecks.map((check) => [check.id, check]));
  const expectedTracked = trackedInputDescriptors(evidence);
  const expectedTrackedPaths = expectedTracked
    .map(({ path: repositoryPath }) => repositoryPath)
    .sort();
  if (
    canonicalJson([...trusted.trackedBlobCache.keys()].sort()) !==
    canonicalJson(expectedTrackedPaths)
  ) {
    throw new ContractError(
      "PASS evidence tracked Git blob cache inventory is incomplete or excessive",
    );
  }
  const expectedTrackedIds = new Set(
    expectedTracked.map(({ path: repositoryPath }) =>
      trackedBlobProcessId(repositoryPath),
    ),
  );
  const actualTrackedIds = new Set(
    processChecks
      .filter(({ id }) => /^PROCESS-GIT-BLOB-[0-9A-F]{20}$/u.test(id))
      .map(({ id }) => id),
  );
  if (
    canonicalJson([...actualTrackedIds].sort()) !==
    canonicalJson([...expectedTrackedIds].sort())
  ) {
    throw new ContractError(
      "PASS evidence tracked Git blob process inventory is incomplete or excessive",
    );
  }
  for (const descriptor of expectedTracked) {
    validateTrackedBlobProcess(
      processById.get(trackedBlobProcessId(descriptor.path)),
      descriptor,
      evidence,
      {
        cache: trusted.trackedBlobCache,
        index: trusted.trackedIndex,
        label: "target",
        root: trusted.root,
      },
    );
  }

  const expectedControl = controlInputDescriptors(evidence);
  const expectedControlPaths = expectedControl
    .map(({ path: repositoryPath }) => repositoryPath)
    .sort();
  if (
    canonicalJson([...trusted.controlTrackedBlobCache.keys()].sort()) !==
    canonicalJson(expectedControlPaths)
  ) {
    throw new ContractError(
      "PASS evidence control Git blob cache inventory is incomplete or excessive",
    );
  }
  const expectedControlIds = new Set(
    expectedControl.map(({ path: repositoryPath }) =>
      controlTrackedBlobProcessId(repositoryPath),
    ),
  );
  const actualControlIds = new Set(
    processChecks
      .filter(({ id }) => /^PROCESS-GIT-CONTROL-BLOB-[0-9A-F]{20}$/u.test(id))
      .map(({ id }) => id),
  );
  if (
    canonicalJson([...actualControlIds].sort()) !==
    canonicalJson([...expectedControlIds].sort())
  ) {
    throw new ContractError(
      "PASS evidence control Git blob process inventory is incomplete or excessive",
    );
  }
  for (const descriptor of expectedControl) {
    validateTrackedBlobProcess(
      processById.get(controlTrackedBlobProcessId(descriptor.path)),
      descriptor,
      evidence,
      {
        cache: trusted.controlTrackedBlobCache,
        index: trusted.controlTrackedIndex,
        label: "control",
        root: trusted.controlRoot,
      },
    );
  }

  const expectedRuleIds = new Set(
    evidence.inputs.semgrepRules.files.map(({ path: rulePath }) =>
      ruleBlobProcessId(rulePath),
    ),
  );
  const actualRuleIds = new Set(
    processChecks
      .filter(({ id }) => /^PROCESS-RULE-BLOB-[0-9A-F]{20}$/u.test(id))
      .map(({ id }) => id),
  );
  if (
    canonicalJson([...actualRuleIds].sort()) !==
    canonicalJson([...expectedRuleIds].sort())
  ) {
    throw new ContractError(
      "PASS evidence rule Git blob process inventory is incomplete or excessive",
    );
  }
  for (const rule of evidence.inputs.semgrepRules.files) {
    const check = processById.get(ruleBlobProcessId(rule.path));
    if (
      !check ||
      check.arguments.length !== 5 ||
      check.arguments[0] !== "-C" ||
      path.resolve(check.arguments[1]) !==
        path.join(path.resolve(trusted.temporaryRoot), "semgrep-rules") ||
      check.arguments[2] !== "cat-file" ||
      check.arguments[3] !== "blob" ||
      check.arguments[4] !==
        `${evidence.inputs.semgrepRules.commit}:${rule.path}`
    ) {
      throw new ContractError(
        `PASS evidence rule blob process for ${rule.path} is invalid`,
      );
    }
    validateTrackedBlobArtifacts(check, rule, evidence.rawArtifacts);
  }

  for (const module of evidence.inputs.go) {
    const suffix = module.manifest
      .replaceAll(/[^A-Za-z0-9._-]/gu, "-")
      .toUpperCase();
    for (const prefix of ["PROCESS-GO-MOD-EDIT-", "PROCESS-GO-LIST-"]) {
      if (!processById.has(`${prefix}${suffix}`)) {
        throw new ContractError(
          `PASS evidence is missing Go inventory process ${prefix}${suffix}`,
        );
      }
    }
  }
}

function trackedInputDescriptors(evidence) {
  const descriptors = [
    evidence.inputs.pnpm.source,
    ...evidence.inputs.go.flatMap((module) => [
      { path: module.manifest, sha256: module.goModSha256 },
      ...(module.goSumSha256 === null
        ? []
        : [
            {
              path: POSIX.join(POSIX.dirname(module.manifest), "go.sum"),
              sha256: module.goSumSha256,
            },
          ]),
    ]),
    ...evidence.inputs.semgrepSources.files,
  ];
  return mergeTrackedDescriptors(descriptors, "target");
}

function controlInputDescriptors(evidence) {
  return mergeTrackedDescriptors(
    [
      ...evidence.inputs.controlPlane.files,
      ...Object.values(evidence.inputs.configuration),
      ...evidence.databaseArchiveValidation.validatorSources.files,
      ...TRACKED_CANARY_FIXTURES,
    ],
    "control",
  );
}

function mergeTrackedDescriptors(descriptors, label) {
  const byPath = new Map();
  for (const descriptor of descriptors) {
    validateRepositoryPath(
      descriptor.path,
      `${label} tracked evidence input path`,
    );
    validateSha256(
      descriptor.sha256,
      `${label} tracked evidence input ${descriptor.path}`,
    );
    const existing = byPath.get(descriptor.path);
    if (existing) {
      for (const key of ["sha256", "size", "gitObjectId"]) {
        if (
          existing[key] !== undefined &&
          descriptor[key] !== undefined &&
          existing[key] !== descriptor[key]
        ) {
          throw new ContractError(
            `${label} tracked evidence input ${descriptor.path} identities conflict`,
          );
        }
      }
      byPath.set(descriptor.path, { ...existing, ...descriptor });
    } else {
      byPath.set(descriptor.path, { ...descriptor });
    }
  }
  return [...byPath.values()].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
}

function validateTrackedBlobProcess(check, descriptor, evidence, source) {
  const indexEntry = source.index.get(descriptor.path);
  const cached = source.cache.get(descriptor.path);
  if (
    !indexEntry ||
    (indexEntry.mode !== "100644" && indexEntry.mode !== "100755") ||
    indexEntry.stage !== 0 ||
    !HEX_OBJECT_ID.test(indexEntry.objectId) ||
    !cached ||
    cached.objectId !== indexEntry.objectId ||
    !(cached.bytes instanceof Uint8Array) ||
    sha256Hex(cached.bytes) !== descriptor.sha256 ||
    (descriptor.size !== undefined &&
      cached.bytes.byteLength !== descriptor.size) ||
    (descriptor.gitObjectId !== undefined &&
      descriptor.gitObjectId !== indexEntry.objectId)
  ) {
    throw new ContractError(
      `PASS evidence ${source.label} tracked Git identity for ${descriptor.path} is invalid`,
    );
  }
  assertGitBlobObjectId(
    cached.bytes,
    indexEntry.objectId,
    `tracked evidence input ${descriptor.path}`,
  );
  if (
    !check ||
    check.arguments.length !== 5 ||
    check.arguments[0] !== "-C" ||
    path.resolve(check.arguments[1]) !== path.resolve(source.root) ||
    check.arguments[2] !== "cat-file" ||
    check.arguments[3] !== "blob" ||
    check.arguments[4] !== indexEntry.objectId
  ) {
    throw new ContractError(
      `PASS evidence ${source.label} tracked blob process for ${descriptor.path} is invalid`,
    );
  }
  validateTrackedBlobArtifacts(check, descriptor, evidence.rawArtifacts);
}

function validateTrackedBlobArtifacts(check, descriptor, artifacts) {
  const stdout = artifacts.find(
    (artifact) =>
      artifact.processId === check.id && artifact.stream === "stdout",
  );
  const stderr = artifacts.find(
    (artifact) =>
      artifact.processId === check.id && artifact.stream === "stderr",
  );
  if (
    !stdout ||
    !stderr ||
    stdout.redacted !== true ||
    stdout.rawSha256 !== descriptor.sha256 ||
    (descriptor.size !== undefined && stdout.rawSize !== descriptor.size) ||
    !Number.isSafeInteger(stdout.rawSize) ||
    stdout.rawSize < 0 ||
    stderr.redacted !== true ||
    stderr.rawSha256 !== EMPTY_SHA256 ||
    stderr.rawSize !== 0
  ) {
    throw new ContractError(
      `PASS evidence tracked blob artifacts for ${descriptor.path} are invalid`,
    );
  }
  for (const artifact of [stdout, stderr]) {
    const content = `${canonicalJson({
      redacted: true,
      sha256: artifact.rawSha256,
      size: artifact.rawSize,
    })}\n`;
    if (
      artifact.sha256 !== sha256Hex(content) ||
      artifact.size !== Buffer.byteLength(content)
    ) {
      throw new ContractError(
        `PASS evidence tracked blob artifact rendering for ${descriptor.path} is invalid`,
      );
    }
  }
}

function trackedBlobProcessId(repositoryPath) {
  return `PROCESS-GIT-BLOB-${sha256Hex(repositoryPath)
    .slice(0, 20)
    .toUpperCase()}`;
}

function controlTrackedBlobProcessId(repositoryPath) {
  return `PROCESS-GIT-CONTROL-BLOB-${sha256Hex(repositoryPath)
    .slice(0, 20)
    .toUpperCase()}`;
}

function ruleBlobProcessId(repositoryPath) {
  return `PROCESS-RULE-BLOB-${sha256Hex(repositoryPath)
    .slice(0, 20)
    .toUpperCase()}`;
}

function validateTerminalArtifactReference(terminal, processCheck, artifacts) {
  if (terminal?.processId !== processCheck?.id) {
    throw new ContractError(
      `PASS evidence terminal ${terminal?.id ?? "unknown"} process reference is invalid`,
    );
  }
  const processArtifacts = artifacts.filter(
    (artifact) => artifact.processId === processCheck.id,
  );
  const stdout = processArtifacts.find(
    (artifact) => artifact.stream === "stdout",
  );
  const stderr = processArtifacts.find(
    (artifact) => artifact.stream === "stderr",
  );
  if (
    processArtifacts.length !== 2 ||
    !stdout ||
    !stderr ||
    terminal.stdoutSha256 !== stdout.sha256 ||
    terminal.stdoutRawSha256 !== stdout.rawSha256 ||
    terminal.stderrSha256 !== stderr.sha256 ||
    terminal.stderrRawSha256 !== stderr.rawSha256
  ) {
    throw new ContractError(
      `PASS evidence terminal ${terminal.id} artifact hashes do not match ${processCheck.id}`,
    );
  }
}

function validateTerminalSemantics(
  evidence,
  terminalById,
  processById,
  trusted,
) {
  validateExactTerminalShapes(evidence, terminalById);
  validateExecutionEnvironmentSemantics(evidence, processById, trusted);
  if (
    canonicalJson(terminalById.get("R016-REPOSITORY-USE")?.context) !==
    canonicalJson(evidence.inputs.repositoryUse)
  ) {
    throw new ContractError(
      "PASS evidence repository use terminal is inconsistent",
    );
  }
  const execution = terminalById.get("R016-EXECUTION-ENVIRONMENT");
  for (const field of ["runtime", "docker", "executables"]) {
    if (
      canonicalJson(execution?.[field]) !==
      canonicalJson(evidence.environment[field])
    ) {
      throw new ContractError(
        `PASS evidence execution terminal ${field} is inconsistent`,
      );
    }
  }
  const sourceSeal = terminalById.get("R016-SOURCE-SEAL");
  if (
    sourceSeal?.head !== evidence.source.head ||
    sourceSeal?.tree !== evidence.source.tree
  ) {
    throw new ContractError(
      "PASS evidence source seal terminal is inconsistent",
    );
  }
  if (
    terminalById.get("R016-DB-SEAL")?.detail !==
    "offline scan database bytes match the pre-scan seal"
  ) {
    throw new ContractError("PASS evidence database seal terminal is invalid");
  }
  if (
    terminalById.get("R016-GATE")?.detail !==
    "all required controls passed in the same run"
  ) {
    throw new ContractError("PASS evidence gate terminal is invalid");
  }

  const missingDatabase = terminalById.get("R016-OSV-MISSING-DB-NEGATIVE");
  if (
    missingDatabase?.rawExit !== 127 ||
    missingDatabase.stderrSha256 !== missingDatabase.stderrRawSha256
  ) {
    throw new ContractError(
      "PASS evidence missing-database terminal semantics are invalid",
    );
  }

  for (const specification of [
    {
      id: "R016-OSV-VULNERABILITY-CANARY",
      fixture: "scripts/fixtures/supply-chain/vulnerable-pnpm-lock.yaml.txt",
      declaredDirectScopes: [],
      fixtureScope: "unknown",
      scannerScope: "unknown",
      inventory: [
        {
          ecosystem: "npm",
          name: "lodash",
          scope: "unknown",
          version: "4.17.20",
        },
      ],
    },
    {
      id: "R016-OSV-VULNERABILITY-DEVELOPMENT-CANARY",
      fixture:
        "scripts/fixtures/supply-chain/vulnerable-development-pnpm-lock.yaml.txt",
      declaredDirectScopes: ["devDependencies"],
      fixtureScope: "development",
      scannerScope: "unknown",
      inventory: [
        {
          ecosystem: "npm",
          name: "lodash",
          scope: "unknown",
          version: "4.17.20",
        },
      ],
    },
  ]) {
    const terminal = terminalById.get(specification.id);
    const fixture = trackedFixture(specification.fixture);
    if (
      terminal?.rawExit !== 1 ||
      canonicalJson(terminal.declaredDirectScopes) !==
        canonicalJson(specification.declaredDirectScopes) ||
      terminal.fixtureScope !== specification.fixtureScope ||
      terminal.scannerScope !== specification.scannerScope ||
      terminal.scannerScopeReported !== false ||
      terminal.fixtureSha256 !== fixture.sha256 ||
      !Number.isSafeInteger(terminal.findingCount) ||
      terminal.findingCount <= 0 ||
      terminal.inventorySha256 !==
        osvInventorySha256("/fixture/pnpm-lock.yaml", specification.inventory)
    ) {
      throw new ContractError(
        `PASS evidence terminal ${specification.id} semantics are invalid`,
      );
    }
  }

  const goCanary = terminalById.get("R016-OSV-GO-ADVISORY-CANARY");
  if (
    goCanary?.rawExit !== 1 ||
    goCanary.advisoryId !== "GO-2022-1059" ||
    goCanary.ecosystem !== "Go" ||
    goCanary.packageName !== "golang.org/x/text" ||
    goCanary.version !== "0.3.7" ||
    goCanary.extractionCount !== 2 ||
    goCanary.fixtureSha256 !==
      trackedFixture("scripts/fixtures/supply-chain/vulnerable-go.mod.txt")
        .sha256
  ) {
    throw new ContractError(
      "PASS evidence Go advisory canary terminal semantics are invalid",
    );
  }

  const goLicenseCanary = terminalById.get("R016-OSV-GO-LICENSE-DENIED-CANARY");
  if (
    goLicenseCanary?.rawExit !== 1 ||
    goLicenseCanary.ecosystem !== "Go" ||
    goLicenseCanary.expectedLicense !== "GPL-3.0-or-later" ||
    goLicenseCanary.packageName !== "github.com/MichaelMure/git-bug" ||
    goLicenseCanary.version !== "0.8.0" ||
    goLicenseCanary.extractionCount !== 2 ||
    goLicenseCanary.fixtureSha256 !==
      trackedFixture("scripts/fixtures/supply-chain/go-license-denied.mod.txt")
        .sha256 ||
    goLicenseCanary.findingCount !== 3 ||
    goLicenseCanary.inventorySha256 !==
      osvInventorySha256("/fixture/go.mod", [
        {
          ecosystem: "Go",
          name: "github.com/MichaelMure/git-bug",
          scope: "unknown",
          version: "0.8.0",
        },
      ])
  ) {
    throw new ContractError(
      "PASS evidence Go license canary terminal semantics are invalid",
    );
  }

  for (const specification of [
    {
      id: "R016-OSV-LICENSE-DENIED-CANARY",
      fixture:
        "scripts/fixtures/supply-chain/license-denied-pnpm-lock.yaml.txt",
      expectedLicense: "BUSL-1.1",
      packageName: "directus",
      version: "11.17.3",
    },
    {
      id: "R016-OSV-LICENSE-UNKNOWN-CANARY",
      fixture:
        "scripts/fixtures/supply-chain/license-unknown-pnpm-lock.yaml.txt",
      expectedLicense: "UNKNOWN",
      packageName: "reserved",
      version: "0.1.1",
    },
  ]) {
    const terminal = terminalById.get(specification.id);
    if (
      terminal?.rawExit !== 1 ||
      terminal.expectedLicense !== specification.expectedLicense ||
      terminal.fixtureSha256 !== trackedFixture(specification.fixture).sha256 ||
      !Number.isSafeInteger(terminal.findingCount) ||
      terminal.findingCount <= 0 ||
      terminal.inventorySha256 !==
        osvInventorySha256("/fixture/pnpm-lock.yaml", [
          {
            ecosystem: "npm",
            name: specification.packageName,
            scope: "unknown",
            version: specification.version,
          },
        ])
    ) {
      throw new ContractError(
        `PASS evidence terminal ${specification.id} semantics are invalid`,
      );
    }
  }

  const packageCount =
    evidence.inputs.pnpm.packageCount +
    evidence.inputs.go.reduce(
      (sum, module) => sum + module.thirdPartyModuleCount,
      0,
    );
  const sourceCount =
    evidence.inputs.pnpm.documents.length +
    evidence.inputs.go.filter(
      ({ thirdPartyModuleCount }) => thirdPartyModuleCount > 0,
    ).length;
  const vulnerability = terminalById.get("R016-VULNERABILITY");
  const vulnerabilityEvidence = {
    inventorySha256: vulnerability?.inventorySha256,
    packageCount: vulnerability?.packageCount,
    sourceCount: vulnerability?.sourceCount,
    threshold: vulnerability?.threshold,
  };
  if (
    vulnerability?.rawExit !== 0 ||
    vulnerability.packageCount !== packageCount ||
    vulnerability.sourceCount !== sourceCount ||
    vulnerability.threshold !==
      trusted.configuration.policy.vulnerabilities.minimumBlockingCvss ||
    canonicalJson(vulnerabilityEvidence) !==
      canonicalJson(trusted.verdictExecutionSeals.vulnerability)
  ) {
    throw new ContractError(
      "PASS evidence vulnerability terminal verdict is inconsistent",
    );
  }
  validateSha256(
    vulnerability.inventorySha256,
    "PASS evidence vulnerability terminal inventory",
  );

  const license = terminalById.get("R016-LICENSE");
  const licenseEvidence = {
    allowedSpdxSha256: license?.allowedSpdxSha256,
    inventorySha256: license?.inventorySha256,
    packageCount: license?.packageCount,
    sourceCount: license?.sourceCount,
  };
  const allowedSpdx = [...trusted.configuration.policy.licenses.allowed].sort(
    (left, right) => left.localeCompare(right),
  );
  if (
    license?.rawExit !== 0 ||
    license.packageCount !== packageCount ||
    license.sourceCount !== sourceCount ||
    license.allowedSpdxSha256 !== sha256Hex(canonicalJson(allowedSpdx)) ||
    license.onlineMetadataSource !== "deps.dev" ||
    license.reproducibilityResidual !==
      "deps.dev does not expose a response snapshot digest; exact package parity and fail-closed network handling are enforced" ||
    canonicalJson(licenseEvidence) !==
      canonicalJson(trusted.verdictExecutionSeals.license)
  ) {
    throw new ContractError(
      "PASS evidence license terminal verdict is inconsistent",
    );
  }
  validateSha256(
    license.inventorySha256,
    "PASS evidence license terminal inventory",
  );

  const sast = terminalById.get("R016-SAST");
  const repositoryPaths = evidence.inputs.semgrepSources.files
    .map(({ path: repositoryPath }) => repositoryPath)
    .sort((left, right) => left.localeCompare(right, "en"));
  const expectedParity = {
    pathCount: repositoryPaths.length,
    pathsSha256: sha256Hex(canonicalJson(repositoryPaths)),
  };
  const scannedPathDigests = ["/src/", "src/"].map((prefix) =>
    sha256Hex(
      canonicalJson(
        repositoryPaths.map((repositoryPath) => `${prefix}${repositoryPath}`),
      ),
    ),
  );
  if (
    sast?.rawExit !== 0 ||
    sast.engine !== SEMGREP_ENGINE ||
    canonicalJson(sast.exactSourceParity) !== canonicalJson(expectedParity) ||
    canonicalJson(sast.coverage) !==
      canonicalJson(evidence.inputs.semgrepSources.groupCounts) ||
    sast.scannedPathCount !== repositoryPaths.length ||
    !scannedPathDigests.includes(sast.scannedPathsSha256)
  ) {
    throw new ContractError(
      "PASS evidence SAST terminal verdict is inconsistent",
    );
  }

  const sastNegative = terminalById.get("R016-SAST-NEGATIVE");
  const negativePaths = [
    ".semgrepignore",
    "ignored/sast-semgrepignore.ts",
    "sast-go-blocking.go",
    "sast-over-limit.ts",
    "sast-typescript-blocking.ts",
  ];
  if (
    sastNegative?.rawExit !== 1 ||
    !Number.isSafeInteger(sastNegative.findingCount) ||
    sastNegative.findingCount < 4 ||
    canonicalJson(sastNegative.coverage) !==
      canonicalJson({ go: 1, "javascript-typescript": 3 }) ||
    canonicalJson(sastNegative.exactSourceParity) !==
      canonicalJson({
        pathCount: negativePaths.length,
        pathsSha256: sha256Hex(canonicalJson(negativePaths)),
      }) ||
    sastNegative.largeFixtureAverageBytesPerLine !== 262_527 ||
    sastNegative.largeFixtureLineCount !== 4 ||
    sastNegative.largeFixtureSha256 !==
      "a62cb7a2da7169d4a075a92fcb05251685b068ad1d3379501c01b09a035fbec3" ||
    sastNegative.largeFixtureSize !== 1_050_108
  ) {
    throw new ContractError(
      "PASS evidence SAST negative terminal verdict is inconsistent",
    );
  }
}

function validateExactTerminalShapes(evidence, terminalById) {
  const base = ["id", "status"];
  const processReference = [
    "processId",
    "stdoutSha256",
    "stdoutRawSha256",
    "stderrSha256",
    "stderrRawSha256",
  ];
  const processTerminal = (...fields) => [
    ...base,
    "rawExit",
    ...fields,
    ...processReference,
  ];
  const shapes = {
    "R016-REPOSITORY-USE": [...base, "context"],
    "R016-EXECUTION-ENVIRONMENT": [...base, "runtime", "docker", "executables"],
    "R016-OSV-MISSING-DB-NEGATIVE": processTerminal(),
    "R016-OSV-VULNERABILITY-CANARY": processTerminal(
      "declaredDirectScopes",
      "fixtureScope",
      "fixtureSha256",
      "findingCount",
      "inventorySha256",
      "scannerScope",
      "scannerScopeReported",
    ),
    "R016-OSV-VULNERABILITY-DEVELOPMENT-CANARY": processTerminal(
      "declaredDirectScopes",
      "fixtureScope",
      "fixtureSha256",
      "findingCount",
      "inventorySha256",
      "scannerScope",
      "scannerScopeReported",
    ),
    "R016-OSV-GO-ADVISORY-CANARY": processTerminal(
      "advisoryId",
      "ecosystem",
      "packageName",
      "version",
      "extractionCount",
      "fixtureSha256",
    ),
    "R016-OSV-GO-LICENSE-DENIED-CANARY": processTerminal(
      "ecosystem",
      "expectedLicense",
      "packageName",
      "version",
      "extractionCount",
      "fixtureSha256",
      "findingCount",
      "inventorySha256",
    ),
    "R016-OSV-LICENSE-DENIED-CANARY": processTerminal(
      "expectedLicense",
      "fixtureSha256",
      "findingCount",
      "inventorySha256",
    ),
    "R016-OSV-LICENSE-UNKNOWN-CANARY": processTerminal(
      "expectedLicense",
      "fixtureSha256",
      "findingCount",
      "inventorySha256",
    ),
    "R016-DB-ZIP": processTerminal("archiveCount"),
    "R016-DB-SEAL": [...base, "detail"],
    "R016-VULNERABILITY": processTerminal(
      "inventorySha256",
      "packageCount",
      "sourceCount",
      "threshold",
    ),
    "R016-LICENSE": processTerminal(
      "onlineMetadataSource",
      "reproducibilityResidual",
      "allowedSpdxSha256",
      "inventorySha256",
      "packageCount",
      "sourceCount",
    ),
    "R016-SAST": processTerminal(
      "engine",
      "exactSourceParity",
      "coverage",
      "scannedPathCount",
      "scannedPathsSha256",
    ),
    "R016-SAST-NEGATIVE": processTerminal(
      "findingCount",
      "coverage",
      "exactSourceParity",
      "largeFixtureAverageBytesPerLine",
      "largeFixtureLineCount",
      "largeFixtureSha256",
      "largeFixtureSize",
    ),
    "R016-SOURCE-SEAL": [...base, "head", "tree"],
    "R016-GATE": [...base, "detail"],
  };
  shapes["R016-CONTROL-SOURCE-SEAL"] =
    evidence.inputs.controlPlane.mode === "same-root"
      ? [...base, "head", "tree", "sameAsTarget"]
      : [...base, "head", "tree"];
  for (const [id, expectedKeys] of Object.entries(shapes)) {
    assertExactObjectKeys(
      terminalById.get(id),
      expectedKeys,
      `PASS evidence terminal ${id}`,
    );
  }
}

function validateExecutionEnvironmentSemantics(evidence, processById, trusted) {
  const environment = evidence.environment;
  const runner = Object.create(null);
  for (const name of [
    "CI",
    "GITHUB_ACTIONS",
    "ImageOS",
    "ImageVersion",
    "RUNNER_ARCH",
    "RUNNER_OS",
  ]) {
    const value = process.env[name];
    if (typeof value === "string" && value !== "") runner[name] = value;
  }
  if (
    environment.runtime?.node !== process.version ||
    environment.runtime?.platform !== process.platform ||
    environment.runtime?.architecture !== process.arch ||
    canonicalJson(environment.runner) !== canonicalJson(runner)
  ) {
    throw new ContractError(
      "PASS evidence execution runtime differs from the active trusted process",
    );
  }
  const docker = environment.docker;
  const dockerSeal = trusted.dockerEnvironmentSeal;
  const dockerDocument = dockerSeal.document;
  requireRecord(dockerDocument, "trusted Docker version document");
  const expectedDocker = {
    clientVersion: dockerDocument.Client?.Version,
    serverVersion: dockerDocument.Server?.Version,
    clientPlatform: dockerDocument.Client?.Platform?.Name ?? null,
    serverOs: dockerDocument.Server?.Os ?? null,
    serverArchitecture: dockerDocument.Server?.Arch ?? null,
    versionDocumentSha256: sha256Hex(canonicalJson(dockerDocument)),
  };
  if (
    !/^v?[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/u.test(
      docker.clientVersion,
    ) ||
    !/^v?[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/u.test(
      docker.serverVersion,
    ) ||
    ![docker.clientPlatform, docker.serverOs, docker.serverArchitecture].every(
      (value) => value === null || (typeof value === "string" && value !== ""),
    ) ||
    canonicalJson({
      clientVersion: docker.clientVersion,
      serverVersion: docker.serverVersion,
      clientPlatform: docker.clientPlatform,
      serverOs: docker.serverOs,
      serverArchitecture: docker.serverArchitecture,
      versionDocumentSha256: docker.versionDocumentSha256,
    }) !== canonicalJson(expectedDocker)
  ) {
    throw new ContractError("PASS evidence Docker environment is invalid");
  }
  validateSha256(
    docker.versionDocumentSha256,
    "PASS evidence Docker version document",
  );
  const dockerVersionArtifact = evidence.rawArtifacts.find(
    (artifact) =>
      artifact.processId === "PROCESS-DOCKER-VERSION" &&
      artifact.stream === "stdout",
  );
  if (
    !dockerVersionArtifact ||
    dockerVersionArtifact.redacted !== false ||
    dockerVersionArtifact.rawSha256 !== dockerSeal.stdoutSha256 ||
    dockerVersionArtifact.rawSize !== dockerSeal.stdoutSize ||
    dockerVersionArtifact.size <= 0
  ) {
    throw new ContractError(
      "PASS evidence Docker version process output is invalid",
    );
  }
}

function trackedFixture(repositoryPath) {
  const fixture = TRACKED_CANARY_FIXTURES.find(
    ({ path: fixturePath }) => fixturePath === repositoryPath,
  );
  if (!fixture) {
    throw new ContractError(`tracked fixture ${repositoryPath} is not locked`);
  }
  return fixture;
}

function osvInventorySha256(source, packages) {
  const sortedPackages = [...packages].sort((left, right) =>
    `${left.ecosystem}:${left.name}@${left.version}#${left.scope}`.localeCompare(
      `${right.ecosystem}:${right.name}@${right.version}#${right.scope}`,
    ),
  );
  return sha256Hex(canonicalJson([{ packages: sortedPackages, source }]));
}

function assertExactObjectKeys(value, expected, label) {
  requireRecord(value, label);
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (canonicalJson(actual) !== canonicalJson(required)) {
    throw new ContractError(`${label} does not match the exact required keys`);
  }
}

function validateSha256(value, label) {
  if (!/^[0-9a-f]{64}$/u.test(value)) {
    throw new ContractError(`${label} is invalid`);
  }
}

function requireNonnegativeSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ContractError(`${label} is invalid`);
  }
}

function exactPathSet(values, label) {
  if (!Array.isArray(values))
    throw new ContractError(`${label} paths are invalid`);
  const result = new Set();
  for (const [index, value] of values.entries()) {
    validateRepositoryPath(value, `${label} path ${index}`);
    if (result.has(value))
      throw new ContractError(`${label} paths contain duplicates`);
    result.add(value);
  }
  return result;
}

function semgrepRepositoryPath(value, root, index) {
  if (typeof value !== "string" || value.includes("\\")) {
    throw new ContractError(`Semgrep scanned path ${index} is invalid`);
  }
  const canonicalRoot = POSIX.normalize(root).replace(/\/$/u, "");
  const candidates = [`${canonicalRoot}/`, `${canonicalRoot.slice(1)}/`];
  const prefix = candidates.find((candidate) => value.startsWith(candidate));
  if (!prefix) {
    throw new ContractError(`Semgrep scanned path ${index} is outside ${root}`);
  }
  const repositoryPath = value.slice(prefix.length);
  validateRepositoryPath(repositoryPath, `Semgrep scanned path ${index}`);
  return repositoryPath;
}

function validateRepositoryPath(value, label) {
  if (
    typeof value !== "string" ||
    value === "" ||
    value.includes("\\") ||
    value.includes("\0") ||
    POSIX.isAbsolute(value) ||
    POSIX.normalize(value) !== value ||
    value === "." ||
    value.startsWith("../") ||
    value.includes("/../")
  ) {
    throw new ContractError(`${label} is not a canonical repository path`);
  }
}

function requireRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ContractError(`${label} must be an object`);
  }
}

function requireNonemptyString(value, label) {
  if (typeof value !== "string" || value === "") {
    throw new ContractError(`${label} must be a nonempty string`);
  }
  return value;
}
