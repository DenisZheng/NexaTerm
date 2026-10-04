from contextlib import closing
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from wf07_a14_fixture import change_reference, require_closed_windows_app


class A14FixtureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.database = Path(self.temp.name) / "fixture.db"
        self.snapshot = {
            "version": 1,
            "instances": [
                {"id": "ssh:bad", "kind": "ssh", "target": {"kind": "profile", "profileId": "fixture"}},
                {"id": "ssh:good", "kind": "ssh", "target": {"kind": "profile", "profileId": "other"}},
            ],
            "order": ["ssh:bad", "ssh:good"],
            "panes": {"kind": "leaf", "id": "pane", "instanceId": "ssh:bad"},
        }
        with closing(sqlite3.connect(self.database)) as connection, connection:
            connection.executescript(
                "CREATE TABLE connections(id TEXT, name TEXT, protocol TEXT);"
                "CREATE TABLE credentials(value TEXT);"
                "CREATE TABLE workspace_snapshots(slot INTEGER, current_json TEXT, backup_json TEXT, updated_at TEXT);"
                "INSERT INTO connections VALUES ('fixture', 'A14-missing', 'ssh');"
                "INSERT INTO credentials VALUES ('fixture-only');"
            )
            connection.execute("INSERT INTO workspace_snapshots VALUES (1, ?, NULL, 'before')", (json.dumps(self.snapshot),))

    def read(self):
        with closing(sqlite3.connect(self.database)) as connection, connection:
            current, backup = connection.execute("SELECT current_json, backup_json FROM workspace_snapshots").fetchone()
            return json.loads(current), json.loads(backup) if backup else None

    def test_apply_and_restore_only_one_reference(self):
        change_reference(self.database, "A14-missing")
        current, backup = self.read()
        self.assertEqual(backup, self.snapshot)
        self.assertEqual(current["instances"][0]["target"]["profileId"], "a14-missing-profile:fixture")
        self.assertEqual(current["instances"][1], self.snapshot["instances"][1])
        self.assertEqual(current["panes"], self.snapshot["panes"])
        self.assertEqual(current["order"], self.snapshot["order"])
        with closing(sqlite3.connect(self.database)) as connection, connection:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM connections").fetchone()[0], 1)
            self.assertEqual(connection.execute("SELECT value FROM credentials").fetchone()[0], "fixture-only")
        change_reference(self.database, "A14-missing", restore=True)
        self.assertEqual(self.read()[0], self.snapshot)

    def test_rejects_normal_profile_names_and_missing_database(self):
        with self.assertRaises(ValueError):
            change_reference(self.database, "Production")
        missing = self.database.parent / "missing.db"
        with self.assertRaises(FileNotFoundError):
            change_reference(missing, "A14-missing")
        self.assertFalse(missing.exists())
        self.assertEqual(self.read(), (self.snapshot, None))

    def test_rejects_ambiguous_or_repeated_changes_without_writing(self):
        change_reference(self.database, "A14-missing")
        before = self.read()
        with self.assertRaises(ValueError):
            change_reference(self.database, "A14-missing")
        self.assertEqual(self.read(), before)
        change_reference(self.database, "A14-missing", restore=True)
        with closing(sqlite3.connect(self.database)) as connection, connection:
            connection.execute("INSERT INTO connections VALUES ('duplicate', 'A14-missing', 'ssh')")
        before = self.read()
        with self.assertRaises(ValueError):
            change_reference(self.database, "A14-missing")
        self.assertEqual(self.read(), before)

    def test_restore_preserves_newer_layout_changes(self):
        change_reference(self.database, "A14-missing")
        changed, _ = self.read()
        changed["order"].reverse()
        with closing(sqlite3.connect(self.database)) as connection, connection:
            connection.execute("UPDATE workspace_snapshots SET current_json = ?", (json.dumps(changed),))
        change_reference(self.database, "A14-missing", restore=True)
        restored, _ = self.read()
        self.assertEqual(restored["order"], changed["order"])
        self.assertEqual(restored["instances"], self.snapshot["instances"])

    def test_cli_rejects_running_app(self):
        with patch("wf07_a14_fixture.sys.platform", "win32"), patch(
            "wf07_a14_fixture.subprocess.run",
            return_value=SimpleNamespace(stdout='"nexaterm.exe","1234","Console"\n'),
        ):
            with self.assertRaisesRegex(RuntimeError, "仍在运行"):
                require_closed_windows_app()


if __name__ == "__main__":
    unittest.main()
