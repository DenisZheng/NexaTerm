from pathlib import Path
import re
import subprocess
import tempfile
import unittest

from xserver_source_review import ReviewError, digest
from xserver_windows_inventory import link_inputs
from xserver_windows_linker import validate_producer
from xserver_windows_linkmap import PRODUCER_PACKAGE, PRODUCER_RELEASE, PRODUCER_VERSION, memory_inputs


class LinkerMemoryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.temporary.cleanup)
        cls.root = Path(cls.temporary.name)
        # Own format fixture, never executed or counted as Windows runtime proof.
        sources = {
            "library": ".data\n.globl datum\ndatum:\n.long 7,11\n",
            "caller": ".data\naddress:\n.quad 4\n.reloc address,BFD_RELOC_64,datum\n.text\n.globl mainCRTStartup\nmainCRTStartup:\nmovabsq $address,%rax\nmovq (%rax),%rax\nmovl (%rax),%eax\nret\n.globl _pei386_runtime_relocator\n_pei386_runtime_relocator:\nret\n"}
        for name, source in sources.items():
            (cls.root / (name + ".s")).write_text(source)
            cls.command(["as", "--64", name + ".s", "-o", name + ".initial.o"])
            cls.command(["objcopy", "-O", "pe-x86-64", name + ".initial.o", name + ".o"])
        cls.command(["ld", "-mi386pep", "--dll", "--export-all-symbols", "--entry=0", "-o", "fixture.dll", "--out-implib=fixture.a", "library.o"])
        # Explicit in-place addend survives ELF RELA -> COFF conversion; request auto-import independent of host defaults.
        cls.command(["ld", "-mi386pep", "--entry=mainCRTStartup", "--enable-auto-import", "--enable-runtime-pseudo-reloc", "-Map=fixture.map", "-o", "XWin.exe", "caller.o", "fixture.a"])
        cls.mapping = (cls.root / "fixture.map").read_text()
        # Ubuntu's GNU ld 2.38 emits a literal (null) output prefix. Adapt only this fixture;
        # production accepts the pinned 2.47 producer and its XWin_exe names exclusively.
        if re.search(r"^LOAD \(null\)_(?:rtr|ertr)[0-9]{6}\.o$", cls.mapping, re.MULTILINE):
            version = subprocess.run(["ld", "--version"], capture_output=True, text=True, check=True, timeout=10).stdout.splitlines()[0]
            if not re.fullmatch(r"GNU ld \(GNU Binutils(?: for Ubuntu)?\) 2\.38", version):
                raise AssertionError("Unreviewed fixture prefix producer: " + version)
            cls.mapping = re.sub(r"\(null\)_((?:rtr|ertr)[0-9]{6}\.o)", r"XWin_exe_\1", cls.mapping)
        loads = [line for line in cls.mapping.splitlines() if line.startswith("LOAD ")]
        if "LOAD XWin_exe_rtr000000.o" not in loads:
            raise AssertionError("Fixture did not generate pseudo relocations: " + repr(loads))
        cls.binary = (cls.root / "XWin.exe").read_bytes()
        # Parser policy fixture; actual producer identity is captured in native CI.
        cls.producer = {"package": PRODUCER_PACKAGE, "version": PRODUCER_VERSION, "binarySha256": PRODUCER_RELEASE["binarySha256"]}

    @classmethod
    def command(cls, arguments):
        result = subprocess.run(arguments, cwd=cls.root, capture_output=True, text=True, timeout=30)
        if result.returncode:
            raise AssertionError(result.stderr)

    def assertCode(self, code, operation):
        with self.assertRaises(ReviewError) as caught:
            operation()
        self.assertEqual(str(caught.exception), code)

    def test_real_bfd_memory_objects_are_bound_to_final_output_bytes(self):
        records = memory_inputs(self.mapping, self.binary, self.producer)
        self.assertEqual(set(records), {"XWin_exe_rtr000000.o", "XWin_exe_ertr000001.o", "dll stuff"})
        for name, record in records.items():
            self.assertFalse((self.root / name).exists())
            self.assertFalse(record["inputFilePresent"])
            self.assertFalse(record["inputFileSha256Available"])
            self.assertFalse(record["outputLicenseApprovalInferred"])
            for section in record["outputContributions"]:
                start, size = section["fileOffset"], section["size"]
                self.assertEqual(section["sha256"], digest(self.binary[start:start + size]))

    def test_producer_changes_cannot_use_the_reviewed_constructor_evidence(self):
        for producer in [None, {}, {**self.producer, "version": "2.48-1"}, {**self.producer, "binarySha256": "a" * 64}]:
            self.assertCode("LINK_GENERATED_PRODUCER", lambda: memory_inputs(self.mapping, self.binary, producer))

    def test_published_dated_release_is_not_confused_with_package_version(self):
        validate_producer("GNU ld (GNU Binutils) 2.47.20260726", PRODUCER_RELEASE["binarySha256"])

    def test_unreviewed_producer_date_or_binary_is_rejected(self):
        for text, sha in [("GNU ld (GNU Binutils) 2.47", PRODUCER_RELEASE["binarySha256"]),
                          ("GNU ld (GNU Binutils) 2.47.20260727", PRODUCER_RELEASE["binarySha256"]),
                          ("GNU ld (GNU Binutils) 2.47.20260726", "a" * 64)]:
            self.assertCode("LINK_GENERATED_PRODUCER", lambda: validate_producer(text, sha))

    def test_legacy_fixture_prefix_cannot_be_accepted_by_production(self):
        mapping = self.mapping.replace("XWin_exe_rtr", "(null)_rtr")
        records = memory_inputs(mapping, self.binary, self.producer)
        self.assertNotIn("(null)_rtr000000.o", records)
        path = self.root / "legacy.map"
        path.write_text(mapping)
        self.assertCode("LINK_INPUT_MISSING", lambda: link_inputs(path, self.root, self.root, self.root / "prefix", {}, self.root, None, {}, generated_inputs=records))

    def test_each_output_accepts_only_its_exact_generated_namespace(self):
        for target, prefix in [("keyboard-tool.exe", "keyboard_tool_exe"), ("libFixture-1.dll", "libFixture_1_dll")]:
            mapping = self.mapping.replace("XWin_exe", prefix)
            records = memory_inputs(mapping, self.binary, self.producer, target=target)
            self.assertIn(prefix + "_rtr000000.o", records)
            self.assertNotIn(prefix + "_rtr000000.o", memory_inputs(mapping, self.binary, self.producer))

    def test_missing_contribution_cannot_be_replaced_by_a_discarded_section(self):
        name = "XWin_exe_rtr000000.o"
        mapping = self.mapping.replace("0x18 " + name, "0x18 ordinary.o")
        mapping = "Discarded input sections\n .rdata_runtime_pseudo_reloc 0x0 0x18 " + name + "\n" + mapping
        self.assertCode("LINK_GENERATED_SECTIONS", lambda: memory_inputs(mapping, self.binary, self.producer))

    def test_unexpected_section_or_duplicate_load_cannot_pass(self):
        mapping = self.mapping.replace(" .rdata_runtime_pseudo_reloc\n", " .text\n")
        self.assertCode("LINK_GENERATED_SECTIONS", lambda: memory_inputs(mapping, self.binary, self.producer))
        self.assertCode("LINK_GENERATED_COUNT", lambda: memory_inputs(self.mapping + "LOAD XWin_exe_rtr000000.o\n", self.binary, self.producer))

    def test_output_address_cannot_escape_the_actual_pe(self):
        mapping = re.sub(r"0x[0-9a-fA-F]+(\s+0x18 XWin_exe_rtr000000.o)", r"0xffffffffffffffff\1", self.mapping)
        self.assertCode("PE_RVA", lambda: memory_inputs(mapping, self.binary, self.producer))

    def test_modified_reloc_data_or_relocator_reference_is_rejected(self):
        records = memory_inputs(self.mapping, self.binary, self.producer)
        for name, code in [("XWin_exe_rtr000000.o", "LINK_GENERATED_RELOC"), ("XWin_exe_ertr000001.o", "LINK_GENERATED_RELOCATOR")]:
            data = bytearray(self.binary)
            section = records[name]["outputContributions"][0]
            data[section["fileOffset"]] ^= 1
            self.assertCode(code, lambda: memory_inputs(self.mapping, data, self.producer))

    def test_generated_name_cannot_shadow_a_disk_file_or_excuse_unknown_missing_inputs(self):
        records = memory_inputs(self.mapping, self.binary, self.producer)
        path = self.root / "audit.map"
        path.write_text(self.mapping)
        shadow = self.root / "XWin_exe_rtr000000.o"
        shadow.write_bytes(b"shadow")
        try:
            self.assertCode("LINK_GENERATED_SHADOW", lambda: link_inputs(path, self.root, self.root, self.root / "prefix", {}, self.root, None, {}, generated_inputs=records))
        finally:
            shadow.unlink()
        path.write_text(self.mapping.replace("LOAD caller.o", "LOAD unknown-missing.o"))
        self.assertCode("LINK_INPUT_MISSING", lambda: link_inputs(path, self.root, self.root, self.root / "prefix", {}, self.root, None, {}, generated_inputs=records))


if __name__ == "__main__":
    unittest.main()
