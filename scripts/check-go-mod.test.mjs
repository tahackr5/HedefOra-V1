import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  annotateRestoredPins,
  assertCanonicalManifests,
  goEnvironment,
  requireGoSuccess,
  securityModulePins,
  validateSourceEntry,
} from "./check-go-mod.mjs";

test("only three reviewed exact security graph pins are restored", () => {
  assert.deepEqual(securityModulePins, [
    "github.com/yuin/goldmark@v1.7.17",
    "golang.org/x/mod@v0.40.0",
    "golang.org/x/text@v0.41.0",
  ]);
  assert.ok(Object.isFrozen(securityModulePins));
});

test("Go execution environment excludes caller configuration and credentials", () => {
  const inherited = {
    PATH: "/tools",
    GOPROXY: "https://untrusted.invalid",
    GOFLAGS: "-modfile=evil.mod",
    GOTOOLCHAIN: "auto",
    GOWORK: "/evil/go.work",
    GIT_CONFIG_COUNT: "1",
    HTTPS_PROXY: "http://secret.invalid",
    GITHUB_TOKEN: "test-only",
  };
  const acquisition = goEnvironment("/temporary", true, inherited);
  const offline = goEnvironment("/temporary", false, inherited);
  assert.equal(acquisition.GOPROXY, "https://proxy.golang.org");
  assert.equal(acquisition.GOSUMDB, "sum.golang.org");
  assert.equal(offline.GOPROXY, "off");
  assert.equal(offline.GOSUMDB, "off");
  for (const env of [acquisition, offline]) {
    assert.equal(env.GOTOOLCHAIN, "local");
    assert.equal(env.GOWORK, "off");
    assert.equal(env.GOENV, "off");
    assert.equal(env.GOVCS, "*:off");
    assert.equal(env.GOFLAGS, "");
    assert.equal(env.GIT_CONFIG_COUNT, undefined);
    assert.equal(env.HTTPS_PROXY, undefined);
    assert.equal(env.GITHUB_TOKEN, undefined);
  }
});

test("manifest comparison rejects every byte drift including lost security pins", () => {
  const expected = {
    "go.mod": Buffer.from("module test\nrequire pinned v1.0.0\n"),
    "go.sum": Buffer.from("hash\n"),
  };
  assert.doesNotThrow(() => assertCanonicalManifests(expected, expected));
  for (const name of ["go.mod", "go.sum"]) {
    for (const value of [
      undefined,
      "text",
      Buffer.alloc(0),
      Buffer.concat([expected[name], Buffer.from("\n")]),
    ]) {
      assert.throws(
        () =>
          assertCanonicalManifests(expected, { ...expected, [name]: value }),
        /drift/,
      );
    }
  }
});

test("only pins removed by tidy regain their indirect annotation", () => {
  const document =
    "module test\n\nrequire (\n" +
    securityModulePins.map((pin) => "\t" + pin.replace("@", " ")).join("\n") +
    "\n)\n";
  const result = annotateRestoredPins(document, [
    { Path: "golang.org/x/text", Indirect: false },
  ]);
  assert.ok(result.includes("github.com/yuin/goldmark v1.7.17 // indirect"));
  assert.ok(result.includes("golang.org/x/mod v0.40.0 // indirect"));
  assert.ok(result.includes("golang.org/x/text v0.41.0\n"));
  assert.throws(() =>
    annotateRestoredPins(document.replace("v1.7.17", "v1.7.16"), []),
  );
  assert.throws(() => annotateRestoredPins(document + document, []));
  assert.throws(() => annotateRestoredPins(document, null));
});

test("source inventory is exact Git-byte, stage, mode, flag and path bound", () => {
  const bytes = Buffer.from("package example\n");
  const objectId = createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
  const entry = {
    path: "internal/example.go",
    objectId,
    mode: "100644",
    stage: 0,
    indexTag: "H",
    intentToAdd: false,
  };
  assert.doesNotThrow(() => validateSourceEntry(entry, bytes));
  for (const mutation of [
    { path: "../example.go" },
    { path: "internal/../example.go" },
    { path: "internal\\example.go" },
    { path: "/example.go" },
    { mode: "120000" },
    { mode: "160000" },
    { stage: 1 },
    { indexTag: "h" },
    { indexTag: "S" },
    { intentToAdd: true },
    { objectId: "0".repeat(40) },
  ]) {
    assert.throws(() => validateSourceEntry({ ...entry, ...mutation }, bytes));
  }
  assert.throws(() =>
    validateSourceEntry(entry, Buffer.from("package changed\n")),
  );
});

test("nonzero, timeout and launch errors cannot become success or leak stderr", () => {
  assert.doesNotThrow(() => requireGoSuccess({ status: 0 }, "tidy"));
  for (const result of [
    { status: 1 },
    { status: null },
    { status: 0, signal: "SIGTERM" },
    { status: 0, error: new Error("private-source-marker") },
  ]) {
    assert.throws(
      () =>
        requireGoSuccess(
          { ...result, stderr: "private-source-marker" },
          "tidy",
        ),
      (error) =>
        !error.message.includes("private-source-marker") &&
        error.message.includes("failed"),
    );
  }
});
