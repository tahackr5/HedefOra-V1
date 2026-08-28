from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import validate_toml  # noqa: E402


class ValidateTomlTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory(
            prefix="hedefora-toml-"
        )
        self.root = Path(self.temporary_directory.name)
        source = Path(__file__).resolve().parents[1] / ".codex"
        shutil.copytree(source, self.root / ".codex")

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def test_checked_in_documents_are_valid(self) -> None:
        self.assertEqual(validate_toml.validate(self.root), [])

    def test_malformed_toml_is_rejected(self) -> None:
        target = self.root / ".codex" / "agents" / "orchestrator.toml"
        target.write_text('name = "unterminated\n', encoding="utf-8")
        self.assertTrue(
            any("TOML parse failed" in error for error in validate_toml.validate(self.root))
        )

    def test_unsafe_root_permission_profiles_are_rejected(self) -> None:
        target = self.root / ".codex" / "config.toml"
        document = target.read_text(encoding="utf-8")
        document = document.replace(
            "[permissions.project-edit.network]\nenabled = false",
            "[permissions.project-edit.network]\nenabled = true",
        )
        document = document.replace(
            '"~/.ssh/**" = "deny"', '"~/.ssh/**" = "read"'
        )
        target.write_text(document, encoding="utf-8")

        errors = validate_toml.validate(self.root)

        self.assertTrue(
            any("permission profiles differ" in error for error in errors)
        )

    def test_each_unsafe_reviewer_boundary_is_rejected(self) -> None:
        target = (
            self.root / ".codex" / "agents" / "security-privacy-review.toml"
        )
        original = target.read_text(encoding="utf-8")
        cases = [
            (
                "default permissions",
                'default_permissions = "reviewer-readonly"',
                'default_permissions = "project-edit"',
                "default_permissions must be reviewer-readonly",
            ),
            (
                "approval policy",
                'approval_policy = "never"',
                'approval_policy = "on-request"',
                "approval_policy must be never",
            ),
            (
                "MCP surface",
                "mcp_servers = {}",
                'mcp_servers = { repo_reader = "enabled" }',
                "mcp_servers must be an empty table",
            ),
            (
                "top-level web search",
                'web_search = "disabled"',
                'web_search = "enabled"',
                "web_search must be disabled",
            ),
            (
                "credential path",
                '"~/.ssh/**" = "deny"',
                '"~/.ssh/**" = "read"',
                "reviewer permission profile differs",
            ),
            (
                "credential glob scan bound",
                "glob_scan_max_depth = 8",
                "glob_scan_max_depth = 1",
                "reviewer permission profile differs",
            ),
            (
                "network",
                "enabled = false",
                "enabled = true",
                "reviewer permission profile differs",
            ),
            (
                "web-search tool",
                "web_search = false",
                "web_search = true",
                "tools.web_search must be false",
            ),
            (
                "feature",
                "apps = false",
                "apps = true",
                "features.apps must be false",
            ),
            (
                "code-mode namespace",
                'excluded_tool_namespaces = ["image_gen", "mcp__codex_app", "web"]',
                'excluded_tool_namespaces = ["image_gen"]',
                "features.code_mode differs",
            ),
            (
                "unknown key",
                "mcp_servers = {}",
                'unknown_key = "value"\nmcp_servers = {}',
                "unsupported keys",
            ),
        ]

        for label, current, unsafe, expected_error in cases:
            with self.subTest(label=label):
                self.assertIn(current, original)
                target.write_text(
                    original.replace(current, unsafe, 1), encoding="utf-8"
                )
                errors = validate_toml.validate(self.root)
                self.assertTrue(
                    any(expected_error in error for error in errors),
                    errors,
                )


if __name__ == "__main__":
    unittest.main()
