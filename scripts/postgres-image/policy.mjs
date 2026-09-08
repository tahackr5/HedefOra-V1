import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const text = (v) => typeof v === "string" && v.length > 0;
const empty = (v) => v == null || (Array.isArray(v) && v.length === 0);
const omittedOrEmptyArray = (v) =>
  v === undefined || (Array.isArray(v) && v.length === 0);
const canonical = (v) =>
  JSON.stringify(v, (_, x) =>
    x && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(
          Object.entries(x).sort(([a], [b]) => a.localeCompare(b)),
        )
      : x,
  );
export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");

function check(fn) {
  const findings = [];
  const issue = (code, path, detail) => findings.push({ code, path, detail });
  try {
    fn(issue);
  } catch {
    issue("EVIDENCE_SCHEMA", "$", "Missing or malformed evidence.");
  }
  return { status: findings.length ? "FAIL" : "PASS", findings };
}
function parse(value, issue, path) {
  try {
    if (typeof value !== "string" || value.length > 64 * 1024 * 1024)
      throw new Error();
    const result = JSON.parse(value);
    if (!result || typeof result !== "object" || Array.isArray(result))
      throw new Error();
    return result;
  } catch {
    issue("JSON_PARSE", path, "Expected bounded JSON object text.");
    return {};
  }
}
function suppression(config, issue, path) {
  for (const key of ["ignore", "exclude", "vex-documents", "vex-add"]) {
    if (!empty(config?.[key]))
      issue("SCAN_SUPPRESSION", path + "." + key, "Suppression is forbidden.");
  }
}
function validDbStatus(s, expected) {
  return (
    s?.valid === true &&
    (s.error === undefined || s.error === null) &&
    s.schemaVersion === expected.schemaVersion &&
    s.built === expected.built &&
    text(s.path)
  );
}
export function evaluateScannerIdentity({ name, evidence, lock, runId }) {
  return check((issue) => {
    const pin = lock[name];
    const platform = pin?.platforms?.[evidence?.platform];
    if (!text(runId) || evidence?.runId !== runId)
      issue("RUN_ID", name, "Scanner must belong to this run.");
    if (
      !platform ||
      !HASH.test(platform.sha256) ||
      !HASH.test(evidence?.executableSha256Before) ||
      evidence.archiveSha256 !== platform.sha256 ||
      evidence.executableSha256Before !== evidence.executableSha256After ||
      !HASH.test(platform.executableSha256) ||
      evidence.executableSha256Before !== platform.executableSha256 ||
      evidence.version?.application !== name ||
      evidence.version?.version !== pin?.version ||
      evidence.version?.gitCommit !== pin?.commit ||
      evidence.version?.platform !== evidence.platform ||
      evidence.archiveMemberSha256 !== evidence.executableSha256Before
    ) {
      issue(
        "TOOL_IDENTITY",
        name,
        "Archive, extracted member, executable before/after, version and commit must agree.",
      );
    }
  });
}
export function evaluateDatabase({ evidence, lock, now, runId }) {
  return check((issue) => {
    if (!text(runId) || evidence?.runId !== runId)
      issue("RUN_ID", "database", "DB must belong to this run.");
    const pin = lock.database;
    if (
      evidence?.archiveSha256 !== pin.sha256 ||
      evidence.archiveSize !== pin.size ||
      evidence.extractedSha256 !== pin.extractedSha256 ||
      !HASH.test(evidence.databaseSha256Before) ||
      evidence.databaseSha256Before !== evidence.databaseSha256After ||
      !validDbStatus(evidence.status, pin) ||
      evidence.importRawExit !== 0
    ) {
      issue(
        "DB_IDENTITY",
        "database",
        "Pinned archive/extraction, successful import, stable hydrated bytes and valid DB status required.",
      );
    }
    const age = Date.parse(now) - Date.parse(evidence?.status?.built);
    if (!Number.isFinite(age) || age > 48 * 3600_000 || age < -10 * 60_000)
      issue(
        "DB_FRESHNESS",
        "database.built",
        "DB age must be within 48 hours and at most 10 minutes in the future.",
      );
  });
}
export function canonicalApkPurl(
  { name, version, architecture, origin },
  distroVersion,
) {
  if (
    ![name, version, architecture, origin].every(
      (v) => typeof v === "string" && /^[a-zA-Z0-9][a-zA-Z0-9+._~-]*$/.test(v),
    ) ||
    !/^3\.\d+\.\d+$/.test(distroVersion)
  )
    throw new Error("Unsupported APK identity profile.");
  return (
    "pkg:apk/alpine/" +
    encodeURIComponent(name) +
    "@" +
    encodeURIComponent(version) +
    "?arch=" +
    encodeURIComponent(architecture) +
    "&distro=alpine-" +
    distroVersion +
    (origin === name ? "" : "&upstream=" + encodeURIComponent(origin))
  );
}
function validCpeSet(cpes, version) {
  if (
    !Array.isArray(cpes) ||
    !cpes.length ||
    cpes.length > 32 ||
    new Set(cpes).size !== cpes.length
  )
    return false;
  return cpes.every((cpe) => {
    if (typeof cpe !== "string") return false;
    const parts = cpe.split(":");
    // Bounded current APK application-CPE profile; unsupported profiles require review.
    const literal = /^(?:[a-z0-9._-]|\\\+)+$/;
    return (
      parts.length === 13 &&
      parts[0] === "cpe" &&
      parts[1] === "2.3" &&
      parts[2] === "a" &&
      literal.test(parts[3]) &&
      literal.test(parts[4]) &&
      parts[5] === version &&
      parts.slice(6).every((part) => part === "*")
    );
  });
}
export function evaluateApkCoverage({
  sbomText,
  inventory,
  expectedSource,
  expectedDistro,
  lock,
}) {
  return check((issue) => {
    const sbom = parse(sbomText, issue, "syft");
    if (
      sbom.schema?.version !== lock.syft.schemaVersion ||
      sbom.descriptor?.name !== "syft" ||
      sbom.descriptor?.version !== lock.syft.version
    )
      issue(
        "SBOM_SCHEMA",
        "syft",
        "Exact pinned Syft schema and producer required.",
      );
    if (!expectedSource || canonical(sbom.source) !== canonical(expectedSource))
      issue(
        "SBOM_SOURCE",
        "syft.source",
        "Catalog source differs from extracted target.",
      );
    if (
      expectedDistro?.id !== "alpine" ||
      !text(expectedDistro.versionID) ||
      sbom.distro?.id !== expectedDistro.id ||
      sbom.distro?.versionID !== expectedDistro.versionID
    )
      issue(
        "SBOM_DISTRO",
        "syft.distro",
        "Exact Alpine release required; no inferred distro.",
      );
    suppression(sbom.descriptor?.configuration, issue, "syft.configuration");
    if (
      lock.syft.generateCpes !== true ||
      sbom.descriptor?.configuration?.["data-generation"]?.["generate-cpes"] !==
        true
    )
      issue(
        "SBOM_CONFIG",
        "syft.configuration",
        "Pinned generate-cpes=true is required for APK vulnerability coverage.",
      );
    if (
      !Array.isArray(inventory) ||
      !inventory.length ||
      !Array.isArray(sbom.artifacts)
    ) {
      issue(
        "APK_COVERAGE",
        "syft.artifacts",
        "Nonempty inventory and artifact list required.",
      );
      return;
    }
    const key = (p) =>
      canonical([p.name, p.version, p.architecture, p.license]);
    const trustedPackages = new Map(inventory.map((p) => [p.name, p]));
    const expected = inventory.map((p) => {
      if (![p.name, p.version, p.architecture, p.license].every(text))
        issue(
          "INVENTORY_SCHEMA",
          "inventory",
          "Name, version, architecture and literal license required.",
        );
      let validPurl = false;
      try {
        validPurl = p.purl === canonicalApkPurl(p, expectedDistro.versionID);
      } catch {}
      if (!text(p.origin) || !validPurl || !validCpeSet(p.cpes, p.version))
        issue(
          "APK_TRUSTED_MAPPING",
          "inventory." + p.name,
          "Independent trusted origin, canonical PURL and reviewed nonempty exact CPE set required.",
        );
      return key(p);
    });
    if (new Set(inventory.map((p) => p.name)).size !== inventory.length)
      issue(
        "INVENTORY_DUPLICATE",
        "inventory",
        "APK name occurs more than once.",
      );
    const ids = new Set(),
      names = new Set();
    const actual = sbom.artifacts.map((p) => {
      const expectedPackage = trustedPackages.get(p.name);
      if (ids.has(p.id) || names.has(p.name))
        issue(
          "APK_DUPLICATE",
          "syft.artifacts",
          "Duplicate package or artifact ID.",
        );
      ids.add(p.id);
      names.add(p.name);
      if (p.type !== "apk")
        issue(
          "APK_UNEXPECTED",
          "syft.artifacts",
          "OS-only catalog must contain APK artifacts only.",
        );
      if (
        !text(p.id) ||
        p.foundBy !== "apk-db-cataloger" ||
        p.metadataType !== "apk-db-entry" ||
        p.metadata?.package !== p.name ||
        p.metadata?.version !== p.version ||
        !text(p.purl) ||
        !p.purl.startsWith("pkg:apk/alpine/") ||
        !Array.isArray(p.licenses) ||
        p.licenses.length !== 1
      )
        issue(
          "APK_COVERAGE",
          "syft.artifacts",
          "Incomplete APK identity or literal license.",
        );
      if (
        !text(p.metadata?.originPackage) ||
        p.metadata.originPackage !== expectedPackage?.origin
      )
        issue(
          "APK_ORIGIN",
          "syft.artifacts." + p.name,
          "APK source origin differs from trusted installed/archive metadata.",
        );
      if (!text(p.purl) || p.purl !== expectedPackage?.purl)
        issue(
          "APK_PURL",
          "syft.artifacts." + p.name,
          "Exact canonical package/version/architecture/distro/upstream PURL required.",
        );
      const cpes = Array.isArray(p.cpes)
        ? p.cpes.map((c) => c?.cpe)
        : undefined;
      if (
        !validCpeSet(cpes, p.version) ||
        p.cpes?.some((c) => c.source !== "syft-generated") ||
        canonical(cpes?.slice().sort()) !==
          canonical(expectedPackage?.cpes?.slice().sort())
      )
        issue(
          "APK_CPE_COVERAGE",
          "syft.artifacts." + p.name,
          "Missing, invalid or replaced APK CPE set; exact trusted coverage is required.",
        );
      return key({
        name: p.name,
        version: p.version,
        architecture: p.metadata?.architecture,
        license: p.licenses?.[0]?.value,
      });
    });
    if (canonical(actual.sort()) !== canonical(expected.sort()))
      issue(
        "APK_COVERAGE",
        "syft.artifacts",
        "Exact package multiset differs from trusted APK inventory.",
      );
  });
}
export function evaluateGrypeReport({
  reportText,
  rawExit,
  stderr,
  expectedSource,
  expectedDistro,
  database,
  lock,
}) {
  return check((issue) => {
    const report = parse(reportText, issue, "grype");
    const thresholdNotice =
      rawExit === 2 &&
      typeof stderr === "string" &&
      /^(?:\[\d+\]\s+)?ERROR discovered vulnerabilities at or above the severity threshold\r?\n?$/.test(
        stderr,
      );
    if (![0, 2].includes(rawExit) || (stderr !== "" && !thresholdNotice))
      issue(
        "SCAN_PROCESS",
        "grype",
        "Only raw 0/2; stderr may contain solely the exact threshold termination notice.",
      );
    if (
      report.descriptor?.name !== "grype" ||
      report.descriptor?.version !== lock.grype.version ||
      !Array.isArray(report.matches)
    )
      issue(
        "SCAN_SCHEMA",
        "grype",
        "Exact Grype producer and matches array required.",
      );
    if (
      !expectedSource ||
      canonical(report.source) !== canonical(expectedSource)
    )
      issue(
        "SCAN_SOURCE",
        "grype.source",
        "Report source differs from exact scanned SBOM.",
      );
    if (
      expectedDistro &&
      (expectedDistro.id !== "alpine" ||
        report.distro?.name !== "alpine" ||
        ![
          expectedDistro.versionID,
          expectedDistro.versionID?.split(".").slice(0, 2).join("."),
        ].includes(report.distro?.version))
    )
      issue(
        "SCAN_DISTRO",
        "grype.distro",
        "OS scan must retain the exact Alpine release family.",
      );
    if (
      !validDbStatus(report.descriptor?.db?.status, database.status) ||
      report.descriptor?.db?.status?.path !== database.status.path
    )
      issue(
        "DB_REPORT",
        "grype.descriptor.db",
        "Report must identify the validated same-run DB.",
      );
    for (const name of ["alpine", "nvd", "eol"]) {
      const p = report.descriptor?.db?.providers?.[name];
      if (!text(p?.input) || !Number.isFinite(Date.parse(p?.captured)))
        issue(
          "DB_COVERAGE",
          "grype.descriptor.db.providers." + name,
          "Required advisory provider coverage metadata missing.",
        );
    }
    if (!omittedOrEmptyArray(report.ignoredMatches))
      issue(
        "SCAN_SUPPRESSION",
        "grype.ignoredMatches",
        "Ignored matches forbidden.",
      );
    if (
      !omittedOrEmptyArray(report.alertsByPackage) ||
      !omittedOrEmptyArray(report.errors)
    )
      issue("SCAN_ALERT", "grype", "EOL, alerts or parse errors block.");
    const c = report.descriptor?.configuration;
    suppression(c, issue, "grype.configuration");
    if (
      c?.["only-fixed"] !== false ||
      c?.["only-notfixed"] !== false ||
      c?.["ignore-wontfix"] !== ""
    )
      issue(
        "SCAN_SUPPRESSION",
        "grype.configuration",
        "Fixed-state filtering forbidden.",
      );
    if (
      c?.["fail-on-severity"] !== "high" ||
      c?.["match-upstream-kernel-headers"] !== true ||
      c?.match?.stock?.["using-cpes"] !== true ||
      c?.alerts?.["enable-eol-distro-warnings"] !== true ||
      c?.db?.["auto-update"] !== false ||
      c?.db?.["validate-age"] !== true ||
      c?.db?.["validate-by-hash-on-start"] !== true ||
      ![172800000000000, "48h", "48h0m0s"].includes(
        c?.db?.["max-allowed-built-age"],
      )
    )
      issue(
        "SCAN_CONFIG",
        "grype.configuration",
        "Canonical CPE/EOL/freshness/no-update/high threshold settings required.",
      );
    let expectedExit = 0;
    for (const [index, match] of (report.matches ?? []).entries()) {
      const path = "grype.matches[" + index + "]";
      if (
        !text(match.artifact?.id) ||
        !text(match.artifact?.name) ||
        !text(match.artifact?.version)
      )
        issue("SCAN_SCHEMA", path, "Match must bind a package identity.");
      if (!Array.isArray(match.relatedVulnerabilities))
        issue("SCAN_SCHEMA", path, "Related vulnerabilities array required.");
      for (const [i, v] of [
        match.vulnerability,
        ...(match.relatedVulnerabilities ?? []),
      ].entries()) {
        const severity = v?.severity;
        if (
          !text(v?.id) ||
          !["Negligible", "Low", "Medium", "High", "Critical"].includes(
            severity,
          )
        )
          issue(
            "VULNERABILITY_UNKNOWN",
            path,
            "Missing or unknown severity blocks.",
          );
        if (i === 0 && ["High", "Critical"].includes(severity))
          expectedExit = 2;
        let high = ["High", "Critical"].includes(severity);
        if (!Array.isArray(v?.cvss))
          issue("VULNERABILITY_CVSS", path, "CVSS must be an array.");
        for (const cvss of v?.cvss ?? []) {
          const score = cvss?.metrics?.baseScore;
          if (
            typeof score !== "number" ||
            !Number.isFinite(score) ||
            score < 0 ||
            score > 10
          )
            issue("VULNERABILITY_CVSS", path, "Invalid CVSS score.");
          else if (score >= 7) high = true;
        }
        if (high)
          issue(
            "VULNERABILITY_THRESHOLD",
            path,
            "High/Critical or CVSS >= 7 blocks regardless of fix state.",
          );
      }
    }
    if ([0, 2].includes(rawExit) && rawExit !== expectedExit)
      issue(
        "SCAN_EXIT_MISMATCH",
        "grype.rawExit",
        "Raw exit differs from primary vulnerability severity threshold.",
      );
  });
}
function postgresComponent(version) {
  return {
    type: "application",
    "bom-ref": "postgresql-source",
    name: "postgresql",
    version,
    purl: "pkg:generic/postgresql@" + version,
    cpe: "cpe:2.3:a:postgresql:postgresql:" + version + ":*:*:*:*:*:*:*",
  };
}
export function makePostgresSbom({
  version,
  sourceSha256,
  binarySha256,
  imageDigest,
}) {
  if (
    !/^17\.\d+$/.test(version) ||
    !HASH.test(sourceSha256) ||
    !HASH.test(binarySha256) ||
    !DIGEST.test(imageDigest)
  )
    throw new Error("Invalid PostgreSQL source evidence.");
  return (
    JSON.stringify({
      bomFormat: "CycloneDX",
      specVersion: "1.6",
      version: 1,
      components: [
        {
          ...postgresComponent(version),
          hashes: [{ alg: "SHA-256", content: binarySha256 }],
          properties: [
            { name: "hedefora:source-sha256", value: sourceSha256 },
            { name: "hedefora:image-digest", value: imageDigest },
          ],
        },
      ],
    }) + "\n"
  );
}
export function evaluateSourceCoverage({ sbomText, expected }) {
  return check((issue) => {
    const sbom = parse(sbomText, issue, "source.sbom");
    if (canonical(sbom) !== canonical(JSON.parse(makePostgresSbom(expected))))
      issue(
        "SOURCE_COVERAGE",
        "source.sbom",
        "Exact PostgreSQL source/CPE/PURL, binary SHA and image binding required.",
      );
  });
}
function envelope(e, runId, inputSha256, issue, path) {
  if (!e || e.runId !== runId)
    issue(
      "RUN_ID",
      path,
      "Every process envelope must belong to the same run.",
    );
  if (
    typeof e?.text !== "string" ||
    e.sha256 !== sha256(e.text) ||
    e.inputSha256 !== inputSha256
  )
    issue(
      "ARTIFACT_BINDING",
      path,
      "Exact process input/output SHA binding required.",
    );
}
export function evaluateApkCanary({
  evidence,
  expected,
  runId,
  database,
  lock,
}) {
  return check((issue) => {
    const merge = (r) =>
      r.findings.forEach((f) => issue(f.code, "apkCanary." + f.path, f.detail));
    if (
      !expected ||
      !DIGEST.test(expected.imageDigest) ||
      !HASH.test(expected.rootfsSha256) ||
      evidence?.imageDigest !== expected.imageDigest ||
      evidence?.rootfsSha256 !== expected.rootfsSha256
    )
      issue(
        "APK_CANARY_BINDING",
        "apkCanary",
        "Exact independently pinned APK canary image and input required.",
      );
    if (
      evidence?.runId !== runId ||
      evidence?.extraction?.rawExit !== 0 ||
      !Array.isArray(evidence?.extraction?.errors) ||
      evidence.extraction.errors.length
    )
      issue(
        "EXTRACTION",
        "apkCanary",
        "Canary extraction must be same-run and error-free.",
      );
    envelope(
      evidence?.syft,
      runId,
      expected?.rootfsSha256,
      issue,
      "apkCanary.syft",
    );
    if (evidence?.syft?.rawExit !== 0 || evidence?.syft?.stderr !== "")
      issue(
        "SCAN_PROCESS",
        "apkCanary.syft",
        "APK canary cataloging must complete without warnings/errors.",
      );
    merge(
      evaluateApkCoverage({
        sbomText: evidence?.syft?.text,
        inventory: expected?.inventory,
        expectedSource: expected?.syftSource,
        expectedDistro: expected?.distro,
        lock,
      }),
    );
    const sbom = parse(evidence?.syft?.text, issue, "apkCanary.syft");
    if (
      sbom.source?.type !== "image" ||
      sbom.source.metadata?.manifestDigest !== expected?.imageDigest
    )
      issue(
        "APK_CANARY_BINDING",
        "apkCanary.syft",
        "APK canary must scan the pinned OCI image as data.",
      );
    envelope(
      evidence?.grype,
      runId,
      evidence?.syft?.sha256,
      issue,
      "apkCanary.grype",
    );
    const scan = evaluateGrypeReport({
      reportText: evidence?.grype?.text,
      rawExit: evidence?.grype?.rawExit,
      stderr: evidence?.grype?.stderr,
      expectedSource: expected?.grypeSource,
      expectedDistro: expected?.distro,
      database,
      lock,
    });
    for (const f of scan.findings.filter(
      (f) => f.code !== "VULNERABILITY_THRESHOLD",
    ))
      issue(f.code, "apkCanary." + f.path, f.detail);
    const report = parse(evidence?.grype?.text, issue, "apkCanary.grype");
    const required = expected?.requiredMatches;
    if (!Array.isArray(required) || !required.length || required.length > 64) {
      issue(
        "APK_CANARY_EXPECTATIONS",
        "apkCanary",
        "Independent exact known-vulnerable APK finding expectations required.",
      );
      return;
    }
    const projection = (m) =>
      canonical([m.name, m.version, m.purl, m.vulnerabilityId, m.severity]);
    const expectedFindings = required.map(projection);
    if (new Set(expectedFindings).size !== required.length)
      issue(
        "APK_CANARY_EXPECTATIONS",
        "apkCanary",
        "Duplicate finding expectations are forbidden.",
      );
    for (const r of required) {
      const pkg = expected.inventory?.find(
        (p) =>
          p.name === r.name && p.version === r.version && p.purl === r.purl,
      );
      if (
        !text(r.vulnerabilityId) ||
        !["High", "Critical"].includes(r.severity) ||
        !pkg?.cpes?.includes(r.cpe)
      )
        issue(
          "APK_CANARY_EXPECTATIONS",
          "apkCanary",
          "Expected finding must reference independently mapped APK identity and CPE.",
        );
      // Grype 0.118.0 APK CPE search removes the APK revision; artifact identity keeps it.
      const searchCpeParts = typeof r.cpe === "string" ? r.cpe.split(":") : [];
      searchCpeParts[5] =
        typeof r.version === "string" ? r.version.replace(/-r\d+$/, "") : "";
      const searchCpe = searchCpeParts.join(":");
      if (
        !report.matches?.some(
          (m) =>
            m.vulnerability?.id === r.vulnerabilityId &&
            m.vulnerability.severity === r.severity &&
            m.vulnerability.namespace === "nvd:cpe" &&
            m.artifact?.type === "apk" &&
            m.artifact.name === r.name &&
            m.artifact.version === r.version &&
            m.artifact.purl === r.purl &&
            m.artifact.cpes?.includes(r.cpe) &&
            m.matchDetails?.some(
              (d) =>
                d.type === "cpe-match" &&
                d.matcher === "apk-matcher" &&
                d.searchedBy?.namespace === "nvd:cpe" &&
                d.searchedBy?.package?.name === r.name &&
                d.searchedBy?.package?.version === r.version &&
                d.searchedBy?.cpes?.includes(searchCpe) &&
                d.found?.vulnerabilityID === r.vulnerabilityId,
            ),
        )
      )
        issue(
          "APK_CANARY_DETECTION",
          "apkCanary",
          "Expected APK/CPE match witness is missing or changed.",
        );
    }
    const blocking = (report.matches ?? []).filter((m) =>
      [m.vulnerability, ...(m.relatedVulnerabilities ?? [])].some(
        (v) =>
          ["High", "Critical"].includes(v?.severity) ||
          v?.cvss?.some((c) => c?.metrics?.baseScore >= 7),
      ),
    );
    const actualFindings = blocking.map((m) =>
      projection({
        name: m.artifact?.name,
        version: m.artifact?.version,
        purl: m.artifact?.purl,
        vulnerabilityId: m.vulnerability?.id,
        severity: m.vulnerability?.severity,
      }),
    );
    if (
      evidence?.grype?.rawExit !== 2 ||
      canonical(actualFindings.sort()) !== canonical(expectedFindings.sort())
    )
      issue(
        "APK_CANARY_DETECTION",
        "apkCanary",
        "Raw exit 2 and exact expected blocking APK finding multiset required.",
      );
  });
}
export function evaluateImageAdmission(evidence, trusted) {
  const result = check((issue) => {
    const { lock, now, runId, targets } = trusted;
    const merge = (r, prefix) =>
      r.findings.forEach((f) => issue(f.code, prefix + "." + f.path, f.detail));
    if (!text(runId)) issue("RUN_ID", "$", "Trusted run identity required.");
    for (const name of ["grype", "syft"])
      merge(
        evaluateScannerIdentity({
          name,
          evidence: evidence.tools?.[name],
          lock,
          runId,
        }),
        name,
      );
    merge(
      evaluateDatabase({ evidence: evidence.database, lock, now, runId }),
      "database",
    );
    if (
      canonical(Object.keys(evidence.stages ?? {}).sort()) !==
      canonical(["build", "runtime"])
    )
      issue("STAGES", "stages", "Exactly build and runtime evidence required.");
    for (const name of ["build", "runtime"]) {
      const stage = evidence.stages?.[name],
        target = targets?.[name];
      if (
        !target ||
        !DIGEST.test(target.imageDigest) ||
        !HASH.test(target.rootfsSha256) ||
        stage?.imageDigest !== target.imageDigest ||
        stage.rootfsSha256 !== target.rootfsSha256
      )
        issue(
          "IMAGE_BINDING",
          name,
          "Exact trusted image digest and extracted rootfs SHA required.",
        );
      if (
        stage?.runId !== runId ||
        stage?.extraction?.rawExit !== 0 ||
        !Array.isArray(stage.extraction.errors) ||
        stage.extraction.errors.length
      )
        issue(
          "EXTRACTION",
          name,
          "Same-run extraction must complete without errors.",
        );
      envelope(stage?.syft, runId, target?.rootfsSha256, issue, name + ".syft");
      if (stage?.syft?.rawExit !== 0 || stage?.syft?.stderr !== "")
        issue(
          "SCAN_PROCESS",
          name + ".syft",
          "Syft process must complete without errors/warnings.",
        );
      merge(
        evaluateApkCoverage({
          sbomText: stage?.syft?.text,
          inventory: target?.inventory,
          expectedSource: target?.syftSource,
          expectedDistro: target?.distro,
          lock,
        }),
        name,
      );
      const catalog = parse(stage?.syft?.text, issue, name + ".syft");
      if (
        catalog.source?.type === "image" &&
        catalog.source?.metadata?.manifestDigest !== target?.imageDigest
      )
        issue(
          "IMAGE_BINDING",
          name + ".syft.source",
          "Scanner image manifest differs from the trusted target digest.",
        );
      envelope(
        stage?.grype,
        runId,
        stage?.syft?.sha256,
        issue,
        name + ".grype",
      );
      merge(
        evaluateGrypeReport({
          reportText: stage?.grype?.text,
          rawExit: stage?.grype?.rawExit,
          stderr: stage?.grype?.stderr,
          expectedSource: target?.grypeSource,
          expectedDistro: target?.distro,
          database: evidence.database,
          lock,
        }),
        name,
      );
    }
    const expected = {
      version: lock.postgres.version,
      sourceSha256: lock.postgres.sha256,
      binarySha256: targets.runtime.postgresBinarySha256,
      imageDigest: targets.runtime.imageDigest,
    };
    const source = evidence.source;
    envelope(source?.sbom, runId, expected.binarySha256, issue, "source.sbom");
    merge(
      evaluateSourceCoverage({ sbomText: source?.sbom?.text, expected }),
      "source",
    );
    envelope(source?.grype, runId, source?.sbom?.sha256, issue, "source.grype");
    merge(
      evaluateGrypeReport({
        reportText: source?.grype?.text,
        rawExit: source?.grype?.rawExit,
        stderr: source?.grype?.stderr,
        expectedSource: targets.runtime.sourceGrypeSource,
        database: evidence.database,
        lock,
      }),
      "source",
    );

    merge(
      evaluateApkCanary({
        evidence: evidence.apkCanary,
        expected: trusted.apkCanary,
        runId,
        database: evidence.database,
        lock,
      }),
      "apkCanary",
    );
    const canary = evidence.canary;
    envelope(
      canary?.sbom,
      runId,
      sha256("postgresql-source-canary-17.2"),
      issue,
      "canary.sbom",
    );
    const canaryDoc = parse(canary?.sbom?.text, issue, "canary.sbom");
    if (
      canaryDoc.bomFormat !== "CycloneDX" ||
      canaryDoc.specVersion !== "1.6" ||
      canaryDoc.version !== 1 ||
      canonical(canaryDoc.components) !== canonical([postgresComponent("17.2")])
    )
      issue(
        "CANARY_COVERAGE",
        "canary.sbom",
        "Exact known-vulnerable PostgreSQL 17.2 source required.",
      );
    envelope(canary?.grype, runId, canary?.sbom?.sha256, issue, "canary.grype");
    const canaryResult = evaluateGrypeReport({
      reportText: canary?.grype?.text,
      rawExit: canary?.grype?.rawExit,
      stderr: canary?.grype?.stderr,
      expectedSource: trusted.canaryGrypeSource,
      database: evidence.database,
      lock,
    });
    for (const f of canaryResult.findings.filter(
      (f) => f.code !== "VULNERABILITY_THRESHOLD",
    ))
      issue(f.code, "canary." + f.path, f.detail);
    const r = parse(canary?.grype?.text, issue, "canary.grype");
    if (
      canary?.grype?.rawExit !== 2 ||
      !r.matches?.some(
        (m) =>
          m.vulnerability?.id === "CVE-2025-1094" &&
          ["High", "Critical"].includes(m.vulnerability.severity) &&
          m.artifact?.name === "postgresql" &&
          m.artifact.version === "17.2" &&
          m.artifact.purl === postgresComponent("17.2").purl &&
          m.artifact.cpes?.includes(postgresComponent("17.2").cpe),
      )
    )
      issue(
        "CANARY_DETECTION",
        "canary",
        "CVE-2025-1094 High/Critical source match and raw exit 2 required.",
      );
  });
  return {
    ...result,
    scope: "image-vulnerability-evidence",
    executionAdmission: "NOT_EVALUATED",
    licenseReview: "NOT_EVALUATED",
  };
}
