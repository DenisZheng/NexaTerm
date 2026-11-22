# NexaTerm 当前路线图

> 更新：2026-11-22
> 当前主线：GitHub `main @ b4f3f770cb8cddb37b5c9449b24c596a7b43cc64`
> 本文件是项目当前执行顺序的唯一入口。产品范围以 `NEXATERM_REQUIREMENTS.md` 为准，交互规则以 `docs/WORKFLOW_SPEC.md` v0.6 为准。历史审计快照不得覆盖本文件的当前状态。

## 1. 当前总体状态

- **A01–A14：已在各自记录的平台与环境范围内完成验收。** 这不等于所有功能均已在三平台做过同等真实验收；具体边界以各项验收证据为准。
- **A15：仍未签署，WF-08E 保持 in_progress。** 2026-11-21 主线整合审计仍记录 31 项 blocker（8 pending、22 blocked、1 review）。正式签名/公证、迁移、升级/回滚、三平台真实安装和性能证据仍未全部闭合。不能把 2026-10-11 的 `0.1.17-rc.1` 证据当作当前正式发布通过。
- 2026-11-21 的维护批次 PR #90 已合入（#54–#57）；2026-11-22 PR #91 已合入终端关闭失败重试修复。
- 2026-11-22 PR #58 已合并，双栏 Files、本地/远程双向拖放、传输队列暂停/恢复及 SSH 实例级传输归属已进入 main；W09-G01–G09 经维护者真机验收确认通过。
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
| WF-09-01 Files 双栏/传输队列 | 已合并、真机验收通过 | PR #58，merge commit `b4f3f770`；CI run [45000591856](https://github.com/DenisZheng/NexaTerm/actions/runs/45000591856) 七个实际执行 job 全部 PASS，Windows build-only 按策略 skipped；W09-G01–G09 维护者确认 PASS |

**WF-03 的边界：** WF-03A、WF-03B、A05/A06 不再是待办。WF-03C 的传输队列、实例级传输归属和关闭策略已由 WF-09-01 / PR #58 完成并合入；不要重新开发。WORKFLOW_SPEC 的 WS-F03 只剩“手动浏览后自动暂停跟随并提供恢复入口”这一产品规则待确认；默认关闭和当前 keep-following 行为已明确，不影响 A05/WF-03B 已验收结论。

## 3. 当前下一项：WF-09-02 / PR #59

PR #59 `feat(WF-09-02): add safe Save As and protect editor I/O` 是当前下一项，包含远程编辑器保存生命周期修复（A）和安全另存为（B）。

- 分支：`feat/wf09-02-remote-editor`，同步 HEAD `f38069a6089eeb18a45aad2bed65b1faa11d29cd`。
- PR base 已调整为 `main`；相对 main ahead 3 / behind 0，GitHub mergeable=true。
- 主线同步提交：`f38069a6`，双父提交保留原实现与最新 main；WorkspaceShell 13,793 / 13,860 行，冻结预算通过。
- 原切片本地验证：Vitest 88 files / 689 passed / 1 既有 todo；script tests 154 passed / 3 既有环境 skip。原提交 CI run [38357341829](https://github.com/DenisZheng/NexaTerm/actions/runs/38357341829) 通过，但不替代同步后 CI。
- 同步后 CI run [45003292527](https://github.com/DenisZheng/NexaTerm/actions/runs/45003292527) 正在运行；Frontend、Rust 三平台、Fixtures、Security、License 全部以新 HEAD 的最终结果为准。
- 真实 GUI/SFTP 验收仍待维护者执行；A/B 两份集中验收清单在 `.trellis/tasks/10-13-wf09-02-editor-save-lifecycle/validation/` 与 `.trellis/tasks/10-13-wf09-02-editor-save-as/validation/`。
- Save As 通过远端 create-only link 发布；目标端不支持时安全失败，不回退为可能覆盖既有文件的普通 rename。

执行顺序：

1. 等待同步后 CI run #45003292527 完成；失败则按实际 job 和日志修复，不删除测试。
2. 审核主线同步后的完整 diff，重点检查 WorkspaceShell 的 editor 状态迁移、异步保存 dirty 保护、Save As 的远端原子 create-only 发布及失败恢复。
3. CI 通过后，使用新 HEAD 构建桌面应用，按 A/B 集中验收清单完成真实 GUI/SFTP 测试。
4. 验收通过后更新证据、将 Draft 转 Ready for review，再合并；不自动发布。

## 4. 其他仍在进行的分支工作

这些是独立开发栈，不是当前 Files 工作的直接替代，也不能把 stacked PR 当作可直接合入 main：

- **WF-09-03–05：** PR #60（凭据库）、PR #61（宏录制）、PR #62（终端增强）仍为 Draft，按各自依赖关系堆叠；不抢在 #59 之前合入。
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
