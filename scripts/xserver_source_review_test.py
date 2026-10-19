"""核验器反例；真实上游签名集成另由专用 CI 执行。"""

import io
import json
import lzma
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

import xserver_source_review as review


MANIFEST = json.loads((review.ASSETS / "upstream-source.json").read_text())
SIGNING = MANIFEST["signing"]
FINGERPRINT = SIGNING["fingerprint"]
VALID = (
    f"[GNUPG:] GOODSIG {FINGERPRINT[-16:]} Public release identity\n"
    f"[GNUPG:] VALIDSIG {FINGERPRINT} 2026-10-07 1791337345 0 4 0 17 2 00 {FINGERPRINT}\n"
)


class SourceReviewTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def assertCode(self, code, function, *args):
        with self.assertRaises(review.ReviewError) as caught:
            function(*args)
        self.assertEqual(str(caught.exception), code)

    def archive(self, entries=None):
        entries = entries or [("root/COPYING", b"license", None)]
        path = self.root / "source.tar.xz"
        with tarfile.open(path, "w:xz") as tar:
            for name, content, kind in entries:
                info = tarfile.TarInfo(name)
                info.size = len(content)
                if kind is not None:
                    info.type = kind
                    info.linkname = "root/COPYING"
                tar.addfile(info, io.BytesIO(content))
        source = {
            "root": "root", "members": 1, "regularFiles": 1,
            "directories": 0, "regularBytes": 7,
            "anchors": {"COPYING": review.digest(b"license")}, "absent": ["missing.c"],
        }
        return path, source

    def test_valid_status_preserves_legacy_algorithms(self):
        result = review.parse_signature_status(VALID, SIGNING)
        self.assertEqual((result["publicKeyAlgorithm"], result["digestAlgorithm"], result["keyBits"]), (17, 2, 1024))

    def test_invalid_expired_revoked_or_unknown_status_is_rejected(self):
        for status in ["BADSIG", "ERRSIG", "EXPSIG", "EXPKEYSIG", "REVKEYSIG", "FAILURE", "NEW_UNKNOWN"]:
            with self.subTest(status=status):
                self.assertCode("SIGNATURE_STATUS", review.parse_signature_status, VALID + f"[GNUPG:] {status} value\n", SIGNING)

    def test_duplicate_or_missing_signature_status_is_rejected(self):
        for status in ["", VALID + VALID, VALID.splitlines()[1] + "\n"]:
            with self.subTest(status=status):
                self.assertCode("SIGNATURE_COUNT" if status else "SIGNATURE_STATUS", review.parse_signature_status, status, SIGNING)

    def test_wrong_signer_primary_signer_and_good_key_are_rejected(self):
        for old, new in [(FINGERPRINT, "A" * 40), (FINGERPRINT[-16:], "B" * 16)]:
            with self.subTest(old=old):
                self.assertCode("SIGNATURE_SIGNER", review.parse_signature_status, VALID.replace(old, new, 1), SIGNING)
        self.assertCode("SIGNATURE_SIGNER", review.parse_signature_status, VALID.rsplit(FINGERPRINT, 1)[0] + "C" * 40 + "\n", SIGNING)

    def test_wrong_signature_algorithm_or_epoch_is_rejected(self):
        for old, new, code in [("17 2 00", "1 8 00", "SIGNATURE_ALGORITHM"), ("1791337345", "1791337346", "SIGNATURE_TIME"), ("7345 0 4", "7345 1 4", "SIGNATURE_TIME")]:
            with self.subTest(old=old):
                self.assertCode(code, review.parse_signature_status, VALID.replace(old, new), SIGNING)

    def test_nonzero_tool_exit_cannot_pass_with_validsig_stdout(self):
        with patch.object(review.subprocess, "run", return_value=subprocess.CompletedProcess([], 1, VALID, "private detail")):
            self.assertCode("VERIFIER_EXIT", review.run_tool, ["gpgv"])

    def test_missing_and_timed_out_tools_are_rejected(self):
        for error, code in [(FileNotFoundError(), "VERIFIER_MISSING"), (subprocess.TimeoutExpired("gpgv", 30), "VERIFIER_TIMEOUT")]:
            with self.subTest(code=code), patch.object(review.subprocess, "run", side_effect=error):
                self.assertCode(code, review.run_tool, ["gpgv"])

    def test_key_corruption_fails_before_any_verifier_runs(self):
        key = self.root / "key.asc"
        key.write_bytes(b"x" * SIGNING["keySize"])
        with patch.object(review, "run_tool") as tool:
            self.assertCode("INPUT_SHA256", review.verify_signature, self.root / "archive", self.root / "sig", key, SIGNING)
            tool.assert_not_called()

    def test_every_cached_input_requires_size_and_hash(self):
        for name in [MANIFEST["archive"]["name"], MANIFEST["signature"]["name"]]:
            with self.subTest(name=name):
                item = {"name": name, "size": 3, "sha256": review.digest(b"abc")}
                path = self.root / name
                self.assertCode("OFFLINE_INPUT_MISSING", review.cached_input, self.root, item, True)
                path.write_bytes(b"bad")
                self.assertCode("INPUT_SHA256", review.cached_input, self.root, item, False)
                path.write_bytes(b"no")
                self.assertCode("INPUT_SIZE", review.cached_input, self.root, item, True)
                path.write_bytes(b"abc")
                self.assertEqual(review.cached_input(self.root, item, True), path)

    def test_download_url_cannot_change_protocol_host_or_credentials(self):
        for url in ["http://xorg.freedesktop.org/releases/individual/xserver/a", "https://evil.example/a", "https://xorg.freedesktop.org@evil.example/a", "https://xorg.freedesktop.org/other/a", "https://xorg.freedesktop.org/releases/individual/xserver/a?key=private"]:
            with self.subTest(url=url):
                self.assertCode("DOWNLOAD_URL", review.check_url, url)

    def test_oversized_download_leaves_no_cache_or_partial_file(self):
        item = {"name": "a.tar.xz", "url": "https://xorg.freedesktop.org/releases/individual/xserver/a.tar.xz", "size": 3, "sha256": review.digest(b"abc")}
        response = io.BytesIO(b"abcd")
        response.url = item["url"]
        with patch.object(review, "build_opener") as opener:
            opener.return_value.open.return_value = response
            self.assertCode("DOWNLOAD_SIZE", review.cached_input, self.root, item, False)
        self.assertEqual(list(self.root.iterdir()), [])

    def test_safe_archive_inventory_does_not_extract_source(self):
        path, source = self.archive()
        inventory = review.inspect_archive(path, source)
        self.assertEqual(inventory["files"]["COPYING"], {"size": 7, "sha256": review.digest(b"license")})
        self.assertEqual(list(self.root.iterdir()), [path])

    def test_archive_traversal_absolute_and_noncanonical_paths_are_rejected(self):
        for name in ["root/../escape", "/root/COPYING", "root//COPYING", "root/./COPYING", "root\\COPYING", "other/COPYING"]:
            with self.subTest(name=name):
                path, source = self.archive([(name, b"license", None)])
                self.assertCode("ARCHIVE_PATH", review.inspect_archive, path, source)

    def test_links_and_special_files_are_rejected(self):
        for kind in [tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.FIFOTYPE, tarfile.CHRTYPE]:
            with self.subTest(kind=kind):
                path, source = self.archive([("root/COPYING", b"", kind)])
                self.assertCode("ARCHIVE_TYPE", review.inspect_archive, path, source)

    def test_duplicate_members_are_rejected(self):
        path, source = self.archive([("root/COPYING", b"license", None)] * 2)
        self.assertCode("ARCHIVE_DUPLICATE", review.inspect_archive, path, source)

    def test_archive_member_and_expansion_budgets(self):
        path, source = self.archive()
        for constant, value in [("MAX_MEMBERS", 0), ("MAX_BYTES", 6), ("MAX_ANCHOR", 6)]:
            with self.subTest(constant=constant), patch.object(review, constant, value):
                self.assertCode("ARCHIVE_BUDGET", review.inspect_archive, path, source)

    def test_tar_metadata_and_trailing_padding_also_consume_budget(self):
        path, source = self.archive()
        expanded = lzma.decompress(path.read_bytes())
        path.write_bytes(lzma.compress(expanded + b"\0" * 32768))
        with patch.object(review, "MAX_TAR_BYTES", len(expanded)):
            self.assertCode("ARCHIVE_BUDGET", review.inspect_archive, path, source)

    def test_changed_anchor_counts_and_unexpected_fork_file(self):
        path, source = self.archive()
        cases = [("anchors", {"COPYING": "0" * 64}, "ARCHIVE_ANCHOR"), ("members", 2, "ARCHIVE_COUNTS"), ("absent", ["COPYING"], "ARCHIVE_ABSENT")]
        for field, value, code in cases:
            changed = {**source, field: value}
            with self.subTest(field=field):
                self.assertCode(code, review.inspect_archive, path, changed)

    def test_collection_always_requires_adoption_and_build_review(self):
        with patch.object(review, "cached_input", return_value=self.root / "unused"), patch.object(review, "verify_signature", return_value={}), patch.object(review, "inspect_archive", return_value={}):
            report = review.collect(self.root, True)
        self.assertEqual(report["status"], "REVIEW-REQUIRED")
        self.assertTrue(report["integrityVerified"])
        self.assertFalse(report["distributionApproved"])
        self.assertFalse(report["bundled"])
        self.assertIn("legacy-signature-algorithms", report["pendingReview"])
        self.assertIn("native-windows-build", report["pendingReview"])
        self.assertIn("per-file-and-dependency-licenses", report["pendingReview"])

    def test_failed_collection_replaces_stale_report_without_raw_details(self):
        report = self.root / "report.json"
        report.write_text('{"status":"REVIEW-REQUIRED","integrityVerified":true}')
        with patch.object(review, "collect", side_effect=OSError("private path or tool identity")):
            self.assertEqual(review.main(["--offline", "--report", str(report)]), 1)
        actual = json.loads(report.read_text())
        self.assertEqual(actual["status"], "FAIL")
        self.assertFalse(actual["integrityVerified"])
        self.assertNotIn("private", report.read_text())

    def test_failed_report_write_removes_stale_success(self):
        report = self.root / "report.json"
        report.write_text('{"status":"REVIEW-REQUIRED"}')
        with patch.object(review, "collect", side_effect=review.ReviewError("INPUT_SHA256")), patch.object(review, "write_report", side_effect=OSError()):
            self.assertEqual(review.main(["--report", str(report)]), 1)
        self.assertFalse(report.exists())


if __name__ == "__main__":
    unittest.main()
