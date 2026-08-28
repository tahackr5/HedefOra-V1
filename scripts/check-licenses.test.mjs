import assert from "node:assert/strict";
import test from "node:test";
import { validateLicenseInventory } from "./check-licenses.mjs";

test("production license inventory rejects drift and copyleft surprises", () => {
  const expected = new Map([
    ["react", { version: "19.2.8", license: "MIT" }],
    ["scheduler", { version: "0.27.0", license: "MIT" }],
  ]);
  const actual = new Map([
    ["react", { version: "19.2.7", license: "MIT" }],
    ["surprise", { version: "1.0.0", license: "GPL-3.0" }],
  ]);

  assert.deepEqual(validateLicenseInventory(actual, expected), [
    "react: version 19.2.7 differs from reviewed 19.2.8",
    "reviewed production dependency is absent: scheduler",
    "unexpected production dependency: surprise@1.0.0",
  ]);
});
