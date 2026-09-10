# Task 01：安全与依赖硬化执行计划

## 启动前门禁

- [x] 用户确认 MCP 非 loopback 默认监听策略：默认 loopback，非 loopback 必须显式确认。
- [ ] 读取并核对 `.trellis/spec/backend`、相关 frontend spec、Tauri command contracts 和当前 lockfile。
- [ ] 将审计工具版本、Rust linker 阻塞和磁盘约束记录为执行环境，不把环境阻塞当作测试通过。

## Phase 1：审计与威胁模型

- [ ] 固定 `package.json`、pnpm lockfile、`src-tauri/Cargo.toml`、`Cargo.lock` 的基线 hash。
- [ ] 运行/复核 `pnpm audit`、`cargo metadata --locked`、`cargo deny`/`cargo audit`；按 Critical/High/Moderate/Low 记录修复路径、影响范围和许可证。
- [ ] 生成依赖升级矩阵：直接依赖、传递路径、可升级版本、API/平台风险、回滚点。
- [ ] 生成 threat model：MCP 暴露、WebView/IPC、secret/error/log、路径/命令注入、资源泄露、供应链。
- [ ] 形成 CSP 资源盘点和 capability 使用矩阵。

## Phase 2：低风险、可独立回滚的硬化

- [ ] 先处理无需产品行为变化的锁文件/补丁版本升级；每批升级后运行前端构建、依赖审计和现有 source checks。
- [ ] 删除明显未使用的 capability，按窗口拆分配置；为每项保留调用点证据。
- [ ] 增加 secret scan、audit artifact 和配置静态检查脚本，输出明确 PASS/FAIL/ENVIRONMENT-BLOCKED。

## Phase 3：MCP 与错误边界

- [ ] 实现已确认的 remote host 默认策略：默认 `127.0.0.1`，非 loopback 必须显式确认并保留状态迁移兼容。
- [ ] 增加认证、错误 token、未暴露连接、危险命令、命令 preview、body/输出上限、rate limit、并发和服务重启/停止测试。
- [ ] 收敛日志字段和 `AppError` 前端返回；引入 diagnostic ID，更新 TypeScript/Rust contracts 和调用方。
- [ ] 验证 token、password、private key、raw command、host path 不出现在响应、日志和错误 toast。

## Phase 4：输入边界与生命周期

- [ ] 为 remote exec、Docker、WebDAV、remote file、tunnel、shell quoting 增加 Windows 与 POSIX 负向用例。
- [ ] 对 PTY、runner、tunnel、websocket、MCP sidecar 和 VNC runner host 验证成功、失败、取消、窗口关闭后的资源回收。
- [ ] 对 Vault 回读、known-host changed 拒绝和连接失败语义做回归，确保安全修复没有改变密文或信任边界。

## Phase 5：CSP、跨平台与发布门禁

- [ ] 按实际资源收紧 CSP；运行 dev/build、Monaco/noVNC/updater smoke test，记录必要的 data/blob/websocket 来源。
- [ ] 在 Windows/macOS/Linux capability、文件权限、端口 bind、外部 runner 条件下分别验证；缺环境则记录阻塞证据。
- [ ] 运行 `pnpm audit`、Rust audit/deny、secret scan、license gate、前端/Rust tests 和 build；审计剩余风险必须有暴露面、利用条件、缓解、期限、负责人。
- [ ] 由 code review/security review 检查后，才允许进入 `task.py start` 后的实现提交和归档。

## 验证命令基线

```powershell
pnpm audit --json
pnpm run build
node scripts/check-startup-module-boundary-source.mjs

$env:RUSTUP_HOME='D:\tmp\nexaterm-rust\rustup-home'
$env:CARGO_HOME='D:\tmp\nexaterm-rust\cargo-home'
$env:CARGO_TARGET_DIR='D:\tmp\nexaterm-rust\target-nexaterm'
cargo metadata --locked --offline
cargo audit
cargo deny check advisories licenses sources bans
cargo test --workspace --locked --offline
```

每条命令都要记录工具版本、退出码和 PASS/FAIL/ENVIRONMENT-BLOCKED；MSVC `link.exe` 缺失时必须保留完整错误证据。

## 回滚点

- 依赖升级：按批次恢复对应 lockfile/manifests。
- capability/CSP：恢复上一份已验证配置，保留失败资源/权限证据。
- MCP/AppError：保留旧配置解析和旧响应兼容层，必要时关闭远程服务而不是绕过认证。
- 输入/lifecycle：单独回滚具体 validator/cleanup patch，不回滚 Vault/host-key 安全控制。

## 完成定义

- `prd.md` 全部验收项有证据链接或明确环境阻塞。
- 代码审查、安全审查、许可证审查和跨平台结果已记录。
- 没有未评估 Critical/High，没有以隐藏输出或放宽权限替代修复。
