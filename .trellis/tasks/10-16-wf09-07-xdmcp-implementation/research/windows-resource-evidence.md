# Windows XWin resource compiler evidence (2026-10-30)

Status: implementation in stacked Draft PR #89, based on documentation Draft #88. PR #88 documentation CI passed; it did not run the resource audit because it changed no build code.

## Verified baseline

Draft #87 code HEAD a924d48447b835426f81b205eee5adb7d50059a8 was checked on 2026-10-26:

- Full CI #701: success.
- Fixed source review #34: success.
- Native Windows #31: success.
- Native artifact reported stage=complete, status=REVIEW-REQUIRED, nativeBuildVerified=true and nativeVersionVerified=true.
- The private PE linkage observation set covered 13 private DLLs plus xkbcomp. Resource compiler inputs and per-file license review were still open.

These results are baseline only; they do not validate the resource audit.

## Implementation in PR #89

Exact code HEAD: 6e08efca76893b8a2a8e5c6a9ed9c0ac9ec02f0e

- Added bounded AMD64 COFF section parsing and final PE resource-directory parsing.
- Verified the generated XWin Makefile WINDRES rule and exact make-expanded command against the source Makefile.in.
- Recorded windres/GCC binary hashes, versions, target triple and MSYS2 package ownership.
- Reproduced XWin.o resource sections and compared their bytes with the linked object input.
- Captured GCC resource-preprocessor dependencies and required source/build/toolchain ownership for each input.
- Compared final embedded RT_MANIFEST and RT_GROUP_ICON/RT_ICON payloads with the pinned source manifest and ICO entries.
- Verified installed system.XWinrc identity.
- Scanned XWin direct objects/selected archive members and every reachable private PE target direct object/selected archive member for unexpected .rsrc sections.
- Kept prebuilt DLL internals explicitly excluded and all distribution/adoption flags false.

Local synthetic regression suite: 16 tests passed in the Linux test container. These cover malformed COFF/PE ranges, Makefile and command drift, custom preprocessor rejection, source/resource payload drift, icon mapping drift, and unexpected resource objects.

Exact-HEAD GitHub CI and native Windows build are pending. Do not infer native success from PR #87 or PR #88. The native Windows job must execute the real windres reproduction, package ownership checks, PE resource validation and private object scan.

## Remaining boundaries

- Four prebuilt runtime DLL internals remain excluded.
- X.ico, XWin.exe.manifest and system.XWinrc still require explicit rights review.
- Full per-file license closure and runtime-library source obligations remain open.
- No bundled install, signed package, real XDMCP server login, desktop UI/session lifecycle, or macOS/Linux adaptation is claimed.
- Keep distributionApproved=false, bundled=false and desktopVerified=false.
