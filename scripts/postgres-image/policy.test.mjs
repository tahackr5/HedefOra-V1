import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  sha256,
  evaluateApkCoverage,
  evaluateGrypeReport,
  evaluateDatabase,
  evaluateScannerIdentity,
  makePostgresSbom,
  evaluateSourceCoverage,
  evaluateImageAdmission,
  canonicalApkPurl,
  evaluateApkCanary,
} from "./policy.mjs";

const lock = JSON.parse(
  readFileSync(
    new URL(
      "../../security/postgres-image-scanners.lock.json",
      import.meta.url,
    ),
  ),
);
const H = "a".repeat(64);
const runId = "unit-only-never-scanner-evidence";
const now = "2026-09-06T18:00:00Z";
const digest = "sha256:" + H;
const inventory = [
  {
    name: "musl",
    version: "1.2.5-r21",
    architecture: "x86_64",
    license: "MIT",
    origin: "musl",
    purl: "pkg:apk/alpine/musl@1.2.5-r21?arch=x86_64&distro=alpine-3.24.0",
    cpes: ["cpe:2.3:a:musl:musl:1.2.5-r21:*:*:*:*:*:*:*"],
  },
];
function syft() {
  return {
    schema: { version: lock.syft.schemaVersion },
    descriptor: {
      name: "syft",
      version: lock.syft.version,
      configuration: {
        exclude: [],
        "data-generation": { "generate-cpes": true },
      },
    },
    source: { type: "directory", metadata: { path: "/fixture/rootfs" } },
    distro: { id: "alpine", versionID: "3.24.0" },
    artifacts: [
      {
        id: "musl-id",
        type: "apk",
        foundBy: "apk-db-cataloger",
        metadataType: "apk-db-entry",
        name: "musl",
        version: "1.2.5-r21",
        purl: inventory[0].purl,
        cpes: inventory[0].cpes.map((cpe) => ({
          cpe,
          source: "syft-generated",
        })),
        metadata: {
          package: "musl",
          version: "1.2.5-r21",
          architecture: "x86_64",
          originPackage: "musl",
        },
        licenses: [{ value: "MIT", spdxExpression: "MIT" }],
      },
    ],
  };
}
function report() {
  return {
    matches: [],
    source: { type: "sbom-file", target: "/fixture/os.syft.json" },
    distro: { name: "alpine", version: "3.24.0" },
    descriptor: {
      name: "grype",
      version: lock.grype.version,
      db: {
        status: {
          valid: true,
          error: null,
          built: lock.database.built,
          schemaVersion: lock.database.schemaVersion,
          path: "/fixture/vulnerability.db",
        },
        providers: Object.fromEntries(
          ["alpine", "nvd", "eol"].map((name) => [
            name,
            { captured: lock.database.built, input: "xxh64:0123456789abcdef" },
          ]),
        ),
      },
      configuration: {
        "fail-on-severity": "high",
        "match-upstream-kernel-headers": true,
        "only-fixed": false,
        "only-notfixed": false,
        "ignore-wontfix": "",
        ignore: null,
        exclude: null,
        "vex-documents": null,
        "vex-add": [],
        match: { stock: { "using-cpes": true } },
        alerts: { "enable-eol-distro-warnings": true },
        db: {
          "auto-update": false,
          "validate-age": true,
          "max-allowed-built-age": 172800000000000,
          "validate-by-hash-on-start": true,
        },
      },
    },
  };
}
function match(severity = "High", score = 8.1) {
  return {
    vulnerability: {
      id: "CVE-2025-1094",
      severity,
      cvss: [{ metrics: { baseScore: score } }],
      fix: { state: "not-fixed" },
    },
    relatedVulnerabilities: [],
    artifact: {
      id: "postgresql-source",
      name: "postgresql",
      version: "17.2",
      purl: "pkg:generic/postgresql@17.2",
      cpes: ["cpe:2.3:a:postgresql:postgresql:17.2:*:*:*:*:*:*:*"],
    },
  };
}
function db() {
  return {
    runId,
    archiveSha256: lock.database.sha256,
    archiveSize: lock.database.size,
    extractedSha256: lock.database.extractedSha256,
    importRawExit: 0,
    databaseSha256Before: H,
    databaseSha256After: H,
    status: report().descriptor.db.status,
  };
}
function tool(name) {
  const pin = lock[name];
  return {
    runId,
    platform: "windows/amd64",
    archiveSha256: pin.platforms["windows/amd64"].sha256,
    archiveMemberSha256: pin.platforms["windows/amd64"].executableSha256,
    executableSha256Before: pin.platforms["windows/amd64"].executableSha256,
    executableSha256After: pin.platforms["windows/amd64"].executableSha256,
    version: {
      application: name,
      version: pin.version,
      gitCommit: pin.commit,
      platform: "windows/amd64",
    },
  };
}
const sourceExpectation = {
  type: "sbom-file",
  target: "/fixture/os.syft.json",
};
function grypeArgs(r = report(), rawExit = 0) {
  return {
    reportText: JSON.stringify(r),
    rawExit,
    stderr: "",
    expectedSource: sourceExpectation,
    database: db(),
    lock,
  };
}
function codes(result) {
  return result.findings.map((f) => f.code);
}
function fails(result, code) {
  assert.equal(result.status, "FAIL");
  assert.ok(codes(result).includes(code), JSON.stringify(result));
}

test("fixture is synthetic policy evidence only; empty real-schema report evaluates", () => {
  assert.equal(evaluateGrypeReport(grypeArgs()).status, "PASS");
  const r = report();
  r.ignoredMatches = [];
  assert.equal(evaluateGrypeReport(grypeArgs(r)).status, "PASS");
});
test("APK exact multiset includes license and architecture", () => {
  assert.equal(
    evaluateApkCoverage({
      sbomText: JSON.stringify(syft()),
      inventory,
      expectedSource: syft().source,
      expectedDistro: syft().distro,
      lock,
    }).status,
    "PASS",
  );
});
for (const [name, mutate, code] of [
  [
    "missing package",
    (s) => {
      s.artifacts = [];
    },
    "APK_COVERAGE",
  ],
  [
    "extra package",
    (s) => {
      s.artifacts.push({ ...s.artifacts[0], id: "extra", name: "extra" });
    },
    "APK_COVERAGE",
  ],
  [
    "duplicate package",
    (s) => {
      s.artifacts.push(s.artifacts[0]);
    },
    "APK_DUPLICATE",
  ],
  [
    "wrong architecture",
    (s) => {
      s.artifacts[0].metadata.architecture = "aarch64";
    },
    "APK_COVERAGE",
  ],
  [
    "unknown ecosystem",
    (s) => {
      s.artifacts[0].type = "unknown";
    },
    "APK_UNEXPECTED",
  ],
  [
    "license drift",
    (s) => {
      s.artifacts[0].licenses[0].value = "GPL-3.0-only";
    },
    "APK_COVERAGE",
  ],
  [
    "foreign root",
    (s) => {
      s.source.metadata.path = "/foreign";
    },
    "SBOM_SOURCE",
  ],
  [
    "unknown schema",
    (s) => {
      s.schema.version = "99";
    },
    "SBOM_SCHEMA",
  ],
  [
    "exclusion",
    (s) => {
      s.descriptor.configuration.exclude = ["/usr"];
    },
    "SCAN_SUPPRESSION",
  ],
])
  test(name, () => {
    const s = syft();
    mutate(s);
    fails(
      evaluateApkCoverage({
        sbomText: JSON.stringify(s),
        inventory,
        expectedSource: syft().source,
        expectedDistro: syft().distro,
        lock,
      }),
      code,
    );
  });
for (const [name, mutate, code] of [
  [
    "F02 missing CPE set",
    (s) => {
      delete s.artifacts[0].cpes;
    },
    "APK_CPE_COVERAGE",
  ],
  [
    "F02 empty CPE set",
    (s) => {
      s.artifacts[0].cpes = [];
    },
    "APK_CPE_COVERAGE",
  ],
  [
    "F02 replaced CPE",
    (s) => {
      s.artifacts[0].cpes[0].cpe =
        "cpe:2.3:a:foreign:foreign:1.2.5-r21:*:*:*:*:*:*:*";
    },
    "APK_CPE_COVERAGE",
  ],
  [
    "F02 invalid CPE",
    (s) => {
      s.artifacts[0].cpes[0].cpe = "not-a-cpe";
    },
    "APK_CPE_COVERAGE",
  ],
  [
    "F02 duplicate CPE",
    (s) => {
      s.artifacts[0].cpes.push(s.artifacts[0].cpes[0]);
    },
    "APK_CPE_COVERAGE",
  ],
  [
    "F02 origin removed",
    (s) => {
      delete s.artifacts[0].metadata.originPackage;
    },
    "APK_ORIGIN",
  ],
  [
    "F02 origin replaced",
    (s) => {
      s.artifacts[0].metadata.originPackage = "foreign";
    },
    "APK_ORIGIN",
  ],
  [
    "F02 wrong PURL name",
    (s) => {
      s.artifacts[0].purl = s.artifacts[0].purl.replace("/musl@", "/foreign@");
    },
    "APK_PURL",
  ],
  [
    "F02 wrong PURL arch",
    (s) => {
      s.artifacts[0].purl = s.artifacts[0].purl.replace("x86_64", "noarch");
    },
    "APK_PURL",
  ],
  [
    "F02 CPE generation disabled",
    (s) => {
      s.descriptor.configuration["data-generation"]["generate-cpes"] = false;
    },
    "SBOM_CONFIG",
  ],
  [
    "F02 CPE generation missing",
    (s) => {
      delete s.descriptor.configuration["data-generation"];
    },
    "SBOM_CONFIG",
  ],
])
  test(name, () => {
    const s = syft();
    mutate(s);
    fails(
      evaluateApkCoverage({
        sbomText: JSON.stringify(s),
        inventory,
        expectedSource: syft().source,
        expectedDistro: syft().distro,
        lock,
      }),
      code,
    );
  });
test("F02 missing trusted CPE mapping fails even for a complete scanner SBOM", () => {
  const expected = structuredClone(inventory);
  delete expected[0].cpes;
  fails(
    evaluateApkCoverage({
      sbomText: JSON.stringify(syft()),
      inventory: expected,
      expectedSource: syft().source,
      expectedDistro: syft().distro,
      lock,
    }),
    "APK_TRUSTED_MAPPING",
  );
});
test("F02 malformed trusted PURL/CPE mapping cannot authorize malformed scan identity", () => {
  for (const mutate of [
    (p) => {
      p.purl = p.purl.replace("musl@", "foreign@");
    },
    (p) => {
      p.cpes = [];
    },
    (p) => {
      p.cpes = ["cpe:2.3:a:*:*:*:*:*:*:*:*:*:*"];
    },
  ]) {
    const expected = structuredClone(inventory);
    mutate(expected[0]);
    fails(
      evaluateApkCoverage({
        sbomText: JSON.stringify(syft()),
        inventory: expected,
        expectedSource: syft().source,
        expectedDistro: syft().distro,
        lock,
      }),
      "APK_TRUSTED_MAPPING",
    );
  }
});
test("F02 canonical PURL binds escaped package, version, architecture, distro and upstream", () => {
  assert.equal(
    canonicalApkPurl(
      {
        name: "libstdc++",
        version: "15.2.0-r5",
        architecture: "x86_64",
        origin: "gcc",
      },
      "3.24.1",
    ),
    "pkg:apk/alpine/libstdc%2B%2B@15.2.0-r5?arch=x86_64&distro=alpine-3.24.1&upstream=gcc",
  );
});
test("F02 escaped plus CPE remains valid under the bounded APK profile", () => {
  const p = {
    name: "g++",
    version: "15.2.0-r5",
    architecture: "x86_64",
    origin: "gcc",
    license: "GPL-2.0-or-later",
    cpes: [String.raw`cpe:2.3:a:g\+\+:g\+\+:15.2.0-r5:*:*:*:*:*:*:*`],
  };
  p.purl = canonicalApkPurl(p, "3.24.0");
  const s = syft(),
    a = s.artifacts[0];
  Object.assign(a, {
    name: p.name,
    version: p.version,
    purl: p.purl,
    cpes: p.cpes.map((cpe) => ({ cpe, source: "syft-generated" })),
  });
  Object.assign(a.metadata, {
    package: p.name,
    version: p.version,
    architecture: p.architecture,
    originPackage: p.origin,
  });
  a.licenses = [{ value: p.license }];
  assert.equal(
    evaluateApkCoverage({
      sbomText: JSON.stringify(s),
      inventory: [p],
      expectedSource: s.source,
      expectedDistro: s.distro,
      lock,
    }).status,
    "PASS",
  );
});
test("F02 removing CPE and origin from all 53 package artifacts fails against independent fixture inventory", () => {
  const expected = Array.from({ length: 53 }, (_, i) => {
    const p = {
      name: "fixture-" + i,
      version: "1.0-r0",
      architecture: "x86_64",
      license: "MIT",
      origin: "fixture-" + i,
      cpes: ["cpe:2.3:a:fixture:fixture_" + i + ":1.0-r0:*:*:*:*:*:*:*"],
    };
    return { ...p, purl: canonicalApkPurl(p, "3.24.0") };
  });
  const s = syft();
  s.artifacts = expected.map((p) => ({
    id: p.name,
    type: "apk",
    foundBy: "apk-db-cataloger",
    metadataType: "apk-db-entry",
    name: p.name,
    version: p.version,
    purl: p.purl,
    licenses: [{ value: p.license }],
    cpes: p.cpes.map((cpe) => ({ cpe, source: "syft-generated" })),
    metadata: {
      package: p.name,
      version: p.version,
      architecture: p.architecture,
      originPackage: p.origin,
    },
  }));
  const args = {
    inventory: expected,
    expectedSource: s.source,
    expectedDistro: s.distro,
    lock,
  };
  assert.equal(
    evaluateApkCoverage({ ...args, sbomText: JSON.stringify(s) }).status,
    "PASS",
  );
  for (const a of s.artifacts) {
    delete a.cpes;
    delete a.metadata.originPackage;
  }
  const result = evaluateApkCoverage({ ...args, sbomText: JSON.stringify(s) });
  assert.equal(result.status, "FAIL");
  assert.equal(
    result.findings.filter((f) => f.code === "APK_CPE_COVERAGE").length,
    53,
  );
  assert.equal(
    result.findings.filter((f) => f.code === "APK_ORIGIN").length,
    53,
  );
});
test("duplicate inventory is rejected even if catalog has matching duplicates", () =>
  fails(
    evaluateApkCoverage({
      sbomText: JSON.stringify(syft()),
      inventory: [...inventory, ...inventory],
      expectedSource: syft().source,
      expectedDistro: syft().distro,
      lock,
    }),
    "INVENTORY_DUPLICATE",
  ));

for (const [name, mutate, exit, code] of [
  ["high no fix", (r) => r.matches.push(match()), 2, "VULNERABILITY_THRESHOLD"],
  [
    "critical no CVSS",
    (r) =>
      r.matches.push({
        ...match("Critical"),
        vulnerability: { id: "CVE-test", severity: "Critical", cvss: [] },
      }),
    2,
    "VULNERABILITY_THRESHOLD",
  ],
  [
    "low CVSS 7",
    (r) => r.matches.push(match("Low", 7)),
    0,
    "VULNERABILITY_THRESHOLD",
  ],
  [
    "unknown severity",
    (r) => r.matches.push(match("Unknown", 0)),
    0,
    "VULNERABILITY_UNKNOWN",
  ],
  [
    "invalid CVSS",
    (r) => r.matches.push(match("Low", "8.1")),
    0,
    "VULNERABILITY_CVSS",
  ],
  [
    "related CVSS threshold",
    (r) => {
      const m = match("Low", 2);
      m.relatedVulnerabilities = [match("Low", 9).vulnerability];
      r.matches.push(m);
    },
    0,
    "VULNERABILITY_THRESHOLD",
  ],
  [
    "ignored match",
    (r) => {
      r.ignoredMatches = [match()];
    },
    0,
    "SCAN_SUPPRESSION",
  ],
  [
    "null ignored matches",
    (r) => {
      r.ignoredMatches = null;
    },
    0,
    "SCAN_SUPPRESSION",
  ],
  [
    "EOL",
    (r) => {
      r.alertsByPackage = [{ alerts: [{ type: "distro-eol" }] }];
    },
    0,
    "SCAN_ALERT",
  ],
  ["raw mismatch", (r) => r.matches.push(match()), 0, "SCAN_EXIT_MISMATCH"],
  ["raw error", () => {}, 1, "SCAN_PROCESS"],
  [
    "foreign source",
    (r) => {
      r.source.target = "/foreign";
    },
    0,
    "SCAN_SOURCE",
  ],
  [
    "DB path",
    (r) => {
      r.descriptor.db.status.path = "/foreign/vulnerability.db";
    },
    0,
    "DB_REPORT",
  ],
  [
    "DB error",
    (r) => {
      r.descriptor.db.status.error = "corrupt";
    },
    0,
    "DB_REPORT",
  ],
  [
    "DB missing NVD",
    (r) => {
      delete r.descriptor.db.providers.nvd;
    },
    0,
    "DB_COVERAGE",
  ],
  [
    "suppression only-fixed",
    (r) => {
      r.descriptor.configuration["only-fixed"] = true;
    },
    0,
    "SCAN_SUPPRESSION",
  ],
  [
    "suppression VEX",
    (r) => {
      r.descriptor.configuration["vex-documents"] = ["vex.json"];
    },
    0,
    "SCAN_SUPPRESSION",
  ],
  [
    "EOL disabled",
    (r) => {
      r.descriptor.configuration.alerts["enable-eol-distro-warnings"] = false;
    },
    0,
    "SCAN_CONFIG",
  ],
  [
    "CPE disabled",
    (r) => {
      r.descriptor.configuration.match.stock["using-cpes"] = false;
    },
    0,
    "SCAN_CONFIG",
  ],
  [
    "missing matches",
    (r) => {
      delete r.matches;
    },
    0,
    "SCAN_SCHEMA",
  ],
])
  test(name, () => {
    const r = report();
    mutate(r);
    fails(evaluateGrypeReport(grypeArgs(r, exit)), code);
  });
test("parse failure and stderr warning fail closed", () => {
  fails(evaluateGrypeReport({ ...grypeArgs(), reportText: "{" }), "JSON_PARSE");
  fails(
    evaluateGrypeReport({
      ...grypeArgs(),
      stderr: "WARN package extraction failed",
    }),
    "SCAN_PROCESS",
  );
});
test("valid DB freshness/hash and pinned scanner identities", () => {
  assert.equal(
    evaluateDatabase({ evidence: db(), lock, now, runId }).status,
    "PASS",
  );
  for (const name of ["grype", "syft"])
    assert.equal(
      evaluateScannerIdentity({ name, evidence: tool(name), lock, runId })
        .status,
      "PASS",
    );
});
for (const [name, mutate, code] of [
  [
    "stale DB",
    (d) => {
      d.status.built = "2026-09-01T00:00:00Z";
    },
    "DB_FRESHNESS",
  ],
  [
    "future DB",
    (d) => {
      d.status.built = "2026-09-06T18:10:01Z";
    },
    "DB_FRESHNESS",
  ],
  [
    "changed DB",
    (d) => {
      d.databaseSha256After = "b".repeat(64);
    },
    "DB_IDENTITY",
  ],
  [
    "foreign run",
    (d) => {
      d.runId = "other";
    },
    "RUN_ID",
  ],
  [
    "missing DB",
    (d) => {
      delete d.status;
    },
    "DB_IDENTITY",
  ],
])
  test(name, () => {
    const d = db();
    mutate(d);
    fails(evaluateDatabase({ evidence: d, lock, now, runId }), code);
  });
test("wrong binary, commit and version each fail", () => {
  for (const change of [
    (v) => {
      v.executableSha256After = H;
    },
    (v) => {
      v.version.gitCommit = H;
    },
    (v) => {
      v.version.version = "0.0.0";
    },
  ]) {
    const v = tool("grype");
    change(v);
    fails(
      evaluateScannerIdentity({ name: "grype", evidence: v, lock, runId }),
      "TOOL_IDENTITY",
    );
  }
});
test("source SBOM covers exact PG source, compiled binary, and image", () => {
  const expected = {
    version: lock.postgres.version,
    sourceSha256: lock.postgres.sha256,
    binarySha256: H,
    imageDigest: digest,
  };
  const sbomText = makePostgresSbom(expected);
  assert.equal(evaluateSourceCoverage({ sbomText, expected }).status, "PASS");
  for (const changed of [
    { ...expected, imageDigest: "sha256:" + "b".repeat(64) },
    { ...expected, binarySha256: "b".repeat(64) },
  ])
    fails(
      evaluateSourceCoverage({ sbomText, expected: changed }),
      "SOURCE_COVERAGE",
    );
  fails(
    evaluateSourceCoverage({
      sbomText: JSON.stringify({ components: [] }),
      expected,
    }),
    "SOURCE_COVERAGE",
  );
});
test("aggregate requires evidence and cannot grant execution/license authority", () => {
  const result = evaluateImageAdmission({}, {});
  assert.equal(result.status, "FAIL");
  assert.equal(result.executionAdmission, "NOT_EVALUATED");
  assert.equal(result.licenseReview, "NOT_EVALUATED");
});
test("sha256 uses exact bytes", () =>
  assert.equal(
    sha256("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  ));

function bundle() {
  const makeEnvelope = (body, inputSha256, rawExit = 0) => {
    const value = typeof body === "string" ? body : JSON.stringify(body);
    return {
      text: value,
      sha256: sha256(value),
      inputSha256,
      runId,
      rawExit,
      stderr: "",
    };
  };
  const target = {
    imageDigest: digest,
    rootfsSha256: H,
    postgresBinarySha256: H,
    inventory,
    distro: syft().distro,
    syftSource: syft().source,
    grypeSource: sourceExpectation,
    sourceGrypeSource: sourceExpectation,
  };
  const trusted = {
    lock,
    now,
    runId,
    targets: {
      build: structuredClone(target),
      runtime: structuredClone(target),
    },
    canaryGrypeSource: sourceExpectation,
  };
  const apk = apkCanaryBundle();
  trusted.apkCanary = apk.expected;
  const stage = () => {
    const s = makeEnvelope(syft(), H);
    return {
      runId,
      imageDigest: digest,
      rootfsSha256: H,
      extraction: { rawExit: 0, errors: [] },
      syft: s,
      grype: makeEnvelope(report(), s.sha256),
    };
  };
  const s = makeEnvelope(
    makePostgresSbom({
      version: lock.postgres.version,
      sourceSha256: lock.postgres.sha256,
      binarySha256: H,
      imageDigest: digest,
    }),
    H,
  );
  const canary = makeEnvelope(
    {
      bomFormat: "CycloneDX",
      specVersion: "1.6",
      version: 1,
      components: [
        {
          type: "application",
          "bom-ref": "postgresql-source",
          name: "postgresql",
          version: "17.2",
          purl: "pkg:generic/postgresql@17.2",
          cpe: "cpe:2.3:a:postgresql:postgresql:17.2:*:*:*:*:*:*:*",
        },
      ],
    },
    sha256("postgresql-source-canary-17.2"),
  );
  const cr = report();
  cr.matches = [match()];
  const evidence = {
    tools: { grype: tool("grype"), syft: tool("syft") },
    database: db(),
    stages: { build: stage(), runtime: stage() },
    source: { sbom: s, grype: makeEnvelope(report(), s.sha256) },
    canary: { sbom: canary, grype: makeEnvelope(cr, canary.sha256, 2) },
    apkCanary: apk.evidence,
  };
  return { evidence, trusted };
}
function apkCanaryBundle() {
  const pkg = {
    name: "perl",
    version: "5.42.2-r0",
    architecture: "x86_64",
    license: "Artistic-1.0-Perl OR GPL-1.0-or-later",
    origin: "perl",
    purl: "pkg:apk/alpine/perl@5.42.2-r0?arch=x86_64&distro=alpine-3.24.0",
    cpes: ["cpe:2.3:a:perl:perl:5.42.2-r0:*:*:*:*:*:*:*"],
  };
  const s = syft(),
    a = s.artifacts[0];
  Object.assign(a, {
    id: "perl-id",
    name: pkg.name,
    version: pkg.version,
    purl: pkg.purl,
    cpes: pkg.cpes.map((cpe) => ({ cpe, source: "syft-generated" })),
  });
  Object.assign(a.metadata, {
    package: pkg.name,
    version: pkg.version,
    originPackage: pkg.origin,
  });
  a.licenses = [{ value: pkg.license, spdxExpression: pkg.license }];
  s.source = { type: "image", metadata: { manifestDigest: digest } };
  const r = report(),
    m = match("Critical", 9.1);
  m.vulnerability.id = "CVE-2026-13221";
  m.vulnerability.namespace = "nvd:cpe";
  m.artifact = {
    id: "perl-id",
    type: "apk",
    name: pkg.name,
    version: pkg.version,
    purl: pkg.purl,
    cpes: [...pkg.cpes],
  };
  m.matchDetails = [
    {
      type: "cpe-match",
      matcher: "apk-matcher",
      searchedBy: {
        namespace: "nvd:cpe",
        package: { name: pkg.name, version: pkg.version },
        cpes: [pkg.cpes[0].replace("5.42.2-r0", "5.42.2")],
      },
      found: { vulnerabilityID: m.vulnerability.id },
    },
  ];
  r.matches = [m];
  const wrap = (doc, inputSha256, rawExit) => {
    const value = JSON.stringify(doc);
    return {
      runId,
      text: value,
      sha256: sha256(value),
      inputSha256,
      rawExit,
      stderr: "",
    };
  };
  const sbom = wrap(s, H, 0);
  return {
    expected: {
      imageDigest: digest,
      rootfsSha256: H,
      inventory: [pkg],
      distro: s.distro,
      syftSource: s.source,
      grypeSource: sourceExpectation,
      requiredMatches: [
        {
          name: pkg.name,
          version: pkg.version,
          purl: pkg.purl,
          vulnerabilityId: m.vulnerability.id,
          severity: "Critical",
          cpe: pkg.cpes[0],
        },
      ],
    },
    evidence: {
      runId,
      imageDigest: digest,
      rootfsSha256: H,
      extraction: { rawExit: 0, errors: [] },
      syft: sbom,
      grype: wrap(r, sbom.sha256, 2),
    },
  };
}
test("APK canary requires exact APK CPE-path detection in addition to PG canary", () => {
  const { evidence, expected } = apkCanaryBundle();
  assert.equal(
    evaluateApkCanary({ evidence, expected, runId, database: db(), lock })
      .status,
    "PASS",
  );
  const full = bundle();
  delete full.evidence.apkCanary;
  fails(
    evaluateImageAdmission(full.evidence, full.trusted),
    "APK_CANARY_BINDING",
  );
});
for (const [name, mutate, code] of [
  [
    "APK canary raw zero",
    (e) => {
      e.grype.rawExit = 0;
    },
    "APK_CANARY_DETECTION",
  ],
  [
    "APK canary foreign image",
    (e) => {
      e.imageDigest = "sha256:" + "b".repeat(64);
    },
    "APK_CANARY_BINDING",
  ],
  [
    "APK canary missing witness",
    (e) => {
      const r = JSON.parse(e.grype.text);
      r.matches[0].matchDetails = [];
      e.grype.text = JSON.stringify(r);
      e.grype.sha256 = sha256(e.grype.text);
    },
    "APK_CANARY_DETECTION",
  ],
  [
    "APK canary generic matcher cannot replace APK matcher",
    (e) => {
      const r = JSON.parse(e.grype.text);
      r.matches[0].matchDetails[0].matcher = "stock-matcher";
      e.grype.text = JSON.stringify(r);
      e.grype.sha256 = sha256(e.grype.text);
    },
    "APK_CANARY_DETECTION",
  ],
  [
    "APK canary altered CVE",
    (e) => {
      const r = JSON.parse(e.grype.text);
      r.matches[0].vulnerability.id = "CVE-foreign";
      e.grype.text = JSON.stringify(r);
      e.grype.sha256 = sha256(e.grype.text);
    },
    "APK_CANARY_DETECTION",
  ],
  [
    "APK canary PURL replaced",
    (e) => {
      const r = JSON.parse(e.grype.text);
      r.matches[0].artifact.purl = "pkg:generic/postgresql@17.2";
      e.grype.text = JSON.stringify(r);
      e.grype.sha256 = sha256(e.grype.text);
    },
    "APK_CANARY_DETECTION",
  ],
])
  test(name, () => {
    const { evidence, expected } = apkCanaryBundle();
    mutate(evidence);
    fails(
      evaluateApkCanary({ evidence, expected, runId, database: db(), lock }),
      code,
    );
  });
test("complete synthetic vulnerability envelope passes while execution/license remain unreviewed", () => {
  const { evidence, trusted } = bundle();
  const result = evaluateImageAdmission(evidence, trusted);
  assert.equal(result.status, "PASS", JSON.stringify(result));
  assert.equal(result.executionAdmission, "NOT_EVALUATED");
  assert.equal(result.licenseReview, "NOT_EVALUATED");
});
for (const [name, mutate, code] of [
  [
    "foreign image digest",
    (e) => {
      e.stages.runtime.imageDigest = "sha256:" + "b".repeat(64);
    },
    "IMAGE_BINDING",
  ],
  [
    "foreign rootfs digest",
    (e) => {
      e.stages.build.rootfsSha256 = "b".repeat(64);
    },
    "IMAGE_BINDING",
  ],
  [
    "extraction error",
    (e) => {
      e.stages.build.extraction.errors.push("truncated archive");
    },
    "EXTRACTION",
  ],
  [
    "extraction exit",
    (e) => {
      e.stages.build.extraction.rawExit = 1;
    },
    "EXTRACTION",
  ],
  [
    "missing stage",
    (e) => {
      delete e.stages.build;
    },
    "STAGES",
  ],
  [
    "foreign SBOM process",
    (e) => {
      e.stages.build.syft.runId = "foreign";
    },
    "RUN_ID",
  ],
  [
    "SBOM warning",
    (e) => {
      e.stages.runtime.syft.stderr = "WARN invalid package";
    },
    "SCAN_PROCESS",
  ],
  [
    "different SBOM scan input",
    (e) => {
      e.stages.runtime.grype.inputSha256 = "b".repeat(64);
    },
    "ARTIFACT_BINDING",
  ],
  [
    "mutated report bytes",
    (e) => {
      e.stages.runtime.grype.text += " ";
    },
    "ARTIFACT_BINDING",
  ],
  [
    "absent source coverage",
    (e) => {
      delete e.source.sbom;
    },
    "ARTIFACT_BINDING",
  ],
  [
    "absent canary",
    (e) => {
      delete e.canary;
    },
    "CANARY_DETECTION",
  ],
  [
    "canary zero findings",
    (e) => {
      const r = report();
      e.canary.grype.text = JSON.stringify(r);
      e.canary.grype.sha256 = sha256(e.canary.grype.text);
      e.canary.grype.rawExit = 0;
    },
    "CANARY_DETECTION",
  ],
])
  test(name, () => {
    const { evidence, trusted } = bundle();
    mutate(evidence);
    fails(evaluateImageAdmission(evidence, trusted), code);
  });
test("exact Grype threshold stderr is accepted but additional error is rejected", () => {
  const r = report();
  r.matches.push(match());
  const args = {
    ...grypeArgs(r, 2),
    stderr:
      "[0002] ERROR discovered vulnerabilities at or above the severity threshold\n",
  };
  assert.deepEqual(codes(evaluateGrypeReport(args)), [
    "VULNERABILITY_THRESHOLD",
  ]);
  fails(
    evaluateGrypeReport({ ...args, stderr: args.stderr + "WARN corruption\n" }),
    "SCAN_PROCESS",
  );
});
test("unknown Alpine release cannot be inferred from APK artifacts", () =>
  fails(
    evaluateApkCoverage({
      sbomText: JSON.stringify({ ...syft(), distro: {} }),
      inventory,
      expectedSource: syft().source,
      expectedDistro: syft().distro,
      lock,
    }),
    "SBOM_DISTRO",
  ));
test("OS Grype distro coverage cannot be empty", () => {
  const r = report();
  r.distro = {};
  fails(
    evaluateGrypeReport({ ...grypeArgs(r), expectedDistro: syft().distro }),
    "SCAN_DISTRO",
  );
});
