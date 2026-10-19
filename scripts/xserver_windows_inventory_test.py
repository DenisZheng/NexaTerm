from pathlib import Path
import subprocess
import tempfile
import unittest

from xserver_source_review import ReviewError
from xserver_windows_inventory import InventoryCollision, add_runtime_provenance, installed_delta, link_inputs, native_header_evidence, package_evidence, snapshot


class InventoryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.prefix = self.root / "prefix"
        self.prefix.mkdir()

    def assertCode(self, code, operation, *args):
        with self.assertRaises(ReviewError) as caught:
            operation(*args)
        self.assertEqual(str(caught.exception), code)

    def test_installed_files_are_bound_to_the_component_that_added_them(self):
        before = snapshot(self.prefix)
        (self.prefix / "library.dll").write_bytes(b"first")
        owners = {}
        result = installed_delta(self.prefix, before, "component", owners)
        self.assertEqual(owners, {"library.dll": "component"})
        self.assertEqual(result["library.dll"]["size"], 5)

    def test_install_cannot_silently_replace_another_components_file(self):
        path = self.prefix / "library.dll"
        path.write_bytes(b"first")
        before = snapshot(self.prefix)
        path.write_bytes(b"changed")
        self.assertCode("INSTALL_COLLISION", installed_delta, self.prefix, before, "other", {"library.dll": "original"})

    def test_private_dll_needs_an_exact_source_owner(self):
        entry = {"origin": "private-prefix", "name": "library.dll"}
        self.assertCode("PE_SOURCE_OWNER", add_runtime_provenance, [entry], self.prefix, {}, self.root, None)
        packages = add_runtime_provenance([entry], self.prefix, {"bin/Library.dll": "source"}, self.root, None)
        self.assertEqual(entry["component"], "source")
        self.assertEqual(packages, {})

    def test_unknown_toolchain_package_or_license_is_rejected(self):
        self.assertCode("TOOLCHAIN_PACKAGE", package_evidence, "unreviewed-host-library", self.root, None)
        self.assertCode("TOOLCHAIN_LICENSE", package_evidence, "mingw-w64-ucrt-x86_64-example", self.root,
                        lambda *args, **kwargs: "Version : 1.0\nLicenses : None\n")

    def test_declared_license_without_installed_text_is_incomplete(self):
        self.assertCode("TOOLCHAIN_LICENSE", package_evidence, "mingw-w64-ucrt-x86_64-example", self.root,
                        lambda args, *more, **kwargs: "Version : 1.0\nLicenses : MIT\n" if "-Qi" in args else "")

    def test_link_map_must_describe_the_actual_server(self):
        path = self.root / "server.map"
        path.write_text("OUTPUT(other.exe pei-x86-64)\n")
        self.assertCode("LINK_MAP_TARGET", link_inputs, path, self.root, self.root / "build", self.prefix, {}, self.root, None, {})

    def test_missing_and_unowned_link_inputs_are_rejected(self):
        path = self.root / "server.map"
        path.write_text("LOAD missing.a\nOUTPUT(XWin.exe pei-x86-64)\n")
        self.assertCode("LINK_INPUT_MISSING", link_inputs, path, self.root, self.root / "build", self.prefix, {}, self.root, None, {})
        library = self.prefix / "library.a"
        library.write_bytes(b"fixture")
        path.write_text(f"LOAD {library}\nOUTPUT(XWin.exe pei-x86-64)\n")
        self.assertCode("LINK_SOURCE_OWNER", link_inputs, path, self.root, self.root / "build", self.prefix, {}, self.root, None, {})

    def test_link_failure_preserves_completed_inputs_and_current_file(self):
        library = self.prefix / "library.a"
        library.write_bytes(b"fixture")
        missing = self.prefix / "missing.a"
        mapping = self.root / "server.map"
        mapping.write_text(f"LOAD {library}\nLOAD {missing}\nOUTPUT(XWin.exe pei-x86-64)\n")
        report = {}
        self.assertCode("LINK_INPUT_MISSING", link_inputs, mapping, self.root, self.root / "build",
                        self.prefix, {"library.a": "source"}, self.root, None, {}, report)
        self.assertFalse(report["staticLink"]["observationsComplete"])
        self.assertEqual(report["staticLink"]["inputs"][0]["component"], "source")
        self.assertEqual(report["staticLinkCurrentInput"], str(missing))

    def header_fixture(self):
        build = self.root / "build"
        deps = build / "hw/xwin/.deps"
        deps.mkdir(parents=True)
        (deps / "winmsg.Po").write_text("winmsg.o: /source/hw/xwin/winmsg.c /source/win.h\n")
        (deps / "winshadgdi.Po").write_text("winshadgdi.o: /source/hw/xwin/winshadgdi.c /source/win.h\n")
        for unit in ["xkb", "xkbUtils"]:
            (deps / (unit + ".Plo")).write_text(unit + ".o: /source/xkb/" + unit + ".c /source/xkb/xkbgeom.h /source/include/xkbstr.h\n")
        (deps / "appid.Po").write_text("appid.o: /source/hw/xwin/winSetAppUserModelID.c /source/propertystore.h\n")
        return build, deps

    def test_observed_gdi_compilation_excludes_debug_table_and_directdraw(self):
        build, deps = self.header_fixture()
        result = native_header_evidence(build)
        self.assertFalse(result["debugMessageTableIncluded"])
        self.assertFalse(result["directDrawHeaderIncluded"])
        self.assertEqual(result["renderer"], "gdi")
        self.assertEqual(result["dependencyFiles"], 5)
        self.assertEqual(result["serverGeometryHeaders"], ["xkb/xkbgeom.h", "include/xkbstr.h"])

    def test_debug_table_or_directdraw_input_cannot_pass(self):
        build, deps = self.header_fixture()
        (deps / "winmsg.Po").write_text("winmsg.o: /source/winmsg.c /source/winmessages.h\n")
        self.assertCode("NATIVE_DEBUG_HEADER", native_header_evidence, build)
        (deps / "winmsg.Po").write_text("winmsg.o: /source/winmsg.c\n")
        for header in ["/source/ddraw.h", "D:/sdk/include/ddraw.h", "/source/winshadddnl.c"]:
            (deps / "winshadgdi.Po").write_text("winshadgdi.o: /source/winshadgdi.c " + header + "\n")
            self.assertCode("NATIVE_DIRECTDRAW_INPUT", native_header_evidence, build)

    def test_missing_gdi_observation_and_directdraw_link_input_fail(self):
        build, deps = self.header_fixture()
        (deps / "winshadgdi.Po").unlink()
        self.assertCode("NATIVE_GDI_DEPENDENCIES", native_header_evidence, build)
        library = self.prefix / "libdxguid.a"
        library.write_bytes(b"fixture")
        mapping = self.root / "server.map"
        mapping.write_text(f"LOAD {library}\nOUTPUT(XWin.exe pei-x86-64)\n")
        self.assertCode("LINK_DIRECTDRAW_INPUT", link_inputs, mapping, self.root, build, self.prefix, {}, self.root, None, {})

    def test_server_header_context_is_not_inferred_from_public_client_header(self):
        build, deps = self.header_fixture()
        (deps / "xkb.Plo").write_text("xkb.o: /source/xkb/xkb.c /prefix/include/X11/extensions/XKBgeom.h\n")
        self.assertCode("NATIVE_SERVER_HEADER_CONTEXT", native_header_evidence, build)

    def test_unused_legacy_copy_cannot_replace_actual_server_headers(self):
        build, deps = self.header_fixture()
        (deps / "xkb.Plo").write_text("xkb.o: /source/xkb/xkb.c /build/xorg-server-headers/X11/extensions/XKBgeom.h\n")
        self.assertCode("NATIVE_SERVER_HEADER_CONTEXT", native_header_evidence, build)

    def test_geometry_and_structure_headers_are_required_in_each_core_unit(self):
        build, deps = self.header_fixture()
        (deps / "xkbUtils.Plo").write_text("xkbUtils.o: /source/xkb/xkbUtils.c /source/xkb/xkbgeom.h\n")
        self.assertCode("NATIVE_SERVER_HEADER_CONTEXT", native_header_evidence, build)
        (deps / "xkbUtils.Plo").unlink()
        self.assertCode("NATIVE_SERVER_HEADER_CONTEXT", native_header_evidence, build)

    def test_real_gcc_observes_the_in_tree_geometry_include_chain(self):
        build, deps = self.header_fixture()
        source = self.root / "source"
        (source / "xkb").mkdir(parents=True)
        (source / "include").mkdir()
        (source / "include/xkbstr.h").write_text("struct keyboard { int keys; };\n")
        (source / "xkb/xkbgeom.h").write_text('#include "xkbstr.h"\n')
        for unit in ["xkb", "xkbUtils"]:
            path = source / "xkb" / (unit + ".c")
            path.write_text('#include "xkbgeom.h"\nstruct keyboard keyboard;\n')
            result = subprocess.run(["gcc", "-MD", "-MP", "-MF", str(deps / (unit + ".Plo")),
                                     "-I", str(source / "include"), "-c", str(path), "-o", str(build / (unit + ".o"))],
                                    text=True, capture_output=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(native_header_evidence(build)["serverGeometryHeaderDependencies"]), 2)

    def test_appid_property_table_cannot_hide_in_transitive_compiler_dependencies(self):
        build, deps = self.header_fixture()
        (deps / "appid.Po").write_text("appid.o: /source/winSetAppUserModelID.c D:/sdk/propkey.h\n")
        self.assertCode("NATIVE_PROPERTY_TABLE", native_header_evidence, build)
        (deps / "appid.Po").unlink()
        self.assertCode("NATIVE_APPID_DEPENDENCIES", native_header_evidence, build)

    def test_collision_reports_both_hashes_without_waiving_failure(self):
        path = self.prefix / "shared.h"
        path.write_bytes(b"first")
        before = snapshot(self.prefix)
        path.write_bytes(b"changed")
        with self.assertRaises(InventoryCollision) as caught:
            installed_delta(self.prefix, before, "second", {"shared.h": "first"})
        self.assertEqual(caught.exception.details["previousOwner"], "first")
        self.assertEqual(caught.exception.details["path"], "shared.h")
        self.assertNotEqual(caught.exception.details["previous"]["sha256"], caught.exception.details["installed"]["sha256"])


if __name__ == "__main__":
    unittest.main()
