# Implementation
Extend matcher and scheme palette, enforce decoration budgets, add real xterm buffer/decorations tests, run semantic gate/types/full tests/build, update existing Draft PR #62.

## Evidence
- Added fixed severity words and terminal-scheme colours, Unicode-aware boundaries, ANSI preservation and viewport-priority resource caps. No settings/UI/IPC/persistence/PTY/logging changes.
- Full Vitest: 103 files, 836 PASS / 1 existing todo. Final targeted suite: 10 PASS, including an additional physical-cell scan-boundary regression after that full run.
- TypeScript noEmit PASS; final Vite build exited 0; semantic standalone compile/behaviour gate, terminal search, startup boundary, line budget, Trellis and diff whitespace gates PASS.
- Five tests exercise actual xterm buffers/decorations without opening a renderer. These verify wide cells, ANSI attributes, alternate buffers, palette recreation, caps, viewport eviction and physical-cell boundary context; no GUI claim.
- Baseline c4e3102 CI #592 seven executing jobs SUCCESS, package Windows skipped. New CI follows commit. GUI/theme/real protocol acceptance remains MANUAL_REQUIRED by user preference. Custom saved keyword rules remain unimplemented; this task is only built-in severity.
