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

## 第二切片（2026-09-18，待人工审核 / 待 CI）

- `src-tauri/src/lib.rs`：`App::run` 改为 `build().run(callback)`，在 `RunEvent::Exit` 调用 `McpRemoteServiceManager::shutdown()`。根因：Tauri 2 的 `run` 以 `process::exit` 结束，托管状态不 Drop，sidecar 会残留。
- `src-tauri/src/mcp.rs`：新增 `shutdown()`（幂等）与 `shutting_down` 门控；`reconcile`/supervisor 在收尾后不再 spawn。新增测试 `shutdown_is_idempotent_and_blocks_later_start`。
- `src-tauri/src/terminal/local.rs`：`close()` 在 kill 后释放 master，修复 Windows ConPTY 读线程永久阻塞泄漏；新增 Windows 测试 `local_session_close_releases_reader`。
- Docker log stream、SSH/Telnet/Serial reader、VNC runner host 通知链源码核查通过，未改代码，结论见 design.md §7。
- 本机无 Rust 工具链，`cargo check/test/fmt` 未在本地运行；须以 CI 三平台结果为准。Windows 新测试依赖 CI Windows job。

## 尚未完成 / 环境边界

- 真实 VNC WebSocket client/target、SSH forward server、Tauri runner window close 和应用退出时的 sidecar 收尾尚未在 GUI/外部服务环境验证，记为 `ENVIRONMENT-BLOCKED`。
- 第二切片已完成 Docker/MCP/PTY/runner host 源码核查并修复 MCP 退出残留与 Local PTY 读线程泄漏；等待 CI 验证后再记录 run 编号。
- 全量 `cargo fmt --check` 仍受父分支既有格式漂移阻塞，已单独记录为 Todo #9；本切片修改 hunks 已按 rustfmt 对齐。
- 子任务保持 `in_progress`，不要据此归档父 Task 01。
