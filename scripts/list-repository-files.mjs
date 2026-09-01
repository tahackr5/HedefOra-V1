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
    return listGitRepositoryFiles(root, [
      "--cached",
      "--others",
      "--exclude-standard",
    ]);
  }

  return collectFixtureFiles(root);
}

export async function listTrackedRepositoryEntries(root, repositoryPaths = []) {
  if (!(await pathExists(path.join(root, ".git")))) return null;
  const output = runGitLsFiles(root, ["--stage"]);
  const indexTags = listGitIndexTags(root, repositoryPaths);
  const intentToAddPaths = listIntentToAddPaths(root, repositoryPaths);
  const text = output.toString("utf8");
  if (text === "") return [];
  if (!text.endsWith("\0")) {
    throw new Error(
      "git ls-files --stage failed closed: output is not NUL terminated",
    );
  }
  return text
    .slice(0, -1)
    .split("\0")
    .map((record, index) => {
      const match =
        /^(\d{6}) ([0-9a-f]{40}(?:[0-9a-f]{24})?) ([0-3])\t([\s\S]+)$/u.exec(
          record,
        );
      if (!match) {
        throw new Error(
          `git ls-files --stage failed closed: entry ${index} is malformed`,
        );
      }
      const [, mode, objectId, stage, repositoryPath] = match;
      return {
        indexTag: indexTags.get(repositoryPath) ?? null,
        intentToAdd: intentToAddPaths.has(repositoryPath),
        mode,
        objectId,
        path: repositoryPath,
        stage: Number(stage),
      };
    })
    .sort((left, right) => {
      if (left.path === right.path) return left.stage - right.stage;
      return left.path < right.path ? -1 : 1;
    });
}

function listGitIndexTags(root, repositoryPaths) {
  const result = spawnSync(
    "git",
    ["-C", root, "ls-files", "-v", "-f", "-z", "--", ...repositoryPaths],
    { encoding: "buffer", maxBuffer: 32 * 1024 * 1024 },
  );
  if (result.error || result.status !== 0) {
    const detail = result.error?.message ?? result.stderr?.toString("utf8");
    throw new Error(
      `git ls-files index flags failed closed: ${detail || "unknown error"}`,
    );
  }

  const indexTags = new Map();
  for (const [index, record] of result.stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .entries()) {
    if (record.length < 3 || record[1] !== " ") {
      throw new Error(
        `git ls-files index flags failed closed: entry ${index} is malformed`,
      );
    }
    const repositoryPath = record.slice(2);
    if (indexTags.has(repositoryPath)) {
      throw new Error(
        `git ls-files index flags failed closed: duplicate path ${repositoryPath}`,
      );
    }
    indexTags.set(repositoryPath, record[0]);
  }
  return indexTags;
}

function listIntentToAddPaths(root, repositoryPaths) {
  const result = spawnSync(
    "git",
    [
      "-C",
      root,
      "status",
      "--porcelain=v2",
      "-z",
      "--untracked-files=no",
      "--ignore-submodules=all",
      "--",
      ...repositoryPaths,
    ],
    { encoding: "buffer", maxBuffer: 32 * 1024 * 1024 },
  );
  if (result.error || result.status !== 0) {
    const detail = result.error?.message ?? result.stderr?.toString("utf8");
    throw new Error(`git status failed closed: ${detail || "unknown error"}`);
  }

  const intentToAddPaths = new Set();
  for (const [index, record] of result.stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .entries()) {
    if (!record.startsWith("1 ")) continue;
    const match =
      /^1 [^ ]{2} [^ ]+ ([0-7]{6}) ([0-7]{6}) ([0-7]{6}) ([0-9a-f]+) ([0-9a-f]+) ([\s\S]+)$/u.exec(
        record,
      );
    if (!match) {
      throw new Error(
        `git status --porcelain=v2 failed closed: entry ${index} is malformed`,
      );
    }
    const [, , indexMode, , , indexObjectId, repositoryPath] = match;
    if (indexMode === "000000" || /^0+$/u.test(indexObjectId)) {
      intentToAddPaths.add(repositoryPath);
    }
  }
  return intentToAddPaths;
}

function listGitRepositoryFiles(root, selectors) {
  return runGitLsFiles(root, selectors)
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .sort();
}

function runGitLsFiles(root, selectors) {
  const result = spawnSync(
    "git",
    ["-C", root, "ls-files", ...selectors, "-z", "--"],
    { encoding: "buffer", maxBuffer: 32 * 1024 * 1024 },
  );
  if (result.error || result.status !== 0) {
    const detail = result.error?.message ?? result.stderr?.toString("utf8");
    throw new Error(`git ls-files failed closed: ${detail || "unknown error"}`);
  }
  return result.stdout;
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
    files.push(relativePath.split(path.sep).join("/"));
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
