// Finite historical candidate replay. Signed APK v2 authenticity and byte identity only.
// It does not establish publisher compiler provenance, licensing, vulnerability admission, or execution authority.
import { verify } from "node:crypto";
import { RESEARCH } from "./fixed-authority.mjs";
import {
  hash,
  strict,
  closed,
  canonical,
  readSealed,
  assertClosedDirectory,
  requireThat as check,
  relativeName,
} from "./sealed-io.mjs";
import {
  gzipMembers,
  tarEntries,
  deterministicTar,
  validateVirtualTree,
} from "./archive-data.mjs";
import { deriveApkHeuristicCpes } from "./apk-cpe-templates.mjs";
const utf8 = (b) => new TextDecoder("utf-8", { fatal: true }).decode(b);
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const same = (a, b, label) => check(canonical(a) === canonical(b), label);
const SHA = /^[a-f0-9]{64}$/;

export function pkginfo(bytes) {
  check(bytes.length <= 65536, "PKGINFO_BOUND");
  const p = Object.create(null);
  const multiple = new Set([
    "depend",
    "provides",
    "install_if",
    "replaces",
    "triggers",
  ]);
  for (const line of utf8(bytes).split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const match = /^([a-z][a-z0-9_]*) = ([^\r\n\x00]*)$/.exec(line);
    check(match, "PKGINFO_SYNTAX");
    const [, key, value] = match;
    check(!p[key] || multiple.has(key), "PKGINFO_DUPLICATE");
    (p[key] ??= []).push(value);
  }
  for (const k of [
    "pkgname",
    "pkgver",
    "arch",
    "license",
    "origin",
    "commit",
    "datahash",
    "url",
  ])
    check(p[k]?.length === 1, "PKGINFO_REQUIRED");
  check(SHA.test(p.datahash[0]), "PKGINFO_DATAHASH");
  return p;
}
function indexRows(bytes) {
  const text = utf8(bytes);
  check(text.length <= 30000000, "INDEX_BOUND");
  return text
    .trimEnd()
    .split("\n\n")
    .map((block) => {
      const r = Object.create(null);
      for (const line of block.split("\n")) {
        check(/^[A-Za-z]:[^\x00\r\n]*$/.test(line), "INDEX_SYNTAX");
        const key = line[0];
        check(r[key] === undefined, "INDEX_DUPLICATE_KEY");
        r[key] = line.slice(2);
      }
      return r;
    });
}
export function verifySignatureMember(member, signed, keys) {
  const sigs = tarEntries(member, { profile: "apk-v2-control" });
  check(sigs.length === 1, "SIGNATURE_COUNT");
  for (const sig of sigs) {
    const match = /^\.SIGN\.RSA\.([^/]+\.rsa\.pub)$/.exec(sig.name);
    check(
      match &&
        sig.type === "0" &&
        sig.data.length >= 128 &&
        sig.data.length <= 1024,
      "SIGNATURE_FORMAT",
    );
    const key = keys.get(match[1]);
    check(key, "SIGNATURE_UNTRUSTED_KEY");
    check(verify("RSA-SHA1", signed, key, sig.data), "SIGNATURE_INVALID");
  }
}
function assertDependency(spec, row) {
  check(
    typeof spec === "string" && spec.length <= 512 && !/[<>~!]/.test(spec),
    "DEPENDENCY_UNSUPPORTED",
  );
  const parts = spec.split("=");
  check(
    parts.length <= 2 && parts[0] && (parts.length === 1 || parts[1]),
    "DEPENDENCY_SYNTAX",
  );
  const offers = [
    [row.P, row.V],
    ...(row.p || "")
      .split(" ")
      .filter(Boolean)
      .map((p) => p.split("=")),
  ];
  check(
    offers.every((p) => p.length <= 2) &&
      offers.some(
        (p) => p[0] === parts[0] && (parts.length === 1 || p[1] === parts[1]),
      ),
    "DEPENDENCY_UNSATISFIED",
  );
}
function validateLock(lock) {
  closed(
    lock,
    [
      "schemaVersion",
      "profile",
      "scope",
      "platform",
      "distro",
      "index",
      "signingKeys",
      "signatureScheme",
      "packages",
      "dependencyEdges",
      "sourceFamilies",
      "assembly",
      "independentCpeMapping",
      "imageLicenseReview",
      "publisherCompilerReproduction",
      "executionAdmission",
    ],
    "LOCK",
  );
  check(
    lock.schemaVersion === 1 &&
      lock.profile === "PROPOSAL_signed-apk-runtime-only_v1",
    "LOCK_PROFILE",
  );
  closed(lock.index, ["url", "sha256", "members"], "INDEX_LOCK");
  check(
    lock.signingKeys.length === 1 &&
      lock.packages.length === 28 &&
      lock.sourceFamilies.length === 2,
    "FINITE_CLOSURE",
  );
  for (const key of lock.signingKeys)
    closed(
      key,
      [
        "name",
        "primaryUrl",
        "mirrorUrl",
        "sourceCommit",
        "sha256",
        "byteEqual",
      ],
      "KEY_LOCK",
    );
  for (const p of lock.packages) {
    closed(
      p,
      [
        "name",
        "version",
        "architecture",
        "repositoryArchitecture",
        "license",
        "origin",
        "sourceCommit",
        "url",
        "size",
        "sha256",
        "controlSha1",
        "dataSha256",
        "signatureVerified",
        "signatures",
        "dependencies",
        "provides",
        "controlMembers",
        "fileCount",
        "binarySha256",
      ],
      "PACKAGE_LOCK",
    );
    for (const sig of p.signatures)
      closed(sig, ["keyname", "keySha256", "valid"], "PACKAGE_SIGNATURE_LOCK");
  }
  for (const edge of lock.dependencyEdges)
    closed(edge, ["from", "dependency", "to", "version"], "DEPENDENCY_LOCK");
  for (const family of lock.sourceFamilies) {
    closed(
      family,
      [
        "version",
        "origin",
        "commit",
        "binaryPath",
        "binarySha256",
        "apkbuild",
        "files",
      ],
      "SOURCE_LOCK",
    );
    closed(family.apkbuild, ["url", "sha256"], "APKBUILD_LOCK");
    for (const file of family.files)
      closed(
        file,
        ["sha512", "name", "url", "size", "sha256"],
        "SOURCE_FILE_LOCK",
      );
  }
  closed(
    lock.assembly,
    [
      "epoch",
      "uid",
      "gid",
      "sort",
      "tar",
      "inputPackages",
      "referenceManifestDigest",
      "referenceLayerSha256",
      "referenceConfigDigest",
      "referenceInstalledDatabaseSha256",
      "executableCommand",
    ],
    "ASSEMBLY_LOCK",
  );
  for (const p of lock.assembly.inputPackages)
    closed(p, ["name", "sha256"], "ASSEMBLY_INPUT");
}

export async function inspectFixedCandidate(artifactRoot) {
  // Only the orchestrator-owned literal pin is authority for these input bytes.
  // Proposal booleans such as signatureVerified are never read to decide a gate.
  const lockBytes = await readSealed(
    artifactRoot,
    RESEARCH.lockName,
    { sha256: RESEARCH.lockSha256 },
    2000000,
  );
  const lock = strict(lockBytes, "locked APK inputs", 2000000);
  validateLock(lock);
  await readSealed(
    artifactRoot,
    "assemble.mjs",
    { sha256: RESEARCH.recipeSha256 },
    200000,
  );
  const keys = new Map();
  for (const k of lock.signingKeys) {
    const key = await readSealed(artifactRoot, "keys/" + k.name, k, 32768);
    const mirror = await readSealed(
      artifactRoot,
      "keys/" + k.name + ".official-mirror",
      k,
      32768,
    );
    check(key.equals(mirror), "KEY_CORROBORATION_BYTES");
    keys.set(k.name, key);
  }
  const indexBytes = await readSealed(
    artifactRoot,
    "APKINDEX.tar.gz",
    lock.index,
    10000000,
  );
  const im = gzipMembers(indexBytes);
  check(im.length === 2, "INDEX_GZIP_MEMBERS");
  verifySignatureMember(im[0].data, im[1].compressed, keys);
  const indexFiles = tarEntries(im[1].data, { profile: "apk-v2-index" });
  same(
    indexFiles.map((e) => e.name).sort(),
    ["APKINDEX", "DESCRIPTION"],
    "INDEX_FILES",
  );
  const rows = indexRows(indexFiles.find((e) => e.name === "APKINDEX").data);
  const selected = new Map(),
    all = new Map(),
    inventory = [],
    classification = [];
  let duplicateDirectories = 0;
  const packages = [...lock.packages].sort((a, b) => compare(a.name, b.name));
  check(new Set(packages.map((p) => p.name)).size === 28, "PACKAGE_DUPLICATE");
  same(
    lock.assembly.inputPackages,
    packages.map((p) => ({ name: p.name, sha256: p.sha256 })),
    "ASSEMBLY_INPUT_SET",
  );
  for (const p of packages) {
    const candidates = rows.filter((r) => r.P === p.name && r.V === p.version);
    check(candidates.length === 1, "INDEX_SELECTION");
    const r = candidates[0];
    selected.set(p.name, r);
    same(
      [r.A, r.L, r.o, r.c, r.C, Number(r.S)],
      [
        p.repositoryArchitecture,
        p.license,
        p.origin,
        p.sourceCommit,
        p.controlSha1,
        p.size,
      ],
      "INDEX_LOCK_PARITY",
    );
    const filename = p.name + "-" + p.version + ".apk";
    relativeName(filename);
    const archive = await readSealed(
      artifactRoot,
      "apk/" + filename,
      p,
      100000000,
    );
    const ms = gzipMembers(archive);
    check(ms.length === 3, "APK_GZIP_MEMBERS");
    verifySignatureMember(ms[0].data, ms[1].compressed, keys);
    check(
      "Q1" +
        Buffer.from(hash(ms[1].compressed, "sha1"), "hex").toString(
          "base64",
        ) ===
        r.C,
      "INDEX_CONTROL_Q1",
    );
    const control = tarEntries(ms[1].data, { profile: "apk-v2-control" }),
      data = tarEntries(ms[2].data);
    same(
      control.map((e) => e.name),
      p.controlMembers,
      "CONTROL_MEMBER_SET",
    );
    check(data.length === p.fileCount, "PAYLOAD_FILE_COUNT");
    const info = control.find((e) => e.name === ".PKGINFO");
    check(info?.type === "0", "PKGINFO_MISSING");
    const meta = pkginfo(info.data);
    same(
      [
        meta.pkgname[0],
        meta.pkgver[0],
        meta.arch[0],
        meta.license[0],
        meta.origin[0],
        meta.commit[0],
      ],
      [p.name, p.version, p.architecture, p.license, p.origin, p.sourceCommit],
      "SIGNED_METADATA",
    );
    check(
      ["x86_64", "noarch"].includes(meta.arch[0]) && meta.url[0] === r.U,
      "SIGNED_ARCH_URL",
    );
    same(meta.depend ?? [], p.dependencies, "SIGNED_DEPENDENCIES");
    same(meta.provides ?? [], p.provides, "SIGNED_PROVIDES");
    check(
      hash(ms[2].compressed) === meta.datahash[0] &&
        meta.datahash[0] === p.dataSha256,
      "SIGNED_DATA_SHA256",
    );
    const metadataCopy = await readSealed(
      artifactRoot,
      "metadata/" + filename + ".PKGINFO",
      { sha256: hash(info.data), size: info.data.length },
      65536,
    );
    check(metadataCopy.equals(info.data), "METADATA_COPY");
    inventory.push({
      name: p.name,
      version: p.version,
      architecture: p.architecture,
      origin: p.origin,
      license: p.license,
      upstreamURL: meta.url[0],
      sourceCommit: p.sourceCommit,
      cpes: deriveApkHeuristicCpes({
        name: p.name,
        version: p.version,
        upstreamURL: meta.url[0],
      }),
      metadataSha256: hash(info.data),
      apkSha256: p.sha256,
    });
    classification.push({
      name: p.name,
      elfFiles: data
        .filter(
          (e) =>
            e.type === "0" &&
            e.data.subarray(0, 4).equals(Buffer.from([127, 69, 76, 70])),
        )
        .map((e) => e.name),
      payloadScripts: data
        .filter(
          (e) => e.type === "0" && e.data.subarray(0, 2).toString() === "#!",
        )
        .map((e) => e.name),
      controlScripts: control
        .filter((e) => e.name !== ".PKGINFO")
        .map((e) => e.name),
    });
    for (const e of data) {
      const previous = all.get(e.name);
      if (previous) {
        check(
          previous.type === e.type &&
            previous.mode === e.mode &&
            previous.uid === e.uid &&
            previous.gid === e.gid &&
            previous.link === e.link &&
            previous.data.equals(e.data),
          "PAYLOAD_COLLISION",
        );
        if (e.type === "5") duplicateDirectories++;
        continue;
      }
      all.set(e.name, e);
    }
  }
  // Every signed dependency must be represented by exactly one locked satisfying edge.
  const actualEdges = [];
  for (const p of packages)
    for (const dependency of p.dependencies) {
      const edges = lock.dependencyEdges.filter(
        (e) => e.from === p.name && e.dependency === dependency,
      );
      check(edges.length === 1, "DEPENDENCY_EDGE");
      const edge = edges[0],
        row = selected.get(edge.to);
      check(row && row.V === edge.version, "DEPENDENCY_TARGET");
      assertDependency(dependency, row);
      actualEdges.push(edge);
    }
  same(
    actualEdges.map(canonical).sort(),
    lock.dependencyEdges.map(canonical).sort(),
    "DEPENDENCY_EDGE_CLOSURE",
  );
  let installed = "";
  for (const p of packages) {
    const r = selected.get(p.name);
    for (const k of [
      "C",
      "P",
      "V",
      "A",
      "S",
      "I",
      "T",
      "U",
      "L",
      "o",
      "m",
      "t",
      "c",
      "D",
      "p",
    ])
      if (r[k])
        installed += k + ":" + (k === "A" ? p.architecture : r[k]) + "\n";
    installed += "\n";
  }
  check(
    hash(Buffer.from(installed)) ===
      lock.assembly.referenceInstalledDatabaseSha256,
    "INSTALLED_DB",
  );
  for (const [name, value] of [
    ["lib/apk/db/installed", installed],
    [
      "etc/apk/world",
      packages.map((p) => p.name + "=" + p.version).join("\n") + "\n",
    ],
  ]) {
    check(!all.has(name), "GENERATED_OVERWRITE");
    all.set(name, {
      name,
      type: "0",
      link: "",
      mode: 420,
      uid: 0,
      gid: 0,
      data: Buffer.from(value),
    });
  }
  const tree = validateVirtualTree([...all.values()]);
  const layer = deterministicTar(
    [...all.values()].sort((a, b) => compare(a.name, b.name)),
    lock.assembly.epoch,
  );
  check(hash(layer) === lock.assembly.referenceLayerSha256, "ASSEMBLY_LAYER");
  const sources = [];
  for (const family of lock.sourceFamilies) {
    check(
      packages.some(
        (p) =>
          p.origin === family.origin &&
          p.sourceCommit === family.commit &&
          p.version === family.version + "-r0",
      ),
      "SOURCE_PACKAGE_BINDING",
    );
    const binary = all.get(family.binaryPath.replace(/^\//, ""));
    check(
      binary?.type === "0" && hash(binary.data) === family.binarySha256,
      "SOURCE_BINARY_BINDING",
    );
    const build = await readSealed(
      artifactRoot,
      "sources/" + family.origin + "/APKBUILD",
      family.apkbuild,
      200000,
    );
    const text = utf8(build),
      checksums = [...text.matchAll(/^sha512sums="\n([\s\S]*?)\n"\s*$/gm)];
    check(checksums.length === 1, "APKBUILD_CHECKSUM_SECTION");
    const expectedSums = checksums[0][1].split("\n").map((line) => {
      const match = /^([a-f0-9]{128})  ([A-Za-z0-9_.+-]+)$/.exec(line);
      check(match, "APKBUILD_CHECKSUM_LINE");
      return { sha512: match[1], name: match[2] };
    });
    same(
      expectedSums,
      family.files.map((f) => ({ sha512: f.sha512, name: f.name })),
      "APKBUILD_SOURCE_SET",
    );
    check(
      family.apkbuild.url ===
        "https://raw.githubusercontent.com/alpinelinux/aports/" +
          family.commit +
          "/main/" +
          family.origin +
          "/APKBUILD",
      "APKBUILD_COMMIT_URL",
    );
    for (const file of family.files) {
      const bytes = await readSealed(
        artifactRoot,
        "sources/" + family.origin + "/" + file.name,
        file,
        50000000,
      );
      check(hash(bytes, "sha512") === file.sha512, "APKBUILD_SOURCE_SHA512");
    }
    sources.push({
      familyId: family.origin + ":" + family.version,
      commit: family.commit,
      binaryPath: family.binaryPath,
      binarySha256: family.binarySha256,
      apkbuildSha256: family.apkbuild.sha256,
      materialsSha256: hash(canonical(family.files)),
    });
  }
  const configBytes = await readSealed(
    artifactRoot,
    "candidate.oci/blobs/sha256/" +
      lock.assembly.referenceConfigDigest.slice(7),
    { sha256: lock.assembly.referenceConfigDigest.slice(7) },
    1000000,
  );
  const config = strict(configBytes, "OCI config");
  closed(
    config,
    ["architecture", "os", "created", "config", "rootfs", "history"],
    "OCI_CONFIG",
  );
  check(
    config.architecture === "amd64" && config.os === "linux",
    "OCI_PLATFORM",
  );
  closed(config.config, ["User", "WorkingDir", "Labels"], "OCI_EXEC_CONFIG");
  check(
    config.config.User === "70:70" && config.config.WorkingDir === "/",
    "OCI_USER",
  );
  same(
    config.rootfs,
    { type: "layers", diff_ids: ["sha256:" + hash(layer)] },
    "OCI_DIFF_IDS",
  );
  const descriptor = (mediaType, bytes) => ({
    mediaType,
    digest: "sha256:" + hash(bytes),
    size: bytes.length,
  });
  const expectedManifest = Buffer.from(
    JSON.stringify({
      schemaVersion: 2,
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      config: descriptor(
        "application/vnd.oci.image.config.v1+json",
        configBytes,
      ),
      layers: [descriptor("application/vnd.oci.image.layer.v1.tar", layer)],
    }),
  );
  check(
    "sha256:" + hash(expectedManifest) ===
      lock.assembly.referenceManifestDigest,
    "OCI_MANIFEST_REPLAY",
  );
  const expectedIndex = Buffer.from(
    JSON.stringify({
      schemaVersion: 2,
      manifests: [
        {
          ...descriptor(
            "application/vnd.oci.image.manifest.v1+json",
            expectedManifest,
          ),
          platform: { architecture: "amd64", os: "linux" },
        },
      ],
    }),
  );
  const expectedLayout = Buffer.from('{"imageLayoutVersion":"1.0.0"}');
  const ociFiles = new Map([
    ["oci-layout", expectedLayout],
    ["index.json", expectedIndex],
    ["blobs/sha256/" + hash(expectedManifest), expectedManifest],
    ["blobs/sha256/" + hash(configBytes), configBytes],
    ["blobs/sha256/" + hash(layer), layer],
  ]);
  await assertClosedDirectory(artifactRoot, "candidate.oci", [
    ...ociFiles.keys(),
  ]);
  for (const [name, bytes] of ociFiles)
    await readSealed(artifactRoot, "candidate.oci/" + name, {
      sha256: hash(bytes),
      size: bytes.length,
    });
  const archive = await readSealed(artifactRoot, RESEARCH.archiveName, {
    sha256: RESEARCH.archiveSha256,
    size: RESEARCH.archiveSize,
  });
  const outer = tarEntries(archive);
  same(
    outer.map((e) => e.name).sort(),
    [...ociFiles.keys()].sort(),
    "OCI_ARCHIVE_CLOSED_SET",
  );
  for (const entry of outer)
    check(
      entry.type === "0" && entry.data.equals(ociFiles.get(entry.name)),
      "OCI_ARCHIVE_BINDING",
    );
  return {
    status: "PASS",
    scope: "FIXED_RESEARCH_BYTE_REPLAY_ONLY",
    profile: RESEARCH.profile,
    lockSha256: RESEARCH.lockSha256,
    archiveSha256: hash(archive),
    archiveSize: archive.length,
    imageManifestDigest: lock.assembly.referenceManifestDigest,
    imageConfigDigest: lock.assembly.referenceConfigDigest,
    rootfsSha256: hash(layer),
    installedDatabaseSha256: hash(Buffer.from(installed)),
    packages: inventory,
    classification,
    sources,
    tree,
    duplicateDirectories,
    legacySignature:
      "RSA-PKCS1-v1.5/SHA1 over compressed control; archive SHA256 root-pinned; signed datahash SHA256",
    publisherCompilerProvenance: "NOT_PROVEN",
    nvdDictionaryCompleteness: "NOT_PROVEN",
    licenseAdmission: "NOT_ADMITTED",
    executionAdmission: "NOT_ADMITTED",
  };
}
