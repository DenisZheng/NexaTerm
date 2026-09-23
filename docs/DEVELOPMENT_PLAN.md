# 渐进式开发计划

> 2026-09-23 修订（WF-00A）：阶段组织方式由"审计 / 加固 / 重构分阶段"改为**以用户能演示的操作流程为单位的交付包（WF）**。依据：维护者授权、`NEXATERM_WORKFLOW_DELIVERY_PLAN.md`、`NEXATERM_REQUIREMENTS.md`。交互规则正文在 `docs/WORKFLOW_SPEC.md`；任务地图与迁移去向在 `.trellis/tasks/09-23-nexaterm-workflow-mainline/prd.md`。2026-09-09 版阶段计划保留在文末作为历史参考。

## 原则

- 每个交付包以一段能实际演示的用户流程结束；安全、测试、架构整理是该流程的交付条件，不是独立阶段。
- 已有加固成果继续使用：协议、凭据、Host Key、PPK、Split、Vitest 门禁不重做。全面拆完 `WorkspaceShell` 不是进入产品改造的前置条件。
- 保留原需求对跨平台、X11、恢复、i18n、许可证和数据安全的要求。中途可交付试用里程碑；未满足原 v1 验收时不把试用版称为完整 v1。
- 不以 `WorkspaceShell` 行数、组件数量、source-check 数量作为主里程碑。

## 交付包

| 包 | 用户能演示的结果 | 主要依赖 | 进入下一包条件 | 验收 |
| --- | --- | --- | --- | --- |
| WF-00A 规范切换与上下文校准 | 入口、规范、任务与检查依据一致 | main `45418f3` | 三个基准问题答案一致（WORKFLOW_SPEC §9） | — |
| WF-00B 关闭/删除生命周期收尾 | 原有打开、切换、关闭行为稳定 | WF-00A | 关闭/删除 action 迁移完成；Task 04 剩余范围迁出 | A01 |
| WF-01 主窗口与统一会话入口 | 统一菜单/工具栏找到新建、Files、Split、MultiExec；同一主机两次打开可直接定位 | WF-00 | 原型通过设计流程；标签、焦点、关闭与 lazy loading 不回归 | A02 |
| WF-02A 保存并连接 / 02B Quick Connect | 新建→保存并连接；首页输入地址→临时连接→可保存 | WF-01 | 认证、取消、失败重试和临时文件上下文走通 | A03、A04 |
| WF-03 SSH 与 Files 日常操作 | 打开 SSH→左侧 Files→跟随目录→编辑/上传/下载 | WF-02，已有 SFTP/编辑器 | 标签/pane 切换不串目录，冲突和传输关闭策略可验收 | A05、A06 |
| WF-04A/B/C 会话树、分屏、MultiExec | 树中整理/批量打开→2/4 分屏→选择实例→MultiExec | WF-01、WF-03 | 同主机多实例、混合 SSH/Local、部分失败和断线均明确 | A07–A10 |
| WF-05 常用协议与平台入口 | 同一入口打开 Local、WSL、Serial、Telnet、RDP、VNC | WF-01/02，现有 provider | 各平台真实连接矩阵有证据 | A11 |
| WF-06A/B/C 隧道、多跳、X11 | 管理隧道、经跳板连接并用 SFTP、打开远端 X11 GUI | WF-02/03；X11 spike 在 WF-01 期间提前 | 真实 forwarding/跳板链、取消清理、X11 显示验证 | A12、A13 |
| WF-07 工作区恢复 | 退出→重启→恢复标签/分屏/文件位置→按策略重连 | WF-04 目标状态模型 | 版本迁移、部分失败、缺配置和敏感数据边界 | A14 |
| WF-08 迁移、安装与完整 v1 | 老数据升级后正常；三平台安装、更新、语言和性能可验收 | 全部 v1 必选项 | 原需求逐项验证；发行物、第三方声明、更新渠道齐全 | A15 |

WF-01/02/03 完成 = "SSH 日常流程试用版"；WF-04 完成 = "多会话工作流试用版"。X11 可行性 spike 在 WF-01 期间提前做；品牌、许可证和测试随相关交付推进，不堆到最后。

## 从当前提交开始的前五个执行任务

1. **WF-00A**（本轮）：同步入口、冲突规范、任务和执行/检查引用；Task 04 写明 2c-2b 边界与剩余去向。无运行时改动。
2. **WF-00B 执行 2**：为当前关闭行为建立覆盖，落地 2c-2b 决策/action；不改顶部布局、协议和存储。
3. **WF-00B 执行 3**：关闭编排接入与生命周期验证；A01/A02 当前行为通过；结束"先拆完整个大文件"的前置依赖。
4. **WF-01**：在已对齐原型上接入菜单/工具栏、基本 i18n、实例投影与统一动作入口；同一 profile 两个终端可直接选择和关闭。
5. **WF-02A**：`ConnectionDialog` "保存并连接"；A03 通过；随后 WF-02B、WF-03。

不承诺固定人日；多平台真实验证、X11 可行性与群组迁移复杂度会影响工期，先以前五个任务验证交付速度。

## 原 Task 00–09 迁移

| 原任务 | 新归属 |
| --- | --- |
| 00 baseline | 同提交更新证据，不重做 |
| 01 security | 残余平台验证随相关包；发布前门禁 |
| 02 license | 持续任务；首次安装器前完整声明 |
| 03 frontend tests | 行政收尾；后续测试归各包 |
| 04 workspace seam | 2c-2b → WF-00B；实例标签 → WF-01；Files 边界 → WF-03；MultiExec 第三刀 → WF-04C |
| 05 restore | 契约随 WF-01；实现 → WF-07 |
| 06 MultiExec/network | MultiExec → WF-04C；网络 → WF-06；多跳单列 |
| 07 capability/RDP/VNC/X11 | 入口 → WF-05；X11 spike 提前，实现 → WF-06C |
| 08 i18n/brand/release | 新入口 i18n 自 WF-01；品牌/更新 → WF-08 前 |
| 09 perf/stability/E2E | 分配到各包；全量 → WF-08 |

## 执行规则

- 每个新任务写出一句用户流程、验收编号和引用的 WS 规则；纯重构任务注明它解锁哪条流程与终点。
- WF-04 前冻结 AI/Monitor/Docker 新功能、大主题改版、任意层数分屏及统一 RDP 内核；已有能力继续维护，阻断目标流程的缺陷正常修复。
- PR 尽量只跨一个行为边界；数据迁移与新 UI 可相邻交付，各自有可回退边界。
- 先写"复用什么、改变什么、如何验收"，再决定是否提取新模块；不平添第二套会话事实来源。
- 行为变更时同步替换旧位置/旧标识符的 source-check 断言；不让检查器把已批准的新入口自动修回旧位置。

## 回滚策略

- 状态切分：每个 seam / action 集保留小提交边界；发现行为差异先回退，不修改数据。
- SQLite：递增 schema version，迁移前备份，失败恢复 journal；禁止静默丢弃快照字段。
- 依赖：锁文件升级单独批次，保留审计 diff；无法修复的漏洞记录受控接受和隔离措施。
- Runner/平台：capability 显式禁用未支持路径，保留真实错误，不伪造成功。
- 品牌/更新：保留旧 identifier、存储目录和升级映射，先做迁移测试再改显示元数据。

## 质量门禁

每个包至少运行适用的 `pnpm run check`、`pnpm test`、`pnpm run build`、`node scripts/check-startup-module-boundary-source.mjs`、相关 `scripts/check-*.mjs`、Rust tests、license/security audit；协议/平台包追加真实服务/设备和 artifact 归档。所有阻塞项写入报告，不能用"未运行"标作通过。验收记录四维：实现状态、自动化证据、真实连接证据、平台与环境。

---

## 附录：2026-09-09 版阶段计划（历史参考）

> 已被上文交付包替代，保留以追溯 Task 00–09 的原始排序与依赖图。

- Phase 0 基线重现与工具链 → Phase 1 P0 安全、许可证和测试（H0.1/H0.2/H0.6/H0.7）→ Phase 2 WorkspaceShell 状态 seam（characterization → WorkspaceState → SessionTabs → Split/Sync → Command Sender → File/Tool controllers）→ Phase 3 Workspace Restore 与迁移 → Phase 4 协议与能力矩阵 → Phase 5 i18n、品牌、性能与稳定性 → Phase 6 发布与 v1 验收。
- 原依赖图：`P0-00 → P0-01/02/03/07`；`P0-03 → P0-04 → P0-05 → P1-06`；`P0-01/07 → P1-07`；`P0-02/07/04 → P1-08`；`P0-03/P1 → P1-09`。
- 原 Phase 2 退出门禁"无第二套 active/tab/split 事实来源；旧 source checks 和新状态测试都通过；启动 chunk 未变重"继续作为 WF-00B / WF-01 的工程门禁。
