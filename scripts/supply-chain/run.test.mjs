import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ContractError,
  EXIT_CODES,
  canonicalJson,
  evaluateOsvVulnerabilities,
  parseStrictJson,
  sha256Hex,
} from "./policy.mjs";
import { parseGitIndex } from "./contracts.mjs";
import {
  assertNetworkMountIsolation,
  assertOsvGoAdvisoryCanary,
  assertOsvGoLicenseCanary,
  assertOsvMissingDatabaseFailure,
  assertOsvExtractionCoverage,
  applyTemporaryCleanupFailure,
  expectedCheckoutShaIsRequired,
  failureSummaryForConsole,
  goModuleEnvironment,
  inspectTrustedExecutableFiles,
  isProtectedControlPath,
  osvCanaryArguments,
  osvGoCanaryArguments,
  osvGoLicenseCanaryArguments,
  osvLicenseCanaryArguments,
  osvScanArguments,
  parseJsonSequence,
  parseTrustedExecutableArguments,
  prepareArtifactDirectories,
  removeContainerAndVerify,
  runDocker,
  sanitizeDockerEnvironment,
  sanitizeGitEnvironment,
  serializeFailureForEvidence,
  semgrepArguments,
  semgrepArtifactView,
  trustedExecutable,
  validateFinalSourceSnapshot,
  validateConfiguration,
  validateControlModuleRoot,
  validateControlRootSeparation,
  validateDatabaseArchiveReport,
  validateDockerMountSources,
  validateDeclaredRepositoryRealPath,
  validateExpectedCheckoutSha,
  validateExpectedControlSha,
  validateImageIndex,
  validateImageInspection,
  validateNodeRuntimeVersion,
  validateOsvVulnerabilityCanaryFixture,
  validateOsvVulnerabilityCanaryScannerIdentity,
  validateProtectedControlPlane,
  validateRepositoryBinding,
  verifyArtifactFilesystemSeals,
  writeEvidenceFinalizationFailure,
  writeEvidenceWithoutMaskingFailure,
} from "./run.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const policy = parseStrictJson(
  await readFile(
    path.join(repositoryRoot, "security", "supply-chain-policy.json"),
  ),
  "test policy",
);
const scanners = parseStrictJson(
  await readFile(path.join(repositoryRoot, "security", "scanners.lock.json")),
  "test scanner lock",
);
const trustedDockerBinary = path.resolve(
  repositoryRoot,
  process.platform === "win32" ? "docker.exe" : "docker",
);
const trustedGitBinary = path.resolve(
  repositoryRoot,
  process.platform === "win32" ? "git.exe" : "git",
);

test("current R-016 policy and scanner lock satisfy the wrapper contract", () => {
  assert.equal(validateConfiguration(policy, scanners), true);
  assert.equal(
    validateNodeRuntimeVersion("v24.20.0", policy.runtime.nodeVersion),
    true,
  );
  assert.throws(
    () => validateNodeRuntimeVersion("v24.19.0", policy.runtime.nodeVersion),
    /requires Node v24\.20\.0/u,
  );
});

test("CI R-016 step binds the exact checkout and hard-pinned trusted Node", async () => {
  const workflow = (
    await readFile(
      path.join(repositoryRoot, ".github", "workflows", "ci.yml"),
      "utf8",
    )
  ).replaceAll("\r\n", "\n");
  const gateStart = workflow.indexOf("      - name: Run pinned R-016 gate\n");
  const gateEnd = workflow.indexOf("\n      - name:", gateStart + 1);
  assert.notEqual(gateStart, -1);
  assert.notEqual(gateEnd, -1);
  const gateStep = workflow.slice(gateStart, gateEnd);
  assert.match(
    gateStep,
    /EXPECTED_CHECKOUT_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/u,
  );
  assert.match(gateStep, /realpath "\$\{RUNNER_TOOL_CACHE\}"/u);
  assert.match(gateStep, /node_entry="\$\(command -v node\)"/u);
  assert.match(
    gateStep,
    /\[\[ "\$\{node_binary\}" == "\$\{trusted_tool_cache\}\/"\* \]\]/u,
  );
  assert.match(
    gateStep,
    /"\$\{node_binary\}" scripts\/supply-chain\/run\.mjs/u,
  );
  assert.match(gateStep, /\n\s+id: r016\n/u);
  assert.match(gateStep, /if \[\[ -e artifacts\/r016 \]\]; then/u);
  assert.match(
    gateStep,
    /find artifacts\/r016 -mindepth 1 -maxdepth 1 -type d -print0/u,
  );
  assert.match(gateStep, /"\$\{#artifact_directories\[@\]\}" -eq 1/u);
  assert.match(
    gateStep,
    /for evidence_name in evidence\.json evidence-finalization-failure\.json; do/u,
  );
  assert.match(gateStep, /"\$\{evidence_count\}" -eq 1/u);
  assert.match(
    gateStep,
    /printf 'artifact_path=%s\\n'.*>> "\$\{GITHUB_OUTPUT\}"/u,
  );
  assert.doesNotMatch(gateStep, /pnpm supply-chain:test/u);
  assert.match(
    workflow,
    /- name: Set up exact trusted Node\.js\n\s+uses: actions\/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6\.4\.0\n\s+with:\n\s+node-version: 24\.20\.0\n\s+check-latest: false\n\s+package-manager-cache: false\n/u,
  );
  const supplyChainJob = workflow.slice(
    workflow.indexOf("  supply-chain:\n"),
    workflow.indexOf("\n  dependency-review:\n"),
  );
  assert.match(supplyChainJob, /if: github\.event_name == 'push'/u);
  assert.doesNotMatch(supplyChainJob, /pnpm\/setup|node-version-file/u);
  assert.match(
    supplyChainJob,
    /- name: Upload R-016 evidence\n\s+if: always\(\)\n\s+uses: actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7\.0\.1\n\s+with:\n\s+name: r016-\$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}\n\s+path: \$\{\{ steps\.r016\.outputs\.artifact_path \}\}\n\s+if-no-files-found: error\n\s+retention-days: 7/u,
  );
  const qualityJob = workflow.slice(
    workflow.indexOf("  quality:\n"),
    workflow.indexOf("\n  supply-chain:\n"),
  );
  assert.match(qualityJob, /run: pnpm ci:check/u);
  const packageDocument = parseStrictJson(
    await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
    "package.json",
  );
  assert.match(
    packageDocument.scripts.test,
    /node --test scripts\/\*\.test\.mjs scripts\/supply-chain\/\*\.test\.mjs/u,
  );
});

test("trusted PR gate keeps control code on the immutable base checkout", async () => {
  const workflow = (
    await readFile(
      path.join(repositoryRoot, ".github", "workflows", "r016-trusted-pr.yml"),
      "utf8",
    )
  ).replaceAll("\r\n", "\n");
  assert.match(workflow, /\non:\n  pull_request_target:/u);
  assert.match(workflow, /permissions:\n  contents: read/u);
  assert.match(
    workflow,
    /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}\n\s+path: control/u,
  );
  assert.match(
    workflow,
    /repository: \$\{\{ github\.event\.pull_request\.head\.repo\.full_name \}\}\n\s+ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}\n\s+path: target/u,
  );
  assert.match(
    workflow,
    /await import\(pathToFileURL\(process\.env\.CONTROL_RUNNER\)\.href\)/u,
  );
  const importOffset = workflow.indexOf(
    "await import(pathToFileURL(process.env.CONTROL_RUNNER).href)",
  );
  const bootstrapOffset = workflow.indexOf("trusted_control_modules=(");
  assert.notEqual(bootstrapOffset, -1);
  assert.ok(bootstrapOffset < importOffset);
  const expectedControlModules = new Set(["run.mjs"]);
  for (const moduleName of expectedControlModules) {
    const source = await readFile(
      path.join(repositoryRoot, "scripts", "supply-chain", moduleName),
      "utf8",
    );
    for (const match of source.matchAll(/from "\.\/([^"/]+\.mjs)"/gu)) {
      expectedControlModules.add(match[1]);
    }
  }
  const bootstrap = workflow.slice(bootstrapOffset, importOffset);
  const listedControlModules = [
    ...bootstrap.matchAll(/^\s+scripts\/supply-chain\/([^\s/]+\.mjs)$/gmu),
  ].map((match) => match[1]);
  assert.deepEqual(
    listedControlModules.sort((left, right) => left.localeCompare(right)),
    [...expectedControlModules].sort((left, right) =>
      left.localeCompare(right),
    ),
  );
  assert.match(
    bootstrap,
    /\/usr\/bin\/git -C "\$\{CONTROL_ROOT\}" ls-files --stage/u,
  );
  assert.match(bootstrap, /"\$\{module_mode\}" == "100644"/u);
  assert.match(
    bootstrap,
    /-f "\$\{module_absolute\}" && ! -L "\$\{module_absolute\}"/u,
  );
  assert.match(
    bootstrap,
    /\/usr\/bin\/git -C "\$\{CONTROL_ROOT\}" hash-object/u,
  );
  assert.match(
    workflow,
    /control\.failureSummaryForConsole\(result\.evidence\)/u,
  );
  assert.match(workflow, /repositoryRoot: process\.env\.TARGET_ROOT/u);
  assert.match(workflow, /controlRoot: process\.env\.CONTROL_ROOT/u);
  assert.match(
    workflow,
    /expectedCheckoutSha: process\.env\.EXPECTED_CHECKOUT_SHA/u,
  );
  assert.match(
    workflow,
    /expectedControlSha: process\.env\.EXPECTED_CONTROL_SHA/u,
  );
  assert.match(
    workflow,
    /CONTROL_ROOT: \$\{\{ github\.workspace \}\}\/control/u,
  );
  assert.match(
    workflow,
    /EXPECTED_CHECKOUT_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/u,
  );
  assert.match(
    workflow,
    /EXPECTED_CONTROL_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/u,
  );
  assert.match(
    workflow,
    /\/usr\/bin\/git -C target rev-parse HEAD\)" == "\$\{EXPECTED_CHECKOUT_SHA\}"/u,
  );
  assert.match(
    workflow,
    /uses: actions\/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6\.4\.0\n\s+with:\n\s+node-version: 24\.20\.0\n\s+check-latest: false\n\s+package-manager-cache: false/u,
  );
  assert.match(workflow, /realpath "\$\{RUNNER_TOOL_CACHE\}"/u);
  assert.match(workflow, /\[\[ -x \/usr\/bin\/git \]\]/u);
  assert.match(workflow, /\[\[ -x \/usr\/bin\/docker \]\]/u);
  assert.match(workflow, /\[\[ ! -e target\/artifacts\/r016 \]\]/u);
  assert.doesNotMatch(
    workflow,
    /(?:node|pnpm)\s+target\/scripts\/supply-chain|uses:\s+\.\/target/u,
  );
  assert.match(
    workflow,
    /path: \$\{\{ steps\.r016\.outputs\.artifact_path \}\}/u,
  );
  assert.match(
    workflow,
    /find target\/artifacts\/r016 -mindepth 1 -maxdepth 1 -type d -print0/u,
  );
  assert.match(
    workflow,
    /for evidence_name in evidence\.json evidence-finalization-failure\.json; do/u,
  );
  assert.match(workflow, /"\$\{evidence_count\}" -eq 1/u);
  assert.match(
    workflow,
    /if find "\$\{artifact_path\}" -type l -print -quit \| grep -q \.; then/u,
  );
  assert.match(
    workflow,
    /- name: Upload exact R-016 evidence\n\s+if: always\(\)\n\s+uses: actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7\.0\.1\n\s+with:\n\s+name: r016-\$\{\{ github\.event\.pull_request\.head\.sha \}\}\n\s+path: \$\{\{ steps\.r016\.outputs\.artifact_path \}\}\n\s+if-no-files-found: error\n\s+retention-days: 7/u,
  );
});

test("Git routing environment is minimal and source binding is exact", () => {
  const sanitized = sanitizeGitEnvironment({
    GITHUB_ACTIONS: "true",
    GIT_ALTERNATE_OBJECT_DIRECTORIES: "/attacker/objects",
    GIT_CONFIG_COUNT: "2",
    GIT_DIR: "/attacker/repo.git",
    GIT_INDEX_FILE: "/attacker/index",
    GIT_OBJECT_DIRECTORY: "/attacker/objects",
    GIT_TRACE: "1",
    GIT_WORK_TREE: "/attacker/tree",
    HOME: "/home/runner",
    LD_PRELOAD: "/attacker/preload.so",
    PATH: "/attacker/bin:/usr/bin",
    RUNNER_TEMP: "/runner/temp",
  });
  for (const forbidden of [
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_DIR",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_TRACE",
    "GIT_WORK_TREE",
    "LD_PRELOAD",
  ]) {
    assert.equal(sanitized[forbidden], undefined);
  }
  assert.equal(sanitized.GIT_CONFIG_COUNT, "0");
  if (process.platform === "linux") {
    assert.equal(sanitized.PATH, "/usr/bin:/bin");
  } else {
    assert.equal(sanitized.PATH, "");
  }

  const gitDirectory = path.join(
    repositoryRoot,
    ".git",
    "worktrees",
    "fixture",
  );
  assert.deepEqual(
    validateRepositoryBinding(repositoryRoot, repositoryRoot, gitDirectory),
    {
      gitDirectory: path.resolve(gitDirectory),
      topLevel: path.resolve(repositoryRoot),
    },
  );
  assert.throws(
    () =>
      validateRepositoryBinding(
        repositoryRoot,
        path.join(repositoryRoot, "poisoned"),
        gitDirectory,
      ),
    /not the requested repository root/u,
  );
  const head = "a".repeat(40);
  assert.equal(validateExpectedCheckoutSha(head, head, "true"), head);
  assert.equal(expectedCheckoutShaIsRequired(true, "false"), false);
  assert.equal(expectedCheckoutShaIsRequired(false, "false"), true);
  assert.equal(
    validateExpectedCheckoutSha(head, undefined, "false", true),
    null,
  );
  assert.throws(
    () => validateExpectedCheckoutSha(head, undefined, "false", false),
    /requires EXPECTED_CHECKOUT_SHA/u,
  );
  assert.throws(
    () => expectedCheckoutShaIsRequired("split-root", "false"),
    /source-root mode must be a boolean/u,
  );
  assert.throws(
    () => validateExpectedCheckoutSha(head, undefined, "true"),
    /requires EXPECTED_CHECKOUT_SHA/u,
  );
  assert.throws(
    () => validateExpectedCheckoutSha(head, "b".repeat(40), "true"),
    /does not match/u,
  );
  assert.equal(validateExpectedControlSha(head, head), head);
  assert.throws(
    () => validateExpectedControlSha(head, undefined),
    /requires EXPECTED_CONTROL_SHA/u,
  );
});

test("target and trusted control roots are disjoint and protected Git objects stay exact", () => {
  const targetRoot = path.resolve(repositoryRoot, "target-fixture");
  const controlRoot = path.resolve(repositoryRoot, "control-fixture");
  assert.equal(validateControlRootSeparation(targetRoot, targetRoot), true);
  assert.equal(
    validateControlModuleRoot(controlRoot, controlRoot),
    controlRoot,
  );
  assert.throws(
    () => validateControlModuleRoot(targetRoot, controlRoot),
    /repository that supplied the imported runner/u,
  );
  assert.equal(
    validateDeclaredRepositoryRealPath(targetRoot, targetRoot, "target"),
    targetRoot,
  );
  assert.throws(
    () =>
      validateDeclaredRepositoryRealPath(
        path.join(targetRoot, "alias"),
        targetRoot,
        "target",
      ),
    /path must equal its real path/u,
  );
  assert.equal(validateControlRootSeparation(targetRoot, controlRoot), false);
  assert.throws(
    () =>
      validateControlRootSeparation(
        targetRoot,
        path.join(targetRoot, "nested-control"),
      ),
    /must not contain each other/u,
  );

  const protectedPaths = [
    ".github/workflows/ci.yml",
    ".github/workflows/r016-trusted-pr.yml",
    "scripts/fixtures/supply-chain/go-license-denied.mod.txt",
    "scripts/fixtures/supply-chain/license-denied-pnpm-lock.yaml.txt",
    "scripts/fixtures/supply-chain/sast-go-blocking.go.txt",
    "scripts/fixtures/supply-chain/vulnerable-go.mod.txt",
    "scripts/fixtures/supply-chain/vulnerable-pnpm-lock.yaml.txt",
    "scripts/supply-chain/contracts.mjs",
    "scripts/supply-chain/run.mjs",
    "security/osv-scanner.toml",
    "security/r016-evidence.schema.json",
    "security/scanners.lock.json",
    "security/supply-chain-policy.json",
    "tools/osvdbcheck/cmd/osvdbcheck/main.go",
    "tools/osvdbcheck/cmd/osvdbcheck/main_test.go",
  ];
  const entry = (repositoryPath, objectId = "a".repeat(40)) => ({
    mode: "100644",
    objectId,
    path: repositoryPath,
    stage: 0,
  });
  const control = new Map(
    protectedPaths.map((repositoryPath) => [
      repositoryPath,
      entry(repositoryPath),
    ]),
  );
  const target = new Map(control);
  target.set("pnpm-lock.yaml", entry("pnpm-lock.yaml", "b".repeat(40)));
  target.set("go.mod", entry("go.mod", "c".repeat(40)));
  target.set("apps/web/src/App.tsx", entry("apps/web/src/App.tsx"));
  assert.equal(isProtectedControlPath("scripts/supply-chain/run.mjs"), true);
  assert.equal(isProtectedControlPath("pnpm-lock.yaml"), false);
  assert.equal(
    validateProtectedControlPlane(target, control, true).entries.length,
    protectedPaths.length,
  );

  for (const repositoryPath of protectedPaths) {
    const changed = new Map(target);
    changed.set(repositoryPath, entry(repositoryPath, "d".repeat(40)));
    assert.throws(
      () => validateProtectedControlPlane(changed, control, true),
      /differ from the trusted base/u,
      repositoryPath,
    );
  }

  for (const mutate of [
    (copy) => copy.delete("scripts/supply-chain/run.mjs"),
    (copy) =>
      copy.set(
        "scripts/supply-chain/extra.mjs",
        entry("scripts/supply-chain/extra.mjs"),
      ),
    (copy) =>
      copy.set(".github/workflows/ci.yml", {
        ...entry(".github/workflows/ci.yml"),
        mode: "100755",
      }),
  ]) {
    const changed = new Map(target);
    mutate(changed);
    assert.throws(
      () => validateProtectedControlPlane(changed, control, true),
      /differ from the trusted base/u,
    );
  }
});

test("local executable routing requires canonical absolute Git and Docker paths", () => {
  assert.equal(
    trustedExecutable("git", {
      trustedExecutables: { git: trustedGitBinary },
    }),
    process.platform === "linux" && process.env.GITHUB_ACTIONS === "true"
      ? "/usr/bin/git"
      : trustedGitBinary,
  );
  assert.equal(
    trustedExecutable("docker", {
      trustedExecutables: { docker: trustedDockerBinary },
    }),
    process.platform === "linux" && process.env.GITHUB_ACTIONS === "true"
      ? "/usr/bin/docker"
      : trustedDockerBinary,
  );
  if (!(
    process.platform === "linux" && process.env.GITHUB_ACTIONS === "true"
  )) {
    assert.throws(
      () => trustedExecutable("git", { trustedExecutables: {} }),
      /R016 Git binary.*absolute executable path/u,
    );
    assert.throws(
      () =>
        trustedExecutable("docker", {
          trustedExecutables: {
            docker: path.resolve(repositoryRoot, "attacker.exe"),
          },
        }),
      /invalid executable name/u,
    );
  }
});

test("trusted executable CLI input is explicit and repository-local binaries fail", async () => {
  assert.deepEqual(
    {
      ...parseTrustedExecutableArguments([
        `--git-binary=${trustedGitBinary}`,
        `--docker-binary=${trustedDockerBinary}`,
      ]),
    },
    { docker: trustedDockerBinary, git: trustedGitBinary },
  );
  assert.throws(
    () => parseTrustedExecutableArguments([`--git-binary=${trustedGitBinary}`]),
    /requires --git-binary/u,
  );
  const root = await mkdtemp(
    path.join(os.tmpdir(), "hedefora-executable-test-"),
  );
  try {
    const repository = path.join(root, "repository");
    const controlRepository = path.join(root, "control-repository");
    const temporary = path.join(root, "temporary");
    await Promise.all([
      mkdir(repository),
      mkdir(controlRepository),
      mkdir(temporary),
    ]);
    const git = path.join(
      repository,
      process.platform === "win32" ? "git.exe" : "git",
    );
    const docker = path.join(
      repository,
      process.platform === "win32" ? "docker.exe" : "docker",
    );
    await Promise.all([writeFile(git, "git"), writeFile(docker, "docker")]);
    await assert.rejects(
      inspectTrustedExecutableFiles(repository, temporary, { docker, git }),
      /cannot be inside the repository/u,
    );
    const controlGit = path.join(
      controlRepository,
      process.platform === "win32" ? "git.exe" : "git",
    );
    const controlDocker = path.join(
      controlRepository,
      process.platform === "win32" ? "docker.exe" : "docker",
    );
    await Promise.all([
      writeFile(controlGit, "git"),
      writeFile(controlDocker, "docker"),
    ]);
    await assert.rejects(
      inspectTrustedExecutableFiles(
        repository,
        temporary,
        { docker: controlDocker, git: controlGit },
        [controlRepository],
      ),
      /cannot be inside the control repository/u,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("Go module network environment forbids direct and private resolution", () => {
  assert.deepEqual(goModuleEnvironment(), {
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
  });
});

test("Docker routing and executable injection environment is removed", () => {
  const dockerConfig = path.resolve(
    repositoryRoot,
    "artifacts",
    "docker-config",
  );
  const sanitized = sanitizeDockerEnvironment(
    {
      BUILDX_CONFIG: "/attacker/buildx",
      DOCKER_CONFIG: "/attacker/config",
      DOCKER_CONTEXT: "attacker",
      DOCKER_HOST: "tcp://attacker.invalid:2375",
      DOCKER_TLS_VERIFY: "0",
      GITHUB_ACTIONS: "true",
      HOME: "/home/runner",
      LD_PRELOAD: "/attacker/preload.so",
      PATH: "/attacker/bin:/usr/bin",
    },
    dockerConfig,
  );
  for (const forbidden of [
    "BUILDX_CONFIG",
    "DOCKER_CONTEXT",
    "DOCKER_HOST",
    "DOCKER_TLS_VERIFY",
    "LD_PRELOAD",
  ]) {
    assert.equal(sanitized[forbidden], undefined);
  }
  assert.equal(sanitized.DOCKER_CONFIG, dockerConfig);
  if (process.platform === "linux") {
    assert.equal(sanitized.PATH, "/usr/bin:/bin");
  } else {
    assert.equal(sanitized.PATH, "");
  }
});

test("wrong offline cache path and mutable image reference fail closed", () => {
  const wrongCache = structuredClone(scanners);
  wrongCache.advisoryDatabases[0].cachePath = "osv-scanner/npm/all.zip";
  assert.throws(
    () => validateConfiguration(policy, wrongCache),
    /osv-scalibr cache paths/u,
  );

  const mutableImage = structuredClone(scanners);
  mutableImage.osvScanner.image = "ghcr.io/google/osv-scanner:v2.5.1";
  assert.throws(
    () => validateConfiguration(policy, mutableImage),
    /must end with its index digest/u,
  );
});

test("timeout policy and acquisition endpoints are exact and fail closed", () => {
  const invalidTimeout = structuredClone(policy);
  invalidTimeout.timeoutsSeconds.scanner = 0;
  assert.throws(
    () => validateConfiguration(invalidTimeout, scanners),
    /timeout policy scanner/u,
  );

  const extraTimeout = structuredClone(policy);
  extraTimeout.timeoutsSeconds.unboundedFallback = 60;
  assert.throws(
    () => validateConfiguration(extraTimeout, scanners),
    /timeout policy keys/u,
  );

  const invalidDownloadLimit = structuredClone(policy);
  invalidDownloadLimit.advisoryDatabase.maxCompressedDownloadBytes -= 1;
  assert.throws(
    () => validateConfiguration(invalidDownloadLimit, scanners),
    /compressed download limit/u,
  );

  const redirectedDatabase = structuredClone(scanners);
  redirectedDatabase.advisoryDatabases[0].url =
    "https://example.invalid/npm/all.zip";
  assert.throws(
    () => validateConfiguration(policy, redirectedDatabase),
    /locked official GCS endpoints/u,
  );

  const redirectedRules = structuredClone(scanners);
  redirectedRules.semgrepRules.repository =
    "https://example.invalid/semgrep-rules.git";
  assert.throws(
    () => validateConfiguration(policy, redirectedRules),
    /locked official repository/u,
  );
});

test("OSV config is license-only and vulnerability scans cannot consume ignores", () => {
  const inventory = {
    documentInputs: [{ containerPath: "/scan/pnpm/pnpm-lock.yaml" }],
    goInventory: [{ containerPath: "/scan/go/go.mod" }],
  };
  const vulnerabilityArguments = osvScanArguments({ policy }, inventory, {
    license: false,
    offline: true,
  });
  assert.ok(vulnerabilityArguments.includes("--offline-vulnerabilities"));
  assert.ok(vulnerabilityArguments.includes("--all-vulns"));
  assert.ok(!vulnerabilityArguments.includes("--config"));

  const licenseArguments = osvScanArguments({ policy }, inventory, {
    license: true,
    offline: false,
  });
  assert.deepEqual(
    licenseArguments.slice(
      licenseArguments.indexOf("--config"),
      licenseArguments.indexOf("--config") + 2,
    ),
    ["--config", "/scan/osv-scanner.toml"],
  );
  assert.ok(licenseArguments.includes("--all-vulns"));
  assert.ok(osvCanaryArguments().includes("--all-vulns"));
  assert.deepEqual(osvGoCanaryArguments(), [
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
  ]);
  assert.deepEqual(osvGoLicenseCanaryArguments({ policy }), [
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
    `--licenses=${policy.licenses.allowed.join(",")}`,
    "--lockfile",
    "/fixture/go.mod",
  ]);
  const licenseCanaryArguments = osvLicenseCanaryArguments({ policy });
  assert.ok(licenseCanaryArguments.includes("--all-vulns"));
  assert.deepEqual(
    licenseCanaryArguments.slice(
      licenseCanaryArguments.indexOf("--config"),
      licenseCanaryArguments.indexOf("--config") + 2,
    ),
    ["--config", "/fixture/osv-scanner.toml"],
  );
  assert.ok(licenseCanaryArguments.includes("--data-source"));
});

test("OSV npm vulnerability canary fixtures have exact package and direct-scope inventories", async () => {
  const cases = [
    {
      declaredDirectScopes: [],
      fixtureScope: "unknown",
      source: "scripts/fixtures/supply-chain/vulnerable-pnpm-lock.yaml.txt",
    },
    {
      declaredDirectScopes: ["devDependencies"],
      fixtureScope: "development",
      source:
        "scripts/fixtures/supply-chain/vulnerable-development-pnpm-lock.yaml.txt",
    },
  ];
  for (const expected of cases) {
    const lockText = await readFile(
      path.join(repositoryRoot, expected.source),
      {
        encoding: "utf8",
      },
    );
    assert.deepEqual(
      validateOsvVulnerabilityCanaryFixture(lockText, {
        fixtureScope: expected.fixtureScope,
        source: expected.source,
      }),
      {
        declaredDirectScopes: expected.declaredDirectScopes,
        expectedScannerPackage: {
          ecosystem: "npm",
          name: "lodash",
          scope: "unknown",
          version: "4.17.20",
        },
        fixtureScope: expected.fixtureScope,
        scannerScope: "unknown",
      },
    );
  }
});

test("OSV npm vulnerability canary fixture validation rejects scope and inventory drift", async () => {
  const unknown = await readFile(
    path.join(
      repositoryRoot,
      "scripts/fixtures/supply-chain/vulnerable-pnpm-lock.yaml.txt",
    ),
    "utf8",
  );
  const development = await readFile(
    path.join(
      repositoryRoot,
      "scripts/fixtures/supply-chain/vulnerable-development-pnpm-lock.yaml.txt",
    ),
    "utf8",
  );

  assert.throws(
    () =>
      validateOsvVulnerabilityCanaryFixture(unknown, {
        fixtureScope: "production",
      }),
    /scope is unsupported/u,
  );
  assert.throws(
    () =>
      validateOsvVulnerabilityCanaryFixture(
        development.replace("devDependencies:", "dependencies:"),
        { fixtureScope: "development" },
      ),
    /direct dependency inventory/u,
  );
  assert.throws(
    () =>
      validateOsvVulnerabilityCanaryFixture(
        unknown.replaceAll("lodash@4.17.20", "lodash@4.17.19"),
        { fixtureScope: "unknown" },
      ),
    /contain exactly lodash@4\.17\.20/u,
  );
  assert.throws(() =>
    validateOsvVulnerabilityCanaryFixture(
      "lockfileVersion: '9.0'\npackages: {}\n",
      { fixtureScope: "unknown" },
    ),
  );

  const extraImporter = development.replace(
    "packages:\n",
    "  workspace: {}\n\npackages:\n",
  );
  assert.throws(
    () =>
      validateOsvVulnerabilityCanaryFixture(extraImporter, {
        fixtureScope: "development",
      }),
    /exact controlled lockfile/u,
  );
  const multipleScopes = development.replace(
    "    devDependencies:\n",
    "    dependencies:\n      lodash:\n        specifier: 4.17.20\n        version: 4.17.20\n    devDependencies:\n",
  );
  assert.throws(
    () =>
      validateOsvVulnerabilityCanaryFixture(multipleScopes, {
        fixtureScope: "development",
      }),
    /direct dependency inventory/u,
  );
});

test("OSV npm scanner scope remains unknown when JSON omits scope", async () => {
  const source =
    "scripts/fixtures/supply-chain/vulnerable-development-pnpm-lock.yaml.txt";
  const fixture = validateOsvVulnerabilityCanaryFixture(
    await readFile(path.join(repositoryRoot, source), "utf8"),
    { fixtureScope: "development", source },
  );
  const document = {
    results: [
      {
        packages: [
          {
            groups: [{ ids: ["GHSA-canary"], max_severity: 8.1 }],
            package: {
              ecosystem: "npm",
              name: "lodash",
              version: "4.17.20",
            },
            vulnerabilities: [{ id: "GHSA-canary" }],
          },
        ],
        source: { path: "/fixture/pnpm-lock.yaml", type: "lockfile" },
      },
    ],
  };
  assert.deepEqual(validateOsvVulnerabilityCanaryScannerIdentity(document), {
    scannerScope: "unknown",
    scannerScopeReported: false,
  });
  const verdict = evaluateOsvVulnerabilities({
    document: JSON.stringify(document),
    expectedBySource: {
      "/fixture/pnpm-lock.yaml": [fixture.expectedScannerPackage],
    },
    policy: { blockAtOrAbove: 7 },
    rawExit: 1,
  });
  assert.equal(verdict.exitCode, EXIT_CODES.FINDING);
  assert.equal(verdict.findings[0].package.scope, "unknown");
  assert.equal(verdict.findings[0].scope, "unknown");
  assert.deepEqual(fixture.declaredDirectScopes, ["devDependencies"]);

  const reportedScope = structuredClone(document);
  reportedScope.results[0].packages[0].package.scope = "development";
  assert.throws(
    () => validateOsvVulnerabilityCanaryScannerIdentity(reportedScope),
    /unexpectedly reports scope/u,
  );
});

test("Go advisory canary requires the exact pinned module and GO advisory", () => {
  const document = {
    results: [
      {
        source: { path: "/fixture/go.mod" },
        packages: [
          {
            package: {
              ecosystem: "Go",
              name: "golang.org/x/text",
              version: "0.3.7",
            },
            vulnerabilities: [{ id: "GO-2022-1059" }],
          },
        ],
      },
    ],
  };
  assert.deepEqual(assertOsvGoAdvisoryCanary(document), {
    advisoryId: "GO-2022-1059",
    ecosystem: "Go",
    packageName: "golang.org/x/text",
    version: "0.3.7",
  });
  const wrongAdvisory = structuredClone(document);
  wrongAdvisory.results[0].packages[0].vulnerabilities[0].id = "GO-2022-0000";
  assert.throws(
    () => assertOsvGoAdvisoryCanary(wrongAdvisory),
    /did not report exact/u,
  );
});

test("Go license canary requires the exact fixture, package, and denied license", async () => {
  const fixture = await readFile(
    path.join(
      repositoryRoot,
      "scripts",
      "fixtures",
      "supply-chain",
      "go-license-denied.mod.txt",
    ),
    "utf8",
  );
  assert.equal(
    fixture,
    [
      "module example.com/hedefora/r016-go-license-canary",
      "",
      "go 1.20",
      "",
      "require github.com/MichaelMure/git-bug v0.8.0",
      "",
    ].join("\n"),
  );
  const document = {
    results: [
      {
        source: { path: "/fixture/go.mod", type: "lockfile" },
        packages: [
          {
            package: {
              ecosystem: "Go",
              name: "github.com/MichaelMure/git-bug",
              version: "0.8.0",
            },
            licenses: ["GPL-3.0", "GPL-3.0-or-later", "CC-BY-SA-4.0"],
            license_violations: ["GPL-3.0", "GPL-3.0-or-later", "CC-BY-SA-4.0"],
          },
        ],
      },
    ],
  };
  assert.deepEqual(assertOsvGoLicenseCanary(document), {
    ecosystem: "Go",
    license: "GPL-3.0-or-later",
    packageName: "github.com/MichaelMure/git-bug",
    version: "0.8.0",
  });

  for (const mutate of [
    (candidate) => candidate.results.splice(0, 1),
    (candidate) => {
      candidate.results[0].packages[0].package.name =
        "github.com/example/different";
    },
    (candidate) => candidate.results[0].packages[0].licenses.splice(1, 1),
    (candidate) => {
      candidate.results[0].packages[0].licenses[1] = "MIT";
    },
    (candidate) =>
      candidate.results[0].packages[0].license_violations.splice(1, 1),
  ]) {
    const invalid = structuredClone(document);
    mutate(invalid);
    assert.throws(() => assertOsvGoLicenseCanary(invalid), /OSV Go license/u);
  }
});

test("Semgrep arguments disable target-discovery bypass filters", () => {
  const args = semgrepArguments(
    { policy },
    { lock: { files: [{ path: "javascript/rule.yaml" }] } },
  );
  for (const flag of [
    "--no-git-ignore",
    "--x-ignore-semgrepignore-files",
    "--no-exclude-binary-files",
    "--no-exclude-minified-files",
  ]) {
    assert.ok(args.includes(flag), `${flag} must be present`);
  }
  assert.deepEqual(
    args.slice(
      args.indexOf("--max-target-bytes"),
      args.indexOf("--max-target-bytes") + 2,
    ),
    ["--max-target-bytes", "0"],
  );
});

test("network-enabled containers reject every repository-backed mount", () => {
  const repositoryMount = `type=bind,src=${path.join(repositoryRoot, "go.mod")},dst=/module/go.mod,readonly`;
  assert.throws(
    () =>
      assertNetworkMountIsolation(repositoryRoot, [repositoryMount], "bridge"),
    /cannot mount repository content/u,
  );
  const stagedMount = `type=bind,src=${path.join(path.dirname(repositoryRoot), "r016-stage")},dst=/scan,readonly`;
  assert.equal(
    assertNetworkMountIsolation(repositoryRoot, [stagedMount], "bridge"),
    true,
  );
  assert.equal(
    assertNetworkMountIsolation(repositoryRoot, [repositoryMount], "none"),
    true,
  );
});

test("Docker mounts resolve to regular children of the verified temporary root", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hedefora-mount-test-"));
  try {
    const repository = path.join(root, "repository");
    const temporaryRoot = path.join(root, "temporary");
    const staged = path.join(temporaryRoot, "staged");
    const outside = path.join(root, "outside");
    await Promise.all([
      mkdir(repository),
      mkdir(temporaryRoot),
      mkdir(outside),
    ]);
    await mkdir(staged);
    const context = {
      root: repository,
      temporaryRoot,
      temporaryRootReal: temporaryRoot,
    };
    assert.equal(
      await validateDockerMountSources(
        context,
        [`type=bind,src=${staged},dst=/scan,readonly`],
        "bridge",
      ),
      true,
    );
    await assert.rejects(
      validateDockerMountSources(
        context,
        [`type=bind,src=${outside},dst=/scan,readonly`],
        "bridge",
      ),
      /verified R-016 temporary root/u,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("OSV missing database probe accepts only the explicit control error", () => {
  assert.equal(
    assertOsvMissingDatabaseFailure({
      exitCode: 127,
      stderr: "could not load db: no offline version available",
    }),
    true,
  );
  for (const result of [
    { exitCode: 0, stderr: "could not load db: no offline version available" },
    { exitCode: 1, stderr: "could not load db: no offline version available" },
    { exitCode: 127, stderr: "unexpected internal failure" },
  ]) {
    assert.throws(
      () => assertOsvMissingDatabaseFailure(result),
      /expected fail-closed control error/u,
    );
  }
});

test("Semgrep artifact view excludes source snippets while preserving identity", () => {
  const sourceSnippet = "const privateValue = process.env.SECRET_VALUE;";
  const result = {
    stdout: JSON.stringify({
      errors: [],
      paths: { scanned: ["/repo/apps/web/src/private.ts"] },
      results: [
        {
          check_id: "javascript.lang.security.example",
          end: { col: 12, line: 8, offset: 110 },
          extra: { lines: sourceSnippet, message: "unsafe source" },
          path: "/repo/apps/web/src/private.ts",
          start: { col: 3, line: 8, offset: 101 },
        },
      ],
      version: "1.175.0",
    }),
    stderr: `scanner diagnostic containing ${sourceSnippet}`,
  };
  const view = semgrepArtifactView(result);
  assert.doesNotMatch(view.stdout, /privateValue|unsafe source/u);
  assert.doesNotMatch(view.stderr, /privateValue/u);
  assert.match(view.stdout, /javascript\.lang\.security\.example/u);
  assert.match(view.stdout, /stdoutSha256/u);
});

test("Go JSON sequence parsing accepts concatenated objects only", () => {
  assert.deepEqual(
    parseJsonSequence(
      '{"Path":"main","Main":true}\n{"Path":"dep","Version":"v1.2.3"}\n',
    ).map((entry) => ({ ...entry })),
    [
      { Path: "main", Main: true },
      { Path: "dep", Version: "v1.2.3" },
    ],
  );
  assert.throws(
    () => parseJsonSequence('{"Path":"main","Path":"duplicate"}'),
    /duplicate .*key/u,
  );
  assert.throws(() => parseJsonSequence('{"Path":"main"'), ContractError);
  assert.throws(() => parseJsonSequence("[]"), ContractError);
});

test("image inspection requires exact index identity and linux amd64", () => {
  const lock = scanners.osvScanner;
  const inspection = [
    {
      Architecture: "amd64",
      Os: "linux",
      RepoDigests: [`ghcr.io/google/osv-scanner@${lock.indexDigest}`],
      Config: {
        Labels: { "org.opencontainers.image.revision": lock.sourceCommit },
      },
    },
  ];
  assert.equal(validateImageInspection(inspection, lock, "osv-scanner"), true);
  const wrongArchitecture = structuredClone(inspection);
  wrongArchitecture[0].Architecture = "arm64";
  assert.throws(
    () => validateImageInspection(wrongArchitecture, lock, "osv-scanner"),
    /linux\/amd64/u,
  );
  const wrongDigest = structuredClone(inspection);
  wrongDigest[0].RepoDigests = [
    "ghcr.io/google/osv-scanner@sha256:" + "0".repeat(64),
  ];
  assert.throws(
    () => validateImageInspection(wrongDigest, lock, "osv-scanner"),
    /locked index digest/u,
  );
});

test("Semgrep image inspection requires a configured non-root user", () => {
  const lock = scanners.semgrep;
  const inspection = [
    {
      Architecture: "amd64",
      Os: "linux",
      RepoDigests: [`semgrep/semgrep@${lock.indexDigest}`],
      Config: {
        Labels: {
          "org.opencontainers.image.revision": lock.imageSourceRevision,
          "org.opencontainers.image.source": lock.imageSourceRepository,
        },
        User: "semgrep",
      },
    },
  ];
  assert.equal(validateImageInspection(inspection, lock, "semgrep-ce"), true);
  for (const configuredUser of ["", "0", "0:0", "root", "root:root"]) {
    const rootImage = structuredClone(inspection);
    rootImage[0].Config.User = configuredUser;
    assert.throws(
      () => validateImageInspection(rootImage, lock, "semgrep-ce"),
      /explicit non-root user/u,
    );
  }
  const wrongPackagingRevision = structuredClone(inspection);
  wrongPackagingRevision[0].Config.Labels["org.opencontainers.image.revision"] =
    "0".repeat(40);
  assert.throws(
    () => validateImageInspection(wrongPackagingRevision, lock, "semgrep-ce"),
    /source labels differ from the packaging lock/u,
  );
});

test("final source seal rejects late status, index, and hidden-flag mutation", () => {
  const index = `100644 ${"1".repeat(40)} 0\ttracked.txt\0`;
  const entries = parseGitIndex(index);
  const expected = {
    gitDirectory: path.resolve(repositoryRoot, ".git"),
    head: "2".repeat(40),
    topLevel: path.resolve(repositoryRoot),
    tree: "3".repeat(40),
    trackedFileCount: entries.length,
    trackedIndexSha256: sha256Hex(canonicalJson(entries)),
  };
  const clean = {
    gitDirectory: expected.gitDirectory,
    head: expected.head,
    index,
    indexFlags: "H tracked.txt\0",
    status: "",
    topLevel: expected.topLevel,
    tree: expected.tree,
  };
  assert.equal(validateFinalSourceSnapshot(expected, clean), true);
  assert.throws(
    () =>
      validateFinalSourceSnapshot(expected, {
        ...clean,
        status: " M tracked.txt\n",
      }),
    /differs from the opening seal/u,
  );
  assert.throws(
    () =>
      validateFinalSourceSnapshot(expected, {
        ...clean,
        index: `100644 ${"4".repeat(40)} 0\ttracked.txt\0`,
      }),
    /differs from the opening seal/u,
  );
  assert.throws(
    () =>
      validateFinalSourceSnapshot(expected, {
        ...clean,
        indexFlags: "S tracked.txt\0",
      }),
    /hidden or nonstandard/u,
  );
});

function imageIndexFixture(
  lock,
  {
    childMediaType = "application/vnd.oci.image.manifest.v1+json",
    rootMediaType = "application/vnd.oci.image.index.v1+json",
  } = {},
) {
  return {
    mediaType: rootMediaType,
    schemaVersion: 2,
    manifests: [
      {
        digest: lock.linuxAmd64Digest,
        mediaType: childMediaType,
        platform: { architecture: "amd64", os: "linux" },
        size: 1_024,
      },
      {
        digest: "sha256:" + "1".repeat(64),
        mediaType: childMediaType,
        platform: { architecture: "arm64", os: "linux" },
        size: 2_048,
      },
      {
        digest: "sha256:" + "2".repeat(64),
        mediaType: childMediaType,
        platform: { architecture: "unknown", os: "unknown" },
        size: 3_072,
      },
      {
        digest: "sha256:" + "3".repeat(64),
        mediaType: childMediaType,
        platform: { architecture: "unknown", os: "unknown" },
        size: 4_096,
      },
    ],
  };
}

test("image index accepts exact OCI and Docker manifest families", () => {
  const lock = scanners.semgrep;
  const ociIndex = imageIndexFixture(lock);
  assert.equal(validateImageIndex(ociIndex, lock, "semgrep-ce"), true);

  const dockerList = imageIndexFixture(lock, {
    childMediaType: "application/vnd.docker.distribution.manifest.v2+json",
    rootMediaType: "application/vnd.docker.distribution.manifest.list.v2+json",
  });
  assert.equal(validateImageIndex(dockerList, lock, "semgrep-ce"), true);
});

test("image index requires exact schema and supported root mediaType", () => {
  const lock = scanners.semgrep;
  for (const schemaVersion of [1, "2", null]) {
    const index = imageIndexFixture(lock);
    index.schemaVersion = schemaVersion;
    assert.throws(
      () => validateImageIndex(index, lock, "semgrep-ce"),
      /schemaVersion must be exactly 2/u,
    );
  }

  const index = imageIndexFixture(lock);
  index.mediaType = "application/vnd.oci.image.manifest.v1+json";
  assert.throws(
    () => validateImageIndex(index, lock, "semgrep-ce"),
    /image index mediaType is invalid/u,
  );

  for (const manifests of [undefined, null, {}]) {
    const missingManifests = imageIndexFixture(lock);
    missingManifests.manifests = manifests;
    assert.throws(
      () => validateImageIndex(missingManifests, lock, "semgrep-ce"),
      /manifests must be an array/u,
    );
  }
});

test("image index rejects mixed and nested child media types", () => {
  const lock = scanners.semgrep;
  for (const mediaType of [
    "application/vnd.docker.distribution.manifest.v2+json",
    "application/vnd.oci.image.index.v1+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
  ]) {
    const index = imageIndexFixture(lock);
    index.manifests[0].mediaType = mediaType;
    assert.throws(
      () => validateImageIndex(index, lock, "semgrep-ce"),
      /direct compatible image manifest/u,
    );
  }
});

test("image index requires positive safe descriptor sizes", () => {
  const lock = scanners.semgrep;
  for (const size of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1024"]) {
    const index = imageIndexFixture(lock);
    index.manifests[0].size = size;
    assert.throws(
      () => validateImageIndex(index, lock, "semgrep-ce"),
      /size is invalid/u,
    );
  }
});

test("image index requires lowercase sha256 descriptor digests", () => {
  const lock = scanners.semgrep;
  for (const digest of [
    lock.linuxAmd64Digest.toUpperCase(),
    "sha256:" + "g".repeat(64),
    "sha256:" + "0".repeat(63),
  ]) {
    const index = imageIndexFixture(lock);
    index.manifests[0].digest = digest;
    assert.throws(
      () => validateImageIndex(index, lock, "semgrep-ce"),
      /digest is invalid/u,
    );
  }

  const wrongDigest = imageIndexFixture(lock);
  wrongDigest.manifests[0].digest = "sha256:" + "0".repeat(64);
  assert.throws(
    () => validateImageIndex(wrongDigest, lock, "semgrep-ce"),
    /linux\/amd64 manifest differs from the scanner lock/u,
  );
});

test("image index rejects duplicate concrete platform descriptors", () => {
  const lock = scanners.semgrep;
  for (const descriptorIndex of [0, 1]) {
    const index = imageIndexFixture(lock);
    const duplicate = structuredClone(index.manifests[descriptorIndex]);
    duplicate.digest = "sha256:" + "4".repeat(64);
    index.manifests.push(duplicate);
    assert.throws(
      () => validateImageIndex(index, lock, "semgrep-ce"),
      /duplicate concrete platform/u,
    );
  }
});

test("image index requires descriptor platform objects", () => {
  const lock = scanners.semgrep;
  for (const platform of [null, [], "linux/amd64"]) {
    const index = imageIndexFixture(lock);
    index.manifests[0].platform = platform;
    assert.throws(
      () => validateImageIndex(index, lock, "semgrep-ce"),
      /platform must be an object/u,
    );
  }
});

test("image index validates optional platform variants", () => {
  const lock = scanners.semgrep;
  for (const variant of [null, ""]) {
    const index = imageIndexFixture(lock);
    index.manifests[1].platform.variant = variant;
    assert.throws(
      () => validateImageIndex(index, lock, "semgrep-ce"),
      /platform variant must be a nonempty string/u,
    );
  }

  const distinctVariant = imageIndexFixture(lock);
  const descriptor = structuredClone(distinctVariant.manifests[1]);
  descriptor.digest = "sha256:" + "5".repeat(64);
  descriptor.platform.variant = "v8";
  distinctVariant.manifests.push(descriptor);
  assert.equal(validateImageIndex(distinctVariant, lock, "semgrep-ce"), true);
});

test("OSV extraction logs must prove every split document and Go manifest", () => {
  const inventory = {
    documentInputs: [
      {
        containerPath: "/scan/pnpm-document-1/pnpm-lock.yaml",
        packageCount: 19,
      },
      {
        containerPath: "/scan/pnpm-document-2/pnpm-lock.yaml",
        packageCount: 527,
      },
    ],
    goInventory: [{ containerPath: "/repo/go.mod", discoveredModuleCount: 1 }],
  };
  const complete = [
    "Scanned /scan/pnpm-document-1/pnpm-lock.yaml file and found 19 packages",
    "Scanned /scan/pnpm-document-2/pnpm-lock.yaml file and found 527 packages",
    "Scanned /repo/go.mod file and found 1 package",
  ].join("\n");
  assert.equal(assertOsvExtractionCoverage(complete, inventory), true);
  assert.throws(
    () =>
      assertOsvExtractionCoverage(
        complete.replace(
          "Scanned /scan/pnpm-document-2/pnpm-lock.yaml file and found 527 packages\n",
          "",
        ),
        inventory,
      ),
    /extraction count/u,
  );
});

function databaseArchiveReportFixture() {
  return {
    schema_version: 1,
    limits: {
      max_entries: 300_000,
      max_entry_path_bytes: 4_096,
      max_entry_uncompressed_bytes: 134_217_728,
      max_archive_uncompressed_bytes: 8_589_934_592,
    },
    archives: [0, 1].map((argument_index) => ({
      argument_index,
      entry_count: 1,
      uncompressed_bytes: 1,
      manifest_sha256: "a".repeat(64),
    })),
  };
}

function assertDatabaseArchiveReportFailure(report, expectedCount, pattern) {
  assert.throws(
    () => validateDatabaseArchiveReport(report, expectedCount),
    (error) => {
      assert.equal(error?.name, "GateFailure");
      assert.equal(error?.exitCode, 20);
      assert.equal(error?.stage, "database-zip-validation");
      assert.match(error.message, pattern);
      return true;
    },
  );
}

test("database archive report accepts the exact production contract", () => {
  assert.equal(
    validateDatabaseArchiveReport(databaseArchiveReportFixture(), 2),
    true,
  );
});

test("database archive report rejects wrong, missing, or extra limits", () => {
  const wrong = databaseArchiveReportFixture();
  wrong.limits.max_entries = 300_001;
  assertDatabaseArchiveReportFailure(wrong, 2, /exact production limits/u);

  const missing = databaseArchiveReportFixture();
  delete missing.limits.max_entry_path_bytes;
  assertDatabaseArchiveReportFailure(missing, 2, /exact production limits/u);

  const extra = databaseArchiveReportFixture();
  extra.limits.attacker_limit = 1;
  assertDatabaseArchiveReportFailure(extra, 2, /exact production limits/u);
});

test("database archive report enforces the exact entry-count boundary", () => {
  const exact = databaseArchiveReportFixture();
  exact.archives[0].entry_count = 300_000;
  assert.equal(validateDatabaseArchiveReport(exact, 2), true);

  const over = databaseArchiveReportFixture();
  over.archives[0].entry_count = 300_001;
  assertDatabaseArchiveReportFailure(over, 2, /archive 0 inventory/u);
});

test("database archive report enforces the exact uncompressed-size boundary", () => {
  const exact = databaseArchiveReportFixture();
  exact.archives[0].uncompressed_bytes = 8_589_934_592;
  assert.equal(validateDatabaseArchiveReport(exact, 2), true);

  const over = databaseArchiveReportFixture();
  over.archives[0].uncompressed_bytes = 8_589_934_593;
  assertDatabaseArchiveReportFailure(over, 2, /archive 0 inventory/u);
});

test("database archive report rejects malformed manifests and counts", () => {
  for (const manifest of [undefined, "A".repeat(64), "a".repeat(63), 42]) {
    const malformed = databaseArchiveReportFixture();
    malformed.archives[0].manifest_sha256 = manifest;
    assertDatabaseArchiveReportFailure(malformed, 2, /manifest SHA-256/u);
  }

  for (const count of [undefined, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const malformed = databaseArchiveReportFixture();
    malformed.archives[0].entry_count = count;
    assertDatabaseArchiveReportFailure(malformed, 2, /archive 0 inventory/u);
  }

  const wrongArgumentIndex = databaseArchiveReportFixture();
  wrongArgumentIndex.archives[1].argument_index = 0;
  assertDatabaseArchiveReportFailure(
    wrongArgumentIndex,
    2,
    /archive 1 inventory/u,
  );

  assertDatabaseArchiveReportFailure(
    databaseArchiveReportFixture(),
    3,
    /archive count differs/u,
  );
  assertDatabaseArchiveReportFailure(
    databaseArchiveReportFixture(),
    1.5,
    /expected archive count is invalid/u,
  );
});

test("Docker cleanup is verified and cleanup failure cannot retain success", async () => {
  const result = (exitCode, stdout = "") => ({
    exitCode,
    outputLimitExceeded: false,
    signal: null,
    stdout,
    timedOut: false,
  });
  const successfulCalls = [];
  const dockerConfig = path.resolve(repositoryRoot, "artifacts", "docker-test");
  assert.equal(
    await removeContainerAndVerify(
      {
        dockerConfig,
        root: repositoryRoot,
        trustedExecutables: { docker: trustedDockerBinary },
      },
      "ignored.cid",
      "hedefora-r016-fixture",
      {
        processRunner: async ({ args }) => {
          successfulCalls.push(args);
          return successfulCalls.length === 1
            ? result(0, `${"a".repeat(64)}\n`)
            : result(0);
        },
      },
    ),
    true,
  );
  assert.deepEqual(
    successfulCalls.map((args) => args.slice(0, 2)),
    [
      ["container", "ls"],
      ["rm", "--force"],
      ["container", "ls"],
    ],
  );

  let call = 0;
  await assert.rejects(
    removeContainerAndVerify(
      {
        dockerConfig,
        root: repositoryRoot,
        trustedExecutables: { docker: trustedDockerBinary },
      },
      "ignored.cid",
      "hedefora-r016-fixture",
      {
        processRunner: async () =>
          call++ === 0 ? result(0, `${"b".repeat(64)}\n`) : result(1),
      },
    ),
    /force-removal failed/u,
  );

  await assert.rejects(
    removeContainerAndVerify(
      {
        dockerConfig,
        root: repositoryRoot,
        trustedExecutables: { docker: trustedDockerBinary },
      },
      "ignored.cid",
      "hedefora-r016-fixture",
      { processRunner: async () => result(1) },
    ),
    /daemon could not verify/u,
  );
});

test("every Docker raw exit verifies exact-name absence", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "hedefora-run-docker-test-"),
  );
  try {
    const temporaryRoot = path.join(root, "temporary");
    const artifactRoot = path.join(root, "artifacts");
    const rawRoot = path.join(artifactRoot, "raw");
    await mkdir(temporaryRoot);
    await mkdir(rawRoot, { recursive: true });
    const context = {
      artifactRoot,
      dockerConfig: path.join(temporaryRoot, "docker-config"),
      evidence: { checks: [], rawArtifacts: [] },
      rawRoot,
      root,
      runId: "fixture-run",
      temporaryRoot,
      trustedExecutables: { docker: trustedDockerBinary },
    };
    await mkdir(context.dockerConfig);
    const processResult = (request, exitCode, overrides = {}) => {
      const stdout = overrides.stdout ?? "";
      const stderr = overrides.stderr ?? "";
      return {
        args: request.args,
        command: request.command,
        durationMs: 1,
        exitCode,
        outputLimitExceeded: false,
        signal: null,
        stderr,
        stderrBytes: Buffer.from(stderr),
        stdout,
        stdoutBytes: Buffer.from(stdout),
        timedOut: false,
        ...overrides,
      };
    };
    for (const rawExit of [0, 1, 125]) {
      let absenceChecks = 0;
      const processRunner = async (request) => {
        if (request.args[0] === "run") return processResult(request, rawExit);
        absenceChecks += 1;
        return processResult(request, 0);
      };
      const result = await runDocker(
        context,
        `raw-exit-${rawExit}`,
        "example.invalid/scanner@sha256:fixture",
        ["scan"],
        { processRunner },
      );
      assert.equal(result.exitCode, rawExit);
      assert.equal(absenceChecks, 2);
    }

    let listFailure = false;
    await assert.rejects(
      runDocker(
        context,
        "daemon-failure",
        "example.invalid/scanner@sha256:fixture",
        ["scan"],
        {
          processRunner: async (request) => {
            if (request.args[0] === "run") return processResult(request, 0);
            listFailure = true;
            return processResult(request, 1);
          },
        },
      ),
      /daemon could not verify/u,
    );
    assert.equal(listFailure, true);

    await assert.rejects(
      runDocker(
        context,
        "timeout",
        "example.invalid/scanner@sha256:fixture",
        ["scan"],
        {
          processRunner: async (request) => {
            if (request.args[0] === "run") {
              return processResult(request, null, {
                signal: "SIGKILL",
                timedOut: true,
              });
            }
            return processResult(request, 0);
          },
        },
      ),
      /control failure/u,
    );

    let combinedFailure;
    try {
      await runDocker(
        context,
        "primary-and-cleanup-failure",
        "example.invalid/scanner@sha256:fixture",
        ["scan"],
        {
          processRunner: async (request) => {
            if (request.args[0] === "run") throw new Error("PRIMARY-LAUNCH");
            throw new Error("SECONDARY-CLEANUP");
          },
        },
      );
    } catch (error) {
      combinedFailure = error;
    }
    assert.equal(combinedFailure?.stage, "docker-cleanup");
    assert.equal(combinedFailure?.exitCode, 21);
    const serialized = serializeFailureForEvidence(combinedFailure);
    assert.match(JSON.stringify(serialized), /PRIMARY-LAUNCH/u);
    assert.match(JSON.stringify(serialized), /SECONDARY-CLEANUP/u);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("temporary cleanup failure rewrites a prior PASS before evidence", () => {
  const evidence = { status: "PASS" };
  assert.equal(
    applyTemporaryCleanupFailure(evidence, new Error("cleanup fixture")),
    21,
  );
  assert.equal(evidence.status, "FAIL");
  assert.equal(evidence.failure.exitCode, 21);
  assert.equal(evidence.failure.stage, "temporary-cleanup");

  const priorFailure = {
    exitCode: 20,
    message: "primary contract failure",
    stage: "contract",
    type: "GateFailure",
  };
  const failedEvidence = { failure: priorFailure, status: "FAIL" };
  assert.equal(
    applyTemporaryCleanupFailure(
      failedEvidence,
      new Error("secondary cleanup failure"),
    ),
    21,
  );
  assert.deepEqual(failedEvidence.failure.causes, [
    priorFailure,
    { message: "secondary cleanup failure", type: "Error" },
  ]);
});

test("evidence write failure persists a bounded fallback and keeps every root cause", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "hedefora-r016-evidence-fallback-test-"),
  );
  try {
    const primaryFailure = {
      exitCode: 20,
      message: "malformed configuration",
      rawOutput: "must-not-enter-the-fallback",
      stage: "contract",
      type: "GateFailure",
    };
    const evidence = {
      exitCode: 20,
      failure: primaryFailure,
      finishedAt: "2026-08-30T13:00:01.000Z",
      source: { head: "a".repeat(40), tree: "b".repeat(40) },
      startedAt: "2026-08-30T13:00:00.000Z",
      status: "FAIL",
    };
    const context = {
      artifactRoot: root,
      evidence,
      runId: "fallback-fixture",
    };
    const exitCode = await writeEvidenceWithoutMaskingFailure(
      context,
      true,
      20,
      async () => {
        throw new AggregateError(
          [new Error("secondary schema detail")],
          "evidence schema validation failed",
        );
      },
    );
    assert.equal(exitCode, 21);
    assert.equal(evidence.status, "FAIL");
    assert.equal(evidence.exitCode, 21);
    assert.equal(evidence.failure.stage, "evidence-finalization");
    assert.match(
      evidence.failure.message,
      /evidence schema validation failed/u,
    );
    assert.deepEqual(evidence.failure.causes[0], primaryFailure);
    assert.match(JSON.stringify(evidence.failure), /secondary schema detail/u);

    const fallbackText = await readFile(
      path.join(root, "evidence-finalization-failure.json"),
      "utf8",
    );
    const fallback = parseStrictJson(fallbackText, "fallback evidence");
    assert.equal(fallback.artifactType, "R016_EVIDENCE_FINALIZATION_FAILURE");
    assert.equal(fallback.status, "FAIL");
    assert.equal(fallback.exitCode, 21);
    assert.equal(fallback.failure.causes[0].stage, "contract");
    assert.doesNotMatch(fallbackText, /must-not-enter-the-fallback/u);
    assert.match(
      failureSummaryForConsole(evidence),
      /malformed configuration/u,
    );

    const fallbackFailureEvidence = {
      failure: primaryFailure,
      status: "FAIL",
    };
    assert.equal(
      await writeEvidenceWithoutMaskingFailure(
        { artifactRoot: root, evidence: fallbackFailureEvidence },
        true,
        20,
        async () => {
          throw new Error("canonical write failed");
        },
        async () => {
          throw new Error("fallback write failed");
        },
      ),
      21,
    );
    assert.equal(
      fallbackFailureEvidence.failure.stage,
      "evidence-finalization-fallback",
    );
    assert.equal(
      fallbackFailureEvidence.failure.causes[0].stage,
      "evidence-finalization",
    );
    assert.match(
      failureSummaryForConsole(fallbackFailureEvidence),
      /fallback write failed/u,
    );

    let writerCalled = false;
    let fallbackWriterCalled = false;
    assert.equal(
      await writeEvidenceWithoutMaskingFailure(
        { evidence: {} },
        false,
        20,
        async () => {
          writerCalled = true;
        },
        async () => {
          fallbackWriterCalled = true;
        },
      ),
      20,
    );
    assert.equal(writerCalled, false);
    assert.equal(fallbackWriterCalled, false);

    let normalFallbackCalled = false;
    assert.equal(
      await writeEvidenceWithoutMaskingFailure(
        { evidence: {} },
        true,
        0,
        async () => {},
        async () => {
          normalFallbackCalled = true;
        },
      ),
      0,
    );
    assert.equal(normalFallbackCalled, false);

    await writeEvidenceFinalizationFailure({
      artifactRoot: root,
      evidence,
      runId: "duplicate-fallback-fixture",
    }).then(
      () => assert.fail("fallback evidence must not overwrite itself"),
      (error) => assert.match(String(error), /exist|EEXIST/u),
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("artifact directories reject a non-directory trust boundary", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "hedefora-r016-artifact-test-"),
  );
  try {
    await writeFile(path.join(root, "artifacts"), "not a directory");
    await assert.rejects(
      prepareArtifactDirectories(
        root,
        path.join(root, "artifacts", "r016", "run"),
        path.join(root, "artifacts", "r016", "run", "raw"),
      ),
      /artifact root must be a real local directory/u,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("final evidence write rehashes regular artifact bytes", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "hedefora-r016-artifact-seal-test-"),
  );
  try {
    const artifactRoot = path.join(root, "run");
    const rawRoot = path.join(artifactRoot, "raw");
    await mkdir(rawRoot, { recursive: true });
    const rawContents = "trusted scanner output\n";
    const sealContents = "trusted database seal\n";
    await writeFile(path.join(rawRoot, "scanner.stdout.log"), rawContents);
    await writeFile(path.join(artifactRoot, "db-seal.json"), sealContents);
    const context = {
      artifactRoot,
      evidence: {
        status: "PASS",
        databaseSeal: {
          path: "db-seal.json",
          sha256: sha256Hex(sealContents),
        },
        rawArtifacts: [
          {
            path: "raw/scanner.stdout.log",
            sha256: sha256Hex(rawContents),
            size: Buffer.byteLength(rawContents),
          },
        ],
      },
    };
    assert.equal(await verifyArtifactFilesystemSeals(context), true);
    await writeFile(
      path.join(rawRoot, "scanner.stdout.log"),
      "tampered scanner output\n",
    );
    await assert.rejects(
      verifyArtifactFilesystemSeals(context),
      /changed after its trusted seal/u,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
