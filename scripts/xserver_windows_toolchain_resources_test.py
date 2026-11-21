"""自写字节夹具验证固定来源门禁与最终 PE 绑定；不执行任何编译/链接。"""

from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest

from xserver_source_review import ASSETS, ReviewError, digest
from xserver_windows_licenses import source_license_evidence
from xserver_windows_resources import (
    _scan_private_resource_objects, _scan_xwin_link_objects, coff_sections, parse_pe_resources,
)
from xserver_windows_resources_test import make_coff, make_pe
from xserver_windows_toolchain_resources import (
    DEFAULT_MANIFEST_PACKAGE as PACKAGE, DEFAULT_MANIFEST_PATH as OBJECT,
    default_manifest_evidence, default_manifest_in_image, matches_default_manifest,
)


class DefaultManifestTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.builds, self.prefix, self.toolchain = [self.root / x for x in ("build", "prefix", "ucrt64")]
        self.assets = self.root / "assets"
        self.assets.mkdir()
        self.payload = b'<assembly manifestVersion="1.0">authored-fixture</assembly>'
        self.raw = make_coff(payload=self.payload)
        self.object = self.toolchain / OBJECT
        self.object.parent.mkdir(parents=True)
        self.object.write_bytes(self.raw)
        manifest = json.loads((ASSETS / "toolchain-license-sources.json").read_bytes())
        pin = manifest["packages"][PACKAGE]
        pin["installedFiles"][OBJECT] = {"size": len(self.raw), "sha256": digest(self.raw)}
        resource = pin["resourceEvidence"]
        resource["section"] = {key: coff_sections(self.raw)["sections"][0][key]
                               for key in ("name", "rawOffset", "rawSize", "rawSha256")}
        resource["payload"].update({"size": len(self.payload), "sha256": digest(self.payload)})
        resource["payloadSectionOffset"] = 0
        resource["sourceBinding"] = "Synthetic fixture, not upstream or native evidence."
        self.manifest_path = self.assets / "toolchain-license-sources.json"
        self.manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        notice = Path(pin["sourceRepositoryLicense"]["file"])
        (self.assets / notice).parent.mkdir(parents=True)
        (self.assets / notice).write_bytes((ASSETS / notice).read_bytes())
        self.package = {"package": PACKAGE, "version": pin["version"],
                        "declaredLicense": pin["packageDeclaredLicense"]}
        self.package["sourceLicenseEvidence"] = source_license_evidence(
            PACKAGE, self.package["version"], self.package["declaredLicense"], [self.object],
            toolchain_root=self.toolchain, assets=self.assets)
        self.packages = {PACKAGE: self.package}
        self.evidence = self.collect()
        self.item = self.evidence["input"]
        self.sections = coff_sections(self.raw)["resourceSections"]
        self.image_path = self.prefix / "bin/xkbcomp.exe"
        self.image_path.parent.mkdir(parents=True)
        self.target = {"name": "xkbcomp.exe", "staticLink": {"inputs": [self.item]},
                       "archiveMembers": {"members": []}}
        self.set_image([(24, 1, 0, self.payload)])

    def collect(self):
        return default_manifest_evidence(self.toolchain, self.packages, assets=self.assets)

    def set_image(self, resources):
        image = make_pe(resources)
        self.image_path.write_bytes(image)
        self.target.update({"imageSize": len(image), "imageSha256": digest(image)})

    def scan_private(self):
        return _scan_private_resource_objects(
            {"observationsComplete": True, "files": [self.target]}, self.builds, self.prefix,
            self.toolchain, default_manifest=self.evidence)

    def assert_code(self, code, function):
        with self.assertRaises(ReviewError) as caught:
            function()
        self.assertEqual(str(caught.exception), code)

    def test_fixed_object_requires_matching_package_and_source_evidence(self):
        self.assertEqual(self.evidence["payload"]["sha256"], digest(self.payload))
        self.assertFalse(self.evidence["distributionApproved"])
        self.assertFalse(self.evidence["sourceBinding"]["historicalCompilerReproduced"])
        for key in ("version", "declaredLicense"):
            with self.subTest(key=key):
                old = self.package[key]
                self.package[key] = "wrong"
                self.assert_code("TOOLCHAIN_SOURCE_LICENSE_SCOPE", self.collect)
                self.package[key] = old
        self.package["sourceLicenseEvidence"] = {}
        self.assert_code("RESOURCE_DEFAULT_SOURCE", self.collect)
        self.packages.clear()
        self.assert_code("RESOURCE_DEFAULT_PACKAGE", self.collect)

    def test_changed_object_is_not_accepted_even_with_same_filename(self):
        self.object.write_bytes(self.raw[:-1] + b"!")
        with self.assertRaises(ReviewError):
            self.collect()
        self.assert_code("RESOURCE_OBJECT_CHANGED", self.scan_private)

    def test_wrong_payload_or_section_pin_fails(self):
        original = json.loads(self.manifest_path.read_bytes())
        for field, code in (("section", "RESOURCE_DEFAULT_SECTION"), ("payload", "RESOURCE_DEFAULT_PAYLOAD")):
            with self.subTest(field=field):
                manifest = deepcopy(original)
                pin = manifest["packages"][PACKAGE]["resourceEvidence"][field]
                pin["rawSha256" if field == "section" else "sha256"] = "0" * 64
                self.manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
                self.package["sourceLicenseEvidence"]["manifestSha256"] = digest(self.manifest_path.read_bytes())
                self.assert_code(code, self.collect)

    def test_object_origin_owner_identity_and_sections_are_all_required(self):
        self.assertTrue(matches_default_manifest(self.item, self.sections, self.evidence))
        for key, value in (("origin", "private-prefix"), ("package", "other"),
                           ("path", "lib/other.o"), ("size", 1), ("sha256", "0" * 64)):
            with self.subTest(key=key):
                self.assertFalse(matches_default_manifest({**self.item, key: value}, self.sections, self.evidence))
        self.assertFalse(matches_default_manifest(self.item, self.sections * 2, self.evidence))
        self.assertFalse(matches_default_manifest(self.item, [{**self.sections[0], "rawSize": 1}], self.evidence))

    def test_private_scan_binds_default_input_to_installed_pe_payload(self):
        result = self.scan_private()
        self.assertEqual(result["resourceObjectCount"], 1)
        final = result["resourceObjects"][0]["linkedImage"]
        self.assertEqual(final["sha256"], digest(self.image_path.read_bytes()))
        self.assertTrue(final["defaultPayloadReachable"])
        self.assertFalse(final["finalSectionContributionInferred"])
        self.assertEqual(final["payload"]["sha256"], digest(self.payload))

    def test_private_scan_rejects_changed_pe_and_payload_or_extra_resource(self):
        image = bytearray(self.image_path.read_bytes())
        image[-1] ^= 1
        self.image_path.write_bytes(image)
        self.assert_code("RESOURCE_PRIVATE_IMAGE_CHANGED", self.scan_private)
        for resources in ([(24, 1, 0, b"wrong")], [(24, 2, 0, self.payload)],
                          [(24, 1, 1033, self.payload)],
                          [(24, 1, 0, self.payload), (10, 2, 0, b"extra")]):
            with self.subTest(resources=resources):
                self.set_image(resources)
                self.assert_code("RESOURCE_DEFAULT_FINAL_PAYLOAD", self.scan_private)

    def test_private_scan_does_not_whitelist_other_targets_or_duplicate_inputs(self):
        self.target["name"] = "library.dll"
        self.assert_code("RESOURCE_PRIVATE_DIRECT_RESOURCE_OBJECT", self.scan_private)
        self.target["name"] = "xkbcomp.exe"
        self.target["staticLink"]["inputs"] = [self.item, self.item]
        self.assert_code("RESOURCE_PRIVATE_DEFAULT_MISSING", self.scan_private)
        self.target["staticLink"]["inputs"] = []
        self.assert_code("RESOURCE_PRIVATE_DEFAULT_MISSING", self.scan_private)
        self.target["archiveMembers"]["members"] = [{
            "archiveOrigin": "target-toolchain", "archive": OBJECT, "archiveSha256": digest(self.raw),
            "fileOffset": 0, "size": len(self.raw), "sha256": digest(self.raw)}]
        self.assert_code("RESOURCE_PRIVATE_ARCHIVE_RESOURCE_OBJECT", self.scan_private)

    def test_xwin_scan_requires_both_inputs_and_rejects_untraced_resources(self):
        obj = self.builds / "xorg-server/hw/xwin/XWin.o"
        obj.parent.mkdir(parents=True)
        raw = make_coff(payload=b"authored XWin resource")
        obj.write_bytes(raw)
        own = {"origin": "server-build", "path": "xorg-server/hw/xwin/XWin.o",
               "size": len(raw), "sha256": digest(raw)}
        inputs = [own, self.item]

        def scan():
            return _scan_xwin_link_objects(self.builds, self.prefix, self.toolchain,
                                          {"inputs": inputs}, {"members": []}, obj, self.evidence)

        self.assertEqual(scan()["resourceObjectCount"], 2)
        inputs.pop()
        self.assert_code("RESOURCE_XWIN_OBJECT_MISSING", scan)
        inputs.append({**self.item, "package": "wrong"})
        self.assert_code("RESOURCE_XWIN_UNEXPECTED_RESOURCE_OBJECT", scan)

    def test_xwin_final_tree_must_not_contain_default_payload(self):
        resources = parse_pe_resources(make_pe([(24, 1, 1033, b"own manifest")]))["resources"]
        self.assertFalse(default_manifest_in_image(resources, "xwin.exe", self.evidence)["defaultPayloadReachable"])
        resources = parse_pe_resources(self.image_path.read_bytes())["resources"]
        self.assert_code("RESOURCE_DEFAULT_XWIN_PAYLOAD",
                         lambda: default_manifest_in_image(resources, "xwin.exe", self.evidence))


if __name__ == "__main__":
    unittest.main()
