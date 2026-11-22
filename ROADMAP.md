# NexaTerm 当前路线图

> 更新：2026-11-22
> 当前主线：GitHub `main @ 84f2118426e6b4c4fcd1218ac72b67590a65d787`
> 本文件是项目当前执行顺序的唯一入口。产品范围以 `NEXATERM_REQUIREMENTS.md` 为准，交互规则以 `docs/WORKFLOW_SPEC.md` v0.6 为准。历史审计快照不得覆盖本文件的当前状态。

## 1. 当前总体状态

- **A01–A14：已在各自记录的平台与环境范围内完成验收。** 这不等于所有功能均已在三平台做过同等真实验收；具体边界以各项验收证据为准。
- **A15：仍未签署，WF-08E 保持 in_progress。** 2026-11-21 主线整合审计仍记录 31 项 blocker（8 pending、22 blocked、1 review）。正式签名/公证、迁移、升级/回滚、三平台真实安装和性能证据仍未全部闭合。不能把 2026-10-11 的 `0.1.17-rc.1` 证据当作当前正式发布通过。
- 2026-11-21 的维护批次 PR #90 已合入（#54–#57）；2026-11-22 PR #91 已合入终端关闭失败重试修复。当前 main 已包含这两批变更。
- npm 依赖审计在 2026-11-21 仍有 5 项 High（均在开发依赖路径）；安全证据 job 的成功采集或 `REVIEW-REQUIRED` 不等于安全风险已通过。

## 2. 已交付的核心工作流

| 工作流 | 实际状态 | 证据 |
| --- | --- | --- |
| WF-00B 关闭/删除生命周期 | 已合并、人工验收通过 | PR #91，merge commit `84f2118`；CI run [44914220159](https://github.com/DenisZheng/NexaTerm/actions/runs/44914220159) 的 Frontend、Rust 三平台、Fixtures、Security、License 均通过；维护者确认桌面验收 OK |
| WF-01 统一会话入口 | 已合并 | PR #20 及后续入口/工作区体验收尾 PR #43 |
| WF-02A 保存并连接 | 已交付 | 以主线现有实现和对应 Trellis 任务为准 |
| WF-02B Quick Connect | 已合并，A04 已验收 | PR #24，merge commit `cf989bf`；B1/B2/B3 已完成。维护者于 2026-11-22 再次确认已在 PC 完成真实 GUI 验收并通过；原始验收日期未单独记录，见 [A04 记录](.trellis/tasks/10-01-wf-02b-quick-connect/validation/a04-real-tauri.md) |
| WF-03A 左侧 Files | 已合并 | PR #25，merge commit `92e2581` |
| WF-03B 实例隔离、目录跟随和请求保护 | 已实现、已验收，不得重做 | PR #25 中的实例请求所有权实现（commit `c7f6be9`）；A05 的 A/B 隔离、快速焦点切换、跟随、断线/重连真实桌面验收通过；实例跟随开关冷启动持久化由 PR #44 补齐 |
| WF-03C 编辑冲突/dirty close | 已验收 | A06 真实 Tauri 验收通过；缺少远端 `stat` 时的 SFTP 元数据回退和冲突保护有 35/35 Rust 定向测试 |
| WF-07 工作区恢复中的 Files 跟随状态 | 已合并、冷启动验收通过 | PR #44，merge commit `9f26add`；同一 profile 的 A=OFF/B=ON 在 Mac 完全退出后冷启动仍分别恢复；CI run [37460118773](https://github.com/DenisZheng/NexaTerm/actions/runs/37460118773) 七个实际执行 job 通过 |
| WF-04A–WF-08E 其余主线包 | 已通过 integration PR #40 合入 | PR #40，merge commit `4bd88f9`；A09/A10 有真实 Tauri PASS；A15 仍未完成 |
| WF-09-01 Files 双栏/传输队列 | 代码已实现，尚未真实验收或合并 | Draft PR #58；见下一节 |

**WF-03 的边界：** WF-03A、WF-03B、A05/A06 不再是待办。WF-03C 的传输队列、实例级传输归属和关闭策略后续由 WF-09-01 / PR #58 接续，不能把 PR #58 的真实 SFTP 验收提前记为通过。WORKFLOW_SPEC 的 WS-F03 只剩“手动浏览后自动暂停跟随并提供恢复入口”这一产品规则待确认；默认关闭和当前 keep-following 行为已明确，不影响 A05/WF-03B 已验收结论。

## 3. 当前下一项：WF-09-01 / PR #58

PR #58 `feat(WF-09-01): add dual-pane files and instance-owned transfers` 的代码和自动化已经完成，但不能直接合入：

- 分支：`feat/wf09-01-sftp-transfer`，HEAD `83db4bf60374803ce8cf40b66081cb1547c5dcbb`。
- 相对当前 main：ahead 5 / behind 15，已分叉；GitHub 当前显示 `mergeable=false`、`mergeable_state=dirty`。PR 的 base commit 仍是 `2d2fe23`，早于 2026-11-21 的维护批次。
- 原 HEAD 的 CI run [#582](https://github.com/DenisZheng/NexaTerm/actions/runs/38341958686) 七个实际执行 job 通过；Windows 打包 job 按 PR 策略 skipped。由于分支落后，这不能替代更新到当前 main 后的新 CI。
- 本地验证记录：84 files / 654 passed / 1 既有 todo；脚本 131 passed / 3 既有环境 skip / 0 failed。
- 真实桌面/SFTP 集中验收 W09-G01–G09 仍全部为 MANUAL_REQUIRED，覆盖本地文件浏览、双向拖放、冲突策略、A/B owner 隔离、暂停/恢复/取消、关闭 owner、断线重试和双语/主题。

执行顺序：

1. 从当前 main 更新 PR #58 分支，逐项解决与 PR #90/#91 及后续主线提交的冲突；不丢弃主线修复。
2. 审核更新后的完整 diff，重新运行前端、Rust 三平台、Fixtures、Security、License 和必要 source gates。
3. 使用更新后 HEAD 构建桌面应用，按 W09-G01–G09 完成真实 GUI/SFTP 验收并记录 commit、系统、目标环境和文件校验值。
4. 所有门禁和人工验收通过后，再将 Draft 转 Ready for review；不自动合并、不发布。

## 4. 其他仍在进行的分支工作

这些是独立开发栈，不是当前 Files 工作的直接替代，也不能把 stacked PR 当作可直接合入 main：

- **WF-09-04/05：** PR #61（宏录制）基于 WF-09-03 凭据库分支；PR #62（终端搜索/日志/关键词规则）再叠在 #61 之上。两者仍为 Draft。
- **WF-09-08A Rlogin：** PR #70（握手接线）与 PR #71（会话所有权）按 native socket → handshake → session 顺序堆叠，仍为 Draft。
- **WF-09-07 XDMCP：** PR #87–#89 是 Windows 构建/资源/依赖证据栈，仍为 Draft；原生构建证据中的工具版本漂移失败必须按真实原因解决，不能放宽 pin 或把实验性人工演示写成产品发布验收。
- **主线维护：** PR #90 已合并，不再作为待合并项；PR #92 是本次工作流状态对账文档 PR。

## 5. 明确不重开的事项与发布边界

- 不重新开发 WF-02B、WF-03B，也不重复 A04/A05/A06/WF-07 A/B 验收。
- 不因 Trellis 旧 checkbox 未更新而推翻已合并代码和可追溯的真实验收记录。
- 不把 WS-F03 的手动浏览暂停/恢复入口误当作整个目录跟随功能未完成；该行为必须先有产品确认。
- A15 未签署前不发布正式 v1，不把预发布候选、CI 通过或源码存在当作三平台安装/升级/回滚验收。
- `docs/CURRENT_STATE.md` 明确是 2026-09-29 历史审计快照，不是当前进度入口；当前事实以本文件、main 源码、最新 PR/CI 和对应验收记录为准。

## 6. 文档优先级

发生冲突时按以下顺序判断：

1. `NEXATERM_REQUIREMENTS.md`：产品范围。
2. `docs/WORKFLOW_SPEC.md`：已确认交互规则与待确认规则。
3. **`ROADMAP.md`：当前进度、下一项和暂缓项。**
4. Trellis 子任务 PRD/design/implement 与 validation：具体任务及证据。
5. `docs/CURRENT_STATE.md`、旧开发计划和历史审计：只用于追溯，不覆盖当前状态。

## 7. 证据规则

- “代码存在”不等于“真实平台验收通过”。
- “CI check/test 通过”不等于“真实 GUI、SFTP、安装包或升级回滚已验收”。
- stacked branch 必须按依赖顺序审查；分支落后、冲突或基于旧 main 的 CI 不得当作当前可合并。
- 暂缓项必须保留原因和恢复条件，不得伪装成完成。
