import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { generateKeyPairSync, sign } from "node:crypto";
import {
  strict,
  closed,
  hash,
  readSealed,
  relativeName,
  assertClosedDirectory,
} from "./sealed-io.mjs";
import {
  archiveName,
  tarEntries,
  gzipMembers,
  deterministicTar,
  validateVirtualTree,
} from "./archive-data.mjs";
import { pkginfo, verifySignatureMember } from "./apk-byte-replay.mjs";
import { INSPECTION, ADMISSION_AUTHORITY } from "./fixed-authority.mjs";

const H = "a".repeat(64);
const file = (name, data = "fixture") => ({
  name,
  data: Buffer.from(data),
  type: "0",
  link: "",
  uid: 0,
  gid: 0,
  mode: 420,
});

test("strict JSON rejects duplicate escaped keys and invalid UTF8", () => {
  assert.throws(() => strict('{"x":1,"\\u0078":2}', "synthetic"));
  assert.throws(() => strict(Buffer.from([0xff]), "synthetic"));
});
test("strict JSON bounds recursion before protected recursive parser", () =>
  assert.throws(
    () => strict("[".repeat(65) + "0" + "]".repeat(65), "synthetic"),
    /DEPTH/,
  ));
test("strict parser strings containing braces do not affect depth", () =>
  assert.equal(strict('{"x":"[[{\\\""}', "synthetic").x, '[[{"'));
test("closed schema rejects extra and missing keys", () => {
  assert.throws(() => closed({ a: 1, pass: true }, ["a"], "synthetic"));
  assert.throws(() => closed({}, ["a"], "synthetic"));
});
for (const name of [
  "../x",
  "/x",
  "x\\y",
  "x:y",
  "x//y",
  "x/./y",
  "x/../y",
  "x.",
  "x ",
])
  test("sealed path rejects " + name, () =>
    assert.throws(() => relativeName(name)),
  );
test("sealed bytes read exact hash and reject mutation, symlink, and hardlink", async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "hedefora-synthetic-sealed-test-"),
  );
  const target = path.join(root, "fixture.bin");
  await fs.writeFile(target, "synthetic");
  assert.equal(
    (
      await readSealed(root, "fixture.bin", {
        sha256: hash("synthetic"),
        size: 9,
      })
    ).toString(),
    "synthetic",
  );
  await assert.rejects(
    readSealed(root, "fixture.bin", { sha256: H }),
    /FILE_HASH/,
  );
  await assert.rejects(
    readSealed(root, "fixture.bin", { sha256: hash("synthetic"), size: 8 }),
    /FILE_SIZE/,
  );
  await fs.link(target, path.join(root, "hardlink.bin"));
  await assert.rejects(
    readSealed(root, "hardlink.bin", { sha256: hash("synthetic") }),
    /FILE_KIND_BOUND/,
  );
  const nested = path.join(root, "nested");
  await fs.mkdir(nested);
  await fs.writeFile(path.join(nested, "fixture.bin"), "synthetic");
  await fs.symlink(
    nested,
    path.join(root, "junction"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await assert.rejects(
    readSealed(root, "junction/fixture.bin", { sha256: hash("synthetic") }),
    /PATH_LINK/,
  );
  // Keep tiny synthetic fixture dir for reproducibility; never delete another agent's files.
});
test("OCI data directory rejects an unreferenced extra file", async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "hedefora-synthetic-closed-oci-"),
  );
  await fs.mkdir(path.join(root, "oci"));
  await fs.writeFile(path.join(root, "oci", "index.json"), "{}");
  await assertClosedDirectory(root, "oci", ["index.json"]);
  await fs.writeFile(path.join(root, "oci", "extra.json"), "{}");
  await assert.rejects(
    assertClosedDirectory(root, "oci", ["index.json"]),
    /CLOSED_SET/,
  );
});
test("sealed reads remain allocation-bounded when a handle reports growth or a short read", async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "hedefora-synthetic-read-race-"),
  );
  await fs.writeFile(path.join(root, "fixture.bin"), "synthetic");
  const originalOpen = fs.open;
  const allocations = [];
  let mode = "growth";
  try {
    fs.open = async (...args) => {
      const handle = await originalOpen(...args);
      return {
        stat: (...a) => handle.stat(...a),
        close: () => handle.close(),
        readFile: () => {
          throw new Error("UNBOUNDED_READ_FORBIDDEN");
        },
        read: async (buffer, offset, length, position) => {
          allocations.push(buffer.length);
          if (mode === "short") return { bytesRead: 0, buffer };
          if (position === 9) return { bytesRead: 1, buffer };
          return handle.read(buffer, offset, length, position);
        },
      };
    };
    await assert.rejects(
      readSealed(root, "fixture.bin", { sha256: hash("synthetic") }),
      /FILE_GREW/,
    );
    mode = "short";
    await assert.rejects(
      readSealed(root, "fixture.bin", { sha256: hash("synthetic") }),
      /FILE_SHORT_READ/,
    );
    assert.ok(allocations.every((n) => n <= 9));
    assert.ok(allocations.includes(1));
  } finally {
    fs.open = originalOpen;
  }
});
for (const name of ["../x", "a/../../x", ".wh.x", "a/.wh..wh..opq", "/x"])
  test("archive path rejects " + name, () =>
    assert.throws(() => archiveName(name)),
  );
test("deterministic tar roundtrip and checksum failure", () => {
  const b = deterministicTar([file("payload")], 123);
  assert.equal(tarEntries(b)[0].data.toString(), "fixture");
  const corrupt = Buffer.from(b);
  corrupt[0] ^= 1;
  assert.throws(() => tarEntries(corrupt), /TAR_HEADER/);
});
test("tar rejects hidden records after terminator and duplicate paths", () => {
  const b = deterministicTar([file("x")], 123);
  assert.throws(
    () => tarEntries(Buffer.concat([Buffer.alloc(512), b])),
    /TRAILING/,
  );
  assert.throws(
    () => tarEntries(deterministicTar([file("x"), file("x")], 123)),
    /DUPLICATE/,
  );
});
test("OCI tar requires two terminators; APK control omission is an explicit separate profile", () => {
  const b = deterministicTar([file("x")], 123);
  assert.throws(() => tarEntries(b.subarray(0, -1024)), /TERMINATORS/);
  assert.throws(() => tarEntries(b.subarray(0, -512)), /TERMINATORS/);
  assert.equal(
    tarEntries(b.subarray(0, -1024), { profile: "apk-v2-control" }).length,
    1,
  );
  assert.throws(() => tarEntries(b, { profile: "unknown" }), /PROFILE/);
});
test("tar rejects nonzero payload padding and unsupported magic even with correct header checksum", () => {
  const b = deterministicTar([file("x")], 123),
    padding = Buffer.from(b);
  padding[512 + 7] = 1;
  assert.throws(() => tarEntries(padding), /PADDING/);
  const magic = Buffer.from(b);
  magic[257] = 0;
  magic.fill(32, 148, 156);
  const sum = magic.subarray(0, 512).reduce((a, n) => a + n, 0);
  magic.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8);
  assert.throws(() => tarEntries(magic), /MAGIC/);
});
test("tar rejects setid and devices", () => {
  assert.throws(
    () => tarEntries(deterministicTar([{ ...file("x"), mode: 0o4755 }], 123)),
    /MODE/,
  );
  assert.throws(
    () => tarEntries(deterministicTar([{ ...file("x", ""), type: "3" }], 123)),
    /TYPE/,
  );
});
test("gzip members enforce integrity, format, and finite count", () => {
  const g = gzipSync(Buffer.from("synthetic"));
  assert.equal(gzipMembers(g)[0].data.toString(), "synthetic");
  const corrupt = Buffer.from(g);
  corrupt[corrupt.length - 8] ^= 1;
  assert.throws(() => gzipMembers(corrupt));
  assert.throws(
    () => gzipMembers(Buffer.concat(Array(5).fill(g))),
    /GZIP_HEADER/,
  );
});
test("virtual links reject escape, cycles, and non-directory ancestor", () => {
  assert.throws(
    () =>
      validateVirtualTree([
        { ...file("x", ""), type: "2", link: "../../outside" },
      ]),
    /ESCAPE/,
  );
  assert.throws(
    () => validateVirtualTree([{ ...file("x", ""), type: "2", link: "x" }]),
    /CYCLE/,
  );
  assert.throws(
    () => validateVirtualTree([file("x"), file("x/y")]),
    /ANCESTOR/,
  );
});
test("PKGINFO duplicate identity cannot shadow signed original", () => {
  assert.throws(
    () => pkginfo(Buffer.from("pkgname = safe\npkgname = evil\n")),
    /DUPLICATE/,
  );
});
test("virtual link traversal expands symlinks before parent components", () => {
  const dir = (name) => ({ ...file(name, ""), type: "5" });
  const sym = (name, link) => ({ ...file(name, ""), type: "2", link });
  assert.throws(
    () =>
      validateVirtualTree([
        dir("d"),
        dir("d/e"),
        sym("s", "/d/e"),
        file("rootleaf"),
        sym("rootlink", "s/../rootleaf"),
        sym("d/rootleaf", "/rootlink"),
      ]),
    /LINK_CYCLE/,
  );
  assert.throws(
    () => validateVirtualTree([sym("x", "y/../ok"), sym("y", "x"), file("ok")]),
    /LINK_CYCLE/,
  );
  assert.throws(
    () =>
      validateVirtualTree([
        dir("d"),
        sym("s", "/d"),
        sym("x", "s/../../outside"),
      ]),
    /LINK_ESCAPE/,
  );
  for (const target of ["plain/../ok", "plain/.", "plain/"]) {
    assert.throws(
      () => validateVirtualTree([file("plain"), file("ok"), sym("x", target)]),
      /NON_DIRECTORY_ANCESTOR/,
    );
  }
  assert.deepEqual(
    validateVirtualTree([
      dir("d"),
      file("d/file"),
      sym("a", "d"),
      sym("x", "a/../a/file"),
      { ...file("hard", ""), type: "1", link: "x" },
    ]),
    { entries: 5, links: 3 },
  );
  assert.doesNotThrow(() =>
    validateVirtualTree([file("implicit/file"), sym("x", "implicit/./file")]),
  );
});
test("synthetic RSA-SHA1 verification rejects altered control and wrong key", () => {
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048 }),
    signed = gzipSync(Buffer.from("synthetic control"));
  const keyname = "synthetic.rsa.pub",
    sig = sign("RSA-SHA1", signed, pair.privateKey);
  const member = deterministicTar([file(".SIGN.RSA." + keyname, sig)], 123);
  verifySignatureMember(member, signed, new Map([[keyname, pair.publicKey]]));
  assert.throws(
    () =>
      verifySignatureMember(
        member,
        Buffer.from("altered"),
        new Map([[keyname, pair.publicKey]]),
      ),
    /INVALID/,
  );
  assert.throws(
    () => verifySignatureMember(member, signed, new Map()),
    /UNTRUSTED/,
  );
  const wrong = generateKeyPairSync("rsa", { modulusLength: 2048 });
  assert.throws(
    () =>
      verifySignatureMember(
        member,
        signed,
        new Map([[keyname, wrong.publicKey]]),
      ),
    /INVALID/,
  );
});
test("byte inspector has no admission authority or capability allocator", () => {
  assert.equal(INSPECTION, null);
  assert.equal(ADMISSION_AUTHORITY, null);
});
