"""覆盖资源解析到实际 run 调用的边界，不启动编译器或链接器。"""

from pathlib import Path
import shlex
import tempfile
import unittest
from unittest.mock import patch

from xserver_source_review import ReviewError, digest
from xserver_windows_resources import resource_compiler_evidence
from xserver_windows_resources_test import make_coff


class DependencyScanReached(Exception):
    pass


class ResourceReplayTests(unittest.TestCase):
    def exercise_replay(self, mode, input_flag="-i", output_flag="-o", *, changed=False,
                        preprocessor_mode="-xc", observed_lines=1):
        with tempfile.TemporaryDirectory(prefix="resource replay ") as temporary:
            root = Path(temporary).resolve()
            source, builds, prefix = root / "source", root / "build", root / "prefix"
            server_build, tools = builds / "xorg-server", root / "ucrt64/bin"
            source_directory, build_directory = source / "hw/xwin", server_build / "hw/xwin"
            for directory in (source_directory, build_directory, tools):
                directory.mkdir(parents=True)
            resource = source_directory / "XWin.rc"
            resource.write_bytes(b"1 RCDATA { 42 }\n")
            original = build_directory / "XWin.o"
            original.write_bytes(make_coff())
            makefile = """WINDRES = windres
.rc.o:
\t$(WINDRES) --use-temp-file -i $< --input-format=rc -o $@ -O coff -I $(top_builddir)/include
XWin.o: XWin.rc XWin.exe.manifest X.ico
"""
            (source_directory / "Makefile.in").write_text(makefile, encoding="utf-8")
            (build_directory / "Makefile").write_text(makefile, encoding="utf-8")
            windres, gcc = tools / "windres.exe", tools / "gcc.exe"
            for tool in (windres, gcc):
                tool.write_bytes(b"non-executable tool identity fixture")
            names = ("mingw-w64-ucrt-x86_64-binutils", "mingw-w64-ucrt-x86_64-gcc")
            packages = {name: {} for name in names}
            source_token = {
                "vpath": "XWin.rc",
                "absolute": resource.as_posix(),
                "drive": "D:/native/source/hw/xwin/XWin.rc",
            }[mode]
            planned = ["windres", "--use-temp-file", input_flag, source_token,
                       "--input-format=rc", output_flag, "XWin.o", "-O", "coff",
                       "-I", "../../include", "-D", "REPLAY_TEST=1", "-U", "UNUSED"]
            calls = []

            def run(arguments, cwd, *, capture=False):
                args = [str(arg) for arg in arguments]
                self.assertTrue(capture)
                if args[:2] == ["cygpath", "-m"]:
                    if mode == "drive":
                        return "D:/native" if Path(args[2]) == root else "D:/toolchain"
                    return Path(args[2]).as_posix()
                if args[0] == "make":
                    self.assertEqual(Path(cwd), build_directory)
                    return shlex.join(planned)
                if args == [str(gcc), "-dumpmachine"]:
                    return "x86_64-w64-mingw32"
                if args[0] in {str(windres), str(gcc)} and args[1:] == ["--version"]:
                    return "GNU fixture version"
                if args[0] == str(windres):
                    self.assertEqual(Path(cwd), build_directory)
                    # 断言消费方收到真实源路径，而不是只检查 parser 的元数据。
                    replay_input = args[args.index(input_flag) + 1]
                    self.assertEqual(replay_input, "../../../../source/hw/xwin/XWin.rc")
                    self.assertEqual((Path(cwd) / replay_input).resolve(), resource)
                    self.assertTrue((Path(cwd) / replay_input).is_file())
                    output = Path(args[args.index(output_flag) + 1])
                    self.assertNotEqual(output, original)
                    self.assertEqual(output.parent.parent, root)
                    expected = list(planned)
                    expected[0], expected[3], expected[6] = str(windres), replay_input, str(output)
                    expected.insert(1, "-v")
                    self.assertEqual(args, expected)
                    output.write_bytes(make_coff(payload=b"changed") if changed else make_coff())
                    calls.append(args)
                    observation = f"Using `\"{gcc}\" -E {preprocessor_mode} -DRC_INVOKED -I../../include XWin.rc'\n"
                    return observation * observed_lines
                if args[0] == str(gcc) and "-M" in args:
                    self.assertEqual(args[1:], ["-E", "-xc", "-DRC_INVOKED", "-M",
                                               "-D", "REPLAY_TEST=1", "-U", "UNUSED",
                                               "-I", str(server_build / "include"), str(resource)])
                    raise DependencyScanReached()
                self.fail(f"unexpected command: {args}")

            report = {"staticLink": {"inputs": [{
                "origin": "server-build", "path": "xorg-server/hw/xwin/XWin.o",
                "size": original.stat().st_size, "sha256": digest(original.read_bytes()),
            }]}}
            error_code = ("RESOURCE_REPRO_CHANGED" if changed else
                          "RESOURCE_PREPROCESSOR_NOT_OBSERVED" if observed_lines != 1 else
                          "RESOURCE_PREPROCESSOR_MODE" if preprocessor_mode != "-xc" else None)
            expected_error = ReviewError if error_code else DependencyScanReached
            with patch("xserver_windows_resources.package_owned_executable",
                       side_effect=[(windres, names[0]), (gcc, names[1])]):
                with self.assertRaises(expected_error) as caught:
                    resource_compiler_evidence(source, builds, server_build, prefix / "bin/XWin.exe",
                                               prefix, {"target": "x86_64-w64-mingw32"}, {}, packages,
                                               report, root, run, toolchain_root=tools.parent)
            if error_code:
                self.assertEqual(str(caught.exception), error_code)
            self.assertEqual(len(calls), 1)
            self.assertEqual(original.read_bytes(), make_coff())

    def test_replay_uses_resolved_input_at_run_boundary(self):
        for mode in ("vpath", "absolute", "drive"):
            with self.subTest(mode=mode):
                self.exercise_replay(mode)

    def test_replay_handles_both_input_and_output_option_spellings(self):
        for input_flag, output_flag in (("--input", "-o"), ("-i", "--output"),
                                        ("--input", "--output")):
            with self.subTest(input_flag=input_flag, output_flag=output_flag):
                self.exercise_replay("vpath", input_flag, output_flag)

    def test_replay_still_rejects_changed_resource_sections(self):
        self.exercise_replay("vpath", changed=True)

    def test_dependency_scan_rejects_unexpected_observed_preprocessor_mode(self):
        for preprocessor_mode in ("-xc-header", "-xc++", "-xobjective-c"):
            with self.subTest(preprocessor_mode=preprocessor_mode):
                self.exercise_replay("vpath", preprocessor_mode=preprocessor_mode)

    def test_dependency_scan_requires_one_observed_preprocessor(self):
        for observed_lines in (0, 2):
            with self.subTest(observed_lines=observed_lines):
                self.exercise_replay("vpath", observed_lines=observed_lines)


if __name__ == "__main__":
    unittest.main()
