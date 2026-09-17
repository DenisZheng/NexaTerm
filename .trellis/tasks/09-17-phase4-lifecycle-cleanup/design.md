# Phase 4：生命周期清理核查设计

## 1. 生命周期模型

每个异步 owner 必须有四个明确关系：

```text
Owner registry/state → Resource handles → Cancellation trigger → Completion observation
```

- **Owner registry/state**：能找到当前 session/stream/tunnel/bridge。
- **Resource handles**：process、JoinHandle、TcpListener、WebSocket relay、SSH session/channel。
- **Cancellation trigger**：explicit close/stop、window close、error、parent task abort、app shutdown。
- **Completion observation**：join/await、map removal、state transition、closed event；不能只调用 `abort()` 后丢掉 handle。

四类路径：

| 路径 | 必须观察 |
|---|---|
| 成功自然结束 | owner 从 registry 移除、资源关闭、finished/closed 状态只发一次 |
| 失败 | owner 从 registry 移除、session/socket/process 关闭、failed/error 状态可见 |
| 用户取消 | cancellation 先阻止后续事件，再停止 child task/resource，重复取消幂等 |
| 窗口关闭 | UI 通知链最终到 backend close/stop；不能只删除前端 tab 留下后台资源 |

## 2. 第一切片：VNC bridge 与 tunnel

### VNC bridge

当前 `VncSessionManager` 只拥有外层 `run_bridge` handle，而 `run_bridge` 为每个 client spawn relay task。第一切片应引入 operation-scoped cancellation ownership：

- bridge owner 持有一个 cancellation signal 或共享 task registry；
- relay task 在 WebSocket/TCP 读写、目标连接和 close 时都能响应 cancellation；
- `vnc_close_session` 先标记取消/停止新连接，再关闭 listener/relay tasks，最后从 registry 移除；
- relay task 的自然结束和错误不得重复删除另一个新 session，也不得重复发送错误事件；
- 不把 token/password 放进 task log、URL 或错误文本。

### Tunnel

当前 `TunnelManager` 的 `RunningTunnel` 只保存 accept-loop handle，per-client forwarding task 未登记。第一切片应：

- 为每个 running rule 持有连接任务集合或 cancellation token；
- stop/delete/replace 时先阻止新 accept，再取消并等待连接 task，随后取消 remote forward、清理 target handler、关闭 SSH session；
- accept loop abnormal exit 和 explicit stop 必须使用同一幂等收尾 seam；
- active connection count 不得在取消后产生负数、幽灵增长或晚到事件重新创建状态。

不应通过“关闭 SSH session 后通常会报错”作为唯一清理证明；session close 是资源动作，task completion 仍需可观察。

## 3. 第一切片已落地的 owner 修复

- VNC `run_bridge` 使用 `JoinSet` 持有每个 WebSocket relay task；bridge owner 结束时 abort + join 所有 relay task，不再使用脱离 owner 的裸 `tokio::spawn`。
- Tunnel `run_tunnel_accept_loop` 使用 `JoinSet` 持有每个 local/dynamic client forwarding task；accept loop 自然结束时显式 abort + join，owner 被 abort 时由 `JoinSet` drop 负责取消 children。
- VNC manager 增加重复 close 的 deterministic regression，确认 registry removal 只发生一次。
- 这仍不是完整 runtime proof：真实 WebSocket/VNC target、SSH forward server、窗口关闭和 app shutdown 需要集成环境。

## 4. 后续核查对象

- **Docker log stream**：确认 stop 的 session close + task abort 顺序、自然结束与 stop race、stream map removal 和 finished/error event 只发送一次。
- **MCP sidecar**：确认 Child kill/wait、health supervisor 的 shutdown、update preparation 和 manager Drop 不留下永久 supervisor task；若 Tauri app lifecycle 无可构造测试，拆出 cancellation state pure seam 并标记 GUI/runtime blocked。
- **PTY/terminal**：确认 SSH reader、local PTY reader thread、Telnet worker、Serial reader 在 explicit close 和自然 EOF 后都会移除 session；考虑 manager-level close-all/app-exit seam，不改变 terminal output protocol。
- **RDP/VNC runner host**：确认 child window close request、workspace close、backend session close 的单向通知和去重；native RDP external processes remain user-managed unless existing owner contract says otherwise。

## 5. 测试策略

优先使用纯 state/task seams和现有 CI 三平台：

- registry removal and idempotent stop tests；
- cancellation signal prevents new work；
- join/abort completion observed before owner removal；
- natural task completion versus explicit cancellation race；
- VNC path/auth rejection and tunnel state helper tests；
- source-level assertions for frontend runner close notification where real Tauri window unavailable。

不搭建真实 VNC server、SSH forward server 或 noVNC browser in the first slice. Any runtime GUI/network check remains `ENVIRONMENT-BLOCKED` until an environment can launch Tauri and external services.

## 6. Compatibility / rollback

- Preserve public command names and DTOs.
- Keep `vncCloseSession`, `tunnel_stop`, `docker_container_logs_stop`, and MCP stop idempotent at the command boundary.
- Keep task/resource cleanup in the owning module; do not introduce a global task supervisor abstraction for one-off needs.
- Revert the lifecycle slice as one commit if CI reveals platform-specific task behavior; do not revert the already verified input-boundary slice.
