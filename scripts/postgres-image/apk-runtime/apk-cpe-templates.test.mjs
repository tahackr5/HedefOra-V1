import test from "node:test";
import assert from "node:assert/strict";
import { deriveApkHeuristicCpes } from "./apk-cpe-templates.mjs";
test("literal libpq package heuristic is not PostgreSQL upstream coverage", () => {
  assert.deepEqual(
    deriveApkHeuristicCpes({
      name: "libpq",
      version: "18.6-r0",
      upstreamURL: "https://www.postgresql.org/",
    }),
    ["cpe:2.3:a:libpq:libpq:18.6-r0:*:*:*:*:*:*:*"],
  );
});
test("version stream alias preserves signed APK version", () => {
  const v = deriveApkHeuristicCpes({
    name: "postgresql17",
    version: "17.11-r0",
    upstreamURL: "https://www.postgresql.org/",
  });
  assert.equal(v.length, 4);
  assert.ok(
    v.includes("cpe:2.3:a:postgresql:postgresql:17.11-r0:*:*:*:*:*:*:*"),
  );
});
test("literal escaped plus survives without weakening bounded profile", () => {
  assert.deepEqual(
    deriveApkHeuristicCpes({
      name: "libstdc++",
      version: "15.2.0-r5",
      upstreamURL: "https://gcc.gnu.org",
    }),
    [String.raw`cpe:2.3:a:libstdc\+\+:libstdc\+\+:15.2.0-r5:*:*:*:*:*:*:*`],
  );
});
test("unknown packages and malformed versions require new review", () => {
  assert.throws(() =>
    deriveApkHeuristicCpes({
      name: "unknown",
      version: "1.0-r0",
      upstreamURL: "",
    }),
  );
  assert.throws(() =>
    deriveApkHeuristicCpes({ name: "musl", version: "*", upstreamURL: "" }),
  );
});
