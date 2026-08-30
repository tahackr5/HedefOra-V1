import { createHash } from "node:crypto";
import path from "node:path";
import { TextDecoder } from "node:util";

export const EXIT_CODES = Object.freeze({
  PASS: 0,
  FINDING: 10,
  CONTRACT: 20,
  INTERNAL: 21,
  ACQUISITION: 22,
});

export const DEFAULT_REQUIRED_LANGUAGES = Object.freeze({
  go: Object.freeze([".go"]),
  "javascript-typescript": Object.freeze([
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".ts",
    ".tsx",
    ".mts",
    ".cts",
  ]),
});

const MAX_DATABASE_AGE_MS = 48 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 10 * 60 * 1000;
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

export class ContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "ContractError";
  }
}

export function parseStrictJson(document, label = "JSON document") {
  let text;
  if (typeof document === "string") {
    text = document;
  } else if (document instanceof Uint8Array) {
    try {
      text = utf8Decoder.decode(document);
    } catch {
      throw new ContractError(`${label} is not valid UTF-8`);
    }
  } else {
    throw new ContractError(`${label} must be a string or UTF-8 byte array`);
  }

  if (text.trim() === "") {
    throw new ContractError(`${label} is empty`);
  }
  return new StrictJsonParser(text, label).parse();
}

export const strictJsonParse = parseStrictJson;

export function canonicalJson(value) {
  const ancestors = new Set();

  function serialize(current) {
    if (current === null) {
      return "null";
    }
    if (typeof current === "string" || typeof current === "boolean") {
      return JSON.stringify(current);
    }
    if (typeof current === "number") {
      if (!Number.isFinite(current)) {
        throw new ContractError(
          "canonical JSON cannot contain a non-finite number",
        );
      }
      return JSON.stringify(current);
    }
    if (Array.isArray(current)) {
      if (ancestors.has(current)) {
        throw new ContractError("canonical JSON cannot contain a cycle");
      }
      ancestors.add(current);
      const result = `[${current.map(serialize).join(",")}]`;
      ancestors.delete(current);
      return result;
    }
    if (isRecord(current)) {
      if (ancestors.has(current)) {
        throw new ContractError("canonical JSON cannot contain a cycle");
      }
      ancestors.add(current);
      const result = `{${Object.keys(current)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${serialize(current[key])}`)
        .join(",")}}`;
      ancestors.delete(current);
      return result;
    }
    throw new ContractError(
      `canonical JSON cannot contain a ${typeof current} value`,
    );
  }

  return serialize(value);
}

export function sha256Hex(value) {
  return digestHex("sha256", value);
}

export function md5Hex(value) {
  return digestHex("md5", value);
}

export function normalizeControlFailure({ kind, message = "" } = {}) {
  const normalizedKind =
    typeof kind === "string" ? kind.trim().toLowerCase() : "";
  if (["acquisition", "network", "download"].includes(normalizedKind)) {
    return result(EXIT_CODES.ACQUISITION, {
      errors: [message || "scanner acquisition or network failure"],
    });
  }
  return result(EXIT_CODES.INTERNAL, {
    errors: [message || "scanner internal, timeout, or control failure"],
  });
}

export function evaluateOsvVulnerabilities({
  document,
  rawExit,
  expectedBySource,
  policy = {},
}) {
  const control = scannerControlResult("OSV vulnerability scanner", rawExit);
  if (control) {
    return control;
  }

  return safelyEvaluate("OSV vulnerability", () => {
    const threshold = vulnerabilityThreshold(policy);
    const parsed = parseStrictJson(document, "OSV vulnerability JSON");
    const inventory = validateInventoryParity(parsed, expectedBySource);
    const findings = [];
    let rawVulnerabilityCount = 0;

    for (const entry of inventory.entries) {
      const { scores, vulnerabilityIds } = validateVulnerabilityGroups(entry);
      rawVulnerabilityCount += vulnerabilityIds.length;

      if (scores.length > 0) {
        const maximumSeverity = Math.max(...scores);
        if (maximumSeverity >= threshold) {
          findings.push({
            type: "vulnerability",
            source: entry.source,
            package: entry.identity,
            scope: entry.identity.scope,
            maximumSeverity,
            vulnerabilityIds: [...vulnerabilityIds].sort((left, right) =>
              left.localeCompare(right),
            ),
          });
        }
      }
    }

    assertRawFindingConsistency(
      "OSV vulnerability scanner",
      scannerRawExitCode(rawExit),
      rawVulnerabilityCount > 0,
    );
    findings.sort(compareFindings);
    const evidence = {
      inventorySha256: inventory.sha256,
      packageCount: inventory.entries.length,
      sourceCount: inventory.sourceCount,
      threshold,
    };
    return findings.length === 0
      ? result(EXIT_CODES.PASS, { evidence })
      : result(EXIT_CODES.FINDING, { evidence, findings });
  });
}

export function evaluateOsvLicenses({
  document,
  rawExit,
  expectedBySource,
  policy = {},
}) {
  const control = scannerControlResult("OSV license scanner", rawExit);
  if (control) {
    return control;
  }

  return safelyEvaluate("OSV license", () => {
    const allowedSpdx = allowedSpdxSet(policy);
    const parsed = parseStrictJson(document, "OSV license JSON");
    const inventory = validateInventoryParity(parsed, expectedBySource);
    const findings = [];
    let rawVulnerabilityCount = 0;

    for (const entry of inventory.entries) {
      rawVulnerabilityCount += rawVulnerabilityIds(entry).length;
      const licenses = licenseArray(entry);
      if (licenses.length === 0) {
        findings.push({
          type: "license",
          source: entry.source,
          package: entry.identity,
          scope: entry.identity.scope,
          license: "UNKNOWN",
          reason: "license array is empty",
        });
        continue;
      }

      for (const [index, license] of licenses.entries()) {
        const normalized = requiredNonemptyString(
          license,
          `${entry.label}.licenses[${index}]`,
        );
        if (normalized !== license) {
          throw new ContractError(
            `${entry.label}.licenses[${index}] has surrounding whitespace`,
          );
        }
        const isUnknown = ["UNKNOWN", "NOASSERTION", "NONE"].includes(
          normalized.toUpperCase(),
        );
        if (isUnknown || !allowedSpdx.has(normalized)) {
          findings.push({
            type: "license",
            source: entry.source,
            package: entry.identity,
            scope: entry.identity.scope,
            license: normalized,
            reason: isUnknown
              ? "license is unknown"
              : "license is not explicitly allowed",
          });
        }
      }
    }

    assertRawFindingConsistency(
      "OSV license scanner",
      scannerRawExitCode(rawExit),
      rawVulnerabilityCount > 0 || findings.length > 0,
    );
    findings.sort(compareFindings);
    const evidence = {
      allowedSpdxSha256: sha256Hex(
        canonicalJson(
          [...allowedSpdx].sort((left, right) => left.localeCompare(right)),
        ),
      ),
      inventorySha256: inventory.sha256,
      packageCount: inventory.entries.length,
      sourceCount: inventory.sourceCount,
    };
    return findings.length === 0
      ? result(EXIT_CODES.PASS, { evidence })
      : result(EXIT_CODES.FINDING, { evidence, findings });
  });
}

export function validateDatabaseIdentity(metadata, policy = {}, now) {
  let errorEvidence = {};
  return safelyEvaluate(
    "advisory database identity",
    () => {
      requireRecord(metadata, "database metadata");
      requireRecord(policy, "database policy");
      if (policy.requireSha256Evidence !== true) {
        throw new ContractError(
          "database policy must explicitly require local SHA-256 evidence",
        );
      }
      const requiredEcosystems = databaseEcosystems(policy);
      const ecosystem = requiredNonemptyString(
        metadata.ecosystem,
        "database metadata.ecosystem",
      );
      if (!requiredEcosystems.has(ecosystem)) {
        throw new ContractError(
          `database ecosystem ${JSON.stringify(ecosystem)} is not required by policy`,
        );
      }

      const file = requiredNonemptyString(
        metadata.file,
        "database metadata.file",
      );
      const sha256 = digestField(metadata.sha256, "sha256", 64);
      const md5 = digestField(metadata.md5, "md5", 32);
      const contentLength = positiveInteger(
        metadata.contentLength,
        "database metadata.contentLength",
      );
      const headers = normalizeHeaders(metadata.headers);
      const rawHeaders = Object.fromEntries(
        [...headers].sort(([left], [right]) => left.localeCompare(right)),
      );
      errorEvidence = { headers: rawHeaders };
      const headerMd5 = gcsMd5Header(headers);
      const headerLength = decimalHeader(
        requiredHeader(
          headers,
          ["contentlength", "content-length"],
          "content-length",
        ),
        "database content-length header",
      );
      if (Buffer.from(md5, "hex").toString("base64") !== headerMd5) {
        throw new ContractError("database MD5 does not match its header");
      }
      if (contentLength !== headerLength) {
        throw new ContractError(
          "database content length does not match its header",
        );
      }

      const lastModifiedText = requiredHeader(
        headers,
        ["lastmodified", "last-modified"],
        "last-modified",
      );
      const generation = requiredHeader(
        headers,
        ["generation", "x-generation", "x-goog-generation"],
        "generation",
      );
      const etag = requiredHeader(headers, ["etag"], "etag");
      const lastModified = Date.parse(lastModifiedText);
      if (!Number.isFinite(lastModified)) {
        throw new ContractError("database last-modified header is not a date");
      }

      const nowMs = dateMilliseconds(now, "database validation time");
      const maxAgeMs = boundedDuration(
        policy.maxAgeMs,
        MAX_DATABASE_AGE_MS,
        "database policy.maxAgeMs",
      );
      const maxFutureSkewMs = boundedDuration(
        policy.maxFutureSkewMs,
        MAX_FUTURE_SKEW_MS,
        "database policy.maxFutureSkewMs",
      );
      if (lastModified < nowMs - maxAgeMs) {
        throw new ContractError("database last-modified header is stale");
      }
      if (lastModified > nowMs + maxFutureSkewMs) {
        throw new ContractError(
          "database last-modified header exceeds allowed future skew",
        );
      }

      validatePinnedDatabaseIdentity(
        { contentLength, etag, generation, md5, sha256 },
        policy,
      );

      const identity = {
        contentLength,
        ecosystem,
        etag,
        file,
        generation,
        lastModified: new Date(lastModified).toISOString(),
        md5,
        sha256,
      };
      return result(EXIT_CODES.PASS, {
        evidence: {
          headers: rawHeaders,
          identity,
          identitySha256: sha256Hex(canonicalJson(identity)),
        },
      });
    },
    () => errorEvidence,
  );
}

export function evaluateSemgrep({ document, rawExit, requiredLanguages }) {
  const control = scannerControlResult("Semgrep", rawExit);
  if (control) {
    return control;
  }

  return safelyEvaluate("Semgrep", () => {
    const parsed = parseStrictJson(document, "Semgrep JSON");
    requireRecord(parsed, "Semgrep JSON root");
    const errors = requiredArray(parsed.errors, "Semgrep JSON.errors");
    if (errors.length !== 0) {
      throw new ContractError("Semgrep JSON.errors must be empty");
    }
    const findings = requiredArray(parsed.results, "Semgrep JSON.results");
    requireRecord(parsed.paths, "Semgrep JSON.paths");
    const scanned = requiredArray(
      parsed.paths.scanned,
      "Semgrep JSON.paths.scanned",
    ).map((scannedPath, index) =>
      requiredNonemptyString(
        scannedPath,
        `Semgrep JSON.paths.scanned[${index}]`,
      ),
    );
    if (scanned.length === 0) {
      throw new ContractError("Semgrep scanned path inventory is empty");
    }

    const languages = languagePolicy(requiredLanguages);
    const coverage = Object.create(null);
    for (const [language, extensions] of languages) {
      const count = scanned.filter((scannedPath) =>
        extensions.has(path.extname(scannedPath).toLowerCase()),
      ).length;
      if (count === 0) {
        throw new ContractError(
          `Semgrep scanned path inventory has zero ${language} coverage`,
        );
      }
      coverage[language] = count;
    }

    const normalizedFindings = findings.map((finding, index) => {
      requireRecord(finding, `Semgrep JSON.results[${index}]`);
      return {
        type: "sast",
        checkId: requiredNonemptyString(
          finding.check_id,
          `Semgrep JSON.results[${index}].check_id`,
        ),
        path: requiredNonemptyString(
          finding.path,
          `Semgrep JSON.results[${index}].path`,
        ),
      };
    });
    normalizedFindings.sort(compareFindings);

    if (rawExit === 0 && normalizedFindings.length !== 0) {
      throw new ContractError(
        "Semgrep exit 0 is inconsistent with nonempty findings",
      );
    }
    if (rawExit === 1 && normalizedFindings.length === 0) {
      throw new ContractError(
        "Semgrep exit 1 is inconsistent with empty findings",
      );
    }

    const evidence = {
      coverage,
      scannedPathCount: scanned.length,
      scannedPathsSha256: sha256Hex(
        canonicalJson(
          [...scanned].sort((left, right) => left.localeCompare(right)),
        ),
      ),
    };
    return normalizedFindings.length === 0
      ? result(EXIT_CODES.PASS, { evidence })
      : result(EXIT_CODES.FINDING, {
          evidence,
          findings: normalizedFindings,
        });
  });
}

function safelyEvaluate(label, evaluator, errorEvidence = () => ({})) {
  try {
    return evaluator();
  } catch (error) {
    const evidence = errorEvidence();
    if (error instanceof ContractError) {
      return result(EXIT_CODES.CONTRACT, {
        errors: [error.message],
        evidence,
      });
    }
    return result(EXIT_CODES.INTERNAL, {
      errors: [`${label} evaluator internal failure`],
      evidence,
    });
  }
}

function scannerControlResult(scanner, rawExit) {
  if (isRecord(rawExit)) {
    if (
      rawExit.acquisition === true ||
      rawExit.network === true ||
      rawExit.download === true
    ) {
      return normalizeControlFailure({
        kind: "acquisition",
        message: `${scanner} acquisition or network failure`,
      });
    }
    if (rawExit.timedOut === true || rawExit.timeout === true) {
      return normalizeControlFailure({
        kind: "timeout",
        message: `${scanner} timed out`,
      });
    }
    rawExit = rawExit.code;
  }
  if (!Number.isInteger(rawExit)) {
    return normalizeControlFailure({
      kind: "internal",
      message: `${scanner} exit code is missing or invalid`,
    });
  }
  if (rawExit === 0 || rawExit === 1) {
    return null;
  }
  return normalizeControlFailure({
    kind: "internal",
    message: `${scanner} control failure at raw exit ${rawExit}`,
  });
}

function validateInventoryParity(document, expectedBySource) {
  requireRecord(document, "OSV JSON root");
  const results = requiredArray(document.results, "OSV JSON.results");
  const expected = expectedInventory(expectedBySource);
  const actual = new Map();
  const entries = [];

  for (const [resultIndex, scanResult] of results.entries()) {
    requireRecord(scanResult, `OSV JSON.results[${resultIndex}]`);
    requireRecord(scanResult.source, `OSV JSON.results[${resultIndex}].source`);
    const source = sourcePath(
      scanResult.source.path,
      `OSV JSON.results[${resultIndex}].source.path`,
    );
    if (actual.has(source)) {
      throw new ContractError(`OSV JSON contains duplicate source ${source}`);
    }
    const packages = requiredArray(
      scanResult.packages,
      `OSV JSON.results[${resultIndex}].packages`,
    );
    const sourceEntries = packages.map((item, packageIndex) => {
      const label = `OSV JSON.results[${resultIndex}].packages[${packageIndex}]`;
      requireRecord(item, label);
      requireRecord(item.package, `${label}.package`);
      const identity = packageIdentity(item, label);
      const entry = { identity, item, label, source };
      entries.push(entry);
      return entry;
    });
    actual.set(source, sourceEntries);
  }

  const parityErrors = [];
  for (const source of new Set([...actual.keys(), ...expected.keys()])) {
    if (!expected.has(source)) {
      parityErrors.push(`unexpected scanned source: ${source}`);
      continue;
    }
    if (!actual.has(source)) {
      parityErrors.push(`expected scanned source is absent: ${source}`);
      continue;
    }
    compareMultisets(
      actual.get(source).map(({ identity }) => identity),
      expected.get(source),
      source,
      parityErrors,
    );
  }
  if (parityErrors.length !== 0) {
    parityErrors.sort((left, right) => left.localeCompare(right));
    throw new ContractError(
      `OSV inventory parity failed: ${parityErrors.join("; ")}`,
    );
  }

  const inventoryDocument = [...actual]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([source, sourceEntries]) => ({
      packages: sourceEntries
        .map(({ identity }) => identity)
        .sort((left, right) =>
          packageIdentityKey(left).localeCompare(packageIdentityKey(right)),
        ),
      source,
    }));
  return {
    entries,
    sha256: sha256Hex(canonicalJson(inventoryDocument)),
    sourceCount: actual.size,
  };
}

function expectedInventory(expectedBySource) {
  let rawEntries;
  if (expectedBySource instanceof Map) {
    rawEntries = [...expectedBySource.entries()];
  } else if (isRecord(expectedBySource)) {
    rawEntries = Object.entries(expectedBySource);
  } else {
    throw new ContractError(
      "expectedBySource must be a Map or source-keyed object",
    );
  }
  if (rawEntries.length === 0) {
    throw new ContractError("expectedBySource must list at least one source");
  }

  const expected = new Map();
  for (const [rawSource, packages] of rawEntries) {
    const source = sourcePath(rawSource, "expected inventory source");
    if (expected.has(source)) {
      throw new ContractError(`duplicate expected inventory source: ${source}`);
    }
    requiredArray(packages, `expectedBySource[${JSON.stringify(source)}]`);
    expected.set(
      source,
      packages.map((entry, index) => {
        requireRecord(
          entry,
          `expectedBySource[${JSON.stringify(source)}][${index}]`,
        );
        const label = `expectedBySource[${JSON.stringify(source)}][${index}]`;
        return packageIdentity({ package: entry, scope: entry.scope }, label);
      }),
    );
  }
  return expected;
}

function packageIdentity(item, label) {
  const packageDocument = item.package;
  const packageScope = packageDocument.scope;
  const itemScope = item.scope;
  if (
    packageScope !== undefined &&
    itemScope !== undefined &&
    packageScope !== itemScope
  ) {
    throw new ContractError(`${label} contains conflicting scope values`);
  }
  const rawScope = packageScope ?? itemScope ?? "unknown";
  const scope = requiredNonemptyString(rawScope, `${label}.scope`);
  if (scope !== rawScope) {
    throw new ContractError(`${label}.scope has surrounding whitespace`);
  }
  if (
    !["production", "development", "optional", "peer", "unknown"].includes(
      scope,
    )
  ) {
    throw new ContractError(`${label}.scope is unsupported: ${scope}`);
  }
  return {
    ecosystem: requiredNonemptyString(
      packageDocument.ecosystem,
      `${label}.package.ecosystem`,
    ),
    name: requiredNonemptyString(packageDocument.name, `${label}.package.name`),
    scope,
    version: requiredNonemptyString(
      packageDocument.version,
      `${label}.package.version`,
    ),
  };
}

function compareMultisets(actual, expected, source, errors) {
  const actualCounts = multiset(actual);
  const expectedCounts = multiset(expected);
  for (const key of new Set([
    ...actualCounts.keys(),
    ...expectedCounts.keys(),
  ])) {
    const actualCount = actualCounts.get(key) ?? 0;
    const expectedCount = expectedCounts.get(key) ?? 0;
    if (actualCount !== expectedCount) {
      errors.push(
        `${source}: package ${key} count ${actualCount} differs from expected ${expectedCount}`,
      );
    }
  }
}

function multiset(identities) {
  const counts = new Map();
  for (const identity of identities) {
    const key = packageIdentityKey(identity);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function packageIdentityKey(identity) {
  return `${identity.ecosystem}:${identity.name}@${identity.version}#${identity.scope}`;
}

function validateVulnerabilityGroups(entry) {
  const vulnerabilityIds = rawVulnerabilityIds(entry);
  const groups = optionalArray(entry.item.groups, `${entry.label}.groups`);
  const vulnerabilityIdSet = new Set(vulnerabilityIds);
  const mappedIds = new Set();
  const scores = [];

  for (const [groupIndex, group] of groups.entries()) {
    const groupLabel = `${entry.label}.groups[${groupIndex}]`;
    requireRecord(group, groupLabel);
    const ids = requiredArray(group.ids, `${groupLabel}.ids`);
    if (ids.length === 0) {
      throw new ContractError(`${groupLabel}.ids must be nonempty`);
    }

    scores.push(
      numericSeverity(group.max_severity, `${groupLabel}.max_severity`),
    );
    for (const [idIndex, rawId] of ids.entries()) {
      const label = `${groupLabel}.ids[${idIndex}]`;
      const id = canonicalVulnerabilityId(rawId, label);
      if (!vulnerabilityIdSet.has(id)) {
        throw new ContractError(
          `${label} references unknown vulnerability ID ${JSON.stringify(id)}`,
        );
      }
      if (mappedIds.has(id)) {
        throw new ContractError(
          `vulnerability ID ${JSON.stringify(id)} is mapped more than once across groups[].ids`,
        );
      }
      mappedIds.add(id);
    }
  }

  const unmappedIds = vulnerabilityIds.filter((id) => !mappedIds.has(id));
  if (unmappedIds.length !== 0) {
    throw new ContractError(
      `vulnerability IDs have no mapped severity group: ${unmappedIds
        .sort((left, right) => left.localeCompare(right))
        .map((id) => JSON.stringify(id))
        .join(", ")}`,
    );
  }

  return { scores, vulnerabilityIds };
}

function rawVulnerabilityIds(entry) {
  const vulnerabilities = optionalArray(
    entry.item.vulnerabilities,
    `${entry.label}.vulnerabilities`,
  );
  const ids = [];
  const uniqueIds = new Set();
  for (const [index, vulnerability] of vulnerabilities.entries()) {
    const label = `${entry.label}.vulnerabilities[${index}]`;
    requireRecord(vulnerability, label);
    const id = canonicalVulnerabilityId(vulnerability.id, `${label}.id`);
    if (uniqueIds.has(id)) {
      throw new ContractError(
        `${entry.label}.vulnerabilities contains duplicate ID ${JSON.stringify(id)}`,
      );
    }
    uniqueIds.add(id);
    ids.push(id);
  }
  return ids;
}

function canonicalVulnerabilityId(value, label) {
  const id = requiredNonemptyString(value, label);
  if (id !== value) {
    throw new ContractError(`${label} has surrounding whitespace`);
  }
  return id;
}

function assertRawFindingConsistency(scanner, rawExit, hasRawFinding) {
  if (rawExit === 0 && hasRawFinding) {
    throw new ContractError(
      `${scanner} exit 0 is inconsistent with raw findings`,
    );
  }
  if (rawExit === 1 && !hasRawFinding) {
    throw new ContractError(
      `${scanner} exit 1 is inconsistent with empty raw findings`,
    );
  }
}

function scannerRawExitCode(rawExit) {
  return isRecord(rawExit) ? rawExit.code : rawExit;
}

function vulnerabilityThreshold(policy) {
  requireRecord(policy, "vulnerability policy");
  const threshold =
    policy.blockAtOrAbove ??
    policy.blockAtSeverity ??
    policy.severityThreshold ??
    7;
  if (
    typeof threshold !== "number" ||
    !Number.isFinite(threshold) ||
    threshold <= 0 ||
    threshold > 7
  ) {
    throw new ContractError(
      "vulnerability policy threshold must be numeric, positive, and no greater than 7.0",
    );
  }
  return threshold;
}

function numericSeverity(value, label) {
  let score;
  if (typeof value === "number") {
    score = value;
  } else if (typeof value === "string") {
    if (!/^(?:0(?:\.\d+)?|[1-9](?:\.\d+)?|10(?:\.0+)?)$/.test(value)) {
      throw new ContractError(
        `${label} must be a canonical decimal CVSS severity from 0 to 10`,
      );
    }
    score = Number(value);
  } else {
    throw new ContractError(
      `${label} must be a numeric CVSS severity from 0 to 10`,
    );
  }
  if (!Number.isFinite(score) || score < 0 || score > 10) {
    throw new ContractError(
      `${label} must be a numeric CVSS severity from 0 to 10`,
    );
  }
  return score;
}

function allowedSpdxSet(policy) {
  requireRecord(policy, "license policy");
  const rawAllowed = policy.allowedSpdx;
  const entries = rawAllowed instanceof Set ? [...rawAllowed] : rawAllowed;
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new ContractError(
      "license policy.allowedSpdx must be a nonempty explicit list",
    );
  }
  const allowed = new Set();
  for (const [index, entry] of entries.entries()) {
    const license = requiredNonemptyString(
      entry,
      `license policy.allowedSpdx[${index}]`,
    );
    if (license !== entry) {
      throw new ContractError(
        `license policy.allowedSpdx[${index}] has surrounding whitespace`,
      );
    }
    if (allowed.has(license)) {
      throw new ContractError(`duplicate allowed SPDX identifier: ${license}`);
    }
    if (["UNKNOWN", "NOASSERTION", "NONE"].includes(license.toUpperCase())) {
      throw new ContractError(`unknown license cannot be allowed: ${license}`);
    }
    allowed.add(license);
  }
  return allowed;
}

function licenseArray(entry) {
  const outer = entry.item.licenses;
  const nested = entry.item.package.licenses;
  if (outer !== undefined && nested !== undefined) {
    if (canonicalJson(outer) !== canonicalJson(nested)) {
      throw new ContractError(
        `${entry.label} contains conflicting license arrays`,
      );
    }
  }
  const licenses = outer ?? nested;
  if (licenses === undefined) {
    throw new ContractError(`${entry.label}.licenses is missing`);
  }
  return requiredArray(licenses, `${entry.label}.licenses`);
}

function databaseEcosystems(policy) {
  const raw =
    policy.requiredEcosystems ??
    (policy.requiredEcosystem !== undefined
      ? [policy.requiredEcosystem]
      : policy.ecosystem !== undefined
        ? [policy.ecosystem]
        : undefined);
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ContractError(
      "database policy must declare at least one required ecosystem",
    );
  }
  const ecosystems = new Set();
  for (const [index, ecosystem] of raw.entries()) {
    const normalized = requiredNonemptyString(
      ecosystem,
      `database policy.requiredEcosystems[${index}]`,
    );
    if (ecosystems.has(normalized)) {
      throw new ContractError(`duplicate required ecosystem: ${normalized}`);
    }
    ecosystems.add(normalized);
  }
  return ecosystems;
}

function normalizeHeaders(rawHeaders) {
  const entries =
    rawHeaders && typeof rawHeaders.entries === "function"
      ? [...rawHeaders.entries()]
      : isRecord(rawHeaders)
        ? Object.entries(rawHeaders)
        : null;
  if (!entries) {
    throw new ContractError("database metadata.headers must be an object");
  }
  const headers = new Map();
  for (const [rawName, rawValue] of entries) {
    const name = requiredNonemptyString(
      rawName,
      "database header name",
    ).toLowerCase();
    const value = requiredNonemptyString(rawValue, `database header ${name}`);
    if (headers.has(name) && headers.get(name) !== value) {
      throw new ContractError(`database header ${name} has conflicting values`);
    }
    headers.set(name, value);
  }
  return headers;
}

function gcsMd5Header(headers) {
  const rawHash = requiredHeader(headers, ["x-goog-hash"], "x-goog-hash");
  const values = new Map();
  for (const part of rawHash.split(",")) {
    const separator = part.indexOf("=");
    if (separator <= 0) {
      throw new ContractError("database x-goog-hash header is malformed");
    }
    const algorithm = part.slice(0, separator).trim().toLowerCase();
    const value = part.slice(separator + 1).trim();
    if (algorithm === "" || value === "") {
      throw new ContractError("database x-goog-hash header is malformed");
    }
    if (values.has(algorithm)) {
      throw new ContractError(
        `database x-goog-hash contains duplicate ${algorithm} evidence`,
      );
    }
    values.set(algorithm, value);
  }
  const md5 = values.get("md5");
  if (md5 === undefined) {
    throw new ContractError("database x-goog-hash MD5 evidence is missing");
  }
  const decoded = Buffer.from(md5, "base64");
  if (decoded.length !== 16 || decoded.toString("base64") !== md5) {
    throw new ContractError(
      "database x-goog-hash MD5 evidence is not canonical base64",
    );
  }
  return md5;
}

function requiredHeader(headers, aliases, label) {
  const values = [];
  for (const alias of aliases) {
    if (headers.has(alias)) {
      values.push(headers.get(alias));
    }
  }
  if (values.length === 0) {
    throw new ContractError(`database ${label} header is missing`);
  }
  const normalized = values.map((value) =>
    requiredNonemptyString(value, `database ${label} header`),
  );
  if (new Set(normalized).size !== 1) {
    throw new ContractError(`database ${label} headers conflict`);
  }
  return normalized[0];
}

function digestField(value, label, length) {
  const digest = requiredNonemptyString(value, label);
  if (!new RegExp(`^[0-9a-fA-F]{${length}}$`).test(digest)) {
    throw new ContractError(
      `${label} must be ${length} hexadecimal characters`,
    );
  }
  return digest.toLowerCase();
}

function decimalHeader(value, label) {
  if (!/^\d+$/.test(value)) {
    throw new ContractError(`${label} must be a decimal integer`);
  }
  return positiveInteger(Number(value), label);
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ContractError(`${label} must be a positive safe integer`);
  }
  return value;
}

function boundedDuration(value, maximum, label) {
  if (value === undefined) {
    return maximum;
  }
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new ContractError(
      `${label} must be an integer from 0 through ${maximum}`,
    );
  }
  return value;
}

function dateMilliseconds(value, label) {
  const milliseconds =
    value instanceof Date
      ? value.getTime()
      : typeof value === "number"
        ? value
        : typeof value === "string"
          ? Date.parse(value)
          : Number.NaN;
  if (!Number.isFinite(milliseconds)) {
    throw new ContractError(`${label} must be a valid explicit date or epoch`);
  }
  return milliseconds;
}

function validatePinnedDatabaseIdentity(identity, policy) {
  const comparisons = [
    ["expectedSha256", "sha256", "SHA-256"],
    ["expectedMd5", "md5", "MD5"],
    ["expectedContentLength", "contentLength", "content length"],
    ["expectedGeneration", "generation", "generation"],
    ["expectedEtag", "etag", "etag"],
  ];
  for (const [policyKey, identityKey, label] of comparisons) {
    if (
      policy[policyKey] !== undefined &&
      policy[policyKey] !== identity[identityKey]
    ) {
      throw new ContractError(`database ${label} differs from pinned policy`);
    }
  }
}

function languagePolicy(requiredLanguages) {
  const combined = new Map();
  const entries = Array.isArray(requiredLanguages)
    ? requiredLanguages.map((language) => [language, null])
    : isRecord(requiredLanguages)
      ? Object.entries(requiredLanguages)
      : null;
  if (!entries || entries.length === 0) {
    throw new ContractError(
      "requiredLanguages must be a nonempty array or object",
    );
  }

  for (const [rawLanguage, rawExtensions] of entries) {
    const language = canonicalLanguage(rawLanguage);
    let extensions;
    if (rawExtensions === null) {
      extensions = DEFAULT_REQUIRED_LANGUAGES[language];
    } else if (Array.isArray(rawExtensions)) {
      extensions = rawExtensions;
    } else if (
      isRecord(rawExtensions) &&
      Array.isArray(rawExtensions.extensions)
    ) {
      extensions = rawExtensions.extensions;
    } else {
      throw new ContractError(
        `requiredLanguages.${rawLanguage} must contain an extension array`,
      );
    }
    if (!extensions || extensions.length === 0) {
      throw new ContractError(
        `requiredLanguages.${rawLanguage} has no tracked extensions`,
      );
    }
    const current = combined.get(language) ?? new Set();
    for (const [index, extension] of extensions.entries()) {
      const normalized = requiredNonemptyString(
        extension,
        `requiredLanguages.${rawLanguage}[${index}]`,
      ).toLowerCase();
      if (!/^\.[a-z0-9]+$/.test(normalized)) {
        throw new ContractError(
          `requiredLanguages.${rawLanguage}[${index}] is not a file extension`,
        );
      }
      current.add(normalized);
    }
    combined.set(language, current);
  }

  for (const required of ["go", "javascript-typescript"]) {
    if (!combined.has(required)) {
      throw new ContractError(
        `requiredLanguages must include positive ${required} coverage`,
      );
    }
  }
  return [...combined].sort(([left], [right]) => left.localeCompare(right));
}

function canonicalLanguage(value) {
  const language = requiredNonemptyString(
    value,
    "required language",
  ).toLowerCase();
  if (language === "go" || language === "golang") {
    return "go";
  }
  if (
    [
      "javascript-typescript",
      "javascript",
      "typescript",
      "js",
      "ts",
      "js/ts",
    ].includes(language)
  ) {
    return "javascript-typescript";
  }
  throw new ContractError(`unsupported required language: ${language}`);
}

function sourcePath(value, label) {
  const source = requiredNonemptyString(value, label);
  if (source.includes("\0")) {
    throw new ContractError(`${label} contains a NUL byte`);
  }
  return source;
}

function requiredArray(value, label) {
  if (!Array.isArray(value)) {
    throw new ContractError(`${label} must be an array`);
  }
  return value;
}

function optionalArray(value, label) {
  return value === undefined ? [] : requiredArray(value, label);
}

function requireRecord(value, label) {
  if (!isRecord(value)) {
    throw new ContractError(`${label} must be an object`);
  }
  return value;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredNonemptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ContractError(`${label} must be a nonempty string`);
  }
  return value.trim();
}

function compareFindings(left, right) {
  return canonicalJson(left).localeCompare(canonicalJson(right));
}

function digestHex(algorithm, value) {
  let input;
  if (typeof value === "string" || value instanceof Uint8Array) {
    input = value;
  } else {
    input = canonicalJson(value);
  }
  return createHash(algorithm).update(input).digest("hex");
}

function result(exitCode, { findings = [], errors = [], evidence = {} } = {}) {
  const statuses = {
    [EXIT_CODES.PASS]: "PASS",
    [EXIT_CODES.FINDING]: "FINDING",
    [EXIT_CODES.CONTRACT]: "CONTRACT_ERROR",
    [EXIT_CODES.INTERNAL]: "INTERNAL_ERROR",
    [EXIT_CODES.ACQUISITION]: "ACQUISITION_ERROR",
  };
  return {
    code: exitCode,
    errors,
    evidence,
    exitCode,
    findings,
    status: statuses[exitCode],
  };
}

class StrictJsonParser {
  constructor(text, label) {
    this.text = text;
    this.label = label;
    this.index = 0;
  }

  parse() {
    this.skipWhitespace();
    const value = this.parseValue();
    this.skipWhitespace();
    if (this.index !== this.text.length) {
      this.fail("contains trailing data");
    }
    return value;
  }

  parseValue() {
    const character = this.text[this.index];
    if (character === "{") return this.parseObject();
    if (character === "[") return this.parseArray();
    if (character === '"') return this.parseString();
    if (character === "t") return this.parseLiteral("true", true);
    if (character === "f") return this.parseLiteral("false", false);
    if (character === "n") return this.parseLiteral("null", null);
    if (character === "-" || /[0-9]/.test(character ?? "")) {
      return this.parseNumber();
    }
    this.fail("contains an unexpected token");
  }

  parseObject() {
    this.index++;
    this.skipWhitespace();
    const value = Object.create(null);
    const keys = new Set();
    if (this.text[this.index] === "}") {
      this.index++;
      return value;
    }
    while (this.index < this.text.length) {
      if (this.text[this.index] !== '"') {
        this.fail("contains an object key that is not a string");
      }
      const key = this.parseString();
      if (keys.has(key)) {
        this.fail(`contains duplicate object key ${JSON.stringify(key)}`);
      }
      keys.add(key);
      this.skipWhitespace();
      if (this.text[this.index] !== ":") {
        this.fail("contains an object key without a colon");
      }
      this.index++;
      this.skipWhitespace();
      value[key] = this.parseValue();
      this.skipWhitespace();
      if (this.text[this.index] === "}") {
        this.index++;
        return value;
      }
      if (this.text[this.index] !== ",") {
        this.fail("contains an unterminated object");
      }
      this.index++;
      this.skipWhitespace();
    }
    this.fail("contains an unterminated object");
  }

  parseArray() {
    this.index++;
    this.skipWhitespace();
    const value = [];
    if (this.text[this.index] === "]") {
      this.index++;
      return value;
    }
    while (this.index < this.text.length) {
      value.push(this.parseValue());
      this.skipWhitespace();
      if (this.text[this.index] === "]") {
        this.index++;
        return value;
      }
      if (this.text[this.index] !== ",") {
        this.fail("contains an unterminated array");
      }
      this.index++;
      this.skipWhitespace();
    }
    this.fail("contains an unterminated array");
  }

  parseString() {
    const start = this.index;
    this.index++;
    while (this.index < this.text.length) {
      const character = this.text[this.index];
      if (character === '"') {
        this.index++;
        try {
          return JSON.parse(this.text.slice(start, this.index));
        } catch {
          this.fail("contains an invalid string");
        }
      }
      if (character.charCodeAt(0) < 0x20) {
        this.fail("contains an unescaped control character");
      }
      if (character === "\\") {
        this.index++;
        const escaped = this.text[this.index];
        if ('"\\/bfnrt'.includes(escaped ?? "")) {
          this.index++;
          continue;
        }
        if (escaped === "u") {
          const code = this.text.slice(this.index + 1, this.index + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(code)) {
            this.fail("contains an invalid Unicode escape");
          }
          this.index += 5;
          continue;
        }
        this.fail("contains an invalid string escape");
      }
      this.index++;
    }
    this.fail("contains an unterminated string");
  }

  parseNumber() {
    const match = this.text
      .slice(this.index)
      .match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!match) {
      this.fail("contains an invalid number");
    }
    this.index += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) {
      this.fail("contains a non-finite number");
    }
    return value;
  }

  parseLiteral(literal, value) {
    if (this.text.slice(this.index, this.index + literal.length) !== literal) {
      this.fail("contains an invalid literal");
    }
    this.index += literal.length;
    return value;
  }

  skipWhitespace() {
    while (
      this.index < this.text.length &&
      /[\u0009\u000a\u000d\u0020]/.test(this.text[this.index])
    ) {
      this.index++;
    }
  }

  fail(message) {
    throw new ContractError(`${this.label} ${message} at offset ${this.index}`);
  }
}
