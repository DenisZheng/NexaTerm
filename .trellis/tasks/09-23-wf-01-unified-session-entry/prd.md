# WF-01 主窗口与统一会话入口

> 父任务：`09-23-nexaterm-workflow-mainline`。来源：`NEXATERM_WORKFLOW_DELIVERY_PLAN.md` §4 WF-01、§7 执行 4；`NEXATERM_REQUIREMENTS.md` §29–§35。
> 用户流程：通过统一菜单/工具栏找到新建、Files、Split、MultiExec；同一 SSH profile 打开两个终端，再打开 Local 与一个可用的 RDP/VNC 实例，每个都能直接定位；焦点改变后操作作用于正确实例；关闭其中一个不关闭兄弟实例；主题和菜单键盘操作可用。
> 验收编号：**A02**。引用规则：WS-M01–M05、WS-E01–E10、WS-R01（只定义快照契约，不实现持久化）。

## Goal

把入口和会话单位统一：顶层标签改为实例投影，左侧提供 Sessions / Files 切换壳，菜单、工具栏、上下文菜单、快捷键调用同一动作入口，新入口自带 i18n 与能力判断。

## Requirements

1. **先原型后实现**：在 `prototype/light-neutral/mxterm-light-neutral.html` 上展示三种状态（空工作区、一个 SSH + Files、四 pane + MultiExec 目标面板），并标出窄窗口下菜单/工具栏收起方式；经现有设计流程（`ui-ux-pro-max` 审查 + 用户确认）后再改 React。原型确认的同时回写 `docs/WORKFLOW_SPEC.md` 的待确认项 WS-E02、WS-E06、WS-E08。
2. 一个保存的连接可产生多个实例；顶层标签使用实例投影；Local 不再只能作为一个聚合入口隐藏全部子终端；分屏工作区项与其中的 pane 引用同一套实例 ID（WS-M02、WS-M04）。
3. 投影用 selector 从现有 Terminal/Local/RDP/VNC 集合生成，不复制第二份会话数据；标签顺序可用独立 ID 顺序表（WS-M05）。承接 Task 04 顺延项：`WorkbenchTab` 联合、`TerminalTab.index` 保留为 `ordinal`、`UnifiedWorkbenchTab.kind` 映射函数。（切片 2 维护者确认：`WorkbenchTab` 联合由 `WorkspaceItem` 承接；`UnifiedWorkbenchTab.kind` 映射被 WS-E05 / WS-M05 取代，不实现，见 implement.md 结果记录。）
4. 菜单、工具栏、上下文菜单和快捷键调用同一动作入口，能力判断集中派生；未实现功能显示可用状态及原因（WS-E01）。复用 `src/features/shortcuts/`，不另起注册中心（WS-E10）。
5. 左侧 Sessions / Files 切换壳（WS-E04）：本包只建立切换与 Files 占位绑定到活动 pane 的上下文；Files 视图的抽出与目录跟随在 WF-03。
6. English/zh-CN 资源与 OS 快捷键标记随新入口引入（WS-E09）。
7. 重型 RDP/VNC、Monaco、文件工具保持按需导入；改动后运行 `node scripts/check-startup-module-boundary-source.mjs` 并核对 build 产物（WS-E10）。
8. 定义 WS-R01 的非敏感快照契约（类型与序列化边界），不做持久化。
9. 随行为变更同步替换断言旧位置/旧标识符的 source-check（例如 `check-command-sender-active-tab-source.mjs`、`check-workspace-ssh-activation-source.mjs`、`check-session-subtab-memory.mjs`），检查器不得把新入口改回旧位置。
10. X11 可行性 spike 可作为独立任务在本包期间并行，不阻塞窗口改造。

## Acceptance Criteria

- [ ] 原型三种状态经设计流程确认，WORKFLOW_SPEC 待确认项 WS-E02 / E06 / E08 已回写并升版。
- [ ] A02：同一保存配置打开两次，关闭其中一次，另一实例保留，活动项与 Files 指向正确。
- [ ] 同一 SSH profile 两个终端 + Local + 一个 RDP/VNC 实例可直接定位；焦点改变后操作作用于正确实例。
- [ ] 主题（亮/暗/system-dark）与菜单键盘操作可用；新入口无硬编码中文。
- [ ] lazy loading 无回归：startup boundary 通过，重模块未进入首屏 chunk。
- [ ] 相关 source-check 已更新为新契约，未通过"修回旧位置"取得绿灯。
- [ ] `pnpm run check`、`pnpm test`、`pnpm run build` 通过；CI run 记录；真实窗口验证一轮。

## Out of Scope

- 不重写所有窗口组件；不以统一标签为由重写 RDP/VNC 引擎；不新增全局状态库。
- Files 视图抽出与目录跟随（WF-03）；保存并连接 / Quick Connect（WF-02）；MultiExec 目标模型（WF-04C）；快照持久化（WF-07）。
- 配色美化。

## Notes

- 复杂任务：开工前补 `design.md`（实例投影 selector、动作入口契约、快照契约类型）与 `implement.md`（原型 → 投影 → 入口 → i18n → 检查脚本，分提交）。
- 前置：WF-00B 完成（关闭生命周期稳定）。
- 旧原型说明中"顶部只放 SSH 连接、文件在右侧"已由 WS-M02 / WS-E04 替代，见 `prototype/light-neutral/mxterm-light-neutral-design.md` 顶部适用范围表；沿用其视觉原则、弹窗、分隔线、token 与共享组件。
- 进度（2026-09-25）：切片 1–3 已提交；切片 3 顶栏实例标签的自动化验证通过，验收项"A02 / 实例直接定位 / 真实窗口验证"需维护者 GUI 冒烟后再勾选（详见 implement.md 结果记录）。
