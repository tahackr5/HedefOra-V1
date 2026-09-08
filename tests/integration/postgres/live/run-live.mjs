import { LiveError } from "./process.mjs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Public dispatch is intentionally closed while DQ-010 image admission is
// absent. Root owns replacing this fixed null authority with a reviewed import
// from the trusted controller, never a target path, JSON object, flag or env.
// live-runtime.mjs exports only the internal trusted-controller/test seam.
const rootExecutionAuthority = null;

export async function runPg17LiveGate() {
  if (rootExecutionAuthority === null)
    throw new LiveError("PG_IMAGE_ADMISSION_REQUIRED");
  throw new LiveError("TRUSTED_CONTROLLER_BINDING_REQUIRED");
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await runPg17LiveGate();
  } catch (error) {
    process.stdout.write(
      JSON.stringify({
        status: "BLOCKED_SECURITY",
        scope: "disposable-pg17-live",
        execution: "NOT_RUN",
        code: error instanceof LiveError ? error.code : "LIVE_GATE_FAILED",
      }) + "\n",
    );
    process.exitCode = 1;
  }
}
