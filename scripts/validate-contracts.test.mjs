import assert from "node:assert/strict";
import test from "node:test";
import {
  applySingleMutation,
  parseSpectralProcessResult,
  preflightContractSource,
} from "./validate-contracts.mjs";

test("applies exactly one anchored source mutation", () => {
  assert.equal(
    applySingleMutation("before target after", {
      name: "fixture",
      before: "target",
      after: "replacement",
    }),
    "before replacement after",
  );
});

for (const fixture of [
  { name: "missing anchor", source: "source", before: "absent" },
  { name: "duplicate anchor", source: "target target", before: "target" },
]) {
  test(`rejects ${fixture.name} mutation definitions`, () => {
    assert.throws(() =>
      applySingleMutation(fixture.source, {
        name: fixture.name,
        before: fixture.before,
        after: "replacement",
      }),
    );
  });
}

test("allows only canonical in-document reference lines", () => {
  assert.equal(
    preflightContractSource(
      'schema:\n  $ref: "#/components/schemas/ErrorEnvelope"\n',
    ),
    null,
  );
});

for (const fixture of [
  {
    name: "external reference",
    source: 'schema:\n  $ref: "https://example.invalid/schema.yaml"\n',
  },
  {
    name: "quoted reference key",
    source: 'schema:\n  "$ref": "#/components/schemas/Value"\n',
  },
  {
    name: "escaped reference key",
    source:
      'schema:\n  "\\\\u0024ref": "https://example.invalid/schema.yaml"\n',
  },
  {
    name: "dynamic reference",
    source: 'schema:\n  $dynamicRef: "#/components/schemas/Value"\n',
  },
  {
    name: "recursive reference",
    source: 'schema:\n  $recursiveRef: "#/components/schemas/Value"\n',
  },
  {
    name: "bare carriage return",
    source: "schema:\rvalue\n",
  },
  {
    name: "NUL byte",
    source: "schema:\0value\n",
  },
]) {
  test(`preflight rejects ${fixture.name} before Spectral`, () => {
    assert.equal(typeof preflightContractSource(fixture.source), "string");
  });
}

test("accepts an explicit JSON diagnostic array", () => {
  assert.deepEqual(
    parseSpectralProcessResult({
      status: 0,
      stdout: "[]\n",
      stderr: "",
      error: undefined,
    }),
    {
      status: 0,
      diagnostics: [],
      output: "[]\n",
      launchError: null,
    },
  );
});

test("preserves exact diagnostics and nonzero status", () => {
  const diagnostic = { code: "fixture-rule" };
  const result = parseSpectralProcessResult({
    status: 1,
    stdout: JSON.stringify([diagnostic]),
    stderr: "",
    error: undefined,
  });
  assert.equal(result.status, 1);
  assert.deepEqual(result.diagnostics, [diagnostic]);
  assert.equal(result.launchError, null);
});

test("rejects unexpected stderr even with valid JSON", () => {
  const result = parseSpectralProcessResult({
    status: 0,
    stdout: "[]\n",
    stderr: "warning\n",
    error: undefined,
  });
  assert.equal(result.status, 0);
  assert.deepEqual(result.diagnostics, []);
  assert.match(result.launchError, /unexpected stderr/u);
});

for (const fixture of [
  {
    name: "empty output",
    stdout: "",
    pattern: /output is empty/u,
  },
  {
    name: "invalid JSON",
    stdout: "not-json",
    pattern: /invalid JSON/u,
  },
  {
    name: "non-array JSON",
    stdout: "{}",
    pattern: /not an array/u,
  },
]) {
  test(`rejects ${fixture.name} even when Spectral exits zero`, () => {
    const result = parseSpectralProcessResult({
      status: 0,
      stdout: fixture.stdout,
      stderr: "",
      error: undefined,
    });
    assert.equal(result.status, 0);
    assert.deepEqual(result.diagnostics, []);
    assert.match(result.launchError, fixture.pattern);
  });
}

test("rejects launch failures without inventing a status", () => {
  const result = parseSpectralProcessResult({
    status: null,
    stdout: "",
    stderr: "",
    error: new Error("launch failed"),
  });
  assert.equal(result.status, null);
  assert.deepEqual(result.diagnostics, []);
  assert.match(result.launchError, /launch failed/u);
});
