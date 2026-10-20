# Windows XKB runtime evidence (X0)

## 1. Scope

Extend the private UCRT64 development recipe with fixed official xkbcomp and xkeyboard-config. This supplies keyboard compilation evidence; distribution, bundled capability and desktop interoperability remain false. The existing Windows build/source contracts still apply.

## 2. Entry points

The existing `xserver_windows_build.py` command builds the two additional manifest components. `xserver_windows_xkb.runtime_inventory(prefix, source, build, component, owners)` binds installed keyboard data to actual inputs. `xkb_probe(prefix, builds, work, report, run)` builds an authored target rules probe and executes the actual private xkbcomp. No CLI data root or executable override exists.

## 3. Contracts

- Verify complete archive/signature/certificate bytes through the existing shared verifier before extraction. Keep xkbcomp's legacy signature and generated Bison parser exception as explicit review subjects.
- Extraction rejects links by default. Only eight pinned xkeyboard-config source symlinks may be materialized as ordinary files: require an exact canonical path, same-directory basename target, archive symlink type/target, regular target identity, size/hash and exact alias set. No link is created; chains, missing targets, unlisted links, duplicates and budget overruns fail. Report source alias identities separately from original regular archive bytes.
- Use the versioned `share/xkeyboard-config-2` data root directly. Remove only the exact upstream legacy pkg-config/X11 install-symlink blocks by hashed source adaptations; do not require elevated symlink creation or silently use installed system data. Keep compat rules and disable optional NLS for this development profile.
- Preserve raw installed file sizes/hashes and owner. Require canonical regular data files in all six XKB categories, each byte-identical to its fixed source or its actual build output. Bind generated rules/compat symbols to pinned generator inputs and independent normalized-LF reference hashes; normalization does not change installed bytes or replace their raw hashes. Include the original COPYING identity; per-file approval remains false.
- Compile and run the authored target probe against the actual private libxkbfile/X11. Resolve base and evdev rules for pc105 US/DE, require all five component names, then execute private xkbcomp with a standalone `-I` followed by only the private root. Compile actual XKM, round-trip through the same native compiler, and verify both AD06 and AB01 Y/Z pairs. Empty data roots and missing rules must return the precise expected nonzero exit, never a crash/timeout or unrelated error.
- Keep XKM input in binary mode, retaining existing text mode for XKB source. The fixed upstream reader otherwise opens both as text, while libxkbfile uses binary byte offsets/fread. Pin the exact one-occurrence source adaptation; each actual round-trip fixture must contain Ctrl-Z or CRLF bytes and report their counts so the Windows translation boundary is exercised.
- Load the real Windows/Xlib declarations before private TypeString and ERROR macros in listing.c, then restore the compiler diagnostic name. Preserve native file enumeration and error calls. An early target SDK probe requires the old order to fail with a relevant compiler diagnostic and no object, followed by a successful compile/run of the correct order and its actual diagnostic callback. Compiler warning policy is unchanged.
- Check both XWin.exe and xkbcomp.exe recursive normal/delay PE imports with actual provider/owner evidence. Keep their roots explicit. Observed C dependencies include xkbcomp; xkeyboard-config is explicitly runtime-data-only. The existing link-map/member scope remains XWin only; utility/DLL internals are not inferred from that map.
- Pin actual configured server data/bin directories and retain fresh failure stage/component plus completed evidence. Native keyboard success never enables distributionApproved, bundled or desktopVerified. CI uploads JSON only.

## 4. Error matrix

| Condition | Result |
| --- | --- |
| Fixed sources, native keymaps and all provenance checks pass | REVIEW-REQUIRED; adoption flags false |
| Alias type/name/target/bytes differ or arbitrary link appears | FAIL before source execution |
| Installed data is missing, unowned, linked or changed | FAIL |
| Generator reference differs, rules resolution or round-trip fails | FAIL |
| Empty-root compile succeeds or negative exits unexpectedly | FAIL |
| Native desktop/installer absent | Explicit false; no inference |

## 5. Good / base / bad

Good: resolve both rulesets from private data and verify actual US/DE XKM semantics. Base: identical normalized generated references with separately recorded native raw hashes. Bad: invoke a PATH compiler, let default include roots supply missing files, or label every data file MIT by the package name.

## 6. Tests

Exercise exact source aliases plus unknown/escaping/chained/changed/missing targets; actual temporary data inventories, ownership/content failures and keymap semantic counterexamples. Real Windows CI runs the target rules/compiler probes, including missing rules and empty-root rejection. Linux tests do not stand in for native execution.

## 7. Wrong / correct

Wrong: allow all archive symlinks, depend on Windows developer mode, or treat an XKM file's mere existence as a functional keyboard result.

Correct: materialize only pinned regular aliases, record exact installed/generated inputs, reset include search, and round-trip native output to verify specific key behavior while keeping desktop approval false.
