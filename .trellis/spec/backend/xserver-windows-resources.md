# Windows resource compiler and PE resource evidence (X0)

## 1. Scope

Trace the XWin Windows resource path from the pinned xorg-server source through the actual MinGW resource compiler, the COFF object selected by the XWin link map, and the final XWin.exe PE resource directory. Also prove whether any other reachable private PE target contributes a resource section.

This is build and provenance evidence only. It does not approve distribution, close per-file rights, inspect the internals of excluded prebuilt DLLs, or verify an XDMCP desktop session.

## 2. Required observations

- Compare the source Makefile.in resource rule with the generated hw/xwin/Makefile rule. Require XWin.o to depend on XWin.rc, XWin.exe.manifest and X.ico.
- Capture the expanded `make -n V=1 -o Makefile -W X.ico -W XWin.exe.manifest -W XWin.rc XWin.o` command. Do not use `-B`, which also forces unrelated Automake refresh. Require the expected RC input, COFF output, include root and default windres preprocessor; reject custom preprocessor overrides.
- Record the actual windres and GCC executable bytes, versions, target triple and owning MSYS2 packages. Do not infer tool identity from the package name alone.
- Re-run the exact windres command into a temporary object and compare its .rsrc section names, sizes and bytes with the XWin.o object selected by the actual XWin link map.
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

### MSYS executable-alias fixtures

Run these tests with `/usr/bin/python3` under UCRT64, as in `xserver-windows.yml`; native Windows Python is not a substitute for the MSYS filesystem behavior. The focused regression is `python -m unittest xserver_windows_resources_test.ResourceEvidenceTests.test_tool_alias_collision_cannot_replace_package_owned_binary -v` from `scripts/`.

MSYS can resolve an extensionless write to an existing `.exe`. Wrong: create `windres.exe`, then call `windres.write_bytes(...)` and assume two files exist. This can overwrite the executable and turn a mismatched-alias fixture into a single-file case. Correct: exclusively create the extensionless file first, then the `.exe`; assert both directory entries, different file identities and each expected byte payload before invoking the production function.

`package_owned_executable(name, toolchain_root, work, run)` must still reject differing bytes with `RESOURCE_TOOL_ALIAS_MISMATCH` before querying pacman. An extensionless lookup of the actual `.exe` remains valid and must query ownership using the `.exe` path. Never remove the byte comparison, change the expected error or skip the Windows test to accommodate a malformed fixture. An in-memory mutation removing the byte comparison must make the corrected regression fail.

## 6. Explicit exclusions

The four prebuilt runtime DLL internals remain outside this slice. This work does not approve any license, publish an X server binary, change install packaging, add privileges, enable a bundled capability, or claim desktop interoperability. Keep distributionApproved=false, bundled=false and desktopVerified=false.
