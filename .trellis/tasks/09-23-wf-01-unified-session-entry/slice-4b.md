# WF-01 slice 4B: context, targets and unified execution

Status: implementation saved; focused offline checks passed; project CI and integration pending.
Base: `5dc391927cbe501f918fd952982fdc3706def2bd` (`main`, merge of PR #15).
Parent: existing `09-23-wf-01-unified-session-entry`; no duplicate task created.
Rules: WS-M03, WS-E01, WS-E10. A02 is not fully accepted.

## Scope and execution order

User flow: derive an action target from the active workspace item/pane, or use an explicit
context-menu target; explain unavailable actions and dispatch through one injected handler.
Closing one instance, closing a pane and closing a whole split group must remain distinct.

- [x] Confirm PR #15 head `c493e25` has successful CI #126; merge with expected-head protection.
- [x] Refresh main and pin the resulting merge commit as this checkpoint's baseline.
- [x] Write target/policy/execution tests before production modules.
- [x] Add transient structural context views, compatible with existing logical instance/item IDs.
- [x] Resolve explicit targets without fallback to the active item, split host or a sibling.
- [x] Extend canonical shortcut definitions with execution policies, not a parallel binding registry.
- [x] Inject business handlers and re-read one current snapshot at invocation time.
- [x] Guard absent handlers, local-only AI, deferred MultiExec and repeated in-flight actions.
- [x] Run focused strict TypeScript checks and offline behaviour checks.
- [ ] Run the repository Vitest tests and all standard project gates in a full checkout.
- [ ] Submit 4B for review/CI after authorization. This checkpoint has no remote commit or PR yet.

## Contract

`actionContext.ts` takes read-only, transient views of workspace items, all live instances
(including hidden split members), panes, current selection and instance-specific capabilities.
These views do not own or persist session state. IDs are opaque logical IDs; no credentials,
raw commands or backend runtime handles are accepted or emitted as action targets.

`actionRegistry.ts` uses the existing `getShortcutAction` and `resolveShortcutBindingById`.
All nine existing shortcut definitions and binding defaults are unchanged. The additional
entry-only IDs (`workspace.closeItem`, `terminal.closePane`, `terminal.closeSplitGroup`,
`terminal.multiExec`) do not add shortcut preference keys. MultiExec remains disabled with
`deferred-wf04c`; Command Sender retains its original identity and independent availability.

Stable disabled-reason codes are not UI strings. Mapping them to en/zh-CN labels/tooltips,
along with menu groups/icons/toolbar priority, belongs to 4C. AI send remains local-only
regardless of the entry source or customized shortcut binding.

`actionExecutor.ts` exposes `resolve(request)` and `run(request)` over a caller-supplied
`readSnapshot()` callback. Keep one executor per workspace; the callback must read the latest
committed context, bindings and handlers. Each invocation resolves from one fresh snapshot.
Missing or inherited handlers cannot enable an action. Pending execution blocks another call
to the same action ID until settlement. Failure is returned explicitly with no retry or logging;
the UI adapter must present the failure. `executed` means the injected handler completed,
not that a remote operation or user confirmation was accepted.

Close targets contain logical identities only. They do not invoke cleanup or bypass confirmation.
4D must inject the existing close-request controller and preserve its atomic confirmation chain;
it must not call raw session cleanup directly from these entry points.

Shortcut-origin requests require event-derived focus context. Editable fields, menus and IME
composition are blocked by the new pure policy; terminal-search scope rules are preserved.
No DOM listeners, event matching or current `useShortcutManager` code change in this checkpoint.
The native focus-to-context adapter and React/window integration remain 4D, not verified here.

## Evidence

- Source baseline bytes checked against GitHub blob SHAs at the pinned merge commit.
- Test-first red: new test could not load the not-yet-created 4B module.
- Production source strict TypeScript 5.8.3 / ES2020 check: passed.
- Offline Node test run: 30 passed, 0 failed, 0 skipped, across three suites.
- 84 assertion sites retained in an AST-adapted temporary test copy: Vitest registration becomes
  real `node:test`; `toBe` becomes `node:assert/strict.strictEqual`, `toStrictEqual` becomes
  `deepStrictEqual`. Inputs and expected values are unchanged; no fake Vitest/React module exists.
- The adapted test copy also passes strict type checking against the actual installed Node types.
- Repository test source uses only Vitest imports; it does not import Node assertion types.
- Standard Vitest, full-project check/build, complete gates and real-window GUI were NOT run.

The container has no complete checkout or project dependencies; the attempted clone failed
DNS resolution. This is a connector-verified partial source snapshot, not the maintainer's
worktree. No local stash or `.DS_Store` was touched. Trellis CLI/session activation is not claimed;
this file persists the checkpoint within the existing task path. No parent task is completed.

## Full-checkout verification

```sh
pnpm exec vitest run src/features/shortcuts/actionRegistry.test.ts src/features/shortcuts/shortcutRegistry.test.ts
pnpm run check
node scripts/check-shortcuts-source.mjs
pnpm test
pnpm run build
node scripts/check-startup-module-boundary-source.mjs
pnpm run check:line-budget
pnpm run check:licenses
```

## Deferred / untouched

No changes to WorkspaceShell, existing shortcuts/manager, titlebar, menus, toolbar, close
confirmation, dependencies, lockfiles, budgets, license policy, Files or language settings.
No 4C/4D implementation, no PR #12 mutation, and no full slice-4/WF-01/A02 acceptance.
