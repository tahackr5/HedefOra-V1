// DEC-031 is a finite test-risk acceptance, never a production image admission.
import { createHash } from "node:crypto";
import { open, lstat, realpath } from "node:fs/promises";
import { dirname, basename, resolve } from "node:path";
import {
  hash,
  strict,
  readSealed,
  assertClosedDirectory,
} from "../../../../scripts/postgres-image/apk-runtime/sealed-io.mjs";
import { deterministicTar } from "../../../../scripts/postgres-image/apk-runtime/archive-data.mjs";
import { requireLive } from "./process.mjs";
import { FIXTURE_IMAGE, validateFixtureRun } from "./fixture-container.mjs";

export const FIXTURE_APPROVAL_SHA256 =
  "18cc09d312ae47637ec4290e60af88d712f06f05433cc3670e2d867738a829f6";
const records = new WeakMap();
const canonical = (value) =>
  JSON.stringify(value, (_, x) =>
    x && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(
          Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : x,
  );
export function blockingMatchSeal(report) {
  requireLive(
    Array.isArray(report?.matches) && report.matches.length <= 10000,
    "FIXTURE_SCAN_MATCHES",
  );
  const matches = report.matches.filter((match) => {
    requireLive(
      match?.vulnerability && Array.isArray(match.relatedVulnerabilities),
      "FIXTURE_SCAN_MATCH",
    );
    return [match.vulnerability, ...match.relatedVulnerabilities].some((v) => {
      requireLive(
        typeof v?.severity === "string" && (!v.cvss || Array.isArray(v.cvss)),
        "FIXTURE_SCAN_SEVERITY",
      );
      for (const cvss of v.cvss || [])
        requireLive(
          Number.isFinite(cvss?.metrics?.baseScore) &&
            cvss.metrics.baseScore >= 0 &&
            cvss.metrics.baseScore <= 10,
          "FIXTURE_SCAN_CVSS",
        );
      return (
        !["Negligible", "Low", "Medium"].includes(v.severity) ||
        v.cvss?.some((c) => c.metrics.baseScore >= 7)
      );
    });
  });
  return {
    matches: report.matches.length,
    blockingMatches: matches.length,
    blockingMultisetSha256: hash(canonical(matches.map(canonical).sort())),
  };
}
export function validateFixtureApproval(bytes, now = Date.now()) {
  requireLive(
    hash(bytes) === FIXTURE_APPROVAL_SHA256,
    "FIXTURE_APPROVAL_BYTES",
  );
  const value = strict(bytes, "FIXTURE_APPROVAL", 32768);
  requireLive(
    Number.isFinite(now) &&
      now >= Date.parse(value.approvalDate) &&
      now < Date.parse(value.expiresAt) &&
      now - Date.parse(value.vulnerabilities.databaseBuilt) <=
        value.vulnerabilities.databaseMaxAgeMs,
    "FIXTURE_APPROVAL_EXPIRED",
  );
  requireLive(
    value.productionAdmission === false &&
      value.vexNotAffectedClaim === false &&
      value.image.manifest === FIXTURE_IMAGE.manifest &&
      value.image.config === FIXTURE_IMAGE.config,
    "FIXTURE_APPROVAL_SCOPE",
  );
  return value;
}

// Stream the 2GiB hydrated database through one retained FD; never trust a PASS string.
async function hashDatabase(path, expected) {
  const target = resolve(path);
  requireLive(
    (await realpath(target)) === target &&
      !(await lstat(target)).isSymbolicLink(),
    "FIXTURE_DB_PATH",
  );
  const file = await open(target, "r");
  try {
    const before = await file.stat({ bigint: true });
    requireLive(
      before.isFile() &&
        before.nlink === 1n &&
        before.size > 0n &&
        before.size <= 3221225472n,
      "FIXTURE_DB_BOUND",
    );
    const digest = createHash("sha256"),
      buffer = Buffer.alloc(1048576);
    let offset = 0;
    while (offset < Number(before.size)) {
      const { bytesRead } = await file.read(
        buffer,
        0,
        Math.min(buffer.length, Number(before.size) - offset),
        offset,
      );
      requireLive(bytesRead > 0, "FIXTURE_DB_TRUNCATED");
      digest.update(buffer.subarray(0, bytesRead));
      offset += bytesRead;
    }
    const extra = await file.read(buffer, 0, 1, offset),
      after = await file.stat({ bigint: true });
    requireLive(
      extra.bytesRead === 0 &&
        ["dev", "ino", "nlink", "size", "mtimeNs", "ctimeNs"].every(
          (k) => before[k] === after[k],
        ) &&
        digest.digest("hex") === expected,
      "FIXTURE_DB_HASH",
    );
  } finally {
    await file.close();
  }
}

export async function admitFixture({
  repository,
  evidenceDirectory,
  licenseInventoryPath,
  now = Date.now(),
}) {
  const approvalBytes = await readSealed(
    repository,
    "security/postgres-test-fixture-admission.json",
    { sha256: FIXTURE_APPROVAL_SHA256 },
    32768,
  );
  const approval = validateFixtureApproval(approvalBytes, now),
    evidence = new Map();
  for (const entry of approval.evidenceFiles)
    evidence.set(
      entry.path,
      await readSealed(
        evidenceDirectory,
        entry.path,
        { sha256: entry.sha256, size: entry.bytes },
        16777216,
      ),
    );
  await readSealed(
    dirname(licenseInventoryPath),
    basename(licenseInventoryPath),
    { sha256: approval.license.inventorySha256 },
    16777216,
  );
  await hashDatabase(
    resolve(evidenceDirectory, "db-ready/6/vulnerability.db"),
    approval.vulnerabilities.databaseSha256,
  );
  const report = strict(
    evidence.get("cnpg-minimal.grype.json"),
    "FIXTURE_SCAN",
  );
  const seal = blockingMatchSeal(report);
  requireLive(
    Object.entries(seal).every(([k, v]) => approval.vulnerabilities[k] === v) &&
      (report.ignoredMatches === undefined ||
        (Array.isArray(report.ignoredMatches) &&
          report.ignoredMatches.length === 0)),
    "FIXTURE_SCAN_SET",
  );
  const proof = strict(evidence.get("scan-proof.json"), "FIXTURE_SCAN_PROOF");
  const scan = proof.steps.filter((s) => s.name === "cnpg-minimal-grype");
  requireLive(
    scan.length === 1 &&
      scan[0].rawExit === 2 &&
      scan[0].signal === null &&
      scan[0].stdoutSha256 === hash(evidence.get("cnpg-minimal.grype.json")) &&
      scan[0].stderrSha256 ===
        hash(evidence.get("cnpg-minimal.grype.json.stderr.log")) &&
      proof.database.before === approval.vulnerabilities.databaseSha256 &&
      proof.database.after === proof.database.before,
    "FIXTURE_SCAN_PROCESS",
  );
  requireLive(
    report.source.type === "image" &&
      report.source.target.imageID === FIXTURE_IMAGE.config &&
      report.source.target.manifestDigest === FIXTURE_IMAGE.manifest &&
      report.descriptor.db.status.valid === true &&
      report.descriptor.db.status.built ===
        approval.vulnerabilities.databaseBuilt,
    "FIXTURE_SCAN_BINDING",
  );
  const directory = "cnpg-minimal.oci",
    entries = [];
  for (const name of ["index.json", "oci-layout"])
    entries.push({ name, data: evidence.get(`${directory}/${name}`) });
  const index = strict(entries[0].data, "FIXTURE_OCI_INDEX");
  requireLive(
    index.manifests.length === 1 &&
      index.manifests[0].digest === FIXTURE_IMAGE.manifest,
    "FIXTURE_OCI_INDEX_BINDING",
  );
  const getBlob = async (digest, size) => {
    requireLive(
      /^sha256:[a-f0-9]{64}$/.test(digest) &&
        Number.isSafeInteger(size) &&
        size > 0 &&
        size <= 150000000,
      "FIXTURE_OCI_DESCRIPTOR",
    );
    const name = `blobs/sha256/${digest.slice(7)}`;
    const data = await readSealed(
      evidenceDirectory,
      `${directory}/${name}`,
      { sha256: digest.slice(7), size },
      150000000,
    );
    entries.push({ name, data });
    return data;
  };
  const manifestBytes = await getBlob(
      FIXTURE_IMAGE.manifest,
      index.manifests[0].size,
    ),
    manifest = strict(manifestBytes, "FIXTURE_OCI_MANIFEST");
  requireLive(
    manifest.config.digest === FIXTURE_IMAGE.config &&
      manifest.layers.length === 3,
    "FIXTURE_OCI_CONFIG_BINDING",
  );
  const configBytes = await getBlob(FIXTURE_IMAGE.config, manifest.config.size),
    config = strict(configBytes, "FIXTURE_OCI_CONFIG");
  requireLive(
    config.os === "linux" &&
      config.architecture === "amd64" &&
      config.config.User === "26" &&
      !config.config.Volumes,
    "FIXTURE_OCI_CONFIG",
  );
  requireLive(
    hash(Buffer.from(report.source.target.manifest, "base64")) ===
      hash(manifestBytes) &&
      hash(Buffer.from(report.source.target.config, "base64")) ===
        hash(configBytes),
    "FIXTURE_SCAN_OCI_BYTES",
  );
  for (const layer of manifest.layers) await getBlob(layer.digest, layer.size);
  await assertClosedDirectory(
    evidenceDirectory,
    directory,
    entries.map((e) => e.name),
  );
  const archive = deterministicTar(
    entries.sort((a, b) => (a.name < b.name ? -1 : 1)),
    0,
  );
  const capability = Object.freeze({
    approvalSha256: FIXTURE_APPROVAL_SHA256,
    expiresAt: approval.expiresAt,
    archiveSha256: hash(archive),
    archiveBytes: archive.length,
    scope: approval.scope,
  });
  records.set(capability, { archive, approval });
  return capability;
}
export function fixtureArchive(capability, now = Date.now()) {
  const entry = records.get(capability);
  requireLive(
    entry && Number.isFinite(now) && now < Date.parse(entry.approval.expiresAt),
    "FIXTURE_CAPABILITY",
  );
  return Buffer.from(entry.archive);
}
export function validateAdmittedRun(capability, run, now = Date.now()) {
  const entry = records.get(capability);
  requireLive(
    entry &&
      run.approvalSha256 === FIXTURE_APPROVAL_SHA256 &&
      Date.parse(run.expiresAt) <= Date.parse(entry.approval.expiresAt),
    "FIXTURE_RUN_ADMISSION",
  );
  return validateFixtureRun(run, now);
}
