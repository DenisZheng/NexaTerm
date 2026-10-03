# WF-05A Local / WSL 统一入口

> 父任务：`09-23-nexaterm-workflow-mainline`。
> 堆叠基线：WF-04C `f824cc178568febf685e6331ce8dd9fa5898cbb2`。
> 对应 Delivery Plan：WF-05；Local/WSL/Serial 为 v1 核心，Telnet/RDP/VNC 留到后续 WF-05B/05C。

## 用户流程

新建会话 → 看到当前平台可用的 Local shell / Windows 上的 WSL 发行版 → 选择具体 provider → 打开独立终端实例 → 可定位、分屏、MultiExec → 关闭后正确释放 PTY/process。

## 05A 范围

- Local 与 WSL 在统一“新建会话”入口中有明确分组，不把 WSL 发行版混成普通 Local shell。
- Windows 上展示已检测到的 WSL distributions；不可用时给出明确状态，而不是空菜单或静默无响应。
- 复用 `local_profiles.rs` 现有 PowerShell/cmd/shell/WSL 探测与 `local_terminal_open` PTY。
- 每次打开保持现有独立 instance/tab ID；不回退到 profile 单例。
- 后续切片补 provider capability 细分、Split/MultiExec/close lifecycle 自动化。
- 实机 A11 与 WF-04C A09/A10 一起集中验收。

## Out of scope

- 不重写 portable-pty / ConPTY。
- 不实现新的 WSL 安装器或发行版管理器。
- 本切片不做 Serial/Telnet/RDP/VNC。
- 不启动 WF-06。
- 不修改 PR #12 或 `scripts/line-budget.json`。
