# WorkspaceShell 状态 seam 渐进提取

> 来源：`docs/tasks/04-workspace-shell-state-seam.md`（Task 04）、`NEXATERM_REQUIREMENTS.md` §16 / §21 / §33、`docs/GAP_ANALYSIS.md` H0.3。父任务：`09-09-nexaterm-architecture-audit-plan`。前置：Task 03 前端测试基线（`09-19-frontend-test-baseline`，Vitest 门禁已接入 CI）。

## 2026-09-23 范围修订（WF-00A）

主线已切换为以用户流程为单位的交付包（父任务 `09-23-nexaterm-workflow-mainline`，规则见 `docs/WORKFLOW_SPEC.md`）。对本任务的影响：

- **"不改任何 UI" 只约束本任务**，不是全项目约束；新布局由 WF-01（`09-23-wf-01-unified-session-entry`）承接。
- 本任务收缩为已完成切片的记录与收尾，不再作为"先拆完整个 WorkspaceShell"的前置任务。剩余工作去向：

| 剩余项 | 去向 |
| --- | --- |
| 2c-2b 关闭/删除路径改 action、九个过渡 setter 清理、静态脚本断言更新 | WF-00B `09-23-wf-00b-close-lifecycle` |
| `WorkbenchTab` 联合、`index` 保留为 `ordinal`、`UnifiedWorkbenchTab.kind` 映射 | WF-01 `09-23-wf-01-unified-session-entry` |
| `terminalSplitAnchorIndex` 改按 owner tab id 锚定 | WF-04B（父任务地图，待创建） |
| 第三刀 MultiExec owner 合并（含 `buildCommandSenderTargets` 迁入 selector、吸收 command sender 状态） | WF-04C（与 Task 06 批量输入部分合并；目标模型按 WS-X03 以实例为单位，不先固化"每连接一个目标"） |
| 五类集合合并为单一 `tabs: WorkbenchTab[]`、全文件拆分 | 只在 WF-01 等流程确实需要时继续，不作为独立前置 |

- 三个基准问题与本任务的关系：本任务的 reducer 形状（`SessionPointerState`、`SplitState`、`MultiExecState`）不得与 WS-M01/M05/X03 的目标模型冲突，但本任务不实现实例投影、Files 左置或 MultiExec 实例目标。
- 本任务收尾条件改为：已完成切片（1a/1b/2a/2b/2c-1/2c-2a）有 CI 与冒烟记录；剩余项去向已登记（上表）；2c-2a 的 GUI 冒烟完成或明确记为未验证。随后归档，不等待第三刀。

## Goal

在**不改变任何用户可见行为、UI 结构、样式和首屏 lazy 边界**的前提下，把 `src/features/layout/WorkspaceShell.tsx` 里散装的 useState 按三个 seam 收敛为纯 reducer，使 split、会话 tab、多目标命令各有单一 owner 且可用 Vitest 直接测试；数据形状按需求 §33 目标主布局与 §21 MultiExec 预留，让后续布局任务只换视图、不再拆状态。

## Confirmed Facts（2026-09-19 本机核对）

- `WorkspaceShell.tsx` 14,370 行；主组件自 844 行起、函数体 9,589 行；组件内 77 个 `useState`、40 个 `useEffect`（13 个直接读写 tab/active 状态）、0 个 `useReducer`；zustand 在依赖里但 `src/` 内零使用。
- 会话集合五份并列：`terminalTabs`、`localTerminalTabs`、`rdpSessions`、`vncSessions`、`remoteFileTabs`；"当前项"指针六个：`activeTabId`、`activeConnectionId`、`activeTabByConnectionId`、`activeRdpSessionId`、`activeVncSessionId`、`activeLocalTerminalTabId`，靠 effect 互相同步。`WorkbenchTabKind` 目前只有 `"terminal" | "file"`。
- Split 状态 9 个 `useState`（layout / host / anchorIndex / tabActive / revision / syncEnabled / syncError / closeConfirmOpen / focusedPaneId），布局纯函数已在 `terminalSplitLayout.ts` 且有 Vitest 覆盖。
- Command sender 11 个 `useState` + 纯函数 `buildCommandSenderTargets`（117 行）；Split sync input 与之分离。需求 §21 要求两者整合为 MultiExec（Live Input / Command Send 两模式，单入口，`MULTIEXEC ACTIVE` 状态）。
- 需求 §33 目标布局：统一顶部 tab 栏（Home / SSH / WSL / RDP …），左侧 Sessions | Files，Files 跟随当前 SSH 会话（§16）。
- 工作区恢复目前只有窗口几何（`mxterm.windowState.v1`），没有 workspace snapshot；Task 05 依赖本任务产出的单一 tab 状态对象。
- 项目约束：`main.tsx` / `App.tsx` 保持轻量，`check-startup-module-boundary-source.mjs` 每步必跑；不自造第二份状态；不用去重/过滤掩盖重复事件。

## Requirements

1. 状态机制：`useReducer` + 纯 reducer 模块（用户 2026-09-19 选定）；不引入 zustand 或其它状态库。
2. 三个 seam，每个一个目录 `src/features/workspace/<seam>/`，含 `reducer.ts`、`actions.ts`（action 类型与构造器）、`reducer.test.ts`；reducer 不 import React、Tauri API 或 DOM。
3. 执行顺序固定：Split → SessionTabs → MultiExec。每刀一个提交、一轮 CI；上一刀 CI 绿后再开下一刀。
4. 每刀先写 characterization 测试锁住现有行为，再建 reducer，再在 WorkspaceShell 用 `useReducer` 替换对应 `useState`，setter 调用点改 dispatch，副作用留在原 effect 中不动。
5. 数据形状（为 §33 / §21 预留，本任务不实现对应 UI）：
   - Split：`{ layout, host, focusedPaneId, revision, sync: { enabled, error }, closeConfirmOpen }`。
   - SessionTabs：单一有序 `tabs: WorkbenchTab[]`，`WorkbenchTab` 为按 `kind` 判别的联合（`home | ssh | local | rdp | vnc | editor`），一个 `activeTabId`；`activeConnectionId`、`activeRdp/Vnc/LocalTerminalId`、Files 面板绑定等全部改为派生 selector。
   - MultiExec：`{ mode: "off" | "live" | "send", targets, input, history, delivery }` 一个 controller，吸收 command sender 全部状态与 split sync 的 enabled/error（Split reducer 在第三刀时把 `sync` 移交）。
6. 每刀验证：`pnpm run check`、`pnpm test`、`pnpm run build`、`node scripts/check-startup-module-boundary-source.mjs`、相关 `scripts/check-*.mjs`（command sender / split 相关）、CI 全绿。
7. 文档同步：`.trellis/spec/frontend/state-management.md` 填入 reducer 约定；`docs/ARCHITECTURE.md` 与 `docs/CURRENT_STATE.md` 更新 WorkspaceShell 状态所有权描述。

## Acceptance Criteria

> 2026-09-23 标注：按实际完成度注记，未完成项不打勾；迁出项在括号内注明去向，不再作为本任务收尾条件。

- [ ] split、会话 tab、多目标命令各有单一 reducer owner；WorkspaceShell 中对应 `useState` 全部移除，无双写。（split 已完成；会话指针已进 reducer、五类集合仍为 useState；MultiExec 仅 sync 三态进 reducer，其余 → WF-04C。本任务不再要求全部完成。）
- [ ] 每个 reducer 有 Vitest 用例覆盖：激活/关闭/重连/同步/错误路径，且 characterization 测试在重构前后同时通过。（split / multiExec(sync) / sessionTabs 指针已有；关闭路径覆盖 → WF-00B。）
- [ ] `WorkspaceShell.tsx` 行数下降且 `useState` 计数下降（记录前后数字），首屏 chunk 不含新增重模块。（行数按 `git show <sha>:… \| Measure-Object -Line`：347c8b2 = 13,132，45418f3 = 13,076；此前 implement.md 记录的 14,0xx 系另一计数方法，不再沿用。行数不作为里程碑。）
- [x] 无新增 `dangerouslySetInnerHTML`、去重掩盖、隐藏异常或跨 feature 复制组件。（已完成切片经 check 与 CI 核对。）
- [ ] 三刀各自 CI 全绿，run ID 记录在 implement.md。（一刀、二刀 2a–2c-2a 已记录；2c-2b → WF-00B；三刀 → WF-04C。）
- [ ] state-management 规范、ARCHITECTURE、CURRENT_STATE 已更新。（state-management 已填；ARCHITECTURE / CURRENT_STATE 于 2026-09-23 由 WF-00A 更新所有权表与行数。）

## Out of Scope

- 不改任何 UI：菜单、工具栏、侧栏、状态栏、tab 栏外观、CSS 一律不动；§33 布局落地另立任务。**本条只约束本任务**；布局任务为 WF-01 `09-23-wf-01-unified-session-entry`，替代关系见 `docs/WORKFLOW_SPEC.md` §11。
- 不建立 remoteFileTabs 与 SSH tab 的父子关系（布局任务再做；tab 联合类型给 `editor` 留位即可）。
- 不实现 workspace snapshot / 持久化（Task 05）。
- 不迁 zustand，不改 Rust / IPC 契约，不动 `terminalSplitLayout.ts` 的纯函数语义。
- 不合并 Live Input 与 Command Send 的运行时行为，只合并状态 owner；行为整合归 MultiExec UI 任务。
