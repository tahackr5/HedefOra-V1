import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listRepositoryFiles } from "./list-repository-files.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptPath), "..");
const forbiddenRuntimeRoots = ["cmd", "db/migrations"];
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
      console.error(
        `ERROR: unexpected pre-runtime/generated artifact: ${finding}`,
      );
    }
    process.exitCode = 1;
  } else {
    console.log(
      "PASS: the W001 runtime boundary contains only allowlisted source paths and the exact generated OpenAPI artifact.",
    );
  }
}

export async function findGeneratedArtifacts(root) {
  const findings = [];
  for (const runtimeRoot of forbiddenRuntimeRoots) {
    if (await pathExists(path.join(root, ...runtimeRoot.split("/")))) {
      findings.push(runtimeRoot);
    }
  }

  const files = await listRepositoryFiles(root);
  for (const relativePath of files) {
    const normalized = relativePath.replaceAll("\\", "/");
    const fileStats = await lstat(path.join(root, relativePath));
    if (fileStats.isSymbolicLink()) {
      findings.push(`${normalized}#symbolic-link`);
      continue;
    }
    if (!fileStats.isFile()) continue;
    const isAllowedGeneratedSource =
      allowedW001GeneratedSourceFiles.has(normalized);
    if (normalized.startsWith("internal/") && !isAllowedGeneratedSource) {
      findings.push(`${normalized}#unexpected-runtime-source`);
      continue;
    }
    const pathParts = normalized.split("/");
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

export function isAllowedPreRuntimeSource(relativePath) {
  return (
    relativePath.startsWith("scripts/") ||
    relativePath.startsWith("tools/repolint/") ||
    allowedW001SupplyChainToolSourceFiles.has(relativePath) ||
    allowedW001GeneratedSourceFiles.has(relativePath) ||
    allowedW000FrontendSourceFiles.has(relativePath)
  );
}

async function pathExists(target) {
  try {
    await readdir(target);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}
