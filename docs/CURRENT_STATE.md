# 当前状态基线

> 审计日期：2026-09-09。结论来自本地源码、配置、锁文件和可运行脚本；"Confirmed"表示静态链路存在，不表示三平台互操作已经验收。
> 本文只记录**当前实现的事实**。目标交互规则在 `docs/WORKFLOW_SPEC.md`；"目前 Files 在右侧"是事实，不等于"以后必须在右侧"。

## 0. 2026-09-23 增量校准（WF-00A）

- **2026-09-23 WF-00B 后补记**：HEAD `d722bf5`，CI run `35825557106` 全绿（Windows 打包仍 skipped）；Vitest 13 文件、209 passed / 1 todo；`WorkspaceShell.tsx` 12,876 行。关闭/删除路径已改为 reducer 决策 + `followUp`（`src/features/workspace/sessionTabs/closeDecision.ts`），shell 内只剩 `setActiveRemoteFileTabId` 一个过渡 setter；五类集合仍为 useState。GUI 冒烟与 A01 真实窗口证据待做。
- 提交：`45418f37`（2026-09-21）。CI run `35600276051` 全绿：Frontend checks、Rust linux-x64 / macos-arm64 / windows-x64、Security evidence；Package windows-x64 为 skipped，不能推导安装包已通过。
- 本机：Vitest 12 文件、177 passed / 1 todo（2026-09-23 复跑）。
- `src/features/layout/WorkspaceShell.tsx`：`git show HEAD:… | Measure-Object -Line` = 13,076（347c8b2 = 13,132）。此数字说明职责仍集中，不作为产品完成率或重构验收标准。
- 状态所有权（Task 04 已完成切片）：`split/` reducer + `useTerminalSplitController`；`multiExec/` 只持 sync 三态（`off|live`、targets、error）；`sessionTabs/` 持 7 个指针 + view + mode + homeActive + 2 张记忆表的 `SessionPointerState`，激活/记忆函数已 dispatch action；**五类会话集合（terminalTabs / localTerminalTabs / rdpSessions / vncSessions / remoteFileTabs）与文件布局记忆仍是 useState**，关闭/删除路径仍有约 50 处单值指针 setter（→ WF-00B）。
- 当前 UI 事实（与目标的差距见 WORKFLOW_SPEC §9）：
  - 顶部标签（WF-01 切片 3 起）：`AppTitlebar.tsx` 按会话实例成项（`selectWorkspaceItems` → `buildTitlebarItems`），首页为首个不可关闭项，同一连接多终端各占一项，分屏组一项；聚合"首页 / 终端"按钮已退役，本地终端经标签行末 `+`（`NewSessionMenu`）新建。工作区内部仍保留按连接的终端子标签行（去留见 WORKFLOW_SPEC 后续交付包）。
  - 左侧：连接仓库（`ConnectionPane`，树形分组的 `parentId` 存 localStorage；SQLite `connection_groups` 与 `SyncConnectionGroup` 仍是平面结构）。
  - 右侧：`RemoteFilePanel` 承载 `files | monitor | commands | tools | ai` 五个一级工具；文件传输为 files 面板底部 dock；隧道在 tools 内部。
  - Files 绑定：按保存的 connectionId 解析；有 tab 级 stateKey、terminalPath、手动定位、目录请求失效保护；不自动跟随目录。
  - 新建连接：`ConnectionDialog.submit()` 保存后关闭；`onSave` 返回 `Promise<void>`；shell 的 `saveConnection()` 实际已返回保存结果（WF-02A 可复用）。
  - 快速连接：Rust `TerminalConnectRequest.connection_id` 可选，已有 host/user/key 直连入口；现有 UI 搜索只针对已保存连接；文件 IPC 仍按保存的 connectionId 解析。
  - 批量输入：`buildCommandSenderTargets()` 每个连接选一个子 tab；Local 也聚合为一个目标；Split Sync Input 与 Command Sender 分散。
  - 分屏：`terminalSplitMaxPanes = 4`，横向/纵向/四宫格、拖动比例。
- 未提交改动（非本轮产物，保持不动）：许可证清单任务与脚本（`09-18-license-inventory-and-notices`、`THIRD_PARTY_LICENSES.md`、`scripts/license-*`、`scripts/invoke-pnpm-licenses.ps1`，Task 02 持续任务，PRD 待补）。`09-20-ssh-private-key-file-picker` 空模板任务已于 2026-09-23 删除（对应功能已在 `dc7c655` 交付）。

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
| Split | Confirmed（静态 + reducer 测试） | 2026-09-19 起由 `src/features/workspace/split/` reducer + controller 持有，Vitest 覆盖；需多 tab、重连、关闭边界的真实窗口验证。 |
| Sync Input | Partial | sync 三态已进 `multiExec/` reducer（2026-09-19）；跨 tab/目标选择契约仍由 WorkspaceShell 组合；目标模型改为实例 → WF-04C。 |
| Command Sender / MultiExec | Partial | 有 history/targets/controller 与 UI，目标按连接每组一个；`check-command-sender-mvp-source.mjs` 报缺少 `commandSenderHistory`，SSH 激活 tab 同步检查也失败，属于契约未固化/可能漂移；统一 MultiExec → WF-04C。 |
| RDP | Partial / platform-dependent | `rdp.rs` 有 Windows native/embedded 路径与非 Windows external/stub 路径；IronRDP 检查受本机 Windows Rust 链接环境不可用阻塞（MSVC C++ 工作负载半装 + 未安装 Windows SDK），不能宣称三平台可用。 |
| VNC | Confirmed（静态 runner） | `vnc.rs` 有 noVNC websocket relay/fallback runner 和 session manager；真实 server、外部进程退出、平台窗口需验收。 |
| Workspace persistence | Partial | `shared/tauri/windowState.ts` 仅恢复 `mxterm.windowState.v1` 窗口几何；未发现保存连接 session/tab/split 布局的 schema 或恢复链路。 |
| Vault / Secret | Confirmed（静态） | `storage_vault.rs` 使用 Argon2id + AES-256-GCM，`secure_bundle.rs` 保护传输包，并有“不含明文”测试；需审计日志、错误和迁移。 |
| WebDAV | Confirmed（静态） | `webdav_sync.rs` 有 snapshot upload/download、锁和共享传输逻辑；需服务端兼容及冲突策略测试。 |
| AI / MCP | Confirmed（静态，安全待审） | `mcp.rs`、AI stream/state、sidecar 命令存在，默认 remote host 为 `0.0.0.0` 且有 token；需要绑定策略、权限和命令注入审查。 |
| Monitoring | Confirmed（静态） | `remote_monitor`、事件和面板存在；CPU topology source check 受缺少 TypeScript 阻塞，采集性能尚未验收。 |
| X11 | Missing | 未发现对应 Rust module/command/runner 的完整实现；需求 v1 仍列为验收项，应单独决策交付范围。 |
| i18n | Weak | 未发现 i18n 依赖或 catalog；features 中存在大量硬编码中文和 `toLocaleString("zh-CN")`。 |
| Frontend tests | Partial | `pnpm test` 已是真实 Vitest 门禁（2026-09-19）：纯逻辑模块、`ConfirmDialog`、split/multiExec/sessionTabs reducer 与 controller characterization 接入 CI（2026-09-23：177 passed / 1 todo）；关闭路径、实例投影、MultiExec 目标的测试随 WF-00B/01/04C 补。 |
| Lazy loading / startup | Confirmed（源码） | `main.tsx`、`App.tsx` 动态加载 WorkspaceShell/VNC 等，已有 idle prewarm；`check-startup-module-boundary-source.mjs` 通过，build 也生成了独立的 WorkspaceShell/Terminal/RemoteFileEditor/VNC chunk。 |
| 三平台 build/run | Partial（CI check/test） | 2026-09-23：CI run `35600276051` 的 Rust linux-x64 / macos-arm64 / windows-x64 check/test 均 success；Windows 打包 job skipped；本机 Windows MSVC 环境问题仍存在（见 SECURITY_REVIEW）。仍无三平台**运行**与安装包证据。 |
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
