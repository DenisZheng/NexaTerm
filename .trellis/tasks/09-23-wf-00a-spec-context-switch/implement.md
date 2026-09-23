# WF-00A 执行清单

## 顺序

1. [x] 核实状态：HEAD、未提交改动、活动任务、`WorkspaceShell.tsx` 行数、Vitest 基线、上下文加载路径（见 prd.md Confirmed Facts）。
2. [x] 建 Trellis 任务：父任务 `09-23-nexaterm-workflow-mainline`；子任务 WF-00A / WF-00B / WF-01；`task.py start` 本任务。
3. [x] 写 `docs/WORKFLOW_SPEC.md`（v0.1）。
4. [x] 入口：`AGENTS.md` 加"产品方向与规范入口"段并改原型条目与"右侧面板"风格条目；`CLAUDE.md` 改 `@AGENTS.md`。
5. [x] 原型说明：`prototype/light-neutral/mxterm-light-neutral-design.md` 顶部加适用范围表（12 条逐条处置），原文保留。
6. [x] 规范：`.trellis/spec/frontend/index.md` 重写（增 Pre-Development Checklist / Quality Check、WORKFLOW_SPEC 行）；`component-guidelines.md` 加 Scope note + 4 条 `[Current implementation — WS-xx replaces at WF-yy]` 标注（locate 手动、右侧 bulk selection、Command Sender 子标签入口、tab 拖拽排序）；`tauri-command-contracts.md` 加顶部 Scope note + 8 条标注（file context、手动定位、RemoteFileTool、命令库归右侧、目标列表、tools/schedule/ai 位置）。
7. [x] Task 04：`prd.md` 加范围修订段、验收注记、Out of Scope 限定；`design.md` 顶部注记 + §4 标迁移；`implement.md` 2c-2a 记录 CI `35600276051`（GitHub API 复核）、2c-2b/第三刀逐条标去向、§4 文档项按实际勾选、新增 §6 迁移表；`implement.jsonl` / `check.jsonl` 对齐（各 5 条）；`docs/tasks/04-*.md` 顶部迁移说明。
8. [x] docs：`DEVELOPMENT_PLAN.md` 重组为 WF（旧阶段入附录）；`CURRENT_STATE.md` 加 §0 校准段并更新 Split / Sync / Command Sender / Frontend tests / 三平台行；`ARCHITECTURE.md` 加阅读说明、§2 行数更新、§4 所有权表重写、§5 标 WF、新增 §5a 选定方向 / §5b 待实现项；`GAP_ANALYSIS.md`、`docs/tasks/05,06` 顶部迁移说明；`NEXATERM_REQUIREMENTS.md` 新增 §68 工作流映射。
9. [x] `.trellis/workflow.md` Guardrails 加一条项目规则（注意：该文件为 Trellis 模板管理，`trellis update` 可能覆盖，届时需重加）。
10. [x] WF-00B / WF-01 PRD；本任务 `implement.jsonl`（6 条）/ `check.jsonl`（4 条）。
11. [x] 验证：`task.py validate` 五个任务全过；`list-context` Task 04 / WF-00A 两端引用同版规范；`current --source` = WF-00A；无 CR / BOM；`git status --short` 只含预期文件 + 本轮前已存在的未提交项；旧规则关键词 grep 只命中原型原文（已由顶部表标注）与各处注记。
12. [x] `add_session.py --no-commit` 记录 journal（`.trellis/workspace/codex/journal-1.md` session 3）。

## 验证命令

```powershell
python ./.trellis/scripts/task.py current --source
python ./.trellis/scripts/task.py validate .trellis/tasks/09-23-wf-00a-spec-context-switch
python ./.trellis/scripts/task.py validate .trellis/tasks/09-19-workspace-shell-state-seam
python ./.trellis/scripts/task.py list-context .trellis/tasks/09-19-workspace-shell-state-seam
git status --short
git diff --stat
```

无运行时代码改动，不运行 build / startup boundary（无意义）；Vitest 已在核实阶段复跑作为基线记录。

## 回滚点

全部为文档与任务工件；`git checkout -- <file>` / 删除新建目录即可回滚。不触碰 `.trellis/.runtime`。

## 结果记录

### 2026-09-23

- 修改 20 个已跟踪文件（`git diff --stat`：+348 / −135），新增 `docs/WORKFLOW_SPEC.md` 与 4 个任务目录（父任务 + WF-00A/00B/01）。未触碰 `src/`、`src-tauri/`、`scripts/`、`.trellis/.runtime`、本轮前已存在的未提交项。
- 事实修正：`WorkspaceShell.tsx` 按 `git show <sha>:… | Measure-Object -Line` 为 13,076（HEAD）/ 13,132（347c8b2），交付方案的 14,003 与 Task 04 implement.md 的 14,0xx 系另一计数方法；已在 CURRENT_STATE / ARCHITECTURE / Task 04 PRD 注明并统一方法。CI `35600276051` 经 GitHub API 复核为 success（Windows 打包 job skipped）。Vitest 177/1 todo 复跑一致。
- 待确认事项集中在 `docs/WORKFLOW_SPEC.md` §10（11 项），未擅自裁决。
- 三个基准问题在 WORKFLOW_SPEC §9、AGENTS 首段、WF-01 PRD、Task 04 PRD 修订段答案一致。
- 未做：真实 GUI 冒烟（本任务无运行时改动，不适用）；Task 04 2c-2a 的 GUI 冒烟仍未做（已在其 implement.md 标明）。
- 风险：`.trellis/workflow.md` 的 Guardrails 新增行位于 Trellis 模板管理区域，`trellis update` 后需核对是否被覆盖；核心路由已同时写入 AGENTS.md 与 spec index，不依赖该行单独生效。
