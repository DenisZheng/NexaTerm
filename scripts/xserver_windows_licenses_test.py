import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from xserver_source_review import ReviewError, digest
from xserver_windows_inventory import package_evidence
from xserver_windows_licenses import source_license_evidence


class SourceLicenseTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.assets, self.sdk = self.root / "assets", self.root / "sdk"
        self.assets.mkdir()
        self.object = self.sdk / "lib/default-manifest.o"
        self.object.parent.mkdir(parents=True)
        self.object.write_bytes(b"object")
        self.notice = self.assets / "notice.txt"
        self.notice.write_bytes(b"test-only notice fixture")
        self.package = "mingw-w64-ucrt-x86_64-fixture"
        self.item = {
            "version": "1-1", "packageDeclaredLicense": "custom:Public Domain",
            "installedFiles": {"lib/default-manifest.o": {"size": 6, "sha256": digest(b"object")}},
            "sourceRepositoryLicense": {"file": "notice.txt", "size": self.notice.stat().st_size,
                                        "sha256": digest(self.notice.read_bytes()), "spdx": "BSD-3-Clause"},
            "sourceProvenance": {"scope": "fixture"}, "publishedPackage": {"scope": "fixture"}}
        self.write_manifest()

    def write_manifest(self):
        (self.assets / "toolchain-license-sources.json").write_text(
            json.dumps({"schema": 1, "packages": {self.package: self.item}}))

    def collect(self, package=None, version="1-1", declared="custom:Public Domain", files=None):
        return source_license_evidence(package or self.package, version, declared,
                                       files if files is not None else [self.object],
                                       toolchain_root=self.sdk, assets=self.assets)

    def assertCode(self, code, operation):
        with self.assertRaises(ReviewError) as caught:
            operation()
        self.assertEqual(str(caught.exception), code)

    def test_exact_source_receipt_does_not_claim_an_installed_notice_or_adoption(self):
        result = self.collect()
        self.assertFalse(result["installedLicenseTextPresent"])
        self.assertFalse(result["distributionApproved"])
        self.assertEqual(result["status"], "REVIEW-REQUIRED")
        self.assertEqual(result["manifestSha256"], digest((self.assets / "toolchain-license-sources.json").read_bytes()))
        self.assertEqual(result["sourceRepositoryLicense"]["spdx"], "BSD-3-Clause")
        self.assertEqual(result["packageDeclaredLicense"], "custom:Public Domain")
        self.assertIsNone(self.collect(package="mingw-w64-ucrt-x86_64-unlisted"))

    def test_version_declaration_missing_and_extra_file_scope_cannot_pass(self):
        extra = self.sdk / "other.o"
        extra.write_bytes(b"other")
        for operation in [lambda: self.collect(version="2-1"), lambda: self.collect(declared="MIT"),
                          lambda: self.collect(files=[]), lambda: self.collect(files=[self.object, extra])]:
            with self.subTest(operation=operation):
                self.assertCode("TOOLCHAIN_SOURCE_LICENSE_SCOPE", operation)

    def test_changed_installed_object_or_source_notice_is_rejected(self):
        self.object.write_bytes(b"change")
        self.assertCode("INPUT_SHA256", self.collect)
        self.object.write_bytes(b"object")
        self.notice.write_bytes(b"test-only notice fixturz")
        self.assertCode("INPUT_SHA256", self.collect)

    def test_source_assets_and_object_paths_cannot_escape_their_roots(self):
        for name in ["../notice.txt", "D:/notice.txt", "notice.txt:stream"]:
            with self.subTest(name=name):
                self.item["sourceRepositoryLicense"]["file"] = name
                self.write_manifest()
                self.assertCode("TOOLCHAIN_SOURCE_LICENSE_PATH", self.collect)
        self.item["sourceRepositoryLicense"]["file"] = "notice.txt"
        self.item["installedFiles"] = {"../outside.o": {"size": 6, "sha256": digest(b"object")}}
        self.write_manifest()
        self.assertCode("TOOLCHAIN_SOURCE_LICENSE_PATH", self.collect)

    def test_package_inventory_retains_missing_installed_text_and_separate_source_evidence(self):
        def run(arguments, *args, **kwargs):
            return "Version : 1-1\nLicenses : custom:Public Domain\n" if "-Qi" in arguments else self.package + " " + str(self.object) + "\n"
        def evidence(package, version, declared, files):
            return self.collect(package, version, declared, files)
        with patch("xserver_windows_inventory.source_license_evidence", evidence):
            result = package_evidence(self.package, self.root, run)
        self.assertEqual(result["licenseFiles"], {})
        self.assertFalse(result["sourceLicenseEvidence"]["installedLicenseTextPresent"])
        self.assertFalse(result["distributionApproved"])


if __name__ == "__main__":
    unittest.main()
