# Windows resource compiler and PE resource evidence (X0)

## 1. Scope

Trace the XWin Windows resource path from the pinned xorg-server source through the actual MinGW resource compiler, the COFF object selected by the XWin link map, and the final XWin.exe PE resource directory. Also prove whether any other reachable private PE target contributes a resource section.

This is build and provenance evidence only. It does not approve distribution, close per-file rights, inspect the internals of excluded prebuilt DLLs, or verify an XDMCP desktop session.

## 2. Required observations

- Compare the source Makefile.in resource rule with the generated hw/xwin/Makefile rule. Require XWin.o to depend on XWin.rc, XWin.exe.manifest and X.ico.
- Capture the expanded `make -n V=1 -o Makefile -W X.ico -W XWin.exe.manifest -W XWin.rc XWin.o` command. Do not use `-B`, which also forces unrelated Automake refresh. Require the expected RC input, COFF output, include root and default windres preprocessor; reject custom preprocessor overrides.
- Record the actual windres and GCC executable bytes, versions, target triple and owning MSYS2 packages. Do not infer tool identity from the package name alone.
- Replay windres using a cwd-relative spelling of the validated resolved RC input and a separate temporary output, retaining the original working directory and every other flag. Preserve the make-expanded command separately as source evidence. Compare the reproduced .rsrc section names, sizes and bytes with the XWin.o object selected by the actual XWin link map.
- Reproduce the default windres GCC preprocessing mode with a dependency-only scan. Record every resolved input and its source/build/private-prefix/toolchain owner. Required inputs include XWin.rc, winresource.h, xwin-config.h, version-config.h and the target Windows SDK windows.h.
- Parse all file-backed resource declarations in XWin.rc. The pinned source inputs X.ico and XWin.exe.manifest must match their source-review size and SHA256 anchors.
- Parse the final XWin.exe PE resource directory with bounded offsets and depth. Verify RT_MANIFEST type 24/name 1 against the source manifest, and RT_GROUP_ICON/RT_ICON against every ICO image payload and the IDI_XWIN resource identifier.
- Verify system.XWinrc is installed byte-for-byte at the path recorded by the install inventory. It is runtime configuration, not an embedded resource.
- Scan direct COFF objects and selected archive members from every reachable private PE target. Any untraced .rsrc section fails closed; a clean scan is required before resourceCompilerInputsIncluded can be true.

## 3. Ownership and report contract

The report retains source/build/tool identities, dependency hashes, actual link-map object identity, reproduced resource-section hashes, final PE identity, manifest/icon resource identities, and the private-target resource scan.

Every file must be classified as fixed source, build-generated, private-prefix, or target-toolchain input. Target-toolchain files require an exact pacman owner and the existing package/license evidence path. No unknown origin, changed hash, ambiguous owner, stale map or missing file may be silently accepted.

The XWin source header winresource.h must retain its actual permissive notice. The icon, manifest and system.XWinrc remain explicit rights-review items unless independent permission evidence is recorded.

## 4. Error matrix

| Condition | Result |
| --- | --- |
| Missing or changed RC/header/icon/manifest input | FAIL |
| Source and generated Makefile rules differ | FAIL |
| Unknown WINDRES command, custom preprocessor, wrong target or unowned tool | FAIL |
| Missing/duplicate verbose preprocessor invocation, or unexpected default language/options | FAIL (`RESOURCE_PREPROCESSOR_NOT_OBSERVED` / `RESOURCE_PREPROCESSOR_MODE`) |
| GCC dependency escapes known roots or has no package owner | FAIL |
| Reproduced .rsrc section differs from linked XWin.o | FAIL |
| XWin.o is absent from the actual link map or its bytes differ | FAIL |
| PE resource directory is malformed, ambiguous or out of bounds | FAIL |
| Embedded manifest/icon payload differs from pinned source | FAIL |
| A private PE direct object or selected archive member contains an untraced .rsrc section | FAIL |
| Resource evidence passes but rights/packaging/desktop evidence remains open | REVIEW-REQUIRED; distribution remains false |

## 5. Tests

Synthetic tests cover AMD64 COFF section parsing, malformed ranges, PE resource directory parsing, manifest/icon byte identity, group-icon mapping, Makefile rule inputs and unknown resource-file references. Native Windows CI must execute the actual windres reproduction, target-toolchain ownership checks, final PE verification and full private-object scan.

An antivirus-interrupted build is diagnostic only, even if configure continues after a probe executable is removed. Preserve the logs, leave protection settings unchanged and do not accept partial artifacts as native evidence. After the interruption is resolved, rerun in fresh build/configure state rather than reusing potentially affected feature detections or installed outputs.

### VPATH replay boundary

`parse_windres_command(...)` retains raw `command`/`commandLine`, validated `input`/`output`, and the input/output value positions (`inputIndex`/`outputIndex`). A make dry-run may contain bare `XWin.rc` while the validated file lives in the source tree. `resource_compiler_evidence(...)` must bind that file into the actual argv slot before `run`, for both `-i`/`--input`; redirect `-o`/`--output` by its parsed slot without changing the original object. Do not fix only the metadata, change cwd, copy the RC into the build tree or weaken source/hash checks.

The source and build directories belong to the same native build work tree. Compute the RC argument from its validated path relative to the unchanged build cwd, using forward slashes. A native resource-only probe with binutils 2.47-4 showed that `--use-temp-file` plus a space-containing absolute input fails inside preprocessing, while the equivalent relative input produces identical COFF bytes. Do not infer tool quoting behavior from the Python argv alone, override the preprocessor or drop the temporary-file flag.

```python
# Wrong: raw dry-run token; also avoid str(command["input"]) with a spaced work root.
repro_command = list(command["command"])
# Correct: same validated file, spelled relative to the original cwd.
repro_command[command["inputIndex"]] = Path(relpath(command["input"], build_directory)).as_posix()
repro_command[command["outputIndex"]] = str(repro_output)
```

`xserver_windows_resource_replay_test.py` exercises the production collector through its injected `run` boundary, including the COFF comparison before the dependency scan. Cover VPATH, quoted paths with spaces, mapped Windows drive paths, both option spellings, unchanged flags/cwd, original object preservation and `RESOURCE_REPRO_CHANGED`. Assert both the expected relative argument and that `(cwd / input).resolve()` is the validated source file. Removing the input binding, reverting to the absolute spelling or removing the byte comparison must fail at the corresponding boundary; parser-only assertions are insufficient. This fixture executes no compiler/linker and is not native XWin evidence.

Good/base/bad: replay a source-tree RC from the original build cwd; run the MSYS resource suite plus a resource-only native probe; never treat mocked argv coverage as native tool compatibility. A probe may use a self-authored RC, source/build headers and file-backed RCDATA, but must state its synthetic link-identity fixture and explicit stop before dependency/final-PE audit. Full Windows CI remains required for real XWin evidence.

### Observed preprocessor mode

The current UCRT64 windres invocation reports `gcc -E -xc -DRC_INVOKED`, not the old documented `-xc-header` spelling. Require exactly one windres `Using` invocation line (backtick opener, apostrophe closer) and the expected GCC default options before the dependency scan. Missing/duplicate observations fail with `RESOURCE_PREPROCESSOR_NOT_OBSERVED`; a different language mode fails with `RESOURCE_PREPROCESSOR_MODE`. Do not accept a generic `gcc` mention as an invocation observation.

One `preprocessor_defaults` value supplies both `compiler.preprocessorDefaults` and the dependency argv (with `-M` added). This is an observed-and-checked contract, not an inferred default silently reused across toolchain changes. Wrong: report `-xc-header` while windres used `-xc`, even if both dependency scans happen to produce the same files. Correct: check the real verbose invocation and use the same C preprocessing mode for dependency collection and report metadata.

The replay regression must assert the full dependency argv and reject C-header/C++/Objective-C mode drift and absent/duplicate invocation lines before dependency execution. A resource-only native check can additionally execute GCC's dependency-only scan against its self-authored headers without invoking a linker; it still does not prove real XWin SDK/final-PE closure.

### MSYS executable-alias fixtures

Run these tests with `/usr/bin/python3` under UCRT64, as in `xserver-windows.yml`; native Windows Python is not a substitute for the MSYS filesystem behavior. The focused regression is `python -m unittest xserver_windows_resources_test.ResourceEvidenceTests.test_tool_alias_collision_cannot_replace_package_owned_binary -v` from `scripts/`.

MSYS can resolve an extensionless write to an existing `.exe`. Wrong: create `windres.exe`, then call `windres.write_bytes(...)` and assume two files exist. This can overwrite the executable and turn a mismatched-alias fixture into a single-file case. Correct: exclusively create the extensionless file first, then the `.exe`; assert both directory entries, different file identities and each expected byte payload before invoking the production function.

`package_owned_executable(name, toolchain_root, work, run)` must still reject differing bytes with `RESOURCE_TOOL_ALIAS_MISMATCH` before querying pacman. An extensionless lookup of the actual `.exe` remains valid and must query ownership using the `.exe` path. Never remove the byte comparison, change the expected error or skip the Windows test to accommodate a malformed fixture. An in-memory mutation removing the byte comparison must make the corrected regression fail.

## 6. Explicit exclusions

The four prebuilt runtime DLL internals remain outside this slice. This work does not approve any license, publish an X server binary, change install packaging, add privileges, enable a bundled capability, or claim desktop interoperability. Keep distributionApproved=false, bundled=false and desktopVerified=false.

## 7. COFF storage and the fixed toolchain manifest

`coff_sections(data)` scans objects, not only PE images. GNU COFF `.bss` can carry a nonzero `SizeOfRawData` with zero `PointerToRawData`. Only pure `IMAGE_SCN_CNT_UNINITIALIZED_DATA` (content mask `0xe0 == 0x80`) may use this representation; retain `rawSize`, set `uninitialized=true` and `rawSha256=null`. A nonzero file pointer or `.rsrc*` name on such a section fails `RESOURCE_COFF_UNINITIALIZED`. Code/initialized/mixed sections still require bounded file-backed bytes. Never skip every zero-pointer section or hash the COFF header as BSS data.

Decode `/decimal` COFF section names through the bounded string table after the symbol table before resource classification. Validate the symbol/string-table range, minimum offset, terminating NUL, printable ASCII and 4096-byte name limit. Unsupported encodings fail closed. An encoded `.rsrc$...` must not escape the scanner.

`default_manifest_evidence(toolchain_root, packages)` reuses the exact package/version/declaration/single-file/source-notice contract in `source_license_evidence`. `toolchain-license-sources.json.resourceEvidence` binds the already pinned `lib/default-manifest.o` to its reviewed section, manifest payload and independently read generator template. It is a fixed precompiled-object/layout receipt, not a general COFF-resource decoder or a reproduction of the historical compiler. Changed installed bytes, absent/drifting source evidence, changed section or payload fail before object acceptance.

`matches_default_manifest(item, sections, evidence)` requires exact origin, owner, path, size, whole-object SHA256 and the single resource section's name/range/hash. No filename-only allowlist. The XWin direct-object scan requires exactly one own resource object and one fixed default-manifest input; private targets require exactly one default input, belonging to xkbcomp only. Unknown direct resources, duplicate/missing expected objects and all archive-contained resources still fail closed. Report counts are two for XWin and one across private targets, not the old inferred private zero.

`default_manifest_in_image(resources, target, evidence)` checks the final reachable resource tree, independently of LOAD. The normal XWin source manifest/icon checks must pass and the fixed default payload must not be reachable. For xkbcomp, reread the unique installed image, rebind its size/hash to private-link evidence, parse the PE resource tree and require exactly type 24/name 1/language 0/codepage 0 with the fixed payload. Extra/changed resources fail `RESOURCE_DEFAULT_FINAL_PAYLOAD`; image drift fails `RESOURCE_PRIVATE_IMAGE_CHANGED`. Do not claim that LOAD means section survival or that non-reachability explains how the linker discarded bytes.

The report adds `toolchainDefaultManifest` (source receipt, pins, historical-compiler exclusion and XWin reachability) and actual `resourceObjects[].linkedImage` under the private scan. Keep missing installed license text, unverified archive signature and all existing adoption/prebuilt/rights exclusions explicit.

Good/base/bad: recognize the exact source-bound toolchain object and compare actual final PE payloads; test both scanners with authored object/PE fixtures; never silently skip `default-manifest.o`, accept any `.bss`-named bytes or call a prebuilt object a locally reproduced generator output. `xserver_windows_coff_test.py` covers BSS/long-name counterexamples; `xserver_windows_toolchain_resources_test.py` covers source/version/owner/hash/section/image drift, missing/duplicate inputs, wrong targets, archive resources and extra/final payloads. Fixtures execute no compiler/linker; real native CI remains mandatory.
