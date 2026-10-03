# WF-05B 设计

## 入口

New Session 增加协议直达项：
- Telnet…
- Serial…

它们只预选 ConnectionDialog protocol，所有字段、保存/连接 intent、Serial port refresh 与错误显示继续复用现有对话框，不复制一套配置 UI。

## 实例语义

Character runtime 已有两类动作：
- 普通打开：允许聚焦已有 profile instance；
- 明确“new instance”动作：必须调用 `openCharacterTerminalInConnection` 生成新的 tab/request/session identity。

05B 会把当前误用普通打开函数的 new-instance seam 修正，保持与 SSH/Local/WSL 一致。

## lifecycle / capability

- Telnet 内置 TcpStream，无外部 runner；通过本机 TCP fixture 验证 open/write/close。
- Serial provider 由 serialport crate 提供。入口可用性来自 port enumeration：loading / no ports / list failure / ports available。
- TerminalManager 已统一拥有 SSH/Local/Telnet/Serial session；05B 重点锁定 close 后 store/reader 退出语义。
- Serial 真机 A11 必须记录实际设备/端口/平台；自动测试不冒充真实硬件互操作。

## workspace

Serial/Telnet 继续映射为 `LocalTerminalTab`：
- binding 为 `local:<tabId>`；
- MultiExec kind 分别投影为 `serial` / `telnet`；
- profile/connection id 只作为 owner，不作为 instance key。
