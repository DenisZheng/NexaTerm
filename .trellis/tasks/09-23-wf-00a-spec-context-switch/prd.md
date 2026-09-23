# WF-00A 规范切换与上下文校准

> 父任务：`09-23-nexaterm-workflow-mainline`。来源：维护者 2026-09-23 授权；`NEXATERM_WORKFLOW_DELIVERY_PLAN.md` §2、§7 执行 1；`NEXATERM_REQUIREMENTS.md`。
> 用户流程：无直接用户可见流程。本任务解锁 WF-00B / WF-01：让后续任务从新会话加载后能说出当前产品目标、任务边界和验收依据。
> 验收编号：无（前置任务）。引用规则：`docs/WORKFLOW_SPEC.md` 全文，尤其 §9 三个基准问题与 §11 替代表。

## Goal

在不改运行时代码的前提下，把入口说明、产品交互规范、Trellis 规范索引、当前任务范围和执行/检查依据切换到"兼容 MobaXterm 操作流程"的目标，并保留历史材料与已完成成果。

## Confirmed Facts（2026-09-23 本机核对）

- HEAD `45418f37`（2026-09-21），与交付方案基线一致；远端未在本轮复查。
- 未提交改动（本任务之前已存在，不属本任务，保持不动）：`.trellis/tasks/09-18-license-inventory-and-notices/`、`.trellis/tasks/09-20-ssh-private-key-file-picker/`、`NEXATERM_WORKFLOW_DELIVERY_PLAN.md`、`THIRD_PARTY_LICENSES.md`、`scripts/license-*.{mjs,json}`、`scripts/invoke-pnpm-licenses.ps1`。
- `task.py current --source` 在本会话开始时为 none；活动任务：`00-bootstrap-guidelines`（in_progress）、`09-09-nexaterm-architecture-audit-plan`（planning，3/5）、`09-19-frontend-test-baseline`（in_progress）、`09-19-workspace-shell-state-seam`（in_progress）、`09-20-ssh-private-key-file-picker`（planning，PRD 为模板）。
- `src/features/layout/WorkspaceShell.tsx` 按 `git show HEAD:… | Measure-Object -Line` 为 **13,076 行**（347c8b2 / 52dff09 为 13,132）。交付方案写 14,003、Task 04 implement.md 写 14,061，与本方法计数不一致；以后统一用本方法记录。
- Vitest：12 文件、177 passed / 1 todo（本机 2026-09-23 复跑）。
- 上下文加载路径：Claude Code 走 `.claude/settings.local.json`（无 Trellis hook），Codex 走 `.codex/hooks.json` → `inject-workflow-state.py` 读 `workflow.md` 的 `[workflow-state:*]` 块，默认 `inline`；inline 模式实现读 `prd.md` → `design.md` → `implement.md`，规范经 `trellis-before-dev` 读 `.trellis/spec/<layer>/index.md` 的 Pre-Development Checklist。**`.trellis/spec/frontend/index.md` 原本没有 Pre-Development Checklist 段**，before-dev 的步骤 4 落空。
- 文件名大小写：git 跟踪 `AGENTS.md`，`CLAUDE.md` 引用 `@AGENTS.MD`，在大小写敏感文件系统上失效。
- 旧规则冲突点：`prototype/light-neutral/mxterm-light-neutral-design.md`「必须保持」（顶部只放 SSH、左侧固定连接仓库、文件在右侧）；`component-guidelines.md`（Command Sender 子标签工具栏入口、定位只能手动、右侧面板交互模型）；`tauri-command-contracts.md`（右侧一级工具 id、命令库归右侧、文件面板不得自动跟随目录）；Task 04 PRD「不改任何 UI」。

## Requirements

1. 新建 `docs/WORKFLOW_SPEC.md`：规则带编号、状态（已确认 / 默认值 / 待确认）、阶段；集中回答三个基准问题；列出旧规则替代表；未明确的产品细节标为待确认，不写成已批准。
2. `AGENTS.md`：写明当前产品目标与规范入口；把"复用原型母版/组件/token"与"保留旧布局"区分开；旧布局不得写成永久约束；保留权限、设计确认、测试、凭据、许可、性能规则。
3. `CLAUDE.md`：引用改为 `@AGENTS.md`。
4. 原型设计说明：顶部加适用范围表，逐条标注保留 / 已替代 / 待原型确认；原文保留。
5. `.trellis/spec/frontend/index.md`：补 Pre-Development Checklist 与 Quality Check；UI/工作区任务必读 WORKFLOW_SPEC；纯后端/依赖任务不加载。
6. `component-guidelines.md`、`tauri-command-contracts.md`：保留工程规则；把混入的入口/位置约束标注为"当前实现说明，WF-xx 按 WS-xx 替换"；不删原文。
7. Task 04 PRD/design/implement 与 `docs/tasks/04-*.md`：保留"不改 UI"作为该任务约束；记录已完成切片与剩余工作去向；未完成项不打勾；`implement.jsonl` / `check.jsonl` 引用同一版规范。
8. `docs/DEVELOPMENT_PLAN.md` 改为 WF 包组织（旧阶段降为历史参考）；`CURRENT_STATE.md` 标当前提交与实际 UI 行为；`ARCHITECTURE.md` 区分现有结构 / 选定方向 / 待实现；`GAP_ANALYSIS.md`、`docs/tasks/05,06` 加迁移说明；`NEXATERM_REQUIREMENTS.md` 补工作流映射。
9. `.trellis/workflow.md` 只加最小路由规则（Guardrails 一条），不塞产品规格。
10. 新建父任务与 WF-00B、WF-01 子任务（planning），WF-00B/WF-01 PRD 写明继承范围与验收编号；WF-04 及以后只在父任务地图中登记。
11. 不改 `src/`、`src-tauri/`、`scripts/check-*.mjs`；不提交、不推送、不覆盖已有未提交工作；不手改 `.trellis/.runtime`。

## Acceptance Criteria

- [ ] 仓库内不再同时存在"左侧固定连接 / 右侧固定文件"与"左侧 Sessions/Files"两条互相覆盖的现行约束：旧表述均带范围与替代关系标注。
- [ ] 对"Files 在哪里 / 标签代表配置还是实例 / MultiExec 选择什么"，`WORKFLOW_SPEC.md` §9、WF-01 PRD、Task 04 PRD 修订段答案一致。
- [ ] `trellis-before-dev` 路径可达：`.trellis/spec/frontend/index.md` 有 Pre-Development Checklist，且 UI/工作区条目指向 WORKFLOW_SPEC；Task 04 与 WF-00A 的 `implement.jsonl` / `check.jsonl` 通过 `task.py validate`，两端引用同版规范。
- [ ] Task 04 剩余工作逐项写明去向（WF-00B / WF-01 / WF-04B / WF-04C），未完成项保持未勾选。
- [ ] `AGENTS.md`、`CLAUDE.md` 入口正确；凭据、Host Key、许可证、迁移回滚、资源清理、主题、lazy-loading 规则仍有来源。
- [ ] `task.py current --source` 指向本任务；`task.py list` 显示父任务与三个子任务。
- [ ] journal 记录本次切换结论。

## Out of Scope

- 运行时代码、UI 改造、source-check 脚本修改（随 WF-00B / WF-01 的行为变更同步）。
- 修改 Trellis 脚本、hook 或全局安装目录。
- 删除或重写归档任务、研究与 journal。
- 决定 §10 待确认事项。
