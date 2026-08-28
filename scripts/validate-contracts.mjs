import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const spectralCli = require.resolve("@stoplight/spectral-cli");
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const commonArguments = [
  spectralCli,
  "lint",
  "--ruleset",
  ".spectral.yaml",
  "--fail-severity=warn",
];

const canonical = runSpectral("contracts/openapi/openapi.yaml");
if (canonical.status !== 0) {
  process.stderr.write(canonical.output);
  console.error("ERROR: canonical OpenAPI contract failed Spectral.");
  process.exitCode = 1;
} else {
  const negative = runSpectral(
    "contracts/openapi/fixtures/reject-webhook.yaml",
  );
  if (
    negative.status === 0 ||
    !negative.output.includes("w000-no-webhook-operations")
  ) {
    process.stderr.write(negative.output);
    console.error(
      "ERROR: W000 webhook negative fixture did not fail the expected structural rule.",
    );
    process.exitCode = 1;
  } else {
    console.log(
      "PASS: canonical OpenAPI 3.1 scaffold is valid and the webhook negative fixture is rejected.",
    );
  }
}

function runSpectral(relativePath) {
  const result = spawnSync(
    process.execPath,
    [...commonArguments, relativePath],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
    },
  );
  return {
    status: result.status,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}
