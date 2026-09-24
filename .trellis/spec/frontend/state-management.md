# State Management

> How state is managed in this project.

---

## Overview

- No global store library. `zustand` is a declared dependency but is not used in `src/`; do not introduce it without a spec change.
- Workspace-level state lives in `src/features/workspace/<seam>/` as **pure reducers** consumed by WorkspaceShell through `useReducer`. Seams: `split` (terminal split layout), `multiExec` (synchronised input / multi-target commands), `sessionTabs` (active pointers, mode, per-connection memory, close/delete decisions, workspace item order and instance projection; the five session collections are still `useState` in the controller).
- Feature-local UI state (dialog open flags, form drafts) stays as `useState` inside the feature component.
- Server / backend state (connections, sessions, settings) is fetched through `src/shared/tauri/commands.ts` wrappers and cached in component state; there is no query cache layer.

---

## State Categories

| Category | Where | Example |
| --- | --- | --- |
| Workspace state (single owner, cross-feature) | `features/workspace/<seam>/reducer.ts` + `useReducer` in WorkspaceShell | split layout, sync targets |
| Feature-local UI state | `useState` in the owning component | connection dialog draft |
| Backend-owned data | Tauri commands via `shared/tauri/commands.ts` | connection list, settings |
| Window geometry | `shared/tauri/windowState.ts` | `mxterm.windowState.v1` |

`features/workspace/` holds ownership (reducer, actions, selectors, controller hook). `features/layout/` holds view components and orchestration. A file in `workspace/` never imports React components, Tauri APIs or the DOM (the controller hook may import React hooks only).

---

## Reducer conventions (`features/workspace/<seam>/`)

- `actions.ts`: `type <Seam>Action` discriminated union named `seam/verb` (`split/focusPane`, `multiExec/setLive`). Actions carry **intent** (ids, bindings, available key sets); the reducer computes the result from state. Do not compute a `nextLayout` in a closure and pass it in – that preserves stale-closure reads. A `set*` pass-through action is a transitional shim only and must be listed as such in its doc comment.
- `reducer.ts`: `<seam>Reducer(state, action)` and `initial<Seam>State`. Immutable updates; return the **same reference** when nothing changed; unknown actions return the input state.
- `selectors.ts`: pure derivations. A selector that returns a new object/array/Set is wrapped in `useMemo` at the call site; xterm panes re-render on identity changes.
- `use<Seam>Controller.ts`: the only place that owns `useReducer` for the seam and the residual effects that turn external inputs (tab lists, connection status) into normalisation actions. Cross-seam side effects are passed in as callbacks and read through a ref so effect dependency arrays stay stable.
- **Follow-up marker for cross-seam activation** (`split.collapsedTo`, `sessionTabs.followUp`): when a reducer decision must trigger work that lives outside the seam (activate another session, mount a pane), the reducer writes a marker field instead of calling anything. The controller consumes it in one effect: read the marker, dispatch the `…/consume` / `…/handled` action, then call the callback ref. Never call a callback or another setter inside a reducer or a `useState` updater. The extra effect tick is an accepted, documented difference.
- **Close / delete paths** (WF-00B): external cleanup (stop warmup capture, close runtime sessions, invalidate caches) runs first; the next collection value is computed from the `*Ref.current` mirror and written with a value-style setter (`setTabs(next)`, not `setTabs((tabs) => …)`); then exactly one intent action carries the removed entities plus a `CloseSnapshot` of the remaining collections, and the reducer decides the next active item through the pure functions in `sessionTabs/closeDecision.ts`. `scripts/check-workspace-empty-home-source.mjs` guards this shape.
- **Workspace item projection** (WF-01, `sessionTabs/instances.ts`): top-level items (home, SSH / local / RDP / VNC instances, the split group) are projected from the four instance collections by `selectWorkspaceItems`; there is no second copy of session data (WS-M05). Item ids are `kind:rawId` via `instanceItemId`, the same format as `terminalPaneBindingKey`, so split members map directly. `SessionPointerState.order` only sorts: `tabs/itemOpened` appends idempotently, every close/remove action prunes it against its post-removal `CloseSnapshot`, and the selector appends instances missing from the table in ssh → local → rdp → vnc collection order. The per-owner `ordinal` (`nextOrdinal`: max + 1, 0-based, fixed at creation) is a title number, never a sort key. `itemTitle` returns a structured descriptor, not a formatted string; the UI formats it through i18n (WS-E09).
- Tests: `reducer.test.ts` (pure, node environment) for every action plus "unknown action returns input" and "no-op returns same reference"; `use<Seam>Controller.test.tsx` (`// @vitest-environment jsdom`, `renderHook`) as characterization of observable behaviour. Characterization suites are written **before** internals change and must pass unchanged afterwards. Pure decision modules (`closeDecision.test.ts`) use scenario tables: one `it` per branch of the original code, with the fallback order asserted explicitly.

---

## When to Use Global State

Promote state into a `features/workspace/` seam when at least one holds:

- two or more features read or write it (split layout is read by the terminal panel, the tab bar and the command sender);
- it must be serialisable for workspace restore (Task 05);
- its transitions require multiple `useState` setters to be called together to stay consistent.

Otherwise keep it local.

---

## Server State

Backend data is authoritative. Components call the typed wrappers in `shared/tauri/commands.ts`, keep the response in local state, and re-fetch on the relevant Tauri event. No optimistic writes; a failed command surfaces its `AppError.code` to the user and leaves local state untouched.

---

## Common Mistakes

- Mirroring the same fact in two `useState` hooks and syncing them in an effect (the pre-Task-04 WorkspaceShell had six "active" pointers). Derive with a selector instead.
- Calling a setter inside another setter's updater function (impure updater). Express the combined transition as one reducer action; if the transition needs cross-seam work, return a follow-up marker (see above).
- Passing an unmemoised selector result (new `Set`/array each render) as a prop to `TerminalPanel` / `TerminalSplitLayout`.
- Hiding duplicate events or bad data with list de-duplication in the reducer. Fix the producer.
