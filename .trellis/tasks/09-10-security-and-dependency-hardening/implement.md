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
- [x] Rust 侧锁文件升级（Batch B：`cargo update -p h2 -p chacha20 -p crypto-bigint -p der`）与编译验证：**已完成并经 CI 验证**。锁文件升级 chacha20 0.10.0→0.10.2、crypto-bigint 0.7.3→0.7.5、der 0.8.0→0.8.2、h2 0.4.14→0.4.19，全为 semver 兼容补丁位；本机 `cargo metadata --locked --offline` PASS，`cargo deny check advisories` 由 10→9 条、RUSTSEC-2026-0258 与 3 个 yanked crate 全部消失，剩余 9 条均为「No safe upgrade available」的 unmaintained 传递依赖。**编译/测试验证：commit `1a8e95e`，`.github/workflows/ci.yml` rust 矩阵（ubuntu-22.04 / windows-latest / macos-26）`cargo check` + `cargo test` 全绿**。
  - **连带变更（已随 CI 全绿证伪风险，非人为改动）**：本次重新求解把 `rustix`/`tempfile`/`dirs-sys`/`is-terminal` 等 11 处对 `windows-sys` 的依赖边由 0.61.2 改指 0.45.0/0.52.0/0.59.0/0.60.2，`tempfile` 的 `getrandom` 由 0.4.2 改指 0.3.4。
    这些 crate 对 windows-sys 声明的是版本区间，两侧都合法；diff 中**无任何 `[[package]]` 增删**——被改指的 windows-sys 版本在 HEAD 锁文件里本来就已存在，只是边的归属变了。
    根因是 HEAD 锁文件由发版准备时另一版本 cargo 生成（其求解器把区间依赖统一到 0.61.2），本机 cargo 1.98.1 复现不出该统一结果；已验证 `cargo update -p X --precise` 逐个执行与批量执行产出**完全相同的锁文件哈希**，即非命令写法所致。
    `1a8e95e` 的 CI 三平台 `cargo check` + `cargo test` 全绿，确认该连带变更无编译或运行时副作用。
- [ ] 删除明显未使用的 capability，按窗口拆分配置；配置拆分已在 commit `443e4a8` 完成，调用点矩阵见 `SECURITY_REVIEW.md` §5；真实 `tauri dev` runner 窗口回归与未授权边界验证仍待具备完整 GUI/工具链的环境。
- [ ] 增加 secret scan、audit artifact 与配置静态检查脚本，输出明确 `PASS` / `FAIL` / `ENVIRONMENT-BLOCKED`。其中 capability 独立 step 已在 `55a2cb7` 经 CI 通过；本轮实现 secret scan 和 audit artifact 并完成本地验证，新增远端 job 待提交推送后验证，CSP 检查仍未完成。

## Batch E 本轮执行清单

- [x] 用户确认扫描当前代码与 Git 历史；密钥阻断，依赖发现先报告，工具/网络失败仍阻断。
- [x] 固定 Gitleaks/cargo-deny 版本和安装包 SHA256，增加可重复安装与命令入口。
- [x] 实现完整历史+受跟踪工作树扫描、具体测试夹具指纹豁免、脱敏报告与失败退出码。
- [x] 实现 npm/Rust 审计完成性检查、advisory 归档、工具版本与 lockfile hash。
- [x] 接入独立 CI job 与仅白名单报告的 artifact（14 天），不输出命中原文；配置已做 YAML/契约检查，远端运行待提交推送后验证。
- [x] 运行真实工具和脚本回归，记录剩余阻塞并暂存待审核；不自动提交推送。
- [x] 完成双轴审核并修复 3 项 P2；新增/加强回归后 55/55 通过，记录见 `review-batch-e.md`。本轮用户授权审核和本地提交，不含推送。
- [ ] 获准推送后验证新增 `Security evidence` job 的真实执行和三个 artifact 报告。

### Batch E 本机证据（2026-09-17）

- Node `22.22.3`、pnpm `11.22.0`、Gitleaks `8.30.1`、cargo-deny `0.20.2`、cargo `1.98.1`。Gitleaks Windows 安装包 SHA256 已对官方发布资产校验。
- `RUN_SECURITY_INTEGRATION=1` + `node --test scripts/*.test.mjs`：审核后 55/55 PASS，真实历史删除/dirty tracked/浅克隆用例未跳过。缺工具、解析错误、退出码不一致和原文脱敏均有负向断言；补充了 npm 可选字段与逐严重度计数回归、CLI 测试摘要隔离断言。
- `pnpm run check`、`pnpm run check:tauri-capabilities`、启动模块边界检查、JS/PowerShell 语法检查和 CI YAML/权限/artifact 契约检查均 PASS。
- 在线 npm：1 low，`REVIEW-REQUIRED`；在线 Rust：13 条（4 vulnerability / 6 unmaintained / 3 unsound），`REVIEW-REQUIRED`。这里的 exit 0 表示采集完成，不表示安全问题已解决。Rust 本轮配置显式覆盖所有 unsound 依赖；旧“全部是 unmaintained”的表述不能当作当前风险结论。
- 初版新文件暂存后扫描覆盖 812 个受跟踪文件；审核修复与记录纳入暂存后再次运行 `pnpm run check:secrets`，覆盖 813 个受跟踪文件、218 个历史提交，0 个未豁免命中。唯一核准夹具在历史和当前代码各出现一次，报告保留两次定位；不是两项全局豁免。
- 本批不修改应用依赖/lockfile/CSP；新增 job 未远端运行，Task 01 不归档。

## Phase 3：MCP 与错误边界

### MCP 监听策略（按 `design.md` §3.1.1 实现）

- [x] `DEFAULT_REMOTE_HOST` 改为 `127.0.0.1`；前端 `defaultMcpSettings.remote_host` 同步改为 `"127.0.0.1"`。
- [x] `McpSettings` / `McpSettingsInput` 增加 `remote_exposure_acknowledged`（serde default `false`，保证旧 JSON 可解析）。
- [x] 提取 `is_loopback_host` 至共享模块（`mcp::is_loopback_host`），sidecar `mxterm_mcp.rs` 改为引用该函数，前端 `mcpSettingsTypes.ts` 的 `isLoopbackHost` 与之严格同义（精确匹配 `localhost` / `127.0.0.1` / `::1`）。
- [x] 实现单一 seam `resolve_effective_remote_host`，sidecar 启动参数、`McpRemoteServiceStatus`、`McpSettingsOutput`、`McpStatus` 全部改用它。
- [x] 状态 DTO 增加 `remote_host_stored` 与 `remote_host_downgraded`；加载时**不回写存储**（用例 `unacknowledged_non_loopback_host_downgrades_without_rewriting_storage` 断言存储值原样保留）。
- [x] `save_settings` 对「非 loopback + 未确认」以 `mcp_remote_host_not_acknowledged` fail-fast 拒绝，不做静默降级。
- [x] 设置页显示降级原因与重新确认入口；表单绑定 `remote_host_stored` 而非生效值，避免无关保存把用户地址静默改写。

### 测试与收敛

- [x] 增加认证、错误 token、未暴露连接、危险命令、命令 preview、body/输出上限、rate limit、并发和服务停止测试。
  - 本批新增实现（原先缺失，非仅补测试）：`mxterm_mcp.rs` 的**进程内限流**（按来源固定窗口 + 认证失败指数退避，loopback 300/min、非 loopback 60/min）与**并发连接上限**（loopback 64 / 远端 16，分池且不排队）；`mcp.rs` 的**命令长度上限**（8 KiB，超限拒绝而非截断）。
  - `mxterm_mcp.rs` 新增 HTTP 层与限流器用例；`mcp.rs` 新增暴露白名单、危险命令双闸门、拒绝 preview 不回显命令、超时/输出上限夹取、明文凭据拒绝、token preview 不泄露、`stop` 清空 runtime 等用例。
  - **服务重启（`restart`/`reconcile`）用例记 `ENVIRONMENT-BLOCKED`**：这两个方法签名需要 `AppHandle`，单测无法构造真实 Tauri 运行时（`stop` 不需要，已覆盖）。缺的是「可运行 Tauri 应用实例的测试环境」，解除后应以集成测试形式补做。
- [x] 增加迁移用例：旧配置含 `0.0.0.0` 且无确认字段 → 生效 loopback + `remote_host_downgraded=true` + 存储未被改写；确认后 → 恢复存储值 + 标志为 false。
- [x] 按 `design.md` §5.3 的四步顺序收敛 `AppError`：**四步全部完成**。
  - **第 1 步（补分类能力）已完成**：网络层失败改由后端在拿得到 `io::ErrorKind` 的那一层分类，落到稳定 code `{站点}_{connect_refused|connect_unreachable|connect_reset|connect_timeout}`（`session.rs` 的 `refine_network_code` / `app_error_from_io`）。前端新增 `connectionErrorCodes.ts`，`WorkspaceShell.tsx` 的阶段/建议/摘要与 `ConnectionDialog.tsx` 的 `describeDialogError` 全部改读 code，不再匹配 `raw_message` 文本。
    动机不只是安全：旧逻辑匹配 `"connection refused"` / `"timed out"` 等**英文** OS 文本，中文 Windows 给的是「连接的主机没有反应」，旧代码只能再硬编码 `10060` 和中文片段兜底——本质上不可测试。
  - **第 2 步（diagnostic ID）已完成**：`AppError` 增加 `diagnostic_id`，在 `new()` 内生成 UUID，585 处调用点零改动；内部诊断日志只记 `diagnostic_id` + `code` + `recoverable`，**不记 `raw_message`**（原始文本可能嵌命令原文/主机路径）。
  - **第 4 步（兼容窗口）已完成**：前端全部 `raw_message` 读取点改为「缺失即退回诊断 ID / message」，不再出现 `normalizeErrorText(error)` 把整个错误对象字符串化的兜底。
  - **第 3 步（`#[serde(skip_serializing)]`）已完成**——前置阻塞已按用户决策解除：
    - **阻塞根因**：`raw_message` 此前同时是两条结构化数据通道，直接关闭会造成功能回归。
      1. **前端通道**：`hostKeyErrors.ts` 把 `raw_message` 当 JSON 解析出 `HostKeyInfo`（由 `ssh_config.rs` 的两个构造函数序列化写入）。关闭后主机密钥 TOFU 确认弹窗将拿不到指纹，等于**关掉 host key 校验的用户可见环节**。
      2. **Rust 内部通道**：`session.rs` 的 `to_russh_error` / `app_error_from_russh` 把整个 `AppError` 序列化成 JSON 塞进 `io::Error` 再解析回来。
    - **已对齐的数据模型决策（用户选定）**：host key 载荷迁到 `AppError` 的独立结构化字段 `details: Option<AppErrorDetails>`，`AppErrorDetails` 是按 `kind` 判别的枚举（`host_key_unknown { host_key }` / `host_key_changed { host_key, old_fingerprint_sha256 }`）。选它而非自由 `serde_json::Value`，是因为后者只是把 `raw_message` 的「什么都能往里塞」问题换个字段重演——前端仍得做形状嗅探，且新增载荷不经过任何评审。
    - **落地**：`raw_message` 加 `#[serde(default, skip_serializing)]`；`details` 加 `skip_serializing_if = "Option::is_none"`，无载荷的错误线上表示不变。`ssh_config.rs` 两个构造函数改为 `.with_details(...)`，其 `raw_message` 降级为人类可读指纹摘要（仅供内部诊断）。
    - **内部通道单独保通**：新增 `AppError::to_internal_json()`，序列化后把 `raw_message` 显式写回，`to_russh_error` 改用它。否则该字段会因 `skip_serializing` 在跨 russh 边界时静默丢失——这正是 §5.3 要求「Rust 内部保留完整 `raw_message`」的那一半。反向解析不变（`skip_serializing` 只影响序列化方向）。
    - **前端**：`parseHostKeyError` 改读 `details` 判别联合，不再 `JSON.parse`。`code` 为权威判别字段，`details.kind` 必须与之一致，否则返回 `null`（不出确认卡片），避免契约被改坏时展示错误的风险等级。
    - **用例**：`app_error.rs` 加 `ipc_serialization_drops_raw_message`（断言线上表示不含原始文本）、`internal_json_preserves_raw_message`、`details_survive_ipc_round_trip`、`details_field_is_omitted_when_absent`、`host_key_changed_details_carry_old_fingerprint`；`session.rs` 加 `russh_app_error_mapping_preserves_host_key_details`（锁住 `check_server_key` 这条唯一产生主机密钥错误的路径）。
    - 契约文档同步：`.trellis/spec/backend/tauri-command-contracts.md`、`.trellis/spec/frontend/tauri-command-contracts.md`。
    - **验证状态**：前端本机通过；Rust `cargo check` / `cargo test` 经 CI 全绿（run 34953115609 @ `4caaf0d`），详见下方「环境能力变更记录」。
- [x] 更新 TypeScript DTO 与所有调用方（`ConnectionDialog.tsx`、`WorkspaceShell.tsx` 的错误摘要/阶段/建议逻辑）；过渡期前端必须容忍 `raw_message` 缺失。
- [x] 验证 token、password、private key、raw command、host path 不出现在响应、日志和错误 toast。
  - 用例证据：`remote_service_status_exposes_only_token_preview`（状态 DTO 只含 `...-value` 形式 preview）、`dangerous_command_rejection_previews_reason_without_echoing_command`（拒绝原因不回显命令原文）、`plaintext_credential_args_are_rejected`（明文凭据参数入口拒绝）、`redacted_connection_serialization_excludes_secret_material`、`remote_token_hash_verifies_without_plaintext_sidecar_arg`（token 不进 sidecar 命令行）。
  - 命令超长按字节拒绝且不回显内容（`mcp_command_too_long` 只带 `command_bytes=N`）；诊断日志只写 `diagnostic_id` + `code` + `recoverable`。

## Phase 4：输入边界与生命周期

- [ ] 为 remote exec、Docker、WebDAV、remote file、tunnel、shell quoting 增加 Windows 与 POSIX 负向用例。
- [ ] 对 PTY、runner、tunnel、websocket、MCP sidecar 和 VNC runner host 的成功、失败、取消、窗口关闭四类清理路径做源码级核查：确认每个 owner 都有对应清理分支且幂等。
- [ ] 用 `cargo test` 驱动完成上述资源回收的运行时验证：**可验证（经 CI）**，走 `.github/workflows/ci.yml` 的 rust 三平台矩阵；仍不具备时才记 `ENVIRONMENT-BLOCKED` 并附完整证据，不得声称已通过。
- [ ] 对 Vault 回读、known-host changed 拒绝和连接失败语义做回归测试（同样经 CI 的 rust 矩阵验证）。

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

# Rust 侧：需要完整工具链。执行路径有两条，任一可用即不得记 ENVIRONMENT-BLOCKED：
#   (1) 本机完整工具链（Windows 需完整 MSVC C++ 工作负载 + Windows SDK；macOS 用 Xcode CLT 的 clang/ld）；
#   (2) GitHub Actions `.github/workflows/ci.yml` 的 rust 矩阵（ubuntu-22.04 / windows-latest / macos-26），
#       runner 自带完整工具链，跑 `cargo check --workspace --locked` 与 `cargo test --workspace --locked`。
#       CI 为联网环境，故不加 --offline。走此路径时记录 commit SHA、job 名与结论作为证据。
# 两条路径都不具备时才记 ENVIRONMENT-BLOCKED，不得记为通过，并附 design.md §9.1 形式的完整错误证据。
cargo audit                                    # 未安装时报 ENVIRONMENT-BLOCKED
cargo check --workspace --locked --offline
cargo test --workspace --locked --offline
```

每条命令都要记录工具版本、退出码和 `PASS`/`FAIL`/`ENVIRONMENT-BLOCKED`；经 CI 执行的记录 commit SHA 与 job 结论。

### 环境能力变更记录（2026-09-11）

本机 Windows 因 MSVC C++ 工作负载半装 + 缺 Windows SDK，`cargo check` / `cargo test` 始终不可执行。新增 `.github/workflows/ci.yml`
后，Rust 编译与测试改由 GitHub runner 承担，**Rust 编译类验收不再整体阻塞**：

- commit `320c892`：frontend job PASS（pnpm 对齐 11.22.0 后 `pnpm install --frozen-lockfile` 恢复）。
- commit `608edf6` / `320c892`：Windows `cargo test` 实际跑完全量用例，**252 passed / 1 failed**——证明 Windows 侧编译与测试链路可用。
  唯一失败项为 `terminal::local::tests::local_session_accepts_input_and_returns_output`（Windows 本地 PTY 往返用例），
  已单独定位并修复，见下方「已修复项」。
- commit `58f6172`：**CI 全绿**——frontend job 与 rust 矩阵（ubuntu-22.04 / windows-latest / macos-26）`cargo check` + `cargo test` 全部 PASS。
  Windows 侧 **253/253 通过**，其中 PTY 往返用例为其 2026-06-18 引入以来**首次真正通过**。
- 因此：Batch B、Phase 3、Phase 4 中「需 `cargo check` / `cargo test` 验证」的条目由 ENVIRONMENT-BLOCKED 改判为**可验证（经 CI）**，
  且该通道已由 `58f6172` 的全绿结果实证可用。仍需真实 GUI 会话的项（如 Batch C 的 `tauri dev` runner 窗口回归）**不在此列**，继续保持阻塞状态。
- commit `f59076c`：**Phase 3 CI 全绿验收证据**——run 34918439293，frontend job 与 rust 三平台矩阵
  （linux-x64 / windows-x64 / macos-arm64）`cargo check` + `cargo test` 全部 `success`。
  说明：Phase 3 的 MCP 监听策略、限流/并发、命令长度上限、`AppError` 收敛（§5.3 第 1/2/4 步）落地后编译与全量单测通过。
  过程留痕：首推 `875b3f4` 因 `mcp.rs:1312` 把 `format!` 的 `String` 传给 `AppError::new` 的 `&str` 形参（E0308）三平台一致失败，
  `f59076c` 借用为 `&str` 修复；此为 `cargo check` 首错即停、`cargo test` 被跳过的典型编译错误，非测试回归。
- commit `4caaf0d`：**§5.3 第 3 步 CI 全绿验收证据**——run 34953115609，Frontend checks 与 Rust 三平台
  （linux-x64 / windows-x64 / macos-arm64）`cargo check` + `cargo test` 全部 `success`（Package windows-x64 为 build-only，非 tag/dispatch 触发故 skipped，属预期）。
  说明：`AppError.raw_message` 加 `#[serde(skip_serializing)]`、新增 `AppErrorDetails` 判别联合与 `to_internal_json` 内部通道后编译与全量单测通过；
  新增用例 `ipc_serialization_drops_raw_message` / `internal_json_preserves_raw_message` / `details_survive_ipc_round_trip` /
  `details_field_is_omitted_when_absent` / `host_key_changed_details_carry_old_fingerprint` / `russh_app_error_mapping_preserves_host_key_details` 均随该矩阵通过。
  本机 Rust 工具链本轮复核仍 ENVIRONMENT-BLOCKED（MSVC CRT 的 `include/vcruntime.h`、`lib/x64/msvcprt.lib` 与 Windows Kits 10 Include 均缺失，形态同 `design.md` §9.1；
  另注意 `which -a link.exe` 命中 Git coreutils 的 `/usr/bin/link.exe`，其 `link: extra operand` 报错是**误导性表象**、非根因），故该步 Rust 验收经 CI 通道达成；
  前端侧另经 `npx tsc --noEmit`、`node --test scripts/*.test.mjs` 37/37、两项 source check 本机通过。
- commit `443e4a8`：完成 main / `vnc-runner-host` capability 拆分，并新增 capability policy 静态检查与 5 个负向单测；GitHub Actions run `35065160284` 的 Frontend checks 与 Rust 三平台 `cargo check` / `cargo test` 全部 `success`，但该 run 尚未执行独立的 `check:tauri-capabilities` step。
  本机随后执行 `pnpm run check`、`node --test scripts/*.test.mjs`（42/42）、`pnpm run check:tauri-capabilities` 和 `node scripts/check-startup-module-boundary-source.mjs`，均 PASS。真实 `tauri dev` runner GUI 回归仍为 `ENVIRONMENT-BLOCKED`；当前无 `cargo`，无法启动 Tauri 应用验证窗口与未授权 IPC 行为。

- commit `55a2cb7`：run `35085375573` 已由 GitHub API 核实为 `completed/success`；新增 `Tauri capability policy` step 实际执行且 `success`，前端其余步骤与 Rust 三平台 check/test 均通过。Windows 打包按 push 规则 skipped，非 GUI/打包验收。
- Batch E 环境复核：默认 PATH 未包含 Rust 工具，但 `D:\tmp\nexaterm-rust\cargo-home\bin` 实际有 cargo `1.98.1` / cargo-deny `0.20.2`；设置 `CARGO_HOME` / `RUSTUP_HOME` / PATH 后 `cargo metadata --locked --offline --no-deps` PASS。前文“当前无 cargo”只代表当时 PATH 探测，不是未安装；本机 GUI/链接工具链仍未验收。

#### 已修复项：Windows 本地 PTY 往返用例（根因已确认并经 CI 验证）

- 现象：`local_session_accepts_input_and_returns_output` 在 Windows runner 上超时，三次构建（150s / 70s / 90s 负载各异）稳定复现，非偶发。
- **并非 CI 引入的新问题，而是既有失败被首次自动化暴露**：
  - 该用例由 `29dd4e3 feat: 实现本地终端`（2026-06-18）引入。
  - `.trellis/tasks/08-01-encrypted-connection-transfer/prd.md:45`（2026-08-01，**工具链完好的本机**跑全量套件）已记录：
    「Full Rust suite remains 245/246 because the **pre-existing** `terminal::local::tests::local_session_accepts_input_and_returns_output`
    **blocks in PTY read and times out**」——即在健康本机上同样卡死，且当时已知为既有问题，以「不在本任务范围」豁免。
  - `.github/workflows` 历史共 7 次提交，本次之前**只有 `release.yml`**，而 `release.yml` 全程仅执行 `pnpm run package:*`（`tauri build`），
    **不含任何 `cargo test`**。故上游多次成功发版只证明**编译/打包链路正常**，不构成该测试曾通过的证据。
  - 结论：此用例自引入起**在任何环境下都未通过过**；它从未拦截过发版，因为发版流程根本不执行它。
- 推论（强化根因判断）：若属 CI 环境脆弱，健康本机应当通过；而实测「哪里都卡、且都卡在 PTY read」，
  正是「无人应答 ConPTY 光标查询」这一**与环境无关**的必然结果。先前「runner 负载导致时序不足」的假设据此彻底排除。
- 定位过程（分三步，每步都用 CI 实测推翻或确认假设，不臆断）：
  1. 初判怀疑 runner 负载导致时序不足 → 放宽窗口至 30s 并加装诊断探针（commit `c08adad`）。
  2. 探针回报 `read 4 bytes so far: "\u{1b}[6n"`——30s 内**只有这 4 个字节**，随后完全静默。**时序假设被证伪**。
  3. 该 4 字节即 DSR-CPR（`ESC[6n`），是 ConPTY 启动时向终端查询光标位置的握手请求。
- **根因（层次已确认，在测试层，非产品缺陷）**：ConPTY 启动时发出 `ESC[6n` 并**在收到 `ESC[row;colR` 应答前不推进后续输出**
  （依据：Microsoft「Console Virtual Terminal Sequences」文档 DECXCPR 定义——响应须写回 console 输入流；
  microsoft/terminal#17716 说明 `PSEUDOCONSOLE_INHERIT_CURSOR` 启动阻塞行为）。本用例自己充当终端角色却从未应答，
  于是 cmd.exe 的回显永远不会到来。
- **产品不受影响（已核实）**：`LocalTerminalSession::open` 仅是 `portable-pty` 薄封装；`manager.rs` 的 `spawn_local_reader`
  只把原始字节 `emit_terminal_output` 给前端，不做解析或过滤；DSR 由前端 xterm.js 自动应答。**不存在无头消费该 reader 的路径。**
- 处置：读线程以终端身份逐次应答 CPR（`ESC[1;1R`）。**未使用 `#[ignore]`、未删除断言、未放宽校验**；
  共享缓冲诊断保留，若后续再有其他握手序列阻塞，失败信息仍会直接指出卡在哪几个字节。
- **验证结果（commit `58f6172`）**：Windows rust job PASS，**253/253**，该用例首次通过；Linux / macOS 同步全绿。
  根因判断由此获得实证，而非仅停留在推理。

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
