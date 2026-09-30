# WF-01 slice 4C: menu and toolbar presentation checkpoint

Status: SOURCE DRAFT authorized for publication in a Draft PR. Not merge-ready; dependency and real UI verification remain pending.
Base: `2825de9b6555c12cce786c0a9556b0360dd16131` (main, merge of PR #16).
Parent: existing `09-23-wf-01-unified-session-entry`; no duplicate task was created.
Rules: WS-E01, WS-E02, WS-E03, WS-E08, WS-E09, WS-E10. A02 is not accepted.

## Previous checkpoint

PR #16 head `f864c7f2ceab29ac79eeb9994eaa12356700c821` had CI #128 `completed / success` before the maintainer-authorized merge. The merge commit above is confirmed on remote main. No PR #12 changes were made.

## Scope and implemented source

- Six Radix menubar groups: Session, View, Terminal, Tools, Settings, Help.
- Presentational metadata extends the existing shortcuts feature; binding resolution and availability continue to use the existing action modules. The original nine shortcut definitions and user binding semantics are untouched.
- A responsive toolbar partitions controls by the space remaining after the menubar, with full labels, icons, a reduced set, then overflow. Controls are neither duplicated nor discarded. Menu groups are retained.
- Existing NewSessionMenu props and callbacks are preserved. Its internals now use Radix, with shared choices for the titlebar, toolbar and Session submenu. This changes the existing titlebar menu implementation, so its regression tests must run before merge.
- Shared ActionMenuItem displays the actual binding through Keybinding and a visible disabled reason. RovingToolbar implements toolbar-local arrow/Home/End navigation, without registering application shortcuts.
- AppActionBar consumes an injected stable 4B executor, surfaces a safe localized failure/disabled message, and does not render raw error details or retry an action automatically.
- Split availability is explicit through an optional per-instance canSplit capability. Missing handlers fail closed. MultiExec remains deferred to WF-04C; Command Sender stays separate. X11 says capability integration is unavailable, not that a platform or X server was tested and found absent.
- New English/zh-CN catalogs contain 51 matching keys and are merged by the existing i18n kernel. Styling uses existing global tokens and shared portal classes.

AppActionBar is NOT mounted in WorkspaceShell. NewSession callbacks still use the existing callback contract, with real business/executor integration reserved for 4D. There is no claim that all production UI entry points now dispatch through the unified executor.

## Actual verification

- Strict TypeScript 5.8.3 / ES2020 checking passed for the pure production module graph (actionPresentation and actionExecutor entry points). This does not type-check React components.
- Transpile/syntax checking passed for 18 TS/TSX files in this partial snapshot. Cross-module React/Radix type checking remains unrun.
- Twelve new pure tests and the existing thirty 4B tests passed through the real Node runner: 42 passed, 0 failed, 0 skipped.
- For that offline run, a temporary TypeScript AST adapter replaced Vitest registration with node:test and toBe/toStrictEqual with strictEqual/deepStrictEqual from Node. There are 114 assertion sites. The test inputs, expected values and production logic were unchanged. This is not a standard Vitest run.
- The first offline adapter run omitted the zh-CN JSON copy. The harness was corrected; the failed-run log is retained separately. No production assertion was relaxed to fix it.
- Thirteen React/Radix interaction tests are authored, but NOT EXECUTED. They cover keyboard menus, Escape focus, toolbar navigation, overflow, actual/cleared bindings, disabled explanations, Command Sender, shared profile choices, stale target rejection, safe failures, locale updates, and observer cleanup.
- PostCSS parsing, matching locale key sets, UTF-8/NUL/whitespace checks, baseline blob hashes for modified files, and patch reconstruction were checked. No light/dark/system-dark visual validation was performed.
- Pure tests were written before their production implementation; the pre-implementation file-presence log is NOT a red runtime test result. No executed TDD red phase is claimed.

## Remaining blockers before merge

The approved Radix imports are used by this draft, but package.json and pnpm-lock.yaml have not been updated. The container cannot reach GitHub/npm directly and has no full project checkout, pnpm, React, Radix, Vitest or jsdom installation. Do not apply this patch alone and represent it as a buildable, frozen-lockfile-ready change.

In the maintainer worktree, inspect the preserved dependency stash by description and contents (not a fixed index), then apply it without dropping it until verified. If that stash cannot be used, generate the manifest and lockfile with the real package manager for the already approved ranges:

```sh
pnpm add '@radix-ui/react-dropdown-menu@^2.1.24' '@radix-ui/react-menubar@^1.1.24'
pnpm install --frozen-lockfile
pnpm run check
pnpm exec vitest run src/features/shortcuts/actionPresentation.test.ts src/features/shortcuts/actionRegistry.test.ts src/features/layout/AppActionBar.test.tsx src/features/layout/AppTitlebar.test.tsx
pnpm test
pnpm run test:scripts
pnpm run build
node scripts/check-startup-module-boundary-source.mjs
pnpm run check:line-budget
pnpm run check:licenses
```

Then verify the actual menu portals in light, explicit dark and system-dark themes, keyboard traversal and focus restoration, and narrow window behavior. Resolve real test/type/build findings before any claim that 4C is complete. Do not manufacture lock integrity values or increase the line budget.

## Process and exclusions

This is a partial source snapshot, not the user's worktree. No Trellis CLI activation, stash restore/drop, local main synchronization or user-machine modification is claimed. Progress is recorded in this existing task directory only. The optional local development connector was suggested but is not connected.

At the original offline checkpoint no 4C commit, push, remote branch or PR had been created. The maintainer has now explicitly authorized publishing this source checkpoint to a separate branch and Draft PR; this is not approval to merge it. WorkspaceShell, the close confirmation chain, original shortcut definitions, Files location, language settings, line budgets and license policy are unchanged. 4D and A02 remain pending.
