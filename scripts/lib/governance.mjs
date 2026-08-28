import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export const expectedAgentFiles = [
  "architecture-contracts-data.toml",
  "backend-platform-auth.toml",
  "cold-reviewer.toml",
  "content-planning-ai.toml",
  "frontend-design-system.toml",
  "infra-release-observability.toml",
  "legal-policy-drafter.toml",
  "orchestrator.toml",
  "product-ux-content.toml",
  "quality-testing.toml",
  "security-privacy-review.toml",
];

export const expectedSkillNames = [
  "hedefora-cold-review",
  "hedefora-contract-change",
  "hedefora-feature-delivery",
  "hedefora-incident-triage",
  "hedefora-release-readiness",
  "hedefora-security-review",
];

export function parseFrontmatter(document) {
  const normalized = document.replaceAll("\r\n", "\n");
  if (!normalized.startsWith("---\n")) {
    return null;
  }

  const end = normalized.indexOf("\n---\n", 4);
  if (end === -1) {
    return null;
  }

  const values = {};
  for (const line of normalized.slice(4, end).split("\n")) {
    const match = line.match(/^([a-z_]+):\s*(.+)\s*$/i);
    if (match) {
      values[match[1]] = match[2].trim().replace(/^(["'])(.*)\1$/, "$2");
    }
  }
  return values;
}

export function readTomlString(document, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.match(
    new RegExp(`^${escapedKey}\\s*=\\s*"([^"]+)"\\s*$`, "m"),
  );
  return match?.[1] ?? null;
}

export function hasTomlKey(document, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escapedKey}\\s*=`, "m").test(document);
}

export function findDuplicates(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }
  return [...duplicates].sort();
}

export async function validateGovernance(repositoryRoot) {
  const errors = [];
  const agentDirectory = path.join(repositoryRoot, ".codex", "agents");
  const agentFiles = (await readdir(agentDirectory))
    .filter((file) => file.endsWith(".toml"))
    .sort();

  if (JSON.stringify(agentFiles) !== JSON.stringify(expectedAgentFiles)) {
    errors.push(`custom agent files differ: ${agentFiles.join(", ")}`);
  }

  const agentNames = [];
  for (const file of agentFiles) {
    const document = await readFile(path.join(agentDirectory, file), "utf8");
    const name = readTomlString(document, "name");
    const description = readTomlString(document, "description");
    if (!name) errors.push(`${file}: missing string name`);
    if (!description) errors.push(`${file}: missing string description`);
    if (!/^developer_instructions\s*=\s*"""/m.test(document)) {
      errors.push(`${file}: missing multiline developer_instructions`);
    }
    if (
      hasTomlKey(document, "model") ||
      hasTomlKey(document, "model_reasoning_effort")
    ) {
      errors.push(`${file}: custom agents must inherit model and effort`);
    }
    if (name) agentNames.push(name);
  }

  for (const duplicate of findDuplicates(agentNames)) {
    errors.push(`duplicate custom agent name: ${duplicate}`);
  }

  for (const reviewer of [
    "security-privacy-review.toml",
    "cold-reviewer.toml",
  ]) {
    const document = await readFile(
      path.join(agentDirectory, reviewer),
      "utf8",
    );
    if (readTomlString(document, "sandbox_mode") !== "read-only") {
      errors.push(`${reviewer}: sandbox_mode must be read-only`);
    }
    if (readTomlString(document, "approval_policy") !== "never") {
      errors.push(`${reviewer}: approval_policy must be never`);
    }
  }

  const quality = await readFile(
    path.join(agentDirectory, "quality-testing.toml"),
    "utf8",
  );
  if (hasTomlKey(quality, "sandbox_mode")) {
    errors.push(
      "quality-testing.toml: sandbox_mode must inherit its task mode",
    );
  }

  const config = await readFile(
    path.join(repositoryRoot, ".codex", "config.toml"),
    "utf8",
  );
  if (readTomlString(config, "model") !== "gpt-5.6-sol") {
    errors.push("config.toml: model must be gpt-5.6-sol");
  }
  if (readTomlString(config, "model_reasoning_effort") !== "ultra") {
    errors.push("config.toml: model_reasoning_effort must be ultra");
  }
  if (!/^max_concurrent_threads_per_session\s*=\s*4\s*$/m.test(config)) {
    errors.push("config.toml: max concurrent agent threads must be 4");
  }

  const skillsDirectory = path.join(repositoryRoot, ".agents", "skills");
  const skillDirectories = (
    await readdir(skillsDirectory, { withFileTypes: true })
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const skillNames = [];
  for (const directory of skillDirectories) {
    const document = await readFile(
      path.join(skillsDirectory, directory, "SKILL.md"),
      "utf8",
    );
    const metadata = parseFrontmatter(document);
    if (!metadata?.name || !metadata?.description) {
      errors.push(
        `${directory}/SKILL.md: missing name or description frontmatter`,
      );
      continue;
    }
    skillNames.push(metadata.name);
  }

  for (const duplicate of findDuplicates(skillNames)) {
    errors.push(`duplicate skill name: ${duplicate}`);
  }
  if (
    JSON.stringify(skillNames.sort()) !== JSON.stringify(expectedSkillNames)
  ) {
    errors.push(`skill names differ: ${skillNames.sort().join(", ")}`);
  }

  const fixtures = JSON.parse(
    await readFile(
      path.join(
        repositoryRoot,
        "scripts",
        "fixtures",
        "skill-prompt-cases.json",
      ),
      "utf8",
    ),
  );
  const fixtureIds = [];
  for (const fixture of fixtures) {
    if (!fixture.id || !fixture.prompt || !fixture.expectedSkill) {
      errors.push("skill prompt fixture requires id, prompt and expectedSkill");
      continue;
    }
    fixtureIds.push(fixture.id);
    if (!expectedSkillNames.includes(fixture.expectedSkill)) {
      errors.push(
        `${fixture.id}: unknown expected skill ${fixture.expectedSkill}`,
      );
    }
  }
  for (const duplicate of findDuplicates(fixtureIds)) {
    errors.push(`duplicate skill prompt fixture id: ${duplicate}`);
  }
  const coveredSkills = [
    ...new Set(fixtures.map((fixture) => fixture.expectedSkill)),
  ].sort();
  if (JSON.stringify(coveredSkills) !== JSON.stringify(expectedSkillNames)) {
    errors.push(
      `skill prompt fixtures do not cover every skill: ${coveredSkills.join(", ")}`,
    );
  }

  const workspace = await readFile(
    path.join(repositoryRoot, "pnpm-workspace.yaml"),
    "utf8",
  );
  if (!/^failIfNoMatch:\s*true\s*$/m.test(workspace)) {
    errors.push("pnpm-workspace.yaml: failIfNoMatch must be true");
  }

  return errors;
}
