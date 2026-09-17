# Phase 4：生命周期清理核查实施计划

## 0. 启动门禁

- [x] 用户确认第一切片先处理 VNC bridge + tunnel detached task owner。
- [ ] 读取父任务与本子任务 PRD/design，backend/frontend Tauri contracts、cross-layer/code-reuse guides。
- [ ] 记录基线 commit、当前 task、工作区状态；只修改本子任务范围。

## 1. 生命周期矩阵与复现

- [x] 逐个 owner 列出 success/failure/cancel/window-close 的资源、trigger、completion signal 和 map/state 更新。
- [x] 通过源码核查确认 VNC relay task 和 tunnel per-client task 脱离 owner；区分“session close 会最终让 IO 返回”与“task 已被取消/等待”。
- [ ] 核查 Docker log stop/natural-finish race、MCP child/supervisor、PTY reader/session、VNC runner host close notification。

## 2. VNC bridge 第一切片

- [x] 设计 operation-scoped task ownership，不增加全局抽象：`JoinSet` 由 bridge owner 持有 relay tasks。
- [x] 让 bridge owner 结束时 abort/join relay tasks；manager close 保持 registry removal 幂等。
- [x] 增加 deterministic test：重复 close 只移除一次；invalid path/target tests沿用既有覆盖。真实 relay cancellation 仍需 runtime integration。


## 3. Tunnel 第一切片

- [x] 为 accept-loop owner 使用 `JoinSet` 保存 per-client task ownership。
- [x] accept loop 自然结束时 abort/join client tasks；explicit stop abort owner 后由 `JoinSet` drop 取消 children，再执行既有 remote-forward/session cleanup。
- [ ] 增加 state/active-connection 清理回归；确保 abnormal accept exit 与 explicit stop 不重复收尾。

## 4. 后续 owner 核查

- [ ] Docker log stream：stop/natural finish/error race 和 idempotent map cleanup。
- [ ] MCP sidecar：Child kill/wait 与 health supervisor shutdown/update preparation；若需要 app lifecycle，拆出纯 seam并记录 runtime block。
- [ ] PTY/local/telnet/serial：reader 自然结束、explicit close、app close 的 session removal 与 child/socket cleanup。
- [ ] VNC runner host / RDP native host：window close → workspace → backend close 单向通知和重复事件防护。

## 5. 验证

- [ ] `cargo fmt --manifest-path src-tauri/Cargo.toml --check`；父基线漂移单独记录，不重排无关代码。
- [x] targeted Rust tests：`vnc`、`tunnels`、`docker_tools`、`remote_exec_pool`、`terminal::manager`/相关模块、`mcp`；由 CI full workspace test 覆盖。
- [x] `cargo check --manifest-path src-tauri/Cargo.toml --locked`：由 CI Linux/Windows/macOS 成功验证。
- [x] `pnpm run check`、相关 source checks、`git diff --check` 和 `pnpm run check:secrets`；本切片无前端代码改动，secret gate 通过。
- [x] CI Linux/Windows/macOS 记录 compile/test 结果：run `35185323819` 全绿；Linux/macOS 各 298 tests、Windows 302 tests。真实 Tauri GUI、VNC/SSH/Docker 服务仍记 `ENVIRONMENT-BLOCKED`。

## 6. 交付

- [ ] 更新矩阵、HANDOFF 和父任务 implement 状态。
- [x] 创建独立英文提交，不 amend；提交 `bfc2f2a` 已推送并取得 run `35185323819` 验证。
- [ ] 只有所有可运行检查通过、阻塞项明确记录后才考虑完成子任务；Docker/MCP/PTY/runner host 核查和 full fmt blocker 仍未完成，不归档父 Task 01。
