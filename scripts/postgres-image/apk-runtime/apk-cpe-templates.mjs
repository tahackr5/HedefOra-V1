// DRAFT: independently derived scanner-parity expectations, NOT NVD dictionary admission.
// Inputs are signed .PKGINFO fields. No scanner output is read by this module.
// Algorithm source: Syft commit 91a0032987d91b7411b52f6f5c185c5e7f775495:
// cpegenerate/{apk,generate,field_candidate,vendors_from_url,candidate_by_package_type}.go
const names = new Set([
  "alpine-baselayout-data",
  "alpine-keys",
  "alpine-release",
  "busybox",
  "busybox-binsh",
  "gdbm",
  "icu-data-full",
  "icu-libs",
  "libcrypto3",
  "libgcc",
  "libldap",
  "libncursesw",
  "libpq",
  "libsasl",
  "libssl3",
  "libstdc++",
  "libxml2",
  "lz4-libs",
  "musl",
  "ncurses-terminfo-base",
  "postgresql-common",
  "postgresql17",
  "postgresql17-client",
  "readline",
  "tzdata",
  "xz-libs",
  "zlib",
  "zstd-libs",
]);
const variations = (values) =>
  new Set(
    [...values].flatMap((v) => [
      v,
      v.replaceAll("-", "_"),
      v.replaceAll("_", "-"),
    ]),
  );
const cpeEscape = (s) => s.replaceAll("+", String.raw`\+`);

export function deriveApkHeuristicCpes({ name, version, upstreamURL }) {
  if (
    !names.has(name) ||
    !/^[0-9][a-zA-Z0-9._~-]*$/.test(version) ||
    typeof upstreamURL !== "string" ||
    upstreamURL.length > 2048
  )
    throw new Error("Unsupported reviewed APK metadata profile.");
  // Match pinned APK stream-version heuristic. OriginPackage is NOT used.
  const m = name.match(
    /^([a-zA-Z][\w-]*?)(-?\d[\d.]*?)(?:$|-([a-zA-Z][\w-]*?)?$)/,
  );
  const alias = m ? m[1] + (m[3] ? "-" + m[3] : "") : name;
  const products = variations(new Set([name, alias]));
  const initialVendors = new Set(products);
  // Only current closure addition in pinned APK candidate table.
  if (name === "musl" || alias === "musl") initialVendors.add("musl-libc");
  const vendors = variations(initialVendors);
  for (const v of [...vendors]) {
    const separators = [...v.matchAll(/[-_]/g)].map((x) => x.index);
    for (const n of separators) vendors.add(v.slice(0, n));
  }
  // URL-derived candidates are pinned upstream hints, not NVD confirmations.
  const urlRules = [
    ["https://www.gnu.org/", "gnu"],
    ["https://developer.gnome.org/", "gnome"],
    ["https://www.ruby-lang.org/", "ruby-lang"],
    ["https://llvm.org/", "llvm"],
    ["https://www.isc.org/", "isc"],
    ["https://musl.libc.org/", "musl-libc"],
    ["https://www.mozilla.org/", "mozilla"],
    ["https://www.x.org/", "x.org"],
    ["https://w1.fi/", "w1.fi"],
  ];
  const prefix = urlRules.find(([url]) => upstreamURL.startsWith(url));
  if (prefix) vendors.add(prefix[1]);
  else {
    const u = upstreamURL.match(
      /^(?:https|http|git):\/\/(?:github|gitlab)\.com\/([\w-]*?)\/.*$/,
    );
    if (u?.[1]) vendors.add(u[1]);
  }
  const values = [...vendors].flatMap((vendor) =>
    [...products].map(
      (product) =>
        `cpe:2.3:a:${cpeEscape(vendor)}:${cpeEscape(product)}:${version}:*:*:*:*:*:*:*`,
    ),
  );
  if (values.length < 1 || values.length > 32)
    throw new Error("Unsupported CPE set size.");
  return [...new Set(values)].sort();
}
