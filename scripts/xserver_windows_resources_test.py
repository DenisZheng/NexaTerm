import struct
import tempfile
import unittest
from pathlib import Path

from xserver_source_review import ReviewError, digest
from xserver_windows_compilation import dependency_path
from xserver_windows_resources import (
    _scan_private_resource_objects, _scan_xwin_link_objects, coff_sections,
    parse_makefile_resource_rule, parse_pe_resources, parse_resource_references,
    parse_windres_command, resource_make_dry_run_arguments, verify_xwin_resource_payloads,
)


def make_coff(section_name=b".rsrc", payload=b"resource-bytes"):
    data = bytearray(60 + len(payload))
    struct.pack_into("<HHIIIHH", data, 0, 0x8664, 1, 0, 0, 0, 0, 0)
    data[20:28] = section_name.ljust(8, b"\0")
    struct.pack_into("<IIII", data, 28, 0, 0, len(payload), 60)
    struct.pack_into("<I", data, 56, 0x40000040)
    data[60:] = payload
    return bytes(data)


def make_ico():
    images = [(16, 16, b"icon-image-one"), (32, 32, b"icon-image-two")]
    offset = 6 + 16 * len(images)
    entries = []
    for width, height, payload in images:
        entries.append(struct.pack("<BBBBHHII", width, height, 0, 0, 1, 32, len(payload), offset))
        offset += len(payload)
    return struct.pack("<HHH", 0, 1, len(images)) + b"".join(entries) + b"".join(x[2] for x in images), images


def make_group_icon(images, ids):
    return struct.pack("<HHH", 0, 1, len(images)) + b"".join(
        struct.pack("<BBBBHHIH", w, h, 0, 0, 1, 32, len(payload), icon_id)
        for (w, h, payload), icon_id in zip(images, ids))


def make_pe(resources):
    section = bytearray(0x600)
    grouped = {}
    for kind, name, lang, payload in resources:
        grouped.setdefault(kind, {}).setdefault(name, []).append((lang, payload))
    cursor = 16 + 8 * len(grouped)
    type_offsets, name_offsets, data_offsets = {}, {}, {}
    for kind in sorted(grouped):
        type_offsets[kind] = cursor
        cursor += 16 + 8 * len(grouped[kind])
    for kind in sorted(grouped):
        for name in sorted(grouped[kind]):
            name_offsets[kind, name] = cursor
            cursor += 16 + 8 * len(grouped[kind][name])
    for kind in sorted(grouped):
        for name in sorted(grouped[kind]):
            for lang, _ in sorted(grouped[kind][name]):
                data_offsets[kind, name, lang] = cursor
                cursor += 16
    payload_offset = (cursor + 3) & ~3
    struct.pack_into("<IIHHHH", section, 0, 0, 0, 0, 0, 0, len(grouped))
    for ti, kind in enumerate(sorted(grouped)):
        struct.pack_into("<II", section, 16 + ti * 8, kind, 0x80000000 | type_offsets[kind])
        to = type_offsets[kind]
        names = sorted(grouped[kind])
        struct.pack_into("<IIHHHH", section, to, 0, 0, 0, 0, 0, len(names))
        for ni, name in enumerate(names):
            no = name_offsets[kind, name]
            struct.pack_into("<II", section, to + 16 + ni * 8, name, 0x80000000 | no)
            langs = sorted(grouped[kind][name])
            struct.pack_into("<IIHHHH", section, no, 0, 0, 0, 0, 0, len(langs))
            for li, (lang, payload) in enumerate(langs):
                de = data_offsets[kind, name, lang]
                struct.pack_into("<II", section, no + 16 + li * 8, lang, de)
                end = payload_offset + len(payload)
                if end > len(section):
                    raise AssertionError("resource fixture overflow")
                struct.pack_into("<IIII", section, de, 0x1000 + payload_offset, len(payload), 0, 0)
                section[payload_offset:end] = payload
                payload_offset = (end + 3) & ~3
    image = bytearray(0x800)
    image[:2] = b"MZ"
    struct.pack_into("<I", image, 60, 0x80)
    image[0x80:0x84] = b"PE\0\0"
    struct.pack_into("<HHIIIHH", image, 0x84, 0x8664, 1, 0, 0, 0, 240, 0x22)
    optional = 0x98
    struct.pack_into("<H", image, optional, 0x20B)
    struct.pack_into("<Q", image, optional + 24, 0x140000000)
    struct.pack_into("<I", image, optional + 60, 0x200)
    struct.pack_into("<I", image, optional + 108, 16)
    struct.pack_into("<II", image, optional + 128, 0x1000, 0x600)
    sh = optional + 240
    image[sh:sh + 8] = b".rsrc\0\0\0"
    struct.pack_into("<IIII", image, sh + 8, 0x600, 0x1000, 0x600, 0x200)
    struct.pack_into("<I", image, sh + 36, 0x40000040)
    image[0x200:] = section
    return bytes(image)


class ResourceEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.ico, self.images = make_ico()
        self.manifest = b'<?xml version="1.0"?><assembly manifestVersion="1.0"/>'
        self.rc = b'IDI_XWIN ICON "X.ico"\nCREATEPROCESS_MANIFEST_RESOURCE_ID RT_MANIFEST "XWin.exe.manifest"\n'
        self.header = b"#define IDI_XWIN 101\n"
        self.resources = [
            (14, 101, 1033, make_group_icon(self.images, [10, 11])),
            (24, 1, 1033, self.manifest),
            (3, 10, 1033, self.images[0][2]),
            (3, 11, 1033, self.images[1][2]),
        ]

    def assert_code(self, code, fn):
        with self.assertRaises(ReviewError) as caught:
            fn()
        self.assertEqual(str(caught.exception), code)

    def test_coff_resource_section_is_observed(self):
        result = coff_sections(make_coff())
        self.assertEqual(result["machine"], "amd64")
        self.assertEqual([x["name"] for x in result["resourceSections"]], [".rsrc"])

    def test_coff_rejects_wrong_architecture_and_bad_raw_range(self):
        bad = bytearray(make_coff())
        struct.pack_into("<H", bad, 0, 0x14C)
        self.assert_code("RESOURCE_COFF_ARCH", lambda: coff_sections(bad))
        bad = bytearray(make_coff())
        struct.pack_into("<I", bad, 40, 0xFFFFFFF0)
        self.assert_code("RESOURCE_COFF_RANGE", lambda: coff_sections(bad))

    def test_makefile_rule_and_resource_prerequisites(self):
        content = """WINDRES = windres
.rc.o:
\t$(AM_V_GEN)$(WINDRES) --use-temp-file -i $< --input-format=rc -o $@ -O coff -I $(top_builddir)/include
XWin.o: XWin.rc XWin.exe.manifest X.ico
"""
        result = parse_makefile_resource_rule(content)
        self.assertEqual(result["windres"], "windres")
        self.assertEqual(set(result["prerequisites"]), {"XWin.rc", "XWin.exe.manifest", "X.ico"})

    def test_resource_dry_run_never_forces_automake_refresh(self):
        rule = {"prerequisites": ["X.ico", "XWin.exe.manifest", "XWin.rc"]}
        arguments = resource_make_dry_run_arguments(rule)
        self.assertEqual(arguments[:5], ["make", "-n", "V=1", "-o", "Makefile"][:5])
        self.assertNotIn("-B", arguments)
        self.assertEqual(arguments[-1], "XWin.o")
        forced = [arguments[index + 1] for index, value in enumerate(arguments[:-1]) if value == "-W"]
        self.assertEqual(forced, ["X.ico", "XWin.exe.manifest", "XWin.rc"])

    def test_resource_dry_run_rejects_missing_prerequisite(self):
        self.assert_code("RESOURCE_TARGET_PREREQUISITES", lambda: resource_make_dry_run_arguments(
            {"prerequisites": ["XWin.rc", "X.ico"]}))

    def test_source_makefile_placeholder_is_allowed(self):
        content = """WINDRES = @WINDRES@
.rc.o:
\t$(WINDRES) --use-temp-file -i $< --input-format=rc -o $@ -O coff -I $(top_builddir)/include
XWin.o: $(srcdir)/XWin.rc $(srcdir)/XWin.exe.manifest $(srcdir)/X.ico
"""
        self.assertEqual(parse_makefile_resource_rule(content, True)["windres"], "@WINDRES@")

    def test_windres_command_is_bound_to_source_and_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source, build = root / "src/hw/xwin", root / "build/xorg-server/hw/xwin"
            source.mkdir(parents=True)
            build.mkdir(parents=True)
            (source / "XWin.rc").write_bytes(b'IDI_XWIN ICON "X.ico"\\n')
            cmd = f"windres --use-temp-file -i {source / 'XWin.rc'} --input-format=rc -o XWin.o -O coff -I {root / 'build/xorg-server/include'}"
            result = parse_windres_command(cmd, {"windres": "windres"}, build, source)
            self.assertEqual(result["input"], (source / "XWin.rc").resolve())
            self.assertEqual(result["output"], (build / "XWin.o").resolve())

    def test_windres_command_normalizes_windows_drive_absolute_paths(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source, build = root / "src/hw/xwin", root / "build/xorg-server/hw/xwin"
            source.mkdir(parents=True)
            build.mkdir(parents=True)
            (source / "XWin.rc").write_bytes(b'IDI_XWIN ICON "X.ico"\\n')
            native_root = "D:/xserver-native"
            windows_roots = [(native_root, root)]
            cmd = (
                "windres --use-temp-file "
                "-i D:/xserver-native/src/hw/xwin/XWin.rc "
                "--input-format=rc "
                "-o D:/xserver-native/build/xorg-server/hw/xwin/XWin.o "
                "-O coff -I D:/xserver-native/build/xorg-server/include"
            )
            result = parse_windres_command(
                cmd, {"windres": "windres"}, build, source, windows_roots
            )
            self.assertEqual(result["input"], (source / "XWin.rc").resolve())
            self.assertEqual(result["output"], (build / "XWin.o").resolve())
            self.assertEqual(
                [dependency_path(x, build, windows_roots) for x in result["includes"]],
                [(root / "build/xorg-server/include").resolve()],
            )

    def test_windres_vpath_prerequisite_resolves_to_source_tree(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source, build = root / "src/hw/xwin", root / "build/xorg-server/hw/xwin"
            source.mkdir(parents=True)
            build.mkdir(parents=True)
            (source / "XWin.rc").write_bytes(b"IDI_XWIN ICON \"X.ico\"\\n")
            cmd = (
                "windres --use-temp-file -i XWin.rc --input-format=rc "
                " -o XWin.o -O coff -I " + str(root / "build/xorg-server/include")
            )
            result = parse_windres_command(cmd, {"windres": "windres"}, build, source)
            self.assertEqual(result["input"], (source / "XWin.rc").resolve())
            self.assertEqual(result["output"], (build / "XWin.o").resolve())

    def test_windres_custom_preprocessor_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source, build = root / "src/hw/xwin", root / "build/xorg-server/hw/xwin"
            source.mkdir(parents=True)
            build.mkdir(parents=True)
            cmd = f"windres --use-temp-file --preprocessor=gcc -i {source / 'XWin.rc'} --input-format=rc -o XWin.o -O coff -I {root / 'build/xorg-server/include'}"
            self.assert_code("RESOURCE_PREPROCESSOR_OVERRIDE",
                             lambda: parse_windres_command(cmd, {"windres": "windres"}, build, source))

    def test_unknown_rc_file_reference_is_rejected(self):
        self.assert_code("RESOURCE_RC_REFERENCES",
                         lambda: parse_resource_references(self.rc + b'1 RCDATA "extra.bin"\n'))

    def test_missing_manifest_make_dependency_is_rejected(self):
        content = """WINDRES = windres
.rc.o:
\t$(WINDRES) --use-temp-file -i $< --input-format=rc -o $@ -O coff -I $(top_builddir)/include
XWin.o: XWin.rc X.ico
"""
        self.assert_code("RESOURCE_TARGET_PREREQUISITES", lambda: parse_makefile_resource_rule(content))

    def test_final_pe_manifest_and_icons_match_source(self):
        parsed = parse_pe_resources(make_pe(self.resources))
        result = verify_xwin_resource_payloads(parsed["resources"], self.rc, self.header, self.ico, self.manifest)
        self.assertEqual(result["manifest"]["match"], "exact")
        self.assertEqual(result["icon"]["count"], 2)
        self.assertEqual([x["resourceId"] for x in result["icon"]["resources"]], [10, 11])

    def test_final_pe_rejects_manifest_drift(self):
        changed = [(k, n, l, p + b"x" if k == 24 else p) for k, n, l, p in self.resources]
        parsed = parse_pe_resources(make_pe(changed))
        self.assert_code("RESOURCE_MANIFEST_BYTES", lambda: verify_xwin_resource_payloads(
            parsed["resources"], self.rc, self.header, self.ico, self.manifest))

    def test_final_pe_rejects_icon_drift(self):
        changed = [(k, n, l, p + b"x" if k == 3 and n == 10 else p) for k, n, l, p in self.resources]
        parsed = parse_pe_resources(make_pe(changed))
        self.assert_code("RESOURCE_ICON_BYTES", lambda: verify_xwin_resource_payloads(
            parsed["resources"], self.rc, self.header, self.ico, self.manifest))

    def test_final_pe_rejects_group_icon_id_drift(self):
        changed = [(k, n, l, make_group_icon(self.images, [10, 12]) if k == 14 else p)
                   for k, n, l, p in self.resources]
        parsed = parse_pe_resources(make_pe(changed))
        self.assert_code("RESOURCE_ICON_BYTES", lambda: verify_xwin_resource_payloads(
            parsed["resources"], self.rc, self.header, self.ico, self.manifest))

    def test_pe_resource_directory_rejects_bad_rva(self):
        image = bytearray(make_pe(self.resources))
        struct.pack_into("<II", image, 0x98 + 128, 0x7FFF0000, 0x600)
        self.assert_code("PE_RVA", lambda: parse_pe_resources(image))

    def test_xwin_scan_accepts_only_linked_resource_object(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            builds = root / "build"
            obj = builds / "xorg-server/hw/xwin/XWin.o"
            obj.parent.mkdir(parents=True)
            obj.write_bytes(make_coff())
            static = {"inputs": [
                {"origin": "server-build", "path": "xorg-server/hw/xwin/XWin.o",
                 "size": obj.stat().st_size, "sha256": digest(obj.read_bytes())},
                {"origin": "linker-generated-memory", "path": "XWin.exe_rtr000000.o"}]}
            result = _scan_xwin_link_objects(builds, root / "prefix", root / "ucrt64",
                                             static, {"members": []}, obj)
            self.assertEqual(result["resourceObjectCount"], 1)

    def test_xwin_scan_rejects_unexpected_resource_object(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            builds = root / "build"
            obj = builds / "xorg-server/hw/xwin/XWin.o"
            extra = builds / "xorg-server/hw/xwin/extra.o"
            obj.parent.mkdir(parents=True)
            obj.write_bytes(make_coff())
            extra.write_bytes(make_coff())
            static = {"inputs": [
                {"origin": "server-build", "path": "xorg-server/hw/xwin/XWin.o",
                 "size": obj.stat().st_size, "sha256": digest(obj.read_bytes())},
                {"origin": "server-build", "path": "xorg-server/hw/xwin/extra.o",
                 "size": extra.stat().st_size, "sha256": digest(extra.read_bytes())}]}
            self.assert_code("RESOURCE_XWIN_UNEXPECTED_RESOURCE_OBJECT", lambda: _scan_xwin_link_objects(
                builds, root / "prefix", root / "ucrt64", static, {"members": []}, obj))

    def test_private_pe_scan_rejects_resource_object(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            builds = root / "build"
            obj = builds / "libx/font.o"
            obj.parent.mkdir(parents=True)
            obj.write_bytes(make_coff())
            linkage = {"observationsComplete": True, "files": [{
                "name": "libx.dll",
                "staticLink": {"inputs": [{"origin": "component-build", "path": "libx/font.o",
                                            "size": obj.stat().st_size, "sha256": digest(obj.read_bytes())}]},
                "archiveMembers": {"members": []}}]}
            self.assert_code("RESOURCE_PRIVATE_DIRECT_RESOURCE_OBJECT", lambda: _scan_private_resource_objects(
                linkage, builds, root / "prefix", root / "ucrt64"))


if __name__ == "__main__":
    unittest.main()
