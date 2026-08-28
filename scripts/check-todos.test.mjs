import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { findWorkMarkers } from "./check-todos.mjs";

test("work markers are case-insensitive across code, docs, SQL and shell", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hedefora-work-markers-"));
  try {
    await mkdir(path.join(root, "nested"));
    const fixtures = {
      Dockerfile: "# TODO pin the runtime\n",
      "README.md": "todo: replace this copy\n",
      "config.json": '{"note":"TODO remove fallback"}\n',
      "index.html": "<!-- FIXME replace shell -->\n",
      "migration.sql": "-- FixMe add an index\n",
      "script.sh": "# xxx remove this branch\n",
      "styles.css": "/* XXX remove override */\n",
      "worker.ps1": "# TODO retry logic\n",
      "nested/app.ts": "// todo handle rejection\n",
      "nested/hyphen.css": "/* TO-DO remove fallback */\n",
      "nested/mixed.json": '{"script":"todo:check","note":"TODO still real"}\n',
      "nested/spaced.md": "TO DO before release\n",
      "package.json": '{"scripts":{"todo:check":"safe command name"}}\n',
    };
    for (const [relativePath, contents] of Object.entries(fixtures)) {
      await writeFile(path.join(root, relativePath), contents);
    }

    assert.deepEqual(await findWorkMarkers(root), [
      "Dockerfile:1",
      "README.md:1",
      "config.json:1",
      "index.html:1",
      "migration.sql:1",
      "nested/app.ts:1",
      "nested/hyphen.css:1",
      "nested/mixed.json:1",
      "nested/spaced.md:1",
      "script.sh:1",
      "styles.css:1",
      "worker.ps1:1",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("force-tracked markers in ignored output directories and case variants fail", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "hedefora-tracked-marker-"),
  );
  try {
    runGit(root, "init", "--quiet");
    const fixtures = {
      ".cache/lower.json": '{"note":"to do later"}\n',
      ".pnpm-store/hyphen.json": '{"note":"to-do later"}\n',
      "artifacts/title.json": '{"note":"To-Do later"}\n',
      "build/mixed.json": '{"note":"tO dO later"}\n',
      "coverage/fixme.json": '{"note":"fixme later"}\n',
      "dist/xxx.json": '{"note":"xXx later"}\n',
      "node_modules/compact.json": '{"note":"todo later"}\n',
    };
    const ignoredDirectories = [
      ".cache",
      ".pnpm-store",
      "artifacts",
      "build",
      "coverage",
      "dist",
      "node_modules",
    ];
    await writeFile(
      path.join(root, ".gitignore"),
      `${ignoredDirectories.map((directory) => `${directory}/`).join("\n")}\n`,
    );
    runGit(root, "add", ".gitignore");
    for (const [relativePath, contents] of Object.entries(fixtures)) {
      await mkdir(path.dirname(path.join(root, relativePath)), {
        recursive: true,
      });
      await writeFile(path.join(root, relativePath), contents);
      runGit(root, "add", "--force", relativePath);
    }

    assert.deepEqual(await findWorkMarkers(root), [
      ".cache/lower.json:1",
      ".pnpm-store/hyphen.json:1",
      "artifacts/title.json:1",
      "build/mixed.json:1",
      "coverage/fixme.json:1",
      "dist/xxx.json:1",
      "node_modules/compact.json:1",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function runGit(root, ...arguments_) {
  const result = spawnSync("git", ["-C", root, ...arguments_], {
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    `git ${arguments_.join(" ")} failed: ${result.stderr || result.error?.message}`,
  );
}
