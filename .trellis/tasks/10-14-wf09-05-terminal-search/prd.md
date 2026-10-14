# WF-09-05A — Terminal whole-word search and highlight lifecycle

## User flow
The user opens search in an existing terminal, enters a literal query, chooses case or whole-word matching, navigates the results, and closes search without sending input to the session.

## Source and scope
- Approved WF-09-05 plan on `docs/wf09-feature-roadmap`, PR #53; parent is only `09-23-nexaterm-workflow-mainline`.
- Baseline: PR #61, `d9b82f9e2dc72d3e7e830b0bce55b5a4109a5433`; CI #589 passed all seven executing jobs, including three-platform Rust check/test.
- Product rules: WS-E01, WS-M02, WS-X02, WS-R01; preserve A09/A10 fixed-target input and A14 snapshot exclusions.
- This slice extends the existing terminal search bar with whole-word matching and repairs option/highlight refresh and result/close lifecycle. Queries remain literal, transient, and scoped by runtime tab ID.
- Session log capture and additional saved keyword rules are later WF-09-05 slices. No protocol, IPC, persistence, dependency, or release-policy changes.

## Acceptance
- TS01: Case and whole-word modes update results and all-match highlights even when the query is unchanged; navigation uses the same modes.
- TS02: Search preserves query whitespace and literal punctuation. Empty queries clear highlights. Result reporting distinguishes zero, exact count, and the addon highlight threshold.
- TS03: Closing search cancels pending work and clears selection/highlights; reopening and switching tabs remain isolated. Closing a tab removes its query and mode state.
- TS04: Toolbar, menu/shortcut requests, Enter/Shift+Enter, and search buttons use the same session-local navigation. Composition Enter must not navigate; duplicate request IDs do not repeat navigation.
- TS05: Search never writes/pastes PTY input, transforms terminal output, logs queries, or stores queries in snapshots/history. Lifecycle disposal removes listeners and queued callbacks.
- TS06: Keep the current compact token-based bar, English/zh-CN parity, accessible pressed states, and lazy-loaded terminal boundary. Real light/dark/system and protocol smoke remain MANUAL_REQUIRED for the user's later unified acceptance.

## Authorization
The user's repeated “continue the next cut” authorizes implementing the approved plan and routine branch/Draft PR updates. The user explicitly deferred real-environment acceptance to a later batch; do not report automated tests as GUI/protocol acceptance.
