# Task 04：WorkspaceShell 状态 seam 渐进提取

> **迁移说明（2026-09-23，WF-00A）**：本文件是 2026-09-09 规划稿，作为历史参考保留。实际执行记录与范围修订以 `.trellis/tasks/09-19-workspace-shell-state-seam/{prd,design,implement}.md` 为准。已完成：Split reducer/controller、sessionTabs types/selectors/controller、指针 reducer、激活/记忆 action。剩余项去向：关闭/删除路径 → WF-00B；`WorkbenchTab` 联合 → WF-01；split anchor → WF-04B；MultiExec 第三刀 → WF-04C（父任务 `09-23-nexaterm-workflow-mainline`）。本文"不改变用户行为"只约束本任务，不是全项目约束；目标交互规则见 `docs/WORKFLOW_SPEC.md`。

## Goal

在不改变用户行为和首屏边界的前提下，降低 WorkspaceShell 的状态耦合，建立 WorkspaceState、SessionTabs、Split/Sync 和工具控制器的可测试所有权。

## Background

WorkspaceShell 约 14,381 行，108 useState、40 useEffect、464 本地函数，跨连接、tab、split、remote files、RDP/VNC 和命令发送编排。

## Required Reading

- `AGENTS.md`
- `NEXATERM_REQUIREMENTS.md`
- `docs/CURRENT_STATE.md`
- `docs/GAP_ANALYSIS.md`
- `docs/ARCHITECTURE.md`
- `docs/ARCHITECTURE.md 与 docs/tasks/03-frontend-test-baseline.md`

## Current Implementation

状态和副作用集中在单文件；已有 lazy loaders/idle prewarm，Rust typed IPC/event 边界可复用。

## Reusable Components

现有 React hooks、Zustand（如已使用）、typed commands、events、共享 UI；不复制第二份状态。

## Scope

先用 Task 03 characterization 固化行为，再按小批次抽 WorkspaceState→SessionTabs→SplitWorkspace/Sync→CommandSenderController→File/Tool controllers；保持外部 props、命令和 lazy import 语义。

## Out of Scope

不重写 WorkspaceShell、不改协议/数据库、不新增 UI 视觉体系、不用状态去重掩盖重复事件或错误。

## Dependencies

Task 03 必须先完成；Task 01 的 typed error/事件审计影响 seam；Task 05 依赖稳定的 workspace state ownership。

## Technical Approach

每个 seam 只有一个 owner；先移动纯 state/action，再移动副作用；以旧/新路径对照测试、feature flag 或小提交回滚；每步运行 startup boundary。

## Files likely affected

src/layout/WorkspaceShell.tsx、拟新增 src/layout/workspace/* 或 src/shared 状态模块、相关 hooks/tests、docs/ARCHITECTURE.md。

## Acceptance Criteria

- [ ] active connection/tab/view、split 和 command sender 各有单一 owner。\n- [ ] 关键行为测试覆盖激活/关闭/重连/同步/错误。\n- [ ] WorkspaceShell 体积和 import 方向改善且不把重模块拉入首屏。\n- [ ] 无新增双写、隐藏异常或跨 feature 复制组件。

## Test Plan

characterization、reducer/property tests、组件集成、source startup boundary、pnpm check/build、Rust IPC contract smoke。

## Cross-platform Notes

只移动平台无关状态；PTY/RDP/VNC/WSL 的 platform branching 继续留在 Rust/现有 adapter，三平台 smoke 后再合并。

## Security Notes

状态抽取不得把 secret、private key、MCP token 放进 React store 或日志；错误只传最小必要字段。

## License Notes

新增模块只使用项目许可证和已审计依赖；不复制外部实现。

## Migration / Compatibility Notes

保留旧数据和 command contract；若需要状态版本，加入显式 version/迁移，不用默认值吞掉旧字段；每个 seam 可独立回滚。

## Completion Report Format

- 实际变更文件与 commit（如有；本规划阶段不提交）。
- 执行的命令、工具版本、通过/失败/环境阻塞证据。
- 与需求/架构文档的偏差及原因。
- 安全、许可证、跨平台和回滚结果。
- 遗留问题、下一步依赖和人工验收人。
