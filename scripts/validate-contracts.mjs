import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { negativeMutations } from "./fixtures/openapi-negative-mutations.mjs";

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
  "--format=json",
  "--fail-severity=warn",
  "--quiet",
];
const maximumContractBytes = 512 * 1024;
const spectralTimeoutMilliseconds = 15_000;
const internalReferenceLine = /^\s+\$ref: "#\/[A-Za-z0-9._~/%-]+"$/u;

if (isMainModule()) {
  validateContracts();
}

function isMainModule() {
  return path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url);
}

function validateContracts() {
  const canonicalPath = "contracts/openapi/openapi.yaml";
  let canonicalSource;
  try {
    canonicalSource = readContractSource(canonicalPath);
  } catch (error) {
    reportFailure(
      {
        status: null,
        diagnostics: [],
        output: "",
        launchError: `Contract preflight failed for ${canonicalPath}: ${error.message}`,
      },
      "canonical OpenAPI contract",
    );
    process.exitCode = 1;
    return;
  }

  const canonical = runSpectralSource(canonicalPath, canonicalSource);
  if (
    canonical.status !== 0 ||
    canonical.launchError !== null ||
    canonical.diagnostics.length !== 0
  ) {
    reportFailure(canonical, "canonical OpenAPI contract");
    process.exitCode = 1;
  } else {
    const failures = [];
    for (const fixture of negativeMutations) {
      const fixturePath = `contracts/openapi/fixtures/${fixture.name}.yaml`;
      let result;
      try {
        const mutatedSource = applySingleMutation(canonicalSource, fixture);
        result = runSpectralSource(fixturePath, mutatedSource);
      } catch (error) {
        result = {
          status: null,
          diagnostics: [],
          output: "",
          launchError: error.message,
        };
      }
      const exactRuleFound = result.diagnostics.some(
        (diagnostic) => diagnostic.code === fixture.rule,
      );
      const unexpectedContractRules = result.diagnostics
        .map((diagnostic) => diagnostic.code)
        .filter(
          (code) =>
            typeof code === "string" &&
            code.startsWith("w001-") &&
            code !== fixture.rule,
        );
      if (
        result.status !== 1 ||
        result.launchError !== null ||
        !exactRuleFound ||
        unexpectedContractRules.length > 0
      ) {
        failures.push({
          ...fixture,
          path: fixturePath,
          result,
          unexpectedContractRules,
        });
      }
    }

    if (failures.length > 0) {
      for (const failure of failures) {
        reportFixtureFailure(failure);
      }
      process.exitCode = 1;
    } else {
      console.log(
        `PASS: canonical OpenAPI is valid and ${negativeMutations.length} single-mutation, fail-closed contract fixtures produced only their exact diagnostics.`,
      );
    }
  }
}

function runSpectralSource(relativePath, source) {
  const reason = preflightContractSource(source);
  if (reason !== null) return preflightFailure(relativePath, reason);

  const result = spawnSync(
    process.execPath,
    [...commonArguments, "--stdin-filepath", relativePath],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
      input: source,
      maxBuffer: 2 * 1024 * 1024,
      timeout: spectralTimeoutMilliseconds,
      windowsHide: true,
    },
  );

  return parseSpectralProcessResult(result);
}

function readContractSource(relativePath) {
  const bytes = readFileSync(path.join(repositoryRoot, relativePath));
  if (bytes.length > maximumContractBytes) {
    throw new RangeError(
      `Contract exceeds the ${maximumContractBytes}-byte preflight limit.`,
    );
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function applySingleMutation(source, mutation) {
  if (
    typeof mutation.before !== "string" ||
    mutation.before.length === 0 ||
    typeof mutation.after !== "string" ||
    mutation.before === mutation.after
  ) {
    throw new TypeError(`${mutation.name} is not a non-empty source mutation.`);
  }
  const firstIndex = source.indexOf(mutation.before);
  if (firstIndex === -1) {
    throw new Error(`${mutation.name} mutation anchor was not found.`);
  }
  if (
    source.indexOf(mutation.before, firstIndex + mutation.before.length) !== -1
  ) {
    throw new Error(`${mutation.name} mutation anchor is not unique.`);
  }
  return `${source.slice(0, firstIndex)}${mutation.after}${source.slice(firstIndex + mutation.before.length)}`;
}

export function preflightContractSource(source) {
  if (source.includes("\0")) return "contract contains a NUL byte";
  if (source.includes("\\")) {
    return "contract contains forbidden escape syntax before reference resolution";
  }
  for (const [index, line] of source.split(/\r?\n/u).entries()) {
    if (line.includes("\r"))
      return `line ${index + 1} contains a bare carriage return`;
    if (line.includes("$dynamicRef") || line.includes("$recursiveRef")) {
      return `line ${index + 1} contains a forbidden dynamic reference`;
    }
    if (line.includes("$ref") && !internalReferenceLine.test(line)) {
      return `line ${index + 1} contains a non-canonical or external reference`;
    }
  }
  return null;
}

function preflightFailure(relativePath, message) {
  return {
    status: 1,
    diagnostics: [
      {
        code: "w001-no-external-ref",
        message,
        path: [],
        source: relativePath,
      },
    ],
    output: "",
    launchError: null,
  };
}

export function parseSpectralProcessResult(result) {
  if (result.error || result.status === null) {
    return {
      status: null,
      diagnostics: [],
      output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
      launchError:
        result.error?.message ?? "Spectral did not return an exit status.",
    };
  }

  if ((result.stderr?.trim() ?? "").length > 0) {
    return {
      status: result.status,
      diagnostics: [],
      output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
      launchError: "Spectral emitted unexpected stderr output.",
    };
  }

  const rawOutput = result.stdout?.trim() ?? "";
  try {
    if (rawOutput.length === 0) {
      throw new TypeError("Spectral JSON output is empty.");
    }
    const diagnostics = JSON.parse(rawOutput);
    if (!Array.isArray(diagnostics)) {
      throw new TypeError("Spectral JSON output is not an array.");
    }
    return {
      status: result.status,
      diagnostics,
      output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
      launchError: null,
    };
  } catch (error) {
    return {
      status: result.status,
      diagnostics: [],
      output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
      launchError: `Spectral emitted invalid JSON: ${error.message}`,
    };
  }
}

function reportFailure(result, label) {
  if (result.launchError) {
    console.error(`ERROR: ${label}: ${result.launchError}`);
  }
  if (result.output) {
    process.stderr.write(
      result.output.endsWith("\n") ? result.output : `${result.output}\n`,
    );
  }
  console.error(`ERROR: ${label} failed contract validation.`);
}

function reportFixtureFailure(failure) {
  const diagnosticCodes = [
    ...new Set(
      failure.result.diagnostics.map(
        (diagnostic) => diagnostic.code ?? "missing-code",
      ),
    ),
  ];
  if (failure.result.launchError) {
    console.error(
      `ERROR: negative fixture ${failure.path}: ${failure.result.launchError}`,
    );
  }
  console.error(
    `ERROR: negative fixture ${failure.path}; expected only contract rule ${failure.rule}; status=${failure.result.status}; contract-rules=${
      failure.result.diagnostics
        .map((diagnostic) => diagnostic.code)
        .filter((code) => typeof code === "string" && code.startsWith("w001-"))
        .join(",") || "none"
    }; all-diagnostic-codes=${diagnosticCodes.join(",") || "none"}.`,
  );
}
