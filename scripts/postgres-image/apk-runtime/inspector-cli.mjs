// Explicit data-only inspection. Exit 0 means byte replay only, NEVER vulnerability/execution admission.
import path from "node:path";
import { inspectFixedCandidate } from "./apk-byte-replay.mjs";
import { ADMISSION_AUTHORITY } from "./fixed-authority.mjs";
if (
  process.argv.length !== 4 ||
  process.argv[2] !== "--byte-replay" ||
  !path.isAbsolute(process.argv[3])
) {
  process.stderr.write(
    "Usage: node inspector-cli.mjs --byte-replay <absolute-artifact-directory>\n",
  );
  process.exitCode = 2;
} else {
  try {
    if (ADMISSION_AUTHORITY !== null)
      throw new Error(
        "Inspector-only stage forbids a populated execution authority.",
      );
    const result = await inspectFixedCandidate(process.argv[3]);
    process.stdout.write(
      JSON.stringify({
        ...result,
        authority: "ABSENT",
        executionCapability: null,
        model: "UNKNOWN",
        effort: "UNKNOWN",
      }) + "\n",
    );
  } catch (error) {
    process.stdout.write(
      JSON.stringify({
        status: "FAIL",
        scope: "FIXED_RESEARCH_BYTE_REPLAY_ONLY",
        executionAdmission: "NOT_ADMITTED",
        executionCapability: null,
        error: error.message,
      }) + "\n",
    );
    process.exitCode = 1;
  }
}
