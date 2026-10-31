import io
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch
from urllib.request import Request

from xserver_source_review import ReviewError, digest
import xserver_windows_prebuilt_inputs as inputs
from xserver_windows_prebuilt_fixtures import make_fixture


class PrebuiltInputTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)

    def assertCode(self, code, operation):
        with self.assertRaises(ReviewError) as caught:
            operation()
        self.assertEqual(str(caught.exception), code)

    def test_url_and_redirects_are_limited_to_reviewed_material_hosts_and_paths(self):
        for url in ["http://repo.msys2.org/mingw/ucrt64/a.pkg.tar.zst",
                    "https://repo.msys2.org@evil.invalid/mingw/ucrt64/a.pkg.tar.zst",
                    "https://repo.msys2.org/mingw/ucrt64/mingw-w64-ucrt-x86_64-a.pkg.tar.zst?q=1",
                    "https://raw.githubusercontent.com/msys2/MINGW-packages/master/a",
                    "https://raw.githubusercontent.com/msys2/MINGW-packages/" + "a" * 40 + "/../a",
                    "https://patch-diff.githubusercontent.com/raw/madler/zlib/pull/1166.patch"]:
            with self.subTest(url=url):
                self.assertCode("PREBUILT_URL", lambda: inputs.check_material_url(url))
                self.assertCode("PREBUILT_URL", lambda: inputs.MaterialRedirect().redirect_request(
                    Request("https://repo.msys2.org"), None, 302, "redirect", {}, url))

    def material(self):
        raw = b"fixed input"
        return raw, {"size": len(raw), "sha256": digest(raw),
                     "url": "https://patch-diff.githubusercontent.com/raw/madler/zlib/pull/1165.patch"}

    def test_cache_corruption_and_offline_missing_never_trigger_replacement(self):
        raw, pin = self.material()
        self.assertCode("PREBUILT_OFFLINE_MISSING", lambda: inputs.cached_material(self.root, pin, True))
        path = self.root / pin["sha256"]
        path.write_bytes(raw)
        self.assertEqual(inputs.cached_material(self.root, pin, True), path)
        path.write_bytes(b"x" * len(raw))
        with patch.object(inputs, "build_opener") as network:
            self.assertCode("INPUT_SHA256", lambda: inputs.cached_material(self.root, pin, False))
            network.assert_not_called()
        self.assertEqual(path.read_bytes(), b"x" * len(raw))

    def download(self, raw, pin):
        response = io.BytesIO(raw)
        response.url = pin["url"]
        opener = Mock()
        opener.open.return_value = response
        with patch.object(inputs, "build_opener", return_value=opener):
            return inputs.cached_material(self.root, pin, False)

    def test_download_validates_bytes_before_atomic_cache_write(self):
        raw, pin = self.material()
        self.assertEqual(self.download(raw, pin).read_bytes(), raw)
        self.assertEqual([p.name for p in self.root.iterdir()], [pin["sha256"]])

    def test_download_size_digest_network_and_deadline_fail_without_cache(self):
        raw, pin = self.material()
        for data, code in [(raw + b"x", "PREBUILT_DOWNLOAD_SIZE"), (b"x" * len(raw), "INPUT_SHA256")]:
            with self.subTest(code=code):
                self.assertCode(code, lambda: self.download(data, pin))
                self.assertEqual(list(self.root.iterdir()), [])
        with patch.object(inputs, "build_opener", side_effect=OSError("private network error")):
            self.assertCode("PREBUILT_DOWNLOAD_FAILED", lambda: inputs.cached_material(self.root, pin, False))
        with patch.object(inputs.time, "monotonic", side_effect=[0, 121]):
            self.assertCode("PREBUILT_DOWNLOAD_TIMEOUT", lambda: self.download(raw, pin))
        self.assertEqual(list(self.root.iterdir()), [])

    def test_metadata_preserves_declared_environment_but_rejects_ambiguous_identity(self):
        result = inputs.parse_metadata(b"# comment\ninstalled = compiler-1\ninstalled = compiler-2\n")
        self.assertEqual(result["installed"], ["compiler-1", "compiler-2"])
        self.assertCode("PREBUILT_METADATA_SINGLE", lambda: inputs.single(result, "installed"))
        self.assertCode("PREBUILT_METADATA_SINGLE", lambda: inputs.single(result, "pkgname"))
        for raw in [b"pkgname=x", b"pkgname = x\x00y", b"bad key = x"]:
            self.assertCode("PREBUILT_METADATA", lambda: inputs.parse_metadata(raw))

    def test_tar_listing_rejects_changed_duplicate_or_escaping_members_before_read(self):
        cache, _, manifest, _, _ = make_fixture(self.root)
        item = manifest["packages"][0]
        path = cache / item["archive"]["sha256"]
        for names, code in [(["../outside"], "PREBUILT_MEMBER_PATH"), (["/absolute"], "PREBUILT_MEMBER_PATH"),
                            (["a\\b"], "PREBUILT_MEMBER_PATH"), (["a//b"], "PREBUILT_MEMBER_PATH"),
                            (["a", "a"], "PREBUILT_MEMBERS"), (["-C"], "PREBUILT_MEMBER_PATH"),
                            ([".PKGINFO"], "PREBUILT_MEMBER_SET")]:
            with self.subTest(names=names):
                run = Mock(return_value=("\n".join(names) + "\n").encode())
                self.assertCode(code, lambda: inputs.inspect_package(path, item, run=run))
                self.assertEqual(run.call_count, 1)

    def test_tar_members_are_all_hashed_and_file_set_and_output_budget_are_required(self):
        cache, _, manifest, _, payloads = make_fixture(self.root)
        item = manifest["packages"][0]
        path = cache / item["archive"]["sha256"]
        listing = ("\n".join(item["members"]) + "\n").encode()
        run = lambda args: listing if args[0] == "-tf" else payloads[0][args[-1]]
        self.assertEqual(inputs.inspect_package(path, item, run=run), payloads[0])
        with patch.object(inputs, "MAX_TOOL_OUTPUT", 1):
            self.assertCode("PREBUILT_MEMBER_BYTES", lambda: inputs.inspect_package(path, item, run=run))
        name = next(iter(item["files"]))
        item["files"][name]["sha256"] = "0" * 64
        self.assertCode("PREBUILT_MEMBER_BYTES", lambda: inputs.inspect_package(path, item, run=run))
        item["files"].pop(name)
        self.assertCode("PREBUILT_FILE_SET", lambda: inputs.inspect_package(path, item, run=run))

    def test_tar_tool_missing_timeout_and_nonzero_exit_cannot_pass(self):
        for error, code in [(FileNotFoundError(), "PREBUILT_ARCHIVE_TOOL_MISSING"),
                            (subprocess.TimeoutExpired("tar", 30), "PREBUILT_ARCHIVE_TOOL_TIMEOUT")]:
            with patch.object(inputs.subprocess, "run", side_effect=error):
                self.assertCode(code, lambda: inputs.archive_tool(["-tf", "fixture"]))
        with patch.object(inputs.subprocess, "run", return_value=Mock(returncode=1)):
            self.assertCode("PREBUILT_ARCHIVE_TOOL_EXIT", lambda: inputs.archive_tool(["-tf", "fixture"]))

    def test_tar_tool_cannot_inherit_action_options_and_bounds_stdout(self):
        def run(args, **kwargs):
            self.assertEqual(args, ["tar", "-tf", "fixture"])
            self.assertNotIn("TAR_OPTIONS", kwargs["env"])
            self.assertNotIn("TAPE", kwargs["env"])
            self.assertEqual(kwargs["timeout"], 30)
            kwargs["stdout"].write(b"fixture output")
            return Mock(returncode=0)
        with patch.dict(os.environ, {"TAR_OPTIONS": "--to-command=unwanted", "TAPE": "unwanted"}), patch.object(inputs.subprocess, "run", side_effect=run):
            self.assertEqual(inputs.archive_tool(["-tf", "fixture"]), b"fixture output")
            with patch.object(inputs, "MAX_TOOL_OUTPUT", 1):
                self.assertCode("PREBUILT_ARCHIVE_TOOL_BUDGET", lambda: inputs.archive_tool(["-tf", "fixture"]))


if __name__ == "__main__":
    unittest.main()
