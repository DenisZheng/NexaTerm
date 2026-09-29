# NexaTerm 当前路线图

> 更新：2026-09-29  
> 基线：GitHub `main` @ `141b3b34`  
> 本文件是当前项目级执行顺序的唯一入口。需求范围仍以 `NEXATERM_REQUIREMENTS.md` 为准；交互规则仍以 `docs/WORKFLOW_SPEC.md` 为准。旧阶段计划、差距分析和工作流交付计划保留用于追溯，不再覆盖本文件的当前优先级。

## 当前评审整改状态

| 项目 | 状态 | 边界 |
| --- | --- | --- |
| 发布签名 / 更新信任链 | 代码与 workflow 门禁已完成 | 真正的 Windows Authenticode、macOS Developer ID + notarization/staple、updater 签名仍需一次带真实凭据的 tagged release 留下发布实证 |
| X11 feasibility | 技术路径 GO | 已证明当前 russh 路径可继续推进；跨平台 X server 依赖、产品入口和真实 GUI 验收属于后续产品化，不等于已达到正式跨平台发布承诺 |
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
