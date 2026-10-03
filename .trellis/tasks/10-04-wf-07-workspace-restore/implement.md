# WF-07 Implementation

## 07A snapshot store + planner
- [ ] Add local-only `workspace_snapshots` SQLite table and schema version.
- [ ] Add current/backup atomic rotation.
- [ ] Add Tauri load/save/clear commands.
- [ ] Reject sensitive snapshot keys and oversized payloads at Rust boundary.
- [ ] Add strict V1 decoder and backup fallback.
- [ ] Add pure restore planner with per-item failure isolation.
- [ ] Assert MultiExec always restores off.
- [ ] Add WF-07 source gate and CI coverage.

## 07B shell persistence
- [ ] Wire existing `toSnapshot()` into WorkspaceShell.
- [ ] Persist stable non-sensitive state with debounce.
- [ ] Restore order, panes, active item, Files state and sidebar before reconnect.
- [ ] Preserve snapshot on partial restore failure.

## 07C reconnect / A14
- [ ] Apply explicit reconnect settings.
- [ ] Saved SSH reconnect uses normal Host Key / credential path.
- [ ] Local/WSL restore uses existing providers.
- [ ] Missing/deleted profile becomes retryable failure without blocking siblings.
- [ ] MultiExec remains off.
- [ ] Real restart A14 evidence recorded.

Do not modify `scripts/line-budget.json`.
