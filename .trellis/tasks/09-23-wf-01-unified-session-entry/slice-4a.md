# WF-01 slice 4A: action definitions and compatibility baseline

Status: implementation saved; offline verification passed; standard project verification pending.
Base: `7518ba3f173c5760a3c921b1e82202a66aeb95e4` on `DenisZheng/NexaTerm/main`.
Parent task: `09-23-wf-01-unified-session-entry` (existing task, no duplicate task created).
Rules: WS-E10 (extend existing shortcuts), WS-E01 (foundation only).

## Delivered checkpoint

- [x] Extend the existing registry with explicit `global` / `local` dispatch ownership.
- [x] Keep the public `ShortcutAction` shape compatible; require ownership only for registered definitions.
- [x] Preserve all nine IDs, order, defaults, labels, descriptions, scopes and categories.
- [x] Keep `ai.sendMessage` available to settings and the local AI consumer, but exclude it from global candidates even when its binding is customized.
- [x] Derive global candidates from `shortcutActions` and use that projection in `useShortcutManager`.
- [x] Preserve the listener, focus filters, enable checks, event cancellation and cleanup unchanged.
- [x] Add 15 co-located compatibility/ownership test cases.
- [ ] Run the committed Vitest test in an installed project environment.
- [ ] Run the standard project gates below before declaring this checkpoint fully accepted.

There is no parallel action registry. `dispatch` selects the consumer, whereas existing `scope` still describes the keyboard-context policy. Null, own undefined, empty-string, inherited and unknown preference-key handling preserve the existing resolver behavior. Command Sender retains its original identity.

## Evidence and limits

The execution container had no prior checkout, stash or installed project dependencies. Direct GitHub clone and npm registry access failed DNS resolution. Three required source files were retrieved through the GitHub connector at the pinned commit and their bytes checked against Git blob SHAs. This is a partial source snapshot, not the maintainer's local worktree.

TDD was executed with TypeScript 5.8.3 and the real Node 22.16.0 test runner. A temporary test copy changes only `from "vitest"` to `from "node:test"`; assertions use real `node:assert/strict` and the business code is identical. No fake Vitest or React module is used. The repository test retains its Vitest registration import.

- Before implementation: 9 compatibility cases passed; 6 ownership cases failed because the new metadata/projection was absent.
- After implementation: 15 passed, 0 failed, 0 skipped, 0 todo.
- Targeted compiler check passed with ES2020, DOM libraries, strictness, isolated modules, unused-symbol and fallthrough checks. This does not type-check the full React application.
- All complete legacy action records, categories and defaults compare equal to the baseline after excluding only the new `dispatch` property.
- The manager's listener and target-filtering code are byte-for-byte unchanged; no React/DOM integration test was executed.
- The compiled registry has no runtime imports.
- Whitespace and patch application checks are recorded in the accompanying evidence bundle.

No Trellis CLI activation is claimed: this partial snapshot has no task runtime or task CLI. This file records progress inside the existing task. No parent completion, slice 4 completion or A02 GUI acceptance is asserted.

## Required checks in the complete project

```sh
pnpm exec vitest run src/features/shortcuts/shortcutRegistry.test.ts
pnpm run check
node scripts/check-shortcuts-source.mjs
pnpm test
pnpm run build
node scripts/check-startup-module-boundary-source.mjs
pnpm run check:line-budget
pnpm run check:licenses
```

## Explicitly untouched / deferred

No changes to WorkspaceShell, titlebar, menus, toolbar, close confirmation, dependency manifests, lockfile, line budget, license policy, Files layout or language settings. No stash restore/drop, remote commit, push or PR mutation. The original local stash and `.DS_Store` were not accessible and were not handled.

Menu metadata and context/target/availability/execution integration remain later checkpoints. Slice 4B has not started. Unified MultiExec remains WF-04C; real-window A02 smoke remains outstanding.
