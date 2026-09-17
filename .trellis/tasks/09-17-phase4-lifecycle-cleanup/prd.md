# Phase 4：生命周期清理核查

## Goal

在不改变连接协议和用户可见语义的前提下，确认 PTY、runner、tunnel、VNC WebSocket bridge、MCP sidecar 等异步 owner 在成功、失败、取消和窗口关闭路径上都能释放子进程、socket、SSH session、channel 和后台任务；先从源码事实和可重复测试建立证据，再对已确认的 owner 缺口做最小修复。

## Confirmed Facts

- 父任务要求覆盖 PTY、runner、tunnel、websocket、MCP sidecar、VNC runner host 的四类清理路径，并经完整工具链运行验证；当前 CI Rust 三平台可用，但本机 Windows linker/SDK 不可用。
- `TerminalManager` 保存 SSH/local/Telnet/Serial session，并由 reader task 在自然结束时移除；显式 `terminal_close` 从 map 移除后调用各 session 的 close，但 app shutdown 没有统一 `close_all` seam。
- `VncSessionManager` 只保存 bridge 的 `JoinHandle`。`run_bridge` 每接收一个 WebSocket client 就 `tokio::spawn` 一个独立 relay task；`vnc_close_session` 只 abort 外层 bridge task，不持有或取消已建立 client relay tasks。
- `TunnelManager` 只保存本地 accept loop 的 `JoinHandle`。accept loop 为每个连接另行 spawn 转发 task；`stop_running` abort accept loop、取消 remote forward 并 close SSH session，但不持有 per-client task handles。
- `DockerLogStreamManager` 保存 stream task 与独立 SSH session，stop 会标记 stopped、close session、abort task；需要确认自然结束、重复 stop、替换 stream 和 task/session race 的证据。
- `McpRemoteServiceManager` 保存 sidecar `Child` 并在 stop/drop 时 kill + wait；`start_remote_service_supervisor` 另行 spawn 永久 health loop，但 manager 不保存 supervisor handle 或 shutdown signal。
- VNC runner host 的前端 contract 要求窗口关闭通知 workspace，workspace 调用 `vncCloseSession`；不得把 WebSocket URL、token/password 放入窗口 URL 或持久化数据。

## Requirements

1. 建立 owner → resource → cancellation trigger → cleanup completion 的生命周期矩阵，覆盖成功、失败、取消、窗口关闭四类路径。
2. 优先验证并修复 VNC bridge 和 tunnel per-connection tasks 是否脱离 owner；关闭/取消时必须能停止或可证明依赖 session close 有界退出，且重复清理幂等。
3. 核查 Docker log stream、MCP sidecar、PTY reader/session 和 VNC runner host 通知链；把真实缺口与已有正确路径分开记录，不用去重、隐藏 UI 或延迟渲染伪造清理。
4. 保持 Vault、host-key、SSH protocol、MCP token、VNC runtime payload 和现有 command schema 不变；错误只使用稳定 code，不记录敏感输入。
5. 测试必须覆盖 task cancellation、session close、map removal、event emission 和重复 close 的可观察结果；无法构造真实 Tauri `AppHandle` 或 GUI 窗口的项明确标记 `ENVIRONMENT-BLOCKED`。

## Acceptance Criteria

- [x] 生命周期矩阵完成，明确每个 owner 的正常/异常/取消/窗口关闭出口和当前证据。
- [x] VNC WebSocket bridge 与 tunnel per-connection task 的 owner 关系已验证；已完成最小 JoinSet ownership/abort/join 修复及 VNC 重复 close 回归。
- [ ] Docker stream、MCP supervisor/child、PTY/local session 和 runner host 通知链完成源码级核查，并新增必要的 deterministic tests。
- [ ] `cargo fmt --manifest-path src-tauri/Cargo.toml --check`、targeted Rust tests 和 `cargo check` 通过；Rust targeted/full tests 和 check 已通过 CI，full fmt 仍被父分支既有格式漂移阻塞，已单独记录 blocker。
- [x] Rust Linux/Windows/macOS CI 验证本切片测试：run `35185323819` 全绿，Linux/macOS 各 298 tests、Windows 302 tests 全部通过；真实 GUI/外部服务仍保留 `ENVIRONMENT-BLOCKED`。
- [x] 不新增敏感日志、协议字段、应用依赖或无关 UI 改动。

## Out of Scope

- CSP 收紧、Tauri capability 重新设计、发布打包和完整 GUI automation。
- 新增 SSH/VNC/WebSocket/tunnel 协议能力。
- 依赖 advisory 修复和许可证清单。
- 为本任务顺便格式化父分支已有未格式化文件；格式基线另行处理。

## Confirmed First Slice

- 第一切片先聚焦 VNC bridge + tunnel 的 detached task owner 修复。
- 这两个模块已有明确的 untracked task 关系，先形成最小可验证的 cancellation/cleanup seam；PTY/MCP/RDP runner、Docker log 和 MCP supervisor 继续作为后续核查项。
