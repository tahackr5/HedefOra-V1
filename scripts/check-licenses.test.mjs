import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  collectProductionInventory,
  validateLicenseInventory,
} from "./check-licenses.mjs";

test("production license inventory rejects drift and copyleft surprises", () => {
  const expected = new Map([
    ["react", { version: "19.2.8", license: "MIT" }],
    ["scheduler", { version: "0.27.0", license: "MIT" }],
  ]);
  const actual = [
    { name: "react", version: "19.2.7", license: "MIT" },
    { name: "surprise", version: "1.0.0", license: "GPL-3.0" },
  ];

  assert.deepEqual(validateLicenseInventory(actual, expected), [
    "react: version 19.2.7 differs from reviewed 19.2.8",
    "reviewed production dependency is absent: scheduler",
    "unexpected production dependency: surprise@1.0.0",
  ]);
});

test("production license inventory retains conflicting metadata for the same package version", () => {
  const expected = new Map([["shared", { version: "1.0.0", license: "MIT" }]]);
  const actual = [
    { name: "shared", version: "1.0.0", license: "MIT" },
    { name: "shared", version: "1.0.0", license: "GPL-3.0" },
  ];

  assert.deepEqual(validateLicenseInventory(actual, expected), [
    "shared: license GPL-3.0 differs from reviewed MIT",
  ]);
});

test("production inventory traverses optional and peer dependencies and preserves multiple versions", async (t) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), "hedefora-license-inventory-"),
  );
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }));

  const rootManifestPath = path.join(fixtureRoot, "app", "package.json");
  await writeManifest(rootManifestPath, {
    name: "fixture-app",
    private: true,
    dependencies: {
      container: "1.0.0",
      "peer-container": "1.0.0",
      scheduler: "0.26.0",
    },
    optionalDependencies: {
      "optional-surprise": "1.0.0",
    },
  });
  await writeManifest(
    path.join(fixtureRoot, "app", "node_modules", "container", "package.json"),
    {
      name: "container",
      version: "1.0.0",
      license: "MIT",
      dependencies: { scheduler: "0.27.0" },
      optionalDependencies: { "transitive-optional": "1.0.0" },
    },
  );
  await writeManifest(
    path.join(
      fixtureRoot,
      "app",
      "node_modules",
      "container",
      "node_modules",
      "scheduler",
      "package.json",
    ),
    { name: "scheduler", version: "0.27.0", license: "MIT" },
  );
  await writeManifest(
    path.join(
      fixtureRoot,
      "app",
      "node_modules",
      "container",
      "node_modules",
      "transitive-optional",
      "package.json",
    ),
    { name: "transitive-optional", version: "1.0.0", license: "MIT" },
  );
  await writeManifest(
    path.join(fixtureRoot, "app", "node_modules", "scheduler", "package.json"),
    { name: "scheduler", version: "0.26.0", license: "MIT" },
  );
  await writeManifest(
    path.join(
      fixtureRoot,
      "app",
      "node_modules",
      "optional-surprise",
      "package.json",
    ),
    { name: "optional-surprise", version: "1.0.0", license: "GPL-3.0" },
  );
  await writeManifest(
    path.join(
      fixtureRoot,
      "app",
      "node_modules",
      "peer-container",
      "package.json",
    ),
    {
      name: "peer-container",
      version: "1.0.0",
      license: "MIT",
      peerDependencies: { "peer-host": "1.0.0" },
    },
  );
  await writeManifest(
    path.join(fixtureRoot, "app", "node_modules", "peer-host", "package.json"),
    { name: "peer-host", version: "1.0.0", license: "MIT" },
  );

  const inventory = await collectProductionInventory(rootManifestPath);
  assert.deepEqual(
    inventory.map(({ name, version }) => `${name}@${version}`),
    [
      "container@1.0.0",
      "optional-surprise@1.0.0",
      "peer-container@1.0.0",
      "peer-host@1.0.0",
      "scheduler@0.26.0",
      "scheduler@0.27.0",
      "transitive-optional@1.0.0",
    ],
  );

  const expected = new Map([
    ["container", { version: "1.0.0", license: "MIT" }],
    ["peer-container", { version: "1.0.0", license: "MIT" }],
    ["scheduler", { version: "0.27.0", license: "MIT" }],
  ]);
  assert.deepEqual(validateLicenseInventory(inventory, expected), [
    "scheduler: multiple installed versions: 0.26.0, 0.27.0",
    "scheduler: version 0.26.0 differs from reviewed 0.27.0",
    "unexpected production dependency: optional-surprise@1.0.0",
    "unexpected production dependency: peer-host@1.0.0",
    "unexpected production dependency: transitive-optional@1.0.0",
  ]);
});

test("production inventory fails closed when a declared optional dependency is absent", async (t) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), "hedefora-license-missing-optional-"),
  );
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }));
  const rootManifestPath = path.join(fixtureRoot, "app", "package.json");
  await writeManifest(rootManifestPath, {
    name: "fixture-app",
    private: true,
    optionalDependencies: { missing: "1.0.0" },
  });

  await assert.rejects(collectProductionInventory(rootManifestPath), {
    code: "MODULE_NOT_FOUND",
  });
});

async function writeManifest(manifestPath, manifest) {
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, "utf8");
}
