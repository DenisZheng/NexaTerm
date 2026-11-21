import copy
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
from urllib.request import Request

import xserver_windows_prebuilt_inputs as inputs
import xserver_windows_upstream as upstream
from xserver_source_review import ReviewError, digest
from xserver_windows_prebuilt_fixtures import make_fixture, pin_package, pin_recipe, save_manifest


class UpstreamArchiveTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.cache, self.assets, self.manifest, _, self.payloads = make_fixture(self.root)
        urls = iter(sorted(upstream.ARCHIVE_URLS))
        for index, item in enumerate(self.manifest["packages"]):
            raw = ("self-written source fixture " + str(index)).encode()
            if index == 2:
                source = {"kind": "git", "commit": "b" * 40,
                          "url": "git+https://git.code.sf.net/p/mingw-w64/mingw-w64#commit=" + "b" * 40,
                          "declaredMakepkgArchiveSha256": digest(raw)}
                extra = source["commit"] + " " + source["declaredMakepkgArchiveSha256"]
            else:
                source = {"upstreamArchiveUrl": next(urls), "upstreamArchiveSize": len(raw),
                          "declaredArchiveSha256": digest(raw), "detachedSignatureDeclared": index != 1}
                (self.cache / digest(raw)).write_bytes(raw)
                extra = source["declaredArchiveSha256"]
            item["sourceReferences"] = source
            self.add_recipe_reference(index, extra)
        self.archive_items = [p for p in self.manifest["packages"] if "upstreamArchiveUrl" in p["sourceReferences"]]
        save_manifest(self.assets, self.manifest)

    def add_recipe_reference(self, index, extra):
        item = self.manifest["packages"][index]
        old = item["recipe"]["files"][0]
        raw = (self.cache / old["sha256"]).read_bytes() + ("# fixed source " + extra + "\n").encode()
        new = pin_recipe(self.cache, raw, item["recipe"]["directory"], "PKGBUILD")
        item["recipe"]["files"][0] = new
        self.payloads[index][".BUILDINFO"] = self.payloads[index][".BUILDINFO"].replace(old["sha256"].encode(), new["sha256"].encode())
        pin_package(self.cache, item, self.payloads[index])

    def collect(self, result=None, offline=True):
        save_manifest(self.assets, self.manifest)
        return upstream.collect_sources(self.cache, assets=self.assets, offline=offline, result=result)

    def assertCode(self, code, operation):
        with self.assertRaises(ReviewError) as caught:
            operation()
        self.assertEqual(str(caught.exception), code)

    def test_real_package_verification_and_three_archive_byte_checks_leave_vcs_and_approval_pending(self):
        before = {p: p.read_bytes() for p in self.root.rglob("*") if p.is_file()}
        result = self.collect()
        self.assertEqual(result["status"], "REVIEW-REQUIRED")
        self.assertTrue(result["observationsComplete"])
        self.assertTrue(result["sourceArchiveBytesVerified"])
        self.assertEqual(len(result["archives"]), 3)
        self.assertEqual(result["providerBinding"], "fixed-baseline-reference")
        self.assertEqual(len(result["pendingVcs"]), 1)
        self.assertFalse(result["pendingVcs"][0]["makepkgArchiveChecksumIndependentlyReproduced"])
        for key in ("distributionApproved", "bundled", "desktopVerified", "upstreamSourceMaterialsComplete",
                    "packageSignaturesVerified", "upstreamSignaturesVerified", "prebuiltDllInternalsIncluded",
                    "perFileLicenseReviewComplete", "sourceDistributionApproved"):
            self.assertIs(result[key], False)
        self.assertTrue(all(not a["signatureVerified"] and not a["inventoryReviewed"] for a in result["archives"]))
        self.assertEqual({p: p.read_bytes() for p in self.root.rglob("*") if p.is_file()}, before)
        self.assertEqual(self.collect(), result)

    def test_changed_package_is_rejected_before_any_source_download(self):
        package = self.manifest["packages"][0]["archive"]
        (self.cache / package["sha256"]).write_bytes(b"corrupt")
        with patch.object(upstream, "cached_material") as fetch:
            self.assertCode("INPUT_SIZE", self.collect)
            fetch.assert_not_called()

    def test_source_hash_must_be_present_in_the_verified_recipe(self):
        self.archive_items[0]["sourceReferences"]["declaredArchiveSha256"] = "0" * 64
        self.assertCode("UPSTREAM_RECIPE_CHECKSUM", self.collect)

    def test_vcs_commit_and_export_checksum_are_bound_but_not_claimed_reproduced(self):
        source = self.manifest["packages"][2]["sourceReferences"]
        original = copy.deepcopy(source)
        for change, code in [(lambda: source.update(commit="c" * 40, url=original["url"].replace("b" * 40, "c" * 40)), "UPSTREAM_RECIPE_CHECKSUM"),
                             (lambda: source.update(declaredMakepkgArchiveSha256="0" * 64), "UPSTREAM_RECIPE_CHECKSUM"),
                             (lambda: source.update(url="git+https://evil.invalid/repository"), "UPSTREAM_VCS_REFERENCE")]:
            with self.subTest(code=code):
                source.clear()
                source.update(original)
                change()
                self.assertCode(code, self.collect)

    def test_archive_set_cannot_silently_drop_or_duplicate_a_required_input(self):
        self.archive_items[1]["sourceReferences"] = copy.deepcopy(self.archive_items[0]["sourceReferences"])
        self.add_recipe_reference(1, self.archive_items[0]["sourceReferences"]["declaredArchiveSha256"])
        with patch.object(upstream, "cached_material") as fetch:
            self.assertCode("UPSTREAM_SOURCE_SET", self.collect)
            fetch.assert_not_called()

    def test_corrupt_source_cache_is_preserved_and_current_failure_keeps_completed_subset(self):
        result = self.collect()
        source = self.archive_items[-1]["sourceReferences"]
        path = self.cache / source["declaredArchiveSha256"]
        path.write_bytes(b"x" * source["upstreamArchiveSize"])
        with patch.object(inputs, "build_opener") as network:
            self.assertCode("INPUT_SHA256", lambda: self.collect(result=result, offline=False))
            network.assert_not_called()
        self.assertEqual(result["status"], "FAIL")
        self.assertFalse(result["observationsComplete"])
        self.assertFalse(result["sourceArchiveBytesVerified"])
        self.assertEqual(len(result["archives"]), 2)
        self.assertEqual(result["currentPackage"], self.archive_items[-1]["package"])
        self.assertEqual(path.read_bytes(), b"x" * source["upstreamArchiveSize"])

    def test_size_missing_and_over_budget_sources_fail(self):
        source = self.archive_items[0]["sourceReferences"]
        original = source["upstreamArchiveSize"]
        source["upstreamArchiveSize"] += 1
        self.assertCode("INPUT_SIZE", self.collect)
        source["upstreamArchiveSize"] = upstream.MAX_ARCHIVE + 1
        self.assertCode("PREBUILT_PIN", self.collect)
        source["upstreamArchiveSize"] = True
        self.assertCode("PREBUILT_PIN", self.collect)
        source["upstreamArchiveSize"] = original
        (self.cache / source["declaredArchiveSha256"]).unlink()
        self.assertCode("PREBUILT_OFFLINE_MISSING", self.collect)

    def test_official_origins_and_github_cdn_are_restricted(self):
        valid_cdn = "https://release-assets.githubusercontent.com/github-production-release-asset/2359378/" + "a" * 36 + "?sig=temporary"
        for url in [*upstream.ARCHIVE_URLS, valid_cdn]:
            upstream.check_upstream_url(url)
        invalid = ["http://ftp.gnu.org/gnu/gcc/gcc-16.2.0/gcc-16.2.0.tar.xz",
                   valid_cdn.replace("2359378", "other"), valid_cdn.replace(".com/", ".com@evil.invalid/"),
                   valid_cdn + "#fragment", valid_cdn.replace("?sig=temporary", "?" + "x" * 8193),
                   "https://github.com/madler/zlib/releases/download/v1.3.2/zlib-1.3.2.tar.xz?query=1"]
        for url in invalid:
            with self.subTest(url=url[:80]):
                self.assertCode("UPSTREAM_URL", lambda: upstream.check_upstream_url(url))
                self.assertCode("UPSTREAM_URL", lambda: inputs.MaterialRedirect(upstream.check_upstream_url).redirect_request(
                    Request(next(iter(upstream.ARCHIVE_URLS))), None, 302, "redirect", {}, url))

    def test_large_source_budget_does_not_relax_existing_package_budget(self):
        pin = {"url": next(iter(upstream.ARCHIVE_URLS)), "size": 2, "sha256": digest(b"xx")}
        (self.cache / pin["sha256"]).write_bytes(b"xx")
        with patch.object(inputs, "MAX_INPUT", 1):
            self.assertCode("PREBUILT_PIN", lambda: inputs.cached_material(self.cache, pin, True))
            self.assertEqual(inputs.cached_material(self.cache, pin, True, url_check=upstream.check_upstream_url,
                                                  max_input=upstream.MAX_ARCHIVE).read_bytes(), b"xx")

    def test_custom_download_checks_final_url_and_total_deadline_without_publishing_bad_cache(self):
        pin = {"url": next(iter(upstream.ARCHIVE_URLS)), "size": 2, "sha256": digest(b"xx")}
        def fetch(final):
            response = io.BytesIO(b"xx")
            response.url = final
            with patch.object(inputs, "build_opener", return_value=Mock(open=Mock(return_value=response))):
                return inputs.cached_material(self.cache, pin, False, url_check=upstream.check_upstream_url,
                                              max_input=upstream.MAX_ARCHIVE, download_budget=600)
        self.assertCode("UPSTREAM_URL", lambda: fetch("https://evil.invalid/archive"))
        with patch.object(inputs.time, "monotonic", side_effect=[0, 601]):
            self.assertCode("PREBUILT_DOWNLOAD_TIMEOUT", lambda: fetch(pin["url"]))
        self.assertFalse((self.cache / pin["sha256"]).exists())
        self.assertEqual(fetch(pin["url"]).read_bytes(), b"xx")

    def invoke(self, report):
        real_collect = upstream.collect_sources
        with patch.object(upstream, "collect_sources", side_effect=lambda cache, **kwargs: real_collect(cache, assets=self.assets, **kwargs)), patch("sys.stdout", io.StringIO()):
            return upstream.main(["--cache", str(self.cache), "--report", str(report), "--offline"])

    def test_cli_replaces_stale_success_on_collection_failure_and_write_failure(self):
        report = self.root / "report.json"
        for write_failure in (False, True):
            report.write_text('{"status":"REVIEW-REQUIRED","sourceArchiveBytesVerified":true}')
            source = self.archive_items[0]["sourceReferences"]
            (self.cache / source["declaredArchiveSha256"]).write_bytes(b"bad")
            if write_failure:
                with patch.object(upstream, "write_report", side_effect=OSError("private path")):
                    self.assertEqual(self.invoke(report), 1)
                self.assertFalse(report.exists())
            else:
                self.assertEqual(self.invoke(report), 1)
                result = json.loads(report.read_bytes())
                self.assertEqual(result["status"], "FAIL")
                self.assertEqual(result["error"], "INPUT_SIZE")
                self.assertFalse(result["sourceArchiveBytesVerified"])

    def test_report_cannot_overwrite_cache_input(self):
        source = self.archive_items[0]["sourceReferences"]
        path = self.cache / source["declaredArchiveSha256"]
        before = path.read_bytes()
        self.assertEqual(self.invoke(path), 1)
        self.assertEqual(path.read_bytes(), before)

    def test_successful_cli_report_has_no_local_paths_or_source_payloads(self):
        report = self.root / "report.json"
        self.assertEqual(self.invoke(report), 0)
        raw = report.read_text()
        self.assertNotIn(str(self.root), raw)
        self.assertNotIn("self-written source fixture", raw)
        self.assertNotIn("sig=", raw)
        self.assertEqual(json.loads(raw)["status"], "REVIEW-REQUIRED")


if __name__ == "__main__":
    unittest.main()
