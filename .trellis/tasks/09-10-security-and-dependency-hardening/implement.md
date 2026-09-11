# Task 01：安全与依赖硬化执行计划

## 启动前门禁

- [x] 用户确认 MCP 非 loopback 默认监听策略：默认 loopback，非 loopback 必须显式确认。
- [x] 用户确认存量非 loopback 配置的迁移策略：降级为 loopback + 设置页提示重新确认（见 `design.md` §3.1.1）。
- [x] 用户确认验证项与执行平台解耦：Rust 编译类验收保留为必需项，须在具备完整工具链的环境中执行（见 `prd.md` D3、`design.md` §9）。
- [x] 规划产物已提交至基线 commit `96c6d35`，工作区干净。
- [x] 读取并核对 `.trellis/spec/backend`、相关 frontend spec、Tauri command contracts 和当前 lockfile。（注：`spec/backend/error-handling.md`、`logging-guidelines.md` 为空模板，威胁模型改以实际代码 `app_error.rs`/`mcp.rs` 与 `design.md` 为准。）
- [x] 记录审计工具版本、Rust 工具链阻塞与磁盘约束为执行环境，不把环境阻塞当作测试通过。

## Phase 1：审计与威胁模型

- [x] 固定 `package.json`、pnpm lockfile、`src-tauri/Cargo.toml`、`Cargo.lock` 的基线 hash。
- [x] 运行/复核 `pnpm --registry=https://registry.npmjs.org audit --json`；按 Critical/High/Moderate/Low 记录**每条的修复路径与依赖链**，特别是 5 个 high 究竟来自直接依赖升级还是传递依赖 override。（结论：5 个 high 全为 dev-only 构建链传递依赖，见 `SECURITY_REVIEW.md` §Phase1.1。）
- [x] 运行 `cargo metadata --locked --offline` 与 `cargo-deny --offline --locked check advisories`；记录 10 个 RustSec advisory 的可修复性、影响范围与许可证。
- [x] `cargo audit` 记 `ENVIRONMENT-BLOCKED`（工具未安装），由 cargo-deny advisories 提供临时 RustSec 证据，并明确标注二者不等同。
- [x] 生成依赖升级矩阵：直接依赖、传递路径、可升级版本、API/平台风险、回滚点。
- [x] 生成 threat model：MCP 暴露、WebView/IPC、secret/error/log、路径/命令注入、资源泄露、供应链。
- [x] 形成 CSP 资源盘点和 capability 使用矩阵：从前端调用点与窗口创建点反推 `main` / `vnc-runner-host` 各自真实需要的权限。

## Phase 2：低风险、可独立回滚的硬化

- [x] npm 侧锁文件/override 升级（Batch A）+ 移除冗余 `package-lock.json`（Batch D）：overrides 落到 `pnpm-workspace.yaml`（pnpm 11 不再读 `package.json` 的 `pnpm` 字段），`pnpm install` 后 `pnpm run check` / `pnpm run build`（Monaco+dompurify 兼容）/ `pnpm audit` 全通过——high 5→0、moderate 全清，仅剩 1 条 dev-only esbuild low（有意推迟，见 `SECURITY_REVIEW.md`「Phase 2 执行结果」）。
- [ ] Rust 侧锁文件升级（Batch B：`cargo update -p h2 -p chacha20 -p crypto-bigint -p der`）与编译验证：**ENVIRONMENT-BLOCKED**，待完整工具链环境（见「验证命令基线」）。
- [ ] 删除明显未使用的 capability，按窗口拆分配置；为每项保留调用点证据。（Batch C：需 `tauri dev` 验证 runner 窗口不回归 → 待工具链环境；拆分矩阵已在 `SECURITY_REVIEW.md` §5 就绪。）
- [ ] 增加 secret scan、audit artifact 与配置静态检查脚本，输出明确 `PASS` / `FAIL` / `ENVIRONMENT-BLOCKED`。（Batch E：断言依赖 Batch C 与 Phase 5 结果落地，随其一并完成，避免提交即失败的 check。）

## Phase 3：MCP 与错误边界

### MCP 监听策略（按 `design.md` §3.1.1 实现）

- [ ] `DEFAULT_REMOTE_HOST` 改为 `127.0.0.1`；前端 `defaultMcpSettings.remote_host` 同步改为 `"127.0.0.1"`。
- [ ] `McpSettings` / `McpSettingsInput` 增加 `remote_exposure_acknowledged`（serde default `false`，保证旧 JSON 可解析）。
- [ ] 提取 `is_loopback_host` 至共享模块，供应用侧与 `mxterm_mcp` sidecar 共用，消除两侧判定不一致。
- [ ] 实现单一 seam `resolve_effective_remote_host`，并让 sidecar 启动参数、`McpRemoteServiceStatus`、`McpSettingsOutput`、`McpStatus` 全部改用它，禁止各自读取 `settings.remote_host`。
- [ ] 状态 DTO 增加 `remote_host_stored` 与 `remote_host_downgraded`；加载时**不回写存储**。
- [ ] `save_settings` 对「非 loopback + 未确认」以 `mcp_remote_host_not_acknowledged` fail-fast 拒绝，不做静默降级。
- [ ] 设置页显示降级原因与重新确认入口；`remote_host_downgraded` 为真时给出明确提示文案（走 i18n）。

### 测试与收敛

- [ ] 增加认证、错误 token、未暴露连接、危险命令、命令 preview、body/输出上限、rate limit、并发和服务重启/停止测试。
- [ ] 增加迁移用例：旧配置含 `0.0.0.0` 且无确认字段 → 生效 loopback + `remote_host_downgraded=true` + 存储未被改写；确认后 → 恢复存储值 + 标志为 false。
- [ ] 按 `design.md` §5.3 的四步顺序收敛 `AppError`：**先**把前端依赖 `raw_message` 的判定分支落到稳定 `code`，**再**加 `diagnostic_id`，**最后**对 `raw_message` 加 `#[serde(skip_serializing)]`；不得跳步。
- [ ] 更新 TypeScript DTO 与所有调用方（`ConnectionDialog.tsx`、`WorkspaceShell.tsx` 的错误摘要/阶段/建议逻辑）；过渡期前端必须容忍 `raw_message` 缺失。
- [ ] 验证 token、password、private key、raw command、host path 不出现在响应、日志和错误 toast。

## Phase 4：输入边界与生命周期

- [ ] 为 remote exec、Docker、WebDAV、remote file、tunnel、shell quoting 增加 Windows 与 POSIX 负向用例。
- [ ] 对 PTY、runner、tunnel、websocket、MCP sidecar 和 VNC runner host 的成功、失败、取消、窗口关闭四类清理路径做源码级核查：确认每个 owner 都有对应清理分支且幂等。
- [ ] 在具备完整工具链的环境中用 `cargo test` 驱动完成上述资源回收的运行时验证；环境不具备时记 `ENVIRONMENT-BLOCKED` 并附完整证据，不得声称已通过。
- [ ] 对 Vault 回读、known-host changed 拒绝和连接失败语义做回归测试（同样需要可用工具链）。

## Phase 5：CSP、跨平台与发布门禁

- [ ] 按实际资源收紧 CSP；运行 dev/build、Monaco/noVNC/updater smoke test，记录必要的 data/blob/websocket 来源。
- [ ] 每个必须保留的 `unsafe-inline` / `data:` / `blob:` 条目记录实际调用点；无法收紧时写出暴露面、缓解措施与风险接受人。
- [ ] 在 Windows/macOS/Linux 的 capability、文件权限、端口 bind、外部 runner 条件下分别验证；缺环境则记录阻塞证据（**macOS/Linux 环境本机不具备，预期全部记阻塞**）。
- [ ] 运行 `pnpm audit`、JS 侧 secret scan、前端 build、现有 source checks 与 JS 脚本测试；Rust 侧运行 `cargo metadata` 与 `cargo deny check advisories`，并在工具链可用时补跑 `cargo audit` 与 `cargo test --workspace`。
- [ ] 审计剩余风险必须有暴露面、利用条件、缓解、期限、负责人。
- [ ] 由 code review / security review 检查后，才允许提交与归档。

## capability/CSP 验证方式（已对齐）

`prd.md` 要求 capability/CSP 变更必须有负向测试，但集成级验证依赖启动 Tauri 应用（需要可用工具链），而前端测试基线归 Task 03。已确认的处理：

- **配置级静态检查必须完成**：新增 `scripts/check-*.mjs` 脚本，断言 capability 无非必要权限、CSP 不为 `null`、每个 `unsafe-inline` / `data:` / `blob:` 白名单条目都有调用点注释。此方式不依赖 Rust 编译，任何环境都可执行。
- **集成级负向测试在工具链可用时必须完成**：覆盖未授权窗口、未授权 command、外部导航与资源加载失败。环境不具备时记 `ENVIRONMENT-BLOCKED`，明确移交 Task 03 之后补齐，不在本任务内声称通过。
- **不引入新的测试框架**：`pnpm test` 的 Vitest/jsdom 基线属 Task 03，本任务不越界建立。

## 验证命令基线

```powershell
# 前端 / JS 侧（本机可执行）
pnpm --registry=https://registry.npmjs.org audit --json
pnpm run check
pnpm run build
node scripts/check-startup-module-boundary-source.mjs
node --test scripts/*.test.mjs

# Rust 侧：不触发编译的审计命令（任何环境都可执行）
$env:RUSTUP_HOME='D:\tmp\nexaterm-rust\rustup-home'   # Windows 基线机路径，其他环境按实际调整
$env:CARGO_HOME='D:\tmp\nexaterm-rust\cargo-home'
$env:CARGO_TARGET_DIR='D:\tmp\nexaterm-rust\target-nexaterm'
cargo metadata --locked --offline
cargo deny --offline --locked check advisories

# Rust 侧：需要完整工具链（Windows 需完整 MSVC C++ 工作负载 + Windows SDK；
# macOS 用 Xcode CLT 的 clang/ld）。环境不具备时记 ENVIRONMENT-BLOCKED，
# 不得记为通过，并附 design.md §9.1 形式的完整错误证据。
cargo audit                                    # 未安装时报 ENVIRONMENT-BLOCKED
cargo check --workspace --locked --offline
cargo test --workspace --locked --offline
```

每条命令都要记录工具版本、退出码和 `PASS`/`FAIL`/`ENVIRONMENT-BLOCKED`。

## 回滚点

- 依赖升级：按批次恢复对应 lockfile/manifests。
- capability/CSP：恢复上一份已验证配置，保留失败资源/权限证据。
- MCP：保留旧配置解析兼容层；`remote_exposure_acknowledged` 为新增可选字段，回滚后旧代码会忽略它，不影响读取。必要时关闭远程服务而不是绕过认证。
- AppError：`raw_message` 的 serde 开关可单独回滚；`code` 分类与 `diagnostic_id` 为增量，回滚不影响旧调用方。
- 输入/lifecycle：单独回滚具体 validator/cleanup patch，不回滚 Vault/host-key 安全控制。

## 完成定义

- `prd.md` 全部验收项有证据链接，或明确标注环境阻塞及原因。
- 代码审查、安全审查、许可证审查结果已记录；跨平台结果按实际可用环境记录，不可用环境不得留空。
- 所有 `ENVIRONMENT-BLOCKED` 项在完成报告中单独成节，写清「因此未能验证什么」、缺的是哪一项环境能力、以及解除后在哪个环境补做；不得用「未发现问题」代替，也不得据此把该项从验收标准中抹掉。
- 没有未评估 Critical/High，没有以隐藏输出或放宽权限替代修复。
