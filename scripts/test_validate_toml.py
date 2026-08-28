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

    def test_unknown_key_and_unsafe_reviewer_are_rejected(self) -> None:
        target = (
            self.root / ".codex" / "agents" / "security-privacy-review.toml"
        )
        document = target.read_text(encoding="utf-8")
        document = document.replace('sandbox_mode = "read-only"', 'sandbox_mode = "workspace-write"')
        document = document.replace("apps = false", "apps = true")
        document = document.replace(
            "mcp_servers = {}", 'unknown_key = "value"\nmcp_servers = {}'
        )
        target.write_text(document, encoding="utf-8")
        errors = validate_toml.validate(self.root)
        self.assertTrue(any("unsupported keys" in error for error in errors))
        self.assertTrue(any("sandbox_mode must be read-only" in error for error in errors))
        self.assertTrue(any("features.apps must be false" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
