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
const generatedFilename = /(?:\.gen\.go|\.generated\.(?:ts|tsx))$/i;
const textExtensions = new Set([
  ".go",
  ".js",
  ".mjs",
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
      "PASS: W000 has no forbidden runtime roots, generated directories, filenames or source markers.",
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
      }
    }
  }
  return [...new Set(findings)].sort();
}

async function collectFiles(directory, relativeDirectory, findings) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
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
