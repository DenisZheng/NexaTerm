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

## 2026-10-31: native alias-fixture repair (local, not pushed)

The continuation base is PR #89 HEAD `ec2d3322009691e633292714ce950dcc6ed8b676`. Its Full CI #712 and Fixed Source Review #44 passed, but [Native Windows #41](https://github.com/DenisZheng/NexaTerm/actions/runs/41017004853) failed one of 148 counterexample tests. The compile step was skipped and no native JSON was produced. The older pending statements above describe earlier attempts, not the latest result.

### Root cause and prevention

Category: implicit platform assumption plus a test-coverage gap. The collision fixture created `windres.exe` first, then wrote different bytes through `windres`. Under MSYS, that second write opened and truncated the existing `.exe`: directory enumeration showed only `windres.exe`, both paths read `MZ-tampered`, and `samefile` was true. Native Windows Python created two distinct files with the same setup. The earlier non-MSYS test result could not validate this fixture.

A minimal two-order experiment under `/usr/bin/python3` reproduced the behavior. Creating the extensionless path first produced two entries, different file identities and the intended distinct bytes. `Path.resolve()` retained the extensionless spelling, ruling out path normalization as the cause; the unexpected pacman call was a consequence of identical bytes, not a package-manager failure.

The repair changes only fixture construction: exclusive creation of `windres` followed by `windres.exe`, with explicit directory-entry, file-identity and exact-byte assertions. Production `package_owned_executable` and its ownership/hash checks are unchanged. The corrected test still requires `RESOURCE_TOOL_ALIAS_MISMATCH` before any pacman call. An in-memory mutation replacing only the byte comparison with `True` makes the corrected test fail at the expected forbidden pacman call; it is not a vacuous green test.

### Local verification

- Isolated MSYS2 under `.trellis/.runtime/pr89-msys2`, with no system installation or global PATH change. Official base `20260927.sfx.exe` SHA256: `ad336cccfda47758b5e15cda993fbba421115cb0b126697daef1ee4dfe37209f`.
- Local MSYS runtime `3.6.12-1`, MSYS Python `3.12.16-1`; CI #41 used runtime `3.6.11-4`. The original failure reproduced locally before editing, and the added fixture preconditions independently failed because only one directory entry existed.
- `/usr/bin/python3 -m unittest discover -s scripts -p 'xserver_windows_*test.py' -v`: **148 passed**, no skips. Native Windows Python also passed the focused collision test after repair.
- MSYS source-review suite: **21 passed**. The resource suite independently passed **24 tests** under WSL Ubuntu 24.04 / Python 3.12.3, including the corrected collision fixture.
- `pnpm run check`: **PASS**.
- `npm run build`, line-budget and startup-module boundary checks: **PASS**; existing large-chunk warnings remain. No frontend imports changed.
- `pnpm test` under the native Windows `zh-CN` locale: 1153 passed, 7 existing English-string assertions failed, 1 todo. No frontend code changed; the failures are in connection-submit, tunnel-label and workspace-restore tests. Do not count this as a complete frontend pass.
- Process-local `NODE_OPTIONS=--no-experimental-global-navigator` followed by `pnpm test`: **139 files / 1160 tests passed, 1 todo**. The option must reach Vitest workers via the environment; setting only the parent Node CLI flag did not. This validates the node-test fallback without native locale detection, not the failing default-locale scenario; no test assertions, app locale or repository configuration were changed.
- `node --test scripts/*.test.mjs`: 183 passed, 10 failed, 3 skipped. The unchanged Save As fixture requires `/bin/sh`, `/usr/bin` utilities and POSIX symlinks; this native Windows run cannot satisfy those environment assumptions. No unrelated fixture or production code was changed.
- The unchanged Save As file independently passed **11 tests** in WSL Ubuntu 24.04 / Node 18.19.1, confirming the missing POSIX environment was the native Windows blocker. This targeted run does not claim the complete app supports Node 18.
- Native Windows Python running the entire resource suite additionally exposed the unchanged POSIX-shell command fixture using backslash paths (`RESOURCE_WINDRES_INPUT`); the CI-equivalent MSYS suite passes. Native Python is not substituted for the prescribed MSYS runner.
- Full native XWin build/resource audit was stopped deliberately at 09:55:04 (UTC+08:00) after repeated antivirus deletions. The build had reached libXfont2, not final XWin verification; `.trellis/.runtime/pr89-native-review.json` does not exist. The targeted build process tree was terminated and no private MSYS2 processes remained. Log: `.trellis/.runtime/pr89-native-build.log`. This is an interrupted diagnostic run, not accepted native evidence.
- The maintainer reported deletion of `pr89-native/build/libX11/conftest.exe`, detected as `HVM:TrojanDownloader/Small.gen!A` (detection ID `E9970572BF268E86`). The supplied event identifies private UCRT64 `ld.exe` (PID 27636), with `collect2.exe` (PID 4608) as parent, writing the probe executable. This establishes build-time interception, not observed downloader behavior or proof of a false positive. The antivirus product and event timestamp remain unconfirmed; the detection ID is not a sample hash.
- libX11 `config.log` records a successful executable probe (`./conftest.exe`, exit 0), and libX11 subsequently reached compile/install. The filename is reused by many configure probes, so this does not identify the deleted instance or establish that all feature detections were unaffected. No protection settings, exclusions or quarantine restoration were changed, and no sample was uploaded.
- A read-only check using native Python, without executing the reported linker, found `ld.exe` matches the installed mtree SHA256 for `mingw-w64-ucrt-x86_64-binutils-2.47-4`; `collect2.exe`, `liblto_plugin.dll` and `lto-wrapper.exe` match `mingw-w64-ucrt-x86_64-gcc-16.2.0-6`. This is consistency with the local package database, not independent malware clearance of the deleted `conftest.exe`.
- After human review and a separately authorized commit/push, use a new PR Windows CI run for full native validation. Before any local retry, resolve the antivirus handling with the maintainer and use fresh build/configure state; do not reuse feature-detection results or installed outputs from this interrupted run.

The code-spec now requires concrete fixture identity assertions and the MSYS interpreter. Repository search found this two-file construction only in the collision test; no shared runtime abstraction or wider refactor is needed. All distribution/bundling/desktop flags remain false. The local repair has not been committed, pushed or verified by a new GitHub CI run.
