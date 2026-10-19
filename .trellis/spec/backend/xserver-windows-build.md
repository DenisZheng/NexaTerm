# Windows X server build evidence (X0)

## 1. Scope

The Windows-only development recipe builds the fixed upstream server and direct/transitive X libraries in a private prefix. It does not install into NexaTerm, enable bundled capability or approve a component license. No external implementation is committed. Build logs and JSON evidence distinguish compilation from native startup, dependency/license closure and desktop interoperability.

## 2. Entry points

`python scripts/xserver_windows_build.py --work <private-directory> --report <json>` runs under MSYS2 UCRT64 on a real Windows runner. `scripts/xserver/windows-sources.json` owns fixed source URLs, byte sizes, SHA256, root paths, license anchors and configure options. The server retains #84's source/signature/key verification; dependencies are fixed official HTTPS inputs, with their signature/provenance status recorded separately.

`xserver_windows_pe.parse_pe(bytes)` validates AMD64/PE32+ headers, bounded sections/RVAs and both normal/delay import descriptors, returning their union. `xserver_windows_inventory` binds installed files to their source owner, records actual DLL provider package/license hashes and checks the server's GNU link map for static/compiler-runtime inputs. The Autotools target is `XWin.exe`; the Meson target name is not substituted into this recipe.

`python scripts/xserver_windows_signatures.py --cache <directory> --report <json> [--offline]` independently verifies all dependency archive/signature/certificate pins, including the actual signing subkey and primary fingerprints. It shares the fixed download path with the native recipe. The source workflow executes this on Linux as well as the native recipe checking each dependency before extraction/build.

## 3. Contracts

- Verify complete archive hash/size before reading or extracting. Extract only canonical regular files/directories below the pinned root; reject traversal, duplicates, links and special files, with bounded entry count and total bytes. Do not preserve ownership or privileged mode bits.
- Preserve verified release file timestamps so Make does not regenerate shipped Autotools inputs. Resolve the host `xcbgen` module from its exact private installation and verify its imported file; target pkg-config Windows path rewriting does not change the build-only Python module's owner.
- Pinned source adaptations require exact input/output file hashes and one exact match for each authored replacement. A mismatch fails before writing the adapted file. The two libxcb Winsock buffer casts retain the original integer payload/length; compiler diagnostics are not disabled.
- Verify each dependency signature with an isolated pinned public certificate and zero GPG exit. Match both full signing and primary fingerprints, epoch and algorithms. Reject revoked/expired current signing or primary keys, unknown/error statuses and duplicate signatures. An old `KEYEXPIRED` note is accepted only when its timestamp belongs to another explicitly present certificate key; it cannot excuse the current signer. Legacy primary algorithms/digests and maintainer identity remain adoption review items.
- Use a private source/build/prefix tree; no system installation, elevation, arbitrary CLI URLs or unreviewed downstream source. Command arguments come from the tracked recipe, with a fixed Windows target and explicit 2D/XDMCP options. Build tools and target libraries are separate inventories.
- Native server build must produce AMD64 PE, actual XDMCP configuration, and a real native version probe. Inspect direct/transitive PE imports against explicit prefix/toolchain providers; Cygwin/MSYS runtime imports are failures. Do not infer the closure from configure lists or a process existing.
- DLL checks include delayed imports, unknown/malformed RVA/descriptor failures and provider ambiguity. System DLL names cannot be shadowed by a file in the private prefix. Prefix file collisions and unattributed source binaries fail. The final link map must identify XWin.exe; actual loaded link inputs retain hashes and package/source ownership rather than inferring static runtime use from compiler defaults.
- Every source component has pinned license text hashes. A collected license file is evidence, not a blanket MIT label for all source files. Record generated parser exceptions, compiled inputs, installed resources and any unresolved per-file/compiler-runtime obligations before distribution approval.
- Preserve server Automake dependency tracking. Verify the actual winmsg compilation does not include the header without a license notice, and observe the owned MinGW-w64 DirectDraw SDK header in real compiler dependencies. Missing observations fail, even if the configuration claims the expected profile. These checks cover the named server questions; they do not assert an exhaustive per-file review of every transitive library.
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
