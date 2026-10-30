# Windows XWin resource compiler evidence (2026-10-30)

Status: implementation in stacked Draft PR #89, based on documentation Draft #88.

## Verified baseline

Draft #87 code HEAD a924d48447b835426f81b205eee5adb7d50059a8 was checked on 2026-10-26:
- Full CI #701: success.
- Fixed source review #34: success.
- Native Windows #31: success.
- Native artifact reported stage=complete, status=REVIEW-REQUIRED, nativeBuildVerified=true and nativeVersionVerified=true.
- The private PE linkage observation set covered 13 private DLLs plus xkbcomp. Resource compiler inputs and per-file license review were still open.

These results are baseline only; they do not validate the resource audit.

## Implementation in PR #89

Latest code HEAD: 85d2f0323fd26d648a830da76f01582183b7dfce

- Added bounded AMD64 COFF section parsing and final PE resource-directory parsing.
- Verified the generated XWin Makefile WINDRES rule and exact make-expanded command against source Makefile.in.
- Recorded windres/GCC binary hashes, versions, target triple and MSYS2 package ownership.
- Reproduced XWin.o resource sections and compared their bytes with the linked object input.
- Captured GCC resource-preprocessor dependencies and source/build/toolchain ownership for each input.
- Compared final embedded RT_MANIFEST and RT_GROUP_ICON/RT_ICON payloads with pinned source manifest and ICO entries.
- Verified installed system.XWinrc identity.
- Scanned XWin direct objects/selected archive members and reachable private PE target direct objects/selected archive members for unexpected resource sections.

## Native failure analysis and correction

Native Windows #33 first failed because `make -B -n` triggered Automake refresh. That was corrected by using `make -n -o Makefile -W X.ico -W XWin.exe.manifest -W XWin.rc XWin.o`.

Native Windows #34 then completed the XWin build and install and passed resource counterexample tests, but failed with `RESOURCE_WINDRES_INPUT`. The actual cause was GNU make VPATH behavior: the `.rc.o` recipe receives bare `XWin.rc` through `$<` even though make found the prerequisite in the source tree. Resolving that bare token relative only to the build directory incorrectly pointed to a nonexistent build-tree file.

The latest correction:
- Resolves Windows drive-absolute paths through the same cygpath root mapping used by compiler dependency auditing.
- If the resource input token is relative and absent in the build directory, resolves it against the fixed source directory, then requires the exact `hw/xwin/XWin.rc` file.
- Keeps output resolution anchored to the build directory and include paths normalized through the same roots.
- Adds regression tests for VPATH bare prerequisite resolution and Windows drive-absolute input/output/include paths.

A standalone local path reproduction passed for both VPATH and drive-absolute cases. This is not a native Windows build result.

Exact-HEAD validation is pending:
- Native Windows #37
- Fixed Source Review #40
- Full CI #708

Do not reuse earlier native results as proof for the latest code. Wait for #37 to finish and inspect the resource audit report.

## Remaining boundaries

- Four prebuilt runtime DLL internals remain excluded.
- X.ico, XWin.exe.manifest and system.XWinrc still require explicit rights review.
- Full per-file license closure and runtime-library source obligations remain open.
- No bundled install, signed package, real XDMCP server login, desktop UI/session lifecycle, or macOS/Linux adaptation is claimed.
- Keep distributionApproved=false, bundled=false and desktopVerified=false.
