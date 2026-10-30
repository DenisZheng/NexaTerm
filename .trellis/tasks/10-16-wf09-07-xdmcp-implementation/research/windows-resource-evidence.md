# Windows XWin resource compiler evidence (2026-10-30)

Status: implementation slice in progress on stacked Draft PR #88. The new resource audit has been added to the native build pipeline; its exact-HEAD full CI and Windows-native results are pending. Do not reuse PR #87 results as evidence for the new code.

## Verified baseline

Draft #87 code HEAD a924d48447b835426f81b205eee5adb7d50059a8 was checked on 2026-10-26:

- Full CI #701: success.
- Fixed source review #34: success.
- Native Windows #31: success.
- The downloaded native artifact reported stage=complete, status=REVIEW-REQUIRED, nativeBuildVerified=true and nativeVersionVerified=true.
- The private PE linkage observation set covered 13 private DLLs plus xkbcomp. Resource compiler inputs and per-file license review were still open.

These results are the baseline only. They do not validate the new resource compiler audit.

## New bounded slice

The new code traces XWin.rc through the generated Makefile WINDRES rule, actual windres/GCC tools, preprocessing dependencies, XWin.o, and the final XWin.exe PE resource directory. It checks the source manifest and icon payloads against the embedded resources, and scans direct objects plus selected archive members for all reachable private PE targets.

The new audit is fail-closed. Any unknown dependency origin, changed resource object, PE payload mismatch, unowned toolchain input, or untraced private .rsrc object blocks the stage.

## Remaining boundaries

- The four prebuilt DLL internals remain excluded.
- X.ico, XWin.exe.manifest and system.XWinrc still require explicit rights review.
- Full per-file license closure and runtime-library source obligations remain open.
- No bundled install, signed package, real XDMCP server login, desktop UI/session lifecycle, or macOS/Linux adaptation is claimed.
- Keep distributionApproved=false, bundled=false and desktopVerified=false.
