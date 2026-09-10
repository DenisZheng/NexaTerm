# 测试策略与验收计划

## 当前基线

- `package.json` 的 `test` 是 no-op；需要以 Vitest/jsdom 或同等方案建立前端门禁。
- Rust 模块已有连接、known-host、storage、migration、Vault 等单元测试，应保留并扩展。
- source checks 适合检查静态契约和启动边界，不能替代运行时互操作。
- 7 个 Node 脚本测试文件逐文件运行和授权环境 `node --test` 均通过（37/37）；受限 Windows sandbox 的 child-process `spawn EPERM` 仍是环境限制。

## 分层方案

| 层级 | 范围 | 主要工具/证据 |
| --- | --- | --- |
| 静态契约 | lazy boundary、token、命令/事件命名、包元数据 | `node scripts/check-*.mjs`、TypeScript check、锁文件检查 |
| 前端单元 | WorkspaceState、SessionTabs、Split/sync、CommandSender、connection dialog、restore reducer、i18n formatter | Vitest + jsdom，纯 reducer/action 优先 |
| Rust 单元 | profile validation、host key、Vault、storage migration、tunnel validation、runner state | `cargo test`，覆盖错误和清理 |
| IPC 集成 | typed wrapper↔Tauri command↔manager/repository、事件订阅/取消 | Tauri test harness 或隔离 fake backend；禁止依赖真实秘密 |
| 协议互操作 | SSH/host key/SFTP/jump/proxy/tunnel、serial/telnet、RDP/VNC/X11 | 可控 fixture server、硬件/runner 矩阵和完整日志 |
| E2E | 新建连接、tab/split、同步输入、远程文件、恢复、设置和语言切换 | Playwright/桌面 harness；保留截图/trace |
| 性能/稳定性 | 10 SSH + Split + SFTP + transfer + monitor、长时 PTY、断线重连、runner退出 | 资源采样、线程/子进程/句柄观测、长时报告 |
| 发布验收 | 三平台 build/run、签名、公证、更新、离线安装、许可证 | CI artifacts、安装器 smoke、SBOM/notices |

## 核心测试场景

1. Host Key：unknown 提示、trust、changed 拒绝、jump target 分别验证。
2. Session：SSH/Local/WSL/Serial/Telnet 建立、输出、resize、关闭、重连；reader/thread/PTY 均释放。
3. SFTP/Remote File：权限失败、超时、大文件、断线、编辑器未保存和 tab 关闭。
4. Split/Command Sender：激活 tab 目标同步、sync input、历史、批量执行失败隔离和取消。
5. Restore：旧 schema 升级、快照损坏、单连接凭据缺失、host key 未信任；其它项继续恢复。
6. Tunnel/Proxy：HTTP CONNECT/SOCKS5、local/remote/dynamic bind、认证、DNS、bind 冲突和 stop cleanup。
7. RDP/VNC：runner 缺失/启动失败/退出/窗口关闭/网络断开；外部失败不崩主窗口。
8. Security：秘密不落日志/UI payload；MCP token、危险命令、远程 bind 和 CSP/capability negative tests。
9. i18n/UI：English/zh-CN、fallback、暗色/system-dark、共享下拉和 lazy boundary。
10. 性能：冷启动 chunk、空闲内存、10 SSH 场景、长时传输与监控无可见卡顿。

## 平台矩阵

| 能力 | Windows | macOS Intel/Apple Silicon | Linux |
| --- | --- | --- | --- |
| Local/WSL/Serial | PowerShell/WSL、串口权限 | zsh/bash、串口权限 | bash/zsh、串口权限 |
| SSH/SFTP/Jump/Proxy/Tunnel | fixture server | fixture server | fixture server |
| RDP | native/embedded 路径 | external/明确 partial | FreeRDP/external |
| VNC | noVNC/runner | noVNC/runner/XQuartz 依赖 | noVNC/runner/X11/XWayland |
| Vault | Windows credential/文件权限 | Keychain 可选 | Secret Service 可选 |
| Build/package | MSI/NSIS artifact | DMG/sign/notarize | AppImage/deb 等 |

## 质量门禁

- PR：TypeScript check、Rust unit、关键 Vitest、source checks、pnpm/cargo audit。
- Nightly：协议互操作、长时 PTY、10 SSH 性能、runner 矩阵。
- Release：三平台构建/安装/启动、完整 v1 acceptance、许可证和安全报告。
- 任何环境阻塞必须标出命令、工具版本和替代证据；不能把跳过当通过。
