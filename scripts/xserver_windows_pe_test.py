import struct
import unittest

from xserver_source_review import ReviewError
from xserver_windows_pe import mapped_ranges, parse_pe


def image(normal=b"kernel32.dll", delay=b"extra.dll"):
    data = bytearray(0x800)
    data[:2] = b"MZ"
    struct.pack_into("<I", data, 60, 0x80)
    data[0x80:0x84] = b"PE\0\0"
    struct.pack_into("<HH", data, 0x84, 0x8664, 1)
    struct.pack_into("<H", data, 0x94, 240)
    optional = 0x98
    struct.pack_into("<H", data, optional, 0x20B)
    struct.pack_into("<Q", data, optional + 24, 0x140000000)
    struct.pack_into("<I", data, optional + 60, 0x200)
    struct.pack_into("<I", data, optional + 108, 16)
    struct.pack_into("<II", data, optional + 120, 0x1000, 40)
    struct.pack_into("<II", data, optional + 216, 0x1080, 64)
    struct.pack_into("<IIII", data, optional + 240 + 8, 0x600, 0x1000, 0x600, 0x200)
    struct.pack_into("<IIIII", data, 0x200, 0, 0, 0, 0x1100, 0)
    struct.pack_into("<IIIIIIII", data, 0x280, 1, 0x1140, 0, 0, 0, 0, 0, 0)
    data[0x300:0x300 + len(normal)] = normal
    data[0x340:0x340 + len(delay)] = delay
    return data


class PeTests(unittest.TestCase):
    def assertCode(self, code, data):
        with self.assertRaises(ReviewError) as caught:
            parse_pe(data)
        self.assertEqual(str(caught.exception), code)

    def test_reads_normal_and_delay_imports(self):
        result = parse_pe(image())
        self.assertEqual(result["normalImports"], ["kernel32.dll"])
        self.assertEqual(result["delayImports"], ["extra.dll"])
        self.assertEqual(result["imports"], ["extra.dll", "kernel32.dll"])

    def test_no_imports_is_an_explicit_empty_table(self):
        data = image()
        struct.pack_into("<II", data, 0x98 + 120, 0, 0)
        struct.pack_into("<II", data, 0x98 + 216, 0, 0)
        self.assertEqual(parse_pe(data)["imports"], [])

    def test_non_rva_legacy_delay_addresses_are_resolved_against_image_base(self):
        data = image()
        struct.pack_into("<Q", data, 0x98 + 24, 0x10000000)
        struct.pack_into("<II", data, 0x280, 0, 0x10001140)
        self.assertEqual(parse_pe(data)["delayImports"], ["extra.dll"])

    def test_bad_dos_pe_offsets_optional_headers_and_architecture(self):
        for field, fmt, value, code in [(60, "I", 0xFFFFFFF0, "PE_HEADER"), (0x84, "H", 0x14C, "PE_ARCHITECTURE"), (0x94, "H", 2, "PE_HEADER"), (0x98, "H", 0x10B, "PE_ARCHITECTURE")]:
            with self.subTest(field=field):
                data = image()
                struct.pack_into("<" + fmt, data, field, value)
                self.assertCode(code, data)

    def test_directory_and_section_bounds_are_checked(self):
        for field, value, code in [(0x98 + 108, 0xFFFFFFFF, "PE_DIRECTORIES"), (0x98 + 240 + 20, 0xFFFFFFF0, "PE_SECTION_RANGE"), (0x98 + 120, 0x2000, "PE_RVA")]:
            with self.subTest(field=field):
                data = image()
                struct.pack_into("<I", data, field, value)
                self.assertCode(code, data)

    def test_directory_requires_a_null_descriptor_within_its_own_size(self):
        data = image()
        struct.pack_into("<I", data, 0x98 + 124, 20)
        self.assertCode("PE_IMPORT_TERMINATOR", data)

    def test_import_name_cannot_escape_a_provider_directory(self):
        self.assertCode("PE_IMPORT_NAME", image(normal=b"../private.dll"))

    def test_unknown_delay_attributes_cannot_be_ignored(self):
        data = image()
        struct.pack_into("<I", data, 0x280, 2)
        self.assertCode("PE_DELAY_ATTRIBUTES", data)

    def test_import_string_cannot_read_zero_fill_or_beyond_file(self):
        data = image()
        struct.pack_into("<I", data, 0x20C, 0x1601)
        self.assertCode("PE_RVA", data)

    def test_mapped_contributions_use_actual_file_bytes_and_section_identity(self):
        data = image()
        data[0x98 + 240:0x98 + 248] = b".rdata\0\0"
        metadata, ranges = mapped_ranges(data, [(0x140001100, 12)])
        self.assertEqual(metadata["imageBase"], 0x140000000)
        self.assertEqual(ranges[0]["bytes"], b"kernel32.dll")
        self.assertEqual(ranges[0]["fileOffset"], 0x300)
        self.assertEqual(ranges[0]["sectionNameHex"], b".rdata".hex())

    def test_mapped_ranges_reject_headers_zero_fill_and_outside_image(self):
        for address, size in [(0x140000080, 8), (0x140001601, 1), (0x140003000, 8)]:
            with self.subTest(address=address):
                with self.assertRaises(ReviewError) as caught:
                    mapped_ranges(image(), [(address, size)])
                self.assertEqual(str(caught.exception), "PE_RVA")


if __name__ == "__main__":
    unittest.main()
