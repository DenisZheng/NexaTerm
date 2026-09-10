# NexaTerm Requirements

> 项目：NexaTerm  
> 基础项目：mXterm  
> 产品定位：轻量、现代、跨平台的 Remote Workstation / SSH 管理工具  
> 目标平台：Windows / macOS / Linux  
> 文档类型：产品需求 + 当前源码基线 + Gap Analysis 上游输入  
> 版本：v1.0  
> 状态：用于 Codex / AskMatt 后续架构细化与任务拆分

---

# 1. 文档目的

本文档是 NexaTerm 当前阶段的统一上游需求文档。

它同时定义：

1. NexaTerm 最终要做成什么；
2. mXterm 当前已经具备哪些能力；
3. 哪些能力需要保留、重构、增强或新增；
4. NexaTerm 的 UI / UX、跨平台、安全、性能和许可证要求；
5. 后续 Codex / AskMatt 应如何基于源码进一步产出架构、计划和开发任务。

本文档不直接指定每个需求对应的源码文件，也不替代仓库中的 `AGENTS.md`。

执行开发任务前，Codex 应优先阅读：

1. 根目录 `AGENTS.md`
2. 本文档 `NEXATERM_REQUIREMENTS.md`
3. AskMatt 后续产出的 Architecture / Development Plan / Task 文档

---

# 2. 项目定义

NexaTerm 基于 MIT License 的 mXterm 继续开发。

NexaTerm 不是简单修改 mXterm 品牌，也不是单纯复制 MobaXterm。

目标是：

> **基于 mXterm 现有 Rust + Tauri 轻量架构，吸收 MobaXterm 成熟的信息架构和远程运维工作流，重构成一个现代、统一、真正跨 Windows / macOS / Linux 的 Remote Workstation。**

最终 NexaTerm 应统一管理：

- SSH
- SFTP
- RDP
- VNC
- Serial
- Telnet
- Local Shell
- WSL
- X11
- SSH Tunnel
- Jump Host
- MultiExec
- Split Workspace
- Remote Files
- Saved Commands
- Monitoring
- Remote Editor
- AI / MCP（保留但不是产品核心定位）

---

# 3. 产品定位

建议 GitHub Description：

> **A lightweight, cross-platform remote workstation for SSH, SFTP, RDP, VNC, Serial, WSL, X11, and more.**

NexaTerm 不应只被定义为 SSH Client，也不应只被定义为 Terminal Emulator。

其正式定位应为：

> **Cross-platform Remote Workstation**

---

# 4. 产品愿景

NexaTerm 希望同时具备三类优势。

## 4.1 MobaXterm 的效率

- Session Tree
- 快速连接
- SSH + SFTP 联动
- 多标签
- Split
- MultiExec
- Tunnel Manager
- X11
- WSL
- 高信息密度桌面运维流程

## 4.2 现代桌面应用体验

- 更清晰的信息层级
- 更现代的 Toolbar
- Command Palette
- 更一致的 Dialog / Context Menu
- Light / Dark
- 更好的 HiDPI
- 更好的 Keyboard-first workflow
- 更合理的跨平台行为

## 4.3 Rust / Tauri 的轻量基础

- 不迁移到 Electron
- 不在发布包中携带 Node Runtime
- 不捆绑独立 Chromium Runtime
- 协议、PTY、存储、平台能力优先留在 Rust/Tauri 层

---

# 5. 产品设计边界

## 5.1 可以参考 MobaXterm

允许高度参考：

- 信息架构
- 主窗口布局
- Session Manager 工作流
- SSH + SFTP 交互流程
- MultiExec 工作模式
- Tunnel Manager 组织方式
- Session 创建流程
- X11 / WSL 入口逻辑
- Split / Tabs 交互
- 专业桌面工具的信息密度

## 5.2 不做像素级复制

不得复制：

- MobaXterm 商标
- MobaXterm Logo
- MobaXterm 原始图标
- 专有图片
- 专有代码
- 专有视觉资源
- 完全相同的像素级视觉设计

NexaTerm 应建立独立品牌和视觉体系。

---

# 6. 核心设计原则

## P-01：跨平台优先

Windows / macOS / Linux 是默认产品前提。

平台差异应集中在 capability/provider 层，而不是让平台判断散落在整个 UI 和业务代码中。

## P-02：保留 mXterm 已有成熟能力

如果 mXterm 已经具备某项真实实现，NexaTerm 应优先：

1. 保留；
2. 测试；
3. 重构；
4. 统一 UX；
5. 增强边界能力。

禁止为了品牌重构而无必要重新实现成熟协议。

## P-03：轻量优先

保持：

- Tauri 2
- Rust
- React / TypeScript
- 系统 WebView

不迁移 Electron。

## P-04：高信息密度

NexaTerm 是桌面专业工具。默认应允许：

- 同屏查看更多 Session
- 查看多个终端
- SSH 与 SFTP 并行
- 快速工具栏
- 明确状态
- 紧凑模式

避免移动 App 式大面积留白。

## P-05：Keyboard Friendly

主要能力都应有：

- 鼠标入口
- Menu
- Shortcut
- Command Palette

## P-06：安全默认值

Host Key、Secret、Tunnel、X11、日志等不得以“方便”为理由长期采用不安全默认配置。

## P-07：许可证可持续

NexaTerm 主项目保持 permissive license 路线。

优先允许：

- MIT
- Apache-2.0
- BSD
- ISC
- Zlib
- 其他明确 permissive license

新增核心依赖未经批准不得引入：

- GPL
- AGPL
- SSPL
- 强 copyleft
- source-available 限制性协议

MPL-2.0 依赖允许存在，但必须进入第三方许可证清单并明确文件级义务。

---

# 7. mXterm 当前源码基线

以下结论基于当前 mXterm `main` 分支静态源码审计。

证据等级：

| 状态 | 含义 |
|---|---|
| **Confirmed** | 已看到真实运行路径或协议调用 |
| **Partial** | 有实现，但平台或流程不完整 |
| **Skeleton** | 只有接口、类型、TODO 或占位 |
| **Not confirmed** | 静态审计没有足够证据 |
| **Runtime required** | 必须通过真实 build / interoperability 验证 |

---

# 8. 当前能力总览

| 能力 | mXterm 当前状态 | NexaTerm 动作 |
|---|---|---|
| SSH | Confirmed | 保留 / Harden |
| Host Key Verification | Confirmed | 保留 / Security Review |
| SFTP | Confirmed | 保留 / UX 重构 |
| Remote File Manager | Confirmed | 保留 |
| Remote Editor | Confirmed | 保留 |
| Local Shell | Confirmed | 保留 / UX 提升 |
| WSL 自动发现 | Confirmed | 提升为正式 WSL Session UX |
| Serial | Confirmed | 保留 / UX 统一 |
| Telnet | Confirmed | 保留 |
| Jump Host | Confirmed（单级） | 保留 / 增强 Multi-hop |
| HTTP / SOCKS Proxy | Partial / 已有模型 | 继续验证与统一 UX |
| Local Tunnel | Confirmed | 保留 |
| Remote Tunnel | Confirmed | 保留 |
| Dynamic SOCKS Tunnel | Confirmed | 保留 |
| Split Pane | Confirmed | 保留 / 架构整理 |
| Split Sync Input | Confirmed | 整合为 MultiExec |
| Command Sender | Confirmed | 整合为 MultiExec |
| RDP | Partial / platform dependent | 保留 / 明确平台能力 |
| VNC | Confirmed | 保留 |
| Monitoring | Confirmed | 保留 |
| Docker Tools | Confirmed | 保留 |
| Command Library | Confirmed | 统一到 Saved Commands |
| WebDAV Sync | Confirmed | 保留 |
| AI / MCP | Confirmed | 保留，可降为次级功能 |
| X11 Forwarding | Missing | 新增 |
| Workspace Restore | Not confirmed equivalent | 新增 / 强化 |
| i18n | Weak | 系统建设 |
| Frontend Tests | Weak | P0 Hardening |
| macOS Intel Release | 当前未正式发布 | 产品决策 |
| FTP/FTPS | 当前未作为正式协议 | P2 评估 |

---

# 9. SSH

SSH 是 NexaTerm 第一核心协议。

mXterm 当前已经有：

- Password
- Private Key
- Passphrase
- Credential modes
- Jump
- Proxy
- Keepalive / timeout
- SFTP integration
- Known Hosts / fingerprint

NexaTerm 应保留其后端能力，并重点完善：

- Session UX
- Authentication UX
- Key Manager
- Reconnect
- Startup Command
- Environment
- Terminal Profile
- Multi-hop Jump
- Security hardening

---

# 10. SSH Host Key Verification

mXterm 当前已经存在：

- `Trusted`
- `Unknown`
- `Changed`

并记录 host、port、algorithm、SHA256 fingerprint、public key 和信任时间。

NexaTerm 应保留此设计，并完善 UI。

首次连接示例：

```text
The authenticity of this host cannot be established.

Host:
example.com:22

Key:
ED25519

Fingerprint:
SHA256:...

[Reject] [Trust Once] [Trust and Save]
```

Host Key Changed 必须明确警告，禁止静默接受。

---

# 11. Credential / Secret Storage

mXterm 当前已经有加密 Vault：

```text
AES-256-GCM
+
Argon2id
```

当前应视为可保留能力。

NexaTerm 需要 AskMatt / Security Review 明确未来是：

### 方案 A

继续使用统一 encrypted vault。

### 方案 B

后续增加平台原生 Secret Backend：

Windows：Credential Manager  
macOS：Keychain  
Linux：Secret Service / Keyring

v1 不要求为了产品改名就重写凭据层。

必须检查：

- local key 权限
- backup behavior
- export behavior
- unlock behavior
- sensitive string lifecycle
- logs
- crash diagnostics

---

# 12. SFTP / Files

mXterm 当前已经具备：

- browse
- upload
- download
- folder operation
- drag & drop
- progress
- transfer queue
- remote edit
- Monaco Editor

NexaTerm 应把其整理成 MobaXterm 类 SSH + Files 联动。

推荐左侧：

```text
Sessions | Files
```

需要重点支持：

- Working Directory Follow
- Upload
- Download
- Drag & Drop
- Rename
- Delete
- New File
- New Folder
- Permission
- Copy Path
- Remote Edit
- Transfer Queue

---

# 13. Local Shell

当前 mXterm 已经通过 `portable-pty` 自动发现本地 Shell。

### Windows

- PowerShell 7
- Windows PowerShell
- CMD
- Git Bash
- WSL

### macOS / Linux

- login shell
- zsh
- bash
- fish
- pwsh

NexaTerm 需要把 Local Shell 从“本地 Profile”提升为完整 Session UX：

- Session Tree
- Favorite
- startup directory
- args
- env
- saved profile
- Split
- Restore
- Quick Commands

---

# 14. WSL

mXterm 当前已经真实实现：

```text
wsl.exe -l -q
```

并处理：

- timeout
- UTF-16
- BOM
- NUL
- distribution parsing

因此 NexaTerm 不需要从零开发 WSL。

需要增强：

- Distribution picker
- User
- Startup Directory
- Shell
- Startup Command
- WSL1 / WSL2 status
- WSLg detection
- Filter system distributions such as docker-desktop
- Save as Session
- Favorite
- Restore

---

# 15. Serial

mXterm 已有真实 Serial Backend。

必须保留：

- Port
- Baud Rate
- Data Bits
- Stop Bits
- Parity
- Flow Control
- read/write
- lifecycle

NexaTerm 需要改善：

- Port auto refresh
- hot plug refresh
- profile save
- Tab / Split integration
- Status
- friendly reconnect
- common baud presets

常用值：

```text
9600
19200
38400
57600
115200
921600
```

---

# 16. Telnet

mXterm 已有 Telnet。

NexaTerm 保留，并统一：

- Session Dialog
- Terminal UX
- Session Manager integration
- saved profile
- Split / MultiExec support

---

# 17. Jump Host

mXterm 当前确认单级 Jump：

```text
Target Session
→ jump_connection_id
→ Saved SSH Connection
```

NexaTerm v1 应保留。

后续增加：

```text
Client
→ Jump A
→ Jump B
→ Target
```

即 Multi-hop / ProxyJump Chain。

---

# 18. Proxy

连接配置已经支持：

- none
- HTTP CONNECT
- SOCKS5

NexaTerm 应统一 Proxy / Jump UX：

```text
Network
├── Direct
├── SSH Gateway
├── SOCKS5 Proxy
└── HTTP CONNECT Proxy
```

---

# 19. SSH Tunnel Manager

mXterm 当前已经确认：

- Local Forward
- Remote Forward
- Dynamic SOCKS5

都存在运行路径。

NexaTerm 不需要重写 Tunnel Backend，主要重构为：

```text
Tools → Tunnel Manager
```

UI：

```text
Name            Type       Status
MySQL           Local      ● Running
SOCKS Proxy     Dynamic    ○ Stopped
Reverse API     Remote     ● Running
```

支持：

- New
- Edit
- Start
- Stop
- Auto Start
- Duplicate
- Error
- active connection count

安全要求：

- 默认 bind localhost
- 非 localhost 时明确风险
- 显示 listen address

---

# 20. Split Workspace

mXterm 当前已有：

- Horizontal
- Vertical
- 4 Pane
- Resize
- Session Picker
- Sync Input

功能可保留。

但是当前 Split/Workspace 状态大量集中于 `WorkspaceShell.tsx`。

NexaTerm 应在 Hardening 阶段先拆分 Workspace state/controller，再进行大规模 UI 改造。

长期目标支持自由递归 Split，而不是只限制固定模板。

---

# 21. MultiExec

mXterm 已经有两套基础。

## A. Split Sync Input

实时输入广播给指定 Pane。

## B. Command Sender

可勾选多个终端目标，然后：

- Send + Enter
- Send without Enter
- Success / Failed status

因此 NexaTerm 的 MultiExec 应定义为：

> **整合现有能力，而不是重新造后台。**

统一入口：

```text
Toolbar → MultiExec
```

模式：

```text
Live Input
Command Send
```

安全 UX：

```text
MULTIEXEC ACTIVE
```

并要求：

- target checkboxes
- obvious active state
- stop button
- high-risk command warning
- IME compatibility
- Paste compatibility

---

# 22. RDP

mXterm 当前 RDP 是平台相关实现。

### Windows

当前能力：

- MSTSC / ActiveX
- embedded host
- external fallback

### Linux

当前主要依赖：

- `wlfreerdp`
- `xfreerdp`

属于 external runner。

### macOS

当前主要使用：

- Windows App
- Microsoft Remote Desktop

通过 `.rdp` 文件和系统打开。

因此 NexaTerm v1 对 RDP 的定义应是：

> **三平台支持 RDP，但允许平台能力不同。**

不得宣传成三平台全部完全内嵌原生 RDP，除非后续完成统一 backend。

后续可评估 IronRDP。

---

# 23. VNC

mXterm 当前通过 noVNC 和本地 loopback WebSocket bridge 实现。

支持：

- embedded
- windowed
- external viewer
- fallback
- clipboard
- resize

NexaTerm 应保留。

安全要求：

- bridge 仅 bind `127.0.0.1`
- tokenized session path
- session lifecycle cleanup

---

# 24. X11

X11 是 NexaTerm 当前最重要的新增模块之一。

目标：

> SSH Session 可以像 MobaXterm 一样开启 X11 Forwarding。

架构拆成：

## X11 Forwarding Core

负责：

- SSH X11 request
- X11 channel
- DISPLAY
- xauth cookie
- trusted / untrusted forwarding
- lifecycle

## Platform X11 Backend

### Windows

支持：

- Built-in X Server
- External X Server
- Auto Start
- Auto Display

具体 X Server 选型必须经过：

- License Review
- Maintenance Review
- Security Review

### macOS

优先：

- XQuartz detect
- start / validate
- missing dependency guidance

### Linux

优先复用：

- Xorg
- XWayland
- DISPLAY
- XAUTHORITY

---

# 25. Session / Workspace Restore

当前 mXterm 静态审计没有确认与 NexaTerm 目标同等级的完整 Workspace Restore。

NexaTerm v1 需要实现：

- open tabs
- active tab
- split layout
- split ratio
- panel sizes
- local shell profile
- WSL profile
- SSH session reference
- optionally reconnect
- failed restore isolation

原则：

> 一个 Session Restore 失败不得阻塞其他 Session。

---

# 26. Remote Editor

mXterm 当前已经有 Monaco Remote Editor。

NexaTerm 保留。

需要保证：

- lazy loading
- conflict detection
- remote save failure UX
- encoding
- file size limits
- binary detection
- not part of initial bundle

---

# 27. Monitoring

mXterm 已有 system/network/Docker/remote-task 类工具能力。

NexaTerm 应保留这些差异化能力，不要为了“像 MobaXterm”删除已经有价值的功能。

推荐统一到：

```text
Tools
├── Monitor
├── Docker
├── Tasks
├── Tunnels
├── Commands
└── X11
```

---

# 28. AI / MCP

mXterm 已有 AI / MCP 相关能力。

NexaTerm 可以保留，但产品核心定位不是 AI Terminal。

原则：

- 不影响首屏
- lazy load
- 可以关闭
- 不影响核心 SSH 工作流
- Provider 可配置
- 不成为强依赖

---

# 29. Home / Start Page

启动后应有 Home，而不是空白终端。

建议：

```text
NexaTerm

Quick Connect
[ user@hostname________________ ] [ Connect ]

Favorites
Recent Sessions
Recent Workspaces
Active Tunnels
```

支持：

- Quick Connect
- Recent
- Favorites
- New Session
- Restore Workspace

---

# 30. Quick Connect

顶部提供：

```text
user@hostname
```

支持解析：

```text
root@192.168.1.10
ssh://user@host:2222
```

临时连接成功后允许：

```text
Save as Session
```

---

# 31. Session Manager

这是 NexaTerm UI 最核心的改造。

左侧采用 Tree View：

```text
Favorites

Production
├── Web
│   ├── web-01
│   └── web-02
├── Database
│   └── mysql-01

Development
├── dev-01
└── test-01

Network
├── Router
└── Switch

Local
├── PowerShell
├── WSL Ubuntu
└── Local Bash
```

支持：

- Folder
- Nested Folder
- Favorites
- Tags
- Search
- Drag & Drop
- Rename
- Duplicate
- Move
- Import / Export

Session Context Menu：

- Connect
- Connect in New Tab
- Connect in Split
- Edit
- Duplicate
- Rename
- Favorite
- Export
- Delete

Folder Context Menu：

- New Session
- New Folder
- Connect All
- MultiExec
- Export

---

# 32. New Session / Edit Session

Session Dialog 采用协议入口 + 配置页面。

推荐：

```text
Remote

SSH
RDP
VNC
Telnet
Serial

Local

Local Shell
WSL

Advanced

Tunnel
X11
```

SSH 内：

```text
Basic
Authentication
Network
Terminal
Advanced
Metadata
```

不同协议中相同概念应统一命名。

---

# 33. 主 UI 布局

目标主布局：

```text
┌────────────────────────────────────────────────────────────────────┐
│ File  Sessions  View  Terminal  Tools  Settings  Help              │
├────────────────────────────────────────────────────────────────────┤
│ + Session   Split   MultiExec   Tunnel   X11   Tools   Search  ⚙ │
├──────────────────┬─────────────────────────────────────────────────┤
│ Quick Connect    │ Home │ Server01 │ WSL Ubuntu │ RDP01 │ +       │
├──────────────────┼─────────────────────────────────────────────────┤
│ Sessions         │                                                 │
│                  │                                                 │
│ ▼ Favorites      │                 Workspace                       │
│ ▼ Production     │                                                 │
│   Web-01         │                                                 │
│   DB-01          │                                                 │
│ ▼ Local          │                                                 │
│   PowerShell     │                                                 │
│   WSL Ubuntu     │                                                 │
├──────────────────┤                                                 │
│ Sessions | Files │                                                 │
├──────────────────┴─────────────────────────────────────────────────┤
│ Connection / Protocol / Transfer / Terminal Status                 │
└────────────────────────────────────────────────────────────────────┘
```

---

# 34. Menu

建议：

### File

- New Session
- New Local Terminal
- Import
- Export
- Preferences
- Exit

### Sessions

- New
- Connect
- Reconnect
- Disconnect
- Edit
- Duplicate
- Connect Folder

### View

- Sidebar
- Files
- Toolbar
- Status Bar
- Full Screen
- Command Palette

### Terminal

- New Tab
- Split
- Close Pane
- Broadcast Input
- Clear
- Reset

### Tools

- Tunnel Manager
- X11
- Commands
- Monitoring
- Docker
- Key Manager

### Settings

- General
- Terminal
- SSH
- Appearance
- Security
- X11
- Sync

---

# 35. Toolbar

一级只保留高频：

- + Session
- Split
- MultiExec
- Tunnel
- X11
- Search
- Settings

支持：

- Icon + Label
- Compact
- Icon Only

优先沿用当前 permissive icon set；如果使用 Lucide / Tabler，保持许可证记录。

---

# 36. Search

统一搜索：

```text
Ctrl/Cmd + K
```

搜索：

- Sessions
- Folders
- Commands
- Tools
- Settings
- Recent Hosts

---

# 37. Command Palette

快捷键：

```text
Ctrl/Cmd + Shift + P
```

支持：

```text
Connect Production
New Session
Split Right
Toggle MultiExec
Open WSL Ubuntu
Start Tunnel
Toggle Sidebar
Change Theme
Open Settings
```

---

# 38. Saved Commands

保留 mXterm Command Library，并统一为 NexaTerm Saved Commands。

Scope：

- Global
- Folder
- Session
- Protocol

执行：

- Current Session
- Selected Sessions
- MultiExec

后续再考虑复杂 Macro Sequence。

---

# 39. Theme / Visual

支持：

- Light
- Dark
- Follow System

Terminal Theme 与 App Theme 分离。

UI Density：

- Comfortable
- Compact

默认推荐 Compact。

设计目标：

> MobaXterm 信息架构 + 现代桌面 UI + NexaTerm 自有视觉。

---

# 40. Terminal

继续使用 xterm.js。

必须保证：

- UTF-8
- CJK
- IME
- True Color
- Mouse
- Clipboard
- Search
- URL detection
- OSC links
- Scrollback
- Resize
- WebGL / fallback

特别注意：

- composition 时不得抢输入
- ancestor 不得错误 `preventDefault()`
- `onData` 热路径避免高开销
- MultiExec 不得破坏 IME

---

# 41. i18n

当前 mXterm i18n 基础不足。

NexaTerm v1 至少建立：

- English
- 简体中文

要求：

- 新增 UI 文案全部走 i18n
- 新重构模块全部迁移 i18n
- 旧代码按 Workspace 重构过程渐进迁移
- 不要求一次性机械翻译整个仓库后才允许开发

---

# 42. UI 架构技术债

mXterm 当前最大前端风险：

```text
src/features/layout/WorkspaceShell.tsx
```

当前约 13k+ 行。

NexaTerm 不应继续在该组件上堆功能。

Hardening 阶段应渐进拆分：

```text
WorkspaceShell
├── WorkspaceState
├── SessionTabs
├── TerminalWorkspace
├── SplitWorkspace
├── RemoteDesktopWorkspace
├── CommandSenderController
├── FileWorkspace
└── ToolPanelController
```

原则：

- 不做一次性 rewrite
- 先提取 state / controller
- 保持行为
- 补测试
- 再重构 UI

---

# 43. Lazy Loading

必须保留 mXterm 当前好的 lazy-load 策略。

Monaco、noVNC、Monitor、AI 等重模块不得重新进入首屏静态 bundle。

要求：

- route/feature lazy load
- idle prewarm 可保留
- bundle regression review

---

# 44. Frontend Tests

当前 mXterm 前端正式测试不足。

NexaTerm Hardening 必须建立：

- Vitest
- jsdom
- state tests
- reducer tests
- Connection Dialog tests
- Session Manager tests
- MultiExec tests
- Workspace Restore tests
- i18n checks

保留 Rust 已有测试。

后续建立 E2E skeleton。

---

# 45. 安全依赖升级

mXterm 当前审计到的 `russh` 版本需要升级到已修补的安全版本。

NexaTerm 开发前必须：

- 升级到 patched release
- 优先评估当前兼容的最新稳定版本
- `cargo audit`
- `cargo deny`
- 回归 SSH / Jump / Proxy / SFTP / Tunnel / Host Key

此项属于：

**P0 Hardening**

---

# 46. License Audit

主项目：

**MIT**

已确认需要记录的重要依赖包括：

- noVNC：MPL-2.0
- serialport-rs：MPL-2.0

MPL 不等于 GPL，但需要遵守文件级 copyleft 义务。

NexaTerm 应生成：

```text
THIRD_PARTY_LICENSES.md
```

后续必须审计：

- Cargo.lock
- pnpm lock
- fonts
- icons
- bundled assets
- external binaries
- platform runners
- installer dependencies

---

# 47. 跨平台 Capability Model

建议建立统一：

```text
PlatformCapabilities
├── LocalShell
├── WSL
├── Serial
├── X11
├── CredentialStore
├── RDP
├── VNC
├── FileIntegration
└── ExternalRunner
```

### Windows

- PowerShell / CMD
- WSL
- Serial
- RDP embedded
- VNC embedded
- X Server
- Windows Credential APIs（可选后续）

### macOS

- zsh / bash
- Serial
- RDP external/current
- VNC
- XQuartz
- Keychain（可选后续）

### Linux

- bash / zsh
- Serial
- FreeRDP external/current
- VNC
- X11 / XWayland
- Secret Service（可选后续）

---

# 48. macOS Intel

当前 mXterm 正式发布主要覆盖：

- Windows x64
- macOS ARM64
- Linux x64

NexaTerm 必须明确是否把 macOS Intel 列为正式支持目标。

建议由 AskMatt 根据 Tauri、Rust dependencies、CI cost、RDP runners 和实际用户量给出决策。

---

# 49. 性能要求

目标不是死卡某个绝对内存值，而是：

> NexaTerm 不应因为 UI/功能扩展失去 mXterm / Tauri 的轻量优势。

### Idle

- CPU 接近空闲
- 不允许高频无意义 polling

### Memory

建立 mXterm baseline。

NexaTerm 同构建模式下若 Idle memory 增长超过 baseline 约 25%，应触发 review。

### Startup

目标：

- 常规现代电脑约 2 秒内可交互

最终阈值根据 benchmark 确定。

### Multi-session

至少测试：

- 10 SSH Sessions
- Split
- SFTP
- Transfer
- Monitoring

同时运行无明显 UI 卡顿。

---

# 50. 稳定性要求

- 一个 Session 崩溃不得导致整个 App 崩溃
- 一个 Restore 失败不得阻塞其他 Restore
- Reconnect 不得破坏 Workspace
- Tunnel failure 独立隔离
- RDP/VNC external runner failure 不得导致主进程异常
- PTY lifecycle 必须正确 cleanup
- background Session 不得泄漏

---

# 51. Import / Export

NexaTerm 支持：

- Sessions
- Folders
- Favorites
- Tags
- Commands
- Settings

默认：

**不导出 Secret。**

如果导出 Secret：

- 必须显式选择
- 必须加密
- 必须警告风险

---

# 52. mXterm → NexaTerm Migration

因为 NexaTerm 基于 mXterm，首次发布应考虑：

- 检测旧 mXterm config
- 提示 Import / Migrate
- 不静默覆盖
- 保留 Session
- 保留 Folder
- 保留 Tunnel
- 保留 WSL / local profile
- Vault migration 必须安全设计

不能简单通过修改 App Data Directory 导致用户原配置消失。

---

# 53. 品牌改造

统一使用：

# NexaTerm

需要修改：

- app name
- repository name
- title
- executable
- installer
- package
- bundle identifier
- app data directory
- icon
- about
- update feed
- release artifacts

README 应保留 mXterm MIT attribution。

不得暗示 NexaTerm 是 mXterm 官方版本。

---

# 54. 当前不做 / 非目标

v1 不要求：

- 完全复制 MobaXterm 的所有工具
- MobaXterm Games
- 自研 SSH
- 自研 RDP
- 自研 VNC
- 自研 X11 protocol
- 内置 Cygwin/Linux Runtime
- TFTP server
- NFS server
- Cron server
- 移动端
- Web 版
- 企业集中管理后台
- Cloud account system

---

# 55. 后续协议

### P2

- Mosh
- FTP / FTPS（如用户需求明确）
- OpenSSH Config Import
- MobaXterm Session Import
- PuTTY Import
- Session Recording

### P3 Evaluate

- XDMCP
- Rlogin / Rsh
- Browser Session
- AWS S3 Session
- Bundled Unix Runtime
- Plugin System

---

# 56. 关键用户流程

## Flow A：首次 SSH

```text
Launch NexaTerm
→ New Session
→ SSH
→ Host / User / Authentication
→ Host Key Verification
→ Connect
→ Terminal opens
→ Files available
→ Save Session
```

## Flow B：快速连接

```text
Ctrl/Cmd + K
→ Search
→ Enter
→ Connect
```

## Flow C：批量运维

```text
Open Folder
→ Connect All
→ Enable MultiExec
→ Select Targets
→ Execute
→ Disable MultiExec
```

## Flow D：WSL

```text
New Session
→ WSL
→ Ubuntu
→ Open
→ Save / Favorite
```

## Flow E：嵌入式

```text
New Session
→ Serial
→ Port / Baud
→ Connect
→ Split with SSH
```

## Flow F：X11

```text
SSH Settings
→ Enable X11
→ Validate local backend
→ Connect
→ Remote DISPLAY ready
→ Run GUI app
```

## Flow G：Tunnel

```text
Tools
→ Tunnel Manager
→ New
→ Local / Remote / Dynamic
→ Start
→ Running
```

---

# 57. P0 — Hardening Sprint

在正式大改 NexaTerm UI 前完成。

## H0.1 Security

- russh upgrade
- cargo audit
- cargo deny
- dependency review
- secret handling review
- tunnel bind review
- logging review

## H0.2 Frontend Test Baseline

- Vitest
- jsdom
- Workspace critical tests
- Session tests
- MultiExec tests
- Dialog tests

## H0.3 WorkspaceShell Decomposition

- 提取 state/controller
- 不大爆炸式 rewrite
- 每次拆分保持行为

## H0.4 i18n

建立：

- en
- zh-CN

## H0.5 Workspace Restore Design

定义持久化模型。

## H0.6 License Inventory

生成完整第三方许可证清单。

## H0.7 Platform Build Matrix

至少：

- Windows x64
- macOS ARM64
- Linux x64

决定 macOS x64。

---

# 58. P1 — NexaTerm v1

### Branding

- NexaTerm naming
- icon
- package
- bundle
- config migration

### UI

- MobaXterm-like modern layout
- Menu
- Toolbar
- Session Manager
- Home
- Quick Connect
- Tabs
- Status Bar

### Existing capabilities to integrate

- SSH
- SFTP
- Local Shell
- WSL
- Serial
- Telnet
- RDP
- VNC
- Tunnel
- Jump
- Split
- Command Library
- Monitoring
- Remote Editor

### Major work

- unified MultiExec UX
- Workspace Restore
- X11
- WSL UX enhancement
- Multi-hop Jump
- Key / Credential UX
- Import / Export
- Command Palette
- i18n
- Light / Dark polish

---

# 59. P2

- FTP / FTPS
- Mosh
- MobaXterm session import
- PuTTY import
- OpenSSH config import
- Session Recording
- Macro Sequence
- RDP backend modernization
- macOS Intel if needed

---

# 60. v1 验收标准

NexaTerm v1 至少应满足：

- Windows / macOS / Linux 可构建和运行
- NexaTerm 品牌完整
- SSH 稳定
- Host Key 正确验证
- SFTP 可用并与 SSH 联动
- Session Tree 可用
- Favorites / Folder 可用
- Local Shell 可用
- WSL 可用
- Serial 可用
- Telnet 可用
- RDP 可用
- VNC 可用
- Tunnel 可用
- Jump Host 可用
- Split 可用
- MultiExec 可用
- Workspace Restore 可用
- X11 可用
- Saved Commands 可用
- Remote Files 可用
- Secret 不明文持久化
- English / zh-CN 可用
- Light / Dark 可用
- 前端关键测试可用
- Rust 测试通过
- 无明显资源泄漏
- 无已知 Critical/High dependency vulnerability 未处理

---

# 61. AskMatt 首先需要做的事情

AskMatt 在拆任务前不得直接假设本文的静态审计 100% 正确。

必须先完成一次本地源码验证。

## A. Current State Validation

逐项验证：

- SSH
- Host Key
- SFTP
- WSL
- Serial
- Telnet
- Jump
- Proxy
- Local / Remote / Dynamic Tunnel
- Split
- Sync Input
- Command Sender
- RDP
- VNC
- Workspace persistence
- Vault
- WebDAV
- AI/MCP
- Monitoring

## B. Architecture Audit

确认：

- App state
- Session model
- Connection model
- Workspace model
- Tab model
- Split model
- Rust IPC boundaries
- PTY lifecycle
- RDP/VNC runner lifecycle
- storage schema
- migration schema

## C. Dependency / Security Audit

执行或等价完成：

- cargo audit
- cargo deny
- pnpm dependency audit
- russh upgrade plan
- MPL inventory
- bundled binary inventory

## D. Refactor Plan

重点检查：

```text
WorkspaceShell.tsx
```

输出渐进拆分方案，不允许直接全部重写。

---

# 62. AskMatt 输出要求

基于本需求文档和真实源码，生成：

```text
docs/
├── CURRENT_STATE.md
├── GAP_ANALYSIS.md
├── ARCHITECTURE.md
├── DEVELOPMENT_PLAN.md
├── TEST_STRATEGY.md
├── SECURITY_REVIEW.md
├── LICENSE_AUDIT.md
└── tasks/
    ├── 00-...
    ├── 01-...
    └── ...
```

---

# 63. Task 文档要求

每个 Task 至少包含：

- Goal
- Background
- Required Reading
- Current Implementation
- Reusable Components
- Scope
- Out of Scope
- Dependencies
- Technical Approach
- Files likely affected
- Acceptance Criteria
- Test Plan
- Cross-platform Notes
- Security Notes
- License Notes
- Migration / Compatibility Notes
- Completion Report Format

---

# 64. Codex 工作规则

每个具体开发任务执行前：

1. 读取 `AGENTS.md`
2. 读取 `NEXATERM_REQUIREMENTS.md`
3. 读取当前 Architecture / Development Plan
4. 读取对应 Task
5. 检查真实源码
6. 优先复用
7. 不做无关重构
8. 新依赖先做许可证检查
9. 新 UI 文案进入 i18n
10. 保持三平台思维
11. 修改后运行对应 lint / test / build
12. 如果实现与文档发生实质偏差，应更新对应设计文档

---

# 65. 最终产品定义

NexaTerm 最终应成为：

> **一个轻量、现代、高信息密度、跨 Windows / macOS / Linux 的 Remote Workstation。**

在一个应用中完成：

```text
SSH
+ SFTP
+ RDP
+ VNC
+ Local Shell
+ WSL
+ Serial
+ Telnet
+ X11
+ Jump Host
+ Tunnel
+ Split
+ MultiExec
+ Files
+ Saved Commands
+ Monitoring
```

目标体验：

> **MobaXterm 的工作效率，现代化的 UI，Rust/Tauri 的轻量架构，以及真正统一的跨平台工作流。**

---

# 66. 当前源码审计证据入口

本需求文档中的 mXterm 基线主要来自以下当前源码入口，后续 AskMatt 应基于本地 clone 再次验证：

- https://github.com/syscryer/mxterm
- https://raw.githubusercontent.com/syscryer/mxterm/main/README.md
- https://raw.githubusercontent.com/syscryer/mxterm/main/AGENTS.md
- https://raw.githubusercontent.com/syscryer/mxterm/main/package.json
- https://raw.githubusercontent.com/syscryer/mxterm/main/src-tauri/Cargo.toml
- https://raw.githubusercontent.com/syscryer/mxterm/main/src-tauri/src/known_hosts/mod.rs
- https://raw.githubusercontent.com/syscryer/mxterm/main/src-tauri/src/storage_vault.rs
- https://raw.githubusercontent.com/syscryer/mxterm/main/src-tauri/src/ssh_config.rs
- https://raw.githubusercontent.com/syscryer/mxterm/main/src-tauri/src/terminal/local_profiles.rs
- https://raw.githubusercontent.com/syscryer/mxterm/main/src-tauri/src/terminal/serial.rs
- https://raw.githubusercontent.com/syscryer/mxterm/main/src-tauri/src/tunnels.rs
- https://raw.githubusercontent.com/syscryer/mxterm/main/src-tauri/src/rdp.rs
- https://raw.githubusercontent.com/syscryer/mxterm/main/src-tauri/src/vnc.rs
- https://raw.githubusercontent.com/syscryer/mxterm/main/src/features/layout/WorkspaceShell.tsx
- https://raw.githubusercontent.com/syscryer/mxterm/main/src/features/connections/connectionTypes.ts
- https://raw.githubusercontent.com/syscryer/mxterm/main/docs/requirements/m-xterm-requirements.md

---

# 67. 审计限制

当前文档中的“源码基线”来自静态源码审计。

尚未完成：

- 本地 full-repo clone audit
- Windows build
- macOS build
- Linux build
- SSH real-server test
- SFTP real-server test
- Jump / Proxy real test
- Tunnel interoperability
- Serial hardware test
- WSL real test
- RDP real-server test
- VNC real-server test
- X11 implementation
- startup benchmark
- memory benchmark
- package signing review
- notarization review

因此：

> 本文档定义产品目标和当前可信基线，但后续 AskMatt / Codex 必须用真实仓库和可运行测试验证后再生成最终开发计划。
