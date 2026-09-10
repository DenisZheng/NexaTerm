# Task 01：安全与依赖硬化

## Goal

收敛 npm/Rust 供应链、Tauri capability/CSP、MCP 监听、错误泄露和远程输入边界，使安全风险可验证、可接受、可回滚。

## Background

官方 npm audit 报 5 high/16 moderate/5 low；tauri CSP 为 null；MCP 默认 0.0.0.0:8765；AppError 序列化 raw_message。

## Required Reading

- `AGENTS.md`
- `NEXATERM_REQUIREMENTS.md`
- `docs/CURRENT_STATE.md`
- `docs/GAP_ANALYSIS.md`
- `docs/ARCHITECTURE.md`
- `docs/SECURITY_REVIEW.md 与 .trellis/spec/backend/tauri-command-contracts（如适用）`

## Current Implementation

Vault/known-host/tunnel validation 基础存在，但 cargo audit/deny 未运行；capabilities/default.json 权限较宽，MCP token 与危险命令边界需复核。

## Reusable Components

现有 Argon2id/AES-GCM Vault、known_hosts 校验、AppError、MCP token、Tauri updater 公钥和 tunnel validation。

## Scope

逐项升级或隔离可修复依赖；评估 CSP；按窗口/command 最小化 capability；审查 MCP 默认 bind、认证、速率和日志；建立安全错误码/脱敏策略；检查 remote exec、Docker、WebDAV、路径和 shell quoting。

## Out of Scope

不新增协议功能、不改变 Vault 密文格式、不关闭 host key 校验、不用隐藏/过滤掩盖错误、不在无证据时放宽权限。

## Dependencies

依赖 Task 00 的可重现工具链；与 Task 02 license、Task 03 tests 并行但共享锁文件变更必须串行审核。

## Technical Approach

先生成审计报告和 threat model，再用小批次升级；每个 patch 配合 negative test 和回滚；MCP bind 默认策略需在实现前对齐，不能仅静默改配置。

## Files likely affected

可能涉及 package.json/pnpm-lock.yaml/package-lock.json、src-tauri/Cargo.toml/Cargo.lock、src-tauri/tauri.conf.json、capabilities/default.json、mcp.rs、app_error.rs、commands.rs、tunnels.rs 及安全文档。

## Acceptance Criteria

- [ ] npm/cargo audit 与 deny 输出无未评估 Critical/High。\n- [ ] capability/CSP 变更有窗口和 command 证据。\n- [ ] MCP 远程 bind、token、危险命令和日志有 negative tests。\n- [ ] 错误返回不泄露 secret、私钥、主机路径或命令内容。\n- [ ] 失败可回滚且 lockfile 一致。

## Test Plan

`pnpm audit`、`cargo audit`、`cargo deny check`、Rust security tests、Tauri capability tests、MCP unauthenticated/invalid token/rate-limit tests、路径穿越和 shell quoting tests、secret scan。

## Cross-platform Notes

Windows/macOS/Linux 的 WebView、文件权限、Keychain/Secret Service、端口 bind 和外部 runner 权限分别验证；不要把 Windows-only 安全假设用于 Unix。

## Security Notes

任何风险接受需有暴露面、利用条件、缓解、截止日期和负责人；审计日志只保留关联 ID，不记录 token/密码。

## License Notes

依赖升级不得引入 GPL/AGPL/LGPL 或未知协议；MPL 文件边界和 notices 同步由 Task 02 审核。

## Migration / Compatibility Notes

升级 russh/加密相关 crate 先做兼容和数据回读；错误 schema、MCP 配置和 capability 改动保留旧配置解析/明确迁移提示。

## Completion Report Format

- 实际变更文件与 commit（如有；本规划阶段不提交）。
- 执行的命令、工具版本、通过/失败/环境阻塞证据。
- 与需求/架构文档的偏差及原因。
- 安全、许可证、跨平台和回滚结果。
- 遗留问题、下一步依赖和人工验收人。
