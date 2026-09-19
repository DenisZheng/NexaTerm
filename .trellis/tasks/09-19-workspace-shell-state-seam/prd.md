# WorkspaceShell 状态 seam 渐进提取

> 来源：`docs/tasks/04-workspace-shell-state-seam.md`（Task 04）、`NEXATERM_REQUIREMENTS.md` §16 / §21 / §33、`docs/GAP_ANALYSIS.md` H0.3。父任务：`09-09-nexaterm-architecture-audit-plan`。前置：Task 03 前端测试基线（`09-19-frontend-test-baseline`，Vitest 门禁已接入 CI）。

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

- [ ] split、会话 tab、多目标命令各有单一 reducer owner；WorkspaceShell 中对应 `useState` 全部移除，无双写。
- [ ] 每个 reducer 有 Vitest 用例覆盖：激活/关闭/重连/同步/错误路径，且 characterization 测试在重构前后同时通过。
- [ ] `WorkspaceShell.tsx` 行数下降且 `useState` 计数下降（记录前后数字），首屏 chunk 不含新增重模块。
- [ ] 无新增 `dangerouslySetInnerHTML`、去重掩盖、隐藏异常或跨 feature 复制组件。
- [ ] 三刀各自 CI 全绿，run ID 记录在 implement.md。
- [ ] state-management 规范、ARCHITECTURE、CURRENT_STATE 已更新。

## Out of Scope

- 不改任何 UI：菜单、工具栏、侧栏、状态栏、tab 栏外观、CSS 一律不动；§33 布局落地另立任务。
- 不建立 remoteFileTabs 与 SSH tab 的父子关系（布局任务再做；tab 联合类型给 `editor` 留位即可）。
- 不实现 workspace snapshot / 持久化（Task 05）。
- 不迁 zustand，不改 Rust / IPC 契约，不动 `terminalSplitLayout.ts` 的纯函数语义。
- 不合并 Live Input 与 Command Send 的运行时行为，只合并状态 owner；行为整合归 MultiExec UI 任务。
