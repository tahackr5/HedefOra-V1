import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  EXPECTED_DOWN_SHA256,
  EXPECTED_UP_SHA256,
  POSTGRES_CANDIDATE_IMAGE,
  buildMigrationPlan,
  parseChecksumManifest,
  runStaticChecks,
  validateComposeContractText,
  validateInitSourceText,
  validateMigrationContractText,
  validateRoleContractText,
} from "./run.mjs";

const testFile = fileURLToPath(import.meta.url);
const testDirectory = path.dirname(testFile);
const repositoryRoot = path.resolve(testDirectory, "../../..");
const runnerFile = path.join(testDirectory, "run.mjs");

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function migrationFixture() {
  const downName = "000001_database_foundation.down.sql";
  const upName = "000001_database_foundation.up.sql";
  const down = Buffer.from("BEGIN;\nROLLBACK;\n", "utf8");
  const up = Buffer.from("BEGIN;\nCOMMIT;\n", "utf8");
  const files = new Map([
    [downName, down],
    [upName, up],
  ]);
  return {
    checksums:
      digest(down) + "  " + downName + "\n" + digest(up) + "  " + upName + "\n",
    downName,
    files,
    up,
    upName,
  };
}

function approvedPlan() {
  return [
    {
      version: 1,
      versionToken: "000001",
      name: "database_foundation",
      down: {
        checksum: EXPECTED_DOWN_SHA256,
        fileName: "000001_database_foundation.down.sql",
      },
      up: {
        checksum: EXPECTED_UP_SHA256,
        fileName: "000001_database_foundation.up.sql",
      },
    },
  ];
}

function readRepositoryText(relativePath) {
  return readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

test("checksum inventory is paired, ordered and digest-bound", () => {
  const fixture = migrationFixture();
  assert.deepEqual(
    [...parseChecksumManifest(fixture.checksums).keys()],
    [fixture.downName, fixture.upName],
  );
  const plan = buildMigrationPlan(fixture.files, fixture.checksums);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].version, 1);
  assert.equal(plan[0].name, "database_foundation");

  const changed = new Map(fixture.files);
  changed.set(
    fixture.upName,
    Buffer.from(fixture.up.toString("utf8") + "-- drift\n", "utf8"),
  );
  assert.throws(
    () => buildMigrationPlan(changed, fixture.checksums),
    /checksum mismatch/u,
  );
  assert.throws(
    () => parseChecksumManifest(fixture.checksums.replaceAll("\n", "\r\n")),
    /CR içeremez/u,
  );
  assert.throws(
    () => parseChecksumManifest(fixture.checksums.slice(0, -1)),
    /final LF/u,
  );
});

test("inert Compose exact profile rejects service or candidate drift", () => {
  const source = readRepositoryText("infra/compose.dev.yml");
  assert.doesNotThrow(() => validateComposeContractText(source));
  assert.throws(
    () =>
      validateComposeContractText(
        source.replace("services: {}\n", "services:\n  postgres: {}\n"),
      ),
    /inert candidate profile drift/u,
  );
  assert.throws(
    () =>
      validateComposeContractText(
        source.replace(POSTGRES_CANDIDATE_IMAGE, "postgres:17"),
      ),
    /inert candidate profile drift/u,
  );
  assert.throws(
    () =>
      validateComposeContractText(
        source.replace("admission: BLOCKED_SECURITY", "admission: ALLOWED"),
      ),
    /inert candidate profile drift/u,
  );
});

test("migration YAML is exact-parity with approved SQL hashes and timeouts", () => {
  const source = readRepositoryText("contracts/database/migrations.yaml");
  const plan = approvedPlan();
  assert.doesNotThrow(() => validateMigrationContractText(source, plan));
  assert.throws(
    () =>
      validateMigrationContractText(
        source.replace("lock: 3s", "lock: 30s"),
        plan,
      ),
    /SQL\/SHA\/timeout profile drift/u,
  );
  assert.throws(
    () =>
      validateMigrationContractText(
        source.replace(EXPECTED_UP_SHA256, "0".repeat(64)),
        plan,
      ),
    /SQL\/SHA\/timeout profile drift/u,
  );
  const driftedPlan = approvedPlan();
  driftedPlan[0].down.checksum = "0".repeat(64);
  assert.throws(
    () => validateMigrationContractText(source, driftedPlan),
    /Approved down migration SHA-256 drift/u,
  );
});

test("role YAML exact profile binds runtime, ACL and default privileges", () => {
  const source = readRepositoryText("contracts/database/roles.yaml");
  assert.doesNotThrow(() => validateRoleContractText(source));
  for (const changed of [
    source.replace("inherit: false", "inherit: true"),
    source.replace(
      "hedefora_readonly: [select]",
      "hedefora_readonly: [select, insert]",
    ),
    source.replace("hedefora_worker: [execute]", "hedefora_worker: []"),
    source.replace(
      "runtime_must_not_own_database: true",
      "runtime_must_not_own_database: false",
    ),
  ]) {
    assert.throws(
      () => validateRoleContractText(changed),
      /role\/ACL\/default-privilege profile drift/u,
    );
  }
});

test("init source guard is exact active structure and comment spoof cannot pass", () => {
  const source = readRepositoryText("infra/postgres/initdb/010_roles.sql");
  assert.doesNotThrow(() => validateInitSourceText(source));
  assert.throws(
    () =>
      validateInitSourceText(
        source.replace(
          "\\getenv app_password HEDEFORA_DEV_POSTGRES_APP_PASSWORD",
          "-- \\getenv app_password HEDEFORA_DEV_POSTGRES_APP_PASSWORD",
        ),
      ),
    /exact active role\/init guard profile drift/u,
  );
  assert.throws(
    () =>
      validateInitSourceText(
        source.replace(
          "pg_catalog.octet_length(:'worker_password') >= 12",
          "true",
        ),
      ),
    /exact active role\/init guard profile drift/u,
  );
  assert.throws(
    () =>
      validateInitSourceText(
        source.replace("ERRCODE = '22023'", "ERRCODE = '00000'"),
      ),
    /exact active role\/init guard profile drift/u,
  );
});

test("static repository profile passes without subprocess or network", () => {
  const result = runStaticChecks();
  assert.equal(result.composeCandidateImage, POSTGRES_CANDIDATE_IMAGE);
  assert.equal(result.liveImageAdmission, "BLOCKED_SECURITY");
  assert.deepEqual(result.migrationVersions, [1]);
  assert.deepEqual(result.timeoutProfile, {
    lock: "3s",
    statement: "15s",
    idleInTransactionSession: "15s",
  });
});

test("runner contains no latent Docker, project or child-process surface", () => {
  const source = readFileSync(runnerFile, "utf8");
  for (const forbidden of [
    "node:child_process",
    "spawnSync(",
    "HEDEFORA_PG_TEST_PROJECT",
    "PGPASSWORD",
    "runLiveSuite",
    "runCompose",
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});

test("--live is blocked before any Docker sentinel can run", () => {
  const temporaryDirectory = mkdtempSync(
    path.join(tmpdir(), "hedefora-pg-docker-sentinel-"),
  );
  const sentinelFile = path.join(temporaryDirectory, "docker-called");
  const dockerFile = path.join(
    temporaryDirectory,
    process.platform === "win32" ? "docker.cmd" : "docker",
  );
  const dockerSource =
    process.platform === "win32"
      ? '@echo off\r\n> "%HEDEFORA_DOCKER_SENTINEL%" echo called\r\nexit /b 97\r\n'
      : '#!/bin/sh\nprintf called > "$HEDEFORA_DOCKER_SENTINEL"\nexit 97\n';
  writeFileSync(dockerFile, dockerSource, "utf8");
  if (process.platform !== "win32") {
    chmodSync(dockerFile, 0o700);
  }
  try {
    const result = spawnSync(process.execPath, [runnerFile, "--live"], {
      cwd: testDirectory,
      encoding: "utf8",
      env: {
        ...process.env,
        HEDEFORA_DOCKER_SENTINEL: sentinelFile,
        PATH: temporaryDirectory + path.delimiter + (process.env.PATH ?? ""),
      },
      shell: false,
      timeout: 10_000,
      windowsHide: true,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(
      result.stderr,
      "PostgreSQL integration harness FAIL: IMAGE_ADMISSION_BLOCKED: live PostgreSQL execution owner/security admission bekliyor\n",
    );
    assert.equal(existsSync(sentinelFile), false);
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
});
