# WF-07 Workspace Restore

> Parent: `.trellis/tasks/09-23-nexaterm-workflow-mainline`
> Stacked baseline: WF-06C `8bac2cb1172a210375a0db58648502695cc86134`
> Governing rules: WS-R01 / WS-R02; acceptance A14.

## Goal

Restart NexaTerm and recover the recognizable workspace shell before optionally reconnecting sessions. One failed or deleted target must not block the rest of the workspace.

The persisted snapshot is local machine state, not sync state. It contains only the WS-R01 whitelist:
- snapshot version;
- saved profile or non-sensitive temporary target reference;
- logical instance id and order;
- split pane tree and ratios;
- active item;
- Files last directory and follow state;
- sidebar state.

It must never persist runtime session ids, passwords, passphrases, private-key material, runtime credentials, X11 cookies, or active MultiExec/broadcast state.

## A14

Restart a multi-session split workspace with one target made invalid.

Pass conditions:
- layout and surviving items restore;
- failure of one item does not block the others;
- failed item remains identifiable and retryable;
- MultiExec is off after restore;
- reconnect only occurs under explicit settings;
- Host Key checks are not bypassed.

## Scope split

### 07A snapshot store + restore planner
- local-only SQLite snapshot table, excluded from WebDAV sync;
- current/backup atomic rotation;
- backend secret-key rejection and payload limit;
- strict v1 decoder with backup fallback;
- restore planner that isolates missing profiles/temporary targets and always resets MultiExec.

### 07B shell persistence + layout-first restore
- project current runtime state through existing `toSnapshot()`;
- debounce save after stable state;
- on startup load/decode and restore shell/order/panes/Files/sidebar first;
- no connection is required for layout restoration.

### 07C controlled reconnect + A14
- reconnect saved SSH/Local/WSL according to existing explicit settings;
- RDP/VNC follow their supported policy without silently starting unsupported runners;
- missing profile / stale temporary target / auth failure become per-item retry states;
- real restart acceptance evidence.

## WS-R03 boundary

Unsaved remote editor contents are not restored in WF-07 v1. Existing close-time unsaved confirmation remains authoritative; snapshot may restore file references only if already represented by the current contract.
