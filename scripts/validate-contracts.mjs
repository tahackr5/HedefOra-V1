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
  const negativeFixtures = [
    {
      path: "contracts/openapi/fixtures/reject-path-operation.yaml",
      rule: "w000-no-path-operations",
    },
    {
      path: "contracts/openapi/fixtures/reject-webhook.yaml",
      rule: "w000-no-webhook-operations",
    },
  ];
  const failedFixture = negativeFixtures.find(({ path, rule }) => {
    const result = runSpectral(path);
    if (result.status !== 0 && result.output.includes(rule)) return false;
    process.stderr.write(result.output);
    console.error(
      `ERROR: W000 negative fixture ${path} did not fail the expected ${rule} rule.`,
    );
    return true;
  });
  if (failedFixture) {
    process.exitCode = 1;
  } else {
    console.log(
      "PASS: canonical OpenAPI 3.1 scaffold is valid and path/webhook operation fixtures are rejected by their exact W000 rules.",
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
