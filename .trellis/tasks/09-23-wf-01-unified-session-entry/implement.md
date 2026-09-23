# WF-01 执行清单

## 0. 开工前

- [x] 决策 D1–D8 确认并回写 WORKFLOW_SPEC v0.2（2026-09-23）。
- [x] 前置：WF-00B 代码完成（`0079f15` / `0f421fc`，CI 绿）；GUI 冒烟由维护者另行安排，不阻塞原型与纯函数切片，但阻塞切片 3 的真实窗口验证结论。
- [x] `task.py start` 本任务。

## 1. 原型（`prototype/light-neutral/mxterm-light-neutral.html`）

- [x] 顶部：菜单栏（会话 / 视图 / 终端 / 工具 / 设置 / 帮助，可展开伪菜单）+ 高频工具栏（新建会话、分屏、MultiExec、隧道、X11[禁用+原因]、搜索、设置）+ 实例标签行（`名称 · 终端 N`、Local `profile · N`、RDP `· RDP`、分屏组一个标签）。
- [x] 左侧：Sessions / Files 分段切换；Sessions 复用现有连接仓库内容；Files 复用现有文件工具栏 + 树，头部显示绑定的实例与目录、跟随开关（WS-F02 只做静态占位）。
- [x] 右侧：只剩监控 / 命令 / Docker / AI 工具标签，可收起。
- [x] 中间：状态 1 空工作区（首页：快速连接 / 最近 / 收藏）；状态 2 一个 SSH 终端 + 左侧 Files；状态 3 四 pane + MultiExec 目标面板（实例勾选、live/send 切换、`MULTIEXEC ACTIVE` 状态与停止）。
- [x] 窄窗口：工具栏折叠进 `⋯`，右侧面板收起，菜单栏保留。
- [x] 状态切换：原型内少量 JS（`data-state` on `.app`）+ 顶部小状态条；保持现有 token、间距、8px 内圆角、细边框。
- [x] 设计评审：`ui-ux-pro-max` 不可用时由维护者按 component-guidelines 桌面工具风格人工评审；评审结论若改动规则则回写 WORKFLOW_SPEC。
- [x] 提交 `docs(prototype): add unified session entry states to the light-neutral master`。

## 2. 实例投影（纯函数，shell 不变）

- [ ] `sessionTabs/instances.ts`：`WorkspaceItem` 联合（`home | ssh | local | rdp | vnc | split`）、`selectWorkspaceItems(collections, order, splitHost)`、`itemTitle(item, lookups)`（WS-E11）、缺失顺序项按集合顺序补尾。
- [ ] `SessionPointerState.order: string[]`：`tabs/itemOpened(id)` / 关闭 action 内移除 / `tabs/moveItem` 预留；`selectActiveItemId(pointers)` 派生。
- [ ] 承接 Task 04 顺延：`WorkbenchTab` 联合、`TerminalTab.index` → `ordinal` 命名（类型层），`UnifiedWorkbenchTab.kind` 映射。
- [ ] 测试：`instances.test.ts`（投影、标题、顺序补尾、分屏组折叠）+ reducer 新 case。
- [ ] 提交 `refactor(workspace): add workspace item projection and order table`。

## 3. 顶栏改实例标签

- [ ] `AppTitlebar` props：`items` + `activeItemId` + `onSelectItem` / `onCloseItem` / `onCloseOthers` / `onCloseToRight` / `onCloseAll`；溢出机制沿用；`localTerminalActive` / `connectionSessions` 退役。
- [ ] shell：`selectWorkspaceItems` 接入；点击项 → 按 kind 调现有 activate*；关闭项 → 现有 close 路径（WF-00B action）。
- [ ] 文案走 i18n key（依赖切片 6，可先建最小 `t`）。
- [ ] 检查脚本：`check-session-subtab-memory.mjs` 中 `activateTerminalTab(tab)` 断言核对；`check-command-sender-active-tab-source.mjs`（预存失败）改为断言动作表或明确留给 WF-04C。
- [ ] 验证：tsc / Vitest / build / boundary；**真实窗口**：同 profile 两终端 + Local + 一个 RDP/VNC 可直接定位，关一个不影响兄弟，焦点后操作作用于正确实例（A02）。
- [ ] 提交 `feat(workspace): show session instances as top-level tabs`。

## 4. 动作表与统一入口

- [ ] `shortcuts/actionRegistry.ts`：`id`、`labelKey`、`icon`、`group`（menu）、`toolbar?: priority`、`enabledWhen(ctx)`、`disabledReasonKey`；现有 8 个快捷键动作迁入并保持绑定。
- [ ] 菜单栏 + 工具栏组件（`src/features/layout/AppMenuBar.tsx` / `AppToolbar.tsx`，Radix Menubar / DropdownMenu，共享 `dropdown-menu-*` 类）；窄窗口溢出 `⋯`（WS-E08）。
- [ ] 上下文菜单与快捷键改读动作表；未实现动作 disabled + tooltip 原因（WS-E01）。
- [ ] 验证 + `check-startup-module-boundary-source.mjs`；提交 `feat(workspace): add menu bar and toolbar backed by the action registry`。

## 5. 左侧 Sessions / Files 切换壳

- [ ] `ConnectionPane` 外包 `WorkspaceSidebar`（分段控件，共享样式）；Files 占位视图显示活动 pane 的 connectionId 与"WF-03 接入"说明，不搬 `RemoteFilePanel`。
- [ ] 记忆最后选择（非敏感，进快照契约）。
- [ ] 提交 `feat(workspace): add Sessions/Files switch to the left sidebar`。

## 6. i18n 基础

- [ ] `src/shared/i18n/`：`t(key, params)`、`useLocale()`、`locales/en.json`、`locales/zh-CN.json`、设置项 `basic.locale`（`system | en | zh-CN`）；OS 快捷键标记走 `Keybinding` 共享组件。
- [ ] 新入口（菜单、工具栏、标签标题模板、侧栏切换、MultiExec 状态文案）全部走 key；旧面板不动。
- [ ] `scripts/check-i18n-new-entry-source.mjs`：断言新入口文件无硬编码 CJK。
- [ ] 提交 `feat(i18n): add minimal locale catalog and use it for the new workspace entry`。

## 7. 快照契约类型

- [ ] `src/features/workspace/restore/snapshotTypes.ts` + `toSnapshot(pointers, collections)` 纯函数：版本、profile/临时目标引用、逻辑实例 id、顺序、pane 结构与比例、活动项、Files 目录/跟随、侧栏状态；**不含** sessionId / 密码 / 私钥 / cookie / 广播状态（WS-R01）。测试断言敏感字段缺席。
- [ ] 提交 `feat(workspace): define the non-sensitive workspace snapshot contract`。

## 验证命令

```powershell
pnpm run check; pnpm test; pnpm run build
node scripts/check-startup-module-boundary-source.mjs
node scripts/check-session-subtab-memory.mjs
node scripts/check-workspace-ssh-activation-source.mjs
node scripts/check-workspace-empty-home-source.mjs
```

## 回滚点

每切片一个提交，`git revert`；切片 2 / 7 无 shell 消费者，可独立回退。

## 结果记录

- 切片 1（原型）2026-09-23 完成：统一会话入口三态（空工作区首页 / 单 SSH + 左侧 Files / 四 pane + MultiExec）+ 窄窗口折叠，落到 `prototype/light-neutral/mxterm-light-neutral.html`（`.app` 上 `data-state / data-sidebar / data-right / data-narrow` 驱动，无 `:target` 依赖）。结构与配色 token 自检通过（标签平衡、无乱码、token 全部命中母版 `:root`）。
  - 状态切换器实际放在窗口底部居中（原型专用，非产品 UI），与计划文案“顶部小状态条”略有出入，仅原型辅助控件。
  - 设计评审：`ui-ux-pro-max` 本会话不可用，按约定由维护者人工评审，结论「先按此原型验证 OK，后续按需再改」。
  - 已知偏离（维护者确认暂不改）：底部 MultiExec 栏做成了目标面板（Live/Send 分段 + 逐实例 chip），比 MobaXterm 的单行广播栏重；实例级目标与 RDP 置灰按 WS-X03 / WS-X05 保留，形态待后续需求再向 MobaXterm 收敛。
  - 提交：`docs(prototype): add unified session entry states to the light-neutral master`。
