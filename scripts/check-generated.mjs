import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptPath), "..");
const excludedDirectories = new Set([
  ".git",
  ".cache",
  ".pnpm-store",
  "artifacts",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);
const forbiddenRuntimeRoots = ["cmd", "internal", "db/migrations"];
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
const textExtensions = new Set([
  ".css",
  ".go",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".ps1",
  ".py",
  ".sh",
  ".sql",
  ".toml",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);

if (path.resolve(process.argv[1] ?? "") === path.resolve(scriptPath)) {
  const findings = await findGeneratedArtifacts(repositoryRoot);
  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(
        `ERROR: unexpected W000 runtime/generated artifact: ${finding}`,
      );
    }
    process.exitCode = 1;
  } else {
    console.log(
      "PASS: W000 has no unexpected runtime source paths, generated directories, filenames or source markers.",
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

  const files = await collectFiles(root, "", findings);
  for (const relativePath of files) {
    const normalized = relativePath.replaceAll("\\", "/");
    if (
      normalized === "scripts/check-generated.mjs" ||
      normalized === "scripts/check-generated.test.mjs"
    ) {
      continue;
    }
    if (generatedFilename.test(normalized)) {
      findings.push(normalized);
      continue;
    }
    if (textExtensions.has(path.extname(normalized))) {
      const contents = await readFile(path.join(root, relativePath), "utf8");
      if (generatedMarker.test(contents)) {
        findings.push(`${normalized}#generated-marker`);
        continue;
      }
      if (
        path.extname(normalized) === ".html" &&
        forbiddenHtmlBehavior.test(contents)
      ) {
        findings.push(`${normalized}#inline-behavior`);
        continue;
      }
    }
    if (
      executableSourceExtensions.has(path.extname(normalized)) &&
      !isAllowedW000Source(normalized)
    ) {
      findings.push(`${normalized}#unexpected-source`);
    }
  }
  return [...new Set(findings)].sort();
}

function isAllowedW000Source(relativePath) {
  return (
    relativePath.startsWith("scripts/") ||
    relativePath.startsWith("tools/repolint/") ||
    allowedW000FrontendSourceFiles.has(relativePath)
  );
}

async function collectFiles(directory, relativeDirectory, findings) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isSymbolicLink()) {
      findings.push(`${relativePath.replaceAll("\\", "/")}#symbolic-link`);
    } else if (entry.isDirectory()) {
      if (excludedDirectories.has(entry.name)) {
        continue;
      }
      if (entry.name.toLowerCase() === "generated") {
        findings.push(relativePath.replaceAll("\\", "/"));
        continue;
      }
      files.push(
        ...(await collectFiles(
          path.join(directory, entry.name),
          relativePath,
          findings,
        )),
      );
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
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
