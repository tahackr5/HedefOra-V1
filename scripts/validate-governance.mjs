import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateGovernance } from "./lib/governance.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const errors = await validateGovernance(repositoryRoot);

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`ERROR: ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log("PASS: Codex agents, skills and governance fixtures are consistent.");
}

