# Phase 4：生命周期清理核查实施计划

## 0. 启动门禁

- [x] 用户确认第一切片先处理 VNC bridge + tunnel detached task owner。
- [ ] 读取父任务与本子任务 PRD/design，backend/frontend Tauri contracts、cross-layer/code-reuse guides。
- [ ] 记录基线 commit、当前 task、工作区状态；只修改本子任务范围。

## 1. 生命周期矩阵与复现

- [x] 逐个 owner 列出 success/failure/cancel/window-close 的资源、trigger、completion signal 和 map/state 更新。
- [x] 通过源码核查确认 VNC relay task 和 tunnel per-client task 脱离 owner；区分“session close 会最终让 IO 返回”与“task 已被取消/等待”。
- [x] 核查 Docker log stop/natural-finish race、MCP child/supervisor、PTY reader/session、VNC runner host close notification（第二切片，结论见 design.md §7）。

## 2. VNC bridge 第一切片

- [x] 设计 operation-scoped task ownership，不增加全局抽象：`JoinSet` 由 bridge owner 持有 relay tasks。
- [x] 让 bridge owner 结束时 abort/join relay tasks；manager close 保持 registry removal 幂等。
- [x] 增加 deterministic test：重复 close 只移除一次；invalid path/target tests沿用既有覆盖。真实 relay cancellation 仍需 runtime integration。


## 3. Tunnel 第一切片

- [x] 为 accept-loop owner 使用 `JoinSet` 保存 per-client task ownership。
- [x] accept loop 自然结束时 abort/join client tasks；explicit stop abort owner 后由 `JoinSet` drop 取消 children，再执行既有 remote-forward/session cleanup。
- [ ] 增加 state/active-connection 清理回归；确保 abnormal accept exit 与 explicit stop 不重复收尾。

## 4. 后续 owner 核查

- [x] Docker log stream：源码核查通过，未改代码。stop 先置 `stopped` 再关 session 再 abort；task 侧 finished/error 事件受 `stopped` 门控且只发一次；`finish_stream` 用 `Arc::ptr_eq` 防止移除同 id 的新流。
- [x] MCP sidecar：修复。Tauri `App::run` 以 `process::exit` 结束、托管状态不 Drop，原 `Drop` 收尾从不执行 → sidecar 在应用退出后残留。`lib.rs` 改为 `build().run(callback)`，在 `RunEvent::Exit` 调用新增 `McpRemoteServiceManager::shutdown()`（kill+wait、置 `shutting_down`）；`reconcile` 与 supervisor loop 在 `shutting_down` 后拒绝再 spawn。新增幂等回归测试。
- [x] PTY/local/telnet/serial：SSH/Telnet/Serial 的 explicit close 与自然 EOF 都走同一条 reader 收尾（remove + closed 事件一次），未改。Local PTY 修复：`close()` 只 kill 子进程而不释放 master，Windows ConPTY 读端随 master 存活、读线程永不返回 → 每次关闭本地终端泄漏一条阻塞线程与 PTY 句柄。改为 `master: Option`，`close()` kill 后 `take()` 释放；`resize` 在关闭后返回不可恢复错误。新增 Windows 回归测试验证读线程在 close 后退出。
- [x] VNC runner host / RDP native host：源码核查通过，未改代码。main→runner 用 `notifyRunnerWindow`，runner→main 用 `notifyMain:false` + `reportedClosedRef` 去重，两向都不回声；error 路径先 `vncCloseSession` 再置 error，后续用户关闭时 backend 返回 `ok:false` 幂等。RDP 外部进程按既有契约由用户管理。

## 5. 验证

- [x] `cargo fmt --manifest-path src-tauri/Cargo.toml --check`：父基线漂移（4 文件 8 处纯格式）已在独立 style 提交中清除，本机退出码 0。
- [x] targeted Rust tests：`vnc`、`tunnels`、`docker_tools`、`remote_exec_pool`、`terminal::manager`/相关模块、`mcp`；由 CI full workspace test 覆盖。
- [x] `cargo check --manifest-path src-tauri/Cargo.toml --locked`：由 CI Linux/Windows/macOS 成功验证。
- [x] `pnpm run check`、相关 source checks、`git diff --check` 和 `pnpm run check:secrets`；本切片无前端代码改动，secret gate 通过。
- [x] CI Linux/Windows/macOS 记录 compile/test 结果：run `35185323819`（第一切片）与 run `35295465354`（第二切片 `e6c6ca7`）全绿。真实 Tauri GUI、VNC/SSH/Docker 服务仍记 `ENVIRONMENT-BLOCKED`。

## 6. 交付

- [ ] 更新矩阵、HANDOFF 和父任务 implement 状态。
- [x] 创建独立英文提交，不 amend；提交 `bfc2f2a` 已推送并取得 run `35185323819` 验证。
- [ ] 只有所有可运行检查通过、阻塞项明确记录后才考虑完成子任务；Docker/MCP/PTY/runner host 核查和 full fmt blocker 仍未完成，不归档父 Task 01。
