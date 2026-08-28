import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listRepositoryFiles } from "./list-repository-files.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptPath), "..");
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
const separatedTodoPattern = /\bTO(?:\s*-\s*|\s+)DO\b/i;
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
  const workingTreeFiles = await listRepositoryFiles(root);
  for (const relativePath of workingTreeFiles) {
    const fileStats = await lstat(path.join(root, relativePath));
    if (
      fileStats.isSymbolicLink() ||
      !fileStats.isFile() ||
      ["scripts/check-todos.mjs", "scripts/check-todos.test.mjs"].includes(
        relativePath.replaceAll("\\", "/"),
      )
    ) {
      continue;
    }
    const document = await readFile(path.join(root, relativePath));
    if (document.includes(0)) continue;
    const contents = document.toString("utf8");
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
