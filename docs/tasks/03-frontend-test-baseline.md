# Task 03：前端测试基线与状态契约

## Goal

将前端 no-op test 替换为可执行的单元/组件/契约测试门禁，先覆盖状态转换和关键连接流程，再为 WorkspaceShell 渐进拆分提供 characterization。

## Background

package test 未配置；WorkspaceShell 集中大量 state/effect；Command Sender、Connection Dialog、Session Manager、Workspace Restore 和 i18n 缺少稳定前端测试。

## Required Reading

- `AGENTS.md`
- `NEXATERM_REQUIREMENTS.md`
- `docs/CURRENT_STATE.md`
- `docs/GAP_ANALYSIS.md`
- `docs/ARCHITECTURE.md`
- `docs/TEST_STRATEGY.md 与 .trellis/spec/frontend`

## Current Implementation

已有 source checks 和部分 Node scripts；React/TS/Zustand/Radix 依赖存在，动态加载边界已通过静态检查。

## Reusable Components

现有 types、shared/tauri command wrappers、事件 payload、组件和 scripts/check-*；优先抽纯 reducer，不复制 UI 组件。

## Scope

建立 Vitest/jsdom（或项目批准的等价方案）；覆盖 connection dialog、session/tab、split/sync、command sender、restore reducer、i18n formatter、lazy boundary；把可运行测试纳入 pnpm test/CI。

## Out of Scope

不在本任务实现新业务功能、不大拆 WorkspaceShell、不用 snapshot 取代行为断言、不把 source check 误当运行时测试。

## Dependencies

Task 00 工具链；Task 01 依赖修复可能影响测试 runner；Task 04 依赖本任务的 characterization tests。

## Technical Approach

先写现状测试并记录失败，再提取最小纯函数；测试 action 顺序、错误、取消、cleanup 和跨 tab 目标；组件测试使用最小 fake backend。

## Files likely affected

package.json、pnpm lock（如需）、vitest 配置、src/**/*.test.ts(x)、scripts test harness、CI workflow、docs/TEST_STRATEGY.md。

## Acceptance Criteria

- [ ] pnpm test 真正运行并在失败时返回非零。\n- [ ] 核心状态/连接/command sender/restore/i18n 有可读断言。\n- [ ] source checks 与单元测试区分报告。\n- [ ] 测试不依赖真实秘密、网络或桌面 runner。

## Test Plan

Vitest unit/component、类型检查、现有 Node scripts、Rust tests（作为跨层门禁）、失败路径和取消/cleanup 测试。

## Cross-platform Notes

jsdom 测试不替代真实 WebView；Windows/macOS/Linux 运行时 E2E 由 Task 09/平台任务负责，路径和 locale fixture 使用平台无关数据。

## Security Notes

测试 fixture 使用假 token/假主机；断言错误不会泄露秘密；覆盖危险命令关闭、MCP 未授权和 host key changed。

## License Notes

新增测试依赖需通过 Task 02 的 license gate；优先复用现有依赖，不引入未审计 runner。

## Migration / Compatibility Notes

从 no-op test 到强门禁可能暴露历史失败；先分层标记已知阻塞，禁止降低断言或静默跳过，逐批清零后收紧 CI。

## Completion Report Format

- 实际变更文件与 commit（如有；本规划阶段不提交）。
- 执行的命令、工具版本、通过/失败/环境阻塞证据。
- 与需求/架构文档的偏差及原因。
- 安全、许可证、跨平台和回滚结果。
- 遗留问题、下一步依赖和人工验收人。
