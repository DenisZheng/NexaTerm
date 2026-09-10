# Task 07：RDP/VNC/X11 能力矩阵与 runner 生命周期

## Goal

把 RDP/VNC/X11 的平台能力、外部 runner、退出/错误/资源生命周期显式化，形成真实互操作证据；不自研协议栈。

## Background

RDP 在 Windows native/embedded、非 Windows external/stub；VNC 有 noVNC relay/runner；未发现完整 X11 module。需求仍要求平台能力和 v1 X11。

## Required Reading

- `AGENTS.md`
- `NEXATERM_REQUIREMENTS.md`
- `docs/CURRENT_STATE.md`
- `docs/GAP_ANALYSIS.md`
- `docs/ARCHITECTURE.md`
- `docs/CURRENT_STATE.md、docs/TEST_STRATEGY.md、src-tauri/src/rdp.rs、src-tauri/src/vnc.rs`

## Current Implementation

Rust manager 已管理 session/runner，前端通过 lazy UI；IronRDP 检查因 cargo/rustc 缺失阻塞，真实 server/FreeRDP/XQuartz/X11 环境未验证。

## Reusable Components

现有 RdpSessionManager、VNC session manager/websocket relay、AppSuspense/lazy runner view、platform cfg 和 capability metadata。

## Scope

先决策 X11/XWayland 交付范围与外部依赖；统一 runner lifecycle state、exit/error/close/resize；补 capability matrix、用户可见 partial/unsupported 原因和 cleanup。

## Out of Scope

不在任务内自研 SSH/RDP/VNC/X11 协议、不把 external runner 缺失隐藏成成功、不承诺未测试平台。

## Dependencies

Task 00 Rust/platform toolchain、Task 01 security/capability、Task 02 binary license、Task 04 state seam；需要真实 RDP/VNC/X11 servers。

## Technical Approach

建立 adapter contract 和 fake runner tests，再接平台 runner；启动、健康、退出、窗口关闭、网络断开、重连均有状态；runner failure 与主窗口隔离。

## Files likely affected

src-tauri/src/rdp.rs、vnc.rs、可能新增 runner/capability modules、前端 RDP/VNC panels、tauri capabilities、scripts/check-ironrdp*、docs。

## Acceptance Criteria

- [ ] Windows/macOS/Linux capability matrix 有实际 artifact/日志。\n- [ ] runner 缺失/启动失败/退出/关闭不崩主窗口。\n- [ ] VNC noVNC relay 和 RDP external/native 资源可清理。\n- [ ] X11 范围、许可证和不支持平台明确，不留假入口。

## Test Plan

fake runner lifecycle、真实 RDP/VNC fixture、FreeRDP/XQuartz/X11/XWayland smoke、窗口/网络/进程退出、句柄/子进程泄露检查。

## Cross-platform Notes

Windows native RDP/WSL；macOS Intel/Apple Silicon external runner/XQuartz；Linux FreeRDP/X11/XWayland；每项记录版本和安装方式。

## Security Notes

RDP/VNC 密码、clipboard、remote display、runner args 不落日志；外部进程参数安全 quoting；capability 限制窗口和文件访问。

## License Notes

FreeRDP/noVNC/XQuartz/X11/平台库许可证必须进入 Task 02 inventory；禁止复制 GPL/未知协议实现。

## Migration / Compatibility Notes

现有 RDP/VNC session 状态和配置保持可读；新增 capability/version 字段有默认 partial；runner 更换保留旧配置和明确迁移提示。

## Completion Report Format

- 实际变更文件与 commit（如有；本规划阶段不提交）。
- 执行的命令、工具版本、通过/失败/环境阻塞证据。
- 与需求/架构文档的偏差及原因。
- 安全、许可证、跨平台和回滚结果。
- 遗留问题、下一步依赖和人工验收人。
