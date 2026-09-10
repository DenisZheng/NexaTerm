# 当前状态基线

> 审计日期：2026-09-09。结论来自本地源码、配置、锁文件和可运行脚本；“Confirmed”表示静态链路存在，不表示三平台互操作已经验收。

## 1. 能力矩阵

| 能力 | 状态 | 证据与边界 |
| --- | --- | --- |
| SSH | Confirmed（静态） | `src-tauri/src/terminal/session.rs` 使用 russh 建立会话、认证、PTY、exec、SFTP 和 forward；需真实服务器验证算法、超时和重连。 |
| Host Key | Confirmed（静态） | `src-tauri/src/known_hosts/mod.rs` 与 `KnownHostClient` 校验 Trusted/Unknown/Changed，并有 Rust tests；未完成三平台真实变更/拒绝流程。 |
| SFTP / Remote File | Confirmed（静态） | `terminal/session.rs` 的 `ReusableSftpSession`、`remote_files` 命令和 lazy `RemoteFilePanel`；需大文件、断线和权限互操作。 |
| Local Shell | Confirmed（静态） | `terminal/local.rs` 使用 portable-pty，`TerminalManager` 管理 reader/cleanup；尚无三平台 PTY 长时证据。 |
| WSL 自动发现 | Confirmed（静态） | `terminal/local_profiles.rs` 调用 `wsl.exe`，处理 UTF-16/UTF-8 输出并有 tests；仅 Windows。 |
| Serial | Confirmed（静态） | `terminal/serial.rs`、serialport 依赖和命令入口存在；需真实硬件和权限验证。 |
| Telnet | Confirmed（静态） | `terminal/telnet.rs` 与 manager/command wrapper 存在；需明文协议风险和互操作验证。 |
| Jump Host | Confirmed（单跳静态） | `terminal/session.rs` 的 `connect_target_client` 使用 direct-tcpip，`validate_jump_runtime` 明确拒绝嵌套 jump；不应标成多跳。 |
| HTTP/SOCKS Proxy | Confirmed（静态） | `open_proxy_stream` 支持 HTTP CONNECT、SOCKS5，配置在 `connections/mod.rs`；代理认证、DNS、超时仍需互操作。 |
| Local/Remote/Dynamic Tunnel | Confirmed（静态） | `src-tauri/src/tunnels.rs` 有三种 TunnelKind、启动/停止和 dynamic SOCKS；需 bind 权限、泄露和异常清理测试。 |
| Split | Confirmed（静态） | WorkspaceShell 与终端面板持有 split layout/active pane；需多 tab、重连、关闭边界测试。 |
| Sync Input | Partial | 有 split sync handler 和 source checks，但跨 tab/目标选择契约仍由 WorkspaceShell 组合，尚缺独立状态测试。 |
| Command Sender / MultiExec | Partial | 有 history/targets/controller 与 UI；`check-command-sender-mvp-source.mjs` 报缺少 `commandSenderHistory`，SSH 激活 tab 同步检查也失败，属于契约未固化/可能漂移。 |
| RDP | Partial / platform-dependent | `rdp.rs` 有 Windows native/embedded 路径与非 Windows external/stub 路径；IronRDP 检查受本机 Windows Rust 链接环境不可用阻塞（MSVC C++ 工作负载半装 + 未安装 Windows SDK），不能宣称三平台可用。 |
| VNC | Confirmed（静态 runner） | `vnc.rs` 有 noVNC websocket relay/fallback runner 和 session manager；真实 server、外部进程退出、平台窗口需验收。 |
| Workspace persistence | Partial | `shared/tauri/windowState.ts` 仅恢复 `mxterm.windowState.v1` 窗口几何；未发现保存连接 session/tab/split 布局的 schema 或恢复链路。 |
| Vault / Secret | Confirmed（静态） | `storage_vault.rs` 使用 Argon2id + AES-256-GCM，`secure_bundle.rs` 保护传输包，并有“不含明文”测试；需审计日志、错误和迁移。 |
| WebDAV | Confirmed（静态） | `webdav_sync.rs` 有 snapshot upload/download、锁和共享传输逻辑；需服务端兼容及冲突策略测试。 |
| AI / MCP | Confirmed（静态，安全待审） | `mcp.rs`、AI stream/state、sidecar 命令存在，默认 remote host 为 `0.0.0.0` 且有 token；需要绑定策略、权限和命令注入审查。 |
| Monitoring | Confirmed（静态） | `remote_monitor`、事件和面板存在；CPU topology source check 受缺少 TypeScript 阻塞，采集性能尚未验收。 |
| X11 | Missing | 未发现对应 Rust module/command/runner 的完整实现；需求 v1 仍列为验收项，应单独决策交付范围。 |
| i18n | Weak | 未发现 i18n 依赖或 catalog；features 中存在大量硬编码中文和 `toLocaleString("zh-CN")`。 |
| Frontend tests | Weak | `package.json` 的 `test` 是 no-op，没有 Vitest/jsdom；已有脚本测试但不能替代状态/组件测试。 |
| Lazy loading / startup | Confirmed（源码） | `main.tsx`、`App.tsx` 动态加载 WorkspaceShell/VNC 等，已有 idle prewarm；`check-startup-module-boundary-source.mjs` 通过，build 也生成了独立的 WorkspaceShell/Terminal/RemoteFileEditor/VNC chunk。 |
| 三平台 build/run | Environment-blocked | Rust/cargo 已安装到 `D:\tmp\nexaterm-rust`；本机 Windows 的 MSVC C++ 工作负载不完整（缺 CRT 头文件与 `lib\x64`）且未安装 Windows SDK，`link.exe` 虽存在但无法工作，仍未取得 Windows/macOS/Linux 构建和运行证据。 |
| FTP/FTPS | P2 / not in current baseline | 需求表列为 P2，当前不是 v1 主线阻塞。 |

## 2. 已执行验证

### Source checks

运行全部 `scripts/check-*.mjs`：

- 60 个脚本中 50 个通过、10 个失败。
- Rust 工具阻塞：`check-ironrdp-macos-prototype.mjs` 与 `check-rdp-release-readiness.mjs` 受本机 Windows Rust 链接环境不可用影响退出 1（工具链复核见 `SECURITY_REVIEW.md`）。
- 检查脚本/契约待处理：AppSelect 选中态、Command Sender 激活 tab/历史、暗色 hover、scrollbar token、iTerm2 scheme；`check-connection-quick-search-source.mjs` 的 TypeScript 输出目录假设与当前 tsc 输出不一致。
- `check-connection-jump-source.mjs` 仍报“未来 jump 实现缺失”，但当前 `terminal/session.rs` 已实现单跳 direct-tcpip；这是检查脚本相对源码的漂移，不能当成能力缺失。

### Node tests

- 7 个 `scripts/*.test.mjs` 逐文件直接执行全部通过。
- 授权环境运行 `node --test scripts/*.test.mjs`：37 tests、37 pass、0 fail。
- 受限 sandbox 的 child-process `spawn EPERM` 仍是环境限制，不是测试失败。

### 依赖与构建

- Node v22.22.3、pnpm 11.22.0 可用。
- cargo/rustc `1.98.1` 与 cargo-deny 已安装到 D 盘；`cargo metadata --locked --offline` 已通过（708 个 crate），`cargo check/test` 仍不可用：本机 MSVC 缺 CRT 头文件与 `lib\x64`、且未安装 Windows SDK（`link.exe` 本身存在），属本机环境问题而非仓库缺陷。`cargo-audit` 未单独安装。
- 默认镜像的 `pnpm audit` endpoint 不可用；切换 npm 官方 registry 后得到 0 critical、5 high、16 moderate、5 low（26 advisories）。这些结果需在锁文件和依赖升级后重新验证。
- `pnpm run check` 通过；`pnpm run build` 在授权环境通过，Vite 仅报告若干大于 500 kB 的非阻断 chunk；受限沙箱运行 build 时曾因 esbuild `spawn EPERM` 失败。
- `pnpm test` 仍只打印“frontend tests not configured yet”，所以前端自动化门禁依旧缺失。

## 3. 证据限制

本文件没有宣称真实 SSH/SFTP、串口、WSL、RDP/VNC/X11、三平台、性能、崩溃隔离、签名、公证或安装器验收已经完成。后续任务必须在相应平台/设备/服务可用时补齐证据，并保留失败日志。
