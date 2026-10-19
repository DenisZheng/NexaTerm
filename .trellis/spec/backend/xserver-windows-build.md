# Windows X server build evidence (X0)

## 1. Scope

The Windows-only development recipe builds the fixed upstream server and direct/transitive X libraries in a private prefix. It does not install into NexaTerm, enable bundled capability or approve a component license. No external implementation is committed. Build logs and JSON evidence distinguish compilation from native startup, dependency/license closure and desktop interoperability.

## 2. Entry points

`python scripts/xserver_windows_build.py --work <private-directory> --report <json>` runs under MSYS2 UCRT64 on a real Windows runner. `scripts/xserver/windows-sources.json` owns fixed source URLs, byte sizes, SHA256, root paths, license anchors and configure options. The server retains #84's source/signature/key verification; dependencies are fixed official HTTPS inputs, with their signature/provenance status recorded separately.

## 3. Contracts

- Verify complete archive hash/size before reading or extracting. Extract only canonical regular files/directories below the pinned root; reject traversal, duplicates, links and special files, with bounded entry count and total bytes. Do not preserve ownership or privileged mode bits.
- Use a private source/build/prefix tree; no system installation, elevation, arbitrary CLI URLs or unreviewed downstream source. Command arguments come from the tracked recipe, with a fixed Windows target and explicit 2D/XDMCP options. Build tools and target libraries are separate inventories.
- Native server build must produce AMD64 PE, actual XDMCP configuration, and a real native version probe. Inspect direct/transitive PE imports against explicit prefix/toolchain providers; Cygwin/MSYS runtime imports are failures. Do not infer the closure from configure lists or a process existing.
- Every source component has pinned license text hashes. A collected license file is evidence, not a blanket MIT label for all source files. Record generated parser exceptions, compiled inputs, installed resources and any unresolved per-file/compiler-runtime obligations before distribution approval.
- Report schema 1 preserves `distributionApproved=false`, `bundled=false`, `desktopVerified=false`. A failed build writes fresh FAIL with the component/stage and nonzero exit, retaining prior completed evidence; no success fallback or continue-on-error. Native build success alone cannot pass the release gate.
- CI has contents-read permissions and no persisted checkout credentials. Only explicit JSON evidence is uploaded; no upstream archive/source or unapproved engine binary is published in this slice.

## 4. Error matrix

| Condition | Result |
| --- | --- |
| Fixed source plus native build/probe/import checks pass | Development evidence, adoption remains pending |
| Missing tool/network/hash/license anchor | FAIL, nonzero |
| Unsafe archive or unexpected component content | FAIL before execution |
| Configure/compile/install/probe fails or times out | FAIL with exact component/stage |
| Missing/wrong-architecture PE, unresolved/ambiguous DLL or POSIX runtime import | FAIL |
| Native desktop/login or signed installer absent | Explicit false capability; never inferred |

## 5. Good / base / bad

Good: the pinned upstream MinGW path produces native PE, with actual imported DLL providers and source/license evidence. Base: rebuilding the same inputs records the same source/license identities without promising bit-identical output from a changing toolchain. Bad: using host Cygwin libraries, adopting an aggregate fork by its top-level label, suppressing a configure failure, or marking bundled after a version probe.

## 6. Tests

Exercise corrupted inputs, unsafe archive paths/types/budgets, changed license anchors, failed/timeout build tools, malformed PE/import data and POSIX/unresolved dependency rejection. Real Windows CI must execute the native recipe; mocks or Linux compilation cannot substitute for its PE/probe evidence. Keep application CI, security and license checks unchanged.

## 7. Wrong / correct

Wrong: copy the entire toolchain bin directory beside the server, call every DLL MIT, or treat the configured link graph as observed runtime dependencies.

Correct: inspect actual PE imports recursively, map each shipped candidate to its exact provider/hash/license, leave unresolved obligations explicit, and adopt only after that review and later installer/desktop verification.
