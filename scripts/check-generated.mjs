import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contract = await readFile(path.join(repositoryRoot, "contracts", "openapi", "openapi.yaml"), "utf8");
const errors = [];

if (!/^openapi:\s+3\.1\.0\s*$/m.test(contract)) {
  errors.push("canonical contract must remain OpenAPI 3.1.0");
}
if (!/^paths:\s*\{\}\s*$/m.test(contract)) {
  errors.push("W000 contract paths must remain empty; operations belong to W001");
}

for (const generatedPath of ["apps/web/src/generated", "internal/generated"]) {
  try {
    await access(path.join(repositoryRoot, generatedPath));
    errors.push(`unexpected W000 generated artifact: ${generatedPath}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exitCode = 1;
} else {
  console.log("PASS: W000 has no generated API artifacts or runtime operations.");
}

