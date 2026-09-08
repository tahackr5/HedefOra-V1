// Read-only, bounded evidence I/O. Never acquires, executes, or writes target bytes.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseStrictJson, canonicalJson } from "../../supply-chain/policy.mjs";

export const hash = (bytes, algorithm = "sha256") =>
  createHash(algorithm).update(bytes).digest("hex");
export const canonical = canonicalJson;
export function requireThat(condition, code) {
  if (!condition) throw new Error(code);
}
export function closed(value, keys, label) {
  requireThat(
    value && typeof value === "object" && !Array.isArray(value),
    `${label}:OBJECT`,
  );
  requireThat(
    canonical(Object.keys(value).sort()) === canonical([...keys].sort()),
    `${label}:KEYS`,
  );
}
export function strict(bytes, label, limit = 64 * 1024 * 1024) {
  requireThat(
    (typeof bytes === "string" || bytes instanceof Uint8Array) &&
      Buffer.byteLength(bytes) <= limit,
    `${label}:BYTES`,
  );
  const text =
    typeof bytes === "string"
      ? bytes
      : new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  // The protected duplicate-key parser is recursive. Bound nesting BEFORE invoking it.
  let depth = 0,
    quoted = false,
    escape = false;
  for (const ch of text) {
    if (quoted) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') quoted = false;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === "{" || ch === "[")
      requireThat(++depth <= 64, `${label}:DEPTH`);
    else if (ch === "}" || ch === "]")
      requireThat(--depth >= 0, `${label}:DEPTH`);
  }
  const value = parseStrictJson(text, label);
  let nodes = 0;
  const visit = (v) => {
    requireThat(++nodes <= 2000000, `${label}:NODES`);
    if (v && typeof v === "object") for (const x of Object.values(v)) visit(x);
  };
  visit(value);
  return value;
}
export function relativeName(name) {
  requireThat(
    typeof name === "string" &&
      name.length > 0 &&
      name.length <= 4096 &&
      !/[\\\x00-\x1f\x7f:]/.test(name) &&
      !name.startsWith("/") &&
      name
        .split("/")
        .every(
          (p) =>
            p &&
            p !== "." &&
            p !== ".." &&
            !p.endsWith(".") &&
            !p.endsWith(" "),
        ),
    "PATH",
  );
  return name;
}
export async function readSealed(root, name, expected, maximum = 200000000) {
  relativeName(name);
  requireThat(/^[a-f0-9]{64}$/.test(expected.sha256), "EXPECTED_HASH");
  const base = path.resolve(root);
  requireThat(
    (await fs.lstat(base)).isDirectory() &&
      !(await fs.lstat(base)).isSymbolicLink(),
    "ROOT_KIND",
  );
  const realBase = await fs.realpath(base);
  requireThat(path.relative(realBase, base) === "", "ROOT_ALIAS");
  let current = realBase;
  for (const component of name.split("/")) {
    current = path.join(current, component);
    const st = await fs.lstat(current);
    requireThat(!st.isSymbolicLink(), "PATH_LINK");
  }
  requireThat(
    path.relative(realBase, await fs.realpath(current)) ===
      name.split("/").join(path.sep),
    "PATH_ALIAS",
  );
  const handle = await fs.open(current, "r");
  try {
    const before = await handle.stat({ bigint: true });
    requireThat(
      before.isFile() && before.nlink === 1n && before.size <= BigInt(maximum),
      "FILE_KIND_BOUND",
    );
    if (expected.size !== undefined)
      requireThat(before.size === BigInt(expected.size), "FILE_SIZE");
    // A file can grow after fstat. Never use an unbounded readFile allocation here.
    const length = Number(before.size),
      bytes = Buffer.alloc(length);
    let offset = 0;
    while (offset < length) {
      const result = await handle.read(
        bytes,
        offset,
        Math.min(65536, length - offset),
        offset,
      );
      requireThat(result.bytesRead > 0, "FILE_SHORT_READ");
      offset += result.bytesRead;
    }
    const eof = await handle.read(Buffer.alloc(1), 0, 1, length);
    requireThat(eof.bytesRead === 0, "FILE_GREW");
    const after = await handle.stat({ bigint: true });
    requireThat(
      before.dev === after.dev &&
        before.ino === after.ino &&
        before.size === after.size &&
        before.mtimeNs === after.mtimeNs &&
        before.ctimeNs === after.ctimeNs &&
        BigInt(bytes.length) === after.size,
      "FILE_CHANGED",
    );
    requireThat(hash(bytes) === expected.sha256, "FILE_HASH");
    return bytes;
  } finally {
    await handle.close();
  }
}
export async function assertClosedDirectory(root, name, expectedFiles) {
  relativeName(name);
  const base = path.resolve(root, ...name.split("/")),
    found = [];
  async function walk(current, prefix, depth) {
    requireThat(depth <= 8, "DIRECTORY_DEPTH");
    const st = await fs.lstat(current);
    requireThat(st.isDirectory() && !st.isSymbolicLink(), "DIRECTORY_LINK");
    const entries = await fs.readdir(current, { withFileTypes: true });
    requireThat(entries.length <= 256, "DIRECTORY_BOUND");
    for (const entry of entries) {
      const relative = prefix + entry.name;
      relativeName(relative);
      requireThat(!entry.isSymbolicLink(), "DIRECTORY_LINK");
      if (entry.isDirectory())
        await walk(path.join(current, entry.name), relative + "/", depth + 1);
      else {
        requireThat(entry.isFile(), "DIRECTORY_KIND");
        found.push(relative);
        requireThat(found.length <= 256, "DIRECTORY_BOUND");
      }
    }
  }
  await walk(base, "", 0);
  requireThat(
    canonical([...found].sort()) === canonical([...expectedFiles].sort()),
    "DIRECTORY_CLOSED_SET",
  );
}
