import assert from "node:assert/strict";
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
