import { readFile, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptPath), "..");
const expectedInventory = new Map([
  ["react", { version: "19.2.8", license: "MIT" }],
  ["react-dom", { version: "19.2.8", license: "MIT" }],
  ["scheduler", { version: "0.27.0", license: "MIT" }],
]);

if (path.resolve(process.argv[1] ?? "") === path.resolve(scriptPath)) {
  const inventory = await collectProductionInventory(
    path.join(repositoryRoot, "apps", "web", "package.json"),
  );
  const errors = validateLicenseInventory(inventory, expectedInventory);
  if (errors.length > 0) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
  } else {
    console.log(
      "PASS: W000 production dependency graph is exactly react, react-dom and scheduler under MIT.",
    );
  }
}

export async function collectProductionInventory(rootManifestPath) {
  const rootManifest = JSON.parse(await readFile(rootManifestPath, "utf8"));
  const queue = Object.keys(rootManifest.dependencies ?? {}).map((name) => ({
    name,
    fromManifest: rootManifestPath,
  }));
  const inventory = new Map();
  const visitedManifests = new Set();

  while (queue.length > 0) {
    const { name, fromManifest } = queue.shift();
    const requireFromParent = createRequire(fromManifest);
    const manifestPath = requireFromParent.resolve(`${name}/package.json`);
    const canonicalPath = await realpath(manifestPath);
    if (visitedManifests.has(canonicalPath)) continue;
    visitedManifests.add(canonicalPath);

    const manifest = JSON.parse(await readFile(canonicalPath, "utf8"));
    inventory.set(manifest.name, {
      version: manifest.version,
      license: normalizeLicense(manifest.license),
    });
    for (const dependencyName of Object.keys(manifest.dependencies ?? {})) {
      queue.push({ name: dependencyName, fromManifest: canonicalPath });
    }
  }
  return inventory;
}

export function validateLicenseInventory(inventory, expected) {
  const errors = [];
  for (const [name, metadata] of inventory) {
    const wanted = expected.get(name);
    if (!wanted) {
      errors.push(
        `unexpected production dependency: ${name}@${metadata.version}`,
      );
      continue;
    }
    if (metadata.version !== wanted.version) {
      errors.push(
        `${name}: version ${metadata.version} differs from reviewed ${wanted.version}`,
      );
    }
    if (metadata.license !== wanted.license) {
      errors.push(
        `${name}: license ${metadata.license ?? "MISSING"} differs from reviewed ${wanted.license}`,
      );
    }
  }
  for (const name of expected.keys()) {
    if (!inventory.has(name)) {
      errors.push(`reviewed production dependency is absent: ${name}`);
    }
  }
  return errors.sort();
}

function normalizeLicense(license) {
  if (typeof license === "string" && license.trim()) return license.trim();
  if (license && typeof license.type === "string") return license.type.trim();
  return null;
}
