import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listTrackedRepositoryEntries } from "./list-repository-files.mjs";

export const securityModulePins = Object.freeze([
  "github.com/yuin/goldmark@v1.7.17",
  "golang.org/x/mod@v0.40.0",
  "golang.org/x/text@v0.41.0",
]);
const expectedVersion =
  /^go version go1\.26\.7 (?:windows|linux|darwin)\/(?:amd64|arm64)\s*$/u;

export function goEnvironment(temporary, acquisition, inherited = process.env) {
  const result = {};
  for (const key of [
    "PATH",
    "Path",
    "SystemRoot",
    "SYSTEMROOT",
    "WINDIR",
    "ComSpec",
    "PATHEXT",
  ]) {
    if (inherited[key] !== undefined) result[key] = inherited[key];
  }
  return Object.assign(result, {
    GOENV: "off",
    GOWORK: "off",
    GOTOOLCHAIN: "local",
    GOVCS: "*:off",
    GOFLAGS: "",
    GOINSECURE: "",
    GONOPROXY: "",
    GONOSUMDB: "",
    GOPRIVATE: "",
    GOPROXY: acquisition ? "https://proxy.golang.org" : "off",
    GOSUMDB: acquisition ? "sum.golang.org" : "off",
    HOME: temporary,
    USERPROFILE: temporary,
    TMP: temporary,
    TEMP: temporary,
    TMPDIR: temporary,
    GOPATH: path.join(temporary, "gopath"),
    GOMODCACHE: path.join(temporary, "modules"),
    GOCACHE: path.join(temporary, "cache"),
  });
}

export function requireGoSuccess(result, label) {
  if (result.error || result.signal || result.status !== 0) {
    // Never forward dependency, environment or source-derived stderr.
    throw new Error(`Go manifest check failed: ${label}`);
  }
}

export function acquireGoModules(run) {
  let inventory;
  try {
    // Parsing only: this command is offline and never resolves module paths.
    inventory = JSON.parse(run(["mod", "edit", "-json"]));
  } catch {
    throw new Error("Go replacement preflight inventory is invalid");
  }
  if (
    inventory === null ||
    typeof inventory !== "object" ||
    Array.isArray(inventory) ||
    !Object.hasOwn(inventory, "Replace") ||
    !(
      inventory.Replace === null ||
      (Array.isArray(inventory.Replace) && inventory.Replace.length === 0)
    )
  ) {
    throw new Error("Go replacement preflight requires no replacements");
  }
  // No local or versioned replacement may redirect acquisition outside the
  // sealed manifest graph, even before the consumer source has been copied.
  run(["mod", "download", "all"], true);
  run(["mod", "verify"]);
}

export function assertCanonicalManifests(expected, actual) {
  for (const name of ["go.mod", "go.sum"]) {
    if (
      !Buffer.isBuffer(expected[name]) ||
      !Buffer.isBuffer(actual[name]) ||
      !expected[name].equals(actual[name])
    ) {
      throw new Error(`Go manifest drift: ${name}`);
    }
  }
}

export function annotateRestoredPins(document, tidiedRequires) {
  if (!Array.isArray(tidiedRequires))
    throw new Error("Missing tidy require inventory");
  let result = document;
  for (const pin of securityModulePins) {
    const [module, version] = pin.split("@");
    if (tidiedRequires.some((item) => item.Path === module)) continue;
    const escaped = module.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const expression = new RegExp(
      `^(\\s*)${escaped} ${version.replaceAll(".", "\\.")}$`,
      "gmu",
    );
    if ([...result.matchAll(expression)].length !== 1)
      throw new Error("Missing restored security pin");
    result = result.replace(expression, `$1${module} ${version} // indirect`);
  }
  return result;
}

export function validateSourceEntry(entry, bytes) {
  const components = entry.path.split("/");
  if (
    path.isAbsolute(entry.path) ||
    entry.path.includes("\\") ||
    components.some(
      (value) => value === "" || value === "." || value === "..",
    ) ||
    !["100644", "100755"].includes(entry.mode) ||
    entry.stage !== 0 ||
    entry.indexTag !== "H" ||
    entry.intentToAdd ||
    !Buffer.isBuffer(bytes)
  ) {
    throw new Error("Go manifest source inventory is not regular and sealed");
  }
  const object = createHash(entry.objectId.length === 64 ? "sha256" : "sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
  if (object !== entry.objectId)
    throw new Error("Go manifest source differs from index");
}

function normalized(value) {
  return process.platform === "win32" ? value.toLowerCase() : value;
}

async function readSource(root) {
  const entries = await listTrackedRepositoryEntries(root);
  if (entries === null)
    throw new Error("Go manifest check requires a Git index");
  const sources = new Map();
  for (const entry of entries.filter(
    (value) =>
      value.path.endsWith(".go") ||
      value.path === "go.mod" ||
      value.path === "go.sum",
  )) {
    if (sources.has(entry.path)) throw new Error("Duplicate Go source entry");
    const target = path.resolve(root, entry.path);
    const stat = await lstat(target);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size > 16 * 1024 * 1024 ||
      normalized(await realpath(target)) !== normalized(target)
    ) {
      throw new Error("Go source must be a bounded regular non-link file");
    }
    const bytes = await readFile(target);
    validateSourceEntry(entry, bytes);
    sources.set(entry.path, bytes);
  }
  if (!sources.has("go.mod") || !sources.has("go.sum") || sources.size < 3) {
    throw new Error("Go manifest and actual consumer source are required");
  }
  return sources;
}

async function cleanupDirectoryIdentity(target) {
  const stat = await lstat(target, { bigint: true });
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    normalized(await realpath(target)) !== normalized(target)
  ) {
    throw new Error("Unsafe Go check cleanup target");
  }
  return stat;
}

export async function cleanupGoTemporary(temporary, run) {
  // Only the exact newly allocated mkdtemp child is eligible for cleanup.
  if (
    path.resolve(temporary) !== temporary ||
    path.dirname(temporary) !== path.resolve(os.tmpdir()) ||
    !/^hedefora-go-mod-[A-Za-z0-9]{6}$/u.test(path.basename(temporary))
  ) {
    throw new Error("Unsafe Go check cleanup target");
  }
  const before = await cleanupDirectoryIdentity(temporary);
  const modules = path.join(temporary, "modules");
  let moduleStat;
  try {
    moduleStat = await lstat(modules);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (moduleStat !== undefined) {
    await cleanupDirectoryIdentity(modules);
    // Go owns its read-only module directories. Use its cleaner with the same
    // isolated offline environment; never make shared caches writable.
    await run(["clean", "-modcache"]);
    try {
      await lstat(modules);
      throw new Error("Go module cache cleanup was incomplete");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const after = await cleanupDirectoryIdentity(temporary);
  if (before.dev !== after.dev || before.ino !== after.ino) {
    throw new Error("Go check cleanup target changed");
  }
  await rm(temporary, { recursive: true });
}

export async function checkGoManifests(root, goBinary = "go") {
  const sources = await readSource(root);
  const temporary = await mkdtemp(path.join(os.tmpdir(), "hedefora-go-mod-"));
  const checkout = path.join(temporary, "source");
  const run = (arguments_, acquisition = false) => {
    const result = spawnSync(goBinary, arguments_, {
      cwd: checkout,
      env: goEnvironment(temporary, acquisition),
      encoding: "utf8",
      shell: false,
      windowsHide: true,
      timeout: 300_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    requireGoSuccess(result, arguments_[0]);
    return result.stdout;
  };
  try {
    await mkdir(checkout);
    for (const name of ["go.mod", "go.sum"]) {
      await writeFile(path.join(checkout, name), sources.get(name), {
        flag: "wx",
      });
    }
    if (!expectedVersion.test(run(["version"])))
      throw new Error("Exact Go 1.26.7 is required");
    // The network-enabled phase receives manifests only, never repository source.
    acquireGoModules(run);
    for (const [name, bytes] of sources) {
      if (name === "go.mod" || name === "go.sum") continue;
      const destination = path.join(checkout, name);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, bytes, { flag: "wx" });
    }
    // No network, toolchain download, VCS discovery, workspace or user Go config
    // is enabled while parsing the actual consumer tree.
    run(["mod", "tidy"]);
    const tidied = JSON.parse(run(["mod", "edit", "-json"]));
    run(["mod", "edit", ...securityModulePins.map((pin) => `-require=${pin}`)]);
    const restored = await readFile(path.join(checkout, "go.mod"), "utf8");
    await writeFile(
      path.join(checkout, "go.mod"),
      annotateRestoredPins(restored, tidied.Require ?? []),
    );
    run(["mod", "edit", "-fmt"]);
    run(["mod", "download", "all"]);
    const actual = {};
    const expected = {};
    for (const name of ["go.mod", "go.sum"]) {
      actual[name] = await readFile(path.join(checkout, name));
      expected[name] = sources.get(name);
    }
    assertCanonicalManifests(expected, actual);
    const after = await readSource(root);
    if (
      after.size !== sources.size ||
      [...sources].some(([name, bytes]) => !after.get(name)?.equals(bytes))
    )
      throw new Error("Go source changed during check");
  } finally {
    await cleanupGoTemporary(temporary, run);
  }
}

const sourceFile = fileURLToPath(import.meta.url);
if (path.resolve(process.argv[1] ?? "") === path.resolve(sourceFile)) {
  try {
    const args = process.argv.slice(2);
    if (
      args.length > 1 ||
      (args.length === 1 && !args[0].startsWith("--go-binary="))
    ) {
      throw new Error(
        "usage: node scripts/check-go-mod.mjs [--go-binary=absolute-path]",
      );
    }
    const binary =
      args.length === 0 ? "go" : args[0].slice("--go-binary=".length);
    if (args.length && !path.isAbsolute(binary))
      throw new Error("Go binary path must be absolute");
    await checkGoManifests(
      path.resolve(path.dirname(sourceFile), ".."),
      binary,
    );
    console.log(
      "PASS: canonical tidy plus exact security-only pins has no manifest drift.",
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
