import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scannableExtensions = new Set([".go", ".js", ".json", ".mjs", ".toml", ".ts", ".tsx", ".yaml", ".yml"]);
const markerPattern = new RegExp(`\\b(?:${["TO", "DO"].join("")}|FIXME|XXX)\\b`);
const trackedFiles = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], {
  cwd: repositoryRoot,
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);

const findings = [];
for (const relativePath of trackedFiles) {
  if (!scannableExtensions.has(path.extname(relativePath)) || relativePath === "scripts/check-todos.mjs") {
    continue;
  }
  const contents = await readFile(path.join(repositoryRoot, relativePath), "utf8");
  contents.split(/\r?\n/).forEach((line, index) => {
    if (markerPattern.test(line)) findings.push(`${relativePath}:${index + 1}`);
  });
}

if (findings.length > 0) {
  for (const finding of findings) console.error(`ERROR: untracked work marker at ${finding}`);
  process.exitCode = 1;
} else {
  console.log("PASS: no untracked work markers in code or configuration.");
}
