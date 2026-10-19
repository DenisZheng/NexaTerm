from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from xserver_source_review import ReviewError, digest
from xserver_windows_compilation import dependency_path, make_dependencies, ninja_dependencies, observed_inputs


class CompilationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.builds, self.sources, self.prefix, self.sdk = [self.root / name for name in ["build", "sources", "prefix", "sdk"]]
        for directory in [self.builds, self.sources, self.prefix, self.sdk]:
            directory.mkdir()
        self.manifest = {"components": [
            {"name": "library", "root": "library-1", "buildSystem": "autotools", "compileInputs": "compiler"},
            {"name": "protocol", "root": "protocol-1", "buildSystem": "autotools", "compileInputs": "headers-only"}
        ], "serverHeaders": []}
        self.library_source = self.file(self.sources / "library-1/unit.c", "library")
        self.server_source = self.file(self.sources / "server-1/unit.c", "server")
        self.deps("library", [self.library_source])
        self.deps("xorg-server", [self.server_source])

    def file(self, path, content):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
        return path

    def deps(self, component, inputs):
        directory = self.builds / component
        self.file(directory / "Makefile", "all:\n")
        self.file(directory / ".deps/unit.Plo", "unit.o: " + " ".join(str(path) for path in inputs) + "\n")
        self.file(directory / ".deps/conditional.Po", "# dummy\n")

    def command(self, arguments, *args, **kwargs):
        if arguments[0] == "cygpath":
            return "D:/work" if arguments[-1] == self.root else "D:/sdk"
        raise AssertionError(arguments)

    def collect(self, owners=None, packages=None, run=None, report=None):
        return observed_inputs(self.builds, self.sources, self.prefix, self.manifest, "server-1",
                               owners or {}, packages if packages is not None else {}, self.root,
                               run or self.command, report, toolchain_root=self.sdk)

    def assertCode(self, code, operation, *args):
        with self.assertRaises(ReviewError) as caught:
            operation(*args)
        self.assertEqual(str(caught.exception), code)

    def test_make_escaped_windows_paths_spaces_continuation_and_phony_rules(self):
        value = "unit.o: D\\:/sdk/header\\ file.h \\\n /source/unit.c\nD\\:/sdk/header\\ file.h:\n"
        self.assertEqual(make_dependencies(value), ["D:/sdk/header file.h", "/source/unit.c"])
        self.assertEqual(make_dependencies("# dummy\n"), [])
        self.assertCode("COMPILE_DEP_RULE", make_dependencies, "")
        self.assertCode("COMPILE_DEP_ESCAPE", make_dependencies, "unit.o: bad\\")

    def test_real_gcc_dependency_output_preserves_spaces_and_hash_in_file_names(self):
        directory = self.root / "source files"
        self.file(directory / "odd #header.h", "#define VALUE 7\n")
        source = self.file(directory / "unit.c", '#include "odd #header.h"\nint value(void) { return VALUE; }\n')
        depfile = self.root / "actual.Po"
        result = subprocess.run(["gcc", "-std=c11", "-MD", "-MP", "-MF", str(depfile), "-MT", "unit.o",
                                 "-c", str(source), "-o", str(self.root / "unit.o")],
                                text=True, capture_output=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)
        names = {Path(name).name for name in make_dependencies(depfile.read_text())}
        self.assertTrue({"unit.c", "odd #header.h"}.issubset(names))

    def test_ninja_requires_current_complete_records(self):
        valid = "unit.o: #deps 2, deps mtime 123 (VALID)\n    /source/unit.c\n    /sdk/header.h\n\n"
        self.assertEqual(ninja_dependencies(valid), ["/source/unit.c", "/sdk/header.h"])
        self.assertCode("COMPILE_NINJA_DEPS", ninja_dependencies, valid.replace("VALID", "STALE"))
        self.assertCode("COMPILE_NINJA_COUNT", ninja_dependencies, valid.replace("#deps 2", "#deps 3"))
        self.assertCode("COMPILE_DEP_EMPTY", ninja_dependencies, "")

    def test_windows_path_requires_a_known_native_mount(self):
        self.assertEqual(dependency_path("D:/work/sources/library-1/unit.c", self.root, [("D:/work", self.root)]), self.library_source)
        self.assertEqual(dependency_path("..\\..\\sources\\library-1\\unit.c", self.builds / "library", []), self.library_source)
        self.assertCode("COMPILE_PATH_ROOT", dependency_path, "E:/unknown/header.h", self.root, [("D:/work", self.root)])

    def test_observed_sources_installed_and_generated_headers_have_independent_owners(self):
        installed = self.file(self.prefix / "include/client.h", "client")
        generated = self.file(self.builds / "library/config.h", "generated")
        self.deps("library", [self.library_source, installed, generated])
        result = self.collect({"include/client.h": "protocol"})
        self.assertEqual(len(result["files"]), 4)
        self.assertEqual({item["origin"] for item in result["files"]}, {"fixed-source", "private-prefix", "build-generated-or-private-header"})
        self.assertFalse(result["perFileLicenseReviewComplete"])
        self.assertFalse(result["linkOrDistributionRelevanceInferred"])
        self.assertEqual(result["observations"][0]["dependencyRecords"], 1)
        self.assertCode("COMPILE_INSTALL_OWNER", self.collect)

    def test_private_server_header_needs_its_exact_manifest_identity(self):
        header = self.file(self.builds / "xorg-server-headers/X11/extensions/XKBgeom.h", "server header")
        self.deps("xorg-server", [self.server_source, header])
        self.assertCode("COMPILE_PRIVATE_HEADER", self.collect)
        self.manifest["serverHeaders"] = [{"component": "protocol", "target": "X11/extensions/XKBgeom.h", "size": 13, "sha256": digest(header.read_bytes())}]
        self.collect()
        header.write_text("changed")
        self.assertCode("COMPILE_PRIVATE_HEADER", self.collect)

    def test_nonrecursive_automake_dependencies_use_the_nearest_makefile_directory(self):
        self.file(self.builds / "library/src/fontfile/.deps/other.Plo", "src/fontfile/other.o: ../../sources/library-1/unit.c\n")
        result = self.collect()
        self.assertEqual(result["observations"][0]["dependencyRecords"], 2)
        self.assertEqual(len(result["files"]), 2)

    def test_meson_observed_nodes_use_the_same_source_ownership_contract(self):
        source = self.file(self.sources / "meson-1/unit.c", "meson library")
        self.manifest["components"].append({"name": "meson-library", "root": "meson-1", "buildSystem": "meson", "compileInputs": "compiler"})
        def command(arguments, *args, **kwargs):
            if arguments[0] == "ninja":
                return "unit.o: #deps 1, deps mtime 123 (VALID)\n    " + str(source) + "\n\n"
            return self.command(arguments, *args, **kwargs)
        result = self.collect(run=command)
        self.assertEqual(len(result["files"]), 3)

    def test_unknown_roots_fail_before_reading_file_content(self):
        other = self.file(self.root / "unowned/header.h", "unowned")
        self.deps("library", [other])
        original = Path.read_bytes
        def read(path):
            self.assertNotEqual(path, other)
            return original(path)
        with patch.object(Path, "read_bytes", read):
            self.assertCode("COMPILE_INPUT_ORIGIN", self.collect)

    def test_failure_retains_prior_completed_component_evidence(self):
        other = self.file(self.root / "unowned/header.h", "unowned")
        self.deps("xorg-server", [other])
        report = {}
        self.assertCode("COMPILE_INPUT_ORIGIN", lambda: self.collect(report=report))
        self.assertEqual(report["compilerInputComponent"], "xorg-server")
        self.assertEqual(len(report["compilerInputs"]["files"]), 1)
        self.assertTrue(report["compilerInputs"]["observations"][0]["complete"])
        self.assertFalse(report["compilerInputs"]["observationsComplete"])

    def test_excluded_header_and_missing_compiler_observation_fail(self):
        excluded = self.file(self.sdk / "propkey.h", "excluded")
        self.deps("library", [excluded])
        self.assertCode("COMPILE_EXCLUDED_HEADER", self.collect)
        self.file(self.builds / "library/.deps/unit.Plo", "# dummy\n")
        self.assertCode("COMPILE_DEP_EMPTY", self.collect)

    def test_toolchain_headers_are_mapped_once_to_the_actual_package_inventory(self):
        first = self.file(self.sdk / "first.h", "first")
        second = self.file(self.sdk / "second.h", "second")
        self.deps("library", [self.library_source, first, second])
        packages, queries = {}, []
        package = "mingw-w64-ucrt-x86_64-headers"
        def run(arguments, *args, **kwargs):
            if arguments[0] == "pacman":
                queries.append(arguments)
                return package
            return self.command(arguments, *args, **kwargs)
        def evidence(name, work, run, owners):
            self.assertEqual(name, package)
            owners.update({str(first).casefold(): package, str(second).casefold(): package})
            return {"package": package, "distributionApproved": False}
        with patch("xserver_windows_compilation.package_evidence", evidence):
            result = self.collect(packages=packages, run=run)
        self.assertEqual(len(queries), 1)
        self.assertEqual(len([item for item in result["files"] if item.get("package") == package]), 2)
        self.assertFalse(packages[package]["distributionApproved"])


if __name__ == "__main__":
    unittest.main()
