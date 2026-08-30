import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  EXPECTED_OSV_CONFIGURATION,
  assertGitBlobObjectId,
  assertSemgrepSourceParity,
  gitBlobObjectId,
  parseGitIndex,
  requireTrackedRegularFile,
  selectTrackedSourceFiles,
  validateEvidenceDocument,
  validateGitIndexFlags,
  validateGoModEdit,
  validateOsvConfiguration,
} from "./contracts.mjs";
import { canonicalJson, parseStrictJson, sha256Hex } from "./policy.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const evidenceSchema = parseStrictJson(
  await readFile(
    path.join(repositoryRoot, "security", "r016-evidence.schema.json"),
  ),
  "test evidence schema",
);
const lockedPolicy = parseStrictJson(
  await readFile(
    path.join(repositoryRoot, "security", "supply-chain-policy.json"),
  ),
  "test supply-chain policy",
);
const scanners = parseStrictJson(
  await readFile(path.join(repositoryRoot, "security", "scanners.lock.json")),
  "test scanner lock",
);
const OCI_INDEX_MEDIA_TYPE = "application/vnd.oci.image.index.v1+json";
const OCI_MANIFEST_MEDIA_TYPE = "application/vnd.oci.image.manifest.v1+json";
const DOCKER_LIST_MEDIA_TYPE =
  "application/vnd.docker.distribution.manifest.list.v2+json";
const DOCKER_MANIFEST_MEDIA_TYPE =
  "application/vnd.docker.distribution.manifest.v2+json";

test("OSV config permits only the exact bounded license override", () => {
  assert.match(
    validateOsvConfiguration(EXPECTED_OSV_CONFIGURATION).sha256,
    /^[0-9a-f]{64}$/u,
  );
  for (const bypass of [
    `${EXPECTED_OSV_CONFIGURATION}\n[[IgnoredVulns]]\nid = "GHSA-hidden"\n`,
    EXPECTED_OSV_CONFIGURATION.replace(
      'license.override = ["MIT"]',
      "ignore = true",
    ),
    EXPECTED_OSV_CONFIGURATION.replace(
      'license.override = ["MIT"]',
      "vulnerability.ignore = true",
    ),
    EXPECTED_OSV_CONFIGURATION.replace(
      'name = "reserved"',
      "nameIsRegex = true",
    ),
  ]) {
    assert.throws(() => validateOsvConfiguration(bypass), /license-only/u);
  }
});

test("git index parser preserves exact regular source inventory", () => {
  const entries = parseGitIndex(
    [
      `100644 ${"1".repeat(40)} 0\tapps/web/App.tsx`,
      `100755 ${"2".repeat(40)} 0\tcmd/api/main.go`,
    ].join("\0") + "\0",
  );
  const selected = selectTrackedSourceFiles(entries, {
    go: [".go"],
    web: [".js", ".tsx"],
  });
  assert.deepEqual(selected.groupCounts, { go: 1, web: 1 });
  assert.equal(
    requireTrackedRegularFile(
      new Map(entries.map((entry) => [entry.path, entry])),
      "cmd/api/main.go",
      "main",
    ).mode,
    "100755",
  );
  assert.throws(
    () => parseGitIndex(`120000 ${"3".repeat(40)} 1\tapps/web/link.ts\0`),
    /unmerged stage/u,
  );
  const symlink = parseGitIndex(
    `120000 ${"3".repeat(40)} 0\tapps/web/link.ts\0`,
  );
  assert.throws(
    () => selectTrackedSourceFiles(symlink, { web: [".ts"] }),
    /tracked regular file/u,
  );
});

test("tracked bytes are bound to Git blob identity and hidden flags fail", () => {
  const bytes = Buffer.from("hello\n", "utf8");
  const knownObjectId = "ce013625030ba8dba906f756967f9e9ca394464a";
  assert.equal(gitBlobObjectId(bytes, 40), knownObjectId);
  assert.equal(assertGitBlobObjectId(bytes, knownObjectId, "fixture"), true);
  assert.throws(
    () => assertGitBlobObjectId(Buffer.from("mutated\n"), knownObjectId),
    /bytes differ from captured Git object/u,
  );
  assert.equal(validateGitIndexFlags("H normal.txt\0"), true);
  for (const hidden of ["h assume-unchanged.txt\0", "S skip-worktree.txt\0"]) {
    assert.throws(
      () => validateGitIndexFlags(hidden),
      /hidden or nonstandard/u,
    );
  }
});

test("go.mod edit inventory rejects unused local and remote replace directives", () => {
  assert.deepEqual(
    validateGoModEdit({ Module: { Path: "example.com/main" }, Replace: null }),
    { modulePath: "example.com/main", replaceCount: 0 },
  );
  for (const replacement of [
    { New: { Path: "../local" }, Old: { Path: "example.com/unused" } },
    {
      New: { Path: "example.com/fork", Version: "v1.2.3" },
      Old: { Path: "example.com/unused" },
    },
  ]) {
    assert.throws(
      () =>
        validateGoModEdit({
          Module: { Path: "example.com/main" },
          Replace: [replacement],
        }),
      /unsupported replace directives/u,
    );
  }
});

test("Semgrep parity rejects ignore, size, and extra-target omissions", () => {
  const expected = ["apps/web/App.tsx", "cmd/api/main.go"];
  const complete = {
    paths: { scanned: expected.map((entry) => `/src/${entry}`) },
    results: [{ check_id: "fixture", path: "/src/apps/web/App.tsx" }],
  };
  assert.equal(assertSemgrepSourceParity(complete, expected).pathCount, 2);
  assert.throws(
    () =>
      assertSemgrepSourceParity(
        { ...complete, paths: { scanned: ["/src/cmd/api/main.go"] } },
        expected,
      ),
    /source parity failed/u,
  );
  assert.throws(
    () =>
      assertSemgrepSourceParity(
        {
          ...complete,
          paths: { scanned: [...complete.paths.scanned, "/src/untracked.ts"] },
        },
        expected,
      ),
    /source parity failed/u,
  );
});

test("PASS evidence requires complete exact terminal, input, tool, and database semantics", async () => {
  const policy = structuredClone(lockedPolicy);
  policy.runtime.nodeVersion = process.version.slice(1);
  const trustedTrackedFiles = new Map();
  const registerTrackedFile = (
    repositoryPath,
    bytes = Buffer.from(`tracked test material: ${repositoryPath}\n`, "utf8"),
  ) => {
    const material = Buffer.from(bytes);
    const identity = {
      gitObjectId: gitBlobObjectId(material),
      path: repositoryPath,
      sha256: sha256Hex(material),
      size: material.length,
    };
    trustedTrackedFiles.set(repositoryPath, { ...identity, bytes: material });
    return identity;
  };
  const withoutGitObject = ({ gitObjectId: _gitObjectId, ...identity }) =>
    identity;
  const database = (ecosystem) => {
    const paths = {
      npm: "osv-scalibr/npm/all.zip",
      Go: "osv-scalibr/Go/all.zip",
    };
    const urls = {
      npm: "https://storage.googleapis.com/osv-vulnerabilities/npm/all.zip",
      Go: "https://storage.googleapis.com/osv-vulnerabilities/Go/all.zip",
    };
    const identity = {
      contentLength: 42,
      ecosystem,
      etag: '"fixture"',
      file: paths[ecosystem],
      generation: "1787900000000000",
      lastModified: "2026-08-28T10:00:00.000Z",
      md5: "a".repeat(32),
      sha256: "b".repeat(64),
    };
    return {
      ecosystem,
      headers: {
        "content-length": "42",
        etag: '"fixture"',
        "last-modified": "Fri, 28 Aug 2026 10:00:00 GMT",
        "x-goog-generation": "1787900000000000",
        "x-goog-hash": `md5=${"a".repeat(32)}`,
      },
      identity,
      identitySha256: sha256Hex(canonicalJson(identity)),
      url: urls[ecosystem],
    };
  };
  const validatorFiles = [
    registerTrackedFile("go.mod"),
    registerTrackedFile("tools/osvdbcheck/cmd/osvdbcheck/main.go"),
  ];
  const terminalRawExits = {
    "R016-OSV-MISSING-DB-NEGATIVE": 127,
    "R016-OSV-VULNERABILITY-CANARY": 1,
    "R016-OSV-VULNERABILITY-DEVELOPMENT-CANARY": 1,
    "R016-OSV-GO-ADVISORY-CANARY": 1,
    "R016-OSV-GO-LICENSE-DENIED-CANARY": 1,
    "R016-OSV-LICENSE-DENIED-CANARY": 1,
    "R016-OSV-LICENSE-UNKNOWN-CANARY": 1,
    "R016-DB-ZIP": 0,
    "R016-VULNERABILITY": 0,
    "R016-LICENSE": 0,
    "R016-SAST": 0,
    "R016-SAST-NEGATIVE": 1,
  };
  const terminalChecks = [
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
  ].map((id) => ({
    id,
    status: "PASS",
    ...(Object.hasOwn(terminalRawExits, id)
      ? { rawExit: terminalRawExits[id] }
      : {}),
  }));
  const requiredProcessIds = [
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
  const semgrepSourceFiles = [
    {
      ...registerTrackedFile("scripts/fixture.mjs"),
      languageGroup: "javascript-typescript",
    },
    {
      ...validatorFiles[1],
      languageGroup: "go",
    },
  ];
  const semgrepRuleFiles = [
    ...scanners.semgrepRules.files,
    scanners.semgrepRules.license,
  ].map(({ path: rulePath, sha256 }) => ({
    path: rulePath,
    sha256,
    size: 128,
  }));
  const trustedGitPath = path.resolve(
    repositoryRoot,
    "..",
    "trusted",
    "git.exe",
  );
  const trustedDockerPath = path.resolve(
    repositoryRoot,
    "..",
    "trusted",
    "docker.exe",
  );
  const temporaryRoot = path.resolve(repositoryRoot, "..", "r016-temp");
  const configurationInput = (pathName) =>
    withoutGitObject(registerTrackedFile(pathName));
  const configurationInputs = {
    evidenceSchema: configurationInput("security/r016-evidence.schema.json"),
    osvConfig: configurationInput("security/osv-scanner.toml"),
    policy: configurationInput("security/supply-chain-policy.json"),
    scanners: configurationInput("security/scanners.lock.json"),
  };
  const pnpmInput = {
    source: withoutGitObject(registerTrackedFile("pnpm-lock.yaml")),
    documentCount: 2,
    packageCount: 2,
    directDependencyCount: 2,
    scopeCounts: {
      dependencies: 1,
      devDependencies: 1,
      optionalDependencies: 0,
      peerDependencies: 0,
      configDependencies: 0,
      packageManagerDependencies: 0,
      unknown: 0,
    },
    documents: [1, 2].map((documentNumber) => ({
      documentNumber,
      source: `/scan/pnpm-document-${documentNumber}/pnpm-lock.yaml`,
      packageCount: 1,
      sha256: String(documentNumber + 6).repeat(64),
    })),
  };
  const goInputs = [
    {
      manifest: "go.mod",
      source: "/scan/go-module-1/go.mod",
      mainModule: "github.com/tahackr5/HedefOra-V1",
      discoveredModuleCount: 2,
      thirdPartyModuleCount: 1,
      goModSha256: validatorFiles[0].sha256,
      goSumSha256: null,
      editIdentity: {
        modulePath: "github.com/tahackr5/HedefOra-V1",
        replaceCount: 0,
      },
      inventorySha256: "7".repeat(64),
    },
  ];
  const fixtureDefinitions = [
    [
      "scripts/fixtures/supply-chain/vulnerable-pnpm-lock.yaml.txt",
      "eb323623b827f2420712e31776b9973fd250c40dcbbdcbad986f9c31e950d86c",
      56,
    ],
    [
      "scripts/fixtures/supply-chain/vulnerable-development-pnpm-lock.yaml.txt",
      "19a193800b6ca44a10c15000927e16c48ebb25d1f6047d491a748725e06a9cfb",
      195,
    ],
    [
      "scripts/fixtures/supply-chain/vulnerable-go.mod.txt",
      "101ff523fa5baf340172bc1d2f35bcca95f77085d701d82ce37f8f6d9d2e0311",
      95,
    ],
    [
      "scripts/fixtures/supply-chain/go-license-denied.mod.txt",
      "bfb4dfd318d706ac8a6f24ad61450818ca23e51dd5e54a0fea59f499c1eab9f6",
      107,
    ],
    [
      "scripts/fixtures/supply-chain/license-denied-pnpm-lock.yaml.txt",
      "ff0dd178fabdd8f3552c6687f628910273418c2cdcee988efa112298235b3cd1",
      58,
    ],
    [
      "scripts/fixtures/supply-chain/license-unknown-pnpm-lock.yaml.txt",
      "a03511895b007e5da0b2804cbea27ae986621e67073ddfbbb23998d6326e9863",
      56,
    ],
    [
      "scripts/fixtures/supply-chain/sast-go-blocking.go.txt",
      "5e61ac02abf84aeb5b6d1132d068faafca0d03a2fd0bf261b8834528fbb03313",
      146,
    ],
    [
      "scripts/fixtures/supply-chain/sast-typescript-blocking.ts.txt",
      "7ab546d1e0b094db952c930c056a4e072d27d2c2a2c7a0e7452b731701513756",
      79,
    ],
  ];
  const fixtureInputs = [];
  for (const [inputPath, expectedSha256, expectedSize] of fixtureDefinitions) {
    const bytes = await readFile(path.join(repositoryRoot, inputPath));
    assert.equal(sha256Hex(bytes), expectedSha256);
    assert.equal(bytes.length, expectedSize);
    fixtureInputs.push(registerTrackedFile(inputPath, bytes));
  }
  const allTrackedInputs = [...trustedTrackedFiles.values()].map(
    ({ bytes: _bytes, ...identity }) => identity,
  );
  const trackedIndex = new Map(
    allTrackedInputs.map(({ gitObjectId: objectId, path: repositoryPath }) => [
      repositoryPath,
      { mode: "100644", objectId, path: repositoryPath, stage: 0 },
    ]),
  );
  const targetInputPaths = new Set([
    pnpmInput.source.path,
    ...goInputs.flatMap(({ manifest }) => [manifest]),
    ...semgrepSourceFiles.map(({ path: repositoryPath }) => repositoryPath),
  ]);
  const controlInputPaths = new Set([
    ...Object.values(configurationInputs).map(
      ({ path: repositoryPath }) => repositoryPath,
    ),
    ...validatorFiles.map(({ path: repositoryPath }) => repositoryPath),
    ...fixtureInputs.map(({ path: repositoryPath }) => repositoryPath),
  ]);
  const trackedInputs = allTrackedInputs.filter(({ path: repositoryPath }) =>
    targetInputPaths.has(repositoryPath),
  );
  const controlTrackedInputs = allTrackedInputs.filter(
    ({ path: repositoryPath }) => controlInputPaths.has(repositoryPath),
  );
  const trackedBlobCache = new Map(
    trackedInputs.map(({ gitObjectId: objectId, path: repositoryPath }) => [
      repositoryPath,
      {
        bytes: Buffer.from(trustedTrackedFiles.get(repositoryPath).bytes),
        objectId,
      },
    ]),
  );
  const controlTrackedBlobCache = new Map(
    controlTrackedInputs.map(
      ({ gitObjectId: objectId, path: repositoryPath }) => [
        repositoryPath,
        {
          bytes: Buffer.from(trustedTrackedFiles.get(repositoryPath).bytes),
          objectId,
        },
      ],
    ),
  );
  const trackedProcessId = (inputPath) =>
    `PROCESS-GIT-BLOB-${sha256Hex(inputPath).slice(0, 20).toUpperCase()}`;
  const controlTrackedProcessId = (inputPath) =>
    `PROCESS-GIT-CONTROL-BLOB-${sha256Hex(inputPath)
      .slice(0, 20)
      .toUpperCase()}`;
  const ruleProcessId = (inputPath) =>
    `PROCESS-RULE-BLOB-${sha256Hex(inputPath).slice(0, 20).toUpperCase()}`;
  const trackedByProcessId = new Map(
    trackedInputs.map((input) => [trackedProcessId(input.path), input]),
  );
  const controlTrackedByProcessId = new Map(
    controlTrackedInputs.map((input) => [
      controlTrackedProcessId(input.path),
      input,
    ]),
  );
  const rulesByProcessId = new Map(
    semgrepRuleFiles.map((rule) => [ruleProcessId(rule.path), rule]),
  );
  const dynamicProcessIds = [
    ...trackedInputs.map(({ path: inputPath }) => trackedProcessId(inputPath)),
    ...controlTrackedInputs.map(({ path: inputPath }) =>
      controlTrackedProcessId(inputPath),
    ),
    ...semgrepRuleFiles.map(({ path: rulePath }) => ruleProcessId(rulePath)),
    "PROCESS-GO-MOD-EDIT-GO.MOD",
    "PROCESS-GO-LIST-GO.MOD",
  ];
  const processRawExit = (id) => {
    if (id === "PROCESS-OSV-MISSING-DATABASE-NEGATIVE") return 127;
    if (
      id === "PROCESS-OSV-VULNERABILITY-CANARY" ||
      id === "PROCESS-OSV-VULNERABILITY-DEVELOPMENT-CANARY" ||
      id === "PROCESS-OSV-GO-ADVISORY-CANARY" ||
      id === "PROCESS-OSV-GO-LICENSE-DENIED-CANARY" ||
      id === "PROCESS-OSV-LICENSE-DENIED-CANARY" ||
      id === "PROCESS-OSV-LICENSE-UNKNOWN-CANARY" ||
      id === "PROCESS-SEMGREP-BLOCKING-FIXTURES"
    ) {
      return 1;
    }
    return 0;
  };
  const processImage = (id) => {
    if (
      id === "PROCESS-OSV-DATABASE-ZIP-VALIDATION" ||
      id.startsWith("PROCESS-GO-")
    ) {
      return scanners.goToolchainImage.image;
    }
    if (id.startsWith("PROCESS-SEMGREP-")) return scanners.semgrep.image;
    if (id.startsWith("PROCESS-OSV-")) return scanners.osvScanner.image;
    return null;
  };
  const osvBase = [
    "scan",
    "source",
    "--format",
    "json",
    "--all-packages",
    "--all-vulns",
  ];
  const productionLockfiles = [
    ...pnpmInput.documents.map(({ source }) => source),
    ...goInputs.map(({ source }) => source),
  ];
  const lockfileArguments = (sources) =>
    sources.flatMap((source) => ["--lockfile", source]);
  const semgrepArguments = [
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
    "--no-exclude-minified-files",
    ...scanners.semgrepRules.files.flatMap(({ path: rulePath }) => [
      "--config",
      `/rules/${rulePath}`,
    ]),
  ];
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
  };
  const dockerRun = (
    id,
    image,
    commandArguments,
    {
      environment = {},
      memory,
      mounts = [],
      network = "none",
      temporaryStorage = "128m",
      tmpfsExecutable = false,
      user,
      workdir,
    },
  ) => {
    const arguments_ = [
      "run",
      "--rm",
      "--platform",
      "linux/amd64",
      "--cidfile",
      path.join(
        temporaryRoot,
        "container-ids",
        `${id.slice("PROCESS-".length).toLowerCase()}.cid`,
      ),
      "--name",
      `hedefora-r016-${"a".repeat(24)}`,
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
    if (user) arguments_.push("--user", user);
    if (workdir) arguments_.push("--workdir", workdir);
    for (const [source, destination, readOnly] of mounts) {
      arguments_.push(
        "--mount",
        `type=bind,src=${path.resolve(temporaryRoot, ...source.split("/"))},dst=${destination}${readOnly ? ",readonly" : ""}`,
      );
    }
    for (const [name, value] of Object.entries(environment).sort(
      ([left], [right]) => left.localeCompare(right),
    )) {
      arguments_.push("--env", `${name}=${value}`);
    }
    arguments_.push(image, ...commandArguments);
    return arguments_;
  };
  const processArguments = (id) => {
    if (id.endsWith("-CLEANUP-BEFORE") || id.endsWith("-CLEANUP-AFTER")) {
      return [
        "container",
        "ls",
        "-aq",
        "--filter",
        `name=^/hedefora-r016-${"a".repeat(24)}$`,
      ];
    }
    if (trackedByProcessId.has(id)) {
      const input = trackedByProcessId.get(id);
      return ["-C", repositoryRoot, "cat-file", "blob", input.gitObjectId];
    }
    if (controlTrackedByProcessId.has(id)) {
      const input = controlTrackedByProcessId.get(id);
      return ["-C", repositoryRoot, "cat-file", "blob", input.gitObjectId];
    }
    if (rulesByProcessId.has(id)) {
      const rule = rulesByProcessId.get(id);
      return [
        "-C",
        path.join(temporaryRoot, "semgrep-rules"),
        "cat-file",
        "blob",
        `${scanners.semgrepRules.commit}:${rule.path}`,
      ];
    }
    const sourceGitArguments = {
      "PROCESS-GIT-TOP-LEVEL": [
        "-C",
        repositoryRoot,
        "rev-parse",
        "--show-toplevel",
      ],
      "PROCESS-GIT-DIRECTORY": [
        "-C",
        repositoryRoot,
        "rev-parse",
        "--absolute-git-dir",
      ],
      "PROCESS-GIT-HEAD": ["-C", repositoryRoot, "rev-parse", "HEAD"],
      "PROCESS-GIT-TREE": ["-C", repositoryRoot, "rev-parse", "HEAD^{tree}"],
      "PROCESS-GIT-BRANCH": ["-C", repositoryRoot, "branch", "--show-current"],
      "PROCESS-GIT-STATUS": [
        "-C",
        repositoryRoot,
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
      ],
      "PROCESS-GIT-INDEX": ["-C", repositoryRoot, "ls-files", "--stage", "-z"],
      "PROCESS-GIT-INDEX-FLAGS": ["-C", repositoryRoot, "ls-files", "-v", "-z"],
      "PROCESS-GIT-TOP-LEVEL-FINAL": [
        "-C",
        repositoryRoot,
        "rev-parse",
        "--show-toplevel",
      ],
      "PROCESS-GIT-DIRECTORY-FINAL": [
        "-C",
        repositoryRoot,
        "rev-parse",
        "--absolute-git-dir",
      ],
      "PROCESS-GIT-HEAD-FINAL": ["-C", repositoryRoot, "rev-parse", "HEAD"],
      "PROCESS-GIT-TREE-FINAL": [
        "-C",
        repositoryRoot,
        "rev-parse",
        "HEAD^{tree}",
      ],
      "PROCESS-GIT-STATUS-FINAL": [
        "-C",
        repositoryRoot,
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
      ],
      "PROCESS-GIT-INDEX-FINAL": [
        "-C",
        repositoryRoot,
        "ls-files",
        "--stage",
        "-z",
      ],
      "PROCESS-GIT-INDEX-FLAGS-FINAL": [
        "-C",
        repositoryRoot,
        "ls-files",
        "-v",
        "-z",
      ],
    };
    if (sourceGitArguments[id]) return sourceGitArguments[id];
    if (id.startsWith("PROCESS-RULES-")) {
      const rulesRoot = path.join(temporaryRoot, "semgrep-rules");
      const rulesArguments = {
        "PROCESS-RULES-GIT-INIT": ["-C", rulesRoot, "init", "--quiet"],
        "PROCESS-RULES-GIT-REMOTE": [
          "-C",
          rulesRoot,
          "remote",
          "add",
          "origin",
          scanners.semgrepRules.repository,
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
          scanners.semgrepRules.commit,
        ],
        "PROCESS-RULES-COMMIT": ["-C", rulesRoot, "rev-parse", "FETCH_HEAD"],
        "PROCESS-RULES-TREE": [
          "-C",
          rulesRoot,
          "rev-parse",
          "FETCH_HEAD^{tree}",
        ],
      };
      return rulesArguments[id];
    }
    if (id === "PROCESS-DOCKER-VERSION") {
      return ["version", "--format", "{{json .}}"];
    }
    const image = processImage(id);
    if (id.endsWith("-PULL")) {
      return ["pull", "--platform", "linux/amd64", image];
    }
    if (id.endsWith("-INSPECT")) return ["image", "inspect", image];
    if (id.endsWith("-INDEX")) {
      return ["manifest", "inspect", image];
    }
    const osvEnvironment = {
      HOME: "/tmp/home",
      OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY: "/cache",
    };
    const semgrepEnvironment = {
      HOME: "/tmp/home",
      SEMGREP_ENABLE_VERSION_CHECK: "0",
      SEMGREP_SEND_METRICS: "off",
    };
    if (id === "PROCESS-OSV-SCANNER-VERSION") {
      return dockerRun(id, image, ["--version"], {
        memory: "256m",
        user: "65534:65534",
      });
    }
    if (id === "PROCESS-SEMGREP-CE-VERSION") {
      return dockerRun(id, image, ["semgrep", "--version"], {
        environment: semgrepEnvironment,
        memory: "256m",
      });
    }
    if (id === "PROCESS-GO-TOOLCHAIN-VERSION") {
      return dockerRun(id, image, ["go", "version"], {
        memory: "256m",
        user: "65534:65534",
      });
    }
    if (id === "PROCESS-OSV-MISSING-DATABASE-NEGATIVE") {
      return dockerRun(
        id,
        image,
        [
          ...osvBase,
          "--offline",
          "--offline-vulnerabilities",
          ...lockfileArguments(productionLockfiles),
        ],
        {
          environment: osvEnvironment,
          memory: "768m",
          mounts: [
            ["scan-input", "/scan", true],
            ["osv-empty-cache", "/cache", true],
          ],
          user: "65534:65534",
        },
      );
    }
    if (
      [
        "PROCESS-OSV-VULNERABILITY-CANARY",
        "PROCESS-OSV-VULNERABILITY-DEVELOPMENT-CANARY",
        "PROCESS-OSV-GO-ADVISORY-CANARY",
      ].includes(id)
    ) {
      const lockfile =
        id === "PROCESS-OSV-GO-ADVISORY-CANARY"
          ? "/fixture/go.mod"
          : "/fixture/pnpm-lock.yaml";
      return dockerRun(
        id,
        image,
        [
          ...osvBase,
          "--offline",
          "--offline-vulnerabilities",
          "--lockfile",
          lockfile,
        ],
        {
          environment: osvEnvironment,
          memory: "768m",
          mounts: [
            [id.slice(8).toLowerCase(), "/fixture", true],
            ["osv-cache", "/cache", true],
          ],
          user: "65534:65534",
        },
      );
    }
    if (
      [
        "PROCESS-OSV-LICENSE-DENIED-CANARY",
        "PROCESS-OSV-LICENSE-UNKNOWN-CANARY",
        "PROCESS-OSV-GO-LICENSE-DENIED-CANARY",
      ].includes(id)
    ) {
      const lockfile =
        id === "PROCESS-OSV-GO-LICENSE-DENIED-CANARY"
          ? "/fixture/go.mod"
          : "/fixture/pnpm-lock.yaml";
      return dockerRun(
        id,
        image,
        [
          ...osvBase,
          "--config",
          "/fixture/osv-scanner.toml",
          "--data-source",
          "deps.dev",
          `--licenses=${policy.licenses.allowed.join(",")}`,
          "--lockfile",
          lockfile,
        ],
        {
          environment: { HOME: "/tmp/home" },
          memory: "768m",
          mounts: [[id.slice(8).toLowerCase(), "/fixture", true]],
          network: "bridge",
          user: "65534:65534",
        },
      );
    }
    if (id === "PROCESS-OSV-VULNERABILITY") {
      return dockerRun(
        id,
        image,
        [
          ...osvBase,
          "--offline",
          "--offline-vulnerabilities",
          ...lockfileArguments(productionLockfiles),
        ],
        {
          environment: osvEnvironment,
          memory: "1536m",
          mounts: [
            ["scan-input", "/scan", true],
            ["osv-cache", "/cache", true],
          ],
          user: "65534:65534",
        },
      );
    }
    if (id === "PROCESS-OSV-LICENSE") {
      return dockerRun(
        id,
        image,
        [
          ...osvBase,
          "--config",
          "/scan/osv-scanner.toml",
          "--data-source",
          "deps.dev",
          `--licenses=${policy.licenses.allowed.join(",")}`,
          ...lockfileArguments(productionLockfiles),
        ],
        {
          environment: { HOME: "/tmp/home" },
          memory: "1536m",
          mounts: [["scan-input", "/scan", true]],
          network: "bridge",
          user: "65534:65534",
        },
      );
    }
    if (id === "PROCESS-SEMGREP-REPOSITORY") {
      return dockerRun(id, image, [...semgrepArguments, "/src"], {
        environment: semgrepEnvironment,
        memory: "1536m",
        mounts: [
          ["semgrep-source", "/src", true],
          ["semgrep-rules-stage", "/rules", true],
        ],
      });
    }
    if (id === "PROCESS-SEMGREP-BLOCKING-FIXTURES") {
      return dockerRun(id, image, [...semgrepArguments, "/fixtures"], {
        environment: semgrepEnvironment,
        memory: "768m",
        mounts: [
          ["sast-fixtures", "/fixtures", true],
          ["semgrep-rules-stage", "/rules", true],
        ],
      });
    }
    if (id === "PROCESS-OSV-DATABASE-ZIP-VALIDATION") {
      return dockerRun(
        id,
        image,
        [
          "go",
          "run",
          "./tools/osvdbcheck/cmd/osvdbcheck",
          "--",
          ...scanners.advisoryDatabases.map(
            ({ cachePath }) => `/db/${cachePath}`,
          ),
        ],
        {
          environment: goEnvironment,
          memory: "1536m",
          mounts: [
            ["dbcheck-source", "/validator", true],
            ["osv-cache", "/db", true],
            ["dbcheck-build-cache", "/gocache", false],
            ["dbcheck-module-cache", "/gomodcache", false],
          ],
          temporaryStorage: "512m",
          tmpfsExecutable: true,
          user: "65534:65534",
          workdir: "/validator",
        },
      );
    }
    if (
      id === "PROCESS-GO-MOD-EDIT-GO.MOD" ||
      id === "PROCESS-GO-LIST-GO.MOD"
    ) {
      return dockerRun(
        id,
        image,
        id.includes("MOD-EDIT")
          ? ["go", "mod", "edit", "-json"]
          : ["go", "list", "-mod=readonly", "-m", "-json", "all"],
        {
          environment: goEnvironment,
          memory: "768m",
          mounts: [
            ["scan-input/go-module-1", "/module", true],
            ["go-module-cache", "/gomodcache", false],
            ["go-build-cache", "/gocache", false],
          ],
          network: id.includes("LIST") ? "bridge" : "none",
          user: "65534:65534",
          workdir: "/module",
        },
      );
    }
    throw new Error(`missing process fixture contract for ${id}`);
  };
  const baseProcessIds = [...requiredProcessIds, ...dynamicProcessIds];
  const cleanupProcessIds = baseProcessIds
    .filter((id) => processArguments(id)[0] === "run")
    .flatMap((id) => [`${id}-CLEANUP-BEFORE`, `${id}-CLEANUP-AFTER`]);
  const processChecks = [...baseProcessIds, ...cleanupProcessIds].map(
    (id, index) => {
      const stem = `raw/process-${index}`;
      const arguments_ = processArguments(id);
      return {
        argumentCount: arguments_.length,
        arguments: arguments_,
        artifacts: [`${stem}.stdout.log`, `${stem}.stderr.log`],
        command:
          id.startsWith("PROCESS-GIT-") ||
          id.startsWith("PROCESS-RULES-") ||
          id.startsWith("PROCESS-RULE-BLOB-")
            ? "git"
            : trustedDockerPath,
        durationMs: 12,
        id,
        outputLimitExceeded: false,
        rawExit: processRawExit(id),
        signal: null,
        status: "RECORDED",
        timedOut: false,
      };
    },
  );
  const rawArtifacts = processChecks.flatMap((check) =>
    ["stdout", "stderr"].map((stream, index) => {
      const bytes = Buffer.from(stream === "stdout" ? "x" : "", "utf8");
      return {
        path: check.artifacts[index],
        processId: check.id,
        rawSha256: sha256Hex(bytes),
        rawSize: bytes.length,
        redacted: false,
        sha256: sha256Hex(bytes),
        size: bytes.length,
        stream,
      };
    }),
  );
  const setRawArtifactIdentity = (
    processId,
    stream,
    { rawSha256, rawSize, redacted = false },
  ) => {
    const artifact = rawArtifacts.find(
      (candidate) =>
        candidate.processId === processId && candidate.stream === stream,
    );
    assert.ok(artifact, `missing raw artifact ${processId}/${stream}`);
    const rendered = redacted
      ? `${canonicalJson({ redacted: true, sha256: rawSha256, size: rawSize })}\n`
      : null;
    Object.assign(artifact, {
      rawSha256,
      rawSize,
      redacted,
      sha256: redacted ? sha256Hex(rendered) : rawSha256,
      size: redacted ? Buffer.byteLength(rendered) : rawSize,
    });
  };
  const setRawArtifactContents = (
    processId,
    stream,
    contents,
    { redacted = false } = {},
  ) => {
    const bytes = Buffer.isBuffer(contents)
      ? contents
      : Buffer.from(contents, "utf8");
    setRawArtifactIdentity(processId, stream, {
      rawSha256: sha256Hex(bytes),
      rawSize: bytes.length,
      redacted,
    });
  };
  for (const [processId, input] of trackedByProcessId) {
    setRawArtifactContents(
      processId,
      "stdout",
      trustedTrackedFiles.get(input.path).bytes,
      { redacted: true },
    );
    setRawArtifactContents(processId, "stderr", "", { redacted: true });
  }
  for (const [processId, input] of controlTrackedByProcessId) {
    setRawArtifactContents(
      processId,
      "stdout",
      trustedTrackedFiles.get(input.path).bytes,
      { redacted: true },
    );
    setRawArtifactContents(processId, "stderr", "", { redacted: true });
  }
  for (const [processId, rule] of rulesByProcessId) {
    setRawArtifactIdentity(processId, "stdout", {
      rawSha256: rule.sha256,
      rawSize: rule.size,
      redacted: true,
    });
    setRawArtifactContents(processId, "stderr", "", { redacted: true });
  }
  const toolExecutionSeals = Object.create(null);
  const tool = (name, lock) => {
    const sourceRepository =
      name === "semgrep-ce" ? lock.imageSourceRepository : null;
    const sourceRevision =
      name === "semgrep-ce" ? lock.imageSourceRevision : null;
    const inspection = [
      {
        Architecture: "amd64",
        Config: {
          Labels:
            sourceRepository === null
              ? {}
              : {
                  "org.opencontainers.image.revision": sourceRevision,
                  "org.opencontainers.image.source": sourceRepository,
                },
          User: name === "semgrep-ce" ? "1000:1000" : "65534:65534",
        },
        Os: "linux",
        RepoDigests: [`fixture/${name}@${lock.indexDigest}`],
      },
    ];
    const indexDocument = {
      schemaVersion: 2,
      mediaType: OCI_INDEX_MEDIA_TYPE,
      manifests: [
        {
          digest: lock.linuxAmd64Digest,
          mediaType: OCI_MANIFEST_MEDIA_TYPE,
          platform: { architecture: "amd64", os: "linux" },
          size: 2_048,
        },
        {
          digest: `sha256:${"a".repeat(64)}`,
          mediaType: OCI_MANIFEST_MEDIA_TYPE,
          platform: { architecture: "unknown", os: "unknown" },
          size: 512,
        },
        {
          digest: `sha256:${"b".repeat(64)}`,
          mediaType: OCI_MANIFEST_MEDIA_TYPE,
          platform: { architecture: "arm64", os: "linux" },
          size: 2_049,
        },
        {
          digest: `sha256:${"c".repeat(64)}`,
          mediaType: OCI_MANIFEST_MEDIA_TYPE,
          platform: { architecture: "unknown", os: "unknown" },
          size: 513,
        },
      ],
    };
    const prefix = `PROCESS-${name.toUpperCase()}`;
    const inspectionOutput = `${JSON.stringify(inspection)}\n`;
    const indexOutput = `${JSON.stringify(indexDocument)}\n`;
    const versionOutput = `${name} ${lock.version}\n`;
    setRawArtifactContents(`${prefix}-INSPECT`, "stdout", inspectionOutput);
    setRawArtifactContents(`${prefix}-INDEX`, "stdout", indexOutput);
    setRawArtifactContents(`${prefix}-VERSION`, "stdout", versionOutput);
    setRawArtifactContents(`${prefix}-VERSION`, "stderr", "");
    toolExecutionSeals[name] = {
      inspection: structuredClone(inspection),
      inspectionStdoutSha256: sha256Hex(inspectionOutput),
      inspectionStdoutSize: Buffer.byteLength(inspectionOutput),
      indexDocument: structuredClone(indexDocument),
      indexStdoutSha256: sha256Hex(indexOutput),
      indexStdoutSize: Buffer.byteLength(indexOutput),
      versionStderrSha256: sha256Hex(""),
      versionStderrSize: 0,
      versionStdoutSha256: sha256Hex(versionOutput),
      versionStdoutSize: Buffer.byteLength(versionOutput),
    };
    return {
      image: lock.image,
      indexDigest: lock.indexDigest,
      indexDocumentSha256: sha256Hex(canonicalJson(indexDocument)),
      inspectionSha256: sha256Hex(canonicalJson(inspection)),
      linuxAmd64Digest: lock.linuxAmd64Digest,
      runtimeUser: name === "semgrep-ce" ? "1000:1000" : "65534:65534",
      runtimeVersion: lock.version,
      sourceRepository,
      sourceRevision,
    };
  };
  const dockerVersionDocument = {
    Client: {
      Platform: { Name: "linux/amd64" },
      Version: "29.0.0",
    },
    Server: { Arch: "amd64", Os: "linux", Version: "29.0.0" },
  };
  const activeRunner = Object.create(null);
  for (const name of [
    "CI",
    "GITHUB_ACTIONS",
    "ImageOS",
    "ImageVersion",
    "RUNNER_ARCH",
    "RUNNER_OS",
  ]) {
    if (typeof process.env[name] === "string" && process.env[name] !== "") {
      activeRunner[name] = process.env[name];
    }
  }
  const isProtectedControlPath = (repositoryPath) =>
    [
      "security/supply-chain-policy.json",
      "security/scanners.lock.json",
      "security/osv-scanner.toml",
      "security/r016-evidence.schema.json",
      ".github/workflows/ci.yml",
      ".github/workflows/r016-trusted-pr.yml",
    ].includes(repositoryPath) ||
    [
      "scripts/fixtures/supply-chain/",
      "scripts/supply-chain/",
      "tools/osvdbcheck/",
    ].some((prefix) => repositoryPath.startsWith(prefix));
  const protectedControlEntries = [...trackedIndex.values()]
    .filter(({ path: repositoryPath }) =>
      isProtectedControlPath(repositoryPath),
    )
    .sort((left, right) => left.path.localeCompare(right.path, "en"));
  const controlPlaneEntries = [
    ...protectedControlEntries,
    trackedIndex.get("go.mod"),
  ].sort((left, right) => left.path.localeCompare(right.path, "en"));
  const controlPlaneFiles = controlPlaneEntries.map(
    ({ objectId: gitObjectId, path: repositoryPath }) => {
      const { sha256, size } = trustedTrackedFiles.get(repositoryPath);
      return { gitObjectId, path: repositoryPath, sha256, size };
    },
  );
  const golden = {
    advisoryDatabases: [database("npm"), database("Go")],
    checks: [...processChecks, ...terminalChecks],
    controlSource: {},
    databaseArchiveValidation: {
      archives: [0, 1].map((argument_index) => ({
        argument_index,
        entry_count: 1,
        manifest_sha256: "8".repeat(64),
        uncompressed_bytes: 64,
      })),
      limits: {
        max_entries: 300_000,
        max_entry_path_bytes: 4_096,
        max_entry_uncompressed_bytes: 134_217_728,
        max_archive_uncompressed_bytes: 8_589_934_592,
      },
      schema_version: 1,
      validatorSources: {
        files: validatorFiles,
        inventorySha256: sha256Hex(canonicalJson(validatorFiles)),
      },
    },
    databaseSeal: { path: "db-seal.json", sha256: "9".repeat(64) },
    environment: {
      docker: {
        clientPlatform: "linux/amd64",
        clientVersion: "29.0.0",
        serverArchitecture: "amd64",
        serverOs: "linux",
        serverVersion: "29.0.0",
        versionDocumentSha256: sha256Hex(canonicalJson(dockerVersionDocument)),
      },
      executables: {
        docker: {
          path: trustedDockerPath,
          sha256: "d".repeat(64),
          size: 1024,
        },
        git: {
          path: trustedGitPath,
          sha256: "e".repeat(64),
          size: 1024,
        },
      },
      runner: activeRunner,
      runtime: {
        architecture: process.arch,
        node: process.version,
        platform: process.platform,
      },
    },
    exitCode: 0,
    finishedAt: "2026-08-28T12:01:00.000Z",
    gateId: "R-016",
    inputs: {
      controlPlane: {
        files: controlPlaneFiles,
        inventorySha256: sha256Hex(canonicalJson(controlPlaneFiles)),
        mode: "same-root",
        protectedParitySha256: sha256Hex(
          canonicalJson(protectedControlEntries),
        ),
      },
      configuration: configurationInputs,
      go: goInputs,
      pnpm: pnpmInput,
      semgrepRules: {
        repository: scanners.semgrepRules.repository,
        commit: scanners.semgrepRules.commit,
        tree: scanners.semgrepRules.tree,
        license: scanners.semgrepRules.license,
        files: semgrepRuleFiles,
        manifestSha256: sha256Hex(canonicalJson(semgrepRuleFiles)),
      },
      semgrepSources: {
        fileCount: semgrepSourceFiles.length,
        groupCounts: { go: 1, "javascript-typescript": 1 },
        inventorySha256: sha256Hex(canonicalJson(semgrepSourceFiles)),
        files: semgrepSourceFiles,
      },
    },
    rawArtifacts,
    runId: "fixture",
    schemaVersion: 1,
    source: {
      branch: "codex/w001-supply-chain-gates",
      expectedCheckoutSha: null,
      gitDirectory: path.resolve(repositoryRoot, ".git"),
      head: "1".repeat(40),
      topLevel: repositoryRoot,
      trackedFileCount: trackedIndex.size,
      trackedIndexSha256: sha256Hex(canonicalJson([...trackedIndex.values()])),
      tree: "2".repeat(40),
    },
    startedAt: "2026-08-28T12:00:00.000Z",
    status: "PASS",
    tools: {
      "go-toolchain": tool("go-toolchain", scanners.goToolchainImage),
      "osv-scanner": tool("osv-scanner", scanners.osvScanner),
      "semgrep-ce": tool("semgrep-ce", scanners.semgrep),
    },
  };
  golden.controlSource = structuredClone(golden.source);
  for (const check of golden.checks) {
    if (check.command === "git") check.command = trustedGitPath;
  }
  Object.assign(
    golden.checks.find(({ id }) => id === "R016-EXECUTION-ENVIRONMENT"),
    {
      docker: structuredClone(golden.environment.docker),
      executables: structuredClone(golden.environment.executables),
      runtime: structuredClone(golden.environment.runtime),
    },
  );
  golden.databaseSeal.sha256 = sha256Hex(
    `${canonicalJson({
      schemaVersion: 1,
      gateId: "R-016",
      runId: golden.runId,
      source: golden.source,
      controlSource: golden.controlSource,
      databases: golden.advisoryDatabases,
    })}\n`,
  );
  const setTerminal = (id, fields) =>
    Object.assign(
      golden.checks.find((check) => check.id === id),
      fields,
    );
  const inventorySha256 = (source, packages) =>
    sha256Hex(
      canonicalJson([
        {
          packages: [...packages].sort((left, right) =>
            `${left.ecosystem}:${left.name}@${left.version}#${left.scope}`.localeCompare(
              `${right.ecosystem}:${right.name}@${right.version}#${right.scope}`,
            ),
          ),
          source,
        },
      ]),
    );
  for (const [processId, contents] of [
    ["PROCESS-GIT-HEAD", `${golden.source.head}\n`],
    ["PROCESS-GIT-HEAD-FINAL", `${golden.source.head}\n`],
    ["PROCESS-GIT-TREE", `${golden.source.tree}\n`],
    ["PROCESS-GIT-TREE-FINAL", `${golden.source.tree}\n`],
    ["PROCESS-GIT-BRANCH", `${golden.source.branch}\n`],
    ["PROCESS-GIT-STATUS", ""],
    ["PROCESS-GIT-STATUS-FINAL", ""],
    ["PROCESS-GIT-TOP-LEVEL", `${repositoryRoot}\n`],
    ["PROCESS-GIT-TOP-LEVEL-FINAL", `${repositoryRoot}\n`],
    ["PROCESS-GIT-DIRECTORY", `${golden.source.gitDirectory}\n`],
    ["PROCESS-GIT-DIRECTORY-FINAL", `${golden.source.gitDirectory}\n`],
    [
      "PROCESS-GIT-INDEX",
      [...trackedIndex.values()]
        .map(
          ({ mode, objectId, path: repositoryPath, stage }) =>
            `${mode} ${objectId} ${stage}\t${repositoryPath}\0`,
        )
        .join(""),
    ],
    [
      "PROCESS-GIT-INDEX-FINAL",
      [...trackedIndex.values()]
        .map(
          ({ mode, objectId, path: repositoryPath, stage }) =>
            `${mode} ${objectId} ${stage}\t${repositoryPath}\0`,
        )
        .join(""),
    ],
    [
      "PROCESS-GIT-INDEX-FLAGS",
      [...trackedIndex.values()]
        .map(({ path: repositoryPath }) => `H ${repositoryPath}\0`)
        .join(""),
    ],
    [
      "PROCESS-GIT-INDEX-FLAGS-FINAL",
      [...trackedIndex.values()]
        .map(({ path: repositoryPath }) => `H ${repositoryPath}\0`)
        .join(""),
    ],
    ["PROCESS-RULES-COMMIT", `${scanners.semgrepRules.commit}\n`],
    ["PROCESS-RULES-TREE", `${scanners.semgrepRules.tree}\n`],
    ["PROCESS-DOCKER-VERSION", `${JSON.stringify(dockerVersionDocument)}\n`],
  ]) {
    setRawArtifactContents(processId, "stdout", contents);
  }
  for (const cleanupId of cleanupProcessIds) {
    setRawArtifactContents(cleanupId, "stdout", "");
    setRawArtifactContents(cleanupId, "stderr", "");
  }
  const databaseRawReport = {
    schema_version: golden.databaseArchiveValidation.schema_version,
    limits: golden.databaseArchiveValidation.limits,
    archives: golden.databaseArchiveValidation.archives.map((archive) => ({
      argument_index: archive.argument_index,
      entry_count: archive.entry_count,
      uncompressed_bytes: archive.uncompressed_bytes,
      manifest_sha256: archive.manifest_sha256,
    })),
  };
  setRawArtifactContents(
    "PROCESS-OSV-DATABASE-ZIP-VALIDATION",
    "stdout",
    `${JSON.stringify(databaseRawReport)}\n`,
  );
  setRawArtifactContents("PROCESS-OSV-DATABASE-ZIP-VALIDATION", "stderr", "");
  setTerminal("R016-SOURCE-SEAL", {
    head: golden.source.head,
    tree: golden.source.tree,
  });
  setTerminal("R016-CONTROL-SOURCE-SEAL", {
    head: golden.controlSource.head,
    sameAsTarget: true,
    tree: golden.controlSource.tree,
  });
  setTerminal("R016-DB-SEAL", {
    detail: "offline scan database bytes match the pre-scan seal",
  });
  setTerminal("R016-GATE", {
    detail: "all required controls passed in the same run",
  });
  const lodashUnknown = [
    { ecosystem: "npm", name: "lodash", scope: "unknown", version: "4.17.20" },
  ];
  const lodashDevelopment = [
    {
      ecosystem: "npm",
      name: "lodash",
      scope: "development",
      version: "4.17.20",
    },
  ];
  setTerminal("R016-OSV-VULNERABILITY-CANARY", {
    expectedScope: "unknown",
    findingCount: 1,
    fixtureSha256: fixtureInputs[0].sha256,
    inventorySha256: inventorySha256("/fixture/pnpm-lock.yaml", lodashUnknown),
  });
  setTerminal("R016-OSV-VULNERABILITY-DEVELOPMENT-CANARY", {
    expectedScope: "development",
    findingCount: 1,
    fixtureSha256: fixtureInputs[1].sha256,
    inventorySha256: inventorySha256(
      "/fixture/pnpm-lock.yaml",
      lodashDevelopment,
    ),
  });
  setTerminal("R016-OSV-GO-ADVISORY-CANARY", {
    advisoryId: "GO-2022-1059",
    ecosystem: "Go",
    extractionCount: 2,
    fixtureSha256: fixtureInputs[2].sha256,
    packageName: "golang.org/x/text",
    version: "0.3.7",
  });
  const goLicenseInventory = [
    {
      ecosystem: "Go",
      name: "github.com/MichaelMure/git-bug",
      scope: "unknown",
      version: "0.8.0",
    },
  ];
  setTerminal("R016-OSV-GO-LICENSE-DENIED-CANARY", {
    ecosystem: "Go",
    expectedLicense: "GPL-3.0-or-later",
    extractionCount: 2,
    findingCount: 3,
    fixtureSha256: fixtureInputs[3].sha256,
    inventorySha256: inventorySha256("/fixture/go.mod", goLicenseInventory),
    packageName: "github.com/MichaelMure/git-bug",
    version: "0.8.0",
  });
  for (const [id, fixture, expectedLicense, packageName, version] of [
    [
      "R016-OSV-LICENSE-DENIED-CANARY",
      fixtureInputs[4],
      "BUSL-1.1",
      "directus",
      "11.17.3",
    ],
    [
      "R016-OSV-LICENSE-UNKNOWN-CANARY",
      fixtureInputs[5],
      "UNKNOWN",
      "reserved",
      "0.1.1",
    ],
  ]) {
    setTerminal(id, {
      expectedLicense,
      findingCount: 1,
      fixtureSha256: fixture.sha256,
      inventorySha256: inventorySha256("/fixture/pnpm-lock.yaml", [
        { ecosystem: "npm", name: packageName, scope: "unknown", version },
      ]),
    });
  }
  setTerminal("R016-DB-ZIP", { archiveCount: 2 });
  const productionPackageCount =
    pnpmInput.packageCount +
    goInputs.reduce((sum, module) => sum + module.thirdPartyModuleCount, 0);
  const productionSourceCount =
    pnpmInput.documents.length +
    goInputs.filter(({ thirdPartyModuleCount }) => thirdPartyModuleCount > 0)
      .length;
  setTerminal("R016-VULNERABILITY", {
    inventorySha256: "a".repeat(64),
    packageCount: productionPackageCount,
    sourceCount: productionSourceCount,
    threshold: policy.vulnerabilities.minimumBlockingCvss,
  });
  setTerminal("R016-LICENSE", {
    allowedSpdxSha256: sha256Hex(
      canonicalJson(
        [...policy.licenses.allowed].sort((left, right) =>
          left.localeCompare(right),
        ),
      ),
    ),
    inventorySha256: "b".repeat(64),
    onlineMetadataSource: "deps.dev",
    packageCount: productionPackageCount,
    reproducibilityResidual:
      "deps.dev does not expose a response snapshot digest; exact package parity and fail-closed network handling are enforced",
    sourceCount: productionSourceCount,
  });
  const repositorySourcePaths = semgrepSourceFiles
    .map(({ path: repositoryPath }) => repositoryPath)
    .sort();
  setTerminal("R016-SAST", {
    coverage: { go: 1, "javascript-typescript": 1 },
    engine: "Semgrep Community Edition --oss-only",
    exactSourceParity: {
      pathCount: repositorySourcePaths.length,
      pathsSha256: sha256Hex(canonicalJson(repositorySourcePaths)),
    },
    scannedPathCount: repositorySourcePaths.length,
    scannedPathsSha256: sha256Hex(
      canonicalJson(
        repositorySourcePaths.map((repositoryPath) => `/src/${repositoryPath}`),
      ),
    ),
  });
  const negativePaths = [
    "ignored/sast-semgrepignore.ts",
    "sast-go-blocking.go",
    "sast-over-limit.ts",
    "sast-typescript-blocking.ts",
  ];
  setTerminal("R016-SAST-NEGATIVE", {
    coverage: { go: 1, "javascript-typescript": 3 },
    exactSourceParity: {
      pathCount: negativePaths.length,
      pathsSha256: sha256Hex(canonicalJson(negativePaths)),
    },
    findingCount: 4,
    largeFixtureSha256:
      "63f4ebd42b8f3abd4c60b85cc3cc0614c595f8dbb27b350132f1eadc577e2832",
  });
  const terminalProcesses = {
    "R016-OSV-MISSING-DB-NEGATIVE": "PROCESS-OSV-MISSING-DATABASE-NEGATIVE",
    "R016-OSV-VULNERABILITY-CANARY": "PROCESS-OSV-VULNERABILITY-CANARY",
    "R016-OSV-VULNERABILITY-DEVELOPMENT-CANARY":
      "PROCESS-OSV-VULNERABILITY-DEVELOPMENT-CANARY",
    "R016-OSV-GO-ADVISORY-CANARY": "PROCESS-OSV-GO-ADVISORY-CANARY",
    "R016-OSV-GO-LICENSE-DENIED-CANARY": "PROCESS-OSV-GO-LICENSE-DENIED-CANARY",
    "R016-OSV-LICENSE-DENIED-CANARY": "PROCESS-OSV-LICENSE-DENIED-CANARY",
    "R016-OSV-LICENSE-UNKNOWN-CANARY": "PROCESS-OSV-LICENSE-UNKNOWN-CANARY",
    "R016-DB-ZIP": "PROCESS-OSV-DATABASE-ZIP-VALIDATION",
    "R016-VULNERABILITY": "PROCESS-OSV-VULNERABILITY",
    "R016-LICENSE": "PROCESS-OSV-LICENSE",
    "R016-SAST": "PROCESS-SEMGREP-REPOSITORY",
    "R016-SAST-NEGATIVE": "PROCESS-SEMGREP-BLOCKING-FIXTURES",
  };
  for (const [terminalId, processId] of Object.entries(terminalProcesses)) {
    const terminal = golden.checks.find(({ id }) => id === terminalId);
    const stdout = golden.rawArtifacts.find(
      (artifact) =>
        artifact.processId === processId && artifact.stream === "stdout",
    );
    const stderr = golden.rawArtifacts.find(
      (artifact) =>
        artifact.processId === processId && artifact.stream === "stderr",
    );
    Object.assign(terminal, {
      processId,
      stdoutSha256: stdout.sha256,
      stdoutRawSha256: stdout.rawSha256,
      stderrSha256: stderr.sha256,
      stderrRawSha256: stderr.rawSha256,
    });
  }
  const vulnerabilityTerminal = golden.checks.find(
    ({ id }) => id === "R016-VULNERABILITY",
  );
  const licenseTerminal = golden.checks.find(({ id }) => id === "R016-LICENSE");
  const verdictExecutionSeals = {
    vulnerability: Object.fromEntries(
      ["inventorySha256", "packageCount", "sourceCount", "threshold"].map(
        (name) => [name, vulnerabilityTerminal[name]],
      ),
    ),
    license: Object.fromEntries(
      [
        "allowedSpdxSha256",
        "inventorySha256",
        "packageCount",
        "sourceCount",
      ].map((name) => [name, licenseTerminal[name]]),
    ),
  };
  const validationContext = {
    configuration: { policy, scanners },
    configurationInputs: structuredClone(golden.inputs.configuration),
    controlInputsSeal: structuredClone(golden.inputs.controlPlane),
    controlRoot: repositoryRoot,
    controlSourceSeal: structuredClone(golden.controlSource),
    controlTrackedBlobCache,
    controlTrackedIndex: trackedIndex,
    databaseArchiveSeal: structuredClone(golden.databaseArchiveValidation),
    databaseIdentitySeal: structuredClone(golden.advisoryDatabases),
    dockerEnvironmentSeal: {
      document: structuredClone(dockerVersionDocument),
      stdoutSha256: sha256Hex(
        Buffer.from(`${JSON.stringify(dockerVersionDocument)}\n`, "utf8"),
      ),
      stdoutSize: Buffer.byteLength(
        `${JSON.stringify(dockerVersionDocument)}\n`,
      ),
    },
    environmentSeal: structuredClone(golden.environment),
    inputsSeal: structuredClone(golden.inputs),
    processSeals: new Map(
      processChecks.map((check) => [check.id, structuredClone(check)]),
    ),
    rawArtifactSeals: new Map(
      golden.rawArtifacts.map((artifact) => [
        artifact.path,
        structuredClone(artifact),
      ]),
    ),
    root: repositoryRoot,
    sourceSeal: structuredClone(golden.source),
    terminalSeals: new Map(
      terminalChecks.map((check) => [check.id, structuredClone(check)]),
    ),
    toolExecutionSeals,
    toolsSeal: structuredClone(golden.tools),
    temporaryRoot,
    trackedBlobCache,
    trackedIndex,
    verdictExecutionSeals,
  };
  const validate = (document, schema = evidenceSchema) =>
    validateEvidenceDocument(document, schema, validationContext);
  const coSealedContext = (document) => ({
    ...validationContext,
    controlInputsSeal: structuredClone(document.inputs.controlPlane),
    controlSourceSeal: structuredClone(document.controlSource),
    databaseArchiveSeal: structuredClone(document.databaseArchiveValidation),
    environmentSeal: structuredClone(document.environment),
    inputsSeal: structuredClone(document.inputs),
    processSeals: new Map(
      document.checks
        .filter(({ id }) => id.startsWith("PROCESS-"))
        .map((check) => [check.id, structuredClone(check)]),
    ),
    rawArtifactSeals: new Map(
      document.rawArtifacts.map((artifact) => [
        artifact.path,
        structuredClone(artifact),
      ]),
    ),
    sourceSeal: structuredClone(document.source),
    terminalSeals: new Map(
      document.checks
        .filter(({ id }) => id.startsWith("R016-"))
        .map((check) => [check.id, structuredClone(check)]),
    ),
    toolsSeal: structuredClone(document.tools),
  });
  const validateCoSealed = (document) =>
    validateEvidenceDocument(
      document,
      evidenceSchema,
      coSealedContext(document),
    );
  const baseToolIndexDocument = toolExecutionSeals["semgrep-ce"].indexDocument;
  const validateWithToolIndex = (indexDocument) => {
    const document = structuredClone(golden);
    const indexOutput = `${JSON.stringify(indexDocument)}\n`;
    const indexSha256 = sha256Hex(indexOutput);
    const indexSize = Buffer.byteLength(indexOutput);
    document.tools["semgrep-ce"].indexDocumentSha256 = sha256Hex(
      canonicalJson(indexDocument),
    );
    Object.assign(
      document.rawArtifacts.find(
        ({ processId, stream }) =>
          processId === "PROCESS-SEMGREP-CE-INDEX" && stream === "stdout",
      ),
      {
        rawSha256: indexSha256,
        rawSize: indexSize,
        sha256: indexSha256,
        size: indexSize,
      },
    );
    const context = coSealedContext(document);
    context.toolExecutionSeals = structuredClone(toolExecutionSeals);
    Object.assign(context.toolExecutionSeals["semgrep-ce"], {
      indexDocument: structuredClone(indexDocument),
      indexStdoutSha256: indexSha256,
      indexStdoutSize: indexSize,
    });
    return validateEvidenceDocument(document, evidenceSchema, context);
  };
  const mutatedToolIndex = (mutate) => {
    const document = structuredClone(baseToolIndexDocument);
    mutate(document);
    return document;
  };
  assert.equal(validate(golden), true);

  const dockerManifestList = structuredClone(baseToolIndexDocument);
  dockerManifestList.mediaType = DOCKER_LIST_MEDIA_TYPE;
  for (const descriptor of dockerManifestList.manifests) {
    descriptor.mediaType = DOCKER_MANIFEST_MEDIA_TYPE;
  }
  assert.equal(validateWithToolIndex(dockerManifestList), true);

  for (const [mutate, message] of [
    [(document) => delete document.schemaVersion, /schemaVersion/u],
    [(document) => (document.schemaVersion = 1), /schemaVersion/u],
    [(document) => delete document.mediaType, /mediaType/u],
    [(document) => (document.mediaType = "application/json"), /mediaType/u],
    [(document) => delete document.manifests, /manifests/u],
    [(document) => (document.manifests = {}), /manifests/u],
    [
      (document) => (document.manifests[0].mediaType = OCI_INDEX_MEDIA_TYPE),
      /direct compatible image manifest/u,
    ],
    [
      (document) =>
        (document.manifests[0].mediaType = DOCKER_MANIFEST_MEDIA_TYPE),
      /direct compatible image manifest/u,
    ],
    [(document) => delete document.manifests[0].size, /size/u],
    [(document) => (document.manifests[0].size = 0), /size/u],
    [
      (document) => (document.manifests[0].size = Number.MAX_SAFE_INTEGER + 1),
      /size/u,
    ],
    [
      (document) =>
        (document.manifests[0].digest =
          document.manifests[0].digest.toUpperCase()),
      /digest/u,
    ],
    [
      (document) => (document.manifests[0].digest = `sha256:${"d".repeat(64)}`),
      /linux\/amd64 manifest differs from the scanner lock/u,
    ],
    [
      (document) => (document.manifests[1].digest = `sha256:${"g".repeat(64)}`),
      /digest/u,
    ],
    [(document) => delete document.manifests[0].platform, /platform/u],
    [(document) => (document.manifests[0].platform.variant = ""), /variant/u],
    [
      (document) =>
        document.manifests.push({
          ...structuredClone(document.manifests[2]),
          digest: `sha256:${"e".repeat(64)}`,
        }),
      /duplicate concrete platform/u,
    ],
  ]) {
    assert.throws(
      () => validateWithToolIndex(mutatedToolIndex(mutate)),
      message,
    );
  }

  const nestedDockerManifestList = structuredClone(dockerManifestList);
  nestedDockerManifestList.manifests[0].mediaType = DOCKER_LIST_MEDIA_TYPE;
  assert.throws(
    () => validateWithToolIndex(nestedDockerManifestList),
    /direct compatible image manifest/u,
  );

  const splitGolden = structuredClone(golden);
  const splitControlRoot = path.resolve(repositoryRoot, "..", "control-root");
  splitGolden.inputs.controlPlane.mode = "split-root";
  splitGolden.source.expectedCheckoutSha = splitGolden.source.head;
  splitGolden.controlSource = {
    branch: "trusted/base",
    expectedCheckoutSha: "7".repeat(40),
    gitDirectory: path.join(splitControlRoot, ".git"),
    head: "7".repeat(40),
    topLevel: splitControlRoot,
    trackedFileCount: trackedIndex.size,
    trackedIndexSha256: sha256Hex(canonicalJson([...trackedIndex.values()])),
    tree: "6".repeat(40),
  };
  const splitControlTerminal = splitGolden.checks.find(
    ({ id }) => id === "R016-CONTROL-SOURCE-SEAL",
  );
  Object.assign(splitControlTerminal, {
    head: splitGolden.controlSource.head,
    tree: splitGolden.controlSource.tree,
  });
  delete splitControlTerminal.sameAsTarget;
  for (const check of splitGolden.checks.filter(({ id }) =>
    id.startsWith("PROCESS-GIT-CONTROL-BLOB-"),
  )) {
    check.arguments[1] = splitControlRoot;
  }
  const splitIndexOutput = [...trackedIndex.values()]
    .map(
      ({ mode, objectId, path: repositoryPath, stage }) =>
        `${mode} ${objectId} ${stage}\t${repositoryPath}\0`,
    )
    .join("");
  const splitFlagsOutput = [...trackedIndex.values()]
    .map(({ path: repositoryPath }) => `H ${repositoryPath}\0`)
    .join("");
  const splitSourceContracts = {
    "PROCESS-GIT-CONTROL-TOP-LEVEL": {
      arguments: ["-C", splitControlRoot, "rev-parse", "--show-toplevel"],
      stdout: `${splitControlRoot}\n`,
    },
    "PROCESS-GIT-CONTROL-DIRECTORY": {
      arguments: ["-C", splitControlRoot, "rev-parse", "--absolute-git-dir"],
      stdout: `${splitGolden.controlSource.gitDirectory}\n`,
    },
    "PROCESS-GIT-CONTROL-HEAD": {
      arguments: ["-C", splitControlRoot, "rev-parse", "HEAD"],
      stdout: `${splitGolden.controlSource.head}\n`,
    },
    "PROCESS-GIT-CONTROL-TREE": {
      arguments: ["-C", splitControlRoot, "rev-parse", "HEAD^{tree}"],
      stdout: `${splitGolden.controlSource.tree}\n`,
    },
    "PROCESS-GIT-CONTROL-BRANCH": {
      arguments: ["-C", splitControlRoot, "branch", "--show-current"],
      stdout: `${splitGolden.controlSource.branch}\n`,
    },
    "PROCESS-GIT-CONTROL-STATUS": {
      arguments: [
        "-C",
        splitControlRoot,
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
      ],
      stdout: "",
    },
    "PROCESS-GIT-CONTROL-INDEX": {
      arguments: ["-C", splitControlRoot, "ls-files", "--stage", "-z"],
      stdout: splitIndexOutput,
    },
    "PROCESS-GIT-CONTROL-INDEX-FLAGS": {
      arguments: ["-C", splitControlRoot, "ls-files", "-v", "-z"],
      stdout: splitFlagsOutput,
    },
    "PROCESS-GIT-CONTROL-TOP-LEVEL-FINAL": {
      arguments: ["-C", splitControlRoot, "rev-parse", "--show-toplevel"],
      stdout: `${splitControlRoot}\n`,
    },
    "PROCESS-GIT-CONTROL-DIRECTORY-FINAL": {
      arguments: ["-C", splitControlRoot, "rev-parse", "--absolute-git-dir"],
      stdout: `${splitGolden.controlSource.gitDirectory}\n`,
    },
    "PROCESS-GIT-CONTROL-HEAD-FINAL": {
      arguments: ["-C", splitControlRoot, "rev-parse", "HEAD"],
      stdout: `${splitGolden.controlSource.head}\n`,
    },
    "PROCESS-GIT-CONTROL-TREE-FINAL": {
      arguments: ["-C", splitControlRoot, "rev-parse", "HEAD^{tree}"],
      stdout: `${splitGolden.controlSource.tree}\n`,
    },
    "PROCESS-GIT-CONTROL-STATUS-FINAL": {
      arguments: [
        "-C",
        splitControlRoot,
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
      ],
      stdout: "",
    },
    "PROCESS-GIT-CONTROL-INDEX-FINAL": {
      arguments: ["-C", splitControlRoot, "ls-files", "--stage", "-z"],
      stdout: splitIndexOutput,
    },
    "PROCESS-GIT-CONTROL-INDEX-FLAGS-FINAL": {
      arguments: ["-C", splitControlRoot, "ls-files", "-v", "-z"],
      stdout: splitFlagsOutput,
    },
  };
  for (const [index, [id, contract]] of Object.entries(
    splitSourceContracts,
  ).entries()) {
    const stem = `raw/split-control-${index}`;
    const stdoutBytes = Buffer.from(contract.stdout, "utf8");
    const stderrBytes = Buffer.alloc(0);
    splitGolden.checks.push({
      argumentCount: contract.arguments.length,
      arguments: contract.arguments,
      artifacts: [`${stem}.stdout.log`, `${stem}.stderr.log`],
      command: trustedGitPath,
      durationMs: 1,
      id,
      outputLimitExceeded: false,
      rawExit: 0,
      signal: null,
      status: "RECORDED",
      timedOut: false,
    });
    splitGolden.rawArtifacts.push(
      {
        path: `${stem}.stdout.log`,
        processId: id,
        rawSha256: sha256Hex(stdoutBytes),
        rawSize: stdoutBytes.length,
        redacted: false,
        sha256: sha256Hex(stdoutBytes),
        size: stdoutBytes.length,
        stream: "stdout",
      },
      {
        path: `${stem}.stderr.log`,
        processId: id,
        rawSha256: sha256Hex(stderrBytes),
        rawSize: 0,
        redacted: false,
        sha256: sha256Hex(stderrBytes),
        size: 0,
        stream: "stderr",
      },
    );
  }
  splitGolden.databaseSeal.sha256 = sha256Hex(
    `${canonicalJson({
      schemaVersion: 1,
      gateId: "R-016",
      runId: splitGolden.runId,
      source: splitGolden.source,
      controlSource: splitGolden.controlSource,
      databases: splitGolden.advisoryDatabases,
    })}\n`,
  );
  const splitContext = {
    ...coSealedContext(splitGolden),
    controlRoot: splitControlRoot,
    controlSourceSeal: structuredClone(splitGolden.controlSource),
  };
  assert.equal(
    validateEvidenceDocument(splitGolden, evidenceSchema, splitContext),
    true,
  );

  const unboundSplitTarget = structuredClone(splitGolden);
  unboundSplitTarget.source.expectedCheckoutSha = null;
  const unboundSplitContext = {
    ...coSealedContext(unboundSplitTarget),
    controlRoot: splitControlRoot,
    controlSourceSeal: structuredClone(unboundSplitTarget.controlSource),
  };
  assert.throws(
    () =>
      validateEvidenceDocument(
        unboundSplitTarget,
        evidenceSchema,
        unboundSplitContext,
      ),
    /split-root PASS evidence must bind expected checkout SHA|schema/u,
  );

  const alteredManifestInspect = structuredClone(golden);
  const alteredManifestInspectProcess = alteredManifestInspect.checks.find(
    ({ id }) => id === "PROCESS-SEMGREP-CE-INDEX",
  );
  alteredManifestInspectProcess.arguments.push("--verbose");
  alteredManifestInspectProcess.argumentCount =
    alteredManifestInspectProcess.arguments.length;
  assert.throws(
    () => validateCoSealed(alteredManifestInspect),
    /utility arguments/u,
  );

  const forgedManifestInspectRaw = structuredClone(golden);
  const forgedManifestInspectArtifact =
    forgedManifestInspectRaw.rawArtifacts.find(
      ({ processId, stream }) =>
        processId === "PROCESS-SEMGREP-CE-INDEX" && stream === "stdout",
    );
  const forgedManifestInspectOutput = `${JSON.stringify({
    mediaType: OCI_INDEX_MEDIA_TYPE,
    schemaVersion: 2,
    manifests: [],
  })}\n`;
  Object.assign(forgedManifestInspectArtifact, {
    rawSha256: sha256Hex(forgedManifestInspectOutput),
    rawSize: Buffer.byteLength(forgedManifestInspectOutput),
    sha256: sha256Hex(forgedManifestInspectOutput),
    size: Buffer.byteLength(forgedManifestInspectOutput),
  });
  assert.throws(
    () => validateCoSealed(forgedManifestInspectRaw),
    /trusted execution/u,
  );

  const networkBypass = structuredClone(golden);
  const networkBypassProcess = networkBypass.checks.find(
    ({ id }) => id === "PROCESS-OSV-VULNERABILITY",
  );
  networkBypassProcess.arguments[
    networkBypassProcess.arguments.indexOf("--network") + 1
  ] = "host";
  assert.throws(
    () => validateCoSealed(networkBypass),
    /Docker run contract|Docker security/u,
  );

  const mountSourceSwap = structuredClone(golden);
  const mountSwapProcess = mountSourceSwap.checks.find(
    ({ id }) => id === "PROCESS-OSV-VULNERABILITY",
  );
  const mountArgumentIndex = mountSwapProcess.arguments.findIndex(
    (argument) => argument === "--mount",
  );
  mountSwapProcess.arguments[mountArgumentIndex + 1] =
    `type=bind,src=${path.join(temporaryRoot, "attacker-source")},dst=/scan,readonly`;
  assert.throws(
    () => validateCoSealed(mountSourceSwap),
    /Docker run contract/u,
  );

  const coSealedSast = structuredClone(golden);
  const coSealedSastTerminal = coSealedSast.checks.find(
    ({ id }) => id === "R016-SAST",
  );
  coSealedSastTerminal.engine = "attacker-engine";
  coSealedSastTerminal.exactSourceParity.pathCount = 999;
  assert.throws(() => validateCoSealed(coSealedSast), /SAST terminal verdict/u);

  const contradictoryTerminalExtra = structuredClone(golden);
  contradictoryTerminalExtra.checks.find(
    ({ id }) => id === "R016-VULNERABILITY",
  ).errors = ["contradictory PASS evidence"];
  assert.throws(
    () => validateCoSealed(contradictoryTerminalExtra),
    /terminal R016-VULNERABILITY does not match the exact required keys/u,
  );

  const coSealedVulnerabilityInventory = structuredClone(golden);
  coSealedVulnerabilityInventory.checks.find(
    ({ id }) => id === "R016-VULNERABILITY",
  ).inventorySha256 = "c".repeat(64);
  assert.throws(
    () => validateCoSealed(coSealedVulnerabilityInventory),
    /vulnerability terminal verdict is inconsistent/u,
  );

  const coSealedLicenseInventory = structuredClone(golden);
  coSealedLicenseInventory.checks.find(
    ({ id }) => id === "R016-LICENSE",
  ).inventorySha256 = "d".repeat(64);
  assert.throws(
    () => validateCoSealed(coSealedLicenseInventory),
    /license terminal verdict is inconsistent/u,
  );

  const missingCanaryField = structuredClone(golden);
  delete missingCanaryField.checks.find(
    ({ id }) => id === "R016-OSV-GO-ADVISORY-CANARY",
  ).advisoryId;
  assert.throws(
    () => validateCoSealed(missingCanaryField),
    /Go advisory canary|schema|terminal R016-OSV-GO-ADVISORY-CANARY/u,
  );

  const missingPnpmDocumentField = structuredClone(golden);
  delete missingPnpmDocumentField.inputs.pnpm.documents[0].sha256;
  assert.throws(
    () => validateCoSealed(missingPnpmDocumentField),
    /pnpm|schema/u,
  );

  const missingGoManifest = structuredClone(golden);
  delete missingGoManifest.inputs.go[0].manifest;
  assert.throws(() => validateCoSealed(missingGoManifest), /Go input|schema/u);

  const minimalPnpmShape = structuredClone(golden);
  minimalPnpmShape.inputs.pnpm = { documents: [{}] };
  assert.throws(() => validateCoSealed(minimalPnpmShape), /pnpm|schema/u);

  const minimalGoShape = structuredClone(golden);
  minimalGoShape.inputs.go = [{ manifest: "go.mod" }];
  assert.throws(() => validateCoSealed(minimalGoShape), /Go input|schema/u);

  const missingArchiveLimit = structuredClone(golden);
  delete missingArchiveLimit.databaseArchiveValidation.limits.max_entries;
  assert.throws(
    () => validateCoSealed(missingArchiveLimit),
    /database archive|limits|schema/u,
  );

  const wrongArchiveLimit = structuredClone(golden);
  wrongArchiveLimit.databaseArchiveValidation.limits.max_entries = 300_001;
  assert.throws(
    () => validateCoSealed(wrongArchiveLimit),
    /database archive|limits|schema/u,
  );

  const staleArchiveLimit = structuredClone(golden);
  staleArchiveLimit.databaseArchiveValidation.limits.max_entries = 200_000;
  assert.throws(
    () => validateCoSealed(staleArchiveLimit),
    /database archive|limits|schema/u,
  );

  const excessiveArchiveEntries = structuredClone(golden);
  excessiveArchiveEntries.databaseArchiveValidation.archives[0].entry_count = 300_001;
  assert.throws(
    () => validateCoSealed(excessiveArchiveEntries),
    /database archive|schema/u,
  );

  const excessiveArchiveBytes = structuredClone(golden);
  excessiveArchiveBytes.databaseArchiveValidation.archives[0].uncompressed_bytes = 8_589_934_593;
  assert.throws(
    () => validateCoSealed(excessiveArchiveBytes),
    /database archive|schema/u,
  );

  const coSealedArchiveDigest = structuredClone(golden);
  coSealedArchiveDigest.databaseArchiveValidation.archives[0].manifest_sha256 =
    "0".repeat(64);
  assert.throws(
    () => validateCoSealed(coSealedArchiveDigest),
    /database archive report does not match exact process output/u,
  );

  const coSealedArchiveCount = structuredClone(golden);
  coSealedArchiveCount.checks.find(
    ({ id }) => id === "R016-DB-ZIP",
  ).archiveCount = 1;
  assert.throws(
    () => validateCoSealed(coSealedArchiveCount),
    /database archive report does not match exact process output/u,
  );

  const controlBlobRootSwap = structuredClone(golden);
  const controlBlob = controlBlobRootSwap.checks.find(({ id }) =>
    id.startsWith("PROCESS-GIT-CONTROL-BLOB-"),
  );
  controlBlob.arguments[1] = path.resolve(repositoryRoot, "attacker-control");
  assert.throws(
    () => validateCoSealed(controlBlobRootSwap),
    /control tracked blob process/u,
  );

  const missingControlBlob = structuredClone(golden);
  const removedControlBlob = missingControlBlob.checks.find(({ id }) =>
    id.startsWith("PROCESS-GIT-CONTROL-BLOB-"),
  );
  missingControlBlob.checks = missingControlBlob.checks.filter(
    ({ id }) => id !== removedControlBlob.id,
  );
  missingControlBlob.rawArtifacts = missingControlBlob.rawArtifacts.filter(
    ({ processId }) => processId !== removedControlBlob.id,
  );
  assert.throws(
    () => validateCoSealed(missingControlBlob),
    /control Git blob process inventory/u,
  );

  const forgedToolExecution = structuredClone(golden);
  const forgedInspectionArtifact = forgedToolExecution.rawArtifacts.find(
    ({ processId, stream }) =>
      processId === "PROCESS-SEMGREP-CE-INSPECT" && stream === "stdout",
  );
  const forgedInspection = `${JSON.stringify([
    {
      Architecture: "arm64",
      Config: { Labels: {}, User: "root" },
      Os: "linux",
      RepoDigests: [],
    },
  ])}\n`;
  Object.assign(forgedInspectionArtifact, {
    rawSha256: sha256Hex(forgedInspection),
    rawSize: Buffer.byteLength(forgedInspection),
    sha256: sha256Hex(forgedInspection),
    size: Buffer.byteLength(forgedInspection),
  });
  assert.throws(
    () => validateCoSealed(forgedToolExecution),
    /trusted execution/u,
  );

  const coSealedControlSource = structuredClone(golden);
  coSealedControlSource.controlSource.head = "9".repeat(40);
  coSealedControlSource.controlSource.tree = "8".repeat(40);
  Object.assign(
    coSealedControlSource.checks.find(
      ({ id }) => id === "R016-CONTROL-SOURCE-SEAL",
    ),
    {
      head: coSealedControlSource.controlSource.head,
      tree: coSealedControlSource.controlSource.tree,
    },
  );
  coSealedControlSource.databaseSeal.sha256 = sha256Hex(
    `${canonicalJson({
      schemaVersion: 1,
      gateId: "R-016",
      runId: coSealedControlSource.runId,
      source: coSealedControlSource.source,
      controlSource: coSealedControlSource.controlSource,
      databases: coSealedControlSource.advisoryDatabases,
    })}\n`,
  );
  assert.throws(
    () => validateCoSealed(coSealedControlSource),
    /same-root control source|trusted control source/u,
  );

  const coSealedDatabaseIdentity = structuredClone(golden);
  coSealedDatabaseIdentity.advisoryDatabases[0].identity.etag = '"attacker"';
  coSealedDatabaseIdentity.advisoryDatabases[0].headers.etag = '"attacker"';
  coSealedDatabaseIdentity.advisoryDatabases[0].identitySha256 = sha256Hex(
    canonicalJson(coSealedDatabaseIdentity.advisoryDatabases[0].identity),
  );
  coSealedDatabaseIdentity.databaseSeal.sha256 = sha256Hex(
    `${canonicalJson({
      schemaVersion: 1,
      gateId: "R-016",
      runId: coSealedDatabaseIdentity.runId,
      source: coSealedDatabaseIdentity.source,
      controlSource: coSealedDatabaseIdentity.controlSource,
      databases: coSealedDatabaseIdentity.advisoryDatabases,
    })}\n`,
  );
  assert.throws(
    () => validateCoSealed(coSealedDatabaseIdentity),
    /trusted identity seal/u,
  );

  const unredactedRawSplit = structuredClone(golden);
  const rawSplitArtifact = unredactedRawSplit.rawArtifacts.find(
    ({ processId, stream }) =>
      processId === "PROCESS-DOCKER-VERSION" && stream === "stdout",
  );
  rawSplitArtifact.rawSha256 = "f".repeat(64);
  rawSplitArtifact.rawSize += 1;
  assert.throws(
    () => validateCoSealed(unredactedRawSplit),
    /unredacted identities differ/u,
  );

  const forgedDockerEnvironment = structuredClone(golden);
  forgedDockerEnvironment.environment.docker.clientVersion = "99.0.0";
  forgedDockerEnvironment.environment.docker.serverVersion = "99.0.0";
  Object.assign(
    forgedDockerEnvironment.checks.find(
      ({ id }) => id === "R016-EXECUTION-ENVIRONMENT",
    ).docker,
    forgedDockerEnvironment.environment.docker,
  );
  assert.throws(
    () => validateCoSealed(forgedDockerEnvironment),
    /Docker environment/u,
  );

  const forgedCleanupAfter = structuredClone(golden);
  const cleanupAfter = forgedCleanupAfter.rawArtifacts.find(
    ({ processId, stream }) =>
      processId === "PROCESS-OSV-VULNERABILITY-CLEANUP-AFTER" &&
      stream === "stdout",
  );
  const lingeringContainer = `${"c".repeat(12)}\n`;
  Object.assign(cleanupAfter, {
    rawSha256: sha256Hex(lingeringContainer),
    rawSize: Buffer.byteLength(lingeringContainer),
    sha256: sha256Hex(lingeringContainer),
    size: Buffer.byteLength(lingeringContainer),
  });
  assert.throws(
    () => validateCoSealed(forgedCleanupAfter),
    /cleanup-after raw output identity/u,
  );

  const forgedIndexArtifact = structuredClone(golden);
  const indexArtifact = forgedIndexArtifact.rawArtifacts.find(
    ({ processId, stream }) =>
      processId === "PROCESS-GIT-INDEX-FINAL" && stream === "stdout",
  );
  const forgedIndex = `100644 ${"0".repeat(40)} 0\tattacker.txt\0`;
  Object.assign(indexArtifact, {
    rawSha256: sha256Hex(forgedIndex),
    rawSize: Buffer.byteLength(forgedIndex),
    sha256: sha256Hex(forgedIndex),
    size: Buffer.byteLength(forgedIndex),
  });
  assert.throws(
    () => validateCoSealed(forgedIndexArtifact),
    /PROCESS-GIT-INDEX-FINAL stdout identity/u,
  );

  const passWithFailure = structuredClone(golden);
  passWithFailure.failure = {
    causes: [],
    code: 20,
    message: "must not exist on PASS",
    stage: "fixture",
  };
  assert.throws(() => validateCoSealed(passWithFailure), /failure|schema/u);

  const failWithoutFailure = structuredClone(golden);
  failWithoutFailure.status = "FAIL";
  failWithoutFailure.exitCode = 20;
  delete failWithoutFailure.failure;
  assert.throws(
    () => validateEvidenceDocument(failWithoutFailure, evidenceSchema),
    /failure|schema/u,
  );
  const poisonedGitCommand = structuredClone(golden);
  const poisonedHead = poisonedGitCommand.checks.find(
    ({ id }) => id === "PROCESS-GIT-HEAD",
  );
  poisonedHead.arguments = ["-C", "/attacker/repository", "status"];
  poisonedHead.argumentCount = poisonedHead.arguments.length;
  assert.throws(() => validate(poisonedGitCommand), /trusted process seal/u);
  const detachedSourceInventory = structuredClone(golden);
  const detachedSource = detachedSourceInventory.inputs.semgrepSources.files[0];
  detachedSource.sha256 = "c".repeat(64);
  detachedSource.size += 1;
  detachedSourceInventory.inputs.semgrepSources.inventorySha256 = sha256Hex(
    canonicalJson(detachedSourceInventory.inputs.semgrepSources.files),
  );
  assert.throws(() => validate(detachedSourceInventory), /trusted seal/u);
  const bogusEnvironment = structuredClone(golden);
  bogusEnvironment.environment.runtime.node = "v99.0.0";
  bogusEnvironment.environment.docker.clientVersion = "attacker";
  bogusEnvironment.environment.docker.serverVersion = "attacker";
  assert.throws(() => validate(bogusEnvironment), /trusted seal/u);
  const forgedTerminal = structuredClone(golden);
  const forgedSast = forgedTerminal.checks.find(({ id }) => id === "R016-SAST");
  forgedSast.engine = "attacker";
  forgedSast.exactSourceParity = { pathCount: 0 };
  assert.throws(() => validate(forgedTerminal), /trusted terminal seal/u);
  const forgedTool = structuredClone(golden);
  forgedTool.tools["semgrep-ce"].runtimeUser = "root";
  assert.throws(() => validate(forgedTool), /trusted seal|non-root/u);
  const forgedArchive = structuredClone(golden);
  forgedArchive.databaseArchiveValidation.archives[0].entry_count = 999;
  forgedArchive.databaseArchiveValidation.archives[0].manifest_sha256 =
    "0".repeat(64);
  assert.throws(() => validate(forgedArchive), /trusted seal/u);
  const weakenedOsvCommand = structuredClone(golden);
  const weakenedOsv = weakenedOsvCommand.checks.find(
    ({ id }) => id === "PROCESS-OSV-VULNERABILITY",
  );
  weakenedOsv.arguments.push("--attacker-controlled");
  weakenedOsv.argumentCount = weakenedOsv.arguments.length;
  assert.throws(() => validate(weakenedOsvCommand), /trusted process seal/u);
  const reboundSource = structuredClone(golden);
  reboundSource.source.head = "4".repeat(40);
  reboundSource.databaseSeal.sha256 = sha256Hex(
    `${canonicalJson({
      schemaVersion: 1,
      gateId: "R-016",
      runId: reboundSource.runId,
      source: reboundSource.source,
      databases: reboundSource.advisoryDatabases,
    })}\n`,
  );
  assert.throws(() => validate(reboundSource), /trusted seal/u);
  const missingEnvironment = structuredClone(golden);
  delete missingEnvironment.environment.docker;
  assert.throws(
    () => validate(missingEnvironment),
    /environment|docker\.clientVersion/u,
  );
  const hiddenArguments = structuredClone(golden);
  delete hiddenArguments.checks[0].arguments;
  assert.throws(
    () => validate(hiddenArguments),
    /command contract|schema oneOf/u,
  );
  const inconsistentStatus = structuredClone(golden);
  inconsistentStatus.exitCode = 20;
  assert.throws(
    () => validate(inconsistentStatus),
    /PASS evidence must use exit code 0|exitCode violates schema const/u,
  );

  const missingTerminal = structuredClone(golden);
  missingTerminal.checks = missingTerminal.checks.filter(
    ({ id }) => id !== "R016-SAST",
  );
  const missingTerminalContext = {
    ...validationContext,
    terminalSeals: new Map(validationContext.terminalSeals),
  };
  missingTerminalContext.terminalSeals.delete("R016-SAST");
  assert.throws(
    () =>
      validateEvidenceDocument(
        missingTerminal,
        evidenceSchema,
        missingTerminalContext,
      ),
    /missing terminal check R016-SAST/u,
  );
  const missingProcess = structuredClone(golden);
  missingProcess.checks = missingProcess.checks.filter(
    ({ id }) => id !== "PROCESS-OSV-VULNERABILITY",
  );
  missingProcess.rawArtifacts = missingProcess.rawArtifacts.filter(
    ({ processId }) => processId !== "PROCESS-OSV-VULNERABILITY",
  );
  const missingProcessContext = {
    ...validationContext,
    processSeals: new Map(validationContext.processSeals),
    rawArtifactSeals: new Map(validationContext.rawArtifactSeals),
  };
  missingProcessContext.processSeals.delete("PROCESS-OSV-VULNERABILITY");
  for (const [
    artifactPath,
    artifact,
  ] of missingProcessContext.rawArtifactSeals) {
    if (artifact.processId === "PROCESS-OSV-VULNERABILITY") {
      missingProcessContext.rawArtifactSeals.delete(artifactPath);
    }
  }
  assert.throws(
    () =>
      validateEvidenceDocument(
        missingProcess,
        evidenceSchema,
        missingProcessContext,
      ),
    /missing process check PROCESS-OSV-VULNERABILITY/u,
  );
  const mismatchedRawExit = structuredClone(golden);
  mismatchedRawExit.checks.find(
    ({ id }) => id === "R016-VULNERABILITY",
  ).rawExit = 1;
  const mismatchedRawExitContext = {
    ...validationContext,
    terminalSeals: new Map(validationContext.terminalSeals),
  };
  mismatchedRawExitContext.terminalSeals.set(
    "R016-VULNERABILITY",
    structuredClone(
      mismatchedRawExit.checks.find(({ id }) => id === "R016-VULNERABILITY"),
    ),
  );
  assert.throws(
    () =>
      validateEvidenceDocument(
        mismatchedRawExit,
        evidenceSchema,
        mismatchedRawExitContext,
      ),
    /raw exit does not match/u,
  );
  const extraTerminal = structuredClone(golden);
  extraTerminal.checks.push({ id: "R016-UNDECLARED", status: "PASS" });
  const extraTerminalContext = {
    ...validationContext,
    terminalSeals: new Map(validationContext.terminalSeals),
  };
  extraTerminalContext.terminalSeals.set("R016-UNDECLARED", {
    id: "R016-UNDECLARED",
    status: "PASS",
  });
  assert.throws(
    () =>
      validateEvidenceDocument(
        extraTerminal,
        evidenceSchema,
        extraTerminalContext,
      ),
    /unsupported check R016-UNDECLARED/u,
  );
  const duplicateDatabase = structuredClone(golden);
  duplicateDatabase.advisoryDatabases[1] = structuredClone(
    duplicateDatabase.advisoryDatabases[0],
  );
  assert.throws(
    () => validate(duplicateDatabase),
    /database ecosystems are invalid|trusted identity seal/u,
  );
  const missingTool = structuredClone(golden);
  delete missingTool.tools["semgrep-ce"];
  assert.throws(
    () =>
      validateEvidenceDocument(missingTool, evidenceSchema, {
        ...validationContext,
        toolsSeal: structuredClone(missingTool.tools),
      }),
    /tools does not match the exact required keys|tools violates schema minProperties/u,
  );
  const noRawArtifacts = structuredClone(golden);
  noRawArtifacts.rawArtifacts = [];
  assert.throws(
    () =>
      validateEvidenceDocument(noRawArtifacts, evidenceSchema, {
        ...validationContext,
        rawArtifactSeals: new Map(),
      }),
    /artifact linkage|raw artifacts|rawArtifacts violates schema minItems/u,
  );
  const orphanArtifact = structuredClone(golden);
  orphanArtifact.rawArtifacts.push({
    path: "raw/orphan.log",
    processId: "PROCESS-DOCKER-VERSION",
    rawSha256: "c".repeat(64),
    rawSize: 0,
    redacted: true,
    sha256: "c".repeat(64),
    size: 0,
    stream: "stderr",
  });
  const orphanArtifactSeals = new Map(validationContext.rawArtifactSeals);
  orphanArtifactSeals.set(
    "raw/orphan.log",
    structuredClone(orphanArtifact.rawArtifacts.at(-1)),
  );
  assert.throws(
    () =>
      validateEvidenceDocument(orphanArtifact, evidenceSchema, {
        ...validationContext,
        rawArtifactSeals: orphanArtifactSeals,
      }),
    /unlinked raw artifacts/u,
  );
  const schemaMutation = structuredClone(evidenceSchema);
  schemaMutation.properties.runId.const = "schema-required-run";
  assert.throws(() => validate(golden, schemaMutation), /schema const/u);

  const semgrepFindingAsPass = structuredClone(golden);
  semgrepFindingAsPass.checks.find(
    ({ id }) => id === "PROCESS-SEMGREP-REPOSITORY",
  ).rawExit = 1;
  semgrepFindingAsPass.checks.find(({ id }) => id === "R016-SAST").rawExit = 1;
  const semgrepFindingContext = {
    ...validationContext,
    processSeals: new Map(validationContext.processSeals),
    terminalSeals: new Map(validationContext.terminalSeals),
  };
  semgrepFindingContext.processSeals.set(
    "PROCESS-SEMGREP-REPOSITORY",
    structuredClone(
      semgrepFindingAsPass.checks.find(
        ({ id }) => id === "PROCESS-SEMGREP-REPOSITORY",
      ),
    ),
  );
  semgrepFindingContext.terminalSeals.set(
    "R016-SAST",
    structuredClone(
      semgrepFindingAsPass.checks.find(({ id }) => id === "R016-SAST"),
    ),
  );
  assert.throws(
    () =>
      validateEvidenceDocument(
        semgrepFindingAsPass,
        evidenceSchema,
        semgrepFindingContext,
      ),
    /SEMGREP-REPOSITORY raw exit is invalid/u,
  );

  const substitutedTool = structuredClone(golden);
  const substitutedDigest = `sha256:${"c".repeat(64)}`;
  substitutedTool.tools["semgrep-ce"].image =
    `attacker.invalid/semgrep@${substitutedDigest}`;
  substitutedTool.tools["semgrep-ce"].indexDigest = substitutedDigest;
  assert.throws(
    () =>
      validateEvidenceDocument(substitutedTool, evidenceSchema, {
        ...validationContext,
        toolsSeal: structuredClone(substitutedTool.tools),
      }),
    /differs from the scanner lock/u,
  );

  const substitutedProcess = structuredClone(golden);
  const licenseProcess = substitutedProcess.checks.find(
    ({ id }) => id === "PROCESS-OSV-LICENSE",
  );
  licenseProcess.arguments = [
    "run",
    `attacker.invalid/not-osv@sha256:${"d".repeat(64)}`,
  ];
  licenseProcess.argumentCount = licenseProcess.arguments.length;
  const substitutedProcessSeals = new Map(validationContext.processSeals);
  substitutedProcessSeals.set(
    licenseProcess.id,
    structuredClone(licenseProcess),
  );
  assert.throws(
    () =>
      validateEvidenceDocument(substitutedProcess, evidenceSchema, {
        ...validationContext,
        processSeals: substitutedProcessSeals,
      }),
    /exact locked image|Docker security prefix/u,
  );

  const alteredRawArtifact = structuredClone(golden);
  alteredRawArtifact.rawArtifacts[0].sha256 = "e".repeat(64);
  alteredRawArtifact.rawArtifacts[0].size += 1;
  assert.throws(
    () => validate(alteredRawArtifact),
    /differs from its trusted seal|unredacted identities differ/u,
  );

  const inflatedSourceInventory = structuredClone(golden);
  inflatedSourceInventory.inputs.semgrepSources.files = Array.from(
    { length: 100 },
    (_, index) => ({
      gitObjectId: index.toString(16).padStart(40, "0"),
      languageGroup: "javascript-typescript",
      path: `scripts/inflated-${index}.mjs`,
      sha256: index.toString(16).padStart(64, "0"),
      size: 1,
    }),
  );
  inflatedSourceInventory.inputs.semgrepSources.fileCount = 100;
  inflatedSourceInventory.inputs.semgrepSources.groupCounts = {
    "javascript-typescript": 100,
  };
  inflatedSourceInventory.inputs.semgrepSources.inventorySha256 = sha256Hex(
    canonicalJson(inflatedSourceInventory.inputs.semgrepSources.files),
  );
  assert.throws(
    () =>
      validateEvidenceDocument(inflatedSourceInventory, evidenceSchema, {
        ...validationContext,
        inputsSeal: structuredClone(inflatedSourceInventory.inputs),
      }),
    /missing tracked source process|groupCounts violates schema minProperties/u,
  );

  const detachedDatabaseSeal = structuredClone(golden);
  detachedDatabaseSeal.advisoryDatabases[0].identity.sha256 = "f".repeat(64);
  detachedDatabaseSeal.advisoryDatabases[0].identitySha256 = sha256Hex(
    canonicalJson(detachedDatabaseSeal.advisoryDatabases[0].identity),
  );
  assert.throws(
    () => validate(detachedDatabaseSeal),
    /does not bind exact database identities|trusted identity seal/u,
  );
});
