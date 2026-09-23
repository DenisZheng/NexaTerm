# NexaTerm 工作流主线（WF-00 至 WF-08）

> 父任务。持有交付包地图、Task 00–09 的迁移去向、验收清单 A01–A15 和跨包执行规则；本身不承载实现，实现在子任务中进行。
> 依据：维护者 2026-09-23 授权；`NEXATERM_WORKFLOW_DELIVERY_PLAN.md`（排序与验收）；`NEXATERM_REQUIREMENTS.md`（产品范围）；`docs/WORKFLOW_SPEC.md`（交互规则正文，按 WS-xx 引用）。

## Goal

把开发主线从"审计 / 加固 / 重构分阶段"切换为"以用户能演示的操作流程为单位交付"：用户沿熟悉入口创建会话、打开终端、管理文件、分屏、批量输入、使用 WSL/X11，并恢复工作区。每个交付包以一段可演示流程结束；安全、测试、架构整理是该流程的交付条件，不是独立阶段。

已有加固成果继续使用：协议、凭据、Host Key、PPK、Split、Vitest 门禁不重做。全面拆完 `WorkspaceShell` 不再是进入产品改造的前置条件。

## 交付包地图

| 包 | 用户能演示的结果 | 依赖 | 进入下一包条件 | 子任务 |
| --- | --- | --- | --- | --- |
| WF-00A 规范切换与上下文校准 | 入口、规范、任务与检查依据一致 | 当前 main `45418f3` | 三个基准问题（Files 在哪、标签代表什么、MultiExec 选什么）在规范与任务中答案一致 | `09-23-wf-00a-spec-context-switch` |
| WF-00B 关闭/删除生命周期收尾 | 原有打开、切换、关闭行为稳定 | WF-00A | 关闭/删除 action 迁移完成，A01 有证据；Task 04 剩余范围正式迁出 | `09-23-wf-00b-close-lifecycle` |
| WF-01 主窗口与统一会话入口 | 统一菜单/工具栏找到新建、Files、Split、MultiExec；同一主机两次打开可直接定位 | WF-00 | 原型通过现有设计流程；标签、焦点、关闭与 lazy loading 不回归；A02 | `09-23-wf-01-unified-session-entry` |
| WF-02A 保存并连接 / WF-02B Quick Connect | 新建→保存并连接；首页输入地址→临时连接→可保存 | WF-01 实例与入口约定 | 认证、取消、失败重试和临时文件上下文走通；A03 / A04 | 待创建 |
| WF-03 SSH 与 Files 日常操作 | 打开 SSH→左侧 Files→跟随目录→编辑/上传/下载 | WF-02，已有 SFTP/编辑器 | 标签/pane 切换不串目录，冲突和传输关闭策略可验收；A05 / A06 | 待创建 |
| WF-04A 会话树数据一致性 / 04B 批量打开与分屏 / 04C 统一 MultiExec | 树中整理/批量打开→2/4 分屏→选择实例→MultiExec | WF-01、WF-03 | 同主机多实例、混合 SSH/Local、部分失败和断线均明确；A07–A10 | 待创建 |
| WF-05 常用协议与平台入口 | 同一入口打开 Local、WSL、Serial、Telnet、RDP、VNC | WF-01/02，现有 provider | 各平台真实连接矩阵有证据；A11 | 待创建 |
| WF-06A 隧道 / 06B Proxy-Jump 多跳 / 06C X11 | 管理隧道、经跳板连接并用 SFTP、打开远端 X11 GUI | WF-02/03；X11 spike 在 WF-01 期间提前 | 真实 forwarding/跳板链、取消清理、X11 显示验证；A12 / A13 | 待创建（X11 spike 可独立） |
| WF-07 工作区恢复 | 退出→重启→恢复标签/分屏/文件位置→按策略重连 | WF-04 目标状态模型 | 版本迁移、部分失败、缺配置和敏感数据边界；A14 | 待创建 |
| WF-08 迁移、安装与完整 v1 | 老数据升级后正常；三平台安装、更新、语言和性能可验收 | 全部 v1 必选项 | 原需求逐项验证；发行物、第三方声明、更新渠道齐全；A15 | 待创建 |

WF-01/02/03 完成后的产物定义为"SSH 日常流程试用版"，WF-04 完成后为"多会话工作流试用版"。试用版不是对 v1 范围的削减；未满足原 v1 验收时不称完整 v1。

## Task 00–09 迁移去向

| 原任务 | 保留的成果 | 新归属 |
| --- | --- | --- |
| 00 baseline/toolchain/evidence | 工具链、基线与 CI 证据 | 同提交更新证据即可，不重做 |
| 01 security/dependency | 已归档加固、CSP/capabilities 检查、受控接受 | 残余真实窗口/平台验证跟随相关包；发布前检查门禁 |
| 02 license（`09-18-license-inventory-and-notices`，未提交 WIP） | inventory 脚本与 THIRD_PARTY_LICENSES | 持续任务；新增分发依赖先评估，首次安装器前交付完整声明 |
| 03 frontend tests（`09-19-frontend-test-baseline`，in_progress） | Vitest 门禁已在 CI | 行政收尾；后续测试归各流程包，不要求先为全应用补齐 |
| 04 workspace seam（`09-19-workspace-shell-state-seam`，in_progress） | Split reducer/controller、sessionTabs types/selectors/controller、指针 reducer、激活/记忆 action | 2c-2b → WF-00B；WorkbenchTab 联合/ordinal 映射 → WF-01；split anchor 改 owner id → WF-04B；MultiExec 第三刀 → WF-04C；"全部集合合并"只在流程需要时继续 |
| 05 restore/schema | 设计研究与迁移方向 | 快照契约随 WF-01，实现 → WF-07；不先固化旧标签结构 |
| 06 MultiExec/network | 命令发送、单跳、代理实现 | MultiExec → WF-04C；网络 → WF-06；多跳单列（修正原任务遗漏） |
| 07 capability/RDP/VNC/X11 | provider、runner 研究 | capability 与入口 → WF-05；X11 spike 提前，实现 → WF-06C |
| 08 i18n/brand/release | 品牌迁移原则 | 新入口 i18n 自 WF-01 起；品牌/更新 → WF-08 前完成 |
| 09 performance/stability/E2E | 场景与阈值 | 行为/集成验证分配到各包；全量性能、长稳与安装升级 → WF-08 |

旧任务目录、研究、journal 保留不删；被替代内容在各自文件顶部标注迁移说明，不进入新任务的默认必读包。

## 验收清单（A01–A15）

正文见 `NEXATERM_WORKFLOW_DELIVERY_PLAN.md` §6；规则对应见 `docs/WORKFLOW_SPEC.md` §12。每条验收记录：实现状态、自动化证据、真实连接证据、平台与环境。

## 跨包执行规则

- 每个子任务 PRD 必须写出一句用户流程、对应验收编号（A01–A15）和引用的 WS 规则编号；纯重构任务注明它解锁哪条流程及明确终点。
- 不以 `WorkspaceShell` 行数、组件数量、source-check 数量作为主里程碑。
- WF-04 前冻结 AI/Monitor/Docker 新功能、大主题改版、任意层数分屏及统一 RDP 内核；已有能力继续维护，阻断目标流程的缺陷正常修复。
- 每个包保留安全、许可、数据迁移和平台门禁；已完成的加固证据复用。
- PR 尽量只跨一个行为边界：实例视图、关闭动作、临时连接上下文、Files 布局、群组迁移、MultiExec 路由分别提交。
- 先写"现有模块复用什么、这个包改变什么、如何验收"，再决定是否提取新模块；遵守 `state-management.md` 的 reducer/controller 约束，不平添第二套会话事实来源。
- 行为改变时同步替换旧位置/旧标识符的 source-check 断言；检查器不得把已批准的新入口自动修回旧位置。

## Acceptance Criteria（父任务收尾条件）

- [ ] 每个 WF 包都有子任务并各自归档，或明确记录为范围外。
- [ ] Task 00–09 的已完成部分与迁移部分都有可追踪去向。
- [ ] A01–A15 逐条有四维记录；无法满足的项明确标记缺口，范围变更由产品层明确决定。

## Out of Scope

- 父任务本身不改运行时代码。
- 不批量删除或重写历史任务、研究与 journal。
