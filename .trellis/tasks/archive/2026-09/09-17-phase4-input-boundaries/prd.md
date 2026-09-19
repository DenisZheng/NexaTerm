# Phase 4：输入边界负向验证

## Goal

在不改变现有协议、Vault 密文格式、host-key 校验和已确认命令契约的前提下，补齐 remote exec、Docker、WebDAV、remote file、tunnel 与 shell quoting 的输入边界证据。先从可重复的 Rust 单元/契约测试开始，发现真实缺口时再做最小后端修复，避免用 UI 过滤、静默截断或吞异常掩盖根因。

## Confirmed Facts

- 父任务 `.trellis/tasks/09-10-security-and-dependency-hardening` 的 Phase 4 要求覆盖 remote exec、Docker、WebDAV、remote file、tunnel、shell quoting 的 Windows/POSIX 负向用例，并继续核查生命周期清理。
- 当前 Rust 代码已有局部覆盖：`remote_files::quote_posix_shell`、remote-file command builder、Docker JSON/quick-run builder、WebDAV URL/path/size、tunnel rule/SOCKS parser、`network_tools` command builder、`RemoteExecSessionPool` 都已有部分测试，但尚未形成按输入来源和平台组织的完整矩阵。
- 远程 shell 的执行环境是 POSIX shell；Windows 路径应作为不可信数据传入远端命令，不能因为调用端是 Windows 就直接拼接成 shell 语法。`quote_posix_shell` 是现有共享边界。
- Tauri command contract 已规定：保存的 `connection_id` 是唯一连接入口；远程目标必须校验非空；用户控制的远程路径、Docker 参数和诊断目标必须引用；隧道字段按 kind 校验；WebDAV 使用 URL segment 编码并限制响应大小。
- CI 已具备 Linux、Windows、macOS Rust 三平台 `cargo check`/`cargo test`，但没有可依赖的真实 SSH/Docker/WebDAV 外部服务。本子任务不会把纯单元测试描述为真实远端集成验收。

## Requirements

1. 建立输入边界矩阵，逐项记录数据来源、进入层、验证函数、命令/URL 构造方式、错误码和现有测试。
2. 为 POSIX shell quoting 增加跨平台恶意输入用例，至少覆盖空白、单引号、双引号、反斜杠、换行、`$()`、反引号、分号、通配符、Unicode 与 Windows 风格路径；MCP `execute_script.args` 必须先解析为参数词，再逐项引用，不能把原始参数片段拼进命令。
3. 为 remote file 的路径、文件/目录/归档名称、冲突策略和本地目标路径增加负向用例，确认 `..`、路径分隔符、空值、根路径删除和临时文件边界不会绕过既有契约。
4. 为 Docker 的 container/image/network/name/entrypoint/command/env/volume/port 输入增加负向用例，确认所有用户值使用共享 quoting，空值和结构不完整时返回稳定错误，且不接受 SSH 凭据字段。
5. 为 WebDAV 的 scheme、base URL、path segment、query/fragment、点号片段和响应大小边界增加用例；若发现 URL 规范化会越出配置的 base path，必须在 URL 构造层修复并锁定回归。
6. 为 tunnel 的 connection id、kind-specific host/port、动态 SOCKS 目标、非法方法/命令/地址类型/端口增加负向用例；不改变已确认的 dynamic/local/remote 语义。
7. 为 remote exec 入口确认命令长度、超时、非零退出和缓存 session signature 规则不会因异常输入或失败重试绕过边界；不在本子任务中扩展生命周期重构。
8. 所有修复保持 Rust 权威校验和稳定 `AppError` code；不在前端静默改写用户输入，不回显完整命令、凭据或敏感路径。

## Acceptance Criteria

- [x] 输入边界矩阵已写入本子任务设计/交付记录，覆盖六类入口及 Windows/POSIX 差异。
- [x] 每类入口至少有可重复的负向测试；测试能证明输入被拒绝、被安全引用或被编码，而不是只断言函数返回成功。
- [x] 若发现实现缺口，修复范围限于根因和对应回归测试；未修改 Vault、协议格式、lockfile 或无关 UI。
- [ ] `cargo fmt --manifest-path src-tauri/Cargo.toml --check`：本批修改 hunks 已格式化，但父分支既有区域仍使全量命令返回非零；targeted `cargo test` / `cargo check` 已经 CI Linux/Windows/macOS 验证。
- [x] 无真实凭据、主机名、命令原文或可用 secret 进入测试 fixture、日志或报告。
- [x] 真实 SSH/Docker/WebDAV 集成环境未提供，已明确记录为 `ENVIRONMENT-BLOCKED`，没有把单元测试结果表述为运行时安全验收。

## Out of Scope

- PTY、runner、tunnel、websocket、MCP sidecar 的完整成功/失败/取消/窗口关闭生命周期重构；该项作为父任务 Phase 4 的后续子切片。
- CSP 收紧、Tauri GUI runner、IPC/origin 集成测试和发布打包。
- 依赖升级、advisory 风险接受和许可证清单。
- 新增协议能力或改变既有远程文件、Docker、WebDAV、隧道产品语义。

## Confirmed Test Strategy

- 第一切片采用“纯函数/命令构造/请求校验契约测试”，不搭建真实 SSH、Docker、WebDAV 服务。
- 真实 SSH/Docker/WebDAV 端到端验证另行记录为环境门禁。该方案可在三平台 CI 稳定执行，但不能证明远端 shell、服务器实现或 Docker daemon 的运行时行为。
- 若契约测试证明存在需要运行时确认的行为，再单独规划模拟服务或集成环境，不把基础设施建设混入本切片。
