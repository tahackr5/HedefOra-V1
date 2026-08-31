import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  DatabaseAcquisitionError,
  downloadAdvisoryDatabase,
} from "./database.mjs";
import {
  assertGitBlobObjectId,
  assertSemgrepSourceParity,
  parseGitIndex,
  requireTrackedRegularFile,
  selectTrackedSourceFiles,
  validateEvidenceDocument,
  validateGitIndexFlags,
  validateGoModEdit,
  validateOsvConfiguration,
  validateRepositoryUseBoundary,
  validateRepositoryUseContext,
} from "./contracts.mjs";
import {
  DIRECT_SCOPE_NAMES,
  InventoryContractError,
  assertOsvSourceInventoryParity,
  parsePnpmLockInventory,
} from "./inventory.mjs";
import {
  ContractError,
  EXIT_CODES,
  canonicalJson,
  evaluateOsvLicenses,
  evaluateOsvVulnerabilities,
  evaluateSemgrep,
  parseStrictJson,
  sha256Hex,
  validateDatabaseIdentity,
} from "./policy.mjs";
import {
  ProcessContractError,
  ProcessLaunchError,
  ProcessOutputEncodingError,
  runProcess,
} from "./process.mjs";

const modulePath = fileURLToPath(import.meta.url);
const defaultRepositoryRoot = path.resolve(
  path.dirname(modulePath),
  "..",
  "..",
);
const POSIX = path.posix;
const CONTROL_CONFIGURATION_PATHS = Object.freeze({
  policy: "security/supply-chain-policy.json",
  scanners: "security/scanners.lock.json",
  osvConfig: "security/osv-scanner.toml",
  evidenceSchema: "security/r016-evidence.schema.json",
});
const CONTROL_PROTECTED_EXACT_PATHS = new Set([
  ...Object.values(CONTROL_CONFIGURATION_PATHS),
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
const DATABASE_ARCHIVE_VALIDATION_LIMITS = Object.freeze({
  max_entries: 300_000,
  max_entry_path_bytes: 4_096,
  max_entry_uncompressed_bytes: 134_217_728,
  max_archive_uncompressed_bytes: 8_589_934_592,
});

export function goModuleEnvironment() {
  return {
    GOENV: "off",
    GOFLAGS: "-mod=readonly",
    GOINSECURE: "",
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
}

export class GateFailure extends Error {
  constructor(exitCode, stage, detail, cause) {
    super(`${stage}: ${detail}`, cause ? { cause } : undefined);
    this.name = "GateFailure";
    this.exitCode = exitCode;
    this.stage = stage;
  }
}

export async function executeSupplyChainGate({
  repositoryRoot = defaultRepositoryRoot,
  controlRoot = defaultRepositoryRoot,
  now = new Date(),
  trustedExecutables,
  expectedCheckoutSha = process.env.EXPECTED_CHECKOUT_SHA,
  expectedControlSha = process.env.EXPECTED_CONTROL_SHA,
  repositoryUseContext,
} = {}) {
  const root = path.resolve(repositoryRoot);
  const resolvedControlRoot = path.resolve(controlRoot);
  const startedAt = explicitDate(now, "gate start time");
  const runId = `${startedAt.toISOString().replaceAll(/[^0-9TZ]/gu, "")}-${process.pid}-${randomBytes(4).toString("hex")}`;
  const artifactRoot = path.join(root, "artifacts", "r016", runId);
  const rawRoot = path.join(artifactRoot, "raw");
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "hedefora-r016-"));
  const executablePaths =
    process.platform === "linux" && process.env.GITHUB_ACTIONS === "true"
      ? { docker: "/usr/bin/docker", git: "/usr/bin/git" }
      : trustedExecutables;
  const context = {
    root,
    controlRoot: resolvedControlRoot,
    expectedCheckoutSha,
    expectedControlSha,
    declaredRepositoryUseContext: repositoryUseContext,
    runId,
    artifactRoot,
    rawRoot,
    temporaryRoot,
    dockerConfig: path.join(temporaryRoot, "docker-config"),
    processSeals: new Map(),
    rawArtifactSeals: new Map(),
    terminalSeals: new Map(),
    trustedExecutableSeals: {},
    trustedExecutables: {},
    verdictExecutionSeals: Object.create(null),
    evidence: {
      schemaVersion: 2,
      gateId: "R-016",
      runId,
      status: "IN_PROGRESS",
      startedAt: startedAt.toISOString(),
      source: {},
      controlSource: {},
      inputs: {},
      environment: {},
      tools: {},
      advisoryDatabases: [],
      checks: [],
      rawArtifacts: [],
    },
  };

  let artifactReady = false;
  let exitCode = EXIT_CODES.INTERNAL;
  try {
    await prepareArtifactDirectories(root, artifactRoot, rawRoot);
    artifactReady = true;
    context.temporaryRootReal = await realpath(temporaryRoot);
    [context.rootReal, context.controlRootReal, context.moduleControlRootReal] =
      await Promise.all([
        realpath(root),
        realpath(resolvedControlRoot),
        realpath(defaultRepositoryRoot),
      ]);
    validateDeclaredRepositoryRealPath(root, context.rootReal, "target");
    validateDeclaredRepositoryRealPath(
      resolvedControlRoot,
      context.controlRootReal,
      "control",
    );
    validateControlModuleRoot(
      context.controlRootReal,
      context.moduleControlRootReal,
    );
    context.sameSourceRoot = validateControlRootSeparation(
      context.rootReal,
      context.controlRootReal,
    );
    const temporaryMetadata = await lstat(temporaryRoot);
    if (
      !temporaryMetadata.isDirectory() ||
      temporaryMetadata.isSymbolicLink()
    ) {
      throw new ContractError(
        "R-016 temporary root must be a regular non-link directory",
      );
    }
    context.trustedExecutableSeals = await inspectTrustedExecutableFiles(
      root,
      temporaryRoot,
      executablePaths,
      [resolvedControlRoot],
    );
    context.trustedExecutables = Object.fromEntries(
      Object.entries(context.trustedExecutableSeals).map(([name, seal]) => [
        name,
        seal.path,
      ]),
    );
    await mkdir(context.dockerConfig, { recursive: false, mode: 0o700 });
    await runGate(context, startedAt);
    context.evidence.status = "PASS";
    exitCode = EXIT_CODES.PASS;
  } catch (error) {
    const failure = normalizeFailure(error);
    context.evidence.status = "FAIL";
    context.evidence.failure = serializeFailureForEvidence(failure);
    exitCode = failure.exitCode;
  } finally {
    try {
      await removeVerifiedTemporaryRoot(temporaryRoot);
    } catch (error) {
      exitCode = applyTemporaryCleanupFailure(context.evidence, error);
    }
    if (context.evidence.status === "PASS") {
      try {
        await verifyAllSourceIdentities(context);
      } catch (error) {
        const failure = normalizeFailure(error);
        context.evidence.status = "FAIL";
        context.evidence.failure = serializeFailureForEvidence(failure);
        exitCode = failure.exitCode;
      }
    }
    context.evidence.finishedAt = new Date().toISOString();
    context.evidence.exitCode = exitCode;
    exitCode = await writeEvidenceWithoutMaskingFailure(
      context,
      artifactReady,
      exitCode,
    );
  }

  return {
    artifactRoot,
    evidence: context.evidence,
    exitCode,
  };
}

async function verifyAllSourceIdentities(context) {
  const failures = [];
  for (const verification of [
    () => verifySourceIdentity(context, context.sourceSeal),
    () => verifyControlSourceIdentity(context, context.controlSourceSeal),
  ]) {
    try {
      await verification();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw gateFailure(
      EXIT_CODES.CONTRACT,
      "source-identity-final",
      "target and control source seals both failed final verification",
      new AggregateError(failures, "multiple source identity failures"),
    );
  }
}

export function applyTemporaryCleanupFailure(evidence, error) {
  const failure = normalizeFailure(error);
  const cleanupFailure = serializeFailureForEvidence(failure);
  const primaryFailure = evidence.failure;
  evidence.status = "FAIL";
  evidence.failure = {
    exitCode: EXIT_CODES.INTERNAL,
    stage: "temporary-cleanup",
    message: failure.message,
    type: failure.name,
    ...((primaryFailure || cleanupFailure.causes?.length > 0) && {
      causes: [
        ...(primaryFailure ? [primaryFailure] : []),
        ...(cleanupFailure.causes ?? []),
      ],
    }),
  };
  return EXIT_CODES.INTERNAL;
}

export function applyEvidenceWriteFailure(evidence, error) {
  const failure = normalizeFailure(error);
  const writeFailure = serializeFailureForEvidence(failure);
  const primaryFailure = evidence.failure;
  evidence.status = "FAIL";
  evidence.failure = {
    exitCode: EXIT_CODES.INTERNAL,
    stage: "evidence-finalization",
    message: failure.message,
    type: failure.name,
    ...((primaryFailure || writeFailure.causes?.length > 0) && {
      causes: [
        ...(primaryFailure ? [primaryFailure] : []),
        ...(writeFailure.causes ?? []),
      ],
    }),
  };
  evidence.exitCode = EXIT_CODES.INTERNAL;
  return EXIT_CODES.INTERNAL;
}

export function applyEvidenceFallbackWriteFailure(evidence, error) {
  const failure = normalizeFailure(error);
  const fallbackFailure = serializeFailureForEvidence(failure);
  const finalizationFailure = evidence.failure;
  evidence.status = "FAIL";
  evidence.failure = {
    exitCode: EXIT_CODES.INTERNAL,
    stage: "evidence-finalization-fallback",
    message: failure.message,
    type: failure.name,
    causes: [
      ...(finalizationFailure ? [finalizationFailure] : []),
      ...(fallbackFailure.causes ?? []),
    ],
  };
  evidence.exitCode = EXIT_CODES.INTERNAL;
  return EXIT_CODES.INTERNAL;
}

export async function writeEvidenceWithoutMaskingFailure(
  context,
  artifactReady,
  exitCode,
  evidenceWriter = writeEvidence,
  fallbackWriter = writeEvidenceFinalizationFailure,
) {
  if (!artifactReady) return exitCode;
  try {
    await evidenceWriter(context);
    return exitCode;
  } catch (error) {
    applyEvidenceWriteFailure(context.evidence, error);
    try {
      await fallbackWriter(context);
    } catch (fallbackError) {
      applyEvidenceFallbackWriteFailure(context.evidence, fallbackError);
    }
    return EXIT_CODES.INTERNAL;
  }
}

async function runGate(context, now) {
  const source = await inspectSource(context);
  context.sourceSeal = structuredClone(source);
  context.evidence.source = structuredClone(source);
  const controlSource = await inspectControlSource(context, source);
  if (
    !context.sameSourceRoot &&
    path.relative(source.gitDirectory, controlSource.gitDirectory) === ""
  ) {
    throw new ContractError(
      "split R-016 target and control repositories must not share one Git directory",
    );
  }
  context.controlSourceSeal = structuredClone(controlSource);
  context.evidence.controlSource = structuredClone(controlSource);
  const controlPlane = await prepareControlPlaneInputs(context);
  context.controlInputsSeal = structuredClone(controlPlane);
  context.evidence.inputs.controlPlane = structuredClone(controlPlane);
  const configuration = await loadConfiguration(context);
  const repositoryUse = validateRepositoryUseContext(
    context.declaredRepositoryUseContext ??
      repositoryUseContextFromEnvironment(process.env),
    configuration.scanners.semgrepRules.useBoundary,
    process.env.GITHUB_ACTIONS,
  );
  context.repositoryUseSeal = structuredClone(repositoryUse);
  context.evidence.inputs.repositoryUse = structuredClone(repositoryUse);
  recordTerminalCheck(context, {
    id: "R016-REPOSITORY-USE",
    status: "PASS",
    context: structuredClone(repositoryUse),
  });
  await inspectExecutionEnvironment(context, configuration);
  const inventory = await prepareInputs(context, configuration);
  const semgrepSources = await prepareSemgrepSourceInputs(
    context,
    configuration,
  );

  await acquireImages(context, configuration);
  context.toolsSeal = structuredClone(context.evidence.tools);
  const rules = await acquireRules(context, configuration);
  const goInventory = await resolveGoInventory(
    context,
    configuration,
    inventory.goManifests,
    inventory.scanInputRoot,
  );
  inventory.goInventory = goInventory;
  context.evidence.inputs.go = summarizeGoInventory(goInventory);
  context.inputsSeal = structuredClone(context.evidence.inputs);
  await runOsvMissingDatabaseNegativeGate(context, configuration, inventory);

  const databases = await acquireDatabases(context, configuration, now);
  await validateDatabaseArchives(context, configuration, databases);
  await sealDatabases(context, databases);

  await runOsvVulnerabilityCanaries(context, configuration, databases);
  await runOsvGoAdvisoryCanary(context, configuration, databases);
  await runOsvGoLicenseCanary(context, configuration);
  await runOsvLicenseCanaries(context, configuration);
  await runOsvVulnerabilityGate(context, configuration, inventory, databases);
  await runOsvLicenseGate(context, configuration, inventory);
  await runSemgrepGates(context, configuration, rules, semgrepSources);
  await verifyDatabaseSeal(context, databases);

  recordTerminalCheck(context, {
    id: "R016-GATE",
    status: "PASS",
    detail: "all required controls passed in the same run",
  });
}

async function inspectSource(context) {
  const inspected = await inspectGitSource(context, {
    expectedSha: context.expectedCheckoutSha,
    expectedShaLabel: "EXPECTED_CHECKOUT_SHA",
    failureStage: "source-identity",
    processPrefix: "git",
    repositoryRoot: context.root,
    requireExpectedSha: expectedCheckoutShaIsRequired(
      context.sameSourceRoot,
      process.env.GITHUB_ACTIONS,
    ),
  });
  context.trackedIndex = inspected.trackedIndex;
  context.trackedBlobCache = new Map();
  return inspected.source;
}

async function inspectControlSource(context, targetSource) {
  if (context.sameSourceRoot) {
    context.controlTrackedIndex = context.trackedIndex;
    context.controlTrackedBlobCache = new Map();
    return structuredClone(targetSource);
  }
  const inspected = await inspectGitSource(context, {
    expectedSha: context.expectedControlSha,
    expectedShaLabel: "EXPECTED_CONTROL_SHA",
    failureStage: "control-source-identity",
    processPrefix: "git-control",
    repositoryRoot: context.controlRoot,
    requireExpectedSha: true,
  });
  context.controlTrackedIndex = inspected.trackedIndex;
  context.controlTrackedBlobCache = new Map();
  return inspected.source;
}

async function inspectGitSource(
  context,
  {
    expectedSha,
    expectedShaLabel,
    failureStage,
    processPrefix,
    repositoryRoot,
    requireExpectedSha,
  },
) {
  const binding = await inspectRepositoryBinding(
    context,
    repositoryRoot,
    processPrefix,
  );
  const head = (
    await runChecked(context, `${processPrefix}-head`, "internal", "git", [
      "-C",
      repositoryRoot,
      "rev-parse",
      "HEAD",
    ])
  ).stdout.trim();
  const tree = (
    await runChecked(context, `${processPrefix}-tree`, "internal", "git", [
      "-C",
      repositoryRoot,
      "rev-parse",
      "HEAD^{tree}",
    ])
  ).stdout.trim();
  const branch = (
    await runChecked(context, `${processPrefix}-branch`, "internal", "git", [
      "-C",
      repositoryRoot,
      "branch",
      "--show-current",
    ])
  ).stdout.trim();
  const statusResult = await runChecked(
    context,
    `${processPrefix}-status`,
    "internal",
    "git",
    ["-C", repositoryRoot, "status", "--porcelain=v1", "--untracked-files=all"],
  );
  if (statusResult.stdout.trim() !== "") {
    throw gateFailure(
      EXIT_CODES.CONTRACT,
      failureStage,
      `${expectedShaLabel} repository must be clean before the live R-016 gate`,
    );
  }
  const indexResult = await runChecked(
    context,
    `${processPrefix}-index`,
    "internal",
    "git",
    ["-C", repositoryRoot, "ls-files", "--stage", "-z"],
  );
  const trackedEntries = parseGitIndex(indexResult.stdout);
  const indexFlagResult = await runChecked(
    context,
    `${processPrefix}-index-flags`,
    "internal",
    "git",
    ["-C", repositoryRoot, "ls-files", "-v", "-z"],
  );
  validateGitIndexFlags(indexFlagResult.stdout);
  const trackedIndex = new Map(
    trackedEntries.map((entry) => [entry.path, entry]),
  );
  for (const [label, value] of [
    ["HEAD", head],
    ["tree", tree],
  ]) {
    if (!/^[0-9a-f]{40}$/u.test(value)) {
      throw gateFailure(
        EXIT_CODES.CONTRACT,
        failureStage,
        `${label} is not a full SHA-1 identity`,
      );
    }
  }
  const sealedExpectedSha = validateExpectedSourceSha(
    head,
    expectedSha,
    expectedShaLabel,
    requireExpectedSha,
  );
  return {
    source: {
      ...binding,
      head,
      tree,
      branch: branch || "DETACHED",
      trackedFileCount: trackedEntries.length,
      trackedIndexSha256: sha256Hex(canonicalJson(trackedEntries)),
      expectedCheckoutSha: sealedExpectedSha,
    },
    trackedIndex,
  };
}

async function inspectRepositoryBinding(
  context,
  repositoryRoot = context.root,
  processPrefix = "git",
  processSuffix = "",
) {
  const topLevel = (
    await runChecked(
      context,
      `${processPrefix}-top-level${processSuffix}`,
      "internal",
      "git",
      ["-C", repositoryRoot, "rev-parse", "--show-toplevel"],
    )
  ).stdout.trim();
  const gitDirectory = (
    await runChecked(
      context,
      `${processPrefix}-directory${processSuffix}`,
      "internal",
      "git",
      ["-C", repositoryRoot, "rev-parse", "--absolute-git-dir"],
    )
  ).stdout.trim();
  const [rootReal, topLevelReal, gitDirectoryReal] = await Promise.all([
    realpath(repositoryRoot),
    realpath(topLevel),
    realpath(gitDirectory),
  ]);
  return validateRepositoryBinding(rootReal, topLevelReal, gitDirectoryReal);
}

export function validateRepositoryBinding(root, topLevel, gitDirectory) {
  for (const [value, label] of [
    [root, "repository root"],
    [topLevel, "Git top-level"],
    [gitDirectory, "Git directory"],
  ]) {
    if (typeof value !== "string" || !path.isAbsolute(value)) {
      throw new ContractError(`${label} must be an absolute path`);
    }
  }
  if (path.relative(path.resolve(root), path.resolve(topLevel)) !== "") {
    throw new ContractError(
      "Git top-level is not the requested repository root",
    );
  }
  return {
    gitDirectory: path.resolve(gitDirectory),
    topLevel: path.resolve(topLevel),
  };
}

export function validateControlRootSeparation(targetRoot, controlRoot) {
  const target = path.resolve(targetRoot);
  const control = path.resolve(controlRoot);
  if (path.relative(target, control) === "") return true;
  for (const [parent, child] of [
    [target, control],
    [control, target],
  ]) {
    const relative = path.relative(parent, child);
    if (
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative)
    ) {
      throw new ContractError(
        "R-016 target and control repositories must not contain each other",
      );
    }
  }
  return false;
}

export function validateControlModuleRoot(controlRoot, moduleRoot) {
  const control = path.resolve(controlRoot);
  const moduleRepository = path.resolve(moduleRoot);
  if (path.relative(moduleRepository, control) !== "") {
    throw new ContractError(
      "R-016 control root must be the repository that supplied the imported runner",
    );
  }
  return moduleRepository;
}

export function validateDeclaredRepositoryRealPath(declared, resolved, label) {
  if (path.relative(path.resolve(declared), path.resolve(resolved)) !== "") {
    throw new ContractError(
      `R-016 ${label} repository path must equal its real path`,
    );
  }
  return path.resolve(resolved);
}

export function isProtectedControlPath(repositoryPath) {
  return (
    CONTROL_PROTECTED_EXACT_PATHS.has(repositoryPath) ||
    CONTROL_PROTECTED_PREFIXES.some((prefix) =>
      repositoryPath.startsWith(prefix),
    )
  );
}

export function validateProtectedControlPlane(
  targetIndex,
  controlIndex,
  splitRoot,
) {
  const select = (index, label) => {
    if (!(index instanceof Map)) {
      throw new ContractError(`${label} index is unavailable`);
    }
    return [...index.values()]
      .filter((entry) => isProtectedControlPath(entry.path))
      .map((entry) => ({
        mode: entry.mode,
        objectId: entry.objectId,
        path: entry.path,
        stage: entry.stage,
      }))
      .sort((left, right) => left.path.localeCompare(right.path, "en"));
  };
  const control = select(controlIndex, "control source");
  if (control.length === 0) {
    throw new ContractError("control-plane protected inventory is empty");
  }
  const target = select(targetIndex, "target source");
  if (splitRoot && canonicalJson(target) !== canonicalJson(control)) {
    throw new ContractError(
      "target control-plane paths, modes, stages, or Git objects differ from the trusted base",
    );
  }
  return {
    entries: control,
    protectedParitySha256: sha256Hex(canonicalJson(control)),
  };
}

async function prepareControlPlaneInputs(context) {
  const parity = validateProtectedControlPlane(
    context.trackedIndex,
    context.controlTrackedIndex,
    !context.sameSourceRoot,
  );
  const controlEntries = [...parity.entries];
  for (const repositoryPath of CONTROL_ONLY_INPUT_PATHS) {
    const entry = requireTrackedRegularFile(
      context.controlTrackedIndex,
      repositoryPath,
      `control-only input ${repositoryPath}`,
    );
    controlEntries.push({
      mode: entry.mode,
      objectId: entry.objectId,
      path: entry.path,
      stage: entry.stage,
    });
  }
  controlEntries.sort((left, right) =>
    left.path.localeCompare(right.path, "en"),
  );
  const files = [];
  for (const entry of controlEntries) {
    const bytes = await readTrackedControlInput(
      context,
      entry.path,
      `control-plane input ${entry.path}`,
    );
    files.push({
      path: entry.path,
      gitObjectId: entry.objectId,
      sha256: sha256Hex(bytes),
      size: bytes.length,
    });
  }
  return {
    mode: context.sameSourceRoot ? "same-root" : "split-root",
    files,
    inventorySha256: sha256Hex(canonicalJson(files)),
    protectedParitySha256: parity.protectedParitySha256,
  };
}

export function validateExpectedCheckoutSha(
  actual,
  expected,
  githubActions = process.env.GITHUB_ACTIONS,
  sameSourceRoot = true,
) {
  return validateExpectedSourceSha(
    actual,
    expected,
    "EXPECTED_CHECKOUT_SHA",
    expectedCheckoutShaIsRequired(sameSourceRoot, githubActions),
  );
}

export function expectedCheckoutShaIsRequired(
  sameSourceRoot,
  githubActions = process.env.GITHUB_ACTIONS,
) {
  if (typeof sameSourceRoot !== "boolean") {
    throw new ContractError("R-016 source-root mode must be a boolean");
  }
  return githubActions === "true" || !sameSourceRoot;
}

export function repositoryUseContextFromEnvironment(environment = {}) {
  const repositoryId = (name) => {
    const value = requiredEvidenceString(environment[name], name);
    if (!/^[1-9][0-9]*$/u.test(value)) {
      throw new ContractError(
        `${name} must be a positive decimal repository ID`,
      );
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
      throw new ContractError(`${name} exceeds the safe integer range`);
    }
    return parsed;
  };
  const boolean = (name) => {
    const value = requiredEvidenceString(environment[name], name);
    if (value !== "true" && value !== "false") {
      throw new ContractError(`${name} must be literal true or false`);
    }
    return value === "true";
  };
  return {
    authority: requiredEvidenceString(
      environment.R016_AUTHORITY,
      "R016_AUTHORITY",
    ),
    visibilityProof: boolean("R016_VISIBILITY_PROOF"),
    eventName: requiredEvidenceString(
      environment.R016_EVENT_NAME,
      "R016_EVENT_NAME",
    ),
    base: {
      repositoryId: repositoryId("R016_BASE_REPOSITORY_ID"),
      repositoryFullName: requiredEvidenceString(
        environment.R016_BASE_REPOSITORY_FULL_NAME,
        "R016_BASE_REPOSITORY_FULL_NAME",
      ),
      visibility: requiredEvidenceString(
        environment.R016_BASE_REPOSITORY_VISIBILITY,
        "R016_BASE_REPOSITORY_VISIBILITY",
      ),
    },
    target: {
      repositoryId: repositoryId("R016_TARGET_REPOSITORY_ID"),
      repositoryFullName: requiredEvidenceString(
        environment.R016_TARGET_REPOSITORY_FULL_NAME,
        "R016_TARGET_REPOSITORY_FULL_NAME",
      ),
      visibility: requiredEvidenceString(
        environment.R016_TARGET_REPOSITORY_VISIBILITY,
        "R016_TARGET_REPOSITORY_VISIBILITY",
      ),
      fork: boolean("R016_TARGET_REPOSITORY_FORK"),
    },
    relation: requiredEvidenceString(
      environment.R016_REPOSITORY_RELATION,
      "R016_REPOSITORY_RELATION",
    ),
  };
}

export function validateExpectedControlSha(actual, expected, required = true) {
  return validateExpectedSourceSha(
    actual,
    expected,
    "EXPECTED_CONTROL_SHA",
    required,
  );
}

function validateExpectedSourceSha(actual, expected, label, required) {
  if (typeof expected !== "string" || expected === "") {
    if (required) {
      throw new ContractError(`R-016 run requires ${label}`);
    }
    return null;
  }
  if (!/^[0-9a-f]{40}$/u.test(expected) || actual !== expected) {
    throw new ContractError(`R-016 source HEAD does not match ${label}`);
  }
  return expected;
}

async function verifySourceIdentity(context, expected) {
  await verifyGitSourceIdentity(context, expected, {
    failureStage: "source-identity-final",
    processPrefix: "git",
    repositoryRoot: context.root,
    terminalId: "R016-SOURCE-SEAL",
  });
}

async function verifyControlSourceIdentity(context, expected) {
  if (context.sameSourceRoot) {
    recordTerminalCheck(context, {
      id: "R016-CONTROL-SOURCE-SEAL",
      status: "PASS",
      head: expected.head,
      tree: expected.tree,
      sameAsTarget: true,
    });
    return;
  }
  await verifyGitSourceIdentity(context, expected, {
    failureStage: "control-source-identity-final",
    processPrefix: "git-control",
    repositoryRoot: context.controlRoot,
    terminalId: "R016-CONTROL-SOURCE-SEAL",
  });
}

async function verifyGitSourceIdentity(
  context,
  expected,
  { failureStage, processPrefix, repositoryRoot, terminalId },
) {
  const binding = await inspectRepositoryBinding(
    context,
    repositoryRoot,
    processPrefix,
    "-final",
  );
  const head = (
    await runChecked(
      context,
      `${processPrefix}-head-final`,
      "internal",
      "git",
      ["-C", repositoryRoot, "rev-parse", "HEAD"],
    )
  ).stdout.trim();
  const tree = (
    await runChecked(
      context,
      `${processPrefix}-tree-final`,
      "internal",
      "git",
      ["-C", repositoryRoot, "rev-parse", "HEAD^{tree}"],
    )
  ).stdout.trim();
  const status = await runChecked(
    context,
    `${processPrefix}-status-final`,
    "internal",
    "git",
    ["-C", repositoryRoot, "status", "--porcelain=v1", "--untracked-files=all"],
  );
  const index = await runChecked(
    context,
    `${processPrefix}-index-final`,
    "internal",
    "git",
    ["-C", repositoryRoot, "ls-files", "--stage", "-z"],
  );
  const indexFlags = await runChecked(
    context,
    `${processPrefix}-index-flags-final`,
    "internal",
    "git",
    ["-C", repositoryRoot, "ls-files", "-v", "-z"],
  );
  try {
    validateFinalSourceSnapshot(expected, {
      ...binding,
      head,
      index: index.stdout,
      indexFlags: indexFlags.stdout,
      status: status.stdout,
      tree,
    });
  } catch (error) {
    throw gateFailure(
      EXIT_CODES.CONTRACT,
      failureStage,
      "repository identity or cleanliness changed during the R-016 run",
      error,
    );
  }
  recordTerminalCheck(context, {
    id: terminalId,
    status: "PASS",
    head,
    tree,
  });
}

export function validateFinalSourceSnapshot(expected, snapshot) {
  const entries = parseGitIndex(snapshot?.index, "final git index");
  validateGitIndexFlags(snapshot?.indexFlags, "final git index flags");
  const inventorySha256 = sha256Hex(canonicalJson(entries));
  if (
    snapshot?.head !== expected?.head ||
    snapshot?.tree !== expected?.tree ||
    snapshot?.topLevel !== expected?.topLevel ||
    snapshot?.gitDirectory !== expected?.gitDirectory ||
    typeof snapshot?.status !== "string" ||
    snapshot.status.trim() !== "" ||
    entries.length !== expected?.trackedFileCount ||
    inventorySha256 !== expected?.trackedIndexSha256
  ) {
    throw new ContractError(
      "final source snapshot differs from the opening seal",
    );
  }
  return true;
}

async function loadConfiguration(context) {
  const relativePaths = CONTROL_CONFIGURATION_PATHS;
  const paths = Object.fromEntries(
    Object.entries(relativePaths).map(([name, relative]) => [
      name,
      path.join(context.controlRoot, ...relative.split("/")),
    ]),
  );
  const [policyBytes, scannerBytes, osvConfigBytes, evidenceSchemaBytes] =
    await Promise.all([
      readTrackedControlInput(
        context,
        relativePaths.policy,
        "supply-chain policy",
      ),
      readTrackedControlInput(context, relativePaths.scanners, "scanner lock"),
      readTrackedControlInput(
        context,
        relativePaths.osvConfig,
        "OSV configuration",
      ),
      readTrackedControlInput(
        context,
        relativePaths.evidenceSchema,
        "R-016 evidence schema",
      ),
    ]);
  const policy = parseStrictJson(policyBytes, "supply-chain policy");
  const scanners = parseStrictJson(scannerBytes, "scanner lock");
  const evidenceSchema = parseStrictJson(
    evidenceSchemaBytes,
    "R-016 evidence schema",
  );
  validateConfiguration(policy, scanners);
  const osvConfiguration = validateOsvConfiguration(
    osvConfigBytes.toString("utf8"),
  );
  if (
    scanners.osvConfiguration?.path !== relativePaths.osvConfig ||
    scanners.osvConfiguration?.usage !== "license-scan-only" ||
    scanners.osvConfiguration?.sha256 !== osvConfiguration.sha256
  ) {
    throw new ContractError(
      "OSV configuration identity or license-only usage differs from the lock",
    );
  }
  validateEvidenceSchema(evidenceSchema);
  context.evidenceSchema = evidenceSchema;
  context.evidence.inputs.configuration = {
    policy: relativeInput(context.controlRoot, paths.policy, policyBytes),
    scanners: relativeInput(context.controlRoot, paths.scanners, scannerBytes),
    osvConfig: relativeInput(
      context.controlRoot,
      paths.osvConfig,
      osvConfigBytes,
    ),
    evidenceSchema: relativeInput(
      context.controlRoot,
      paths.evidenceSchema,
      evidenceSchemaBytes,
    ),
  };
  context.evidenceValidation = {
    configuration: { policy, scanners },
    configurationInputs: structuredClone(context.evidence.inputs.configuration),
  };
  return {
    paths,
    policy,
    scanners,
    evidenceSchema,
    osvConfiguration,
    osvConfigBytes,
  };
}

export function validateConfiguration(policy, scanners) {
  if (policy?.schemaVersion !== 2 || policy?.gateId !== "R-016") {
    throw new ContractError(
      "supply-chain policy schema/gate identity is invalid",
    );
  }
  if (scanners?.schemaVersion !== 2) {
    throw new ContractError("scanner lock schema identity is invalid");
  }
  if (policy.runtime?.nodeVersion !== "24.20.0") {
    throw new ContractError("R-016 Node runtime lock must be 24.20.0");
  }
  const exitPolicy = policy.normalizedExitCodes;
  for (const [name, expected] of [
    ["pass", EXIT_CODES.PASS],
    ["finding", EXIT_CODES.FINDING],
    ["contract", EXIT_CODES.CONTRACT],
    ["internalOrTimeout", EXIT_CODES.INTERNAL],
    ["externalAcquisition", EXIT_CODES.ACQUISITION],
  ]) {
    if (exitPolicy?.[name] !== expected) {
      throw new ContractError(
        `normalized exit policy ${name} must be ${expected}`,
      );
    }
  }
  if (exitPolicy?.usage !== 64) {
    throw new ContractError("normalized usage exit must be 64");
  }
  if (policy.pnpm?.lockfileVersion !== "9.0") {
    throw new ContractError("pnpm lockfileVersion policy must be 9.0");
  }
  if (
    !Number.isSafeInteger(policy.pnpm?.expectedDocumentCount) ||
    policy.pnpm.expectedDocumentCount <= 0
  ) {
    throw new ContractError("pnpm document count policy is invalid");
  }
  assertExactStringSet(
    policy.pnpm.requiredDirectScopes,
    DIRECT_SCOPE_NAMES,
    "pnpm direct scope policy",
  );
  if (policy.vulnerabilities?.scope !== "all") {
    throw new ContractError("vulnerability scope policy must be all");
  }
  if (
    policy.vulnerabilities?.unknownScope !== "scan-and-block" ||
    policy.vulnerabilities?.unknownSeverity !== "block"
  ) {
    throw new ContractError(
      "vulnerability unknown scope/severity must fail closed",
    );
  }
  if (
    !Array.isArray(policy.licenses?.allowed) ||
    policy.licenses.allowed.length === 0 ||
    !Array.isArray(policy.licenses?.denied) ||
    policy.licenses.denied.length === 0 ||
    policy.licenses?.unknown !== "block"
  ) {
    throw new ContractError(
      "license policy must use an explicit fail-closed allowlist",
    );
  }
  assertUniqueStringArray(policy.licenses.allowed, "license allowlist");
  assertUniqueStringArray(policy.licenses.denied, "license denylist");
  const denied = new Set(policy.licenses.denied);
  const overlap = policy.licenses.allowed.filter((license) =>
    denied.has(license),
  );
  if (overlap.length !== 0) {
    throw new ContractError(
      `license allow/deny policy overlaps: ${overlap.join(", ")}`,
    );
  }
  if (policy.vulnerabilities.minimumBlockingCvss !== 7) {
    throw new ContractError(
      "vulnerability blocking threshold must remain CVSS 7.0",
    );
  }
  if (
    policy.advisoryDatabase?.maxCompressedDownloadBytes !== 536_870_912 ||
    !Number.isSafeInteger(
      policy.advisoryDatabase?.maxCompressedDownloadBytes,
    ) ||
    policy.advisoryDatabase.maxCompressedDownloadBytes <= 0
  ) {
    throw new ContractError(
      "advisory database compressed download limit must be 536870912 bytes",
    );
  }
  assertExactStringSet(
    Object.keys(policy.sast?.requiredLanguageGroups ?? {}),
    ["go", "javascript-typescript"],
    "SAST language groups",
  );
  assertExactStringSet(
    policy.sast.requiredLanguageGroups.go,
    [".go"],
    "SAST Go extensions",
  );
  assertExactStringSet(
    policy.sast.requiredLanguageGroups["javascript-typescript"],
    [".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"],
    "SAST JavaScript/TypeScript extensions",
  );
  if (
    policy.sast.findings !== "block" ||
    policy.sast.errors !== "block" ||
    policy.sast.zeroCoverage !== "block"
  ) {
    throw new ContractError("SAST policy must remain fail closed");
  }
  assertExactStringSet(
    Object.keys(policy.timeoutsSeconds ?? {}),
    ["artifactAcquisition", "dockerPull", "gitRulesFetch", "scanner"],
    "timeout policy keys",
  );
  for (const [name, seconds] of Object.entries(policy.timeoutsSeconds)) {
    if (!Number.isSafeInteger(seconds) || seconds <= 0 || seconds > 3_600) {
      throw new ContractError(
        `timeout policy ${name} must be a positive integer no greater than 3600 seconds`,
      );
    }
  }
  validateImageLock(scanners.osvScanner, "OSV Scanner");
  validateImageLock(scanners.semgrep, "Semgrep");
  validateImageLock(scanners.goToolchainImage, "Go toolchain");
  if (
    scanners.osvConfiguration?.path !== "security/osv-scanner.toml" ||
    scanners.osvConfiguration?.usage !== "license-scan-only"
  ) {
    throw new ContractError(
      "OSV configuration lock must be restricted to the license scan",
    );
  }
  validateHexDigest(
    scanners.osvConfiguration.sha256,
    64,
    "OSV configuration SHA-256",
  );
  if (scanners.semgrep.executionMode !== "community-edition-oss-only") {
    throw new ContractError("Semgrep must be forced to the OSS-only engine");
  }
  if (scanners.semgrep.engineLicense !== "LGPL-2.1-or-later") {
    throw new ContractError(
      "Semgrep engine license lock must be LGPL-2.1-or-later",
    );
  }
  if (
    scanners.semgrep.imageSourceRepository !==
      "https://github.com/semgrep/semgrep-proprietary" ||
    scanners.semgrep.imageSourceRevision !==
      "7e8860911435ba7be8ac783df98da39d7f99c702"
  ) {
    throw new ContractError(
      "Semgrep OCI packaging source labels must match the exact lock",
    );
  }
  const databases = scanners.advisoryDatabases;
  if (!Array.isArray(databases) || databases.length !== 2) {
    throw new ContractError(
      "scanner lock must contain exactly npm and Go databases",
    );
  }
  assertExactStringSet(
    databases.map((database) => database?.ecosystem),
    ["npm", "Go"],
    "OSV database ecosystems",
  );
  const cachePaths = Object.fromEntries(
    databases.map((database) => [database.ecosystem, database.cachePath]),
  );
  const urls = Object.fromEntries(
    databases.map((database) => [database.ecosystem, database.url]),
  );
  if (
    cachePaths.npm !== "osv-scalibr/npm/all.zip" ||
    cachePaths.Go !== "osv-scalibr/Go/all.zip"
  ) {
    throw new ContractError(
      "OSV databases must use the v2.5.1 osv-scalibr cache paths",
    );
  }
  if (
    urls.npm !==
      "https://storage.googleapis.com/osv-vulnerabilities/npm/all.zip" ||
    urls.Go !== "https://storage.googleapis.com/osv-vulnerabilities/Go/all.zip"
  ) {
    throw new ContractError(
      "OSV databases must use the locked official GCS endpoints",
    );
  }
  if (
    scanners.semgrepRules?.repository !==
    "https://github.com/semgrep/semgrep-rules.git"
  ) {
    throw new ContractError(
      "Semgrep rules must use the locked official repository",
    );
  }
  const ruleLicense = scanners.semgrepRules?.license;
  assertExactStringSet(
    Object.keys(ruleLicense ?? {}),
    ["path", "sha256", "name", "usage", "publicDistribution"],
    "Semgrep rule license keys",
  );
  if (
    ruleLicense.path !== "LICENSE" ||
    ruleLicense.name !== "Semgrep Rules License v1.0" ||
    ruleLicense.usage !== "owner-controlled-internal-ci" ||
    ruleLicense.publicDistribution !== "prohibited"
  ) {
    throw new ContractError(
      "Semgrep rule license use differs from the locked no-distribution contract",
    );
  }
  validateHexDigest(ruleLicense.sha256, 64, "Semgrep rule license SHA-256");
  validateRepositoryUseBoundary(scanners.semgrepRules.useBoundary);
  if (
    !Array.isArray(scanners.semgrepRules?.files) ||
    scanners.semgrepRules.files.length === 0
  ) {
    throw new ContractError("Semgrep rule lock must contain explicit files");
  }
  const rulePaths = new Set();
  for (const rule of scanners.semgrepRules.files) {
    validateRelativePosixPath(rule?.path, "Semgrep rule path");
    validateHexDigest(rule?.sha256, 64, `Semgrep rule ${rule.path} SHA-256`);
    if (rulePaths.has(rule.path)) {
      throw new ContractError(`duplicate Semgrep rule path ${rule.path}`);
    }
    rulePaths.add(rule.path);
  }
  return true;
}

function validateEvidenceSchema(schema) {
  if (
    schema?.$schema !== "https://json-schema.org/draft/2020-12/schema" ||
    schema?.$id !==
      "https://hedefora.com/schemas/security/r016-evidence.schema.json" ||
    schema?.properties?.schemaVersion?.const !== 2 ||
    schema?.properties?.gateId?.const !== "R-016" ||
    !Array.isArray(schema.required)
  ) {
    throw new ContractError("R-016 evidence schema identity is invalid");
  }
  assertExactStringSet(
    schema.required,
    [
      "schemaVersion",
      "gateId",
      "runId",
      "status",
      "startedAt",
      "finishedAt",
      "exitCode",
      "source",
      "controlSource",
      "inputs",
      "environment",
      "tools",
      "advisoryDatabases",
      "checks",
      "rawArtifacts",
    ],
    "R-016 evidence schema required fields",
  );
  return true;
}

function validateImageLock(lock, label) {
  if (!lock || typeof lock.image !== "string") {
    throw new ContractError(`${label} image lock is missing`);
  }
  validateHexDigest(
    lock.indexDigest?.replace(/^sha256:/u, ""),
    64,
    `${label} index digest`,
  );
  validateHexDigest(
    lock.linuxAmd64Digest?.replace(/^sha256:/u, ""),
    64,
    `${label} linux/amd64 digest`,
  );
  if (!lock.image.endsWith(`@${lock.indexDigest}`)) {
    throw new ContractError(`${label} image must end with its index digest`);
  }
}

function validateRelativePosixPath(value, label) {
  if (
    typeof value !== "string" ||
    value === "" ||
    value.includes("\\") ||
    POSIX.isAbsolute(value) ||
    POSIX.normalize(value) !== value ||
    value.startsWith("../") ||
    value.includes("/../")
  ) {
    throw new ContractError(
      `${label} is not a canonical repository-relative path`,
    );
  }
}

function assertExactStringSet(actual, expected, label) {
  if (
    !Array.isArray(actual) ||
    !actual.every((entry) => typeof entry === "string")
  ) {
    throw new ContractError(`${label} must be a string array`);
  }
  const left = [...new Set(actual)].sort();
  const right = [...new Set(expected)].sort();
  if (
    left.length !== actual.length ||
    canonicalJson(left) !== canonicalJson(right)
  ) {
    throw new ContractError(`${label} does not match the supported exact set`);
  }
}

function assertUniqueStringArray(actual, label) {
  if (
    !Array.isArray(actual) ||
    actual.length === 0 ||
    !actual.every(
      (entry) =>
        typeof entry === "string" && entry !== "" && entry === entry.trim(),
    ) ||
    new Set(actual).size !== actual.length
  ) {
    throw new ContractError(`${label} must be a nonempty unique string array`);
  }
}

async function inspectExecutionEnvironment(context, configuration) {
  validateNodeRuntimeVersion(
    process.version,
    configuration.policy.runtime.nodeVersion,
  );
  const dockerVersion = await runChecked(
    context,
    "docker-version",
    "internal",
    "docker",
    ["version", "--format", "{{json .}}"],
    { timeoutMs: configuration.policy.timeoutsSeconds.dockerPull * 1_000 },
  );
  const docker = parseStrictJson(
    dockerVersion.stdout,
    "Docker version identity",
  );
  const clientVersion = requiredEvidenceString(
    docker?.Client?.Version,
    "Docker client version",
  );
  const serverVersion = requiredEvidenceString(
    docker?.Server?.Version,
    "Docker server version",
  );
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
  context.evidence.environment = {
    runtime: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
    },
    runner,
    docker: {
      clientVersion,
      serverVersion,
      clientPlatform: docker.Client?.Platform?.Name ?? null,
      serverOs: docker.Server?.Os ?? null,
      serverArchitecture: docker.Server?.Arch ?? null,
      versionDocumentSha256: sha256Hex(canonicalJson(docker)),
    },
    executables: structuredClone(context.trustedExecutableSeals),
  };
  context.dockerEnvironmentSeal = {
    document: structuredClone(docker),
    stdoutSha256: sha256Hex(dockerVersion.stdoutBytes),
    stdoutSize: dockerVersion.stdoutBytes.length,
  };
  context.environmentSeal = structuredClone(context.evidence.environment);
  recordTerminalCheck(context, {
    id: "R016-EXECUTION-ENVIRONMENT",
    status: "PASS",
    runtime: context.evidence.environment.runtime,
    docker: context.evidence.environment.docker,
    executables: context.evidence.environment.executables,
  });
}

export function validateNodeRuntimeVersion(actual, locked) {
  if (actual !== `v${locked}`) {
    throw new ContractError(
      `R-016 requires Node v${locked}; current runtime is ${String(actual)}`,
    );
  }
  return true;
}

async function prepareInputs(context, configuration) {
  const lockPath = path.join(context.root, "pnpm-lock.yaml");
  const lockBytes = await readTrackedInput(
    context,
    "pnpm-lock.yaml",
    "pnpm lockfile",
  );
  const lockText = lockBytes.toString("utf8");
  if (!Buffer.from(lockText, "utf8").equals(lockBytes)) {
    throw gateFailure(
      EXIT_CODES.CONTRACT,
      "pnpm-inventory",
      "pnpm lockfile must be valid UTF-8",
    );
  }
  const pnpm = parsePnpmLockInventory(lockText, {
    source: "pnpm-lock.yaml",
    expectedLockfileVersion: configuration.policy.pnpm.lockfileVersion,
  });
  if (pnpm.documentCount !== configuration.policy.pnpm.expectedDocumentCount) {
    throw gateFailure(
      EXIT_CODES.CONTRACT,
      "pnpm-inventory",
      `pnpm document count ${pnpm.documentCount} differs from policy ${configuration.policy.pnpm.expectedDocumentCount}`,
    );
  }
  if (pnpm.scopeCounts.unknown !== 0) {
    throw gateFailure(
      EXIT_CODES.CONTRACT,
      "pnpm-inventory",
      `pnpm importer inventory contains ${pnpm.scopeCounts.unknown} unknown-scope entries`,
    );
  }

  const scanInputRoot = path.join(context.temporaryRoot, "scan-input");
  await mkdir(scanInputRoot, { recursive: true });
  const documentInputs = [];
  for (const document of pnpm.documents) {
    const hostDirectory = path.join(
      scanInputRoot,
      `pnpm-document-${document.documentNumber}`,
    );
    const hostPath = path.join(hostDirectory, "pnpm-lock.yaml");
    const containerPath = `/scan/pnpm-document-${document.documentNumber}/pnpm-lock.yaml`;
    await mkdir(hostDirectory, { recursive: false });
    await writeFile(hostPath, document.text, { flag: "wx", mode: 0o644 });
    documentInputs.push({
      documentNumber: document.documentNumber,
      hostPath,
      containerPath,
      packageCount: document.packageCount,
      packages: document.packages.map(({ name, version }) => ({
        name,
        version,
      })),
      sha256: sha256Hex(document.text),
    });
  }
  await writeFile(
    path.join(scanInputRoot, "osv-scanner.toml"),
    configuration.osvConfigBytes,
    { flag: "wx", mode: 0o444 },
  );

  const trackedGo = await listTrackedGoInputs(context);
  context.evidence.inputs.pnpm = {
    source: relativeInput(context.root, lockPath, lockBytes),
    documentCount: pnpm.documentCount,
    packageCount: pnpm.packageCount,
    directDependencyCount: pnpm.directDependencies.length,
    scopeCounts: pnpm.scopeCounts,
    documents: documentInputs.map(
      ({ documentNumber, containerPath, packageCount, sha256 }) => ({
        documentNumber,
        source: containerPath,
        packageCount,
        sha256,
      }),
    ),
  };
  return {
    pnpm,
    documentInputs,
    scanInputRoot,
    goManifests: trackedGo.goManifests,
  };
}

async function prepareSemgrepSourceInputs(context, configuration) {
  const selection = selectTrackedSourceFiles(
    [...context.trackedIndex.values()],
    configuration.policy.sast.requiredLanguageGroups,
  );
  const sourceRoot = path.join(context.temporaryRoot, "semgrep-source");
  await mkdir(sourceRoot, { recursive: false });
  const files = [];
  for (const entry of selection.files) {
    const bytes = await readTrackedInput(
      context,
      entry.path,
      `Semgrep source ${entry.path}`,
    );
    const destination = path.join(sourceRoot, ...entry.path.split("/"));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes, { flag: "wx", mode: 0o444 });
    files.push({
      path: entry.path,
      languageGroup: entry.languageGroup,
      gitObjectId: entry.objectId,
      sha256: sha256Hex(bytes),
      size: bytes.length,
    });
  }
  context.evidence.inputs.semgrepSources = {
    fileCount: files.length,
    groupCounts: selection.groupCounts,
    inventorySha256: sha256Hex(canonicalJson(files)),
    files,
  };
  return {
    root: sourceRoot,
    repositoryPaths: files.map((entry) => entry.path),
  };
}

async function listTrackedGoInputs(context) {
  const tracked = [...context.trackedIndex.keys()].filter((entry) =>
    ["go.mod", "go.sum", "go.work"].includes(POSIX.basename(entry)),
  );
  const workspaces = tracked.filter(
    (entry) => POSIX.basename(entry) === "go.work",
  );
  if (workspaces.length !== 0) {
    throw gateFailure(
      EXIT_CODES.CONTRACT,
      "go-inventory",
      `tracked go.work requires an explicit scanner contract: ${workspaces.join(", ")}`,
    );
  }
  const goManifests = tracked.filter(
    (entry) => POSIX.basename(entry) === "go.mod",
  );
  if (goManifests.length === 0) {
    throw gateFailure(
      EXIT_CODES.CONTRACT,
      "go-inventory",
      "no tracked go.mod manifest was found",
    );
  }
  for (const manifest of goManifests) {
    validateRelativePosixPath(manifest, "go.mod path");
    requireTrackedRegularFile(context.trackedIndex, manifest, manifest);
  }
  const allowedSums = new Set(
    goManifests.map((manifest) =>
      POSIX.join(POSIX.dirname(manifest), "go.sum"),
    ),
  );
  const orphanSums = tracked.filter(
    (entry) => POSIX.basename(entry) === "go.sum" && !allowedSums.has(entry),
  );
  if (orphanSums.length !== 0) {
    throw gateFailure(
      EXIT_CODES.CONTRACT,
      "go-inventory",
      `orphan tracked go.sum files are unsupported: ${orphanSums.join(", ")}`,
    );
  }
  for (const sum of tracked.filter(
    (entry) => POSIX.basename(entry) === "go.sum",
  )) {
    requireTrackedRegularFile(context.trackedIndex, sum, sum);
  }
  return { goManifests };
}

async function acquireImages(context, configuration) {
  const scanners = configuration.scanners;
  context.toolExecutionSeals = Object.create(null);
  for (const [name, lock, versionArguments, versionOptions] of [
    [
      "osv-scanner",
      scanners.osvScanner,
      ["--version"],
      { user: "65534:65534" },
    ],
    [
      "semgrep-ce",
      scanners.semgrep,
      ["semgrep", "--version"],
      { env: semgrepEnvironment() },
    ],
    [
      "go-toolchain",
      scanners.goToolchainImage,
      ["go", "version"],
      { user: "65534:65534" },
    ],
  ]) {
    await runChecked(
      context,
      `${name}-pull`,
      "acquisition",
      "docker",
      ["pull", "--platform", "linux/amd64", lock.image],
      {
        timeoutMs: configuration.policy.timeoutsSeconds.dockerPull * 1_000,
      },
    );
    const inspectResult = await runChecked(
      context,
      `${name}-inspect`,
      "internal",
      "docker",
      ["image", "inspect", lock.image],
    );
    const inspection = parseStrictJson(
      inspectResult.stdout,
      `${name} image inspection`,
    );
    validateImageInspection(inspection, lock, name);
    const indexResult = await runChecked(
      context,
      `${name}-index`,
      "acquisition",
      "docker",
      ["manifest", "inspect", lock.image],
      {
        timeoutMs: configuration.policy.timeoutsSeconds.dockerPull * 1_000,
      },
    );
    const indexDocument = parseStrictJson(
      indexResult.stdout,
      `${name} OCI index`,
    );
    validateImageIndex(indexDocument, lock, name);
    const versionResult = await runDocker(
      context,
      `${name}-version`,
      lock.image,
      versionArguments,
      {
        network: "none",
        memory: "256m",
        timeoutMs: configuration.policy.timeoutsSeconds.scanner * 1_000,
        ...versionOptions,
      },
    );
    requireRawExit(versionResult, [0], `${name} version`);
    const versionOutput = `${versionResult.stdout}\n${versionResult.stderr}`;
    if (!versionOutput.includes(lock.version)) {
      throw gateFailure(
        EXIT_CODES.CONTRACT,
        "tool-identity",
        `${name} runtime output does not contain locked version ${lock.version}`,
      );
    }
    context.evidence.tools[name] = {
      image: lock.image,
      indexDigest: lock.indexDigest,
      linuxAmd64Digest: lock.linuxAmd64Digest,
      runtimeVersion: lock.version,
      runtimeUser:
        versionOptions.user ?? inspection[0]?.Config?.User ?? "UNSPECIFIED",
      sourceRepository:
        inspection[0]?.Config?.Labels?.["org.opencontainers.image.source"] ??
        null,
      sourceRevision:
        inspection[0]?.Config?.Labels?.["org.opencontainers.image.revision"] ??
        null,
      inspectionSha256: sha256Hex(canonicalJson(inspection)),
      indexDocumentSha256: sha256Hex(canonicalJson(indexDocument)),
    };
    context.toolExecutionSeals[name] = {
      inspection: structuredClone(inspection),
      inspectionStdoutSha256: sha256Hex(inspectResult.stdoutBytes),
      inspectionStdoutSize: inspectResult.stdoutBytes.length,
      indexDocument: structuredClone(indexDocument),
      indexStdoutSha256: sha256Hex(indexResult.stdoutBytes),
      indexStdoutSize: indexResult.stdoutBytes.length,
      versionStderrSha256: sha256Hex(versionResult.stderrBytes),
      versionStderrSize: versionResult.stderrBytes.length,
      versionStdoutSha256: sha256Hex(versionResult.stdoutBytes),
      versionStdoutSize: versionResult.stdoutBytes.length,
    };
  }
}

export function validateImageInspection(inspection, lock, label = "image") {
  if (!Array.isArray(inspection) || inspection.length !== 1) {
    throw new ContractError(
      `${label} inspection must contain exactly one image`,
    );
  }
  const image = inspection[0];
  if (image?.Architecture !== "amd64" || image?.Os !== "linux") {
    throw new ContractError(`${label} must resolve to linux/amd64`);
  }
  const repositoryDigests = image.RepoDigests;
  if (
    !Array.isArray(repositoryDigests) ||
    !repositoryDigests.some((digest) => digest.endsWith(`@${lock.indexDigest}`))
  ) {
    throw new ContractError(
      `${label} inspection does not contain its locked index digest`,
    );
  }
  if (
    lock.imageSourceRepository !== undefined ||
    lock.imageSourceRevision !== undefined
  ) {
    if (
      image.Config?.Labels?.["org.opencontainers.image.source"] !==
        lock.imageSourceRepository ||
      image.Config?.Labels?.["org.opencontainers.image.revision"] !==
        lock.imageSourceRevision
    ) {
      throw new ContractError(
        `${label} OCI source labels differ from the packaging lock`,
      );
    }
  }
  if (
    lock.sourceCommit &&
    label === "osv-scanner" &&
    image.Config?.Labels?.["org.opencontainers.image.revision"] !==
      lock.sourceCommit
  ) {
    throw new ContractError(
      `${label} source revision label differs from the lock`,
    );
  }
  if (label === "semgrep-ce") {
    const configuredUser = image.Config?.User;
    if (
      typeof configuredUser !== "string" ||
      configuredUser === "" ||
      /^(?:0|0:0|root|root:root)$/iu.test(configuredUser)
    ) {
      throw new ContractError(
        `${label} image must configure an explicit non-root user`,
      );
    }
  }
  return true;
}

const IMAGE_INDEX_CHILD_MEDIA_TYPES = Object.freeze({
  "application/vnd.docker.distribution.manifest.list.v2+json":
    "application/vnd.docker.distribution.manifest.v2+json",
  "application/vnd.oci.image.index.v1+json":
    "application/vnd.oci.image.manifest.v1+json",
});
const LOWERCASE_SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/u;

export function validateImageIndex(document, lock, label = "image") {
  if (
    document === null ||
    typeof document !== "object" ||
    Array.isArray(document) ||
    document.schemaVersion !== 2
  ) {
    throw new ContractError(
      `${label} image index schemaVersion must be exactly 2`,
    );
  }
  const expectedChildMediaType =
    IMAGE_INDEX_CHILD_MEDIA_TYPES[document.mediaType];
  if (expectedChildMediaType === undefined) {
    throw new ContractError(`${label} image index mediaType is invalid`);
  }
  if (!Array.isArray(document.manifests)) {
    throw new ContractError(`${label} image index manifests must be an array`);
  }
  const concretePlatforms = new Set();
  const linuxAmd64 = [];
  for (const [index, manifest] of document.manifests.entries()) {
    const descriptorLabel = `${label} image index descriptor ${index}`;
    if (
      manifest === null ||
      typeof manifest !== "object" ||
      Array.isArray(manifest)
    ) {
      throw new ContractError(`${descriptorLabel} must be an object`);
    }
    if (manifest.mediaType !== expectedChildMediaType) {
      throw new ContractError(
        `${descriptorLabel} mediaType is not a direct compatible image manifest`,
      );
    }
    if (!LOWERCASE_SHA256_DIGEST.test(manifest.digest)) {
      throw new ContractError(`${descriptorLabel} digest is invalid`);
    }
    if (!Number.isSafeInteger(manifest.size) || manifest.size <= 0) {
      throw new ContractError(`${descriptorLabel} size is invalid`);
    }
    if (
      manifest.platform === null ||
      typeof manifest.platform !== "object" ||
      Array.isArray(manifest.platform)
    ) {
      throw new ContractError(`${descriptorLabel} platform must be an object`);
    }
    if (
      typeof manifest.platform.architecture !== "string" ||
      manifest.platform.architecture === ""
    ) {
      throw new ContractError(
        `${descriptorLabel} platform architecture must be a nonempty string`,
      );
    }
    if (
      typeof manifest.platform.os !== "string" ||
      manifest.platform.os === ""
    ) {
      throw new ContractError(
        `${descriptorLabel} platform OS must be a nonempty string`,
      );
    }
    if (
      manifest.platform.variant !== undefined &&
      (typeof manifest.platform.variant !== "string" ||
        manifest.platform.variant === "")
    ) {
      throw new ContractError(
        `${descriptorLabel} platform variant must be a nonempty string`,
      );
    }
    const isUnknownPlatformSentinel =
      manifest.platform.os === "unknown" &&
      manifest.platform.architecture === "unknown" &&
      manifest.platform.variant === undefined;
    if (!isUnknownPlatformSentinel) {
      const platformKey = canonicalJson([
        manifest.platform.os,
        manifest.platform.architecture,
        manifest.platform.variant ?? null,
      ]);
      if (concretePlatforms.has(platformKey)) {
        throw new ContractError(
          `${label} image index contains a duplicate concrete platform`,
        );
      }
      concretePlatforms.add(platformKey);
    }
    if (
      manifest.platform.architecture === "amd64" &&
      manifest.platform.os === "linux"
    ) {
      linuxAmd64.push(manifest);
    }
  }
  if (
    linuxAmd64.length !== 1 ||
    linuxAmd64[0].digest !== lock.linuxAmd64Digest
  ) {
    throw new ContractError(
      `${label} image index linux/amd64 manifest differs from the scanner lock`,
    );
  }
  return true;
}

async function acquireRules(context, configuration) {
  const lock = configuration.scanners.semgrepRules;
  const rulesRoot = path.join(context.temporaryRoot, "semgrep-rules");
  await mkdir(rulesRoot, { recursive: false });
  await runChecked(context, "rules-git-init", "internal", "git", [
    "-C",
    rulesRoot,
    "init",
    "--quiet",
  ]);
  await runChecked(context, "rules-git-remote", "internal", "git", [
    "-C",
    rulesRoot,
    "remote",
    "add",
    "origin",
    lock.repository,
  ]);
  await runChecked(
    context,
    "rules-git-fetch",
    "acquisition",
    "git",
    [
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
    {
      timeoutMs: configuration.policy.timeoutsSeconds.gitRulesFetch * 1_000,
    },
  );
  const commit = (
    await runChecked(context, "rules-commit", "internal", "git", [
      "-C",
      rulesRoot,
      "rev-parse",
      "FETCH_HEAD",
    ])
  ).stdout.trim();
  const tree = (
    await runChecked(context, "rules-tree", "internal", "git", [
      "-C",
      rulesRoot,
      "rev-parse",
      "FETCH_HEAD^{tree}",
    ])
  ).stdout.trim();
  if (commit !== lock.commit || tree !== lock.tree) {
    throw gateFailure(
      EXIT_CODES.CONTRACT,
      "rules-identity",
      `rules commit/tree mismatch (${commit}/${tree})`,
    );
  }
  const stagedRulesRoot = path.join(
    context.temporaryRoot,
    "semgrep-rules-stage",
  );
  await mkdir(stagedRulesRoot, { recursive: false });
  const verifiedFiles = [];
  for (const entry of [...lock.files, lock.license]) {
    const blobResult = await runChecked(
      context,
      `rule-blob-${sha256Hex(entry.path).slice(0, 20)}`,
      "internal",
      "git",
      ["-C", rulesRoot, "cat-file", "blob", `${commit}:${entry.path}`],
      {
        artifactView: trackedBlobArtifactView,
        maxOutputBytes: 16 * 1024 * 1024,
      },
    );
    const bytes = Buffer.from(blobResult.stdoutBytes);
    const sha256 = sha256Hex(bytes);
    if (sha256 !== entry.sha256) {
      throw gateFailure(
        EXIT_CODES.CONTRACT,
        "rules-identity",
        `${entry.path} SHA-256 differs from the lock`,
      );
    }
    const stagedPath = path.join(stagedRulesRoot, ...entry.path.split("/"));
    await mkdir(path.dirname(stagedPath), { recursive: true });
    await writeFile(stagedPath, bytes, { flag: "wx", mode: 0o444 });
    verifiedFiles.push({ path: entry.path, sha256, size: bytes.length });
  }
  context.evidence.inputs.semgrepRules = {
    repository: lock.repository,
    commit,
    tree,
    license: lock.license,
    files: verifiedFiles,
    manifestSha256: sha256Hex(canonicalJson(verifiedFiles)),
  };
  return { root: stagedRulesRoot, lock, verifiedFiles };
}

async function resolveGoInventory(
  context,
  configuration,
  manifests,
  scanInputRoot,
) {
  const scanners = configuration.scanners;
  const moduleCache = path.join(context.temporaryRoot, "go-module-cache");
  const buildCache = path.join(context.temporaryRoot, "go-build-cache");
  await Promise.all([
    mkdir(moduleCache, { recursive: false }),
    mkdir(buildCache, { recursive: false }),
  ]);
  await Promise.all([chmod(moduleCache, 0o777), chmod(buildCache, 0o777)]);
  const resolved = [];
  for (const [manifestIndex, manifest] of manifests.entries()) {
    const stagedDirectoryName = `go-module-${manifestIndex + 1}`;
    const stagedDirectory = path.join(scanInputRoot, stagedDirectoryName);
    await mkdir(stagedDirectory, { recursive: false });
    const goModBytes = await readTrackedInput(context, manifest, manifest);
    await writeFile(path.join(stagedDirectory, "go.mod"), goModBytes, {
      flag: "wx",
      mode: 0o444,
    });
    const sumPath = POSIX.join(POSIX.dirname(manifest), "go.sum");
    let goSumSha256 = null;
    if (context.trackedIndex.has(sumPath)) {
      const goSumBytes = await readTrackedInput(context, sumPath, sumPath);
      await writeFile(path.join(stagedDirectory, "go.sum"), goSumBytes, {
        flag: "wx",
        mode: 0o444,
      });
      goSumSha256 = sha256Hex(goSumBytes);
    }
    const commonOptions = {
      memory: "768m",
      timeoutMs: configuration.policy.timeoutsSeconds.scanner * 1_000,
      user: "65534:65534",
      workdir: "/module",
      mounts: [
        dockerMount(stagedDirectory, "/module", true),
        dockerMount(moduleCache, "/gomodcache", false),
        dockerMount(buildCache, "/gocache", false),
      ],
      env: {
        ...goModuleEnvironment(),
        GOCACHE: "/gocache",
        GOMODCACHE: "/gomodcache",
      },
    };
    const editResult = await runDocker(
      context,
      `go-mod-edit-${safeArtifactName(manifest)}`,
      scanners.goToolchainImage.image,
      ["go", "mod", "edit", "-json"],
      { ...commonOptions, network: "none" },
    );
    requireRawExit(editResult, [0], `go mod edit ${manifest}`);
    const editDocument = parseStrictJson(
      editResult.stdout,
      `go mod edit ${manifest}`,
    );
    const editIdentity = validateGoModEdit(editDocument, manifest);
    const result = await runDocker(
      context,
      `go-list-${safeArtifactName(manifest)}`,
      scanners.goToolchainImage.image,
      ["go", "list", "-mod=readonly", "-m", "-json", "all"],
      {
        ...commonOptions,
        network: "bridge",
      },
    );
    requireRawExit(result, [0], `go list ${manifest}`);
    const modules = parseJsonSequence(result.stdout, `go list ${manifest}`);
    if (
      modules.length === 0 ||
      modules.filter((module) => module?.Main === true).length !== 1
    ) {
      throw gateFailure(
        EXIT_CODES.CONTRACT,
        "go-inventory",
        `${manifest} must resolve exactly one main module`,
      );
    }
    const mainModule = modules.find((module) => module.Main === true);
    if (mainModule.Path !== editIdentity.modulePath) {
      throw gateFailure(
        EXIT_CODES.CONTRACT,
        "go-inventory",
        `${manifest} main module differs between go mod edit and go list`,
      );
    }
    const thirdParty = [];
    for (const [index, module] of modules.entries()) {
      if (!module || typeof module.Path !== "string" || module.Path === "") {
        throw gateFailure(
          EXIT_CODES.CONTRACT,
          "go-inventory",
          `${manifest} module ${index} has no path`,
        );
      }
      if (module.Replace !== undefined) {
        throw gateFailure(
          EXIT_CODES.CONTRACT,
          "go-inventory",
          `${manifest} contains unsupported replace for ${module.Path}`,
        );
      }
      if (module.Main === true) continue;
      if (typeof module.Version !== "string" || module.Version === "") {
        throw gateFailure(
          EXIT_CODES.CONTRACT,
          "go-inventory",
          `${manifest} third-party module ${module.Path} has no exact version`,
        );
      }
      thirdParty.push({
        ecosystem: "Go",
        name: module.Path,
        version: module.Version,
        scope: "unknown",
      });
    }
    resolved.push({
      manifest,
      containerPath: `/scan/${stagedDirectoryName}/go.mod`,
      mainModule: mainModule.Path,
      discoveredModuleCount: modules.length,
      thirdParty,
      goModSha256: sha256Hex(goModBytes),
      goSumSha256,
      editIdentity,
    });
  }
  return resolved;
}

export function parseJsonSequence(text, label = "JSON sequence") {
  if (typeof text !== "string" || text.trim() === "") {
    throw new ContractError(`${label} is empty`);
  }
  const documents = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (start === -1) {
      if (/\s/u.test(character)) continue;
      if (character !== "{") {
        throw new ContractError(
          `${label} contains non-object data at byte ${index}`,
        );
      }
      start = index;
      depth = 1;
      continue;
    }
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth < 0) {
        throw new ContractError(`${label} has an unexpected closing brace`);
      }
      if (depth === 0) {
        documents.push(
          parseStrictJson(
            text.slice(start, index + 1),
            `${label}[${documents.length}]`,
          ),
        );
        start = -1;
      }
    }
  }
  if (start !== -1 || depth !== 0 || inString) {
    throw new ContractError(`${label} ends with an incomplete JSON object`);
  }
  return documents;
}

function summarizeGoInventory(inventory) {
  return inventory.map(
    ({
      manifest,
      containerPath,
      mainModule,
      discoveredModuleCount,
      thirdParty,
      goModSha256,
      goSumSha256,
      editIdentity,
    }) => ({
      manifest,
      source: containerPath,
      mainModule,
      discoveredModuleCount,
      thirdPartyModuleCount: thirdParty.length,
      goModSha256,
      goSumSha256,
      editIdentity,
      inventorySha256: sha256Hex(canonicalJson(thirdParty)),
    }),
  );
}

async function runOsvMissingDatabaseNegativeGate(
  context,
  configuration,
  inventory,
) {
  const emptyCache = path.join(context.temporaryRoot, "osv-empty-cache");
  await mkdir(emptyCache, { recursive: false });
  await Promise.all([
    mkdir(path.join(emptyCache, "osv-scalibr", "npm"), { recursive: true }),
    mkdir(path.join(emptyCache, "osv-scalibr", "Go"), { recursive: true }),
  ]);
  await chmod(emptyCache, 0o555);
  const result = await runDocker(
    context,
    "osv-missing-database-negative",
    configuration.scanners.osvScanner.image,
    osvScanArguments(configuration, inventory, {
      offline: true,
      license: false,
    }),
    {
      network: "none",
      memory: "768m",
      timeoutMs: configuration.policy.timeoutsSeconds.scanner * 1_000,
      user: "65534:65534",
      mounts: [
        dockerMount(inventory.scanInputRoot, "/scan", true),
        dockerMount(emptyCache, "/cache", true),
      ],
      env: {
        HOME: "/tmp/home",
        OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY: "/cache",
      },
    },
  );
  assertOsvMissingDatabaseFailure(result);
  recordTerminalCheck(context, {
    id: "R016-OSV-MISSING-DB-NEGATIVE",
    status: "PASS",
    rawExit: result.exitCode,
    stderrSha256: sha256Hex(result.stderrBytes),
    ...processEvidenceReference(context, "osv-missing-database-negative"),
  });
}

export function assertOsvMissingDatabaseFailure(result) {
  if (
    result?.exitCode !== 127 ||
    !/could not load db/iu.test(result.stderr) ||
    !/no offline version/iu.test(result.stderr)
  ) {
    throw new ContractError(
      "OSV missing-database negative probe did not produce the expected fail-closed control error",
    );
  }
  return true;
}

const OSV_NPM_CANARY_PACKAGE = Object.freeze({
  ecosystem: "npm",
  name: "lodash",
  version: "4.17.20",
});
const OSV_NPM_CANARY_INTEGRITY =
  "sha512-PlhdFcillOINfeV7Ni6oF1TAEayyZBoZ8bcshTHqOYJYlrqzRK5hagpagky5o4HfCzzd1TRkXPMFq6cKk9rGmA==";
const OSV_NPM_CANARY_SCANNER_SCOPE = "unknown";
const OSV_NPM_CANARY_FIXTURES = Object.freeze({
  development: `lockfileVersion: '9.0'

importers:

  .:
    devDependencies:
      lodash:
        specifier: 4.17.20
        version: 4.17.20

packages:

  lodash@4.17.20:
    resolution: {integrity: ${OSV_NPM_CANARY_INTEGRITY}}

snapshots:

  lodash@4.17.20: {}
`,
  unknown: `lockfileVersion: '9.0'

importers: {}

packages:

  lodash@4.17.20:
    resolution: {integrity: ${OSV_NPM_CANARY_INTEGRITY}}

snapshots:

  lodash@4.17.20: {}
`,
});

export function validateOsvVulnerabilityCanaryFixture(
  lockText,
  { fixtureScope, source = "OSV npm vulnerability canary fixture" } = {},
) {
  if (!Object.hasOwn(OSV_NPM_CANARY_FIXTURES, fixtureScope)) {
    throw new ContractError(
      `OSV npm vulnerability canary fixture scope is unsupported: ${String(fixtureScope)}`,
    );
  }
  const inventory = parsePnpmLockInventory(lockText, {
    source,
    expectedLockfileVersion: "9.0",
  });
  if (inventory.documentCount !== 1) {
    throw new ContractError(
      `OSV npm ${fixtureScope} vulnerability canary must contain exactly one lockfile document`,
    );
  }
  const packages = inventory.packages.map(({ name, version }) => ({
    name,
    version,
  }));
  if (
    packages.length !== 1 ||
    packages[0].name !== OSV_NPM_CANARY_PACKAGE.name ||
    packages[0].version !== OSV_NPM_CANARY_PACKAGE.version
  ) {
    throw new ContractError(
      `OSV npm ${fixtureScope} vulnerability canary must contain exactly lodash@4.17.20`,
    );
  }

  const expectedDirectDependencies =
    fixtureScope === "development"
      ? [
          {
            importer: ".",
            name: "lodash",
            scope: "devDependencies",
            section: "devDependencies",
          },
        ]
      : [];
  const directDependencies = inventory.directDependencies.map(
    ({ importer, name, scope, section }) => ({
      importer,
      name,
      scope,
      section,
    }),
  );
  if (
    canonicalJson(directDependencies) !==
    canonicalJson(expectedDirectDependencies)
  ) {
    throw new ContractError(
      `OSV npm ${fixtureScope} vulnerability canary direct dependency inventory differs from policy`,
    );
  }
  const expectedScopeCounts = Object.fromEntries(
    [...DIRECT_SCOPE_NAMES, "unknown"].map((scope) => [
      scope,
      fixtureScope === "development" && scope === "devDependencies" ? 1 : 0,
    ]),
  );
  if (
    canonicalJson(inventory.scopeCounts) !== canonicalJson(expectedScopeCounts)
  ) {
    throw new ContractError(
      `OSV npm ${fixtureScope} vulnerability canary direct scopes differ from policy`,
    );
  }
  if (inventory.documents[0].text !== OSV_NPM_CANARY_FIXTURES[fixtureScope]) {
    throw new ContractError(
      `OSV npm ${fixtureScope} vulnerability canary must match its exact controlled lockfile`,
    );
  }

  return {
    declaredDirectScopes: [
      ...new Set(directDependencies.map(({ section }) => section)),
    ].sort((left, right) => left.localeCompare(right)),
    expectedScannerPackage: {
      ...OSV_NPM_CANARY_PACKAGE,
      scope: OSV_NPM_CANARY_SCANNER_SCOPE,
    },
    fixtureScope,
    scannerScope: OSV_NPM_CANARY_SCANNER_SCOPE,
  };
}

export function validateOsvVulnerabilityCanaryScannerIdentity(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new ContractError(
      "OSV npm vulnerability canary output root is invalid",
    );
  }
  if (!Array.isArray(document.results) || document.results.length !== 1) {
    throw new ContractError(
      "OSV npm vulnerability canary output must contain exactly one source result",
    );
  }
  const [result] = document.results;
  if (
    result?.source?.path !== "/fixture/pnpm-lock.yaml" ||
    result.source.type !== "lockfile" ||
    !Array.isArray(result.packages) ||
    result.packages.length !== 1
  ) {
    throw new ContractError(
      "OSV npm vulnerability canary source result is invalid",
    );
  }
  const [item] = result.packages;
  if (
    item?.package?.ecosystem !== OSV_NPM_CANARY_PACKAGE.ecosystem ||
    item.package.name !== OSV_NPM_CANARY_PACKAGE.name ||
    item.package.version !== OSV_NPM_CANARY_PACKAGE.version
  ) {
    throw new ContractError(
      "OSV npm vulnerability canary scanner identity must be exact lodash@4.17.20",
    );
  }
  if (Object.hasOwn(item, "scope") || Object.hasOwn(item.package, "scope")) {
    throw new ContractError(
      "OSV npm vulnerability canary scanner identity unexpectedly reports scope",
    );
  }
  return {
    scannerScope: OSV_NPM_CANARY_SCANNER_SCOPE,
    scannerScopeReported: false,
  };
}

async function runOsvVulnerabilityCanaries(context, configuration, databases) {
  const cacheRoot = databases[0].cacheRoot;
  for (const canary of [
    {
      artifactName: "osv-vulnerability-canary",
      checkId: "R016-OSV-VULNERABILITY-CANARY",
      fixtureSource:
        "scripts/fixtures/supply-chain/vulnerable-pnpm-lock.yaml.txt",
      fixtureScope: "unknown",
    },
    {
      artifactName: "osv-vulnerability-development-canary",
      checkId: "R016-OSV-VULNERABILITY-DEVELOPMENT-CANARY",
      fixtureSource:
        "scripts/fixtures/supply-chain/vulnerable-development-pnpm-lock.yaml.txt",
      fixtureScope: "development",
    },
  ]) {
    const fixtureRoot = path.join(context.temporaryRoot, canary.artifactName);
    await mkdir(fixtureRoot, { recursive: false });
    const fixtureBytes = await readTrackedControlInput(
      context,
      canary.fixtureSource,
      canary.artifactName,
    );
    const fixture = validateOsvVulnerabilityCanaryFixture(
      fixtureBytes.toString("utf8"),
      {
        fixtureScope: canary.fixtureScope,
        source: canary.fixtureSource,
      },
    );
    await writeFile(path.join(fixtureRoot, "pnpm-lock.yaml"), fixtureBytes, {
      flag: "wx",
      mode: 0o444,
    });
    const result = await runDocker(
      context,
      canary.artifactName,
      configuration.scanners.osvScanner.image,
      osvCanaryArguments(),
      {
        network: "none",
        memory: "768m",
        timeoutMs: configuration.policy.timeoutsSeconds.scanner * 1_000,
        user: "65534:65534",
        mounts: [
          dockerMount(fixtureRoot, "/fixture", true),
          dockerMount(cacheRoot, "/cache", true),
        ],
        env: {
          HOME: "/tmp/home",
          OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY: "/cache",
        },
      },
    );
    requireRawExit(result, [1], canary.artifactName);
    const document = parseStrictJson(
      result.stdout,
      `${canary.artifactName} output`,
    );
    const scannerIdentity =
      validateOsvVulnerabilityCanaryScannerIdentity(document);
    assertExtractionCount(result.stderr, "/fixture/pnpm-lock.yaml", 1);
    const verdict = evaluateOsvVulnerabilities({
      document: result.stdout,
      rawExit: result.exitCode,
      expectedBySource: {
        "/fixture/pnpm-lock.yaml": [fixture.expectedScannerPackage],
      },
      policy: {
        blockAtOrAbove:
          configuration.policy.vulnerabilities.minimumBlockingCvss,
      },
    });
    if (
      verdict.exitCode !== EXIT_CODES.FINDING ||
      !verdict.findings?.some(
        (finding) =>
          finding.package?.name === "lodash" &&
          finding.package?.scope === scannerIdentity.scannerScope &&
          finding.scope === scannerIdentity.scannerScope &&
          finding.maximumSeverity >=
            configuration.policy.vulnerabilities.minimumBlockingCvss,
      )
    ) {
      throw gateFailure(
        EXIT_CODES.CONTRACT,
        canary.artifactName,
        `exact pinned offline OSV ${canary.fixtureScope} fixture canary did not block ${scannerIdentity.scannerScope} scanner scope`,
      );
    }
    recordTerminalCheck(context, {
      id: canary.checkId,
      status: "PASS",
      rawExit: result.exitCode,
      fixtureScope: fixture.fixtureScope,
      scannerScope: scannerIdentity.scannerScope,
      scannerScopeReported: scannerIdentity.scannerScopeReported,
      declaredDirectScopes: fixture.declaredDirectScopes,
      fixtureSha256: sha256Hex(fixtureBytes),
      findingCount: verdict.findings.length,
      inventorySha256: verdict.evidence.inventorySha256,
      ...processEvidenceReference(context, canary.artifactName),
    });
  }
}

export function osvCanaryArguments() {
  return [
    "scan",
    "source",
    "--format",
    "json",
    "--all-packages",
    "--all-vulns",
    "--offline",
    "--offline-vulnerabilities",
    "--lockfile",
    "/fixture/pnpm-lock.yaml",
  ];
}

async function runOsvGoAdvisoryCanary(context, configuration, databases) {
  const fixtureSource = "scripts/fixtures/supply-chain/vulnerable-go.mod.txt";
  const fixtureRoot = path.join(
    context.temporaryRoot,
    "osv-go-advisory-canary",
  );
  await mkdir(fixtureRoot, { recursive: false });
  const fixtureBytes = await readTrackedControlInput(
    context,
    fixtureSource,
    "OSV Go advisory canary",
  );
  await writeFile(path.join(fixtureRoot, "go.mod"), fixtureBytes, {
    flag: "wx",
    mode: 0o444,
  });
  const result = await runDocker(
    context,
    "osv-go-advisory-canary",
    configuration.scanners.osvScanner.image,
    osvGoCanaryArguments(),
    {
      network: "none",
      memory: "768m",
      timeoutMs: configuration.policy.timeoutsSeconds.scanner * 1_000,
      user: "65534:65534",
      mounts: [
        dockerMount(fixtureRoot, "/fixture", true),
        dockerMount(databases[0].cacheRoot, "/cache", true),
      ],
      env: {
        HOME: "/tmp/home",
        OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY: "/cache",
      },
    },
  );
  requireRawExit(result, [1], "OSV Go advisory canary");
  const document = parseStrictJson(result.stdout, "OSV Go advisory output");
  const finding = assertOsvGoAdvisoryCanary(document);
  const extraction = [
    ...result.stderr.matchAll(
      /Scanned \/fixture\/go\.mod file and found ([0-9]+) packages?/gu,
    ),
  ];
  if (extraction.length !== 1 || Number(extraction[0][1]) !== 2) {
    throw new ContractError(
      "OSV Go advisory canary extraction count is absent or invalid",
    );
  }
  recordTerminalCheck(context, {
    id: "R016-OSV-GO-ADVISORY-CANARY",
    status: "PASS",
    rawExit: result.exitCode,
    advisoryId: finding.advisoryId,
    ecosystem: finding.ecosystem,
    packageName: finding.packageName,
    version: finding.version,
    extractionCount: Number(extraction[0][1]),
    fixtureSha256: sha256Hex(fixtureBytes),
    ...processEvidenceReference(context, "osv-go-advisory-canary"),
  });
}

export function osvGoCanaryArguments() {
  return [
    "scan",
    "source",
    "--format",
    "json",
    "--all-packages",
    "--all-vulns",
    "--offline",
    "--offline-vulnerabilities",
    "--lockfile",
    "/fixture/go.mod",
  ];
}

export function assertOsvGoAdvisoryCanary(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new ContractError("OSV Go advisory output root is invalid");
  }
  if (!Array.isArray(document.results) || document.results.length !== 1) {
    throw new ContractError(
      "OSV Go advisory output must contain exactly one source result",
    );
  }
  const [result] = document.results;
  if (
    result?.source?.path !== "/fixture/go.mod" ||
    !Array.isArray(result.packages)
  ) {
    throw new ContractError("OSV Go advisory source result is invalid");
  }
  const matches = result.packages.filter((item) => {
    const vulnerabilities = Array.isArray(item?.vulnerabilities)
      ? item.vulnerabilities
      : [];
    return (
      item?.package?.ecosystem === "Go" &&
      item.package.name === "golang.org/x/text" &&
      item.package.version === "0.3.7" &&
      vulnerabilities.some(({ id }) => id === "GO-2022-1059")
    );
  });
  if (matches.length !== 1) {
    throw new ContractError(
      "OSV Go advisory canary did not report exact golang.org/x/text@v0.3.7 GO-2022-1059",
    );
  }
  return {
    advisoryId: "GO-2022-1059",
    ecosystem: "Go",
    packageName: "golang.org/x/text",
    version: "0.3.7",
  };
}

async function runOsvGoLicenseCanary(context, configuration) {
  const artifactName = "osv-go-license-denied-canary";
  const fixtureSource =
    "scripts/fixtures/supply-chain/go-license-denied.mod.txt";
  const configSource = "security/osv-scanner.toml";
  const expected = {
    ecosystem: "Go",
    license: "GPL-3.0-or-later",
    packageName: "github.com/MichaelMure/git-bug",
    version: "0.8.0",
  };
  if (
    !configuration.policy.licenses.denied.includes(expected.license) ||
    configuration.policy.licenses.allowed.includes(expected.license)
  ) {
    throw new ContractError(
      `OSV Go license canary ${expected.license} must remain explicitly denied`,
    );
  }
  const fixtureRoot = path.join(context.temporaryRoot, artifactName);
  await mkdir(fixtureRoot, { recursive: false });
  const [fixtureBytes, configBytes] = await Promise.all([
    readTrackedControlInput(context, fixtureSource, "OSV Go license canary"),
    readTrackedControlInput(
      context,
      configSource,
      "OSV Go license canary configuration",
    ),
  ]);
  await Promise.all([
    writeFile(path.join(fixtureRoot, "go.mod"), fixtureBytes, {
      flag: "wx",
      mode: 0o444,
    }),
    writeFile(path.join(fixtureRoot, "osv-scanner.toml"), configBytes, {
      flag: "wx",
      mode: 0o444,
    }),
  ]);
  const result = await runDocker(
    context,
    artifactName,
    configuration.scanners.osvScanner.image,
    osvGoLicenseCanaryArguments(configuration),
    {
      network: "bridge",
      memory: "768m",
      timeoutMs: configuration.policy.timeoutsSeconds.scanner * 1_000,
      user: "65534:65534",
      mounts: [dockerMount(fixtureRoot, "/fixture", true)],
      env: { HOME: "/tmp/home" },
    },
  );
  requireRawExit(result, [1], "OSV Go license denied canary");
  const document = parseStrictJson(
    result.stdout,
    "OSV Go license denied output",
  );
  const observed = assertOsvGoLicenseCanary(document);
  assertExtractionCount(result.stderr, "/fixture/go.mod", 2);
  const verdict = evaluateOsvLicenses({
    document: result.stdout,
    rawExit: result.exitCode,
    expectedBySource: {
      "/fixture/go.mod": [
        {
          ecosystem: expected.ecosystem,
          name: expected.packageName,
          version: expected.version,
          scope: "unknown",
        },
      ],
    },
    policy: { allowedSpdx: configuration.policy.licenses.allowed },
  });
  if (
    verdict.exitCode !== EXIT_CODES.FINDING ||
    !verdict.findings?.some(
      (finding) =>
        finding.package?.ecosystem === expected.ecosystem &&
        finding.package?.name === expected.packageName &&
        finding.package?.version === expected.version &&
        finding.license === expected.license &&
        finding.reason === "license is not explicitly allowed",
    )
  ) {
    throw gateFailure(
      EXIT_CODES.CONTRACT,
      artifactName,
      `exact pinned online OSV Go canary did not block ${expected.license}`,
    );
  }
  recordTerminalCheck(context, {
    id: "R016-OSV-GO-LICENSE-DENIED-CANARY",
    status: "PASS",
    rawExit: result.exitCode,
    ecosystem: observed.ecosystem,
    expectedLicense: observed.license,
    packageName: observed.packageName,
    version: observed.version,
    extractionCount: 2,
    fixtureSha256: sha256Hex(fixtureBytes),
    findingCount: verdict.findings.length,
    inventorySha256: verdict.evidence.inventorySha256,
    ...processEvidenceReference(context, artifactName),
  });
}

export function osvGoLicenseCanaryArguments(configuration) {
  return [
    "scan",
    "source",
    "--format",
    "json",
    "--all-packages",
    "--all-vulns",
    "--config",
    "/fixture/osv-scanner.toml",
    "--data-source",
    "deps.dev",
    `--licenses=${configuration.policy.licenses.allowed.join(",")}`,
    "--lockfile",
    "/fixture/go.mod",
  ];
}

export function assertOsvGoLicenseCanary(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new ContractError("OSV Go license output root is invalid");
  }
  if (!Array.isArray(document.results) || document.results.length !== 1) {
    throw new ContractError(
      "OSV Go license output must contain exactly one source result",
    );
  }
  const [result] = document.results;
  if (
    result?.source?.path !== "/fixture/go.mod" ||
    result.source.type !== "lockfile" ||
    !Array.isArray(result.packages) ||
    result.packages.length !== 1
  ) {
    throw new ContractError("OSV Go license source result is invalid");
  }
  const [item] = result.packages;
  const expectedLicenses = ["GPL-3.0", "GPL-3.0-or-later", "CC-BY-SA-4.0"];
  if (
    item?.package?.ecosystem !== "Go" ||
    item.package.name !== "github.com/MichaelMure/git-bug" ||
    item.package.version !== "0.8.0" ||
    !Array.isArray(item.licenses) ||
    item.licenses.length !== expectedLicenses.length ||
    !expectedLicenses.every(
      (license, index) => item.licenses[index] === license,
    )
  ) {
    throw new ContractError(
      "OSV Go license canary did not report the exact denied package license set",
    );
  }
  if (
    !Array.isArray(item.license_violations) ||
    item.license_violations.length !== expectedLicenses.length ||
    !expectedLicenses.every(
      (license, index) => item.license_violations[index] === license,
    )
  ) {
    throw new ContractError(
      "OSV Go license canary did not report the exact license violation set",
    );
  }
  return {
    ecosystem: "Go",
    license: "GPL-3.0-or-later",
    packageName: "github.com/MichaelMure/git-bug",
    version: "0.8.0",
  };
}

async function runOsvLicenseCanaries(context, configuration) {
  const configSource = "security/osv-scanner.toml";
  const configBytes = await readTrackedControlInput(
    context,
    configSource,
    "OSV license canary configuration",
  );
  const canaries = [
    {
      artifactName: "osv-license-denied-canary",
      checkId: "R016-OSV-LICENSE-DENIED-CANARY",
      expectedLicense: "BUSL-1.1",
      expectedReason: "license is not explicitly allowed",
      fixtureSource:
        "scripts/fixtures/supply-chain/license-denied-pnpm-lock.yaml.txt",
      packageName: "directus",
      version: "11.17.3",
    },
    {
      artifactName: "osv-license-unknown-canary",
      checkId: "R016-OSV-LICENSE-UNKNOWN-CANARY",
      expectedLicense: "UNKNOWN",
      expectedReason: "license is unknown",
      fixtureSource:
        "scripts/fixtures/supply-chain/license-unknown-pnpm-lock.yaml.txt",
      packageName: "reserved",
      version: "0.1.1",
    },
  ];
  for (const canary of canaries) {
    if (
      canary.expectedLicense !== "UNKNOWN" &&
      !configuration.policy.licenses.denied.includes(canary.expectedLicense)
    ) {
      throw new ContractError(
        `OSV license canary ${canary.expectedLicense} is not explicitly denied`,
      );
    }
    const fixtureRoot = path.join(context.temporaryRoot, canary.artifactName);
    await mkdir(fixtureRoot, { recursive: false });
    const fixtureBytes = await readTrackedControlInput(
      context,
      canary.fixtureSource,
      `${canary.artifactName} lockfile`,
    );
    await Promise.all([
      writeFile(path.join(fixtureRoot, "pnpm-lock.yaml"), fixtureBytes, {
        flag: "wx",
        mode: 0o444,
      }),
      writeFile(path.join(fixtureRoot, "osv-scanner.toml"), configBytes, {
        flag: "wx",
        mode: 0o444,
      }),
    ]);
    const result = await runDocker(
      context,
      canary.artifactName,
      configuration.scanners.osvScanner.image,
      osvLicenseCanaryArguments(configuration),
      {
        network: "bridge",
        memory: "768m",
        timeoutMs: configuration.policy.timeoutsSeconds.scanner * 1_000,
        user: "65534:65534",
        mounts: [dockerMount(fixtureRoot, "/fixture", true)],
        env: { HOME: "/tmp/home" },
      },
    );
    requireRawExit(result, [1], `${canary.artifactName} scan`);
    parseStrictJson(result.stdout, `${canary.artifactName} output`);
    assertExtractionCount(result.stderr, "/fixture/pnpm-lock.yaml", 1);
    const verdict = evaluateOsvLicenses({
      document: result.stdout,
      rawExit: result.exitCode,
      expectedBySource: {
        "/fixture/pnpm-lock.yaml": [
          {
            ecosystem: "npm",
            name: canary.packageName,
            version: canary.version,
            scope: "unknown",
          },
        ],
      },
      policy: { allowedSpdx: configuration.policy.licenses.allowed },
    });
    if (
      verdict.exitCode !== EXIT_CODES.FINDING ||
      !verdict.findings?.some(
        (finding) =>
          finding.package?.name === canary.packageName &&
          finding.package?.version === canary.version &&
          finding.license === canary.expectedLicense &&
          finding.reason === canary.expectedReason,
      )
    ) {
      throw gateFailure(
        EXIT_CODES.CONTRACT,
        canary.artifactName,
        `exact pinned online OSV canary did not block ${canary.expectedLicense}`,
      );
    }
    recordTerminalCheck(context, {
      id: canary.checkId,
      status: "PASS",
      rawExit: result.exitCode,
      expectedLicense: canary.expectedLicense,
      fixtureSha256: sha256Hex(fixtureBytes),
      findingCount: verdict.findings.length,
      inventorySha256: verdict.evidence.inventorySha256,
      ...processEvidenceReference(context, canary.artifactName),
    });
  }
}

export function osvLicenseCanaryArguments(configuration) {
  return [
    "scan",
    "source",
    "--format",
    "json",
    "--all-packages",
    "--all-vulns",
    "--config",
    "/fixture/osv-scanner.toml",
    "--data-source",
    "deps.dev",
    `--licenses=${configuration.policy.licenses.allowed.join(",")}`,
    "--lockfile",
    "/fixture/pnpm-lock.yaml",
  ];
}

async function acquireDatabases(context, configuration, now) {
  const cacheRoot = path.join(context.temporaryRoot, "osv-cache");
  await mkdir(cacheRoot, { recursive: false });
  const policy = databasePolicy(configuration.policy);
  const databases = [];
  for (const locked of configuration.scanners.advisoryDatabases) {
    validateRelativePosixPath(locked.cachePath, "OSV database cache path");
    const destination = path.join(cacheRoot, ...locked.cachePath.split("/"));
    let metadata;
    try {
      metadata = await downloadAdvisoryDatabase({
        ecosystem: locked.ecosystem,
        url: locked.url,
        destination,
        timeoutMs:
          configuration.policy.timeoutsSeconds.artifactAcquisition * 1_000,
        maxBytes:
          configuration.policy.advisoryDatabase.maxCompressedDownloadBytes,
      });
    } catch (error) {
      throw gateFailure(
        EXIT_CODES.ACQUISITION,
        "advisory-database-acquisition",
        error instanceof DatabaseAcquisitionError
          ? error.message
          : `failed to download ${locked.ecosystem} database`,
        error,
      );
    }
    await chmod(destination, 0o444);
    const sealedMetadata = { ...metadata, file: locked.cachePath };
    const verdict = validateDatabaseIdentity(sealedMetadata, policy, now);
    requireVerdict(verdict, `advisory database ${locked.ecosystem}`);
    databases.push({
      cacheRoot,
      destination,
      locked,
      metadata: sealedMetadata,
      verdict,
    });
    context.evidence.advisoryDatabases.push({
      ecosystem: locked.ecosystem,
      url: locked.url,
      ...verdict.evidence,
    });
  }
  return databases;
}

async function validateDatabaseArchives(context, configuration, databases) {
  const scanners = configuration.scanners;
  const cacheRoot = databases[0].cacheRoot;
  const validatorSource = await stageDatabaseValidatorSources(context);
  const buildCache = path.join(context.temporaryRoot, "dbcheck-build-cache");
  const moduleCache = path.join(context.temporaryRoot, "dbcheck-module-cache");
  await Promise.all([
    mkdir(buildCache, { recursive: false }),
    mkdir(moduleCache, { recursive: false }),
  ]);
  await Promise.all([chmod(buildCache, 0o777), chmod(moduleCache, 0o777)]);
  const databaseArguments = databases.map(
    ({ locked }) => `/db/${locked.cachePath}`,
  );
  const result = await runDocker(
    context,
    "osv-database-zip-validation",
    scanners.goToolchainImage.image,
    [
      "go",
      "run",
      "./tools/osvdbcheck/cmd/osvdbcheck",
      "--",
      ...databaseArguments,
    ],
    {
      network: "none",
      memory: "1536m",
      temporaryStorage: "512m",
      tmpfsExecutable: true,
      timeoutMs: configuration.policy.timeoutsSeconds.scanner * 1_000,
      user: "65534:65534",
      workdir: "/validator",
      mounts: [
        dockerMount(validatorSource.root, "/validator", true),
        dockerMount(cacheRoot, "/db", true),
        dockerMount(buildCache, "/gocache", false),
        dockerMount(moduleCache, "/gomodcache", false),
      ],
      env: {
        ...goModuleEnvironment(),
        GOCACHE: "/gocache",
        GOMODCACHE: "/gomodcache",
      },
    },
  );
  requireRawExit(result, [0], "OSV database ZIP validation");
  const report = parseStrictJson(result.stdout, "osvdbcheck JSON");
  validateDatabaseArchiveReport(report, databases.length);
  context.evidence.databaseArchiveValidation = {
    ...report,
    validatorSources: validatorSource.evidence,
  };
  context.databaseArchiveSeal = structuredClone(
    context.evidence.databaseArchiveValidation,
  );
  recordTerminalCheck(context, {
    id: "R016-DB-ZIP",
    status: "PASS",
    rawExit: result.exitCode,
    archiveCount: report.archives.length,
    ...processEvidenceReference(context, "osv-database-zip-validation"),
  });
}

export function validateDatabaseArchiveReport(report, expectedArchiveCount) {
  const fail = (detail) => {
    throw gateFailure(EXIT_CODES.CONTRACT, "database-zip-validation", detail);
  };
  const hasExactKeys = (value, expected) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const actual = Object.keys(value).sort();
    const required = [...expected].sort();
    return (
      actual.length === required.length &&
      actual.every((key, index) => key === required[index])
    );
  };

  if (
    !Number.isSafeInteger(expectedArchiveCount) ||
    expectedArchiveCount <= 0
  ) {
    fail("osvdbcheck expected archive count is invalid");
  }
  if (
    !hasExactKeys(report, ["archives", "limits", "schema_version"]) ||
    report.schema_version !== 1 ||
    !Array.isArray(report.archives)
  ) {
    fail("osvdbcheck report schema is invalid");
  }

  const expectedLimitKeys = Object.keys(DATABASE_ARCHIVE_VALIDATION_LIMITS);
  if (
    !hasExactKeys(report.limits, expectedLimitKeys) ||
    expectedLimitKeys.some(
      (key) => report.limits[key] !== DATABASE_ARCHIVE_VALIDATION_LIMITS[key],
    )
  ) {
    fail("osvdbcheck report limits differ from the exact production limits");
  }
  if (report.archives.length !== expectedArchiveCount) {
    fail("osvdbcheck report archive count differs from expected input count");
  }

  for (const [index, archive] of report.archives.entries()) {
    if (
      !hasExactKeys(archive, [
        "argument_index",
        "entry_count",
        "manifest_sha256",
        "uncompressed_bytes",
      ]) ||
      archive.argument_index !== index ||
      !Number.isSafeInteger(archive.entry_count) ||
      archive.entry_count <= 0 ||
      archive.entry_count > DATABASE_ARCHIVE_VALIDATION_LIMITS.max_entries ||
      !Number.isSafeInteger(archive.uncompressed_bytes) ||
      archive.uncompressed_bytes <= 0 ||
      archive.uncompressed_bytes >
        DATABASE_ARCHIVE_VALIDATION_LIMITS.max_archive_uncompressed_bytes
    ) {
      fail(`osvdbcheck archive ${index} inventory is invalid`);
    }
    if (
      typeof archive.manifest_sha256 !== "string" ||
      !/^[0-9a-f]{64}$/u.test(archive.manifest_sha256)
    ) {
      fail(`osvdbcheck archive ${index} manifest SHA-256 is invalid`);
    }
  }
  return true;
}

async function stageDatabaseValidatorSources(context) {
  const requiredMain = "tools/osvdbcheck/cmd/osvdbcheck/main.go";
  const sourcePaths = [...context.controlTrackedIndex.keys()]
    .filter(
      (repositoryPath) =>
        repositoryPath === "go.mod" ||
        /^tools\/osvdbcheck\/cmd\/osvdbcheck\/[^/]+\.go$/u.test(repositoryPath),
    )
    .sort();
  if (!sourcePaths.includes("go.mod") || !sourcePaths.includes(requiredMain)) {
    throw new ContractError(
      "tracked database validator source inventory is incomplete",
    );
  }
  const root = path.join(context.temporaryRoot, "dbcheck-source");
  await mkdir(root, { recursive: false });
  const files = [];
  for (const repositoryPath of sourcePaths) {
    const entry = requireTrackedRegularFile(
      context.controlTrackedIndex,
      repositoryPath,
      `database validator source ${repositoryPath}`,
    );
    const bytes = await readTrackedControlInput(
      context,
      repositoryPath,
      `database validator source ${repositoryPath}`,
    );
    const destination = path.join(root, ...repositoryPath.split("/"));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes, { flag: "wx", mode: 0o444 });
    files.push({
      path: repositoryPath,
      gitObjectId: entry.objectId,
      sha256: sha256Hex(bytes),
      size: bytes.length,
    });
  }
  return {
    root,
    evidence: {
      files,
      inventorySha256: sha256Hex(canonicalJson(files)),
    },
  };
}

function databasePolicy(policy) {
  const configured = policy.advisoryDatabase;
  return {
    requiredEcosystems: configured.requiredEcosystems,
    maxAgeMs: configured.maxAgeHours * 60 * 60 * 1_000,
    maxFutureSkewMs: configured.maxFutureSkewMinutes * 60 * 1_000,
    requireSha256Evidence: configured.requireSha256Evidence,
  };
}

async function sealDatabases(context, databases) {
  const seal = {
    schemaVersion: 1,
    gateId: "R-016",
    runId: context.runId,
    source: context.sourceSeal,
    controlSource: context.controlSourceSeal,
    databases: databases.map(({ locked, verdict }) => ({
      ecosystem: locked.ecosystem,
      url: locked.url,
      ...verdict.evidence,
    })),
  };
  const contents = `${canonicalJson(seal)}\n`;
  const destination = path.join(context.artifactRoot, "db-seal.json");
  await writeFile(destination, contents, { flag: "wx", mode: 0o600 });
  context.evidence.databaseSeal = {
    path: artifactRelative(context, destination),
    sha256: sha256Hex(contents),
  };
}

async function verifyDatabaseSeal(context, databases) {
  for (const database of databases) {
    const identity = await hashFile(database.destination);
    for (const key of ["contentLength", "md5", "sha256"]) {
      if (identity[key] !== database.metadata[key]) {
        throw gateFailure(
          EXIT_CODES.CONTRACT,
          "database-post-scan-seal",
          `${database.locked.ecosystem} database ${key} changed after sealing`,
        );
      }
    }
  }
  context.databaseIdentitySeal = structuredClone(
    context.evidence.advisoryDatabases,
  );
  recordTerminalCheck(context, {
    id: "R016-DB-SEAL",
    status: "PASS",
    detail: "offline scan database bytes match the pre-scan seal",
  });
}

async function runOsvVulnerabilityGate(
  context,
  configuration,
  inventory,
  databases,
) {
  const scanner = configuration.scanners.osvScanner;
  const cacheRoot = databases[0].cacheRoot;
  const args = osvScanArguments(configuration, inventory, {
    offline: true,
    license: false,
  });
  const result = await runDocker(
    context,
    "osv-vulnerability",
    scanner.image,
    args,
    {
      network: "none",
      memory: "1536m",
      timeoutMs: configuration.policy.timeoutsSeconds.scanner * 1_000,
      user: "65534:65534",
      mounts: [
        dockerMount(inventory.scanInputRoot, "/scan", true),
        dockerMount(cacheRoot, "/cache", true),
      ],
      env: {
        HOME: "/tmp/home",
        OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY: "/cache",
      },
    },
  );
  requireRawExit(result, [0, 1], "OSV vulnerability scan");
  const document = parseStrictJson(result.stdout, "OSV vulnerability output");
  assertOsvExtractionCoverage(result.stderr, inventory);
  assertNpmParity(document, inventory.documentInputs);
  const expectedBySource = combinedExpectedInventory(inventory);
  const verdict = evaluateOsvVulnerabilities({
    document: result.stdout,
    rawExit: result.exitCode,
    expectedBySource,
    policy: {
      blockAtOrAbove: configuration.policy.vulnerabilities.minimumBlockingCvss,
    },
  });
  requireVerdict(verdict, "OSV vulnerability policy");
  context.verdictExecutionSeals.vulnerability = structuredClone(
    verdict.evidence,
  );
  recordTerminalCheck(context, {
    id: "R016-VULNERABILITY",
    status: "PASS",
    rawExit: result.exitCode,
    ...verdict.evidence,
    ...processEvidenceReference(context, "osv-vulnerability"),
  });
}

async function runOsvLicenseGate(context, configuration, inventory) {
  const scanner = configuration.scanners.osvScanner;
  const result = await runDocker(
    context,
    "osv-license",
    scanner.image,
    osvScanArguments(configuration, inventory, {
      offline: false,
      license: true,
    }),
    {
      network: "bridge",
      memory: "1536m",
      timeoutMs: configuration.policy.timeoutsSeconds.scanner * 1_000,
      user: "65534:65534",
      mounts: [dockerMount(inventory.scanInputRoot, "/scan", true)],
      env: { HOME: "/tmp/home" },
    },
  );
  requireRawExit(result, [0, 1], "OSV license scan");
  const document = parseStrictJson(result.stdout, "OSV license output");
  assertOsvExtractionCoverage(result.stderr, inventory);
  assertNpmParity(document, inventory.documentInputs);
  const verdict = evaluateOsvLicenses({
    document: result.stdout,
    rawExit: result.exitCode,
    expectedBySource: combinedExpectedInventory(inventory),
    policy: { allowedSpdx: configuration.policy.licenses.allowed },
  });
  requireVerdict(verdict, "OSV license policy");
  context.verdictExecutionSeals.license = structuredClone(verdict.evidence);
  recordTerminalCheck(context, {
    id: "R016-LICENSE",
    status: "PASS",
    rawExit: result.exitCode,
    onlineMetadataSource: "deps.dev",
    reproducibilityResidual:
      "deps.dev does not expose a response snapshot digest; exact package parity and fail-closed network handling are enforced",
    ...verdict.evidence,
    ...processEvidenceReference(context, "osv-license"),
  });
}

export function osvScanArguments(
  configuration,
  inventory,
  { offline, license },
) {
  const args = [
    "scan",
    "source",
    "--format",
    "json",
    "--all-packages",
    "--all-vulns",
  ];
  if (offline) args.push("--offline", "--offline-vulnerabilities");
  if (license) {
    args.push(
      "--config",
      "/scan/osv-scanner.toml",
      "--data-source",
      "deps.dev",
      `--licenses=${configuration.policy.licenses.allowed.join(",")}`,
    );
  }
  for (const document of inventory.documentInputs) {
    args.push("--lockfile", document.containerPath);
  }
  for (const module of inventory.goInventory) {
    args.push("--lockfile", module.containerPath);
  }
  return args;
}

function combinedExpectedInventory(inventory) {
  const expected = Object.create(null);
  for (const document of inventory.documentInputs) {
    expected[document.containerPath] = document.packages.map(
      ({ name, version }) => ({
        ecosystem: "npm",
        name,
        version,
        scope: "unknown",
      }),
    );
  }
  for (const module of inventory.goInventory) {
    if (module.thirdParty.length > 0) {
      expected[module.containerPath] = module.thirdParty;
    }
  }
  return expected;
}

function assertNpmParity(document, documentInputs) {
  assertOsvSourceInventoryParity(
    documentInputs.map(({ containerPath, packages }) => ({
      source: containerPath,
      packages,
    })),
    {
      ...document,
      results: document.results.filter(
        (result) => result?.packages?.[0]?.package?.ecosystem === "npm",
      ),
    },
  );
}

export function assertOsvExtractionCoverage(stderr, inventory) {
  if (typeof stderr !== "string") {
    throw new ContractError("OSV stderr must be a string");
  }
  for (const source of inventory.documentInputs) {
    assertExtractionCount(stderr, source.containerPath, source.packageCount);
  }
  for (const source of inventory.goInventory) {
    assertExtractionCount(
      stderr,
      source.containerPath,
      source.discoveredModuleCount,
    );
  }
  return true;
}

function assertExtractionCount(stderr, source, expected) {
  const escaped = escapeRegularExpression(source);
  const matches = [
    ...stderr.matchAll(
      new RegExp(`Scanned ${escaped} file and found ([0-9]+) packages?`, "gu"),
    ),
  ];
  if (matches.length !== 1 || Number(matches[0][1]) !== expected) {
    throw new ContractError(
      `OSV extraction count for ${source} is absent, duplicate, or differs from ${expected}`,
    );
  }
}

async function runSemgrepGates(context, configuration, rules, sourceInventory) {
  const scanner = configuration.scanners.semgrep;
  const common = semgrepArguments(configuration, rules);
  const repositoryResult = await runDocker(
    context,
    "semgrep-repository",
    scanner.image,
    [...common, "/src"],
    {
      network: "none",
      memory: "1536m",
      artifactView: semgrepArtifactView,
      timeoutMs: configuration.policy.timeoutsSeconds.scanner * 1_000,
      mounts: [
        dockerMount(sourceInventory.root, "/src", true),
        dockerMount(rules.root, "/rules", true),
      ],
      env: semgrepEnvironment(),
    },
  );
  requireRawExit(repositoryResult, [0, 1], "Semgrep repository scan");
  const repositoryParity = assertSemgrepSourceParity(
    repositoryResult.stdout,
    sourceInventory.repositoryPaths,
    "/src",
  );
  const repositoryVerdict = evaluateSemgrep({
    document: repositoryResult.stdout,
    rawExit: repositoryResult.exitCode,
    requiredLanguages: configuration.policy.sast.requiredLanguageGroups,
  });
  requireVerdict(repositoryVerdict, "Semgrep repository policy");
  recordTerminalCheck(context, {
    id: "R016-SAST",
    status: "PASS",
    rawExit: repositoryResult.exitCode,
    engine: "Semgrep Community Edition --oss-only",
    exactSourceParity: repositoryParity,
    ...repositoryVerdict.evidence,
    ...processEvidenceReference(context, "semgrep-repository"),
  });

  const fixtureRoot = path.join(context.temporaryRoot, "sast-fixtures");
  await mkdir(fixtureRoot, { recursive: false });
  const fixtureBytes = Object.create(null);
  for (const [source, target] of [
    ["sast-go-blocking.go.txt", "sast-go-blocking.go"],
    ["sast-typescript-blocking.ts.txt", "sast-typescript-blocking.ts"],
  ]) {
    const repositoryPath = `scripts/fixtures/supply-chain/${source}`;
    const bytes = await readTrackedControlInput(
      context,
      repositoryPath,
      `Semgrep fixture ${source}`,
    );
    fixtureBytes[target] = bytes;
    await writeFile(path.join(fixtureRoot, target), bytes, {
      flag: "wx",
      mode: 0o444,
    });
  }
  const ignoredDirectory = path.join(fixtureRoot, "ignored");
  await mkdir(ignoredDirectory, { recursive: false });
  await writeFile(path.join(fixtureRoot, ".semgrepignore"), "ignored/\n", {
    flag: "wx",
    mode: 0o444,
  });
  await writeFile(
    path.join(ignoredDirectory, "sast-semgrepignore.ts"),
    fixtureBytes["sast-typescript-blocking.ts"],
    { flag: "wx", mode: 0o444 },
  );
  const largeFixture = buildSemgrepMinifiedLargeFixture(
    fixtureBytes["sast-typescript-blocking.ts"],
  );
  await writeFile(
    path.join(fixtureRoot, "sast-over-limit.ts"),
    largeFixture.bytes,
    {
      flag: "wx",
      mode: 0o444,
    },
  );
  const expectedFixturePaths = [
    ".semgrepignore",
    "ignored/sast-semgrepignore.ts",
    "sast-go-blocking.go",
    "sast-over-limit.ts",
    "sast-typescript-blocking.ts",
  ];
  const fixtureResult = await runDocker(
    context,
    "semgrep-blocking-fixtures",
    scanner.image,
    [...common, "/fixtures"],
    {
      network: "none",
      memory: "768m",
      artifactView: semgrepArtifactView,
      timeoutMs: configuration.policy.timeoutsSeconds.scanner * 1_000,
      mounts: [
        dockerMount(fixtureRoot, "/fixtures", true),
        dockerMount(rules.root, "/rules", true),
      ],
      env: semgrepEnvironment(),
    },
  );
  requireRawExit(fixtureResult, [1], "Semgrep blocking fixture scan");
  const fixtureParity = assertSemgrepSourceParity(
    fixtureResult.stdout,
    expectedFixturePaths,
    "/fixtures",
  );
  const fixtureVerdict = evaluateSemgrep({
    document: fixtureResult.stdout,
    rawExit: fixtureResult.exitCode,
    requiredLanguages: configuration.policy.sast.requiredLanguageGroups,
  });
  if (fixtureVerdict.exitCode !== EXIT_CODES.FINDING) {
    throw gateFailure(
      EXIT_CODES.CONTRACT,
      "semgrep-negative-fixture",
      `blocking fixture returned normalized exit ${fixtureVerdict.exitCode}`,
    );
  }
  const findingPaths = new Set(
    fixtureVerdict.findings?.map((finding) => POSIX.basename(finding.path)),
  );
  for (const expected of [
    "sast-semgrepignore.ts",
    "sast-go-blocking.go",
    "sast-over-limit.ts",
    "sast-typescript-blocking.ts",
  ]) {
    if (!findingPaths.has(expected)) {
      throw gateFailure(
        EXIT_CODES.CONTRACT,
        "semgrep-negative-fixture",
        `blocking fixture ${expected} did not produce a finding`,
      );
    }
  }
  recordTerminalCheck(context, {
    id: "R016-SAST-NEGATIVE",
    status: "PASS",
    rawExit: fixtureResult.exitCode,
    findingCount: fixtureVerdict.findings.length,
    coverage: fixtureVerdict.evidence.coverage,
    exactSourceParity: fixtureParity,
    largeFixtureAverageBytesPerLine: largeFixture.averageBytesPerLine,
    largeFixtureLineCount: largeFixture.lineCount,
    largeFixtureSha256: sha256Hex(largeFixture.bytes),
    largeFixtureSize: largeFixture.bytes.length,
    ...processEvidenceReference(context, "semgrep-blocking-fixtures"),
  });
}

export function buildSemgrepMinifiedLargeFixture(blockingFixture) {
  if (!Buffer.isBuffer(blockingFixture) || blockingFixture.length === 0) {
    throw new ContractError(
      "Semgrep minified large fixture requires non-empty blocking source bytes",
    );
  }
  const bytes = Buffer.concat([
    Buffer.from(
      `const r016MinifiedPadding="${"x".repeat(1_050_000)}";`,
      "utf8",
    ),
    blockingFixture,
  ]);
  const lineCount = bytes.reduce(
    (count, byte) => count + (byte === 0x0a ? 1 : 0),
    1,
  );
  const averageBytesPerLine = Math.floor(bytes.length / lineCount);
  if (bytes.length <= 1_000_000 || averageBytesPerLine <= 1_000) {
    throw new ContractError(
      "Semgrep bypass fixture must exceed 1 MB and the minified average-line threshold",
    );
  }
  return { averageBytesPerLine, bytes, lineCount };
}

export function semgrepArguments(configuration, rules) {
  const args = [
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
  ];
  for (const rule of rules.lock.files)
    args.push("--config", `/rules/${rule.path}`);
  return args;
}

function semgrepEnvironment() {
  return {
    HOME: "/tmp/home",
    SEMGREP_ENABLE_VERSION_CHECK: "0",
    SEMGREP_SEND_METRICS: "off",
  };
}

export function semgrepArtifactView(result) {
  const stdoutBytes = processStreamBytes(result, "stdout");
  const stderrBytes = processStreamBytes(result, "stderr");
  const sourceIdentity = {
    stdoutSha256: sha256Hex(stdoutBytes),
    stdoutSize: stdoutBytes.length,
    stderrSha256: sha256Hex(stderrBytes),
    stderrSize: stderrBytes.length,
  };
  let sanitized;
  try {
    const document = parseStrictJson(result.stdout, "Semgrep artifact source");
    sanitized = {
      errors: Array.isArray(document.errors)
        ? document.errors.map((error) => ({
            level: error?.level ?? null,
            type: error?.type ?? null,
          }))
        : "INVALID",
      paths: {
        scanned: Array.isArray(document.paths?.scanned)
          ? document.paths.scanned
          : "INVALID",
      },
      results: Array.isArray(document.results)
        ? document.results.map((finding) => ({
            check_id: finding?.check_id ?? null,
            end: finding?.end ?? null,
            path: finding?.path ?? null,
            start: finding?.start ?? null,
          }))
        : "INVALID",
      sourceIdentity,
      version: document.version ?? null,
    };
  } catch {
    sanitized = {
      parseStatus: "INVALID_OR_NON_JSON",
      sourceIdentity,
    };
  }
  return {
    stderr: `${canonicalJson({ redacted: true, ...sourceIdentity })}\n`,
    stdout: `${canonicalJson(sanitized)}\n`,
  };
}

async function runChecked(
  context,
  artifactName,
  failureKind,
  command,
  args,
  options = {},
) {
  let result;
  const executable = trustedExecutable(command, context);
  try {
    result = await runProcess({
      command: executable,
      args,
      cwd: options.cwd ?? context.root,
      env: controlledCommandEnvironment(
        command,
        options.env,
        context.dockerConfig,
      ),
      timeoutMs: options.timeoutMs ?? 300_000,
      maxOutputBytes: options.maxOutputBytes ?? 128 * 1024 * 1024,
    });
  } catch (error) {
    const exitCode =
      failureKind === "acquisition"
        ? EXIT_CODES.ACQUISITION
        : EXIT_CODES.INTERNAL;
    throw gateFailure(
      exitCode,
      artifactName,
      error instanceof ProcessOutputEncodingError
        ? `${command} emitted invalid UTF-8 output`
        : `failed to launch ${command}`,
      error,
    );
  }
  await recordProcess(context, artifactName, result, options.artifactView);
  if (
    result.timedOut ||
    result.outputLimitExceeded ||
    result.signal !== null ||
    result.exitCode !== 0
  ) {
    const exitCode =
      failureKind === "acquisition"
        ? EXIT_CODES.ACQUISITION
        : EXIT_CODES.INTERNAL;
    throw gateFailure(
      exitCode,
      artifactName,
      `${command} failed (exit=${result.exitCode}, signal=${result.signal}, timeout=${result.timedOut})`,
    );
  }
  return result;
}

function controlledCommandEnvironment(command, extra = {}, dockerConfig) {
  const merged = { ...process.env, ...extra };
  if (command.toLowerCase() === "git") return sanitizeGitEnvironment(merged);
  if (command.toLowerCase() === "docker") {
    return sanitizeDockerEnvironment(merged, dockerConfig);
  }
  return merged;
}

export function trustedExecutable(command, context = {}) {
  const normalized = command.toLowerCase();
  if (normalized !== "git" && normalized !== "docker") {
    throw new ContractError(`unsupported trusted executable ${command}`);
  }
  const environmentName =
    normalized === "git" ? "R016 Git binary" : "R016 Docker binary";
  const configured = context.trustedExecutables?.[normalized];
  if (
    typeof configured !== "string" ||
    !path.isAbsolute(configured) ||
    path.normalize(configured) !== configured
  ) {
    throw new ContractError(
      `${environmentName} must name a canonical absolute executable path`,
    );
  }
  const basename = path.basename(configured).toLowerCase();
  const expected =
    normalized === "git" ? /^git(?:\.exe)?$/u : /^docker(?:\.exe)?$/u;
  if (!expected.test(basename)) {
    throw new ContractError(
      `${environmentName} has an invalid executable name`,
    );
  }
  return configured;
}

export async function inspectTrustedExecutableFiles(
  repositoryRoot,
  temporaryRoot,
  executables,
  additionalForbiddenRoots = [],
) {
  if (
    !executables ||
    typeof executables !== "object" ||
    Array.isArray(executables)
  ) {
    throw new ContractError(
      "local R-016 execution requires explicit Git and Docker binary paths",
    );
  }
  const seals = Object.create(null);
  for (const name of ["git", "docker"]) {
    const configured = trustedExecutable(name, {
      trustedExecutables: executables,
    });
    const metadata = await lstat(configured);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new ContractError(
        `${name} executable must be a regular non-link file`,
      );
    }
    const resolved = await realpath(configured);
    if (path.normalize(resolved) !== path.normalize(configured)) {
      throw new ContractError(
        `${name} executable path must equal its real path`,
      );
    }
    for (const [boundary, label] of [
      [repositoryRoot, "repository"],
      ...additionalForbiddenRoots.map((root) => [root, "control repository"]),
      [temporaryRoot, "temporary directory"],
    ]) {
      const relative = path.relative(
        path.resolve(boundary),
        path.resolve(resolved),
      );
      if (
        relative === "" ||
        (!relative.startsWith(`..${path.sep}`) &&
          relative !== ".." &&
          !path.isAbsolute(relative))
      ) {
        throw new ContractError(
          `${name} executable cannot be inside the ${label}`,
        );
      }
    }
    const identity = await hashFile(resolved);
    seals[name] = {
      path: resolved,
      sha256: identity.sha256,
      size: identity.contentLength,
    };
  }
  return seals;
}

export function parseTrustedExecutableArguments(arguments_ = []) {
  const parsed = Object.create(null);
  for (const argument of arguments_) {
    const match = /^--(git|docker)-binary=(.+)$/u.exec(argument);
    if (!match || Object.hasOwn(parsed, match[1])) {
      throw new ContractError(
        `invalid or duplicate R-016 argument ${argument}`,
      );
    }
    parsed[match[1]] = match[2];
  }
  if (Object.keys(parsed).length !== 2) {
    throw new ContractError(
      "local R-016 CLI requires --git-binary=<absolute> and --docker-binary=<absolute>",
    );
  }
  return parsed;
}

export function sanitizeGitEnvironment(environment = process.env) {
  const sanitized = Object.create(null);
  const canonical = new Map(
    Object.entries(environment).map(([name, value]) => [
      name.toUpperCase(),
      value,
    ]),
  );
  for (const name of [
    "COMSPEC",
    "HOME",
    "HTTPS_PROXY",
    "HTTP_PROXY",
    "NO_PROXY",
    "PATHEXT",
    "SYSTEMROOT",
    "TEMP",
    "TMP",
    "TMPDIR",
    "USERPROFILE",
    "WINDIR",
  ]) {
    const value = canonical.get(name);
    if (typeof value === "string" && value !== "") sanitized[name] = value;
  }
  sanitized.PATH =
    process.platform === "linux" && environment.GITHUB_ACTIONS === "true"
      ? "/usr/bin:/bin"
      : "";
  sanitized.LC_ALL = "C.UTF-8";
  sanitized.GIT_ATTR_NOSYSTEM = "1";
  sanitized.GIT_CONFIG_COUNT = "0";
  sanitized.GIT_CONFIG_GLOBAL =
    process.platform === "win32" ? "NUL" : "/dev/null";
  sanitized.GIT_CONFIG_NOSYSTEM = "1";
  sanitized.GIT_TERMINAL_PROMPT = "0";
  return sanitized;
}

export function sanitizeDockerEnvironment(
  environment = process.env,
  dockerConfig,
) {
  if (typeof dockerConfig !== "string" || !path.isAbsolute(dockerConfig)) {
    throw new ContractError("Docker config directory must be an absolute path");
  }
  const sanitized = Object.create(null);
  const canonical = new Map(
    Object.entries(environment).map(([name, value]) => [
      name.toUpperCase(),
      value,
    ]),
  );
  for (const name of [
    "COMSPEC",
    "HOME",
    "PATHEXT",
    "SYSTEMROOT",
    "TEMP",
    "TMP",
    "TMPDIR",
    "USERPROFILE",
    "WINDIR",
  ]) {
    const value = canonical.get(name);
    if (typeof value === "string" && value !== "") sanitized[name] = value;
  }
  sanitized.PATH =
    process.platform === "linux" && environment.GITHUB_ACTIONS === "true"
      ? "/usr/bin:/bin"
      : "";
  sanitized.DOCKER_CONFIG = dockerConfig;
  sanitized.LC_ALL = "C.UTF-8";
  return sanitized;
}

export async function runDocker(
  context,
  artifactName,
  image,
  commandArguments,
  {
    artifactView,
    env = {},
    memory = "1024m",
    mounts = [],
    network = "none",
    temporaryStorage = "128m",
    timeoutMs = 600_000,
    tmpfsExecutable = false,
    user,
    workdir,
    processRunner = runProcess,
  } = {},
) {
  const cidDirectory = path.join(context.temporaryRoot, "container-ids");
  await mkdir(cidDirectory, { recursive: true });
  const cidFile = path.join(
    cidDirectory,
    `${safeArtifactName(artifactName)}.cid`,
  );
  const containerName = `hedefora-r016-${sha256Hex(`${context.runId}:${artifactName}`).slice(0, 24)}`;
  const argumentsForDocker = [
    "run",
    "--rm",
    "--platform",
    "linux/amd64",
    "--cidfile",
    cidFile,
    "--name",
    containerName,
    "--network",
    network,
    "--memory",
    memory,
    "--pids-limit",
    "256",
    "--cpus",
    "2",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--read-only",
    "--tmpfs",
    `/tmp:rw,${tmpfsExecutable ? "exec" : "noexec"},nosuid,size=${temporaryStorage}`,
  ];
  await validateDockerMountSources(context, mounts, network);
  if (user) argumentsForDocker.push("--user", user);
  if (workdir) argumentsForDocker.push("--workdir", workdir);
  for (const mount of mounts) argumentsForDocker.push("--mount", mount);
  for (const [name, value] of Object.entries(env).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    argumentsForDocker.push("--env", `${name}=${value}`);
  }
  argumentsForDocker.push(image, ...commandArguments);

  let result;
  try {
    result = await processRunner({
      command: trustedExecutable("docker", context),
      args: argumentsForDocker,
      cwd: context.root,
      env: sanitizeDockerEnvironment(process.env, context.dockerConfig),
      timeoutMs,
      maxOutputBytes: 256 * 1024 * 1024,
    });
  } catch (error) {
    const primaryFailure = gateFailure(
      EXIT_CODES.INTERNAL,
      artifactName,
      error instanceof ProcessOutputEncodingError
        ? "Docker scanner emitted invalid UTF-8 output"
        : "failed to launch Docker scanner",
      error,
    );
    try {
      await removeContainerAndVerify(context, cidFile, containerName, {
        artifactName,
        processRunner,
      });
    } catch (cleanupError) {
      throw combineDockerCleanupFailure(cleanupError, [primaryFailure]);
    }
    throw primaryFailure;
  }
  let recordingError = null;
  try {
    await recordProcess(context, artifactName, result, artifactView);
  } catch (error) {
    recordingError = error;
  }
  const controlFailure =
    result.timedOut || result.outputLimitExceeded || result.signal !== null
      ? gateFailure(
          EXIT_CODES.INTERNAL,
          artifactName,
          `Docker scanner control failure (signal=${result.signal}, timeout=${result.timedOut}, outputLimit=${result.outputLimitExceeded})`,
        )
      : null;
  const primaryFailures = [recordingError, controlFailure].filter(Boolean);
  try {
    await removeContainerAndVerify(context, cidFile, containerName, {
      artifactName,
      processRunner,
    });
  } catch (cleanupError) {
    throw combineDockerCleanupFailure(cleanupError, primaryFailures);
  }
  if (recordingError && controlFailure) {
    throw gateFailure(
      EXIT_CODES.INTERNAL,
      artifactName,
      "Docker result recording and process control both failed",
      new AggregateError(
        [recordingError, controlFailure],
        "multiple Docker scanner failures",
      ),
    );
  }
  if (recordingError) throw recordingError;
  if (controlFailure) throw controlFailure;
  return result;
}

function combineDockerCleanupFailure(cleanupError, primaryFailures) {
  const cleanupFailure = normalizeFailure(cleanupError);
  return gateFailure(
    EXIT_CODES.INTERNAL,
    "docker-cleanup",
    cleanupFailure.message,
    new AggregateError(
      [cleanupFailure, ...primaryFailures.map(normalizeFailure)],
      "Docker cleanup failed after scanner execution",
    ),
  );
}

export function assertNetworkMountIsolation(repositoryRoot, mounts, network) {
  if (network === "none") return true;
  const root = path.resolve(repositoryRoot);
  for (const mount of mounts) {
    const match = /(?:^|,)src=([^,]+),dst=/u.exec(mount);
    if (!match) {
      throw new ContractError(
        "Docker mount is not in the canonical bind format",
      );
    }
    const source = path.resolve(match[1]);
    const relative = path.relative(root, source);
    if (
      relative === "" ||
      (!relative.startsWith(`..${path.sep}`) &&
        relative !== ".." &&
        !path.isAbsolute(relative))
    ) {
      throw new ContractError(
        "network-enabled containers cannot mount repository content",
      );
    }
  }
  return true;
}

export async function validateDockerMountSources(context, mounts, network) {
  assertNetworkMountIsolation(context.root, mounts, network);
  const temporaryRoot = path.resolve(
    context.temporaryRootReal ?? (await realpath(context.temporaryRoot)),
  );
  for (const mount of mounts) {
    const match = /(?:^|,)src=([^,]+),dst=/u.exec(mount);
    if (!match) {
      throw new ContractError(
        "Docker mount is not in the canonical bind format",
      );
    }
    const source = path.resolve(match[1]);
    const metadata = await lstat(source);
    if (
      metadata.isSymbolicLink() ||
      (!metadata.isDirectory() && !metadata.isFile())
    ) {
      throw new ContractError(
        "Docker mount source must be a regular non-link file or directory",
      );
    }
    const sourceReal = path.resolve(await realpath(source));
    if (path.relative(source, sourceReal) !== "") {
      throw new ContractError("Docker mount source must equal its real path");
    }
    const relative = path.relative(temporaryRoot, sourceReal);
    if (
      relative === "" ||
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw new ContractError(
        "Docker mount source must stay inside the verified R-016 temporary root",
      );
    }
  }
  return true;
}

export async function removeContainerAndVerify(
  context,
  _cidFile,
  containerName,
  { artifactName, processRunner = runProcess } = {},
) {
  const recordCleanup = async (phase, result) => {
    if (typeof artifactName === "string" && artifactName !== "") {
      await recordProcess(context, `${artifactName}-cleanup-${phase}`, result);
    }
  };
  const listExactContainer = async (phase) => {
    const listed = await processRunner({
      command: trustedExecutable("docker", context),
      args: ["container", "ls", "-aq", "--filter", `name=^/${containerName}$`],
      cwd: context.root,
      env: sanitizeDockerEnvironment(process.env, context.dockerConfig),
      timeoutMs: 30_000,
      maxOutputBytes: 1024 * 1024,
    });
    await recordCleanup(phase, listed);
    if (
      listed.exitCode !== 0 ||
      listed.timedOut ||
      listed.outputLimitExceeded ||
      listed.signal !== null ||
      typeof listed.stdout !== "string"
    ) {
      throw gateFailure(
        EXIT_CODES.INTERNAL,
        "docker-cleanup",
        "Docker daemon could not verify container absence",
      );
    }
    const ids = listed.stdout
      .split(/\r?\n/gu)
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (
      new Set(ids).size !== ids.length ||
      !ids.every((entry) => /^[0-9a-f]{12,64}$/u.test(entry))
    ) {
      throw gateFailure(
        EXIT_CODES.INTERNAL,
        "docker-cleanup",
        "Docker returned an invalid exact-name container inventory",
      );
    }
    return ids;
  };

  const existing = await listExactContainer("before");
  if (existing.length > 0) {
    const removal = await processRunner({
      command: trustedExecutable("docker", context),
      args: ["rm", "--force", ...existing],
      cwd: context.root,
      env: sanitizeDockerEnvironment(process.env, context.dockerConfig),
      timeoutMs: 30_000,
      maxOutputBytes: 1024 * 1024,
    });
    await recordCleanup("remove", removal);
    if (
      removal.exitCode !== 0 ||
      removal.timedOut ||
      removal.outputLimitExceeded ||
      removal.signal !== null
    ) {
      throw gateFailure(
        EXIT_CODES.INTERNAL,
        "docker-cleanup",
        "Docker container force-removal failed",
      );
    }
  }
  const remaining = await listExactContainer("after");
  if (remaining.length !== 0) {
    throw gateFailure(
      EXIT_CODES.INTERNAL,
      "docker-cleanup",
      "Docker container still exists after cleanup",
    );
  }
  return true;
}

function requireRawExit(result, accepted, label) {
  if (
    !Number.isInteger(result?.exitCode) ||
    !accepted.includes(result.exitCode)
  ) {
    throw gateFailure(
      EXIT_CODES.INTERNAL,
      "scanner-exit-contract",
      `${label} raw exit ${result?.exitCode ?? "missing"} is not accepted`,
    );
  }
  return result;
}

function requireVerdict(verdict, label) {
  if (verdict?.exitCode === EXIT_CODES.PASS) return verdict;
  const exitCode = Number.isInteger(verdict?.exitCode)
    ? verdict.exitCode
    : EXIT_CODES.INTERNAL;
  const detail = [
    ...(Array.isArray(verdict?.errors) ? verdict.errors : []),
    ...(Array.isArray(verdict?.findings)
      ? verdict.findings.slice(0, 20).map((finding) => canonicalJson(finding))
      : []),
  ].join("; ");
  throw gateFailure(
    exitCode,
    "policy-verdict",
    `${label} failed${detail ? `: ${detail}` : ""}`,
  );
}

async function recordProcess(context, name, result, artifactView) {
  const safeName = safeArtifactName(name);
  const processId = `PROCESS-${safeName.toUpperCase()}`;
  const view = artifactView ? artifactView(result) : result;
  const artifacts = [];
  for (const [stream, contents] of [
    ["stdout", view.stdout],
    ["stderr", view.stderr],
  ]) {
    const rawBytes = processStreamBytes(result, stream);
    const destination = path.join(context.rawRoot, `${safeName}.${stream}.log`);
    await writeFile(destination, contents, { flag: "wx", mode: 0o600 });
    artifacts.push({
      path: artifactRelative(context, destination),
      processId,
      rawSha256: sha256Hex(rawBytes),
      rawSize: rawBytes.length,
      redacted: contents !== result[stream],
      sha256: sha256Hex(contents),
      size: Buffer.byteLength(contents),
      stream,
    });
  }
  context.evidence.rawArtifacts.push(...artifacts);
  if (!context.rawArtifactSeals) context.rawArtifactSeals = new Map();
  for (const artifact of artifacts) {
    context.rawArtifactSeals.set(artifact.path, structuredClone(artifact));
  }
  const processCheck = {
    id: processId,
    status:
      result.timedOut || result.outputLimitExceeded || result.signal !== null
        ? "CONTROL_FAILURE"
        : "RECORDED",
    command: result.command,
    arguments: result.args,
    argumentCount: result.args.length,
    durationMs: result.durationMs,
    rawExit: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut,
    outputLimitExceeded: result.outputLimitExceeded,
    artifacts: artifacts.map(({ path: artifactPath }) => artifactPath),
  };
  context.evidence.checks.push(processCheck);
  if (!context.processSeals) context.processSeals = new Map();
  context.processSeals.set(processId, structuredClone(processCheck));
}

function recordTerminalCheck(context, check) {
  if (!check || typeof check.id !== "string" || !check.id.startsWith("R016-")) {
    throw new ContractError("terminal evidence check identity is invalid");
  }
  if (!context.terminalSeals) context.terminalSeals = new Map();
  if (context.terminalSeals.has(check.id)) {
    throw new ContractError(`duplicate terminal evidence check ${check.id}`);
  }
  const sealed = structuredClone(check);
  context.evidence.checks.push(check);
  context.terminalSeals.set(check.id, sealed);
}

function processEvidenceReference(context, artifactName) {
  const processId = `PROCESS-${safeArtifactName(artifactName).toUpperCase()}`;
  const artifacts = context.evidence.rawArtifacts.filter(
    (artifact) => artifact.processId === processId,
  );
  const stdout = artifacts.find((artifact) => artifact.stream === "stdout");
  const stderr = artifacts.find((artifact) => artifact.stream === "stderr");
  if (artifacts.length !== 2 || !stdout || !stderr) {
    throw new ContractError(
      `process evidence reference ${processId} is incomplete`,
    );
  }
  return {
    processId,
    stdoutSha256: stdout.sha256,
    stdoutRawSha256: stdout.rawSha256,
    stderrSha256: stderr.sha256,
    stderrRawSha256: stderr.rawSha256,
  };
}

function processStreamBytes(result, stream) {
  const bytes = result?.[`${stream}Bytes`];
  if (bytes instanceof Uint8Array) return bytes;
  const value = result?.[stream];
  if (typeof value !== "string") {
    throw new ContractError(`process ${stream} bytes are absent`);
  }
  return Buffer.from(value, "utf8");
}

async function readTrackedInput(context, repositoryPath, label) {
  return readTrackedRepositoryInput(context, repositoryPath, label, {
    cache: context.trackedBlobCache,
    cacheName: "trackedBlobCache",
    index: context.trackedIndex,
    processPrefix: "git-blob",
    repositoryRoot: context.root,
  });
}

async function readTrackedControlInput(context, repositoryPath, label) {
  return readTrackedRepositoryInput(context, repositoryPath, label, {
    cache: context.controlTrackedBlobCache,
    cacheName: "controlTrackedBlobCache",
    index: context.controlTrackedIndex,
    processPrefix: "git-control-blob",
    repositoryRoot: context.controlRoot,
  });
}

async function readTrackedRepositoryInput(
  context,
  repositoryPath,
  label,
  { cache, cacheName, index, processPrefix, repositoryRoot },
) {
  const entry = requireTrackedRegularFile(index, repositoryPath, label);
  const cached = cache?.get(repositoryPath);
  if (cached) {
    if (cached.objectId !== entry.objectId) {
      throw new ContractError(`${label} cached Git object identity changed`);
    }
    assertGitBlobObjectId(cached.bytes, entry.objectId, label);
    return Buffer.from(cached.bytes);
  }
  const result = await runChecked(
    context,
    `${processPrefix}-${sha256Hex(repositoryPath).slice(0, 20)}`,
    "internal",
    "git",
    ["-C", repositoryRoot, "cat-file", "blob", entry.objectId],
    {
      artifactView: trackedBlobArtifactView,
      maxOutputBytes: 256 * 1024 * 1024,
    },
  );
  const bytes = Buffer.from(result.stdoutBytes);
  assertGitBlobObjectId(bytes, entry.objectId, label);
  if (!context[cacheName]) context[cacheName] = new Map();
  context[cacheName].set(repositoryPath, {
    bytes: Buffer.from(bytes),
    objectId: entry.objectId,
  });
  return Buffer.from(bytes);
}

function trackedBlobArtifactView(result) {
  const stdoutBytes = processStreamBytes(result, "stdout");
  const stderrBytes = processStreamBytes(result, "stderr");
  return {
    stdout: `${canonicalJson({
      redacted: true,
      sha256: sha256Hex(stdoutBytes),
      size: stdoutBytes.length,
    })}\n`,
    stderr: `${canonicalJson({
      redacted: true,
      sha256: sha256Hex(stderrBytes),
      size: stderrBytes.length,
    })}\n`,
  };
}

export async function prepareArtifactDirectories(root, artifactRoot, rawRoot) {
  const rootReal = await realpath(root);
  const artifactsDirectory = path.join(root, "artifacts");
  let artifactsInfo;
  try {
    artifactsInfo = await lstat(artifactsDirectory);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await mkdir(artifactsDirectory, { recursive: false });
    artifactsInfo = await lstat(artifactsDirectory);
  }
  if (!artifactsInfo.isDirectory() || artifactsInfo.isSymbolicLink()) {
    throw new ContractError("artifact root must be a real local directory");
  }
  const artifactsReal = await realpath(artifactsDirectory);
  const relative = path.relative(rootReal, artifactsReal);
  if (
    relative === "" ||
    relative.startsWith(`..${path.sep}`) ||
    relative === ".." ||
    path.isAbsolute(relative)
  ) {
    throw new ContractError("artifact root resolves outside the repository");
  }
  const gateDirectory = path.join(artifactsDirectory, "r016");
  let gateInfo;
  try {
    gateInfo = await lstat(gateDirectory);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await mkdir(gateDirectory, { recursive: false });
    gateInfo = await lstat(gateDirectory);
  }
  if (!gateInfo.isDirectory() || gateInfo.isSymbolicLink()) {
    throw new ContractError(
      "R-016 artifact directory must be a real directory",
    );
  }
  const gateReal = await realpath(gateDirectory);
  const gateRelative = path.relative(artifactsReal, gateReal);
  if (gateRelative !== "r016" || path.dirname(artifactRoot) !== gateDirectory) {
    throw new ContractError("R-016 artifact directory containment is invalid");
  }
  await mkdir(artifactRoot, { recursive: false });
  await mkdir(rawRoot, { recursive: false });
}

function dockerMount(source, destination, readOnly) {
  return `type=bind,src=${path.resolve(source)},dst=${destination}${readOnly ? ",readonly" : ""}`;
}

async function hashFile(file) {
  const sha256 = createHash("sha256");
  const md5 = createHash("md5");
  let contentLength = 0;
  for await (const chunk of createReadStream(file)) {
    contentLength += chunk.length;
    sha256.update(chunk);
    md5.update(chunk);
  }
  return {
    contentLength,
    md5: md5.digest("hex"),
    sha256: sha256.digest("hex"),
  };
}

function boundedFailureText(value, maximumLength) {
  const normalized = String(value ?? "")
    .replaceAll(/[\u0000-\u001f\u007f]/gu, " ")
    .trim();
  if (normalized.length <= maximumLength) return normalized;
  return `${normalized.slice(0, maximumLength - 1)}…`;
}

export function boundedFailureRecord(failure, depth = 0) {
  if (!failure || typeof failure !== "object" || depth > 4) {
    return {
      message: "failure detail unavailable",
      type: "Error",
    };
  }
  const record = {
    message: boundedFailureText(failure.message, 512) || "unknown failure",
    type: boundedFailureText(failure.type, 80) || "Error",
  };
  if (Number.isInteger(failure.exitCode)) record.exitCode = failure.exitCode;
  if (typeof failure.stage === "string" && failure.stage !== "") {
    record.stage = boundedFailureText(failure.stage, 120);
  }
  if (Array.isArray(failure.causes) && failure.causes.length > 0) {
    record.causes = failure.causes
      .slice(0, 8)
      .map((cause) => boundedFailureRecord(cause, depth + 1));
  }
  return record;
}

export function failureSummaryForConsole(evidence) {
  return canonicalJson({
    artifactType: "R016_FAILURE_SUMMARY",
    exitCode: Number.isInteger(evidence?.exitCode)
      ? evidence.exitCode
      : EXIT_CODES.INTERNAL,
    failure: boundedFailureRecord(evidence?.failure),
    status: "FAIL",
  });
}

export async function writeEvidenceFinalizationFailure(context) {
  const sourceIdentity = (candidate) => {
    const identity = {};
    for (const key of ["head", "tree"]) {
      const value = candidate?.[key];
      if (typeof value === "string" && /^[0-9a-f]{40}$/u.test(value)) {
        identity[key] = value;
      }
    }
    return identity;
  };
  const source = sourceIdentity(context.evidence?.source);
  const controlSource = sourceIdentity(context.evidence?.controlSource);
  const fallback = {
    artifactType: "R016_EVIDENCE_FINALIZATION_FAILURE",
    fallbackSchemaVersion: 1,
    gateId: "R-016",
    runId:
      typeof context.runId === "string" && context.runId !== ""
        ? boundedFailureText(context.runId, 160)
        : "unknown",
    status: "FAIL",
    exitCode: EXIT_CODES.INTERNAL,
    startedAt:
      typeof context.evidence?.startedAt === "string"
        ? boundedFailureText(context.evidence.startedAt, 80)
        : "unknown",
    finishedAt:
      typeof context.evidence?.finishedAt === "string"
        ? boundedFailureText(context.evidence.finishedAt, 80)
        : new Date().toISOString(),
    failure: boundedFailureRecord(context.evidence?.failure),
    ...(Object.keys(source).length > 0 && { source }),
    ...(Object.keys(controlSource).length > 0 && { controlSource }),
  };
  const temporary = path.join(
    context.artifactRoot,
    ".evidence-finalization-failure.json.tmp",
  );
  const destination = path.join(
    context.artifactRoot,
    "evidence-finalization-failure.json",
  );
  await rm(path.join(context.artifactRoot, ".evidence.json.tmp"), {
    force: true,
  });
  await writeAtomicExclusive(
    destination,
    temporary,
    `${canonicalJson(fallback)}\n`,
  );
}

async function writeEvidence(context) {
  await verifyArtifactFilesystemSeals(context);
  validateEvidenceDocument(context.evidence, context.evidenceSchema, {
    ...context.evidenceValidation,
    controlInputsSeal: context.controlInputsSeal,
    controlRoot: context.controlRoot,
    controlSourceSeal: context.controlSourceSeal,
    controlTrackedBlobCache: context.controlTrackedBlobCache,
    controlTrackedIndex: context.controlTrackedIndex,
    databaseArchiveSeal: context.databaseArchiveSeal,
    databaseIdentitySeal: context.databaseIdentitySeal,
    dockerEnvironmentSeal: context.dockerEnvironmentSeal,
    environmentSeal: context.environmentSeal,
    inputsSeal: context.inputsSeal,
    processSeals: context.processSeals,
    rawArtifactSeals: context.rawArtifactSeals,
    repositoryUseSeal: context.repositoryUseSeal,
    root: context.root,
    sourceSeal: context.sourceSeal,
    terminalSeals: context.terminalSeals,
    temporaryRoot: context.temporaryRootReal ?? context.temporaryRoot,
    toolExecutionSeals: context.toolExecutionSeals,
    toolsSeal: context.toolsSeal,
    trackedBlobCache: context.trackedBlobCache,
    trackedIndex: context.trackedIndex,
    verdictExecutionSeals: context.verdictExecutionSeals,
  });
  const destination = path.join(context.artifactRoot, "evidence.json");
  const temporary = path.join(context.artifactRoot, ".evidence.json.tmp");
  const contents = `${canonicalJson(context.evidence)}\n`;
  await writeAtomicExclusive(destination, temporary, contents);
}

async function writeAtomicExclusive(destination, temporary, contents) {
  await writeFile(temporary, contents, { flag: "wx", mode: 0o600 });
  try {
    await link(temporary, destination);
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
}

export async function verifyArtifactFilesystemSeals(context) {
  const verify = async (relativePath, expectedSha256, expectedSize) => {
    if (
      typeof relativePath !== "string" ||
      relativePath === "" ||
      relativePath.includes("\\")
    ) {
      throw new ContractError("artifact seal path is invalid");
    }
    const destination = path.resolve(
      context.artifactRoot,
      ...relativePath.split("/"),
    );
    const relative = path.relative(context.artifactRoot, destination);
    if (
      relative === "" ||
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw new ContractError("artifact seal path escapes the run directory");
    }
    const information = await lstat(destination);
    if (!information.isFile() || information.isSymbolicLink()) {
      throw new ContractError(
        `artifact ${relativePath} must be a regular non-symlink file`,
      );
    }
    const identity = await hashFile(destination);
    if (
      identity.sha256 !== expectedSha256 ||
      (expectedSize !== undefined && identity.contentLength !== expectedSize)
    ) {
      throw new ContractError(
        `artifact ${relativePath} changed after its trusted seal`,
      );
    }
  };

  for (const artifact of context.evidence.rawArtifacts) {
    await verify(artifact.path, artifact.sha256, artifact.size);
  }
  if (context.evidence.status === "PASS") {
    await verify(
      context.evidence.databaseSeal.path,
      context.evidence.databaseSeal.sha256,
    );
  }
  return true;
}

async function removeVerifiedTemporaryRoot(temporaryRoot) {
  const resolved = path.resolve(temporaryRoot);
  const parent = path.resolve(os.tmpdir());
  if (
    path.dirname(resolved) !== parent ||
    !path.basename(resolved).startsWith("hedefora-r016-")
  ) {
    throw new Error(`refusing to remove unexpected temporary path ${resolved}`);
  }
  await rm(resolved, { recursive: true, force: true });
}

function normalizeFailure(error) {
  if (error instanceof GateFailure) return error;
  if (error instanceof DatabaseAcquisitionError) {
    return gateFailure(
      EXIT_CODES.ACQUISITION,
      "database-acquisition",
      error.message,
      error,
    );
  }
  if (
    error instanceof ContractError ||
    error instanceof InventoryContractError
  ) {
    return gateFailure(EXIT_CODES.CONTRACT, "contract", error.message, error);
  }
  if (
    error instanceof ProcessContractError ||
    error instanceof ProcessLaunchError ||
    error instanceof ProcessOutputEncodingError
  ) {
    return gateFailure(
      EXIT_CODES.INTERNAL,
      "process-control",
      error.message,
      error,
    );
  }
  return gateFailure(
    EXIT_CODES.INTERNAL,
    "internal",
    error instanceof Error ? error.message : "unknown internal failure",
    error instanceof Error ? error : undefined,
  );
}

export function serializeFailureForEvidence(error) {
  const seen = new Set();
  let remaining = 16;

  const serialize = (candidate, depth) => {
    if (remaining <= 0 || depth > 4 || seen.has(candidate)) return null;
    remaining -= 1;
    if (candidate && typeof candidate === "object") seen.add(candidate);

    const record = {
      message:
        candidate instanceof Error
          ? candidate.message
          : typeof candidate === "string"
            ? candidate
            : "unknown failure",
      type:
        candidate instanceof Error && candidate.name ? candidate.name : "Error",
    };
    if (Number.isInteger(candidate?.exitCode)) {
      record.exitCode = candidate.exitCode;
    }
    if (typeof candidate?.stage === "string" && candidate.stage !== "") {
      record.stage = candidate.stage;
    }

    const nested = [];
    if (candidate instanceof AggregateError) nested.push(...candidate.errors);
    else if (candidate instanceof Error && candidate.cause !== undefined) {
      nested.push(candidate.cause);
    }
    const causes = nested
      .map((cause) => serialize(cause, depth + 1))
      .filter(Boolean);
    if (causes.length > 0) record.causes = causes;
    return record;
  };

  return (
    serialize(error, 0) ?? {
      message: "failure cause limit exceeded",
      type: "Error",
    }
  );
}

function gateFailure(exitCode, stage, detail, cause) {
  return new GateFailure(exitCode, stage, detail, cause);
}

function relativeInput(root, file, bytes) {
  return {
    path: path.relative(root, file).replaceAll(path.sep, "/"),
    sha256: sha256Hex(bytes),
    size: bytes.length,
  };
}

function artifactRelative(context, file) {
  return path.relative(context.artifactRoot, file).replaceAll(path.sep, "/");
}

function safeArtifactName(value) {
  return value.replaceAll(/[^A-Za-z0-9._-]/gu, "-");
}

function validateHexDigest(value, length, label) {
  if (
    typeof value !== "string" ||
    !new RegExp(`^[0-9a-f]{${length}}$`, "u").test(value)
  ) {
    throw new ContractError(
      `${label} must be ${length} lowercase hexadecimal characters`,
    );
  }
}

function requiredEvidenceString(value, label) {
  if (typeof value !== "string" || value === "") {
    throw new ContractError(`${label} must be a nonempty string`);
  }
  return value;
}

function escapeRegularExpression(value) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function explicitDate(value, label) {
  const date =
    value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new TypeError(`${label} must be valid`);
  return date;
}

if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  const trustedExecutables =
    process.platform === "linux" && process.env.GITHUB_ACTIONS === "true"
      ? undefined
      : parseTrustedExecutableArguments(process.argv.slice(2));
  const result = await executeSupplyChainGate({ trustedExecutables });
  if (result.evidence.status === "FAIL") {
    process.stderr.write(`${failureSummaryForConsole(result.evidence)}\n`);
  }
  process.stdout.write(
    `${result.evidence.status} R-016 (${result.exitCode}); evidence: ${result.artifactRoot}\n`,
  );
  process.exitCode = result.exitCode;
}
