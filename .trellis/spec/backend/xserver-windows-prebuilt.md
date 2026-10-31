# Windows prebuilt runtime materials (X0)

## 1. Scope

Bind the four actual prebuilt DLL providers to fixed official package bytes, complete package file hashes, `.PKGINFO` / `.BUILDINFO`, the exact PKGBUILD and its reviewed directory materials. This collects evidence, not historical DLL link inputs or distribution permission. The application/runtime/installer is unchanged.

## 2. Entry points

`python scripts/xserver_windows_prebuilt.py --cache <scratch> --report <json> [--native-report <json>] [--offline]` loads only `scripts/xserver/prebuilt-runtime-materials.json`. No URL, recipe execution, install or approval override exists.

`collect_materials(cache, *, native=None, offline=False, result=None, assets=ASSETS)` initializes FAIL before collection. An optional mutable result preserves completed package evidence on failure. The native build attaches it at `prebuiltRuntimeMaterials`, after resource observations and before the final version probe.

## 3. Contracts

- Exactly four unique package/provider identities. With `native`, match the full `privatePeLinkage.prebuiltDllsExcluded` dictionaries and complete observations, plus exact `runtimePackages` versions/notice hashes. No provider hash or version substitution. Native collection labels `providerBinding=enclosing-native-report`; standalone reference mode labels `fixed-baseline-reference` and retains an explicitly historical `nativeBaselineReference`.
- CLI `--native-report` requires a complete REVIEW-REQUIRED report with both native success flags; its original byte SHA256 is retained as `suppliedNativeReportSha256`, with `providerBinding=supplied-complete-native-report`. No claim of authenticated CI origin is made merely because a local JSON matches this structure.
- HTTPS allowlist: official MSYS2 UCRT64 packages, commit-qualified `msys2/MINGW-packages` raw files, and the single fixed zlib PR1165 patch URL. Redirects obey the same policy; hash, not a mutable URL or version, pins bytes. Each input is at most 8 MiB; 30-second socket and 120-second checked total download budget. Existing corrupt cache fails, never silently refreshes. New content is verified before atomic cache placement; symlink leaf entries fail.
- Fixed complete package size/SHA256 is checked before invoking `tar`. Use `tar -tf` and `tar -xOf` only; no filesystem extraction or archive execution. Clear `TAR_OPTIONS` / `TAPE` so inherited tar actions cannot alter this contract. This reuses the system tar; Linux GNU tar additionally needs the zstd build tool to read `.pkg.tar.zst` (CI installs it explicitly, no application dependency).
- Tool budget is 30 seconds per call, stdout bounded to 16 MiB before reading from the temporary file; the disk spool is not a streaming output cap. Inputs must already match the reviewed complete hashes, not arbitrary user archives. Listing is at most 64 KiB/256 unique canonical relative names; reject traversal, backslashes, drive syntax and option-like names. Exact member/file sets and every ordinary member byte hash/size must match. This is not a generic archive type/metadata validator.
- `.PKGINFO` and `.BUILDINFO` must agree on package/version and `any` package architecture; this metadata value does not assert PE architecture. `.BUILDINFO.pkgbuild_sha256sum` must equal the retrieved PKGBUILD. Fixed 40-hex recipe commit, direct directory filenames, unique file set, SHA256 and Git blob SHA1 are checked. Local filenames/checksums and external patch checksums must appear in those exact recipe bytes; do not execute or claim general shell interpretation.
- Keep declaration fields separate: `declaredBuildEnvironment`, options/buildenv, dependencies/licenses, tool identity, and `sourceReferences`. Upstream archive/VCS checksums and PGP keys here are reviewed references, not this collector's fetched archive or signature evidence. Recipe directory scope is not DLL selection scope (e.g. zlib/minizip and GCC split packages).
- Successful collection returns schema 1, `status=REVIEW-REQUIRED`, `observationsComplete=true`. Always retain false: `distributionApproved`, `bundled`, `desktopVerified`, `prebuiltDllInternalsIncluded`, `perFileLicenseReviewComplete`, `packageSignaturesVerified`, `upstreamSourceArchivesCollected`, `sourceDistributionApproved`.
- Fresh failures replace old successful output; fixed error codes, current package and completed observations only. Never emit raw package/recipe text, subprocess diagnostics, build paths or private environment values. CI uploads only explicit JSON reports, not packages, recipe bodies or executables.

## 4. Error matrix

| Condition | Expected result |
| --- | --- |
| Complete fixed material set | REVIEW-REQUIRED / exit 0, approval remains false |
| Missing/changed actual provider, version or notice | PREBUILT_NATIVE_INCOMPLETE / PROVIDER_CHANGED / VERSION_CHANGED / NOTICE_CHANGED; FAIL |
| Cache missing offline, wrong bytes, unsafe URL/redirect, failed download | FAIL, no replacement of corrupted evidence |
| Tar missing, timeout, nonzero exit, output/member mismatch | PREBUILT_ARCHIVE_TOOL_* / PREBUILT_MEMBER_* / PREBUILT_FILE_SET; FAIL |
| Metadata identity/unique field, recipe hash/blob/path, source reference mismatch | PREBUILT_PACKAGE_IDENTITY / METADATA_* / RECIPE_* / *_SOURCE_REFERENCE; FAIL |
| Invalid supplied native JSON or incomplete native build | Fresh FAIL, nonzero exit; never keep old success |

## 5. Good / base / bad

Good: download the exact four published packages and precise recipe revisions, verify every member, bind their DLL bytes to this build, and leave historical internal linkage open. Base: offline rerun yields the identical JSON for the same supplied native report. Bad: reuse an old winpthreads recipe solely because the package name is unchanged, or infer actual linked CRT members from `.BUILDINFO.installed`.

## 6. Required tests

Run `python -B -m unittest discover -s scripts -p 'xserver_windows_prebuilt*test.py' -v`. Self-authored four-package tar fixtures must exercise actual read-only tar extraction to stdout; provider/version/notice drift; metadata/recipe/blob/source mismatches; cache/URL/redirect/timeout failures; bad member sets/paths/bytes; sanitized errors and old-report replacement. Test that failed later packages retain earlier observations without retaining success.

Source CI independently downloads the real fixed packages/recipes, explicitly in baseline-reference mode. Native CI must bind this collector to that run's actual provider evidence, then complete the final native probe. These are distinct from DLL rebuild, signature, license, installer and desktop tests.

## 7. Wrong / correct

Wrong: remove the prebuilt-DLL exclusion after finding a matching PKGBUILD, or label a makepkg VCS checksum as a verified GitHub tarball hash.

Correct: preserve B2–B4 gaps, record the exact package/recipe/notice material receipts, and obtain real corresponding internal build evidence and reviewed distribution arrangements separately.
