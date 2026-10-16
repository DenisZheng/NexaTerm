# NexaTerm 当前路线图

> 更新：2026-10-16
> WF-04A 交付：PR #26（基于 GitHub `main` @ `a0fcc0d`）
> 本文件是当前项目级执行顺序的唯一入口。需求范围仍以 `NEXATERM_REQUIREMENTS.md` 为准；交互规则仍以 `docs/WORKFLOW_SPEC.md` 为准。旧阶段计划、差距分析和工作流交付计划保留用于追溯，不再覆盖本文件的当前优先级。

## 当前下一阶段：三协议功能实现（2026-10-16）

维护者明确要求先补实现计划，再开发。XDMCP 以随包 X server 和完整桌面会话管理为目标（Windows 优先，再适配 macOS/Linux）；Rlogin 为原生终端协议；Rsh 为原生命令执行和双流/信号管理。详细阶段、组件候选与许可、端口权限、生命周期及验收见 [三协议实现计划](docs/plans/WF09-PROTOCOL-IMPLEMENTATION-PLAN.md)。

顺序：`10-16-wf09-07-xdmcp-implementation` → `10-16-wf09-08a-rlogin-implementation` → `10-16-wf09-08b-rsh-implementation`，维护者已授权按计划开工：XDMCP 当前 **in_progress（X1 运行核心与 X0 组件审查）**，Rlogin 已开始 **in_progress（L0已过CI，L1 socket/控制组件已过三平台原生与完整应用CI，Windows精确flush与会话接入仍待开发）**，Rsh 仍 planning。X server 发行组件尚未采用，桌面互通尚未验证。旧 BLOCKED/DEFER 结论保留为历史证据，开发排期已更新为 PLANNED；具体环境/许可缺口只阻塞相应阶段。当前执行入口是本文及该计划，下方为此前交付记录。

## WF-09 开发交付（2026-10-16）

维护者已授权连续完成 WF-09，并将真实验收统一后置。01–06 功能及07/08评估已在 Draft PR #58–#64交付，各自最新 CI SUCCESS；09回环文件服务也已在 Draft PR #65 完成开发。代码提交的最终自动化结果与统一验收边界见下列交付清单。此前范围的交付证据见 [WF-09 交付清单](docs/WF09-DELIVERY.md)，涵盖九项范围、堆叠关系、失败修复及后续验收。

07/08完成的是批准范围内的评估，不是新增协议支持。所有 PR 保持 Draft，不合并发布；PR #12/#54不变。下方早期工作流和发布记录继续保留，不能用其验收状态替代 WF-09 的真实验收。

## 当前工作流进展（2026-10-04）

唯一产品主线继续使用 `09-23-nexaterm-workflow-mainline`。WF-02B / WF-03 与图标更新已在 main；WF-04A 由 [PR #26](https://github.com/DenisZheng/NexaTerm/pull/26) 交付，A07 macOS 的真实 GUI / 导入 / 重启、legacy 冲突映射和三主题均 PASS（[归档证据](.trellis/tasks/archive/2026-10/10-02-wf-04a-session-tree-consistency/validation/a07.md)），Windows/Linux 仍仅 CI 自动化证据。

WF-04B/04C/05/06/07 及 WF-08A–08E 已通过 integration PR #40 合入 `main`；当前 release-candidate 基线为 `main @ 4bd88f9060fe089ee6e52a042a5e589c1bb739bd`，main CI #383 SUCCESS。维护者在 Windows 真实 Tauri 已确认 A01/A02/A04/A11/A12/A13，通过项及平台边界见 [A01–A15 报告](.trellis/tasks/09-23-nexaterm-workflow-mainline/validation/acceptance-report-2026-10-04.md)；A08、A14 另有既有验收记录。WS-X09 / WS-X04 已在 WORKFLOW_SPEC v0.5 / v0.6 确认。

当前执行顺序（2026-10-04 维护者确认并行）：`10-04-wf04c-multiexec-entry` 已提交并进入 WF-08 堆叠；A09/A10 已于 2026-10-05 在最终 WF-08E 分支完成真实 Tauri 验收并 PASS，已不再是 A15 / v1 sign-off blocker。WF-08A 从“发布与迁移基线门禁”开始，证据见 `10-04-wf-08a-release-migration-baseline/A15_BASELINE.md`。 WF-08B 实现已完成并由 CI #343 验证三平台编译/测试，真实旧版本升级留到 WF-08E/A15；WF-08C 已完成代码收口并由 CI #357 验证品牌、English/zh-CN parity、canonical MCP sidecar 与三平台编译/测试。WF-08D 已完成测量工具并由 CI #364 验证三平台编译/测试、sampler 单测与性能/稳定性门禁；WF-08E 自动化证据框架已由 CI #369 验证，并通过 PR #40 合入 main。A09/A10 已于 2026-10-05 由维护者在真实 Tauri 验收中确认 PASS；main CI #383 的 final CI / Security / License 也已 PASS。A15 仍进行中，剩余三平台真实安装/签名/升级回滚、迁移、性能、updater 任一未通过都阻止最终签字。

## 2026-10-07 首版预发布安排

维护者确认先交付无平台证书的 Pre-release，A15 完整验收继续保持未完成。候选版本为 `0.1.17-rc.1`；工作流创建预发布草稿并排除 latest，保留 updater 签名、哈希和许可证门禁。普通正式 tag 仍要求 Windows/macOS 发布签名。公开草稿前完成 Windows/macOS 安装与基本功能验收；Linux 真实桌面、平台签名、公证、旧版迁移及升级回滚等缺口按 WF-08E 记录，不视为已通过。

本次 workflow/版本改动尚待提交和候选构建，不能把旧 main CI 或源码测试视为安装包验收。

## 当前评审整改状态

| 项目 | 状态 | 边界 |
| --- | --- | --- |
| 发布签名 / 更新信任链 | 代码与 workflow 门禁已完成 | 真正的 Windows Authenticode、macOS Developer ID + notarization/staple、updater 签名仍需一次带真实凭据的 tagged release 留下发布实证 |
| X11 feasibility / 产品化 | 技术路径 GO，Windows A13 通过 | WF-06C 核心与 Windows 真 GUI 已有维护者验收证据；macOS/Linux X server 环境与真实 GUI 仍需分别验收，不等于正式跨平台发布承诺 |
| MCP 暴露面 | 已收口 | Remote MCP 采用 loopback-only；远程访问走认证隧道，不支持直接 LAN/public HTTP 绑定 |
| 许可证 / third-party notices | 已收口 | 依赖清单、bundled notices 与 CI/release license gate 已进入 main |
| Linux IME 原生自动化验收（P2-3） | **暂缓** | draft PR #12 未合并。当前 IBus/Fcitx5 CI harness 未完成可靠验收；失败不能当作产品输入法必然故障，也不能当作已通过 |
| 文档 / 语言尾项（P2-4） | **进行中** | 统一当前路线图入口，标记历史计划，修正文档中过时的发布状态；不改产品运行时行为 |

## P2-3 处理原则

- PR #12 保持 draft、未合并，不作为 main 的完成证据。
- 不为了“让 CI 变绿”继续扩展不稳定的桌面输入法自动化。
- 后续若出现可复现的真实 Linux 输入法问题，再以具体发行版、桌面环境、WebKitGTK、IBus/Fcitx5 版本和复现步骤单独处理。
- 在没有真实验收前，状态固定写为“验收未完成”，而不是“已通过”或“已确认故障”。

## P2-4 完成后

1. 对最初评审报告逐条做一次最终对账，只接受可追溯到 main、CI、真实运行或明确暂缓项的结论。
2. 把“正式 Release 实证”单独作为发布操作任务：真实证书、真实 tag、三平台产物和 updater 验证必须留证据。
3. 把 X11 从 feasibility spike 转为独立产品化任务，不再与本轮评审整改混在一起。
4. 回到正常产品路线时，按 `docs/WORKFLOW_SPEC.md` 和 Trellis 当前任务推进，不重新开启已关闭的评审项。

## 文档优先级

发生冲突时按以下顺序判断：

1. `NEXATERM_REQUIREMENTS.md`：产品范围与 v1 要求。
2. `docs/WORKFLOW_SPEC.md`：已确认的交互规则。
3. **`ROADMAP.md`：当前执行顺序、评审整改状态和暂缓项。**
4. Trellis 当前任务 PRD / design / implement：具体任务边界。
5. `docs/CURRENT_STATE.md`、`docs/DEVELOPMENT_PLAN.md`、`docs/GAP_ANALYSIS.md`、`NEXATERM_WORKFLOW_DELIVERY_PLAN.md`：历史审计、计划和迁移依据；只有明确标注为当前事实的内容可以作为现状证据。

## 证据规则

- “代码存在”不等于“真实平台验收通过”。
- “CI check/test 通过”不等于“安装包、GUI、远程服务或硬件已验证”。
- “自动化 harness 失败”不自动等于“产品功能失败”；必须先证明失败发生在被测功能本身。
- 暂缓项必须保留原因和恢复条件，不能伪装成完成。
