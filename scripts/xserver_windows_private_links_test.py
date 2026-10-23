from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from xserver_source_review import ReviewError, digest
from xserver_windows_linkmap import PRODUCER_PACKAGE, PRODUCER_RELEASE, PRODUCER_VERSION
from xserver_windows_private_links import private_linkage, reachable_targets


class PrivateLinkTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.builds, self.prefix, self.maps, self.toolchain = [self.root / name for name in ["build", "prefix", "maps", "toolchain"]]
        self.directory = self.builds / "fixture/src"
        for path in [self.directory / ".libs", self.prefix / "bin", self.maps, self.toolchain / "lib"]:
            path.mkdir(parents=True)
        self.package = "mingw-w64-ucrt-x86_64-own-format-fixture"
        self.packages = {self.package: {"package": self.package}}
        # 自行编写的格式夹具，仅解析真实GNU输出；不执行、不计Windows运行证据。
        for name, source in {"helper": ".text\n.globl helper\nhelper:\nret\n",
                             "caller": ".text\n.globl entry\nentry:\ncall helper\nret\n.data\naddress:\n.quad helper\n"}.items():
            (self.directory / (name + ".s")).write_text(source)
            self.command(["as", "--64", name + ".s", "-o", name + ".initial.o"])
            self.command(["objcopy", "-O", "pe-x86-64", name + ".initial.o", name + ".o"])
        self.archive = self.toolchain / "lib/fixture.a"
        self.command(["ar", "rcs", str(self.archive), "helper.o"])
        self.owners, self.items = {}, []
        for target in ["libFixture-1.dll", "Xkbcomp.exe"]:
            self.command(["ld", "-mi386pep", "--entry=entry", *(["--dll", "--export-all-symbols"] if target.endswith(".dll") else []),
                          "-Map=" + str(self.maps), "-o", ".libs/" + target, "caller.o", str(self.archive)])
            data = (self.directory / ".libs" / target).read_bytes()
            (self.prefix / "bin" / target).write_bytes(data)
            self.owners["bin/" + target] = "fixture"
            self.items.append({"name": target.casefold(), "origin": "private-prefix", "component": "fixture",
                               "sha256": digest(data), "size": len(data)})
        self.xwin = {"name": "xwin.exe", "origin": "private-prefix", "component": "xorg-server", "sha256": "0" * 64, "size": 1}
        self.external = {"name": "external.dll", "origin": "target-toolchain", "package": self.package, "sha256": "1" * 64, "size": 1}
        self.closures = [[self.xwin, self.items[0], self.external], [*self.items, self.external]]
        self.producer = {"package": PRODUCER_PACKAGE, "version": PRODUCER_VERSION, "binarySha256": PRODUCER_RELEASE["binarySha256"]}

    def command(self, arguments):
        result = subprocess.run(arguments, cwd=self.directory, capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout

    def observe(self, arguments, *args, **kwargs):
        if arguments[:2] == ["cygpath", "-u"]:
            return self.command(arguments)
        self.assertEqual(arguments[:2], ["pacman", "-Qqo"])
        self.assertEqual(Path(arguments[-1]), self.archive)
        return self.package

    def collect(self, report=None):
        return private_linkage(self.maps, self.builds, self.prefix, self.owners, self.closures, self.root,
                               self.observe, self.packages, self.producer,
                               report if report is not None else {}, build_systems={"fixture": "autotools"},
                               toolchain_root=self.toolchain)

    def assertCode(self, code, operation):
        with self.assertRaises(ReviewError) as caught:
            operation()
        self.assertEqual(str(caught.exception), code)

    def test_actual_dll_and_tool_maps_bind_images_inputs_and_selected_members(self):
        result = self.collect()
        self.assertTrue(result["observationsComplete"])
        self.assertEqual([x["name"] for x in result["files"]], ["libfixture-1.dll", "xkbcomp.exe"])
        for item in result["files"]:
            self.assertTrue(item["observationsComplete"])
            self.assertTrue(item["staticLink"]["observationsComplete"])
            self.assertEqual(item["archiveMembers"]["archiveCount"], 1)
            self.assertEqual(item["archiveMembers"]["members"][0]["member"], "helper.o")
            self.assertEqual(item["archiveMembers"]["members"][0]["package"], self.package)
            own = [x for x in item["staticLink"]["inputs"] if x["origin"] == "component-build"]
            self.assertEqual(len(own), 1)
            self.assertEqual(own[0]["component"], "fixture")
        self.assertEqual(result["prebuiltDllsExcluded"][0]["name"], "external.dll")
        self.assertFalse(result["prebuiltDllInternalsIncluded"])
        self.assertFalse(result["resourceCompilerInputsIncluded"])
        self.assertFalse(result["perFileLicenseReviewComplete"])

    def test_native_drive_archive_paths_keep_real_bytes_and_package_owner(self):
        native = "D:/authored-fixture/lib/fixture.a"
        for mapping in self.maps.glob("*.map"):
            content = mapping.read_text()
            original = re.search(r"^LOAD (.+fixture\.a)$", content, re.MULTILINE)[1]
            mapping.write_text(content.replace(original, native))

        def convert(arguments, **kwargs):
            self.assertEqual(arguments, ["cygpath", "-u", native])
            return subprocess.CompletedProcess(arguments, 0, str(self.archive) + "\n", "")

        with patch("subprocess.run", side_effect=convert) as conversion:
            result = self.collect()
        self.assertEqual(conversion.call_count, 4)
        self.assertTrue(result["observationsComplete"])
        for item in result["files"]:
            member = item["archiveMembers"]["members"][0]
            self.assertEqual(member["package"], self.package)
            self.assertEqual(member["archiveSha256"], digest(self.archive.read_bytes()))

    def test_installed_or_build_image_drift_is_rejected(self):
        for path in [self.prefix / "bin/Xkbcomp.exe", self.directory / ".libs/Xkbcomp.exe"]:
            original = path.read_bytes()
            path.write_bytes(original + b"changed")
            self.assertCode("PRIVATE_LINK_IMAGE_CHANGED", self.collect)
            path.write_bytes(original)

    def test_duplicate_provider_must_have_identical_image_and_owner(self):
        for change in [{"sha256": "f" * 64}, {"component": "another"}, {"size": 3}, {"origin": "target-toolchain"}]:
            self.assertCode("PRIVATE_LINK_CLOSURE_CHANGED",
                            lambda: reachable_targets([*self.closures, [{**self.items[0], **change}]]))

    def test_missing_map_preserves_prior_target_and_current_failure(self):
        (self.maps / "Xkbcomp.exe.map").unlink()
        report = {}
        self.assertCode("PRIVATE_LINK_MAP", lambda: self.collect(report))
        self.assertTrue(report["privatePeLinkage"]["files"][0]["observationsComplete"])
        self.assertFalse(report["privatePeLinkage"]["files"][1]["observationsComplete"])
        self.assertFalse(report["privatePeLinkage"]["observationsComplete"])
        self.assertEqual(report["privateLinkCurrent"], "xkbcomp.exe")

    def test_map_for_a_different_output_is_rejected(self):
        mapping = self.maps / "Xkbcomp.exe.map"
        mapping.write_text(mapping.read_text().replace("OUTPUT(.libs/Xkbcomp.exe ", "OUTPUT(.libs/unrelated.exe "))
        self.assertCode("PRIVATE_LINK_TARGET", self.collect)

    def test_absolute_libtool_output_retains_the_actual_link_working_directory(self):
        mapping = self.maps / "Xkbcomp.exe.map"
        absolute = (self.directory / ".libs/Xkbcomp.exe").as_posix()
        mapping.write_text(mapping.read_text().replace("OUTPUT(.libs/Xkbcomp.exe ", "OUTPUT(" + absolute + " "))
        result = self.collect()
        self.assertEqual(result["files"][1]["linkDirectory"], "fixture/src")

    def test_unowned_or_ambiguous_installed_file_is_rejected(self):
        self.owners["bin/Xkbcomp.exe"] = "other"
        self.assertCode("PRIVATE_LINK_OWNER", self.collect)

    def test_output_outside_component_or_duplicate_build_candidate_is_rejected(self):
        duplicate = self.builds / "fixture/other/.libs"
        duplicate.mkdir(parents=True)
        shutil.copyfile(self.directory / ".libs/Xkbcomp.exe", duplicate / "Xkbcomp.exe")
        self.assertCode("PRIVATE_LINK_OUTPUT", self.collect)
        (duplicate / "Xkbcomp.exe").unlink()
        mapping = self.maps / "Xkbcomp.exe.map"
        mapping.write_text(mapping.read_text().replace("OUTPUT(.libs/Xkbcomp.exe ", "OUTPUT(../../outside/Xkbcomp.exe "))
        self.assertCode("PRIVATE_LINK_OUTPUT", self.collect)

    def test_changed_selected_archive_or_missing_input_retains_failure(self):
        self.archive.unlink()
        self.assertCode("LINK_INPUT_MISSING", self.collect)

    def test_both_real_roots_are_required(self):
        self.assertCode("PRIVATE_LINK_ROOTS", lambda: reachable_targets([[self.items[0], self.xwin]]))

    def test_unknown_or_malformed_provider_cannot_be_excused(self):
        for changes in [{"origin": "system"}, {"name": "../fake.dll"}, {"name": "LIB.dll"}]:
            self.assertCode("PRIVATE_LINK_ORIGIN" if "origin" in changes else "PRIVATE_LINK_NAME",
                            lambda: reachable_targets([[{**self.items[0], **changes}]]))


if __name__ == "__main__":
    unittest.main()
