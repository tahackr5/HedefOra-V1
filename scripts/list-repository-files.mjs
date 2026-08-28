import { lstat, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const excludedFallbackDirectories = new Set([
  ".git",
  ".cache",
  ".pnpm-store",
  "artifacts",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);

export async function listRepositoryFiles(root) {
  if (await pathExists(path.join(root, ".git"))) {
    const result = spawnSync(
      "git",
      [
        "-C",
        root,
        "ls-files",
        "--cached",
        "--others",
        "--exclude-standard",
        "-z",
        "--",
      ],
      { encoding: "buffer", maxBuffer: 32 * 1024 * 1024 },
    );
    if (result.error || result.status !== 0) {
      const detail = result.error?.message ?? result.stderr?.toString("utf8");
      throw new Error(
        `git ls-files failed closed: ${detail || "unknown error"}`,
      );
    }
    return result.stdout
      .toString("utf8")
      .split("\0")
      .filter(Boolean)
      .map((relativePath) => relativePath.replaceAll("\\", "/"))
      .sort();
  }

  return collectFixtureFiles(root);
}

async function collectFixtureFiles(directory, relativeDirectory = "") {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      if (!excludedFallbackDirectories.has(entry.name)) {
        files.push(
          ...(await collectFixtureFiles(
            path.join(directory, entry.name),
            relativePath,
          )),
        );
      }
      continue;
    }
    files.push(relativePath.replaceAll("\\", "/"));
  }
  return files.sort();
}

async function pathExists(target) {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}
