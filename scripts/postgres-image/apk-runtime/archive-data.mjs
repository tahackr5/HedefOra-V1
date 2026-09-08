// Data-only APK v2/ustar subset. Never extracts to the host filesystem.
import { gunzipSync, inflateRawSync } from "node:zlib";
import { hash, requireThat as check } from "./sealed-io.mjs";
const decoder = new TextDecoder("utf-8", { fatal: true });
const text = (b) => decoder.decode(b).split("\0")[0];
function octal(b) {
  const s = text(b).trim();
  check(/^[0-7]+$/.test(s), "TAR_OCTAL");
  const n = parseInt(s, 8);
  check(Number.isSafeInteger(n), "TAR_NUMBER");
  return n;
}
export function archiveName(name) {
  check(
    typeof name === "string" &&
      name.length > 0 &&
      Buffer.byteLength(name) <= 4096 &&
      !name.startsWith("/") &&
      !/[\\\x00-\x1f\x7f:]/.test(name),
    "TAR_PATH",
  );
  const n = name.replace(/^\.\//, "").replace(/\/$/, "");
  check(
    n.length > 0 &&
      n
        .split("/")
        .every((p) => p && p !== "." && p !== ".." && !p.startsWith(".wh.")),
    "TAR_PATH_COMPONENT",
  );
  return n;
}
export function tarEntries(b, { profile = "ustar-closed" } = {}) {
  check(
    ["ustar-closed", "apk-v2-control", "apk-v2-index"].includes(profile),
    "TAR_PROFILE",
  );
  check(b.length <= 200000000 && b.length % 512 === 0, "TAR_BOUND");
  const out = [],
    names = new Set();
  let pax = null,
    count = 0,
    ended = false,
    zeroBlocks = 0;
  for (let o = 0; o < b.length;) {
    const h = b.subarray(o, o + 512);
    if (h.every((v) => v === 0)) {
      ended = true;
      zeroBlocks++;
      o += 512;
      continue;
    }
    check(!ended && ++count <= 50000, "TAR_TRAILING_OR_COUNT");
    const magic = h.subarray(257, 265);
    check(
      magic.equals(Buffer.from("ustar\0" + "00")) ||
        (profile === "apk-v2-index" && magic.equals(Buffer.from("ustar  \0"))),
      "TAR_MAGIC",
    );
    const size = octal(h.subarray(124, 136)),
      expected = octal(h.subarray(148, 156));
    let checksum = 0;
    for (let i = 0; i < 512; i++) checksum += i >= 148 && i < 156 ? 32 : h[i];
    check(
      checksum === expected &&
        size <= 150000000 &&
        o + 512 + Math.ceil(size / 512) * 512 <= b.length,
      "TAR_HEADER_BOUND",
    );
    let name = text(h.subarray(0, 100));
    const prefix = text(h.subarray(345, 500));
    if (prefix) name = prefix + "/" + name;
    const type = String.fromCharCode(h[156] || 48),
      data = b.subarray(o + 512, o + 512 + size);
    check(
      b
        .subarray(o + 512 + size, o + 512 + Math.ceil(size / 512) * 512)
        .every((v) => v === 0),
      "TAR_NONZERO_PADDING",
    );
    o += 512 + Math.ceil(size / 512) * 512;
    if (type === "x") {
      check(pax === null && data.length <= 32768, "TAR_PAX_BOUND");
      pax = Object.create(null);
      let p = 0;
      while (p < data.length) {
        const sp = data.indexOf(32, p);
        check(sp >= p && sp - p <= 10, "TAR_PAX_LENGTH");
        const lengthText = data.subarray(p, sp).toString();
        check(/^[1-9][0-9]*$/.test(lengthText), "TAR_PAX_LENGTH");
        const n = Number(lengthText);
        check(
          Number.isSafeInteger(n) &&
            n > sp - p + 2 &&
            p + n <= data.length &&
            data[p + n - 1] === 10,
          "TAR_PAX_BOUND",
        );
        const line = decoder.decode(data.subarray(sp + 1, p + n - 1)),
          eq = line.indexOf("=");
        check(eq > 0, "TAR_PAX_FIELD");
        const key = line.slice(0, eq);
        check(
          [
            "path",
            "linkpath",
            "mtime",
            "atime",
            "ctime",
            "APK-TOOLS.checksum.SHA1",
          ].includes(key) && pax[key] === undefined,
          "TAR_PAX_UNSUPPORTED",
        );
        pax[key] = line.slice(eq + 1);
        if (["mtime", "atime", "ctime"].includes(key))
          check(
            /^[0-9]{1,12}(?:[.][0-9]{1,9})?$/.test(pax[key]),
            "TAR_PAX_TIME",
          );
        p += n;
      }
      continue;
    }
    name = archiveName(pax?.path || name);
    const link = pax?.linkpath || text(h.subarray(157, 257));
    const sum = pax?.["APK-TOOLS.checksum.SHA1"];
    if (sum) {
      check(/^[a-f0-9]{40}$/.test(sum), "TAR_FILE_SHA1");
      if (type === "0") check(hash(data, "sha1") === sum, "TAR_FILE_SHA1");
    }
    pax = null;
    check(
      ["0", "1", "2", "5"].includes(type) && !names.has(name),
      "TAR_TYPE_OR_DUPLICATE",
    );
    names.add(name);
    const mode = octal(h.subarray(100, 108)),
      uid = octal(h.subarray(108, 116)),
      gid = octal(h.subarray(116, 124));
    check(
      mode <= 0o7777 && (mode & 0o6000) === 0 && (type === "0" || size === 0),
      "TAR_MODE_OR_DATA",
    );
    if (type === "1" || type === "2")
      check(link.length > 0 && !/[\\\x00-\x1f\x7f:]/.test(link), "TAR_LINK");
    out.push({ name, type, link, mode, uid, gid, data });
  }
  check(pax === null, "TAR_ORPHAN_PAX");
  // APK v2 signature/control gzip members intentionally omit tar EOF records.
  // This is a separate explicit format, never the OCI outer/layer default.
  if (profile !== "apk-v2-control") check(zeroBlocks >= 2, "TAR_TERMINATORS");
  return out;
}
export function gzipMembers(b) {
  check(b.length > 0 && b.length <= 100000000, "GZIP_BOUND");
  const out = [];
  let o = 0,
    inflated = 0;
  while (o < b.length) {
    check(
      out.length < 4 &&
        o + 10 <= b.length &&
        b[o] === 31 &&
        b[o + 1] === 139 &&
        b[o + 2] === 8,
      "GZIP_HEADER",
    );
    const start = o,
      flags = b[o + 3];
    check(!(flags & 224), "GZIP_FLAGS");
    o += 10;
    if (flags & 4) {
      check(o + 2 <= b.length, "GZIP_EXTRA");
      const n = b.readUInt16LE(o);
      o += 2 + n;
      check(o <= b.length, "GZIP_EXTRA_BOUND");
    }
    for (const flag of [8, 16])
      if (flags & flag) {
        let n = 0;
        while (b[o++] !== 0) check(++n <= 4096 && o < b.length, "GZIP_NAME");
      }
    if (flags & 2) o += 2;
    const r = inflateRawSync(b.subarray(o), {
      info: true,
      maxOutputLength: 200000000 - inflated,
    });
    const end = o + r.engine.bytesWritten + 8;
    check(end <= b.length, "GZIP_FOOTER");
    const compressed = b.subarray(start, end),
      data = gunzipSync(compressed, { maxOutputLength: 200000000 - inflated });
    check(data.equals(r.buffer), "GZIP_DISAGREEMENT");
    inflated += data.length;
    check(inflated <= 200000000, "GZIP_AGGREGATE_BOUND");
    out.push({ compressed, data });
    o = end;
  }
  return out;
}
function oct(b, n, o, l) {
  const s = n.toString(8).padStart(l - 1, "0") + "\0";
  check(s.length === l, "TAR_WRITE_OCTAL");
  b.write(s, o, l);
}
export function deterministicTar(items, epoch) {
  check(Number.isSafeInteger(epoch) && epoch >= 0, "TAR_EPOCH");
  const parts = [];
  let total = 1024;
  for (const e of items) {
    let name = archiveName(e.name),
      prefix = "";
    const h = Buffer.alloc(512);
    if (Buffer.byteLength(name) > 100) {
      const sep = name.lastIndexOf("/");
      prefix = name.slice(0, sep);
      name = name.slice(sep + 1);
      check(
        Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100,
        "TAR_LONG_PATH",
      );
    }
    check(Buffer.byteLength(e.link || "") <= 100, "TAR_LONG_LINK");
    h.write(name, 0, 100);
    oct(h, e.mode ?? 420, 100, 8);
    oct(h, e.uid ?? 0, 108, 8);
    oct(h, e.gid ?? 0, 116, 8);
    oct(h, e.data.length, 124, 12);
    oct(h, epoch, 136, 12);
    h.fill(32, 148, 156);
    h[156] = (e.type || "0").charCodeAt(0);
    h.write(e.link || "", 157, 100);
    h.write("ustar\0", 257, 6);
    h.write("00", 263, 2);
    h.write(prefix, 345, 155);
    const c = h.reduce((a, n) => a + n, 0);
    h.write(c.toString(8).padStart(6, "0") + "\0 ", 148, 8);
    const padding = Buffer.alloc((512 - (e.data.length % 512)) % 512);
    total += 512 + e.data.length + padding.length;
    check(total <= 200000000, "TAR_WRITE_BOUND");
    parts.push(h, e.data, padding);
  }
  parts.push(Buffer.alloc(1024));
  return Buffer.concat(parts);
}
export function validateVirtualTree(entries) {
  const map = new Map(entries.map((e) => [e.name, e]));
  check(map.size === entries.length, "TREE_DUPLICATE");
  function follow(parts) {
    let pending = [...parts],
      resolved = [],
      hops = 0;
    while (pending.length > 0) {
      const part = pending.shift();
      // Expand links before interpreting '..'. Keep empty/dot components so
      // regular-file/ and regular-file/. cannot masquerade as directories.
      const parent = map.get(resolved.join("/"));
      check(!parent || parent.type === "5", "NON_DIRECTORY_ANCESTOR");
      if (part === "" || part === ".") continue;
      if (part === "..") {
        check(resolved.length > 0, "LINK_ESCAPE");
        resolved.pop();
        continue;
      }
      const entry = map.get([...resolved, part].join("/"));
      if (entry?.type === "1") {
        // Linux hardlinks preserve a symlink inode instead of following it.
        // This closed profile accepts only a direct canonical regular target.
        check(
          archiveName(entry.link) === entry.link &&
            map.get(entry.link)?.type === "0",
          "HARDLINK_TARGET",
        );
        resolved = entry.link.split("/");
      } else if (entry?.type === "2") {
        check(++hops <= 40, "LINK_CYCLE");
        if (entry.link.startsWith("/")) resolved = [];
        pending = [...entry.link.split("/"), ...pending];
      } else resolved.push(part);
    }
    check(resolved.length > 0, "ROOT_LINK");
    return resolved.join("/");
  }
  for (const e of entries) {
    archiveName(e.name);
    const parents = e.name.split("/").slice(0, -1);
    for (let i = 1; i <= parents.length; i++) {
      const p = map.get(parents.slice(0, i).join("/"));
      check(!p || p.type === "5", "NON_DIRECTORY_ANCESTOR");
    }
    if (e.type === "1" || e.type === "2") {
      const resolved = follow(e.name.split("/"));
      if (e.type === "1")
        check(map.get(resolved)?.type === "0", "HARDLINK_TARGET");
    }
  }
  return {
    entries: entries.length,
    links: entries.filter((e) => e.type === "1" || e.type === "2").length,
  };
}
