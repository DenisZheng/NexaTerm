# WF-04A 会话树数据一致性

> 2026-10-02：维护者确认按建议实施；同级名称唯一等规则已写入 WORKFLOW_SPEC v0.4。
> 父任务：`09-23-nexaterm-workflow-mainline`。延续原主线，不创建新路线。
> 审计基线：main `92e2581f9b1b286a7a6c585bb8d98754b628a269`。

## 用户流程与目标

创建嵌套组 → 移动连接/组 → 导出 → 导入 → 重启应用 → 树层级、连接归属和排序保持一致。

正式验收：**A07**。消除 localStorage、SQLite、sync、export/import 多份分组事实源，空组也必须持久化。

## 规范依据

依次读取 NEXATERM_REQUIREMENTS.md（尤其 §31/51/52）、docs/WORKFLOW_SPEC.md v0.4、ROADMAP.md、本任务、NEXATERM_WORKFLOW_DELIVERY_PLAN.md 的 WF-04A / A07。

- WF-04A 当前数据模型约束见 `research/current-group-data-flow.md`；产品规则见 WORKFLOW_SPEC v0.4 WS-G01–WS-G05。
- 遵守 WS-M01 / WS-M05、WS-E09 / WS-E10，不建立第二套配置/实例事实源。
- 不提前实现或决定 WS-X09 / A08（WF-04B）、WS-X04 / A09/A10（WF-04C）。

## 要求

- SQLite/repository 持有规范分组树；UI 展开状态可留本地。
- stable ID、parent、sort、必要视觉属性有明确 owner；连接归属不依赖可变名称。
- 创建/rename/move/delete/import 使用一致校验；拒绝 self-parent、祖先环、orphan、静默覆盖。
- 旧数据库向前迁移不得丢 group/connection assignment；保留备份、失败可恢复，不删库重建。
- legacy localStorage 迁移幂等，保留原文、映射和冲突证据；成功前不销毁唯一旧数据，重启不制造副本。
- 同步/导入导出保留树、关联和排序，旧格式有明确兼容策略；预览与应用一致。
- 不新增依赖，不放宽 line-budget.json，不把业务状态机堆回 WorkspaceShell。

## 已确认决策

2026-10-02 维护者“好，按建议实施”确认设计推荐；规则正文以 WORKFLOW_SPEC v0.4 WS-G01–WS-G05 为准。WS-X04/WS-X09 仍待确认，不属于本任务。

## A07 结束条件

测试树：Production 下 Web / Database，Development 下 Test；Root 为展示根。多个 SSH profile 分属不同层级。

- [x] 建嵌套组及空组 → 移动组 → 移动连接 → rename → 尝试制造 cycle/名称冲突。
- [x] export → 使用独立数据环境 → import → 真实重启 NexaTerm → 检查整棵树及 connection assignment。
- [x] hierarchy、空组、sort、rename/move 和关联保持；无 orphan/cycle；冲突按已确认规则处理且不静默覆盖。
- [x] SQLite、旧格式和 localStorage 迁移覆盖失败、回滚、重试及重启幂等。
- [x] 四维证据：实现状态、自动化证据、真实 GUI / 数据证据、平台与环境；unit/mock 不代表完整 A07 PASS。

当前证据：04A-1～04A-4 已实现，本地自动化证据见 implement.md；A07 macOS 真实 GUI + 重启数据验收 PASS，legacy 冲突与三主题补验 PASS，见 validation/a07.md；Windows/Linux 仅 CI 自动化证据。维护者已授权补验后合并 PR #26，执行前须最终 HEAD CI 全绿。

## 范围外

WF-04B/04C、连接全部、批量认证/并发、新分屏、MultiExec、任意层数 Split、AI/Monitor/Docker 新功能、主题改版、RDP/VNC 重构、Workspace Restore。PR #12 不修改/合并；WF-02/WF-03 不重做。仅 PR #26 已于本轮得到明确合并授权。
