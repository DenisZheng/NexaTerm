# WF-07 Implementation

## 07A snapshot store + planner
- [x] Add local-only `workspace_snapshots` SQLite table and schema version.
- [x] Add current/backup atomic rotation.
- [x] Add Tauri load/save/clear commands.
- [x] Reject sensitive snapshot keys and oversized payloads at Rust boundary.
- [x] Add strict V1 decoder and backup fallback.
- [x] Add pure restore planner with per-item failure isolation.
- [x] Assert MultiExec always restores off.
- [x] Add WF-07 source gate and CI coverage.

## 07B shell persistence
- [x] Wire existing `toSnapshot()` into WorkspaceShell.
- [x] Persist stable non-sensitive state with debounce.
- [x] Restore order, panes, active item, Files state and sidebar before reconnect.
- [x] Preserve snapshot on partial restore failure.

## 07C reconnect / A14
- [x] Apply explicit reconnect settings.
- [x] Saved SSH reconnect uses normal Host Key / credential path.
- [x] Local/WSL restore uses existing providers.
- [x] Missing/deleted profile becomes retryable failure without blocking siblings.
- [x] MultiExec remains off.
- [x] Automated A14 restart evidence covers multi-session + Split + Local/WSL + deleted profile + explicit reconnect on/off.
- [x] SQLite repository close/reopen test proves snapshot persistence across the process-storage boundary.
- [ ] Record one real Windows Tauri exit/relaunch run using `A14_EVIDENCE.md`.

Do not modify `scripts/line-budget.json`.
