"""COFF 未初始化节和字符串表不能被误判为磁盘资源内容。"""

from pathlib import Path
import struct
import tempfile
import unittest

from xserver_source_review import ReviewError, digest
from xserver_windows_resources import _scan_private_resource_objects, coff_sections
from xserver_windows_resources_test import make_coff


def make_bss(*, name=b".bss", size=32, pointer=0, flags=0xc0500080):
    raw = bytearray(make_coff(name, b""))
    struct.pack_into("<II", raw, 36, size, pointer)
    struct.pack_into("<I", raw, 56, flags)
    return bytes(raw)


def make_long_section(name=b".rsrc$payload"):
    raw = bytearray(make_coff(b"/4"))
    struct.pack_into("<II", raw, 8, len(raw), 0)
    return bytes(raw) + struct.pack("<I", 5 + len(name)) + name + b"\0"


class CoffSectionTests(unittest.TestCase):
    def assert_code(self, code, raw):
        with self.assertRaises(ReviewError) as caught:
            coff_sections(raw)
        self.assertEqual(str(caught.exception), code)

    def test_uninitialized_extent_has_no_file_bytes_or_hash(self):
        for size in (0, 32):
            with self.subTest(size=size):
                result = coff_sections(make_bss(size=size))
                section = result["sections"][0]
                self.assertTrue(section["uninitialized"])
                self.assertEqual((section["rawSize"], section["rawOffset"], section["rawSha256"]),
                                 (size, 0, None))
                self.assertEqual(result["resourceSections"], [])

    def test_zero_pointer_is_not_a_general_range_exception(self):
        for flags in (0x40000040, 0x60000020, 0xc00000c0):
            with self.subTest(flags=flags):
                self.assert_code("RESOURCE_COFF_RANGE", make_bss(flags=flags))

    def test_uninitialized_section_cannot_claim_file_data_or_resources(self):
        for raw in (make_bss(pointer=60), make_bss(name=b".rsrc")):
            self.assert_code("RESOURCE_COFF_UNINITIALIZED", raw)
        self.assert_code("RESOURCE_COFF_SECTION_BUDGET", make_bss(size=64 * 1024 * 1024 + 1))

    def test_string_table_names_are_resolved_before_resource_classification(self):
        for name, is_resource in ((b".rdata$zzz", False), (b".rsrc$payload", True)):
            with self.subTest(name=name):
                result = coff_sections(make_long_section(name))
                self.assertEqual(result["sections"][0]["name"], name.decode())
                self.assertEqual(bool(result["resourceSections"]), is_resource)

    def test_string_table_bounds_are_checked(self):
        original = make_long_section()
        for pointer, count in ((0, 0), (len(original), 0), (60, 0xffffffff)):
            with self.subTest(pointer=pointer, count=count):
                raw = bytearray(original)
                struct.pack_into("<II", raw, 8, pointer, count)
                self.assert_code("RESOURCE_COFF_STRING_TABLE", raw)
        for size in (3, 0xffffffff):
            with self.subTest(size=size):
                raw = bytearray(original)
                struct.pack_into("<I", raw, struct.unpack_from("<I", raw, 8)[0], size)
                self.assert_code("RESOURCE_COFF_STRING_TABLE", raw)

    def test_invalid_string_offsets_and_missing_terminator_are_rejected(self):
        for name in (b"/0", b"/3", b"/99999", b"/invalid"):
            with self.subTest(name=name):
                raw = bytearray(make_long_section())
                raw[20:28] = name.ljust(8, b"\0")
                self.assert_code("RESOURCE_COFF_SECTION_NAME", raw)
        raw = bytearray(make_long_section())
        raw[-1] = ord("x")
        self.assert_code("RESOURCE_COFF_SECTION_NAME", raw)

    def test_private_scan_accepts_bss_but_rejects_encoded_resource_name(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            builds = root / "build"
            obj = builds / "library/input.o"
            obj.parent.mkdir(parents=True)
            for raw, is_resource in ((make_bss(), False), (make_long_section(), True)):
                with self.subTest(is_resource=is_resource):
                    obj.write_bytes(raw)
                    linkage = {"observationsComplete": True, "files": [{
                        "name": "library.dll", "staticLink": {"inputs": [{
                            "origin": "component-build", "path": "library/input.o",
                            "size": len(raw), "sha256": digest(raw),
                        }]}, "archiveMembers": {"members": []},
                    }]}
                    if is_resource:
                        with self.assertRaises(ReviewError) as caught:
                            _scan_private_resource_objects(linkage, builds, root / "prefix", root / "ucrt64")
                        self.assertEqual(str(caught.exception), "RESOURCE_PRIVATE_DIRECT_RESOURCE_OBJECT")
                    else:
                        result = _scan_private_resource_objects(linkage, builds, root / "prefix", root / "ucrt64")
                        self.assertEqual(result["scannedCoffObjects"], 1)
                        self.assertEqual(result["resourceObjectCount"], 0)


if __name__ == "__main__":
    unittest.main()
