# Implementation
Add registry/worker and commands; wire output and close paths; add typed wrappers and compact controls; test stale callbacks, cancellation and bounded worker semantics; run frontend tests/build and CI Rust.

## Implemented
- Backend registry/worker, fixed 100 MiB files, 32 x 16 KiB queue, 16 living workers and 64 retained status entries. Create-only UTF-8 sink; no I/O or queue wait in terminal output path.
- SSH/Local live-session guard, capture UUID stop guard, all six explicit/reader close paths, bounded retained final state. Queue overflow and invalid/truncated UTF-8 are explicit terminal outcomes.
- Shared confirmation and native picker; compact bilingual token row, search positioned below it, late picker guards, backend remount attachment and bounded status polling. Serial/Telnet unsupported in both UI and backend.

## Validation
- Full Vitest: 102 files, 826 PASS / 1 pre-existing todo (before additional unsupported-protocol test). Final focused log suite: 9 PASS including that added test.
- Script tests: 181 total, 178 PASS / 3 existing environment skips / 0 FAIL.
- TypeScript noEmit PASS; final production build PASS, TerminalPanel remains lazy at 425.09 kB. Existing >500 kB chunk warning retained.
- i18n new-entry, terminal search, startup boundary, line-budget, workspace snapshot, Tauri capabilities and diff whitespace gates PASS; Trellis manifests PASS.
- Nine Rust tests added: eight worker/queue/UTF-8/identity tests plus missing live-instance guard. No local Rust toolchain; execution pending three-platform CI. Base sink's 13 tests passed CI #591 at a046b8c.
- GUI/native picker, SSH/Local real recording, light/dark/system and shutdown behavior remain MANUAL_REQUIRED for unified later acceptance. No merge/release.
