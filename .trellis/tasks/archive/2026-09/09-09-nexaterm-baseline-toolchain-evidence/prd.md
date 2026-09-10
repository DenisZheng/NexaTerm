# Task 00：重现工具链与证据基线

## Goal

在固定 commit、锁文件和 registry 的前提下重跑静态检查、Node/Rust 测试和依赖审计，建立可比较的基线，不修改产品行为。

## Background

基线开始时 node_modules 不完整且 Rust 工具不可用；本任务已将 cargo/rustc 安装到 D 盘。source checks 的失败仍混有真实契约、脚本漂移和 Windows MSVC 环境阻塞。

## Required Reading

- `AGENTS.md`
- `NEXATERM_REQUIREMENTS.md`
- `docs/CURRENT_STATE.md`
- `docs/GAP_ANALYSIS.md`
- `docs/ARCHITECTURE.md`
- `.trellis/tasks/09-09-nexaterm-architecture-audit-plan/prd.md`

## Current Implementation

package.json 已有 build/check/source-check 脚本；package test 为 no-op。Rust tests 和 scripts/*.test.mjs 存在，但当前 Windows sandbox 的 child-process 受限。

## Reusable Components

现有 scripts/check-*.mjs、scripts/*.test.mjs、pnpm lock/package-lock、Cargo.lock 和 Trellis 文档。

## Scope

记录 Node/pnpm/Rust/cargo 版本；选定受信 registry；按 lockfile 安装；分组运行 check、build、source checks、Node tests、cargo test/audit/deny；保存原始日志摘要和环境阻塞。

## Out of Scope

不升级依赖、不修 source-check、不改 CI、不连接真实服务器、不提交秘密或构建产物。

## Dependencies

无代码依赖；需要可用的 Node、pnpm、Rust toolchain 和网络/缓存。Task 01/02/03 必须以本任务的版本和日志为输入。

## Technical Approach

先记录 git status 与 commit，再逐条执行命令；将 pass、product failure、tooling failure、sandbox failure 分栏；所有 exit code 原样记录；生成可复跑命令清单。

## Files likely affected

新增/更新 docs/CURRENT_STATE.md、docs/SECURITY_REVIEW.md、docs/LICENSE_AUDIT.md；必要时只更新脚本说明，不改源模块。

## Acceptance Criteria

- [ ] 同一 commit 可复跑全部命令。\n- [ ] 工具版本、registry、lockfile 和失败日志可追溯。\n- [ ] 环境阻塞不被标记为产品通过。\n- [ ] 依赖审计输出保存 severity 和修复版本。

## Test Plan

运行 `pnpm run check`、`pnpm run build`、`node scripts/check-startup-module-boundary-source.mjs`、分类 source checks、`node scripts/*.test.mjs`（必要时逐文件）、`cargo test --workspace`、`cargo audit`、`cargo deny check`。

## Cross-platform Notes

分别记录 Windows PowerShell、macOS bash/zsh、Linux bash 的命令差异；Rust target、WSL、XQuartz/X11、FreeRDP 只记录可用性，不在此任务实现。

## Security Notes

registry 必须 HTTPS；日志脱敏，不采集 token、私钥、真实主机；审计命令输出中的路径和用户名按需要掩码。

## License Notes

不得因安装扫描器而复制第三方代码；记录工具自身许可证和生成报告来源。

## Migration / Compatibility Notes

本任务不改 lockfile/schema；若安装产生缓存或临时目录，确认不进入 Git。后续依赖升级使用独立变更和回滚点。

## Completion Report Format

- 实际变更文件与 commit（如有；本规划阶段不提交）。
- 执行的命令、工具版本、通过/失败/环境阻塞证据。
- 与需求/架构文档的偏差及原因。
- 安全、许可证、跨平台和回滚结果。
- 遗留问题、下一步依赖和人工验收人。
