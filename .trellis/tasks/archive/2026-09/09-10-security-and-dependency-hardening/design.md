# Task 01：安全与依赖硬化技术设计

## 1. 设计目标

以现有 Rust/Tauri + React 架构为边界，沿供应链、IPC capability、MCP service、输入验证、错误/日志和资源生命周期六条路径建立可审计的安全控制。设计优先复用现有 `AppError`、Vault、known-host、MCP token 和 validation helper，不引入新的协议栈或秘密存储格式。

## 2. 边界与所有权

| 边界 | 所有权 | 设计原则 |
| --- | --- | --- |
| npm/Rust 依赖 | package manifests、lockfiles、audit evidence | 小批次升级，锁文件为事实来源，升级前后都要审计 |
| Tauri capability | `src-tauri/capabilities/*.json`、`tauri.conf.json` | capability 按窗口/用途最小化，默认拒绝未列出的能力 |
| MCP service | `src-tauri/src/mcp.rs` 及其调用边界 | 认证、暴露范围、命令策略和限流在 Rust 内完成，UI 仅显示状态 |
| 错误/日志 | `app_error.rs`、command 边界、logging helpers | 安全消息与内部诊断分层，敏感值只进受控诊断上下文 |
| 文件/命令输入 | remote exec、Docker、WebDAV、remote file、tunnel | 结构化参数优先，路径 canonicalize/allowlist，禁止拼接 shell 命令 |
| 生命周期 | PTY、runner、tunnel、websocket、sidecar/window | 所有 owner 都有正常、失败、取消、关闭四类清理路径 |

## 3. MCP 远程服务设计

### 3.1 配置状态

- `remote_enabled=false` 继续作为总开关。
- `remote_host` 默认值由 `DEFAULT_REMOTE_HOST` 固定为 `127.0.0.1`；前端 `defaultMcpSettings.remote_host` 同步由 `"0.0.0.0"` 改为 `"127.0.0.1"`。
- token 只保存 hash/preview；新 token 只在生成动作的受控返回值中出现一次，日志和状态接口只返回 preview。
- `allow_dangerous_commands` 默认 false，危险命令检测与 preview/confirm 语义保持在后端。

### 3.1.1 存量非 loopback 配置的迁移（已确认策略：降级 + 重新确认）

`McpSettings` 以 JSON blob 存于 app setting `mcp.default`，且**没有 schema 版本字段**，只依赖 serde default 做字段级兼容。`remote_host` 是用户可保存项，存量配置中可能存在 `0.0.0.0` 等非 loopback 值。

新增字段（向后兼容，旧 JSON 缺字段时 serde default 为 `false`）：

```rust
#[serde(default)]
pub remote_exposure_acknowledged: bool,
```

**生效值解析必须收敛到单一 seam**，避免 spawn 与各状态 DTO 各自判断：

```rust
/// 返回 (生效 host, 是否因未确认而降级)
fn resolve_effective_remote_host(settings: &McpSettings) -> (String, bool)
```

规则：

| 存储的 `remote_host` | `remote_exposure_acknowledged` | 生效 host | 降级标志 |
| --- | --- | --- | --- |
| loopback | 任意 | 存储值 | false |
| 非 loopback | `true` | 存储值 | false |
| 非 loopback | `false` | `127.0.0.1` | true |

`resolve_effective_remote_host` 必须被以下路径共用，不得各自读取 `settings.remote_host`：
sidecar 启动参数（`mcp.rs` 中 `.arg(&settings.remote_host)` 处）、`McpRemoteServiceStatus.host/url/sse_url`、`McpSettingsOutput.remote_host`、`McpStatus.remote_host`。

**不自动回写存储。** 加载时不静默改写用户的 `remote_host`——静默改用户数据不可审计。改为在状态 DTO 中额外暴露 `remote_host_stored` 与 `remote_host_downgraded`，由设置页显示「原监听地址已因未确认暴露风险而降级为 127.0.0.1，如需恢复请重新确认」。

**写入侧 fail-fast：** `save_settings` 收到非 loopback host 且 `remote_exposure_acknowledged != true` 时，直接以稳定错误码 `mcp_remote_host_not_acknowledged` 拒绝，不做静默降级；只有用户显式勾选确认后才同时持久化 host 与 ack。

**loopback 判定复用：** `src/bin/mxterm_mcp.rs` 已有 `is_loopback_host`（精确匹配 `localhost` / `127.0.0.1` / `::1`）。该函数位于 sidecar 二进制 crate，应用侧无法直接引用，应提取到共享模块供两侧使用，确保「设置页认为安全」与「sidecar 认为安全」判定一致。注意现实现为精确匹配，`127.0.0.2`、`::ffff:127.0.0.1` 会被判为非 loopback；本期保持严格匹配（宁可多要求一次确认），如需放宽必须单独评估。

### 3.2 请求处理

1. 解析请求并限制 body、命令长度、输出长度和并发数。
2. 在任何连接查找、secret 解析或执行前完成认证和暴露范围检查。
3. 通过结构化参数调用现有 command/service；禁止把用户输入拼成 shell 解释器脚本。
4. 对危险命令返回稳定拒绝码和 reason，不执行、不把完整敏感命令写入日志。
5. 通过 request/diagnostic ID 串起审计日志；响应只返回允许的 DTO 字段。
6. 请求完成、失败、取消或客户端断开时释放 stream、child process、PTY 和 semaphore permit。

### 3.3 速率与来源

- 先采用进程内 token/IP 维度的固定窗口或 token bucket；容量、窗口和惩罚结果写入配置/测试，不在 UI 中硬编码。
- loopback 与非 loopback 使用不同的默认限制；非 loopback 需要更严格并发和失败退避。
- 不把 CORS/来源检查当作认证替代；来源检查只作为浏览器误调用的附加缓解。

## 4. Capability 与 CSP

- 先从前端调用点和窗口创建点生成权限矩阵：`main`、`vnc-runner-host` 分开核对。
- 将仅主窗口需要的 dialog、clipboard、process、updater 与 runner 窗口隔离；create/destroy window 只保留给实际拥有者。
- 对 `opener`、外部导航和动态 webview 做显式 origin/URL 约束。
- CSP 采用盘点后最小集合；至少明确 `default-src`、`connect-src`、`img-src`、`style-src`、`font-src`、`script-src` 和 websocket/noVNC 需求。若必须保留 `unsafe-inline` 或 data/blob，应记录每一项的实际调用点。
- CSP 改动必须配合 dev/build 资源加载验证，避免以放宽 CSP 消除回归。

## 5. AppError 与日志契约

### 5.1 现状约束（决定实现顺序）

`AppError`（`app_error.rs`）当前是 4 字段结构体，同时充当**内部错误类型**与**IPC 线上类型**：

```rust
pub struct AppError { code, message, raw_message, recoverable }
```

两个必须先认清的事实：

1. **`AppError::new` 有 585 处调用，分布在 33 个 Rust 文件。** 因此新增字段必须在 `new()` 内部生成默认值，不能要求调用点逐个补参；`raw_message` 的下线也必须走 serde 层开关，不能改 585 个位置。
2. **`raw_message` 是前端的功能性依赖，不只是泄露面。** `ConnectionDialog.tsx` 用它做 `.toLowerCase()` 后分支判定，`WorkspaceShell.tsx` 用 `connectionErrorSummary(code, rawMessage, message)`、`connectionErrorStage(code, rawMessage)`、`connectionErrorSuggestion(code, rawMessage)` 做错误摘要、阶段归类和修复建议。

结论：**直接删除 `raw_message` 会把「具体失败」降级为「通用错误」，正是 prd 禁止的假成功/吞异常。** 因此顺序必须是先补齐服务端分类能力，再下线字段，不可颠倒。

### 5.2 目标契约

- `code`：稳定、可测试、不可包含动态 secret；**并承担原先由 `raw_message` 内容推断出的分类职责**（错误摘要、阶段、修复建议）。
- `message`：面向用户的安全文案，不拼接原始错误。
- `raw_message`：降级为受控诊断字段，生产 command response 不返回。
- `diagnostic_id`：随机关联 ID，用于在内部日志中定位原始错误。
- `recoverable`：只表达是否可重试/需要用户操作，不表达内部异常细节。

### 5.3 实施顺序（不可跳步）

1. **补分类能力**：盘点 `ConnectionDialog.tsx` / `WorkspaceShell.tsx` 中依赖 `raw_message` 文本推断的判定分支，逐条落到稳定 `code` 上（必要时新增/细分 code），并同步更新 TypeScript DTO 与调用方。此步完成后前端不再需要读取 `raw_message`。
2. **加 diagnostic ID**：`AppError` 增加 `diagnostic_id: String`，在 `new()` 内生成（如 UUID），调用点零改动；同时写入内部诊断日志，日志记录 `diagnostic_id` + 失败类别，不记录 token/密码/私钥/完整命令/敏感路径。
3. **关闭线上字段**：对 `raw_message` 加 `#[serde(skip_serializing)]`，一次性从全部 command response 移除，且不影响 585 处调用点与断言 `error.raw_message` 的 Rust 内部测试（它们直接访问字段，不经过 serde）。
4. **兼容窗口**：前端在过渡期必须容忍 `raw_message` 缺失（按可选字段处理），不得因字段消失而误判成功或抛异常。

Rust 内部错误构造与日志仍保留完整 `raw_message`，保留诊断能力；被移除的只是它向 WebView 的暴露。

## 6. 输入验证与资源生命周期

- 路径：拒绝 NUL、相对穿越、未授权根目录和符号链接逃逸；远程路径与本地路径分别验证，不能共用“字符串替换”清理。
- shell：优先 argv/结构化执行；无法避免 shell 时按平台使用明确 quoting helper，并用 Windows PowerShell/CMD、POSIX sh 各自测试。
- Docker/WebDAV：URL、socket、认证 header、上传目标和重定向分别校验；不得把 token 写入 URL 或日志。
- tunnel/forward：bind host、端口、目标 host、stop/restart 和连接断开都要有权限及清理测试。
- PTY/runner/websocket/sidecar：owner drop、join/kill、close channel 和窗口销毁必须幂等；异常路径不得留下后台进程。

## 7. 兼容、迁移与回滚

- 不修改 Vault 密文格式和 host key 数据；依赖升级先做读取/连接 smoke test。
- MCP 配置旧值继续可解析；默认值变化要在设置迁移或状态提示中可见。
- AppError schema 先兼容旧客户端，再移除/隐藏 raw 字段；任何 schema 变更都必须更新 contract tests。
- 每批依赖/配置变更单独提交，保留前一批 lockfile 和可恢复构建证据；安全修复失败时回滚该批，不回滚无关业务改动。

## 8. 风险取舍

- Loopback 默认会增加远程使用配置成本，但显著降低局域网误暴露风险，符合已确认的安全默认值原则。
- CSP 收紧可能影响 Monaco/noVNC/更新器加载；应先证据化实际需求，不能盲目加白名单。
- raw_message 完全删除会损害诊断；分层和 diagnostic ID 能在不把敏感细节送到前端的情况下保留可追踪性。
- 降级存量非 loopback 配置会让正在远程使用 MCP 的用户在升级后连接失败一次，需要重新确认；这是为收敛存量误暴露付出的显式代价，且失败是可见的（设置页提示），不是静默行为。

## 8.1 Batch E：密钥门禁与依赖审计归档

- 新增独立 `security` CI job（只读权限、完整 checkout、不需要 repository secret、不发布 Release）。Gitleaks 固定 `8.30.1`，cargo-deny 固定 `0.20.2`，官方安装包的 SHA256 固定到仓库配置；pnpm 沿用 `11.22.0`。
- Node 脚本包装三类工具并复用原生子进程/JSON/crypto，无新增 npm 依赖。命令分开执行，CI 通过 `always()` 保留其它检查与 artifact，不用 `continue-on-error` 吞掉工具故障。
- Secret scan：完整历史使用显式 `git --log-opts`；当前文件用 `git ls-files` 列表复制到临时目录扫描，拒绝 shallow checkout、未解决冲突和跨目录符号链接等不完整范围。Gitleaks 启用全量脱敏，原始临时报告仅供内存解析，持久化时只保留 path/line/rule/commit。已核实的测试输入以规则+文件+完整源码行 SHA256 精确豁免，记录理由并保留豁免计数；其余任何发现都 FAIL，缺工具或扫描异常也非零退出；不输出任意子进程 stderr。
- npm 使用官方 registry 的 `pnpm audit --json`；Rust 使用 `cargo-deny --locked --format json check advisories` 的机器可读完成信息。区分“有效报告内有发现”和工具/网络错误，后者不得变成空列表或 PASS。保留 advisory ID、依赖版本、严重度/类别与依赖关系；不忽略或自动接受漏洞。npm 合法缺省 GHSA/推断修复范围时保留 registry ID 并以 null 表达未知，各严重度统计按 advisory 数逐项校验（不是依赖版本/路径数）。
- `logs/security/` 存放三个独立 JSON 报告，含命令（无 secret）、工具版本、commit、lockfile SHA256、检查状态与发现项；CI 仅上传这些白名单报告，保留 14 天。依赖有发现写 `REVIEW-REQUIRED`（采集退出 0，安全验收未通过），工具/报告故障写 `FAIL` 或 `ENVIRONMENT-BLOCKED` 并非零退出。
- 覆盖报告结构异常、退出码不一致、找不到工具、网络错误、脱敏、历史中提交后删除的假密钥与当前未提交文件等回归。故意命中用例只在临时 Git 仓库生成，不向本仓库写入可用 secret。
- 回滚仅删除新增 job、脚本与命令入口，不修改 lockfile、应用配置和 Vault 数据。

## 9. 验证环境要求

### 9.1 原始基线机器的工具链状况（实测记录）

Task 00 记录的阻塞原因「MSVC `link.exe` 不存在」经复核为**误诊**。原始基线机器（Windows）的实测证据：

| 检查项 | 实测结果 |
| --- | --- |
| `link.exe` / `cl.exe` | 存在：`E:\Programs\Microsoft Visual Studio\2022\Community\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64\`（54 个文件） |
| MSVC `include\` | **缺失**（无 `vcruntime.h` 等 CRT 头文件） |
| MSVC `lib\` | 仅有 `onecore`，**无 `x64`**，无 `msvcprt.lib` |
| `vcvarsall.bat` | **缺失**，`VC\Auxiliary\Build\` 下只有 `vcvars64.bat` / `vcvarsamd64_x86.bat`，故 `vcvars64.bat` 自身不可用 |
| Windows SDK 10 | **未安装**（`Windows Kits\10\Include` 不存在） |
| Windows Kits 8.1 | 空壳，仅 `References` 目录 |
| 最小 crate `cargo build` | `error: linker \`link.exe\` not found` |
| 加载 `vcvars64.bat` 后 | `'"...\vcvarsall.bat"' is not recognized` |

真实原因：**VS 2022 的「使用 C++ 的桌面开发」工作负载为半装状态**——编译器二进制在，CRT 头文件、CRT 库与 Windows SDK 全部缺失。因此 Task 00 建议的「用 Developer PowerShell 重跑」无效，因为 `vcvars64.bat` 本身就是坏的。

工具链其余部分可用：cargo/rustc `1.98.1`（位于 `D:\tmp\nexaterm-rust`，需显式设置 `RUSTUP_HOME` / `CARGO_HOME`），target `stable-x86_64-pc-windows-msvc`，`cargo-deny.exe` 已安装，`cargo-audit` 未安装。磁盘：C 盘 3.16 GB 可用（**不足以安装 SDK**），D 盘 663 GB，E 盘 52 GB。

### 9.2 本任务的处理：验收项与平台解耦

**上述阻塞是某一台 Windows 机器的环境事实，不是仓库缺陷，也不是本任务的范围裁剪依据。** Rust 编译/测试类验收项在 `prd.md` 中全部保留为必需项，规则如下：

- 验收项只在**具备完整工具链的环境**中执行，不绑定具体操作系统。macOS 使用 Xcode Command Line Tools 的 clang/ld，Windows 使用完整的 MSVC C++ 工作负载 + Windows SDK，Linux 使用系统工具链。
- 若当前执行环境不具备（例如 §9.1 的 Windows 机器），该项记 `ENVIRONMENT-BLOCKED` 并附**完整错误证据**；不得记为通过，**也不得据此从任务范围中删除**。
- 执行环境发生迁移（例如改到 macOS）时，应重新运行基线命令，以新环境的实际结果为准；§9.1 的旧结论自动失效。
- 不触发编译的 Rust 审计在任何环境都可执行，优先完成：`cargo metadata --locked --offline`、`cargo deny --offline --locked check advisories`。
- `cargo audit` 若未安装记 `ENVIRONMENT-BLOCKED`；由 cargo-deny advisories 提供临时 RustSec 证据，完成报告中必须标注二者不等同。

具体到本任务的验收项：`cargo check`、`cargo test`、Tauri build 及其驱动的 SSH / Jump / Proxy / SFTP / Tunnel / Host Key 运行时回归，以及 PTY / runner / tunnel / websocket / sidecar 的资源回收验证，**均属必需项**，只是必须在可用环境中执行。

### 9.3 原始 Windows 机器的工具链修复参考

若仍在 §9.1 那台机器上工作：由 VS Installer 补装「MSVC v143 - VS 2022 C++ x64/x86 生成工具」与「Windows 11 SDK」，安装目标盘必须选 E: 或 D:（C 盘 3.16 GB 不足）。完成后重跑基线命令取得干净证据，再继续本任务的 Rust 回归项。
