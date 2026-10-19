import io
import json
import os
from pathlib import Path
import struct
import tarfile
import tempfile
import unittest
from unittest.mock import patch

import xserver_windows_build as build


class WindowsBuildTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def assertCode(self, code, operation, *args):
        with self.assertRaises(build.ReviewError) as caught:
            operation(*args)
        self.assertEqual(str(caught.exception), code)

    def archive(self, names, kind=tarfile.REGTYPE):
        path = self.root / "input.tar.xz"
        with tarfile.open(path, "w:xz") as tar:
            for name in names:
                member = tarfile.TarInfo(name)
                member.type = kind
                member.mtime = 1700000000
                member.size = 3 if member.isreg() else 0
                tar.addfile(member, io.BytesIO(b"abc"))
        return path

    def test_safe_extraction_verifies_exact_license_bytes(self):
        path = self.archive(["root/COPYING"])
        result = build.extract_component(path, self.root, "root", {"COPYING": build.digest(b"abc")})
        self.assertEqual(result["regularBytes"], 3)
        self.assertEqual((self.root / "root/COPYING").read_bytes(), b"abc")
        self.assertEqual((self.root / "root/COPYING").stat().st_mtime, 1700000000)

    def test_traversal_and_absolute_paths_never_write_outside_root(self):
        for name in ["root/../outside", "/root/a", "other/a", "root//a", "root\\a"]:
            with self.subTest(name=name):
                path = self.archive([name])
                self.assertCode("SOURCE_PATH", build.extract_component, path, self.root, "root", {})
        self.assertFalse((self.root / "outside").exists())

    def test_links_special_files_and_duplicates_are_rejected(self):
        for kind in [tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.FIFOTYPE]:
            with self.subTest(kind=kind):
                self.assertCode("SOURCE_TYPE", build.extract_component, self.archive(["root/a"], kind), self.root, "root", {})
        self.assertCode("SOURCE_DUPLICATE", build.extract_component, self.archive(["root/a"] * 2), self.root, "root", {})

    def test_modified_or_missing_license_anchor_is_rejected(self):
        path = self.archive(["root/COPYING"])
        self.assertCode("SOURCE_LICENSE", build.extract_component, path, self.root, "root", {"COPYING": "0" * 64})

    def test_archive_expansion_budget_rejects_before_file_write(self):
        with patch.object(build, "MAX_EXPANDED", 2):
            self.assertCode("SOURCE_BUDGET", build.extract_component, self.archive(["root/a"]), self.root, "root", {})
        self.assertFalse((self.root / "root/a").exists())

    def test_source_redirects_cannot_leave_the_reviewed_official_hosts(self):
        for url in ["http://xorg.freedesktop.org/releases/individual/lib/a", "https://xorg.freedesktop.org@other.invalid/a", "https://xcb.freedesktop.org/dist/a?token=unexpected"]:
            with self.subTest(url=url):
                self.assertCode("SOURCE_URL", build.check_source_url, url)

    def test_wrong_architecture_pe_rejected_before_inspector(self):
        path = self.root / "wrong.exe"
        data = bytearray(128)
        data[:2] = b"MZ"
        struct.pack_into("<I", data, 60, 64)
        data[64:68] = b"PE\0\0"
        struct.pack_into("<H", data, 68, 0x14C)
        path.write_bytes(data)
        self.assertCode("PE_ARCHITECTURE", build.pe_imports, path, self.root)

    def test_source_patch_rejects_changed_input_and_output_before_mutation(self):
        path = self.root / "input.c"
        path.write_bytes(b"old")
        patch_spec = {"path": "input.c", "beforeSha256": build.digest(b"old"),
                      "afterSha256": build.digest(b"new"), "reason": "fixture",
                      "replacements": [{"before": "old", "after": "new"}]}
        for key in ["beforeSha256", "afterSha256"]:
            with self.subTest(key=key):
                bad = {**patch_spec, key: "0" * 64}
                self.assertCode("PATCH_INPUT" if key == "beforeSha256" else "PATCH_OUTPUT",
                                build.apply_source_patches, self.root, [bad])
                self.assertEqual(path.read_bytes(), b"old")
        result = build.apply_source_patches(self.root, [patch_spec])
        self.assertEqual(path.read_bytes(), b"new")
        self.assertEqual(result[0]["beforeSha256"], build.digest(b"old"))

    def test_repeated_source_patch_requires_explicit_exact_occurrence_count(self):
        path = self.root / "input.c"
        path.write_bytes(b"old old")
        patch_spec = {"path": "input.c", "beforeSha256": build.digest(b"old old"),
                      "afterSha256": build.digest(b"new new"), "reason": "fixture",
                      "replacements": [{"before": "old", "after": "new"}]}
        self.assertCode("PATCH_MATCH", build.apply_source_patches, self.root, [patch_spec])
        self.assertEqual(path.read_bytes(), b"old old")
        patch_spec["replacements"][0]["occurrences"] = 2
        build.apply_source_patches(self.root, [patch_spec])
        self.assertEqual(path.read_bytes(), b"new new")

    def test_source_patch_path_cannot_escape_private_source(self):
        for path in ["../outside.c", "/outside.c", "root\\outside.c"]:
            with self.subTest(path=path):
                self.assertCode("PATCH_PATH", build.apply_source_patches, self.root, [{"path": path}])

    def test_authored_overlay_requires_both_exact_asset_and_result_before_write(self):
        source = self.root / "input.c"
        source.write_bytes(b"old")
        assets = self.root / "assets"
        assets.mkdir()
        (assets / "overlay.c").write_bytes(b"new")
        spec = {"path": "input.c", "beforeSha256": build.digest(b"old"),
                "afterSha256": build.digest(b"new"), "reason": "fixture",
                "overlay": {"file": "overlay.c", "size": 3, "sha256": build.digest(b"new")}}
        with patch.object(build, "ASSETS", assets):
            self.assertCode("PATCH_OUTPUT", build.apply_source_patches, self.root, [{**spec, "afterSha256": "0" * 64}])
            self.assertEqual(source.read_bytes(), b"old")
            self.assertCode("PATCH_METHOD", build.apply_source_patches, self.root, [{**spec, "replacements": []}])
            build.apply_source_patches(self.root, [spec])
        self.assertEqual(source.read_bytes(), b"new")

    def test_generator_path_probe_does_not_execute_state_without_generator_context(self):
        prefix = self.root / "prefix"
        package = prefix / "lib/python3/site-packages/xcbgen"
        source = self.root / "source/xcbgen"
        for directory in [package, source]:
            directory.mkdir(parents=True)
            (directory / "__init__.py").write_text("# fixed generator package\n")
        (package / "state.py").write_text("raise RuntimeError('requires real generator context')\n")
        with patch.dict(os.environ):
            result = build.verify_host_generator(prefix, source.parent, self.root)
        self.assertEqual(result["moduleSha256"], build.digest((source / "__init__.py").read_bytes()))

    def test_explicit_pinned_missing_header_creation_cannot_overwrite_existing_input(self):
        assets = self.root / "assets"
        assets.mkdir()
        (assets / "header.h").write_bytes(b"declarations")
        target = self.root / "include/header.h"
        spec = {"path": "include/header.h", "create": True, "beforeSha256": None,
                "afterSha256": build.digest(b"declarations"), "reason": "missing release declaration fixture",
                "overlay": {"file": "header.h", "size": 12, "sha256": build.digest(b"declarations")}}
        with patch.object(build, "ASSETS", assets):
            build.apply_source_patches(self.root, [spec])
            self.assertEqual(target.read_bytes(), b"declarations")
            self.assertCode("PATCH_CREATE", build.apply_source_patches, self.root, [spec])

    def test_actual_posix_runtime_import_is_rejected(self):
        server = self.root / "server.exe"
        server.write_bytes(b"fixture")
        for name in ["cygwin1.dll", "msys-2.0.dll"]:
            with self.subTest(name=name), patch.object(build, "pe_imports", return_value=[name]):
                self.assertCode("PE_POSIX_RUNTIME", build.inspect_closure, server, [self.root], self.root)

    def test_unresolved_dll_cannot_be_silently_treated_as_system(self):
        server = self.root / "server.exe"
        server.write_bytes(b"fixture")
        with patch.object(build, "pe_imports", return_value=["unknown.dll"]):
            self.assertCode("PE_PROVIDER", build.inspect_closure, server, [self.root], self.root)

    def test_failure_replaces_stale_success_report(self):
        report = self.root / "report.json"
        report.write_text('{"nativeBuildVerified":true}')
        with patch.object(build, "build", side_effect=build.ReviewError("BUILD_EXIT")):
            self.assertEqual(build.main(["--work", str(self.root / "work"), "--report", str(report)]), 1)
        actual = json.loads(report.read_text())
        self.assertFalse(actual["nativeBuildVerified"])
        self.assertFalse(actual["bundled"])
        self.assertEqual(actual["error"], "BUILD_EXIT")


if __name__ == "__main__":
    unittest.main()
