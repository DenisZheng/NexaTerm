# WF-00B 执行清单

## 0. 开工前

- [x] `task.py current --source` 指向本任务（2026-09-23 `start`）；`git status --short` 只含许可证 WIP。
- [x] 基线：Vitest 177/1 todo（WF-00A 复跑）；检查脚本改动前状态：`check-session-subtab-memory` ✓、`check-local-terminal-warmup-source` ✓、`check-remote-file-editor-source` ✓、`check-workspace-ssh-activation-source` ✓、`check-startup-module-boundary-source` ✓、**`check-workspace-empty-home-source` 已失败（exit 1）**——它断言 `returnHomeWhenWorkspaceEmpty` 函数体内含七个 setter 序列，而 2c-2a 已把该函数改成 dispatch，属脚本相对源码漂移，不是产品故障；本任务按 design §3 改为断言 reducer 行为。
- [x] 行数：`WorkspaceShell.tsx` @ 45418f3 = 13,076（`git show | Measure-Object -Line`）。

## 1. 提交一：纯决策 + action（shell 不动）

- [ ] `sessionTabs/closeDecision.ts`：`CloseSnapshot`、`FollowUp`、`CloseDecision`，五个 `decide*`，逐分支照抄 design §1 表。
- [ ] `closeDecision.test.ts`：六场景 × 五路径的表驱动用例 + 回退顺序 + 全空回首页 + design §5.2 的 deleteConnection 边界。
- [ ] `actions.ts`：加 `tabs/closeTerminals` / `closeConnections` / `closeLocalTerminals` / `removeRdp` / `removeVnc` / `clearActiveFile` / `focusPaneBinding` / `startConnecting` / `openSettings` / `closeSettings` / `consumeFollowUp`；八个 `tabs/set*` 先保留（提交二删）。
- [ ] `reducer.ts`：`followUp` 字段 + 各 case；`initialSessionPointerState.followUp = null`。
- [ ] `reducer.test.ts`：新 case 各一例；`followUp` 设置/清除；无变化同引用。
- [ ] `useSessionTabsController.ts`：`onFollowUp` 输入 + 消费 effect；`useSessionTabsController.test.tsx` 加 followUp 用例，旧 12 例不改。
- [ ] 验证：tsc / Vitest / build / boundary。
- [ ] 提交 `refactor(workspace): add close decision selectors and session close actions`。

## 2. 提交二：shell 接入 + 清理

- [ ] `snapshotFromRefs()` 辅助（shell 内，组装五个 ref 的 id/connectionId）。
- [ ] 改写 `closeTerminalTabs`、`closeConnectionSessions`、`deleteConnection`、`closeLocalTerminalTabs`、`removeRdpSessionsLocally`、`removeVncSessionsLocally`：外部清理不变 → ref 计算 nextTabs → 值式 set → 一次 dispatch。
- [ ] `onFollowUp` 接到 controller：按 kind 用 `*Ref.current` 找实体后调 `activateTerminalTab` / `activateLocalTerminalTab` / `activateRdpSession` / `activateVncSession`。
- [ ] `focusTerminalSplitPane` → `tabs/focusPaneBinding`；`startConnectionStep` → `tabs/startConnecting`；`openSettingsSection` / `returnFromSettings` → `tabs/openSettings` / `closeSettings`；2744 / 2967 → `tabs/clearActiveFile`。
- [ ] `grep -n 'setActiveConnectionId(\|setActiveTabId(\|setActiveRdpSessionId(\|setActiveVncSessionId(\|setActiveLocalTerminalTabId(\|setActiveView(\|setActiveWorkspaceMode(\|setHomeActive(' src/features/layout/WorkspaceShell.tsx` 为 0 → 删八个过渡 setter 与对应 `tabs/set*` action；`setActiveRemoteFileTabId` 保留并标 `@deprecated`（3206）。
- [ ] 更新 `check-workspace-empty-home-source.mjs`、`check-workspace-ssh-activation-source.mjs` 断言（design §3）。
- [ ] 验证：tsc / Vitest / build / boundary / 五个检查脚本；行数记录。
- [ ] 提交 `refactor(workspace): route session close paths through close actions`。

## 3. 验证与收尾

- [ ] GUI 冒烟（用户）：关闭活动 SSH tab、关闭非活动 tab、关闭最后一个回首页、同 profile 两个终端关一个、分屏中关 pane、连接中立即关闭再等结果（A01）、删除有多个终端的连接、关 RDP/VNC 后回退、从设置页返回。
- [ ] push，记录 CI run。
- [ ] Task 04 `implement.md` 2c-2b 条目指向本任务结果；父任务地图 WF-00B 标完成。
- [ ] `trellis-update-spec`：`state-management.md` 补 `followUp` 标记模式（与 split `collapsedTo` 同类）的约定。

## 验证命令

```powershell
pnpm run check
pnpm test
pnpm run build
node scripts/check-startup-module-boundary-source.mjs
node scripts/check-session-subtab-memory.mjs
node scripts/check-local-terminal-warmup-source.mjs
node scripts/check-remote-file-editor-source.mjs
node scripts/check-workspace-empty-home-source.mjs
node scripts/check-workspace-ssh-activation-source.mjs
```

## 回滚点

两个提交各自 `git revert`；提交一无 shell 消费者，revert 无副作用。

## 结果记录

（逐步填写）
