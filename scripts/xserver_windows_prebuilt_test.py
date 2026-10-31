import copy
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import xserver_windows_prebuilt as materials
from xserver_source_review import ReviewError
from xserver_windows_prebuilt_fixtures import make_fixture, pin_package, pin_recipe, save_manifest


class PrebuiltMaterialTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.cache, self.assets, self.manifest, self.native, self.payloads = make_fixture(self.root)
        self.item = self.manifest["packages"][0]

    def collect(self, native=True, result=None):
        save_manifest(self.assets, self.manifest)
        return materials.collect_materials(self.cache, assets=self.assets, offline=True,
                                           native=self.native if native else None, result=result)

    def assertCode(self, code, operation):
        with self.assertRaises(ReviewError) as caught:
            operation()
        self.assertEqual(str(caught.exception), code)

    def test_real_tar_collection_binds_four_providers_without_extraction(self):
        before = set(self.root.rglob("*"))
        result = self.collect()
        self.assertEqual(set(self.root.rglob("*")), before)
        self.assertEqual(result["status"], "REVIEW-REQUIRED")
        self.assertEqual(result["providerBinding"], "enclosing-native-report")
        self.assertEqual(len(result["files"]), 4)
        self.assertEqual(result["files"][0]["declaredBuildEnvironment"], ["compiler-0", "other-1"])
        for key in ("distributionApproved", "bundled", "desktopVerified", "prebuiltDllInternalsIncluded",
                    "perFileLicenseReviewComplete", "packageSignaturesVerified",
                    "upstreamSourceArchivesCollected", "sourceDistributionApproved"):
            self.assertIs(result[key], False)
        self.assertEqual(self.collect(native=False)["providerBinding"], "fixed-baseline-reference")

    def test_actual_provider_identity_version_notice_and_completeness_are_required(self):
        original = copy.deepcopy(self.native)
        changes = [(lambda: self.native["privatePeLinkage"].update(observationsComplete=False), "PREBUILT_NATIVE_INCOMPLETE"),
                   (lambda: self.native["privatePeLinkage"]["prebuiltDllsExcluded"].pop(), "PREBUILT_PROVIDER_CHANGED"),
                   (lambda: self.native["privatePeLinkage"]["prebuiltDllsExcluded"][0].update(sha256="0" * 64), "PREBUILT_PROVIDER_CHANGED"),
                   (lambda: self.native["runtimePackages"][0].update(version="2-1"), "PREBUILT_VERSION_CHANGED"),
                   (lambda: self.native["runtimePackages"][0].update(licenseFiles={}), "PREBUILT_NOTICE_CHANGED")]
        for change, code in changes:
            with self.subTest(code=code):
                self.native = copy.deepcopy(original)
                change()
                self.assertCode(code, self.collect)

    def test_package_metadata_must_bind_recipe_hash_and_exact_identity(self):
        original = self.payloads[0][".BUILDINFO"]
        for old, new, code in [(b"pkgver = 1-1", b"pkgver = 2-1", "PREBUILT_PACKAGE_IDENTITY"),
                               (self.item["recipe"]["files"][0]["sha256"].encode(), b"0" * 64, "PREBUILT_RECIPE_CHANGED"),
                               (b"pkgarch = any", b"pkgarch = x86_64", "PREBUILT_PACKAGE_IDENTITY")]:
            with self.subTest(code=code):
                self.payloads[0][".BUILDINFO"] = original.replace(old, new)
                pin_package(self.cache, self.item, self.payloads[0])
                self.assertCode(code, self.collect)

    def test_recipe_blob_and_local_and_external_declarations_are_not_assumed(self):
        original = copy.deepcopy(self.item)
        for change, code in [(lambda: self.item["recipe"]["files"][1].update(gitBlob="0" * 40), "PREBUILT_RECIPE_BLOB"),
                             (lambda: self.item["recipe"]["files"][1].update(path="mingw-w64-fixture0/../fix.patch"), "PREBUILT_RECIPE_SCOPE"),
                             (lambda: self.item["recipe"]["files"][1].update(sha256=self.item["externalMaterials"][0]["sha256"],
                                                                                 size=self.item["externalMaterials"][0]["size"]), "PREBUILT_RECIPE_BLOB")]:
            with self.subTest(code=code):
                self.item.clear()
                self.item.update(copy.deepcopy(original))
                change()
                self.assertCode(code, self.collect)
        self.item.clear()
        self.item.update(original)
        recipe_sha = original["recipe"]["files"][0]["sha256"]
        recipe_bytes = (self.cache / recipe_sha).read_bytes()
        build_info = self.payloads[0][".BUILDINFO"]
        for old, new, code in [(b"fix.patch", b"bad.patch", "PREBUILT_LOCAL_SOURCE_REFERENCE"),
                               (self.item["externalMaterials"][0]["sha256"].encode(), b"0" * 64, "PREBUILT_EXTERNAL_SOURCE_REFERENCE")]:
            changed = pin_recipe(self.cache, recipe_bytes.replace(old, new), self.item["recipe"]["directory"], "PKGBUILD")
            self.item["recipe"]["files"][0] = changed
            self.payloads[0][".BUILDINFO"] = build_info.replace(recipe_sha.encode(), changed["sha256"].encode())
            pin_package(self.cache, self.item, self.payloads[0])
            self.assertCode(code, self.collect)

    def test_dll_and_notice_payloads_are_compared_to_native_identity(self):
        for member, code in [("ucrt64/bin/fixture0.dll", "PREBUILT_DLL_CHANGED"),
                             ("ucrt64/share/licenses/fixture0/LICENSE", "PREBUILT_NOTICE_CHANGED")]:
            with self.subTest(member=member):
                original = self.payloads[0][member]
                self.payloads[0][member] = b"different bytes"
                pin_package(self.cache, self.item, self.payloads[0])
                self.assertCode(code, self.collect)
                self.payloads[0][member] = original

    def test_failure_clears_previous_success_and_retains_completed_packages(self):
        result = self.collect()
        last = self.manifest["packages"][-1]["archive"]
        (self.cache / last["sha256"]).write_bytes(b"corrupt")
        with self.assertRaises(ReviewError):
            self.collect(result=result)
        self.assertEqual(result["status"], "FAIL")
        self.assertFalse(result["observationsComplete"])
        self.assertEqual(len(result["files"]), 3)

    def test_cli_rejects_incomplete_malformed_native_and_replaces_old_success(self):
        report, native = self.root / "report.json", self.root / "native.json"
        for value in [[], {**self.native, "stage": "native-version"}, {**self.native, "nativeVersionVerified": False}]:
            with self.subTest(value=value):
                native.write_text(json.dumps(value), encoding="utf-8")
                report.write_text('{"status":"REVIEW-REQUIRED","observationsComplete":true}')
                with patch("sys.stdout", io.StringIO()):
                    code = materials.main(["--cache", str(self.cache), "--report", str(report), "--native-report", str(native), "--offline"])
                result = json.loads(report.read_bytes())
                self.assertEqual(code, 1)
                self.assertEqual(result["error"], "PREBUILT_NATIVE_INCOMPLETE")
                self.assertEqual(result["status"], "FAIL")
                self.assertFalse(result["observationsComplete"])

    def test_cli_complete_native_sha_is_bound_and_errors_are_sanitized(self):
        report, native = self.root / "report.json", self.root / "native.json"
        native.write_text(json.dumps(self.native), encoding="utf-8")
        real_collect = materials.collect_materials
        with patch.object(materials, "collect_materials", side_effect=lambda *a, **kw: real_collect(*a, **kw, assets=self.assets)), patch("sys.stdout", io.StringIO()):
            self.assertEqual(materials.main(["--cache", str(self.cache), "--report", str(report), "--native-report", str(native), "--offline"]), 0)
        result = json.loads(report.read_bytes())
        self.assertEqual(result["providerBinding"], "supplied-complete-native-report")
        self.assertEqual(result["suppliedNativeReportSha256"], materials.digest(native.read_bytes()))
        with patch.object(materials, "collect_materials", side_effect=OSError("private fixture")), patch("sys.stdout", io.StringIO()):
            self.assertEqual(materials.main(["--cache", str(self.cache), "--report", str(report)]), 1)
        self.assertNotIn("private fixture", report.read_text())


if __name__ == "__main__":
    unittest.main()
