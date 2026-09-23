# WF-00B 执行清单

## 0. 开工前

- [x] `task.py current --source` 指向本任务（2026-09-23 `start`）；`git status --short` 只含许可证 WIP。
- [x] 基线：Vitest 177/1 todo（WF-00A 复跑）；检查脚本改动前状态：`check-session-subtab-memory` ✓、`check-local-terminal-warmup-source` ✓、`check-remote-file-editor-source` ✓、`check-workspace-ssh-activation-source` ✓、`check-startup-module-boundary-source` ✓、**`check-workspace-empty-home-source` 已失败（exit 1）**——它断言 `returnHomeWhenWorkspaceEmpty` 函数体内含七个 setter 序列，而 2c-2a 已把该函数改成 dispatch，属脚本相对源码漂移，不是产品故障；本任务按 design §3 改为断言 reducer 行为。
- [x] 行数：`WorkspaceShell.tsx` @ 45418f3 = 13,076（`git show | Measure-Object -Line`）。

## 1. 提交一：纯决策 + action（shell 不动）

- [x] `sessionTabs/closeDecision.ts`：`CloseSnapshot`、`FollowUp`、`CloseDecision`，五个 `decide*`，逐分支照抄 design §1 表。
- [x] `closeDecision.test.ts`：终端 9 例、连接 6 例、本地 3 例、rdp/vnc 4 例，含回退顺序与全空回首页。
- [x] `actions.ts`：加 `tabs/closeTerminals` / `closeConnections` / `closeLocalTerminals` / `removeRdp` / `removeVnc` / `clearActiveFile` / `focusPaneBinding` / `startConnecting` / `openSettings` / `closeSettings` / `consumeFollowUp`。
- [x] `reducer.ts`：`followUp` 字段 + 各 case；`applyDecision` 把 patch / remember / forget / followUp 落到 state。
- [x] `reducer.test.ts`：新 case 各一例；`followUp` 设置/清除；无变化同引用。
- [x] `useSessionTabsController.ts`：`onFollowUp` 输入 + 消费 effect；测试加 2 例，旧 12 例不改。
- [x] 验证：tsc 0、Vitest sessionTabs 70/70、build ✓、boundary ✓。
- [x] 提交 `0079f15 refactor(workspace): add close decision selectors and session close actions`。

## 2. 提交二：shell 接入 + 清理

- [x] `sessionRef()` / `snapshotFromRefs()` 辅助（shell 内，紧随 `connectingTabExists`）。
- [x] 改写六条路径：外部清理不变 → ref 计算 nextTabs → 值式 set → 一次 dispatch。
- [x] `onFollowUp` 接到 controller：按 kind 用 `*Ref.current` 找实体后调 `activateTerminalTab` / `activateLocalTerminalTab` / `activateRdpSession` / `activateVncSession`。
- [x] `focusTerminalSplitPane` → `tabs/focusPaneBinding`；`startConnectionStep` → `tabs/startConnecting`；`openSettingsSection` / `returnFromSettings` → `tabs/openSettings` / `closeSettings`；两处 `setActiveRemoteFileTabId(null)` → `tabs/clearActiveFile`。
- [x] 八个过渡 setter 调用点 grep 为 0 → 从 controller / actions / reducer 删除；`setActiveRemoteFileTabId` 保留一个调用点（远程文件重命名）并标 `@deprecated`。顺带删除因此无调用者的 `returnHomeWhenWorkspaceEmpty`、`rememberActiveTab`（reducer 的 `tabs/returnHomeIfEmpty` / `tabs/rememberActive` 保留，有测试）。
- [x] 检查脚本：`check-workspace-empty-home-source.mjs`（改为断言六条路径 dispatch close action、函数体内无集合 updater / 无 activate* 直调、reducer 回首页清指针、closeDecision 的 RETURN_HOME_PATCH）；`check-workspace-ssh-activation-source.mjs`（断言 `tabs/startConnecting` dispatch 与 reducer case 先写 mode 再写 activeTabId）；`check-session-subtab-memory.mjs`（记忆写入改为断言 reducer 的 activateTerminal / startConnecting case 与 `decision.remember`）。
- [x] 验证：tsc 0；Vitest sessionTabs 70/70；六个相关检查全过；全部 `check-*.mjs` 工作树 10 失败，与 HEAD worktree 完全相同（app-select、command-sender-active-tab、command-sender-mvp、connection-jump、connection-quick-search、dark-mode、global-scrollbar、ironrdp-macos、rdp-release-readiness、settings-page），无新增失败；build ✓、boundary ✓。`WorkspaceShell.tsx` 13,076 → 12,876。
- [x] 全量 `pnpm test`：13 文件、209 passed / 1 todo（基线 177 + 新增 32）。
- [x] 提交 `refactor(workspace): route session close paths through close actions`（hash 见 git log；随后单独提交 spec 与本记录）。

## 3. 验证与收尾

- [ ] GUI 冒烟（用户，2026-09-23 决定暂缓）：关闭活动 SSH tab、关闭非活动 tab、关闭最后一个回首页、同 profile 两个终端关一个、分屏中关 pane、连接中立即关闭再等结果（A01）、删除有多个终端的连接、关 RDP/VNC 后回退、从设置页返回。**未验证前不归档、不宣称 A01 通过。**
- [x] push `45418f3..d722bf5`；CI run `35825557106` @ `d722bf5` 全绿：Frontend checks / Rust linux-x64 / macos-arm64 / windows-x64 / Security evidence 均 success，Package windows-x64 skipped（2026-09-23）。
- [x] Task 04 `implement.md` 2c-2b 条目指向本任务提交；父任务地图 WF-00B 标"代码完成，冒烟待做"。
- [x] `trellis-update-spec`：`state-management.md` 已补 followUp 标记模式与关闭路径形状（`d722bf5`）。

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

### 2026-09-23 提交一 / 提交二

- 接受的行为差异（复述 design §5，均已在测试中固定）：
  1. 回退激活（activate*）由 reducer `followUp` → controller effect → shell 调用，晚一个 effect tick，仍在同一提交前。
  2. 决策读 reducer 当前指针而非 shell 闭包；同一事件里先关 RDP/VNC 再关终端（`deleteConnection`）时，后一个决策看到的是前一个决策已更新的指针，且 `followUp` 以最后一个决策为准（前一个尚未消费的标记被覆盖，这是正确的：它指向的实体可能已被后续关闭）。原代码在该边界会额外跑一次 `activateTerminalTab` 的 split / 命令目标同步效果，新代码不跑；只影响"删除一个同时有活动 RDP/VNC 和终端的连接"这一路径。
  3. 集合从 updater 改为"ref 计算 + 值式 set"；`closeTerminalTabs` / `closeConnectionSessions` / `deleteConnection` 的 `closingTabIds` 改从 ref 取（原来 warmup 停止用渲染态、运行时关闭用 ref，两者正常情况下一致）。
- 未改：任何回退顺序；五类集合仍为 useState；`*Ref` 通道；`runConnectionStep` 的 `connectingTabExists()` 保护。
- 顺带清理：`returnHomeWhenWorkspaceEmpty`、`rememberActiveTab` 两个 shell 函数因无调用者删除；`check-session-subtab-memory.mjs` 原本断言 `rememberActiveTab` 字符串存在，改为断言 reducer 写记忆的 case。
- 预存失败、本任务不处理：`check-command-sender-active-tab-source.mjs`（HEAD 即失败，它断言 `activateTerminalTab` 体内含 `rememberActiveTab`，而该函数早在 2c-2a 前就已改为委托 `activateStandaloneTerminalTab`）与其余 9 个已知失败脚本，归 WF-04C / 对应包。
- 未做：GUI 冒烟（§3）、CI run 记录。
