# Implementation
1. Add bounded rule contract, normalization and settings editor with bilingual copy.
2. Wire all TerminalPanel instances and highlighter live invalidation.
3. Verify validation, save/discard/settings roundtrip, literal matching and live decoration lifecycle; run types, full tests, build and source gates.
4. Update keyword spec, task evidence and existing Draft PR #62. No merge/release. Rollback via reverting this additive change; absent settings retain built-ins.

## Evidence
- KR01–KR04 implemented: shared bounded config, bilingual Appearance editor, save/discard/reset, normalizer and both SSH/Local prop paths; live decoration refresh without PTY/log mutation.
- Focused tests 17 PASS. Full Vitest 105 files, 844 PASS / 1 existing todo. Script tests 178 PASS / 3 existing skips / 0 failures.
- Final TypeScript noEmit PASS after removing keyword props accidentally added to RemoteFileEditor during initial wiring. Final Vite build PASS (1m 1s): TerminalPanel remains independent lazy 426.37 kB, SettingsView 107.54 kB; existing large-chunk warning remains.
- Semantic standalone compile/behaviour, search, startup lazy boundary, i18n, workspace snapshot, line budget, Trellis and diff whitespace gates PASS.
- CI #593 baseline seven executing jobs SUCCESS, Windows package skipped. New commit CI pending; no backend/IPC/dependency changes.
- No real renderer/native/theme acceptance performed; MANUAL_REQUIRED per user. Existing settings writer silently handles unavailable localStorage; no new persistence durability guarantee.
