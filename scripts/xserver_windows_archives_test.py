from pathlib import Path
import subprocess
import tempfile
import unittest

from xserver_source_review import ReviewError, digest
from xserver_windows_archives import archive_members, map_selections, selected_members


class ArchiveTests(unittest.TestCase):
    def setUp(self):
        # Real format fixtures are linked but never executed or counted as native engine startup.
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.member = "a_member_with_a_long_name.o"
        (self.root / "part.c").write_text("int library_part(void) { return 7; }\n")
        (self.root / "unused.c").write_text("int unused_part(void) { return 11; }\n")
        (self.root / "caller.c").write_text("extern int library_part(void); int entry(void) { return library_part(); }\n")
        self.command(["gcc", "-fno-stack-protector", "-fno-asynchronous-unwind-tables", "-c", "part.c", "-o", self.member])
        self.command(["gcc", "-fno-stack-protector", "-fno-asynchronous-unwind-tables", "-c", "unused.c", "-o", "unused.o"])
        self.command(["gcc", "-fno-stack-protector", "-fno-asynchronous-unwind-tables", "-c", "caller.c", "-o", "caller.o"])
        self.command(["ar", "rcs", "library.a", self.member, "unused.o"])
        self.command(["ld", "--entry=entry", "-Map=result.map", "-o", "result.exe", "caller.o", "library.a"])
        self.archive = self.root / "library.a"
        self.mapping = self.root / "result.map"
        self.record = {"origin": "private-prefix", "path": "library.a", "component": "fixture",
                       "sha256": digest(self.archive.read_bytes())}

    def command(self, arguments):
        result = subprocess.run(arguments, cwd=self.root, capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)

    def assertCode(self, code, operation):
        with self.assertRaises(ReviewError) as caught:
            operation()
        self.assertEqual(str(caught.exception), code)

    def collect(self, inputs=None, report=None):
        return selected_members(self.mapping, self.root, self.root / "build", self.root,
                                [self.record] if inputs is None else inputs, self.root, None, report)

    def test_real_gnu_ar_and_ld_selection_matches_the_actual_object_bytes(self):
        result = self.collect()
        self.assertTrue(result["observationsComplete"])
        self.assertFalse(result["finalSectionContributionInferred"])
        self.assertFalse(result["perFileLicenseReviewComplete"])
        self.assertEqual(len(result["members"]), 1)
        self.assertIn("unused.o", archive_members(self.archive.read_bytes()))
        self.assertNotIn("unused.o", [member["member"] for member in result["members"]])
        member = result["members"][0]
        raw = (self.root / self.member).read_bytes()
        self.assertEqual((member["member"], member["size"], member["sha256"]), (self.member, len(raw), digest(raw)))
        start = member["fileOffset"]
        self.assertEqual(self.archive.read_bytes()[start:start + len(raw)], raw)

    def test_real_inline_archive_reference_is_not_part_of_the_selected_archive_path(self):
        (self.root / "part.c").write_text("extern int next_part(void); int library_part(void) { return next_part(); }\n")
        (self.root / "next.c").write_text("int next_part(void) { return 13; }\n")
        for source in ["part", "next"]:
            self.command(["gcc", "-fno-stack-protector", "-fno-asynchronous-unwind-tables", "-c", source + ".c", "-o", source + ".o"])
        self.command(["ar", "rcs", "a.a", "part.o"])
        self.command(["ar", "rcs", "b.a", "next.o"])
        self.command(["ld", "--entry=entry", "-Map=chain.map", "-o", "chain.exe", "caller.o", "a.a", "b.a"])
        mapping = self.root / "chain.map"
        self.assertRegex(mapping.read_text(), r"b\.a\(next\.o\) +a\.a\(part\.o\)")
        inputs = [{**self.record, "path": name, "sha256": digest((self.root / name).read_bytes())}
                  for name in ["a.a", "b.a"]]
        result = selected_members(mapping, self.root, self.root / "build", self.root, inputs, self.root, None)
        self.assertEqual([(x["archive"], x["member"]) for x in result["members"]], [("a.a", "part.o"), ("b.a", "next.o")])
        self.assertIn("a.a(part.o)", result["members"][1]["reference"])

    def test_archive_truncation_wrong_magic_and_bad_long_name_offset_fail(self):
        raw = self.archive.read_bytes()
        for data in [raw[:-1], b"!<thin>\n", raw.replace(b"`\n", b"??", 1)]:
            with self.assertRaises(ReviewError):
                archive_members(data)
        position = raw.index(b"/0 ")
        self.assertCode("AR_LONGNAMES", lambda: archive_members(raw[:position] + b"/99999999999999 " + raw[position + 16:]))

    def test_an_archive_changed_after_input_inventory_cannot_pass(self):
        self.archive.write_bytes(self.archive.read_bytes() + b"changed")
        self.assertCode("AR_INPUT_CHANGED", self.collect)
        self.assertCode("AR_INPUT_OWNER", lambda: self.collect(inputs=[]))

    def test_an_empty_placeholder_member_cannot_count_as_a_selected_object(self):
        (self.root / "empty.o").write_bytes(b"")
        self.command(["ar", "rcs", "empty.a", "empty.o"])
        self.mapping.write_text(self.mapping.read_text().replace("library.a(", "empty.a(").replace(self.member, "empty.o"))
        self.record.update({"path": "empty.a", "sha256": digest((self.root / "empty.a").read_bytes())})
        self.assertCode("AR_MEMBER_EMPTY", self.collect)

    def test_missing_or_duplicate_member_identity_cannot_pass(self):
        content = self.mapping.read_text()
        self.mapping.write_text(content.replace(self.member, "missing.o"))
        self.assertCode("AR_MEMBER_AMBIGUOUS", self.collect)
        raw = self.archive.read_bytes()
        member = archive_members(raw)[self.member][0]
        start = member["fileOffset"] - 60
        duplicate = raw[start:member["fileOffset"] + member["size"] + member["size"] % 2]
        self.archive.write_bytes(raw + duplicate)
        self.record["sha256"] = digest(self.archive.read_bytes())
        self.mapping.write_text(content)
        self.assertCode("AR_MEMBER_AMBIGUOUS", self.collect)

    def test_map_requires_a_complete_unambiguous_archive_selection_section(self):
        text = self.mapping.read_text()
        self.assertCode("AR_MAP_SECTION", lambda: map_selections(text.replace("Archive member included", "Unknown member included")))
        self.assertCode("AR_MAP_ROW", lambda: map_selections(text.replace("library.a(" + self.member + ")", "broken-entry")))

    def test_failure_retains_exact_current_member_and_completed_evidence(self):
        text = self.mapping.read_text()
        position = text.index("\n\n", text.index("library.a("))
        self.mapping.write_text(text[:position] + "\nmissing.a(missing.o) input.o (symbol)\n" + text[position:])
        report = {}
        self.assertCode("AR_INPUT_OWNER", lambda: self.collect(report=report))
        self.assertFalse(report["archiveMembers"]["observationsComplete"])
        self.assertEqual(len(report["archiveMembers"]["members"]), 1)
        self.assertEqual(report["archiveMemberCurrent"], {"archive": "missing.a", "member": "missing.o"})

    def test_map_paths_with_spaces_are_preserved_and_malformed_rows_are_retained(self):
        text = self.mapping.read_text().replace("library.a(", "library with spaces.a(")
        self.assertEqual(map_selections(text)[0][0], "library with spaces.a")
        report = {}
        self.assertCode("AR_MAP_ROW", lambda: map_selections(text.replace("library with spaces.a(", "malformed("), report))
        self.assertTrue(report["archiveMapCurrentRow"].startswith("malformed("))

    def test_real_gnu_pe_import_library_members_keep_their_exact_payloads(self):
        self.command(["objcopy", "-O", "pe-x86-64", self.member, "part-coff.o"])
        self.command(["ld", "-mi386pep", "--dll", "--export-all-symbols", "--entry=0",
                      "--out-implib=import.a", "-o", "library.dll", "part-coff.o"])
        (self.root / "importer.s").write_text(".text\n.globl entry\nentry:\nmovabsq $__imp_library_part,%rax\ncall *(%rax)\nret\n")
        self.command(["as", "--64", "importer.s", "-o", "importer.initial.o"])
        self.command(["objcopy", "-O", "pe-x86-64", "importer.initial.o", "importer.o"])
        self.command(["ld", "-mi386pep", "--entry=entry", "-Map=import.map", "-o", "imported.exe", "importer.o", "import.a"])
        self.archive, self.mapping = self.root / "import.a", self.root / "import.map"
        self.record.update({"path": "import.a", "sha256": digest(self.archive.read_bytes())})
        result = self.collect()
        self.assertGreaterEqual(len(result["members"]), 3)
        for member in result["members"]:
            payload = subprocess.run(["ar", "p", "import.a", member["member"]], cwd=self.root,
                                     capture_output=True, check=True, timeout=10).stdout
            self.assertEqual(member["sha256"], digest(payload))


if __name__ == "__main__":
    unittest.main()
