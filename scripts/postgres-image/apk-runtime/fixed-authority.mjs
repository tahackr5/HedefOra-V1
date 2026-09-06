// ORCHESTRATOR-OWNED when promoted. No caller override, environment override, or target PASS flag.
// These are historical research byte identities, NOT security/license acceptance.
export const RESEARCH = Object.freeze({
  profile: "apk-runtime-data-assembly/v1",
  lockName: "signed-apk-inputs.lock.proposal.json",
  lockSha256:
    "97a9745d2de3089b167c1e928d362ab0dc37cbb1d917e97b64b503168551a9b7",
  archiveName: "candidate.oci.tar",
  archiveSha256:
    "da09eb0ab3ecbba0f35e6e4c813f31c0a0d3478bac6d7f943b5f0e460b9a844c",
  archiveSize: 72830464,
  recipeSha256:
    "7b3dfd3255b32dffbb182e4c0353df4920e243cc940e11edbbebac8941d5bc24",
});
// Root must independently review and pin a closed authority record before changing this.
// Null is intentional: no actual independent security/license execution admission exists yet.
export const ADMISSION_AUTHORITY = null;
// Separate non-executing inspection pin; root may fill only after reviewing the artifact graph.
// Shape: {bundleName, bundleSha256, bundleSize, profileSha256, scannerLockSha256,
// sourcePolicySha256, controllerReceiptSha256, subject, effectiveConfigurationSha256}.
export const INSPECTION = null;
