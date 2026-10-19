from pathlib import Path
import tempfile
import unittest

from xserver_source_review import ReviewError
from xserver_windows_inventory import InventoryCollision, add_runtime_provenance, installed_delta, link_inputs, native_header_evidence, package_evidence, prepare_server_headers, snapshot


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

    def header_fixture(self):
        build = self.root / "build"
        deps = build / "hw/xwin/.deps"
        deps.mkdir(parents=True)
        (deps / "winmsg.Po").write_text("winmsg.o: /source/hw/xwin/winmsg.c /source/win.h\n")
        (deps / "winshadgdi.Po").write_text("winshadgdi.o: /source/hw/xwin/winshadgdi.c /source/win.h\n")
        (deps / "geometry.Po").write_text("geometry.o: /build/xorg-server-headers/X11/extensions/XKBgeom.h\n")
        return build, deps

    def test_observed_gdi_compilation_excludes_debug_table_and_directdraw(self):
        build, deps = self.header_fixture()
        result = native_header_evidence(build)
        self.assertFalse(result["debugMessageTableIncluded"])
        self.assertFalse(result["directDrawHeaderIncluded"])
        self.assertEqual(result["renderer"], "gdi")
        self.assertEqual(result["dependencyFiles"], 3)

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
        (deps / "geometry.Po").write_text("geometry.o: /prefix/include/X11/extensions/XKBgeom.h\n")
        self.assertCode("NATIVE_SERVER_HEADER_CONTEXT", native_header_evidence, build)

    def test_server_header_copy_verifies_bytes_and_does_not_replace_client_install(self):
        source = self.root / "sources/protocol/include/XKBgeom.h"
        source.parent.mkdir(parents=True)
        source.write_bytes(b"server")
        client = self.prefix / "XKBgeom.h"
        client.write_bytes(b"client")
        manifest = {"components": [{"name": "protocol", "root": "protocol"}],
                    "serverHeaders": [{"component": "protocol", "source": "include/XKBgeom.h",
                                       "target": "X11/extensions/XKBgeom.h", "size": 6,
                                       "sha256": snapshot(source.parent)[source.name]["sha256"]}]}
        target = self.root / "server-headers"
        prepare_server_headers(self.root / "sources", target, manifest)
        self.assertEqual((target / "X11/extensions/XKBgeom.h").read_bytes(), b"server")
        self.assertEqual(client.read_bytes(), b"client")
        self.assertCode("SERVER_HEADER_EXISTS", prepare_server_headers, self.root / "sources", target, manifest)

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
