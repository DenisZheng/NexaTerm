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
- [x] Record real Windows Tauri exit/relaunch acceptance using `A14_EVIDENCE.md` (2026-10-04, maintainer confirmed both reconnect-on/off rounds; A14-01–15 PASS).

Do not modify `scripts/line-budget.json`.

## 2026-10-04 审查修复

- [x] 补正式 lifecycle hooks 回归：就绪波动、读取中重渲染、500ms 内容 debounce、顺序保存。
- [x] 将 Tauri/DOM 副作用注入 workspace hook，修复读取取消后不能恢复与保存被无关 render 推迟。
- [x] 补 SSH 同毫秒并发输出隔离回归，使用每次 attempt 的唯一标识。
- [x] 修正 Files 活动目录持久化和重启导航，补组件回归。
- [x] 提供 A14 专用坏项的离线构造/恢复步骤及脚本测试，保留正常 profile 删除语义。
- [x] 完整前端 518 PASS / 1 TODO，脚本 96 PASS / 3 既有跳过；Rust 快照 3 PASS；类型、构建、启动边界和行数门禁通过，规范见 `.trellis/spec/frontend/workspace-restore.md`。

维护者已在修复提交 `f67154c` 上完成真实 Windows A14 两轮验收并确认通过；人工结果与自动化证据分别记录于 `A14_EVIDENCE.md`。
