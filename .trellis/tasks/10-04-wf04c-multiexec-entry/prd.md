# WF-04C 补口：MultiExec 顶层入口（底栏）

> 父任务：`09-23-nexaterm-workflow-mainline`。
> 前置：WF-04C（`feat/wf04c-unified-multiexec`，已叠入 `feat/wf07-workspace-restore`）。
> 规范：WS-X03 / WS-X04 / WS-X05 / WS-X06 / WS-X07 / WS-X08。验收编号：**A09 / A10**。

## 用户流程

2/4 Split 或多个已打开终端实例 → 点击顶部 MultiExec 入口打开底栏 → 显式勾选目标实例 → 开启 Live 同步输入（或打开 Command Sender 发送命令）→ 观察激活状态与逐项结果 → 目标断线/关闭后从集合收缩。

## 背景与问题

WF-04C 的状态模型、实例目标投影、live 与 send 执行器均已完成并有自动化证据，但顶层 `terminal.multiExec` 入口仍为 `deferred-wf04c` 灰置（`src/features/shortcuts/actionRegistry.ts`），2026-10-04 集中验收结论为 BLOCKED（功能未接入），A09/A10 无法按验收流程执行。

## 范围

- 启用顶层 `terminal.multiExec` 入口：策略从 deferred 改为能力门控（存在可接受终端输入的目标实例时可用，否则给出原因）。
- 新增 MultiExec 底栏（`src/features/layout/MultiExecBar.tsx`）：逐实例目标勾选、Live 开关与停止、激活状态（WS-X08）、打开 Command Sender。
- 接线到既有 `multiExec/*` 状态与执行器（`multiExecMode / multiExecTargets / multiExecRuntimeTargets`），不新增第二份事实来源。
- 同步更新固定灰置行为的测试与 source gate。

## Out of scope

- 保持 `off / live / send` 状态模型、目标固定语义与 live/send 执行器；允许将既有“移除最后目标停止 Live”的联动归入 reducer，避免 Shell updater 内嵌套派发。
- 不扩展 >4 pane；不把 RDP/VNC 作为终端广播目标（WS-X05）。
- 底栏不提供命令输入框：发送仍走 Command Sender（共享同一目标集合）。
- 不修改 `scripts/line-budget.json`；Shell 行数通过抽取既有派生逻辑抵消。
- 不改动任何 `待确认` 规则，不改 WS-X04 等已确认条款。

## Acceptance Criteria

- [x] 自动化：策略/组件/handler 测试更新与新增；`pnpm run check`、`pnpm test`、`npm run build`、`check:wf04c-multiexec`、`check:i18n-new-entry`、`check:line-budget`、`check-startup-module-boundary-source` 全绿（2026-10-04，`validation/entry.md`）。
- [ ] 真实 Tauri：A09 / A10 按 `10-03-wf-04c-unified-multiexec/validation/a09-a10.md` 与 `tests/fixtures/README.md` 的 GUI 清单由维护者执行并记录。

## Notes

- 底栏形态于 2026-10-04 由维护者确认（三选一：新增底栏 / 扩展 Command Sender / 最小接入，选新增底栏）。
