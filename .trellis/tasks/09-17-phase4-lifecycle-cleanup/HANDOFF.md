# Phase 4 生命周期清理核查 · 交接

> 更新时间：2026-09-17 ｜ 代码提交 `bfc2f2a86a35e85bf73d6806b929aea4864aba94` ｜ CI run `35185323819` 全绿

## 已完成的第一切片

- `src-tauri/src/vnc.rs`：`run_bridge` 使用 `tokio::task::JoinSet` 持有每个 WebSocket relay task。bridge owner 自然结束时 abort/join children；owner 被取消时不再留下裸 detached relay task。
- `src-tauri/src/tunnels.rs`：`run_tunnel_accept_loop` 使用 `JoinSet` 持有每个 local/dynamic client forwarding task。accept loop 结束时 abort/join children；显式 stop 仍执行既有 remote-forward cancellation 和 SSH session close。
- VNC manager 增加重复 `vnc_close_session` 回归，确认 session registry removal 只发生一次。
- 没有修改 command schema、VNC runtime payload、SSH/Vault 协议或敏感日志。

## 远端验证

- Run：<https://github.com/DenisZheng/NexaTerm/actions/runs/35185323819>，结论 `success`。
- Frontend checks：success。
- Rust Linux：298 passed、0 failed、0 ignored。
- Rust macOS：298 passed、0 failed、0 ignored。
- Rust Windows：302 passed、0 failed、0 ignored。
- Security evidence：success；Windows package job 按 push 条件 skipped。

## 尚未完成 / 环境边界

- 真实 VNC WebSocket client/target、SSH forward server 和 Tauri runner window close 尚未在 GUI/外部服务环境验证，记为 `ENVIRONMENT-BLOCKED`。
- Docker log stream 的 stop/natural-finish race、MCP sidecar health supervisor shutdown、PTY/local/telnet/serial app-close、VNC runner host 前端通知链和 RDP native host 仍待源码核查/必要修复。
- 全量 `cargo fmt --check` 仍受父分支既有格式漂移阻塞，已单独记录为 Todo #9；本切片修改 hunks 已按 rustfmt 对齐。
- 子任务保持 `in_progress`，不要据此归档父 Task 01。
