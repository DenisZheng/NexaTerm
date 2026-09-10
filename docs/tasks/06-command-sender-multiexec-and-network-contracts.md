# Task 06：Command Sender/MultiExec 与网络契约

## Goal

固化 Command Sender、Sync Input、MultiExec、Proxy/Jump/Tunnel 的状态和 IPC 契约，修复检查脚本与真实实现漂移，并覆盖失败隔离。

## Background

现有 split sync、command sender history/targets 和单跳 jump/HTTP/SOCKS/tunnel 实现存在；source checks 报 commandSenderHistory、激活 SSH tab 同步等契约问题。

## Required Reading

- `AGENTS.md`
- `NEXATERM_REQUIREMENTS.md`
- `docs/CURRENT_STATE.md`
- `docs/GAP_ANALYSIS.md`
- `docs/ARCHITECTURE.md`
- `docs/CURRENT_STATE.md、docs/GAP_ANALYSIS.md、.trellis/spec/frontend/backend/tauri-command-contracts`

## Current Implementation

WorkspaceShell 组合 targets/history/active tab；Rust session 支持单跳 direct-tcpip 和 proxy stream；tunnels.rs 支持三种类型。

## Reusable Components

typed commands.ts、events.rs payload、connections/mod.rs 校验、terminal/session.rs jump/proxy、tunnels.rs manager、现有 source checks。

## Scope

建立纯状态/action contract；明确激活目标、批量执行、取消、超时和部分失败；补 proxy/jump/forward 互操作矩阵；修正过时 source checks 而不改变真实语义。

## Out of Scope

不实现多跳 jump、不隐藏重复事件、不通过 UI 去重或过滤输出、不把批量失败伪装成全部成功。

## Dependencies

Task 03 测试基线、Task 04 state seam、Task 01 安全/命令边界；真实 fixture server 由平台测试提供。

## Technical Approach

先对照源码和脚本建立 contract table，再写 reducer/IPC tests；MultiExec 复用单 session command path，结果按 target 聚合且保留错误；网络连接保持 Rust owner。

## Files likely affected

WorkspaceShell/CommandSenderController、src/shared/tauri/commands.ts、相关 Rust commands/session/tunnels/connections、source checks、tests、docs。

## Acceptance Criteria

- [ ] 激活 tab、sync input、history/targets 有单一契约。\n- [ ] MultiExec 支持取消、超时、部分失败和重试语义。\n- [ ] 单跳 jump、HTTP CONNECT、SOCKS5、local/remote/dynamic tunnel 有负向和清理测试。\n- [ ] 过时检查脚本已更新为当前真实 contract。

## Test Plan

Vitest reducer/component、Rust connection/tunnel tests、fixture SSH/proxy/SOCKS server、host key/jump errors、resource cleanup、source checks。

## Cross-platform Notes

Windows/macOS/Linux 分别验证代理 DNS、端口 bind、shell quoting、serial/telnet 能力；nested jump 明确显示 unsupported。

## Security Notes

批量命令按 target 权限执行；MCP/Docker/remote exec 禁止绕过确认；日志只记录 target ID/status，不记录命令秘密。

## License Notes

不引入协议实现代码；fixture/runner 的许可证和再分发由 Task 02 清单覆盖。

## Migration / Compatibility Notes

保留已有 command history/storage 格式；contract 字段变更需兼容旧前端或递增版本，不静默丢 target/error。

## Completion Report Format

- 实际变更文件与 commit（如有；本规划阶段不提交）。
- 执行的命令、工具版本、通过/失败/环境阻塞证据。
- 与需求/架构文档的偏差及原因。
- 安全、许可证、跨平台和回滚结果。
- 遗留问题、下一步依赖和人工验收人。
