# WF-01 slice 4C: menu and toolbar presentation checkpoint

Status: AUTOMATED CHECKS GREEN. Manual visual/window smoke remains pending; it does not block subsequent non-dependent development, but it blocks final 4C/A02 acceptance.
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

- CI #131 on head `0150aaeab088fb5d24415e119044eda5e7157ebf` completed successfully.
- `pnpm install --frozen-lockfile`, full TypeScript check, production build, script tests, Tauri capability/CSP checks, startup module boundary and line budget all passed.
- Standard Vitest: 24 files passed, 345 passed / 1 existing todo. The new `AppActionBar.test.tsx` passed 13/13; `AppTitlebar.test.tsx` passed 3/3.
- License compliance, Security evidence, Rust Windows/Linux/macOS and test-fixtures smoke all passed. The Windows package job was skipped by its existing PR trigger policy.
- The approved `@radix-ui/react-dropdown-menu@^2.1.24` and `@radix-ui/react-menubar@^1.1.24` dependencies plus matching pnpm lock records are committed on this branch.
- The earlier offline Node-adapter evidence remains historical only; real project CI is now the authoritative automated result.

## Manual smoke backlog (non-blocking for subsequent development)

The following checks require a real Tauri window / visual inspection and are recorded rather than used to stop unrelated engineering work:

- [ ] Light theme: menu portal surface, border, hover, disabled copy and shortcut hints are visually consistent.
- [ ] Explicit dark theme: the same portal/menu states remain readable and use the shared theme tokens.
- [ ] System-dark: body-ported Radix surfaces follow the system theme instead of remaining light.
- [ ] Narrow real window: all six menu groups remain visible while lower-priority toolbar actions fold into `...`; no overlap, clipping or fake horizontal scrollbar.
- [ ] Real keyboard/focus smoke: menu traversal and Escape focus restoration behave correctly in the Tauri window.
- [ ] Windows/macOS material smoke when available: actionbar/portal surfaces do not break the existing native material/chrome contract.

These items **do not block 4D or other work that does not depend on a visual acceptance decision**. They **do block declaring 4C/A02 finally accepted**. Any visual finding that changes product rules must be fixed before final acceptance; otherwise it may be handled as a focused follow-up without rolling back already-green automated work.

## Process and exclusions

This is a partial source snapshot, not the user's worktree. No Trellis CLI activation, stash restore/drop, local main synchronization or user-machine modification is claimed. Progress is recorded in this existing task directory only. The optional local development connector was suggested but is not connected.

At the original offline checkpoint no 4C commit, push, remote branch or PR had been created. The maintainer has now explicitly authorized publishing this source checkpoint to a separate branch and Draft PR; this is not approval to merge it. WorkspaceShell, the close confirmation chain, original shortcut definitions, Files location, language settings, line budgets and license policy are unchanged. 4D and A02 remain pending.
