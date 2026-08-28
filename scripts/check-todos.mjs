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
const scannableExtensions = new Set([
  "",
  ".bash",
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
const policyLines = new Set([
  "- Untracked TODO yasaktır.",
  "- Untracked TODO yasaktır. Takip edilen TODO issue, owner ve son tarih taşır; mevcut acceptance'ı bypass edemez.",
  "- no untracked TODO,",
  "- [ ] No secret/untracked TODO",
]);
const markerPattern = new RegExp(
  `\\b(?:${["TO", "DO"].join("")}|FIXME|XXX)\\b`,
  "i",
);
const separatedTodoPattern = /\bTO(?:\s*-\s*|\s+)DO\b/;
const packageCommandIdentifier = /\btodo:check\b/gi;

if (path.resolve(process.argv[1] ?? "") === path.resolve(scriptPath)) {
  const findings = await findWorkMarkers(repositoryRoot);
  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`ERROR: untracked work marker at ${finding}`);
    }
    process.exitCode = 1;
  } else {
    console.log("PASS: no untracked work markers in code or configuration.");
  }
}

export async function findWorkMarkers(root) {
  const findings = [];
  const workingTreeFiles = await collectFiles(root);
  for (const relativePath of workingTreeFiles) {
    if (
      !scannableExtensions.has(path.extname(relativePath)) ||
      ["scripts/check-todos.mjs", "scripts/check-todos.test.mjs"].includes(
        relativePath.replaceAll("\\", "/"),
      )
    ) {
      continue;
    }
    const contents = await readFile(path.join(root, relativePath), "utf8");
    contents.split(/\r?\n/).forEach((line, index) => {
      const inspectedLine =
        relativePath.replaceAll("\\", "/") === "package.json"
          ? line.replace(packageCommandIdentifier, "")
          : line;
      if (
        (markerPattern.test(inspectedLine) ||
          separatedTodoPattern.test(inspectedLine)) &&
        !policyLines.has(line.trim())
      ) {
        findings.push(`${relativePath.replaceAll("\\", "/")}:${index + 1}`);
      }
    });
  }
  return findings.sort();
}

async function collectFiles(directory, relativeDirectory = "") {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) {
        files.push(
          ...(await collectFiles(
            path.join(directory, entry.name),
            relativePath,
          )),
        );
      }
      continue;
    }
    if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}
