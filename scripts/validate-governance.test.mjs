import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  findDuplicates,
  parseFrontmatter,
  readTomlString,
  validateGovernance,
} from "./lib/governance.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");

test("the checked-in governance configuration is valid", async () => {
  assert.deepEqual(await validateGovernance(repositoryRoot), []);
});

test("frontmatter and TOML primitives fail closed", () => {
  assert.deepEqual(parseFrontmatter("---\nname: sample\ndescription: safe\n---\nbody\n"), {
    name: "sample",
    description: "safe",
  });
  assert.equal(parseFrontmatter("name: missing-fence"), null);
  assert.equal(readTomlString('name = "reviewer"\n', "name"), "reviewer");
  assert.equal(readTomlString("name = 7\n", "name"), null);
  assert.deepEqual(findDuplicates(["a", "b", "a", "b"]), ["a", "b"]);
});

test("a duplicate skill name is detected", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "hedefora-governance-"));
  try {
    const source = await import("node:fs/promises");
    await source.cp(repositoryRoot, temporaryRoot, {
      recursive: true,
      filter: (entry) => {
        const relative = path.relative(repositoryRoot, entry);
        const excluded = new Set([".git", "node_modules", "dist", "coverage", ".pnpm-store"]);
        return relative === "" || !relative.split(path.sep).some((segment) => excluded.has(segment));
      },
    });
    const duplicatePath = path.join(temporaryRoot, ".agents", "skills", "cold-review", "SKILL.md");
    const document = await source.readFile(duplicatePath, "utf8");
    await writeFile(duplicatePath, document.replace("name: hedefora-cold-review", "name: hedefora-contract-change"));
    const errors = await validateGovernance(temporaryRoot);
    assert.ok(errors.some((error) => error.includes("duplicate skill name")));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
