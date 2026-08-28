"""Validate the repository-owned Codex TOML subset with Python's real parser."""

from __future__ import annotations

import sys
import tomllib
from pathlib import Path
from typing import Any

EXPECTED_AGENT_FILES = {
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
}
ALLOWED_AGENT_KEYS = {
    "name",
    "description",
    "developer_instructions",
    "sandbox_mode",
    "approval_policy",
    "features",
    "mcp_servers",
}
REVIEWER_FILES = {"cold-reviewer.toml", "security-privacy-review.toml"}
ALLOWED_CONFIG_KEYS = {
    "model",
    "model_reasoning_effort",
    "sandbox_mode",
    "approval_policy",
    "approvals_reviewer",
    "agents",
}
ALLOWED_AGENTS_CONFIG_KEYS = {
    "enabled",
    "max_concurrent_threads_per_session",
    "interrupt_message",
}
REVIEWER_DISABLED_FEATURES = {
    "apps",
    "auth_elicitation",
    "browser_use",
    "browser_use_external",
    "browser_use_full_cdp_access",
    "computer_use",
    "enable_mcp_apps",
    "hooks",
    "image_generation",
    "in_app_browser",
    "plugin_sharing",
    "plugins",
    "recommended_plugins",
    "remote_plugin",
    "skill_mcp_dependency_install",
    "standalone_web_search",
    "tool_call_mcp_elicitation",
}


def validate(repository_root: Path) -> list[str]:
    errors: list[str] = []
    codex_root = repository_root / ".codex"
    config = parse_toml(codex_root / "config.toml", errors)
    if config is not None:
        validate_config(config, errors)

    agent_root = codex_root / "agents"
    actual_files = {path.name for path in agent_root.glob("*.toml")}
    if actual_files != EXPECTED_AGENT_FILES:
        errors.append(
            "custom agent file set differs: "
            + ", ".join(sorted(actual_files ^ EXPECTED_AGENT_FILES))
        )

    names: list[str] = []
    for file_name in sorted(actual_files):
        document = parse_toml(agent_root / file_name, errors)
        if document is None:
            continue
        validate_agent(file_name, document, errors)
        name = document.get("name")
        if isinstance(name, str):
            names.append(name)

    duplicates = sorted({name for name in names if names.count(name) > 1})
    for duplicate in duplicates:
        errors.append(f"duplicate custom agent name: {duplicate}")
    return errors


def parse_toml(path: Path, errors: list[str]) -> dict[str, Any] | None:
    try:
        with path.open("rb") as source:
            return tomllib.load(source)
    except (OSError, tomllib.TOMLDecodeError) as error:
        errors.append(f"{path.name}: TOML parse failed: {error}")
        return None


def validate_config(document: dict[str, Any], errors: list[str]) -> None:
    unknown = sorted(set(document) - ALLOWED_CONFIG_KEYS)
    if unknown:
        errors.append(f"config.toml: unsupported keys: {', '.join(unknown)}")
    expected = {
        "model": "gpt-5.6-sol",
        "model_reasoning_effort": "ultra",
        "sandbox_mode": "workspace-write",
        "approval_policy": "on-request",
        "approvals_reviewer": "user",
    }
    for key, value in expected.items():
        if document.get(key) != value:
            errors.append(f"config.toml: {key} must be {value!r}")

    agents = document.get("agents")
    if not isinstance(agents, dict):
        errors.append("config.toml: agents table is required")
        return
    unknown_agents = sorted(set(agents) - ALLOWED_AGENTS_CONFIG_KEYS)
    if unknown_agents:
        errors.append(
            "config.toml: unsupported agents keys: " + ", ".join(unknown_agents)
        )
    expected_agents = {
        "enabled": True,
        "max_concurrent_threads_per_session": 4,
        "interrupt_message": True,
    }
    for key, value in expected_agents.items():
        if agents.get(key) != value:
            errors.append(f"config.toml: agents.{key} must be {value!r}")


def validate_agent(
    file_name: str, document: dict[str, Any], errors: list[str]
) -> None:
    unknown = sorted(set(document) - ALLOWED_AGENT_KEYS)
    if unknown:
        errors.append(f"{file_name}: unsupported keys: {', '.join(unknown)}")
    for key in ("name", "description", "developer_instructions"):
        value = document.get(key)
        if not isinstance(value, str) or not value.strip():
            errors.append(f"{file_name}: {key} must be a non-empty string")
    if "model" in document or "model_reasoning_effort" in document:
        errors.append(f"{file_name}: model and effort must be inherited")

    if file_name in REVIEWER_FILES:
        if document.get("sandbox_mode") != "read-only":
            errors.append(f"{file_name}: sandbox_mode must be read-only")
        if document.get("approval_policy") != "never":
            errors.append(f"{file_name}: approval_policy must be never")
        if document.get("mcp_servers") != {}:
            errors.append(f"{file_name}: mcp_servers must be an empty table")
        features = document.get("features")
        if not isinstance(features, dict):
            errors.append(f"{file_name}: features table is required")
        else:
            unexpected_features = sorted(set(features) - REVIEWER_DISABLED_FEATURES)
            missing_features = sorted(REVIEWER_DISABLED_FEATURES - set(features))
            if unexpected_features:
                errors.append(
                    f"{file_name}: unsupported reviewer features: "
                    + ", ".join(unexpected_features)
                )
            if missing_features:
                errors.append(
                    f"{file_name}: missing disabled reviewer features: "
                    + ", ".join(missing_features)
                )
            for feature in sorted(REVIEWER_DISABLED_FEATURES & set(features)):
                if features[feature] is not False:
                    errors.append(f"{file_name}: features.{feature} must be false")
    elif "sandbox_mode" in document or "approval_policy" in document:
        errors.append(f"{file_name}: writer permissions must inherit the parent task")
    elif "features" in document or "mcp_servers" in document:
        errors.append(f"{file_name}: writer capabilities must inherit the parent task")

    if file_name == "legal-policy-drafter.toml" and "DRAFT_NOT_FOR_PRODUCTION" not in str(
        document.get("developer_instructions", "")
    ):
        errors.append(
            "legal-policy-drafter.toml: developer instructions require DRAFT_NOT_FOR_PRODUCTION"
        )


def main() -> int:
    repository_root = Path(__file__).resolve().parents[1]
    errors = validate(repository_root)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print("PASS: Codex TOML syntax and the repository-owned schema subset are valid.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
