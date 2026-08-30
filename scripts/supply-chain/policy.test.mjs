import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_REQUIRED_LANGUAGES,
  EXIT_CODES,
  evaluateOsvLicenses,
  evaluateOsvVulnerabilities,
  evaluateSemgrep,
  md5Hex,
  normalizeControlFailure,
  parseStrictJson,
  sha256Hex,
  validateDatabaseIdentity,
} from "./policy.mjs";

const npmSource = "pnpm-lock.yaml";

test("strict JSON parsing rejects malformed and duplicate-key documents", () => {
  assert.throws(
    () => parseStrictJson('{"results":[]} trailing'),
    /trailing data/,
  );
  assert.throws(
    () => parseStrictJson('{"results":[],"results":[]}'),
    /duplicate object key/,
  );

  const result = evaluateOsvVulnerabilities({
    document: '{"results":',
    expectedBySource: { [npmSource]: [] },
    policy: { blockAtOrAbove: 7 },
    rawExit: 0,
  });
  assert.equal(result.exitCode, EXIT_CODES.CONTRACT);
});

test("OSV vulnerability evaluation blocks high development and unknown scope", () => {
  const packages = [
    vulnerablePackage("dev-only", "development", "GHSA-dev", 9.1),
    vulnerablePackage("unknown-only", undefined, "GHSA-unknown", "7.0"),
  ];
  const result = evaluateOsvVulnerabilities({
    document: osvDocument(packages),
    expectedBySource: {
      [npmSource]: packages.map(expectedPackage),
    },
    policy: { blockAtOrAbove: 7 },
    rawExit: 1,
  });

  assert.equal(result.exitCode, EXIT_CODES.FINDING);
  assert.deepEqual(result.findings.map(({ scope }) => scope).sort(), [
    "development",
    "unknown",
  ]);
  assert.deepEqual(
    result.findings.map(({ maximumSeverity }) => maximumSeverity).sort(),
    [7, 9.1],
  );
});

test("OSV vulnerability evaluation permits medium findings without filtering inventory", () => {
  const packages = [vulnerablePackage("medium", "unknown", "GHSA-medium", 6.9)];
  const result = evaluateOsvVulnerabilities({
    document: osvDocument(packages),
    expectedBySource: { [npmSource]: packages.map(expectedPackage) },
    policy: { blockAtOrAbove: 7 },
    rawExit: 1,
  });

  assert.equal(result.exitCode, EXIT_CODES.PASS);
  assert.equal(result.evidence.packageCount, 1);
});

test("OSV vulnerability evaluation rejects noncanonical severity values", async (t) => {
  const cases = [
    ["empty string", ""],
    ["whitespace string", " "],
    ["surrounding whitespace", " 7"],
    ["hexadecimal string", "0x7"],
    ["exponent string", "7e0"],
    ["NaN string", "NaN"],
    ["Infinity string", "Infinity"],
    ["NaN number", Number.NaN],
    ["Infinity number", Number.POSITIVE_INFINITY],
  ];

  for (const [name, severity] of cases) {
    await t.test(name, () => {
      const packages = [
        vulnerablePackage("invalid-score", "unknown", "GHSA-score", severity),
      ];
      const result = evaluateOsvVulnerabilities({
        document: osvDocument(packages),
        expectedBySource: { [npmSource]: packages.map(expectedPackage) },
        policy: { blockAtOrAbove: 7 },
        rawExit: 1,
      });

      assert.equal(result.exitCode, EXIT_CODES.CONTRACT);
      assert.match(result.errors[0], /CVSS severity/);
    });
  }
});

test("OSV vulnerability evaluation accepts canonical decimal severity values", () => {
  const accepted = [0, 7, 10, "0", "0.0", "7", "7.0", "10", "10.0"];
  for (const [index, severity] of accepted.entries()) {
    const item = vulnerablePackage(
      `canonical-score-${index}`,
      "unknown",
      `GHSA-score-${index}`,
      severity,
    );
    const result = evaluateOsvVulnerabilities({
      document: osvDocument([item]),
      expectedBySource: { [npmSource]: [expectedPackage(item)] },
      policy: { blockAtOrAbove: 7 },
      rawExit: 1,
    });
    assert.notEqual(result.exitCode, EXIT_CODES.CONTRACT);
  }
});

test("OSV vulnerability groups cover each primary ID exactly once", async (t) => {
  const groupedAliases = vulnerablePackage(
    "grouped-aliases",
    "unknown",
    "GHSA-primary",
    6.9,
  );
  groupedAliases.vulnerabilities[0].aliases = ["CVE-2026-alias"];
  groupedAliases.groups[0].aliases = ["CVE-2026-alias", "GHSA-primary"];
  const accepted = evaluateOsvVulnerabilities({
    document: osvDocument([groupedAliases]),
    expectedBySource: { [npmSource]: [expectedPackage(groupedAliases)] },
    policy: { blockAtOrAbove: 7 },
    rawExit: 1,
  });
  assert.equal(accepted.exitCode, EXIT_CODES.PASS);

  const cases = [
    [
      "unmapped vulnerability ID",
      () => ({
        ...cleanPackage("partial", "unknown"),
        groups: [{ ids: ["GHSA-covered"], max_severity: 6.9 }],
        vulnerabilities: [{ id: "GHSA-covered" }, { id: "GHSA-unmapped" }],
      }),
      /no mapped severity group.*GHSA-unmapped/,
    ],
    [
      "missing severity",
      () => ({
        ...cleanPackage("missing-severity", "unknown"),
        groups: [{ ids: ["GHSA-no-score"] }],
        vulnerabilities: [{ id: "GHSA-no-score" }],
      }),
      /max_severity must be a numeric CVSS severity/,
    ],
    [
      "duplicate group mapping",
      () => ({
        ...cleanPackage("duplicate-mapping", "unknown"),
        groups: [
          { ids: ["GHSA-duplicate"], max_severity: 5 },
          { ids: ["GHSA-duplicate"], max_severity: 5 },
        ],
        vulnerabilities: [{ id: "GHSA-duplicate" }],
      }),
      /mapped more than once across groups\[\]\.ids/,
    ],
    [
      "alias is not a primary vulnerability ID",
      () => ({
        ...cleanPackage("extra-alias", "unknown"),
        groups: [
          {
            ids: ["GHSA-primary", "CVE-2026-alias"],
            max_severity: 5,
          },
        ],
        vulnerabilities: [{ aliases: ["CVE-2026-alias"], id: "GHSA-primary" }],
      }),
      /references unknown vulnerability ID.*CVE-2026-alias/,
    ],
    [
      "duplicate primary vulnerability ID",
      () => ({
        ...cleanPackage("duplicate-primary", "unknown"),
        groups: [{ ids: ["GHSA-duplicate"], max_severity: 5 }],
        vulnerabilities: [{ id: "GHSA-duplicate" }, { id: "GHSA-duplicate" }],
      }),
      /contains duplicate ID.*GHSA-duplicate/,
    ],
    [
      "noncanonical group ID",
      () => ({
        ...cleanPackage("whitespace-id", "unknown"),
        groups: [{ ids: [" GHSA-space"], max_severity: 5 }],
        vulnerabilities: [{ id: "GHSA-space" }],
      }),
      /has surrounding whitespace/,
    ],
  ];

  for (const [name, packageFactory, expectedError] of cases) {
    await t.test(name, () => {
      const item = packageFactory();
      const result = evaluateOsvVulnerabilities({
        document: osvDocument([item]),
        expectedBySource: { [npmSource]: [expectedPackage(item)] },
        policy: { blockAtOrAbove: 7 },
        rawExit: 1,
      });
      assert.equal(result.exitCode, EXIT_CODES.CONTRACT);
      assert.match(result.errors[0], expectedError);
    });
  }
});

test("OSV vulnerability raw exit matches raw vulnerability presence", () => {
  const emptyAtExitOne = evaluateOsvVulnerabilities({
    document: osvDocument([cleanPackage("clean", "unknown")]),
    expectedBySource: {
      [npmSource]: [expectedPackage(cleanPackage("clean", "unknown"))],
    },
    policy: { blockAtOrAbove: 7 },
    rawExit: 1,
  });
  assert.equal(emptyAtExitOne.exitCode, EXIT_CODES.CONTRACT);
  assert.match(emptyAtExitOne.errors[0], /exit 1.*empty raw findings/);

  const vulnerable = vulnerablePackage(
    "unexpected-finding",
    "unknown",
    "GHSA-raw",
    6.9,
  );
  const findingAtExitZero = evaluateOsvVulnerabilities({
    document: osvDocument([vulnerable]),
    expectedBySource: { [npmSource]: [expectedPackage(vulnerable)] },
    policy: { blockAtOrAbove: 7 },
    rawExit: 0,
  });
  assert.equal(findingAtExitZero.exitCode, EXIT_CODES.CONTRACT);
  assert.match(findingAtExitZero.errors[0], /exit 0.*raw findings/);
});

test("OSV inventory parity is an exact multiset and preserves zero-package sources", () => {
  const duplicate = cleanPackage("duplicate", "unknown");
  const document = osvDocument(
    [duplicate, duplicate],
    [{ packages: [], source: { path: "go.mod" } }],
  );
  const result = evaluateOsvVulnerabilities({
    document,
    expectedBySource: {
      "go.mod": [],
      [npmSource]: [expectedPackage(duplicate)],
    },
    policy: { blockAtOrAbove: 7 },
    rawExit: 0,
  });

  assert.equal(result.exitCode, EXIT_CODES.CONTRACT);
  assert.match(result.errors[0], /count 2 differs from expected 1/);
});

test("OSV split-source parity preserves scoped workspace packages", () => {
  const manager = cleanPackage("pnpm", "unknown");
  const workspace = cleanPackage("@hedefora/workspace", "unknown");
  const complete = evaluateOsvVulnerabilities({
    document: osvDocument(
      [manager],
      [
        {
          packages: [workspace],
          source: { path: "split/workspace-lock.yaml" },
        },
      ],
    ),
    expectedBySource: {
      [npmSource]: [expectedPackage(manager)],
      "split/workspace-lock.yaml": [expectedPackage(workspace)],
    },
    policy: { blockAtOrAbove: 7 },
    rawExit: 0,
  });
  assert.equal(complete.exitCode, EXIT_CODES.PASS);

  const silentlyOmitted = evaluateOsvVulnerabilities({
    document: osvDocument([manager]),
    expectedBySource: {
      [npmSource]: [expectedPackage(manager)],
      "split/workspace-lock.yaml": [expectedPackage(workspace)],
    },
    policy: { blockAtOrAbove: 7 },
    rawExit: 0,
  });
  assert.equal(silentlyOmitted.exitCode, EXIT_CODES.CONTRACT);
  assert.match(
    silentlyOmitted.errors[0],
    /expected scanned source is absent: split\/workspace-lock.yaml/,
  );
});

test("OSV license evaluation blocks disallowed and unknown licenses", () => {
  const packages = [
    licensedPackage("copyleft", "development", ["GPL-3.0-only"]),
    licensedPackage("unknown", undefined, ["UNKNOWN"]),
  ];
  const result = evaluateOsvLicenses({
    document: osvDocument(packages),
    expectedBySource: { [npmSource]: packages.map(expectedPackage) },
    policy: { allowedSpdx: ["MIT", "Apache-2.0"] },
    rawExit: 1,
  });

  assert.equal(result.exitCode, EXIT_CODES.FINDING);
  assert.deepEqual(
    result.findings.map(({ license, reason }) => [license, reason]),
    [
      ["GPL-3.0-only", "license is not explicitly allowed"],
      ["UNKNOWN", "license is unknown"],
    ],
  );
});

test("OSV license evaluation rejects missing arrays and blocks empty arrays", () => {
  const missing = cleanPackage("missing", "unknown");
  const missingResult = evaluateOsvLicenses({
    document: osvDocument([missing]),
    expectedBySource: { [npmSource]: [expectedPackage(missing)] },
    policy: { allowedSpdx: ["MIT"] },
    rawExit: 0,
  });
  assert.equal(missingResult.exitCode, EXIT_CODES.CONTRACT);

  const empty = licensedPackage("empty", "unknown", []);
  const emptyResult = evaluateOsvLicenses({
    document: osvDocument([empty]),
    expectedBySource: { [npmSource]: [expectedPackage(empty)] },
    policy: { allowedSpdx: ["MIT"] },
    rawExit: 1,
  });
  assert.equal(emptyResult.exitCode, EXIT_CODES.FINDING);
  assert.equal(emptyResult.findings[0].license, "UNKNOWN");
});

test("OSV license raw exit matches vulnerabilities or policy findings", () => {
  const allowed = licensedPackage("allowed", "unknown", ["MIT"]);
  const emptyAtExitOne = evaluateOsvLicenses({
    document: osvDocument([allowed]),
    expectedBySource: { [npmSource]: [expectedPackage(allowed)] },
    policy: { allowedSpdx: ["MIT"] },
    rawExit: 1,
  });
  assert.equal(emptyAtExitOne.exitCode, EXIT_CODES.CONTRACT);
  assert.match(emptyAtExitOne.errors[0], /exit 1.*empty raw findings/);

  const disallowed = licensedPackage("disallowed", "unknown", ["GPL-3.0-only"]);
  const licenseFindingAtExitZero = evaluateOsvLicenses({
    document: osvDocument([disallowed]),
    expectedBySource: { [npmSource]: [expectedPackage(disallowed)] },
    policy: { allowedSpdx: ["MIT"] },
    rawExit: 0,
  });
  assert.equal(licenseFindingAtExitZero.exitCode, EXIT_CODES.CONTRACT);
  assert.match(licenseFindingAtExitZero.errors[0], /exit 0.*raw findings/);

  const vulnerable = vulnerablePackage(
    "vulnerable",
    "unknown",
    "GHSA-license-raw",
    5,
  );
  vulnerable.licenses = ["MIT"];
  const vulnerabilityAtExitZero = evaluateOsvLicenses({
    document: osvDocument([vulnerable]),
    expectedBySource: { [npmSource]: [expectedPackage(vulnerable)] },
    policy: { allowedSpdx: ["MIT"] },
    rawExit: 0,
  });
  assert.equal(vulnerabilityAtExitZero.exitCode, EXIT_CODES.CONTRACT);
  assert.match(vulnerabilityAtExitZero.errors[0], /exit 0.*raw findings/);

  const vulnerabilityAtExitOne = evaluateOsvLicenses({
    document: osvDocument([vulnerable]),
    expectedBySource: { [npmSource]: [expectedPackage(vulnerable)] },
    policy: { allowedSpdx: ["MIT"] },
    rawExit: 1,
  });
  assert.equal(vulnerabilityAtExitOne.exitCode, EXIT_CODES.PASS);
});

test("database identity accepts a fresh exact header match", () => {
  const now = new Date("2026-08-28T12:00:00.000Z");
  const metadata = validDatabaseMetadata(now);
  const result = validateDatabaseIdentity(
    metadata,
    {
      expectedGeneration: "42",
      expectedSha256: metadata.sha256,
      requireSha256Evidence: true,
      requiredEcosystem: "npm",
    },
    now,
  );

  assert.equal(result.exitCode, EXIT_CODES.PASS);
  assert.equal(result.evidence.identity.generation, "42");
  assert.equal(
    result.evidence.headers["x-goog-hash"],
    metadata.headers["x-goog-hash"],
  );
  assert.match(result.evidence.identitySha256, /^[0-9a-f]{64}$/);
});

test("database identity fails closed for stale, missing, and mismatched metadata", async (t) => {
  const now = new Date("2026-08-28T12:00:00.000Z");
  const cases = [
    [
      "stale",
      (metadata) => {
        metadata.headers["last-modified"] = new Date(
          now.getTime() - 48 * 60 * 60 * 1000 - 1,
        ).toUTCString();
      },
      /stale/,
    ],
    [
      "missing generation",
      (metadata) => {
        delete metadata.headers["x-goog-generation"];
      },
      /generation header is missing/,
    ],
    [
      "MD5 hash mismatch",
      (metadata) => {
        metadata.headers["x-goog-hash"] =
          "crc32c=AAAAAA==,md5=/////////////////////w==";
      },
      /MD5 does not match/,
    ],
  ];

  for (const [name, mutate, expectedError] of cases) {
    await t.test(name, () => {
      const metadata = validDatabaseMetadata(now);
      mutate(metadata);
      const result = validateDatabaseIdentity(
        metadata,
        { requireSha256Evidence: true, requiredEcosystem: "npm" },
        now,
      );
      assert.equal(result.exitCode, EXIT_CODES.CONTRACT);
      assert.match(result.errors[0], expectedError);
      assert.equal(result.evidence.headers?.etag, metadata.headers.etag);
    });
  }
});

test("database identity enforces future skew and nonempty content", () => {
  const now = new Date("2026-08-28T12:00:00.000Z");
  const future = validDatabaseMetadata(now);
  future.headers["last-modified"] = new Date(
    now.getTime() + 10 * 60 * 1000 + 1,
  ).toISOString();
  assert.equal(
    validateDatabaseIdentity(
      future,
      { requireSha256Evidence: true, requiredEcosystem: "npm" },
      now,
    ).exitCode,
    EXIT_CODES.CONTRACT,
  );

  const empty = validDatabaseMetadata(now);
  empty.contentLength = 0;
  empty.headers["content-length"] = "0";
  assert.equal(
    validateDatabaseIdentity(
      empty,
      { requireSha256Evidence: true, requiredEcosystem: "npm" },
      now,
    ).exitCode,
    EXIT_CODES.CONTRACT,
  );
});

test("database identity requires local SHA-256 evidence by explicit policy", () => {
  const now = new Date("2026-08-28T12:00:00.000Z");
  const metadata = validDatabaseMetadata(now);
  assert.equal(
    validateDatabaseIdentity(metadata, { requiredEcosystem: "npm" }, now)
      .exitCode,
    EXIT_CODES.CONTRACT,
  );

  delete metadata.sha256;
  const missing = validateDatabaseIdentity(
    metadata,
    { requireSha256Evidence: true, requiredEcosystem: "npm" },
    now,
  );
  assert.equal(missing.exitCode, EXIT_CODES.CONTRACT);
  assert.match(missing.errors[0], /sha256 must be a nonempty string/);
});

test("Semgrep findings block only with schema-consistent exit 1", () => {
  const result = evaluateSemgrep({
    document: semgrepDocument([
      {
        check_id: "javascript.lang.security.detect-eval",
        path: "scripts/a.mjs",
      },
    ]),
    rawExit: 1,
    requiredLanguages: DEFAULT_REQUIRED_LANGUAGES,
  });

  assert.equal(result.exitCode, EXIT_CODES.FINDING);
  assert.equal(
    result.findings[0].checkId,
    "javascript.lang.security.detect-eval",
  );

  const inconsistent = evaluateSemgrep({
    document: semgrepDocument([
      {
        check_id: "javascript.lang.security.detect-eval",
        path: "scripts/a.mjs",
      },
    ]),
    rawExit: 0,
    requiredLanguages: DEFAULT_REQUIRED_LANGUAGES,
  });
  assert.equal(inconsistent.exitCode, EXIT_CODES.CONTRACT);
});

test("Semgrep rejects zero language coverage and scanner-reported errors", () => {
  const zeroCoverage = evaluateSemgrep({
    document: JSON.stringify({
      errors: [],
      paths: { scanned: ["README.md"] },
      results: [],
    }),
    rawExit: 0,
    requiredLanguages: DEFAULT_REQUIRED_LANGUAGES,
  });
  assert.equal(zeroCoverage.exitCode, EXIT_CODES.CONTRACT);
  assert.match(zeroCoverage.errors[0], /zero go coverage/);

  const scannerError = evaluateSemgrep({
    document: JSON.stringify({
      errors: [{ message: "parse failure" }],
      paths: { scanned: ["main.go", "app.ts"] },
      results: [],
    }),
    rawExit: 0,
    requiredLanguages: DEFAULT_REQUIRED_LANGUAGES,
  });
  assert.equal(scannerError.exitCode, EXIT_CODES.CONTRACT);
});

test("scanner control and acquisition failures retain normalized exit classes", () => {
  const internal = evaluateSemgrep({
    document: semgrepDocument([]),
    rawExit: 127,
    requiredLanguages: DEFAULT_REQUIRED_LANGUAGES,
  });
  assert.equal(internal.exitCode, EXIT_CODES.INTERNAL);

  const timeout = evaluateOsvVulnerabilities({
    document: osvDocument([]),
    expectedBySource: { [npmSource]: [] },
    policy: {},
    rawExit: { timedOut: true },
  });
  assert.equal(timeout.exitCode, EXIT_CODES.INTERNAL);

  assert.equal(
    normalizeControlFailure({ kind: "network" }).exitCode,
    EXIT_CODES.ACQUISITION,
  );
});

function osvDocument(packages, additionalResults = []) {
  return JSON.stringify({
    results: [
      {
        packages,
        source: { path: npmSource },
      },
      ...additionalResults,
    ],
  });
}

function cleanPackage(name, scope) {
  return {
    package: { ecosystem: "npm", name, version: "1.0.0" },
    ...(scope === undefined ? {} : { scope }),
  };
}

function vulnerablePackage(name, scope, id, maxSeverity) {
  return {
    ...cleanPackage(name, scope),
    groups: [{ ids: [id], max_severity: maxSeverity }],
    vulnerabilities: [{ id }],
  };
}

function licensedPackage(name, scope, licenses) {
  return {
    ...cleanPackage(name, scope),
    licenses,
  };
}

function expectedPackage(item) {
  return {
    ...item.package,
    scope: item.scope ?? item.package.scope ?? "unknown",
  };
}

function validDatabaseMetadata(now) {
  const contents = "fixture advisory database";
  const sha256 = sha256Hex(contents);
  const md5 = md5Hex(contents);
  return {
    contentLength: Buffer.byteLength(contents),
    ecosystem: "npm",
    file: "cache/npm.zip",
    headers: {
      "content-length": String(Buffer.byteLength(contents)),
      etag: '"fixture-etag"',
      "last-modified": new Date(now.getTime() - 60 * 60 * 1000).toUTCString(),
      "x-goog-generation": "42",
      "x-goog-hash": `crc32c=AAAAAA==,md5=${Buffer.from(md5, "hex").toString("base64")}`,
    },
    md5,
    sha256,
  };
}

function semgrepDocument(results) {
  return JSON.stringify({
    errors: [],
    paths: { scanned: ["cmd/main.go", "apps/web/App.tsx"] },
    results,
  });
}
