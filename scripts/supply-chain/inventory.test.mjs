import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  InventoryContractError,
  assertOsvSourceInventoryParity,
  parsePnpmLockInventory,
} from "./inventory.mjs";

const repositoryLockUrl = new URL("../../pnpm-lock.yaml", import.meta.url);

test("current pnpm lock preserves both YAML documents and every package entry", async () => {
  const lockText = await readFile(repositoryLockUrl, "utf8");
  const inventory = parsePnpmLockInventory(lockText);

  assert.equal(inventory.documentCount, 2);
  assert.deepEqual(inventory.lockfileVersions, ["9.0", "9.0"]);
  assert.deepEqual(
    inventory.documents.map(({ packageCount }) => packageCount),
    [19, 527],
  );
  assert.equal(inventory.packageCount, 546);
  for (const document of inventory.documents) {
    assert.ok(document.text.endsWith("\n"));
    assert.doesNotMatch(document.text, /^---$/m);
    const reparsed = parsePnpmLockInventory(document.text, {
      source: document.source,
    });
    assert.equal(reparsed.documentCount, 1);
    assert.deepEqual(
      reparsed.packages.map(({ name, version, peerSuffix }) => ({
        name,
        version,
        peerSuffix,
      })),
      document.packages.map(({ name, version, peerSuffix }) => ({
        name,
        version,
        peerSuffix,
      })),
    );
  }
  assert.deepEqual(inventory.scopeCounts, {
    dependencies: 2,
    devDependencies: 21,
    optionalDependencies: 0,
    peerDependencies: 0,
    configDependencies: 0,
    packageManagerDependencies: 2,
    unknown: 0,
  });
});

test("OSV parity rejects the only-first-document false green", async () => {
  const lockText = await readFile(repositoryLockUrl, "utf8");
  const inventory = parsePnpmLockInventory(lockText);
  const expectedSources = inventory.documents.map((document, index) => ({
    source: `/run/input/pnpm-lock-document-${index + 1}.yaml`,
    packages: document.packages,
  }));
  const firstDocumentOnly = {
    results: [osvSource(expectedSources[0])],
  };

  assertContractError(
    () => assertOsvSourceInventoryParity(expectedSources, firstDocumentOnly),
    "OSV_SOURCE_MISMATCH",
  );
});

test("document splitting rejects empty, duplicate, and malformed documents", () => {
  assertContractError(() => parsePnpmLockInventory(""), "EMPTY_LOCKFILE");
  assertContractError(
    () => parsePnpmLockInventory("---\n---\n"),
    "EMPTY_DOCUMENT",
  );
  assertContractError(
    () => parsePnpmLockInventory("--- \npackages:\n  foo@1.0.0:\n"),
    "MALFORMED_DOCUMENT_SEPARATOR",
  );
  assertContractError(
    () =>
      parsePnpmLockInventory(
        "---\nlockfileVersion: '9.0'\npackages:\n  foo@1.0.0:\n---\nlockfileVersion: '9.0'\npackages:\n  foo@1.0.0:\n",
      ),
    "DUPLICATE_DOCUMENT",
  );
  assertContractError(
    () => parsePnpmLockInventory("lockfileVersion: '9.0'\n"),
    "MISSING_PACKAGES",
  );
  assertContractError(
    () => parsePnpmLockInventory(v9("packages: {}\n")),
    "EMPTY_PACKAGES",
  );
  assertContractError(
    () =>
      parsePnpmLockInventory(
        "lockfileVersion: '8.0'\npackages:\n  foo@1.0.0:\n",
      ),
    "LOCKFILE_VERSION_MISMATCH",
  );
  assertContractError(
    () => parsePnpmLockInventory("packages:\n  foo@1.0.0:\n"),
    "MISSING_LOCKFILE_VERSION",
  );
});

test("package parsing rejects duplicate and malformed physical entries", () => {
  assertContractError(
    () => parsePnpmLockInventory(v9("packages:\n  foo@1.0.0:\n  foo@1.0.0:\n")),
    "DUPLICATE_PACKAGE_ENTRY",
  );
  assertContractError(
    () => parsePnpmLockInventory(v9("packages:\n  '@scope/no-version':\n")),
    "MALFORMED_PACKAGE_KEY",
  );
  assertContractError(
    () => parsePnpmLockInventory(v9("packages:\n   foo@1.0.0:\n")),
    "MALFORMED_INDENTATION",
  );
});

test("scoped, unscoped, and peer-qualified keys normalize without set deduplication", () => {
  const inventory = parsePnpmLockInventory(
    v9(`packages:
  plain@1.2.3:
  '@scope/pkg@2.0.0(peer@1.0.0)':
  plain@1.2.3(peer@1.0.0):
  plain@1.2.3(peer@2.0.0):
`),
  );

  assert.deepEqual(
    inventory.packages.map(({ name, version, peerSuffix }) => ({
      name,
      version,
      peerSuffix,
    })),
    [
      { name: "plain", version: "1.2.3", peerSuffix: "" },
      {
        name: "@scope/pkg",
        version: "2.0.0",
        peerSuffix: "(peer@1.0.0)",
      },
      { name: "plain", version: "1.2.3", peerSuffix: "(peer@1.0.0)" },
      { name: "plain", version: "1.2.3", peerSuffix: "(peer@2.0.0)" },
    ],
  );
  assert.equal(
    inventory.packages.filter(
      ({ name, version }) => name === "plain" && version === "1.2.3",
    ).length,
    3,
  );
});

test("importer inventory counts every known scope and retains unknown sections", () => {
  const inventory = parsePnpmLockInventory(
    v9(`importers:
  .:
    dependencies:
      prod:
    devDependencies:
      dev:
    optionalDependencies:
      optional:
    peerDependencies:
      peer:
    configDependencies:
      config:
    packageManagerDependencies:
      manager:
    futureDependencies:
      future:
packages:
  prod@1.0.0:
`),
  );

  assert.deepEqual(inventory.scopeCounts, {
    dependencies: 1,
    devDependencies: 1,
    optionalDependencies: 1,
    peerDependencies: 1,
    configDependencies: 1,
    packageManagerDependencies: 1,
    unknown: 1,
  });
  assert.deepEqual(
    inventory.directDependencies.map(({ name, scope, section }) => ({
      name,
      scope,
      section,
    })),
    [
      { name: "prod", scope: "dependencies", section: "dependencies" },
      { name: "dev", scope: "devDependencies", section: "devDependencies" },
      {
        name: "optional",
        scope: "optionalDependencies",
        section: "optionalDependencies",
      },
      { name: "peer", scope: "peerDependencies", section: "peerDependencies" },
      {
        name: "config",
        scope: "configDependencies",
        section: "configDependencies",
      },
      {
        name: "manager",
        scope: "packageManagerDependencies",
        section: "packageManagerDependencies",
      },
      { name: "future", scope: "unknown", section: "futureDependencies" },
    ],
  );
});

test("inline-empty importer mappings cannot hide nested dependency entries", () => {
  assertContractError(
    () =>
      parsePnpmLockInventory(
        v9(`importers: {}
  hidden:
packages:
  visible@1.0.0:
`),
      ),
    "MALFORMED_IMPORTERS",
  );
  assertContractError(
    () =>
      parsePnpmLockInventory(
        v9(`importers:
  .: {}
    dependencies:
      hidden:
packages:
  visible@1.0.0:
`),
      ),
    "MALFORMED_IMPORTER",
  );
  assertContractError(
    () =>
      parsePnpmLockInventory(
        v9(`importers:
  .:
    dependencies: {}
      hidden:
packages:
  visible@1.0.0:
`),
      ),
    "MALFORMED_IMPORTER_SCOPE",
  );
});

test("OSV parity accepts exact multisets and rejects missing, extra, and duplicate results", () => {
  const expectedSources = [
    {
      source: "/run/input/document-1.yaml",
      packages: [
        { name: "plain", version: "1.0.0" },
        { name: "plain", version: "1.0.0" },
        { name: "@scope/pkg", version: "2.0.0" },
      ],
    },
  ];
  const exact = {
    results: [osvSource(expectedSources[0])],
  };
  assert.equal(assertOsvSourceInventoryParity(expectedSources, exact), true);

  const missing = {
    results: [
      osvSource({
        source: expectedSources[0].source,
        packages: expectedSources[0].packages.slice(1),
      }),
    ],
  };
  assertContractError(
    () => assertOsvSourceInventoryParity(expectedSources, missing),
    "OSV_INVENTORY_MISMATCH",
  );

  const extra = {
    results: [
      osvSource({
        source: expectedSources[0].source,
        packages: [
          ...expectedSources[0].packages,
          { name: "extra", version: "3.0.0" },
        ],
      }),
    ],
  };
  assertContractError(
    () => assertOsvSourceInventoryParity(expectedSources, extra),
    "OSV_INVENTORY_MISMATCH",
  );

  const duplicate = {
    results: [
      osvSource({
        source: expectedSources[0].source,
        packages: [
          ...expectedSources[0].packages,
          { name: "plain", version: "1.0.0" },
        ],
      }),
    ],
  };
  assertContractError(
    () => assertOsvSourceInventoryParity(expectedSources, duplicate),
    "OSV_INVENTORY_MISMATCH",
  );

  const sourceDrift = {
    results: [
      osvSource({
        source: "/run/input/renamed.yaml",
        packages: expectedSources[0].packages,
      }),
    ],
  };
  assertContractError(
    () => assertOsvSourceInventoryParity(expectedSources, sourceDrift),
    "OSV_SOURCE_MISMATCH",
  );
});

function osvSource({ source, packages }) {
  return {
    source: { path: source, type: "lockfile" },
    packages: packages.map(({ name, version }) => ({
      package: { ecosystem: "npm", name, version },
      vulnerabilities: [],
    })),
  };
}

function v9(body) {
  return `lockfileVersion: '9.0'\n${body}`;
}

function assertContractError(callback, expectedCode) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof InventoryContractError);
    assert.equal(error.code, expectedCode);
    assert.match(error.message, new RegExp(`^${expectedCode}: `));
    return true;
  });
}
