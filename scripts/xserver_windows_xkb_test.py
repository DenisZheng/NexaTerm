import io
import lzma
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

from xserver_source_review import ReviewError, digest
from xserver_windows_build import extract_component, extract_tar, run
from xserver_windows_xkb import CATEGORIES, component_names, configured_paths, keymap_text, runtime_inventory, verify_keymap


class XkbTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def assertCode(self, code, operation, *args, **kwargs):
        with self.assertRaises(ReviewError) as caught:
            operation(*args, **kwargs)
        self.assertEqual(str(caught.exception), code)

    def alias_archive(self, target="real", *, other_link=False, regular_target=True, include_alias=True):
        archive = self.root / "source.tar.xz"
        with tarfile.open(archive, "w:xz") as tar:
            member = tarfile.TarInfo("source/symbols/real")
            member.type = tarfile.REGTYPE if regular_target else tarfile.SYMTYPE
            member.linkname = "other"
            member.size = 4 if regular_target else 0
            tar.addfile(member, io.BytesIO(b"data") if regular_target else None)
            if include_alias:
                member = tarfile.TarInfo("source/symbols/alias")
                member.type, member.linkname = tarfile.SYMTYPE, target
                tar.addfile(member)
            if other_link:
                member = tarfile.TarInfo("source/symbols/unknown")
                member.type, member.linkname = tarfile.SYMTYPE, "real"
                tar.addfile(member)
        return archive

    def extract(self, aliases, **options):
        return extract_component(self.alias_archive(**options), self.root, "source", {}, aliases)

    def aliases(self, target="real"):
        return {"symbols/alias": {"target": target, "size": 4, "sha256": digest(b"data")}}

    def test_exact_alias_becomes_regular_file_and_retains_distinct_archive_identity(self):
        result = self.extract(self.aliases())
        alias = self.root / "source/symbols/alias"
        self.assertFalse(alias.is_symlink())
        self.assertEqual(alias.read_bytes(), b"data")
        self.assertEqual(result["regularBytes"], 4)
        self.assertEqual(result["materializedAliasBytes"], 4)
        self.assertEqual(result["sourceAliases"][0]["archiveType"], "symlink")

    def test_alias_cannot_change_its_pinned_target(self):
        self.assertCode("SOURCE_ALIAS_TARGET", self.extract, self.aliases(), target="other")

    def test_alias_cannot_escape_even_when_manifest_repeats_unsafe_target(self):
        self.assertCode("SOURCE_ALIAS_TARGET", self.extract, self.aliases("../outside"), target="../outside")

    def test_unlisted_link_remains_rejected(self):
        self.assertCode("SOURCE_TYPE", self.extract, self.aliases(), other_link=True)

    def test_alias_chain_cannot_replace_a_regular_target(self):
        aliases = {**self.aliases(), "symbols/real": {"target": "other", "size": 4, "sha256": digest(b"data")}}
        self.assertCode("SOURCE_ALIAS_REGULAR", self.extract, aliases, regular_target=False)

    def test_missing_alias_is_not_silently_accepted(self):
        self.assertCode("SOURCE_ALIAS_SET", self.extract, self.aliases(), include_alias=False)

    def test_alias_target_bytes_must_match_the_pin(self):
        aliases = self.aliases()
        aliases["symbols/alias"]["sha256"] = "0" * 64
        with self.assertRaises(ReviewError):
            self.extract(aliases)
        self.assertFalse((self.root / "source/symbols/alias").exists())

    def test_materialized_bytes_count_toward_expansion_budget(self):
        archive = self.alias_archive()
        with patch("xserver_windows_build.MAX_EXPANDED", 5), lzma.open(archive, "rb") as raw:
            self.assertCode("SOURCE_BUDGET", extract_tar, raw, self.root, "source", {}, self.aliases())
        self.assertEqual((self.root / "source/symbols/real").read_bytes(), b"data")
        self.assertFalse((self.root / "source/symbols/alias").exists())

    def data_fixture(self):
        prefix, source, build = [self.root / name for name in ["prefix", "source", "build"]]
        component = {"name": "data", "runtimeDataRoot": "share/xkeyboard-config-2", "sha256": "1" * 64,
                     "generatorInputs": {}, "generatedRuntimeFiles": {}, "licenseFiles": {}, "installedFiles": {}}
        owners = {}
        for category in sorted(CATEGORIES):
            relative = category + "/unit"
            raw = b"generated\r\n" if category == "rules" else b"fixed source\n"
            installed = component["runtimeDataRoot"] + "/" + relative
            path = prefix / installed
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(raw)
            origin = (build if category == "rules" else source) / relative
            origin.parent.mkdir(parents=True, exist_ok=True)
            origin.write_bytes(raw)
            component["installedFiles"][installed] = {"size": len(raw), "sha256": digest(raw)}
            owners[installed] = "data"
        component["generatedRuntimeFiles"]["rules/unit"] = {"normalizedSize": 10, "normalizedSha256": digest(b"generated\n")}
        return prefix, source, build, component, owners

    def test_inventory_binds_actual_source_generated_bytes_and_normalized_reference(self):
        evidence = runtime_inventory(*self.data_fixture())
        self.assertTrue(evidence["observationsComplete"])
        self.assertFalse(evidence["perFileLicenseReviewComplete"])
        self.assertEqual(len(evidence["files"]), 6)
        generated = next(item for item in evidence["files"] if "/rules/" in item["path"])
        self.assertEqual(generated["origin"], "generated-build-output")
        self.assertEqual(generated["size"], 11)
        self.assertEqual(generated["normalizedReference"]["normalizedSize"], 10)

    def test_changed_installed_bytes_fail_against_the_snapshot(self):
        args = self.data_fixture()
        (args[0] / args[3]["runtimeDataRoot"] / "types/unit").write_bytes(b"changed")
        self.assertCode("XKB_DATA_CHANGED", runtime_inventory, *args)

    def test_generated_output_cannot_hide_behind_a_matching_install_snapshot(self):
        args = self.data_fixture()
        (args[2] / "rules/unit").write_bytes(b"different")
        self.assertCode("XKB_DATA_INPUT", runtime_inventory, *args)

    def test_missing_category_and_unowned_file_fail(self):
        args = self.data_fixture()
        (args[0] / args[3]["runtimeDataRoot"] / "types/unit").unlink()
        self.assertCode("XKB_DATA_INCOMPLETE", runtime_inventory, *args)
        args[4].clear()
        self.assertCode("XKB_DATA_OWNER", runtime_inventory, *args)

    def test_generated_reference_detects_generator_drift(self):
        args = self.data_fixture()
        args[3]["generatedRuntimeFiles"]["rules/unit"]["normalizedSha256"] = "0" * 64
        self.assertCode("XKB_GENERATED_REFERENCE", runtime_inventory, *args)

    def test_failure_preserves_completed_inventory_and_current_file(self):
        args = self.data_fixture()
        installed = args[3]["runtimeDataRoot"] + "/types/unit"
        args[4][installed] = "unknown-owner"
        report = {}
        self.assertCode("XKB_DATA_OWNER", runtime_inventory, *args, report=report)
        self.assertFalse(report["xkbRuntimeData"]["observationsComplete"])
        self.assertEqual(len(report["xkbRuntimeData"]["files"]), 5)
        self.assertEqual(report["xkbRuntimeCurrent"], "types/unit")

    def test_component_names_reject_duplicate_incomplete_and_injectable_includes(self):
        output = "keycodes=evdev+aliases(qwerty)\ntypes=complete\ncompat=complete\nsymbols=pc+us+inet(evdev)\ngeometry=pc(pc105)\n"
        names = component_names(output)
        self.assertIn('xkb_compatibility { include "complete" };', keymap_text(names))
        for invalid in [output + "types=complete\n", output.replace("types=complete\n", ""), output.replace("pc+us", 'pc\"+us'), output.replace("pc+us", "../outside")]:
            self.assertCode("XKB_RULE_COMPONENTS", component_names, invalid)

    def test_keymap_semantics_require_both_distinct_layout_positions(self):
        us = 'key <AD06> { [ y, Y ] };\nkey <AB01> { [ z, Z ] };'
        self.assertEqual(verify_keymap(us, "us")["AD06"], ["y", "Y"])
        de = 'key <AD06> { type="FOUR_LEVEL", symbols[Group1]= [ z, Z, leftarrow, yen ] };\nkey <AB01> { [ y, Y ] };'
        self.assertEqual(verify_keymap(de, "de")["AB01"], ["y", "Y"])
        for invalid in [us, de.replace("key <AB01>", "key <AB02>"), de + de, de.replace("[ y, Y ]", "[ z, Z ]")]:
            self.assertCode("XKB_KEYMAP_SEMANTICS", verify_keymap, invalid, "de")

    def test_negative_probe_exit_must_match_the_exact_expected_code(self):
        run([sys.executable, "-c", "raise SystemExit(3)"], self.root, capture=True, expected_exit=3)
        with self.assertRaisesRegex(ReviewError, "BUILD_EXIT"):
            run([sys.executable, "-c", "raise SystemExit(2)"], self.root, capture=True, expected_exit=3)

    def test_server_paths_are_observed_in_the_actual_generated_header(self):
        header = self.root / "include/xkb-config.h"
        header.parent.mkdir()
        header.write_text('#define XKB_BASE_DIRECTORY "D:/private/data"\n#define XKB_BIN_DIRECTORY "D:/private/bin"\n')
        self.assertTrue(configured_paths(self.root, "D:/private/data", "D:/private/bin")["verified"])
        self.assertCode("XKB_SERVER_PATH", configured_paths, self.root, "D:/system/data", "D:/private/bin")


if __name__ == "__main__":
    unittest.main()
