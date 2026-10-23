# Windows private PE link evidence (X0)

## 1. Scope

Extend the existing XWin map/member evidence to xkbcomp and the private DLLs actually reachable from the two PE roots. Keep the original XWin report separate. This records real link inputs and selected archive payloads; prebuilt toolchain DLL internals, resource compilation, per-file rights and distribution approval remain open.

## 2. Entry points

`xserver_windows_private_links.private_linkage(...)` runs after both PE/provider closures and the original XWin map/member checks, before complete C-input collection. `bind_output(...)` binds a map to its exact component build output and installed PE. The tracked recipe supplies build systems and retains maps from the start of dependency configuration, including Meson links.

## 3. Contracts

- Select targets only from the actual XWin/xkbcomp PE closures. Both private roots are mandatory. A duplicate DLL must have the same origin, source/package owner, size and image hash. Reject malformed names and unknown origins. Deduplicate identical observations; never use this to conceal differing providers.
- For each reachable private PE except the separately checked XWin, require one case-insensitive matching map and an exact install owner. Bind its single AMD64 `OUTPUT` target to one real file inside that component's build directory, then require byte identity with the installed file and the already inspected PE hash/size. Reject stale maps for other outputs, escaping paths, duplicate build candidates, links and image changes.
- Preserve the actual linker working directory: relative output paths determine it; absolute Autotools `.libs` outputs use their parent build directory, while Meson links run at its component build root. Interpret LOAD and archive paths from that directory, never from the map's storage directory.
- Reuse bounded LOAD ownership, archive/member parsing and exact package notices. Attribute component build inputs to their actual component, requiring them below that component's build root. Private-prefix and toolchain inputs retain their independent owners and original byte identities.
- Recognize only the exact current output's sanitized GNU pseudo-relocation namespace and `dll stuff`, using the existing pinned producer/section/PE-contribution checks. Do not accept arbitrary similarly named missing files. The early real Windows probe covers a named DLL and a differently named executable, including actual nonzero-offset DLL data import/run.
- Preserve completed target evidence and the current failed target, with observationsComplete false until every selected target passes. Keep per-target map/image/input/member identities and the original XWin report intact. All four prebuilt providers from the baseline remain explicit exclusions; the new run derives its own list from observed closures.
- `prebuiltDllInternalsIncluded`, `resourceCompilerInputsIncluded`, `perFileLicenseReviewComplete` and `distributionApproved` remain false. Selected members are not proof of each final section's survival or of license approval. Only JSON evidence is uploaded; no engine binary is published.

## 4. Error matrix

| Condition | Result |
| --- | --- |
| Every observed private target is bound and checked | Complete additional development evidence; adoption false |
| Same DLL name has different provider or bytes | FAIL |
| Missing/wrong/stale/ambiguous map or installed image | FAIL with current target and completed prior targets |
| Unknown LOAD, changed/ambiguous archive member or generator | Existing strict FAIL |
| Prebuilt DLL/resource/license review absent | Explicit excluded scope; never inferred complete |

## 5. Good / base / bad

Good: resolve libX11's own link map against its build and installed DLL, then retain its selected CRT/static members. Base: one DLL reached from both roots is processed once after identical identity checks. Bad: call the XWin map a transitive DLL implementation audit or enumerate every installed development utility as a shipped dependency.

## 6. Tests

Use real GNU assembler/archive/PE links for an authored DLL and tool fixture. Verify exact output/installed binding, working directories, member payloads, provider mismatch, missing map, changed images, duplicate outputs, wrong targets and partial failure. The existing actual pseudo-relocation fixture covers exact namespaces; real Windows must rerun the complete recipe and early native probes. Linux PE parsing does not establish Windows execution.

Native MinGW ld can write drive-letter paths into a map even when invoked by MSYS Python with POSIX arguments. Fixture command runners must execute `cygpath -u` for those paths and restrict package stubs to the exact `pacman -Qqo` lookup. A catch-all package stub corrupts path conversion. Cover drive-letter LOAD and archive-selection paths through the real parsers; retain image/member hashes and package ownership checks.

## 7. Wrong / correct

Wrong: accept a map by filename alone, infer a relative LOAD's directory from its storage location, or mark toolchain DLL internals covered by an import archive.

Correct: bind each actual target's build output and installed PE, retain its own map/selection evidence, and list the remaining prebuilt/resource/rights work separately.
