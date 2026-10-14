# Implementation and evidence

## Ordered work
1. Inventory SearchAddon, search state/navigation, cleanup and theme handling; confirm approved WF-09-05 and applicable WS rules.
2. Register and start this child task, implement a light workspace search owner and typed terminal search controller.
3. Reuse/extract the current bar, add whole-word control, update both SSH and Local/WSL render paths and existing source contracts.
4. Verify actual addon behavior for same-query option changes, wrapped/Unicode/literal queries, threshold, live output and cleanup; verify state/action isolation and UI keyboard/composition behavior.
5. Run type check, Vitest, scripts, build, startup/terminal/i18n/snapshot/fixed-target/line-budget source checks and diff checks. Update executable frontend specs.
6. Upload verified blobs/tree through GitHub, commit and create a stacked Draft PR against `feat/wf09-04-macros`; record CI and limitations.

## Validation commands
`node node_modules/typescript/bin/tsc --noEmit`
`node node_modules/vitest/vitest.mjs run`
`node --test scripts/*.test.mjs`
`NODE_OPTIONS=--max-old-space-size=4096 node node_modules/vite/bin/vite.js build`
`node scripts/check-startup-module-boundary-source.mjs`
`node scripts/check-terminal-search-source.mjs`
`node scripts/check-line-budget.mjs`
`git diff --check`

## Evidence status
Implementation complete; review pending.

- Type check: PASS, Node 24.19.0 / installed TypeScript 5.8.3.
- Full Vitest: 101 files, 818 passed / 1 existing todo. This includes 26 new checks (11 controller, 6 bar, 5 owner, 3 palette, 1 unified action policy); 7 controller cases execute the installed real xterm buffer and SearchAddon with only the unopened renderer's selection surface supplied.
- Script tests: 181 total, 178 passed / 3 existing security-tool environment skips / 0 failures. Real secret scanning remains the GitHub Security evidence job.
- Production build: PASS, Vite 7.3.5; TerminalPanel stays in its own 422.65 kB lazy chunk; WorkspaceShell 606.61 kB. Existing >500 kB chunk warning remains.
- Sixteen relevant source gates: PASS after repairing one stale Ctrl+V Settings title assertion. The identical Ctrl+V failure was reproduced on untouched d9b82f9; SettingsView already uses the i18n key. The gate now checks that key and its actual checked/update binding; all native paste checks remain. No Settings/PTY behavior changed.
- Covered gates: startup, search, copy, paste, interactive PTY, terminal chrome, xterm CSS, Unicode11, i18n, workspace snapshot, WF07, fixed MultiExec, bounded split, Command Sender active instance, Sender MVP and line budgets. TerminalPanel reduced from 1462 to 1195 lines and WorkspaceShell from 13827 to 13752; no budget increased.
- Palette alias assertion was strengthened after full tests to use a non-fallback RGB color; its 3 focused tests passed again. No production code changed after the successful full run/build.

 No local Rust toolchain; no Rust code changed. GUI/protocol and three-theme acceptance: MANUAL_REQUIRED, explicitly batched later by the user. PR remains Draft; no merge/release/hosting changes.
