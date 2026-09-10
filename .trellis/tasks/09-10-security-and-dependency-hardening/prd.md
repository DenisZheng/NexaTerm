# Task 01：安全与依赖硬化

## Goal

在不改变 Vault 密文格式、host key 校验和现有协议边界的前提下，收敛 NexaTerm 的供应链、Tauri IPC、MCP 远程服务、错误返回和远程输入边界，使高风险项可验证、可回滚，并形成后续发布门禁所需的证据。

## Confirmed Facts

- `docs/SECURITY_REVIEW.md` 已记录 npm audit 基线为 5 high、16 moderate、5 low；Rust 离线 cargo-deny advisory 检查发现 10 个 RustSec advisory。
- `src-tauri/tauri.conf.json` 当前 `security.csp` 为 `null`。
- `src-tauri/capabilities/default.json` 将窗口、dialog、opener、process、updater、clipboard 等权限放在同一 capability，并覆盖 `main` 与 `vnc-runner-host`。
- `src-tauri/src/mcp.rs` 当前默认远程 host 为 `0.0.0.0`、port 为 `8765`；remote 默认关闭，危险命令默认关闭，已有 token/hash/preview 和危险命令检测基础。
- `src-tauri/src/app_error.rs` 当前序列化 `code`、`message`、`raw_message`、`recoverable`，`raw_message` 可能携带路径、命令或连接细节。
- Task 00 已完成依赖图和离线审计证据。其记录的「Windows 缺少 MSVC `link.exe`」经 2026-09-10 复核为**误诊**：`link.exe` 与 `cl.exe` 均存在，真实原因是原始基线机器的 VS 2022「使用 C++ 的桌面开发」工作负载半装（缺 CRT 头文件与 `lib\x64`）且 Windows SDK 未安装。该机器上 C 盘仅 3.16 GB 可用，不足以安装 SDK（D 盘 663 GB、E 盘 52 GB）。此为单机环境问题，不是仓库缺陷，详见 `design.md` §9。

## Requirements

### 供应链与许可证边界

- 保留现有 lockfile 的可重复性；所有依赖变更必须小批次、可单独回滚，并记录直接依赖、传递依赖、兼容性和许可证影响。
- 对 npm/Rust advisory 分级处理：Critical/High 必须修复、隔离或形成明确风险接受；不能用忽略规则掩盖未评估风险。
- 不引入 GPL、AGPL、LGPL 或许可证不清的依赖；MPL 文件边界、NOTICE 和第三方清单由 Task 02 继续维护，本任务只验证升级不破坏该边界。

### Tauri capability 与 CSP

- 按窗口和实际 command 使用证据拆分 capability，移除未使用的宽权限；不得因方便测试而扩大生产权限。
- 盘点 Monaco、noVNC、动态资源和 updater 的实际 CSP 需求；能收紧时采用可测试的 CSP，不能收紧时记录具体资源、暴露面、缓解措施和风险接受人。
- capability/CSP 变更必须有配置级或集成级负向测试，覆盖未授权窗口、未授权 command、外部导航和资源加载失败。

### MCP 与远程输入

- 保持 remote 默认关闭、危险命令默认关闭、token 不以明文日志输出；无 token、错误 token、过期/重启状态必须明确拒绝。
- 默认监听策略已确认：默认 `127.0.0.1`；只有用户显式启用远程监听并确认暴露风险时才允许非 loopback 地址。继续使用 token、强制认证、preview、危险命令关闭和暴露审计。
- 为 MCP remote、command preview、危险命令、连接暴露、速率限制和服务停止/重启建立可重复测试；测试 token、测试密码不得被误报为生产秘密。
- 对 remote exec、Docker、WebDAV、远程文件、shell quoting、路径穿越、DNS/转发地址和输出大小建立输入验证及负向测试；不使用 UI 过滤、静默截断或吞异常掩盖根因。
- 资源清理覆盖 PTY、子进程、forward channel、websocket、MCP sidecar 和窗口关闭/异常路径。

### 错误与日志

- 前端可见错误只返回稳定错误码、可操作的安全消息、recoverable 标志和诊断关联 ID；默认不得返回 secret、私钥、token、主机路径、完整命令或连接细节。
- 日志记录请求/关联 ID、分支和失败类别，不记录 token、密码、私钥、完整命令和敏感路径；保留必要的内部诊断能力。
- 错误 schema 的兼容策略必须明确，旧调用方不能因删除字段而静默误判成功。

## Constraints

- 不改变 Vault 密文格式、Argon2id/AES-GCM 存储协议或 host key 校验策略。
- 不新增协议功能，不关闭 changed host key 拒绝，不把安全问题转移到前端显示层。
- 遵守 `.trellis/spec/backend`、Tauri command contract、logging/error handling 规范以及跨平台约束。
- Task 02 负责完整许可证清单，Task 03 负责测试基线；本任务必须为两者提供可执行接口和证据。
- 不能把缺少 MSVC linker 当作 Rust 测试通过；所有环境阻塞必须单独记录。

## Acceptance Criteria

- [ ] npm/Rust audit、advisory、来源和许可证结果均有版本、命令、lockfile 状态和未解决项；无未评估 Critical/High。
- [ ] capability 按窗口/用途完成证据化拆分；CSP 已收紧并通过资源回归，或有经批准的明确风险接受记录。
- [ ] MCP 的默认监听、认证、危险命令、连接暴露、速率限制、日志脱敏和生命周期均有实现设计与 negative tests；默认行为符合已确认的监听策略。
- [ ] 存量非 loopback 配置在升级后被降级为 loopback 且**不静默改写用户存储**，设置页有可见的重新确认入口；「非 loopback + 未确认」的保存请求被 fail-fast 拒绝。
- [ ] AppError/日志不泄露 secret、私钥、token、主机路径、完整命令或连接细节，且诊断关联 ID 可追踪；`raw_message` 下线前，前端错误摘要/阶段/修复建议已改由稳定 `code` 驱动，未出现通用错误吞掉具体失败。
- [ ] remote exec、Docker、WebDAV、远程文件和 shell/path 输入边界有拒绝用例。
- [ ] PTY/runner/tunnel/websocket/sidecar 资源在成功、失败、取消、窗口关闭四类路径下完成源码级清理分支核查，并在具备完整工具链的环境中通过运行时验证；环境不具备时记 `ENVIRONMENT-BLOCKED` 并附完整证据，不得声称已通过。
- [ ] 依赖和配置变更可逐批回滚，Vault 数据可回读，lockfile 一致；没有新增协议或数据格式破坏。
- [ ] 所有可运行验证均有明确 PASS/FAIL/ENVIRONMENT-BLOCKED 结果；未把工具缺失（`cargo audit`）、MSVC CRT/Windows SDK 缺失或 `link.exe` 不可用记为通过。

## Out of Scope

- 新增 SSH/RDP/VNC/X11/WebDAV/MCP 协议能力。
- Vault 密文格式、密钥派生协议、host key 信任语义的迁移。
- 完整第三方许可证清单和 MPL notice 维护（由 Task 02 负责）。
- 大规模 WorkspaceShell/UI 重构、启动性能重构和业务功能改版。

## Confirmed Product Decisions

### D1：MCP 默认采用 loopback 安全策略

默认监听 `127.0.0.1`；非 loopback 监听必须由用户显式开启并确认暴露风险。远程模式仍要求 token 认证、连接暴露审计、preview、速率限制，且危险命令默认关闭。

该方案会增加远程接入的配置步骤，但能缩小误配置导致的局域网暴露面，符合安全默认值原则。

### D2：存量非 loopback 配置的迁移策略（2026-09-10 确认）

升级后，存量配置中已保存的非 loopback `remote_host` 视为**未确认**：生效值降级为 `127.0.0.1`，并在设置页提示需重新确认。

关键约束：

- **不静默改写用户存储**——只降级生效值，不改写已保存的 `remote_host`；降级状态通过状态 DTO 暴露给 UI。
- 重新确认后恢复用户原本保存的地址。
- 拒绝的替代方案：仅改新默认（存量误暴露不收敛）／强制改写所有非 loopback（会让正在远程使用的用户直接断连且不可审计）。

代价：存量远程用户升级后会连接失败一次，需要重新确认。这是为收敛存量误暴露付出的显式代价，且失败可见、可恢复。

### D3：验证项与执行平台解耦（2026-09-10 确认）

原始基线机器（Windows）的 VS 2022「使用 C++ 的桌面开发」工作负载为半装状态（缺 CRT 头文件/库与 Windows SDK），需要链接的 Rust 验证在该机器上不可用，详见 `design.md` §9.1。

**这是单台机器的环境事实，不构成任务范围裁剪。** 已确认决策：

- Rust 编译/测试类验收项——`cargo check`、`cargo test`、Tauri build，以及其驱动的 SSH / Jump / Proxy / SFTP / Tunnel / Host Key 运行时回归、PTY / runner / tunnel / websocket / sidecar 资源回收验证——**全部保留为必需项**，但必须在具备完整工具链的环境中执行，不绑定具体操作系统。
- 执行环境不具备时记 `ENVIRONMENT-BLOCKED` 并附完整错误证据，不得记为通过，**也不得据此删除该验收项**。
- 执行环境迁移（例如改到 macOS，改用 Xcode Command Line Tools 的 clang/ld）后，以新环境重新运行基线命令的结果为准，`design.md` §9.1 的旧结论自动失效。
- 不触发编译的 Rust 审计在任何环境都应优先完成：`cargo metadata`、`cargo deny check advisories`。

## Notes

- 本文件只记录需求、边界和验收，不承载技术实现步骤；技术设计见同目录 `design.md`，执行清单见 `implement.md`。
