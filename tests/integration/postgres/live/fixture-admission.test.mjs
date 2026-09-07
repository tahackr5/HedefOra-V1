import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  blockingMatchSeal,
  validateFixtureApproval,
  fixtureArchive,
  validateAdmittedRun,
} from "./fixture-admission.mjs";
import { probeReadOnlyInputs } from "./fixture-container.mjs";

const approval = await readFile(
  new URL(
    "../../../../security/postgres-test-fixture-admission.json",
    import.meta.url,
  ),
);
const now = Date.parse("2026-09-07T01:00:00Z");
test("fixture approval permits only exact current finite test risk record", () => {
  const value = validateFixtureApproval(approval, now);
  assert.equal(value.productionAdmission, false);
  assert.equal(value.vexNotAffectedClaim, false);
  assert.equal(value.vulnerabilities.scanStatus, "FAIL");
});
for (const [label, mutate] of [
  ["production", (v) => (v.productionAdmission = true)],
  ["scope", (v) => (v.scope = "production")],
  ["expiry", (v) => (v.expiresAt = "2099-01-01T00:00:00.000Z")],
  ["image", (v) => (v.image.config = "sha256:" + "0".repeat(64))],
  [
    "same count alternate findings",
    (v) => (v.vulnerabilities.blockingMultisetSha256 = "0".repeat(64)),
  ],
  ["VEX disguise", (v) => (v.vexNotAffectedClaim = true)],
  ["extra fields", (v) => (v.override = true)],
])
  test(`fixture approval rejects ${label}`, () => {
    const v = JSON.parse(approval);
    mutate(v);
    assert.throws(
      () => validateFixtureApproval(Buffer.from(JSON.stringify(v)), now),
      /FIXTURE_APPROVAL_BYTES/,
    );
  });
for (const time of [
  NaN,
  Infinity,
  Date.parse("2026-09-06T23:59:59Z"),
  Date.parse("2026-09-08T06:27:35Z"),
  Date.parse("2030-01-01"),
])
  test(`fixture approval rejects time ${time}`, () =>
    assert.throws(
      () => validateFixtureApproval(approval, time),
      /FIXTURE_APPROVAL_EXPIRED/,
    ));
test("fixture capability cannot be made from JSON or a PASS string", () => {
  assert.throws(
    () => fixtureArchive({ approvalSha256: "0".repeat(64) }, now),
    /FIXTURE_CAPABILITY/,
  );
  assert.throws(
    () => validateAdmittedRun({ status: "PASS" }, {}, now),
    /FIXTURE_RUN_ADMISSION/,
  );
});
const match = (id = "CVE-test", severity = "High", related = []) => ({
  artifact: {
    id: "pkg1",
    name: "package",
    version: "1",
    purl: "pkg:generic/package@1",
  },
  vulnerability: { id, severity, cvss: [] },
  relatedVulnerabilities: related,
});
test("blocking multiset binds every full match field, preserves duplicates and ignores order", () => {
  const a = match(),
    b = match("CVE-two");
  const seal = blockingMatchSeal({ matches: [a, b] });
  assert.deepEqual(seal, blockingMatchSeal({ matches: [b, a] }));
  assert.notEqual(
    seal.blockingMultisetSha256,
    blockingMatchSeal({ matches: [a, match("CVE-other")] })
      .blockingMultisetSha256,
  );
  const changed = structuredClone(a);
  changed.artifact.id = "different";
  assert.notEqual(
    blockingMatchSeal({ matches: [a] }).blockingMultisetSha256,
    blockingMatchSeal({ matches: [changed] }).blockingMultisetSha256,
  );
  assert.equal(blockingMatchSeal({ matches: [a, a] }).blockingMatches, 2);
});
test("related severity, unknown severity, and CVSS>=7 remain blocking", () => {
  const rows = [
    match("a", "Unknown"),
    match("b", "Low", [{ severity: "Critical" }]),
    match("c", "Negligible", [
      { severity: "Low", cvss: [{ metrics: { baseScore: 7 } }] },
    ]),
    match("d", "Medium"),
  ];
  assert.equal(blockingMatchSeal({ matches: rows }).blockingMatches, 3);
});
test("malformed scanner rows cannot be accepted", () => {
  assert.throws(() => blockingMatchSeal({ matches: [{}] }));
  assert.throws(() =>
    blockingMatchSeal({
      matches: [
        match("x", "Low", [
          { severity: "Low", cvss: [{ metrics: { baseScore: NaN } }] },
        ]),
      ],
    }),
  );
});
test("RO inputs accept only six actual EROFS observations, independent of mode bits", async () => {
  const calls = [];
  await probeReadOnlyInputs(async (path, flags) => {
    calls.push({ path, flags });
    throw Object.assign(new Error(), { code: "EROFS" });
  });
  assert.equal(calls.length, 6);
});
for (const code of ["EACCES", "EPERM", "ENOENT", "EIO", undefined])
  test(`RO inputs reject ${code} instead of EROFS`, async () =>
    assert.rejects(
      probeReadOnlyInputs(async () => {
        throw Object.assign(new Error(), { code });
      }),
      /FIXTURE_RO_PROBE_ERROR/,
    ));
test("RO inputs reject a successful writable open without ever writing or truncating", async () => {
  let closed = 0;
  await assert.rejects(
    probeReadOnlyInputs(async () => ({ close: async () => closed++ })),
    /FIXTURE_RO_PROBE_WRITABLE/,
  );
  assert.equal(closed, 1);
});
