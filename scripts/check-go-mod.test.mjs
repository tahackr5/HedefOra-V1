import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  acquireGoModules,
  annotateRestoredPins,
  assertCanonicalManifests,
  goEnvironment,
  requireGoSuccess,
  securityModulePins,
  validateSourceEntry,
} from "./check-go-mod.mjs";

test("module replacement preflight runs offline before acquisition", () => {
  for (const Replace of [null, []]) {
    const calls = [];
    acquireGoModules((arguments_, acquisition = false) => {
      calls.push({ arguments_, acquisition });
      return JSON.stringify({ Replace });
    });
    assert.deepEqual(calls, [
      { arguments_: ["mod", "edit", "-json"], acquisition: false },
      { arguments_: ["mod", "download", "all"], acquisition: true },
      { arguments_: ["mod", "verify"], acquisition: false },
    ]);
  }
});

test("every replacement and malformed inventory is rejected before acquisition", () => {
  const replacements = [
    { Old: { Path: "example.invalid/source" }, New: { Path: "../outside" } },
    { Old: { Path: "example.invalid/source" }, New: { Path: "/outside" } },
    { Old: { Path: "example.invalid/source" }, New: { Path: "C:/outside" } },
    {
      Old: { Path: "example.invalid/source", Version: "v1.0.0" },
      New: { Path: "example.invalid/replacement", Version: "v1.0.1" },
    },
  ];
  for (const document of [
    ...replacements.map((replacement) => ({ Replace: [replacement] })),
    { Replace: [null] },
    { Replace: [{}] },
    { Replace: {} },
    { Replace: "" },
    { Replace: false },
    { Replace: 0 },
    {},
    null,
    [],
    "not-an-object",
    0,
    false,
  ]) {
    const calls = [];
    assert.throws(
      () =>
        acquireGoModules((arguments_, acquisition = false) => {
          calls.push({ arguments_, acquisition });
          return JSON.stringify(document);
        }),
      /replacement preflight/,
    );
    assert.deepEqual(calls, [
      { arguments_: ["mod", "edit", "-json"], acquisition: false },
    ]);
  }
  for (const output of ["", "undefined", "{private-source-marker"]) {
    const calls = [];
    assert.throws(
      () =>
        acquireGoModules((arguments_, acquisition = false) => {
          calls.push({ arguments_, acquisition });
          return output;
        }),
      (error) =>
        error.message.includes("preflight") &&
        !error.message.includes("private-source-marker"),
    );
    assert.deepEqual(calls, [
      { arguments_: ["mod", "edit", "-json"], acquisition: false },
    ]);
  }
  let calls = 0;
  assert.throws(
    () =>
      acquireGoModules(() => {
        calls += 1;
        throw new Error("private-source-marker");
      }),
    (error) =>
      error.message.includes("preflight") &&
      !error.message.includes("private-source-marker"),
  );
  assert.equal(calls, 1);
});

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
