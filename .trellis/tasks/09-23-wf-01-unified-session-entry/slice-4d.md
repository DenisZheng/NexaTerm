# WF-01 slice 4D: workspace wiring and regression checkpoint

Status: 4D-1 SUBMITTED ON STACKED BRANCH. Standard project CI pending at publication time.
Base for development: PR #17 / WF-01 4C head after automated CI fixes and manual-smoke documentation (`73da0b0`).
4D-1 code commit: `1e575abe0d0c076a3e18a44a27f074b6cf29d127`.

## Acceptance policy

The real-window light/dark/system-dark, narrow-window, focus restoration and native material checks are recorded in `slice-4c.md` as manual smoke backlog. They do not block 4D work that is independent of a visual product decision, but they still block the final 4C/A02 acceptance statement.

## 4D-1 submitted

- Add pure `buildWorkspaceActionContext` projection from the live shell collections.
- Keep split members in `instances` even when the top-level projection folds them into one `split` item.
- Represent empty panes explicitly with `instanceId: null`; never fall back to the group host or a sibling.
- Add `createWorkspaceActionHandlers`: existing Quick Open, Settings, left/right pane toggle, Command Sender, instance close, new terminal, terminal search and split actions are injected without importing `WorkspaceShell`.
- Terminal-only adapters fail closed for RDP/VNC; logical IDs are converted back to raw tab/session IDs without losing embedded `:` characters.
- Add `useWorkspaceActionRuntime`: one stable 4B executor reads the newest shell-derived context, bindings and handlers.
- Wire the runtime into `WorkspaceShell` and mount `AppActionBar` directly under `AppTitlebar`.
- `terminal.closeTab` from the new action entry goes through the existing `closeRequestController` request/plan/confirm chain instead of directly closing sessions.
- New-terminal/search/split handlers act on the executor-resolved terminal instance, including a focused split member, rather than silently falling back to a sibling/host.
- Extend terminal-search navigation with an optional explicit tab id; legacy shortcut calls keep the previous default active-tab behavior.
- Keep the legacy `useShortcutManager` path in place for 4D-1; shortcut/context-menu unification is deliberately deferred to 4D-2.
- Change only the main `.app-shell` grid to `36px 34px minmax(0, 1fr)`; the VNC runner remains two-row.

## Line-budget result

- Before: 13,857 lines.
- 4D-1 result: 13,842 lines.
- Budget: 13,860 lines.
- Net: -15 lines; no budget increase.

## Deferred to 4D-2

- Shortcut execution through the unified action executor.
- Context-menu execution through explicit action targets and real bindings.
- Removing hard-coded context-menu shortcut hints.
- Routing explicit pane/group close entry points through the existing atomic close controller.
- Tunnel right-panel wiring and related regression/source gates.
- Any manual-smoke visual finding from the 4C backlog.

## Automated evidence before submission

- Strict TypeScript 5.8.3 compile for the 4D-1 production bridge/handler/runtime graph: PASS.
- Context/handler behavior harness: 3/3 PASS.
- TS/TSX syntax transpile for all 4D-1 source/test files: PASS.
- Shell wiring contextual type-check: PASS.
- Full source transformation checks: actionbar mounted, stable runtime present, close entry uses `closeRequestController`, targeted search explicit, legacy shortcut manager retained, main grid gets a third row while VNC runner stays unchanged: PASS.
- Full project Vitest/build/CI must be taken from the stacked PR and is not pre-claimed here.
