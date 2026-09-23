# WF-00B 关闭/删除生命周期收尾

> 父任务：`09-23-nexaterm-workflow-mainline`。承接 Task 04（`09-19-workspace-shell-state-seam`）的 2c-2b 切片；来源：`NEXATERM_WORKFLOW_DELIVERY_PLAN.md` §4 WF-00、§7 执行 2 与执行 3。
> 用户流程：连接中立即关闭再等待异步结果，不出现幽灵标签/连接；关闭活动/非活动/最后一个标签、同配置多实例、分屏 pane 后，剩余项与活动项符合预期。
> 验收编号：**A01**（并为 A02 铺路）。引用规则：WS-M06；数据形状目标见 WS-M01、WS-M05（本任务不实现实例投影）。

## Goal

把 `WorkspaceShell` 关闭/删除路径中剩余的约 50 处单值指针 setter 收成意图型 action / 纯决策函数，接入 shell 编排并处理真实 `terminalClose` / runner / 工具清理；建立 characterization 覆盖；结束"先把整个大文件拆完"的前置依赖。

## Requirements

1. 先给当前关闭行为补有意义的 characterization tests：关闭活动/非活动标签、关闭最后一个标签、Home 与最近活动项回落、一个连接存在多个子终端时删除配置、分屏 pane 关闭、连接尚未完成时关闭。
2. 将"关闭后剩什么、激活谁、记忆指针如何变化"收敛到纯 action/reducer 或纯决策函数（`tabs/closeTerminals`、`tabs/closeConnection`、`tabs/closeLocalTerminals`、`tabs/removeRdp`、`tabs/removeVnc` 等）；先把"算下一个活动项"抽成纯 selector。现有五类集合不要求在本包改成一种实体存储。
3. 不在 React state updater 内触发其它 setter、Tauri IPC、Docker exec 清理等副作用：控制器协调一次状态决策，外层按结果执行清理。
4. 保留 `runConnectionStep()` 的 `connectingTabExists()` 与晚返回 session 清理；迁移后测试其仍有效。
5. 只迁移 2c-2b 涉及的关闭/删除路径，不扩展到 Files/Monitor/Docker/AI 所有权调整。
6. 九个 `tabs/set*` 过渡 setter 只有在确实没有调用者时才删除；不能一边保留调用一边写成"已全部删除"。
7. 将过时的 source-check 断言（`check-session-subtab-memory.mjs`、`check-local-terminal-warmup-source.mjs`、`check-remote-file-editor-source.mjs` 等断言旧标识符的脚本）更新为行为/接口检查；不为通过正则把职责塞回 shell。四项已知旧检查分别处理，不全部解释为产品故障。
8. 不改顶部布局、协议、存储；保留 Home、记忆指针与最后一项回落规则。

## 从 Task 04 继承 / 不继承

- 继承：2c-2b 关闭/删除 action 化、过渡 setter 清理、静态脚本断言更新。
- 不继承（已迁往他处）：`WorkbenchTab` 联合与 ordinal 映射 → WF-01；`terminalSplitAnchorIndex` 改 owner id → WF-04B；MultiExec 第三刀 → WF-04C；"全部集合合并、全文件拆分"只在流程确实需要时继续。

## Acceptance Criteria

- [ ] 关闭活动、非活动、最后一个、同 profile 多实例、分屏 pane 五类场景均有明确状态结果，且由 characterization 测试锁定（重构前后同时通过）。
- [ ] 关闭/删除决策不在 updater 中做外部副作用；`connectingTabExists()` 保护有测试证据。
- [ ] A01 通过：连接中立即关闭，迟到 session 被关闭，不出现幽灵标签/连接（真实窗口验证一轮；无 GUI 环境时记"未验证"，不据此声称完成）。
- [ ] `pnpm run check`、`pnpm test`、`pnpm run build`、`node scripts/check-startup-module-boundary-source.mjs` 与相关 `scripts/check-*.mjs` 通过；CI run 记录在 implement.md。
- [ ] Task 04 implement.md 的 2c-2b 条目引用本任务完成记录；父任务地图更新。

## Out of Scope

- 实例投影、顶层标签改造（WF-01）。
- MultiExec 目标模型（WF-04C）。
- 任何 UI 布局、协议或存储改动。

## Notes

- 复杂任务：开工前补 `design.md`（action 集与 selector 签名）与 `implement.md`（按 Task 04 §2c-2b 顺延，分"纯决策 + 覆盖"与"编排接入 + 生命周期验证"两个提交）。
- 保留 Task 04 design §3 的前提修正：指针靠多 setter 序列而非 effect 同步，本任务不以"删 effect"为目标。
