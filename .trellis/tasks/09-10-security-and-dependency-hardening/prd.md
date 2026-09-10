# Task 01：安全与依赖硬化

## Goal

在不改变 Vault 密文格式、host key 校验和现有协议边界的前提下，收敛 NexaTerm 的供应链、Tauri IPC、MCP 远程服务、错误返回和远程输入边界，使高风险项可验证、可回滚，并形成后续发布门禁所需的证据。

## Confirmed Facts

- `docs/SECURITY_REVIEW.md` 已记录 npm audit 基线为 5 high、16 moderate、5 low；Rust 离线 cargo-deny advisory 检查发现 10 个 RustSec advisory。
- `src-tauri/tauri.conf.json` 当前 `security.csp` 为 `null`。
- `src-tauri/capabilities/default.json` 将窗口、dialog、opener、process、updater、clipboard 等权限放在同一 capability，并覆盖 `main` 与 `vnc-runner-host`。
- `src-tauri/src/mcp.rs` 当前默认远程 host 为 `0.0.0.0`、port 为 `8765`；remote 默认关闭，危险命令默认关闭，已有 token/hash/preview 和危险命令检测基础。
- `src-tauri/src/app_error.rs` 当前序列化 `code`、`message`、`raw_message`、`recoverable`，`raw_message` 可能携带路径、命令或连接细节。
- Task 00 已完成依赖图和离线审计证据，但 Windows 缺少 MSVC `link.exe`，Rust 编译/测试仍是环境阻塞；C 盘空间不足以直接安装完整 Build Tools。

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
- [ ] AppError/日志不泄露 secret、私钥、token、主机路径、完整命令或连接细节，且诊断关联 ID 可追踪。
- [ ] remote exec、Docker、WebDAV、远程文件和 shell/path 输入边界有拒绝用例；PTY/runner/tunnel/websocket 资源在成功、失败、取消、窗口关闭后可回收。
- [ ] 依赖和配置变更可逐批回滚，Vault 数据可回读，lockfile 一致；没有新增协议或数据格式破坏。
- [ ] 所有可运行验证均有明确 PASS/FAIL/ENVIRONMENT-BLOCKED 结果，未把工具缺失或 linker 缺失记为通过。

## Out of Scope

- 新增 SSH/RDP/VNC/X11/WebDAV/MCP 协议能力。
- Vault 密文格式、密钥派生协议、host key 信任语义的迁移。
- 完整第三方许可证清单和 MPL notice 维护（由 Task 02 负责）。
- 大规模 WorkspaceShell/UI 重构、启动性能重构和业务功能改版。

## Confirmed Product Decision

MCP 默认采用 loopback 安全策略：默认监听 `127.0.0.1`；非 loopback 监听必须由用户显式开启并确认暴露风险。远程模式仍要求 token 认证、连接暴露审计、preview、速率限制，且危险命令默认关闭。

该方案会增加远程接入的配置步骤，但能缩小误配置导致的局域网暴露面，符合安全默认值原则。

## Notes

- 本文件只记录需求、边界和验收，不承载技术实现步骤；技术设计见同目录 `design.md`，执行清单见 `implement.md`。
