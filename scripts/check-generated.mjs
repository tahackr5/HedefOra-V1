import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  listRepositoryFiles,
  listTrackedRepositoryEntries,
} from "./list-repository-files.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptPath), "..");
const generatedMarker = /(?:Code generated .* DO NOT EDIT|@generated)/i;
const generatedFilename = /\.(?:gen|generated)(?:\.[^/]+)?$/i;
const forbiddenHtmlBehavior =
  /(?:<script\b(?![^>]*\bsrc\s*=)[^>]*>|\son[a-z]+\s*=|javascript\s*:)/i;
const executableSourceExtensions = new Set([
  ".bash",
  ".cjs",
  ".cts",
  ".go",
  ".html",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ps1",
  ".py",
  ".sh",
  ".ts",
  ".tsx",
]);
const allowedW000FrontendSourceFiles = new Set([
  "apps/web/eslint.config.js",
  "apps/web/index.html",
  "apps/web/src/App.test.tsx",
  "apps/web/src/App.tsx",
  "apps/web/src/main.tsx",
  "apps/web/src/test/setup.ts",
  "apps/web/src/vite-env.d.ts",
  "apps/web/vite.config.ts",
]);
const allowedW001SupplyChainToolSourceFiles = new Set([
  "tools/osvdbcheck/cmd/osvdbcheck/main.go",
  "tools/osvdbcheck/cmd/osvdbcheck/main_test.go",
]);
export const allowedW001GeneratedSourceFiles = new Set([
  "internal/generated/openapi/openapi.gen.go",
]);
export const allowedW001RuntimeSourceFiles = new Set([
  "cmd/hedefora/main.go",
  "cmd/hedefora/main_test.go",
  "internal/platform/app/api.go",
  "internal/platform/app/api_test.go",
  "internal/platform/config/api.go",
  "internal/platform/config/api_test.go",
  "internal/platform/health/service.go",
  "internal/platform/health/service_test.go",
  "internal/platform/http/handler.go",
  "internal/platform/http/handler_test.go",
  "internal/platform/http/server.go",
  "internal/platform/http/server_test.go",
  "internal/platform/telemetry/telemetry.go",
  "internal/platform/telemetry/telemetry_test.go",
]);
export const allowedW001DatabaseFiles = new Set([
  "db/migrations/000001_database_foundation.down.sql",
  "db/migrations/000001_database_foundation.up.sql",
  "db/migrations/SHA256SUMS",
]);
export const allowedW001InfrastructureFiles = new Set([
  "infra/README.md",
  "infra/compose.dev.yml",
  "infra/postgres/README.md",
  "infra/postgres/initdb/010_roles.sql",
]);
export const allowedW001PostgresTestSourceFiles = new Set([
  "tests/integration/postgres/run.mjs",
  "tests/integration/postgres/run.test.mjs",
]);
const runtimeFilesystemRoots = new Set([
  "cmd",
  "db",
  "infra",
  "internal",
  "tests",
]);
const allowedW001RuntimeFilesystemFiles = new Set([
  ...allowedW001DatabaseFiles,
  ...allowedW001GeneratedSourceFiles,
  ...allowedW001InfrastructureFiles,
  ...allowedW001PostgresTestSourceFiles,
  ...allowedW001RuntimeSourceFiles,
]);
const generatedMarkerDefinitionFiles = new Set([
  "scripts/check-generated.mjs",
  "scripts/check-generated.test.mjs",
  "scripts/generate-openapi.mjs",
  "scripts/generate-openapi.test.mjs",
]);
if (path.resolve(process.argv[1] ?? "") === path.resolve(scriptPath)) {
  const findings = await findGeneratedArtifacts(repositoryRoot);
  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`ERROR: unexpected runtime/generated artifact: ${finding}`);
    }
    process.exitCode = 1;
  } else {
    console.log(
      "PASS: the W001 runtime/database boundary contains only allowlisted source paths and the exact generated OpenAPI artifact.",
    );
  }
}

export async function findGeneratedArtifacts(root) {
  const findings = [];
  const runtimeInventory = await findRuntimeFilesystemArtifacts(root);
  findings.push(...runtimeInventory.findings);
  for (const expected of allowedW001RuntimeFilesystemFiles) {
    if (!runtimeInventory.seenPaths.has(expected)) {
      findings.push(`${expected}#missing-runtime-source`);
    }
  }

  const trackedEntries = await listTrackedRepositoryEntries(root, [
    ...allowedW001RuntimeFilesystemFiles,
  ]);
  if (trackedEntries === null) {
    findings.push(".git#runtime-inventory-unavailable");
  } else {
    const entriesByPath = new Map();
    for (const entry of trackedEntries) {
      const entries = entriesByPath.get(entry.path) ?? [];
      entries.push(entry);
      entriesByPath.set(entry.path, entries);
    }
    for (const expected of allowedW001RuntimeFilesystemFiles) {
      const entries = entriesByPath.get(expected);
      if (!entries) {
        findings.push(`${expected}#untracked-runtime-source`);
      } else if (
        entries.length !== 1 ||
        !isRegularRuntimeIndexEntry(entries[0])
      ) {
        findings.push(`${expected}#invalid-runtime-index-entry`);
      } else if (runtimeInventory.regularPaths.has(expected)) {
        const bytes = await readFile(path.join(root, ...expected.split("/")));
        if (
          gitBlobObjectId(bytes, entries[0].objectId.length) !==
          entries[0].objectId
        ) {
          findings.push(`${expected}#invalid-runtime-index-entry`);
        }
      }
    }
    for (const entry of trackedEntries) {
      const trackedRoot = entry.path.split("/")[0]?.toLowerCase();
      if (
        runtimeFilesystemRoots.has(trackedRoot) &&
        !allowedW001RuntimeFilesystemFiles.has(entry.path)
      ) {
        findings.push(`${entry.path}#unexpected-runtime-source`);
      }
    }
  }

  const files = await listRepositoryFiles(root);
  for (const relativePath of files) {
    const normalized = relativePath;
    if (isRuntimeRootAlias(normalized)) {
      findings.push(`${normalized}#unexpected-runtime-source`);
      continue;
    }
    const pathParts = normalized.split("/");
    if (runtimeFilesystemRoots.has(pathParts[0]?.toLowerCase())) {
      continue;
    }
    const fileStats = await lstat(path.join(root, relativePath));
    if (fileStats.isSymbolicLink()) {
      findings.push(`${normalized}#symbolic-link`);
      continue;
    }
    if (!fileStats.isFile()) continue;
    const isAllowedGeneratedSource =
      allowedW001GeneratedSourceFiles.has(normalized);
    if (
      normalized.startsWith("internal/") &&
      !isAllowedGeneratedSource &&
      !allowedW001RuntimeSourceFiles.has(normalized)
    ) {
      findings.push(`${normalized}#unexpected-runtime-source`);
      continue;
    }
    const generatedDirectoryIndex = pathParts.findIndex(
      (part) => part.toLowerCase() === "generated",
    );
    if (generatedDirectoryIndex >= 0 && !isAllowedGeneratedSource) {
      findings.push(pathParts.slice(0, generatedDirectoryIndex + 1).join("/"));
      continue;
    }
    if (generatedMarkerDefinitionFiles.has(normalized)) {
      continue;
    }
    if (generatedFilename.test(normalized) && !isAllowedGeneratedSource) {
      findings.push(normalized);
      continue;
    }
    const extension = path.extname(normalized).toLowerCase();
    const document = await readFile(path.join(root, relativePath));
    if (!document.includes(0)) {
      const contents = document.toString("utf8");
      if (generatedMarker.test(contents) && !isAllowedGeneratedSource) {
        findings.push(`${normalized}#generated-marker`);
        continue;
      }
      if (extension === ".html" && forbiddenHtmlBehavior.test(contents)) {
        findings.push(`${normalized}#inline-behavior`);
        continue;
      }
    }
    if (
      executableSourceExtensions.has(extension) &&
      !isAllowedPreRuntimeSource(normalized)
    ) {
      findings.push(`${normalized}#unexpected-source`);
    }
  }
  return [...new Set(findings)].sort();
}

async function findRuntimeFilesystemArtifacts(root) {
  const findings = [];
  const seenPaths = new Set();
  const regularPaths = new Set();
  const rootEntries = await readdir(root, { withFileTypes: true });
  for (const entry of rootEntries) {
    if (isRuntimeRootAlias(entry.name)) {
      findings.push(`${entry.name}#unexpected-runtime-source`);
      continue;
    }
    if (!runtimeFilesystemRoots.has(entry.name.toLowerCase())) continue;
    await inspectRuntimeFilesystemPath(
      path.join(root, entry.name),
      entry.name,
      findings,
      seenPaths,
      regularPaths,
    );
  }
  return { findings, regularPaths, seenPaths };
}

async function inspectRuntimeFilesystemPath(
  absolutePath,
  relativePath,
  findings,
  seenPaths,
  regularPaths,
) {
  const normalized = relativePath;
  seenPaths.add(normalized);
  const fileStats = await lstat(absolutePath);
  if (fileStats.isSymbolicLink()) {
    findings.push(`${normalized}#symbolic-link`);
    return;
  }
  if (fileStats.isDirectory()) {
    if (allowedW001RuntimeFilesystemFiles.has(normalized)) {
      findings.push(`${normalized}#unexpected-runtime-source`);
      return;
    }
    const entries = await readdir(absolutePath, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      await inspectRuntimeFilesystemPath(
        path.join(absolutePath, entry.name),
        `${relativePath}/${entry.name}`,
        findings,
        seenPaths,
        regularPaths,
      );
    }
    return;
  }
  if (
    !fileStats.isFile() ||
    !allowedW001RuntimeFilesystemFiles.has(normalized)
  ) {
    findings.push(`${normalized}#unexpected-runtime-source`);
  } else {
    regularPaths.add(normalized);
  }
}

function isRuntimeRootAlias(relativePath) {
  const separator = relativePath.indexOf("\\");
  return (
    separator > 0 &&
    runtimeFilesystemRoots.has(relativePath.slice(0, separator).toLowerCase())
  );
}

function isRegularRuntimeIndexEntry(entry) {
  return (
    entry.indexTag === "H" &&
    !entry.intentToAdd &&
    entry.stage === 0 &&
    (entry.mode === "100644" || entry.mode === "100755") &&
    !/^0+$/u.test(entry.objectId)
  );
}

function gitBlobObjectId(bytes, objectIdLength) {
  const algorithm = objectIdLength === 40 ? "sha1" : "sha256";
  return createHash(algorithm)
    .update(`blob ${bytes.byteLength}\0`)
    .update(bytes)
    .digest("hex");
}

export function isAllowedPreRuntimeSource(relativePath) {
  return (
    relativePath.startsWith("scripts/") ||
    relativePath.startsWith("tools/repolint/") ||
    allowedW001DatabaseFiles.has(relativePath) ||
    allowedW001SupplyChainToolSourceFiles.has(relativePath) ||
    allowedW001GeneratedSourceFiles.has(relativePath) ||
    allowedW001InfrastructureFiles.has(relativePath) ||
    allowedW001PostgresTestSourceFiles.has(relativePath) ||
    allowedW001RuntimeSourceFiles.has(relativePath) ||
    allowedW000FrontendSourceFiles.has(relativePath)
  );
}
