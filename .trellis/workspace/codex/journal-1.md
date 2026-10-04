# Journal - codex (Part 1)

> AI development session journal
> Started: 2026-06-06

---


## Session 1: 完成 NexaTerm 架构审计与 Task 00 基线

**Date**: 2026-09-10
**Task**: 完成 NexaTerm 架构审计与 Task 00 基线
**Branch**: `main`

### Summary

完成需求、架构、差距、开发、测试、安全和许可证规划；安装 D 盘 Rust 工具链，记录 708 个锁定 crate、10 个 RustSec advisory，以及 Windows MSVC C++ 工具链不完整（缺 CRT 头文件/库与 Windows SDK）导致的 Rust 编译阻塞；未修改产品功能。

### Main Changes

- 新增 `docs/` 七份规划文档：`CURRENT_STATE.md`、`GAP_ANALYSIS.md`、`ARCHITECTURE.md`、`DEVELOPMENT_PLAN.md`、`TEST_STRATEGY.md`、`SECURITY_REVIEW.md`、`LICENSE_AUDIT.md`。
- 新增 `docs/tasks/` 十个可执行任务文件（00 基线工具链 → 09 性能稳定性与发布门禁）。
- 建立 Trellis 父任务 `09-09-nexaterm-architecture-audit-plan` 与子任务 `09-09-nexaterm-baseline-toolchain-evidence`、`09-10-security-and-dependency-hardening`。
- 未修改产品源码、依赖声明、lockfile、数据库或运行时配置。

### Git Commits

| Hash | Message |
|------|---------|
| `f94d643` | 补充 NexaTerm 需求架构审计与工具链基线 |

### Testing

- [OK] `pnpm run check` 通过
- [OK] `pnpm run build` 通过（授权环境；Vite 报告若干 >500 kB chunk，非阻断）
- [OK] `node --test scripts/*.test.mjs` 37/37 通过；逐文件运行 7/7 测试文件通过
- [OK] `node scripts/check-startup-module-boundary-source.mjs` 通过
- [OK] `cargo metadata --locked --offline` 通过（708 个锁定 crate，1 个未声明许可证）
- [FAIL] `pnpm audit`（官方 registry）：0 critical / 5 high / 16 moderate / 5 low，共 191 dependencies
- [FAIL] `cargo-deny check advisories` 失败但已取得证据：10 个 RustSec advisory
- [BLOCKED] `cargo check` / `cargo test`：MSVC `link.exe` 不在 PATH；后续复核确认真因为 MSVC C++ 工作负载半装（缺 `include\`、`lib\x64`）且 Windows SDK 未安装
- [BLOCKED] `cargo audit`：工具未安装，由 cargo-deny advisories 提供临时 RustSec 证据
- [FAIL] 全部 `scripts/check-*.mjs`：50/60 通过，10 个失败（Rust 工具链阻塞 2 个、输出路径漂移 1 个、待修契约/样式基线若干）

### Status

[OK] **Completed**

### Next Steps

- Task 01（安全与依赖硬化）启动前需补齐 Rust 工具链：用 VS Installer 补装「MSVC v143 生成工具」+「Windows 11 SDK」，目标盘选 E: 或 D:（C 盘可用空间不足）。
- `cargo-deny` 的 license/source 门禁需先由独立任务配置 `deny.toml` 再启用，当前无配置时默认拒绝许可证，不代表项目违规。


## Session 2: Task 01 Phase 1 审计 + Phase 2 Batch A/D 硬化

**Date**: 2026-09-11
**Task**: Task 01 Phase 1 审计 + Phase 2 Batch A/D 硬化
**Branch**: `main`

### Summary

完成 Phase 1 审计/威胁模型落档；执行并验证 Phase 2 Batch A（npm override，high 5→0）+ Batch D（移除 package-lock）；Batch B/C/E 与 Phase 3-5 记 ENVIRONMENT-BLOCKED/延后。

### Main Changes

本会话完成 Task 01 的 Phase 1（审计与威胁模型）落档，以及 Phase 2 中 Windows 可验证批次（Batch A/D）的执行与验证。证据主档为 `docs/SECURITY_REVIEW.md`，执行进度见 `.trellis/tasks/09-10-.../implement.md`。

**Phase 1（审计与威胁模型）**

- npm：26 条 advisory（5 high / 16 moderate / 5 low，191 依赖）逐条归类。关键修正——5 个 high 全为 dev-only 构建链依赖、不进发布产物；唯一进生产包（`dev:false`）的是 dompurify（经 monaco-editor 传递）。
- Rust：cargo-deny 10 advisory + 3 yanked 逐条核对。可干净修 h2（RUSTSEC-2026-0258）+ 3 个 yanked；rsa 无修复版（绑 russh P0，列风险接受）；quick-xml / unic-* / proc-macro-error 属 tauri 生态自有。
- 已成表：威胁模型、capability 使用矩阵（vnc-runner-host 实际只需 5 项 window 权限）、CSP 资源盘点、风险接受登记。
- `cargo audit` 未安装 → ENVIRONMENT-BLOCKED，暂由 cargo-deny advisories 提供 RustSec 证据（二者不等价）。

**Phase 2 · Batch A（npm override 升级，已验证）**

- 发现并修正 pnpm 11 配置位置：overrides 从 `package.json` 的 `pnpm` 字段（pnpm 11 已废弃、install 时报 WARN 并忽略）改到 `pnpm-workspace.yaml` 顶层（官方文档 https://pnpm.io/settings/dependency-resolution ）。
- override 5 包至修复版：dompurify 3.2.7→3.4.15 / nanoid 3.3.12→3.3.18 / postcss 8.5.15→8.5.28 / browserslist 4.28.2→4.28.9 / baseline-browser-mapping 2.10.33→2.11.21。
- 验证链：`pnpm install`（Packages +9 -9）→ `pnpm run check` exit 0 → `pnpm run build` exit 0（3.7MB RemoteFileEditor/Monaco chunk 正常产出，dompurify 顶版不破坏构建）→ `pnpm audit`：high 5→0、moderate 16→0、critical 0。
- 残留仅 1 条 dev-only esbuild low：有意推迟（esbuild 与 vite API 强耦合，强升有破坏 build 风险，且 low + 仅构建期）。

**Phase 2 · Batch D（移除冗余 package-lock.json，已完成）**

- 全库核对无脚本/CI 依赖（CI 用 `pnpm install --frozen-lockfile`）；`remoteFileIcons.ts` 同名条目仅是远程文件浏览器的通用文件图标映射，与本仓库 lockfile 无关。
- Task 02 交接：`LICENSE_AUDIT.md` 原以 package-lock 为 npm 许可证清单基数，Task 02 的 npm 许可证来源改走 `pnpm licenses list` / pnpm-lock.yaml（与 LICENSE_AUDIT §25 建议一致）。

**延后（ENVIRONMENT-BLOCKED / 后续阶段，待 Mac + 完整工具链）**

- Batch B：`cargo update -p h2 -p chacha20 -p crypto-bigint -p der` + `cargo check` / `cargo test` 验证。
- Batch C：capability 按窗口拆分（main 全权限 + vnc-runner-host 5 项 window 权限），需 `tauri dev` 验证 runner 窗口不回归。
- Batch E：`scripts/check-*.mjs` 静态断言，随 Batch C / Phase 5 一并做（避免提交即失败的 check）。
- Phase 3（MCP 默认 loopback + AppError 四步收敛）、Phase 4（输入边界 + 生命周期清理）、Phase 5（CSP 收紧 + 发布门禁；updater endpoint 仍指向上游，须改为自有签名源）。

**本会话 Git 状态（未提交，待人工审核）**：`M pnpm-workspace.yaml` / `M pnpm-lock.yaml` / `D package-lock.json` / `M implement.md` / `M docs/SECURITY_REVIEW.md`；`package.json` 增删相抵、净零变更。


### Git Commits

(No commits - planning session)

### Testing

- Batch A（npm）：`pnpm run check` exit 0 / `pnpm run build` exit 0 / `pnpm audit` high 5→0、moderate 全清（仅剩 1 条 dev-only esbuild low）——PASS。
- Rust 编译类验证（`cargo check` / `cargo test`）：ENVIRONMENT-BLOCKED（本机 MSVC C++ 工作负载 / Windows SDK 不完整），待完整工具链环境。

### Status

进行中（Task 01 未完成）：Phase 1 审计/威胁模型已落档；Phase 2 Batch A + D 已执行并验证。Batch B/C/E 与 Phase 3/4/5 未完成（见「延后」）。

### Next Steps

- 换 Mac / 完整工具链后：Batch B（cargo update + 编译验证）、Batch C（capability 按窗口拆分 + tauri dev 验证）、Batch E（check-*.mjs 静态断言）。
- 继续 Phase 3（MCP loopback + AppError 收敛）、Phase 4（输入边界/生命周期）、Phase 5（CSP 收紧 + 发布门禁）。
- 本会话改动已暂存待人工审核；确认后再提交（不自动提交）。


## Session 3: WF-00A 规范切换与上下文校准

**Date**: 2026-09-23
**Task**: WF-00A 规范切换与上下文校准
**Branch**: `main`

### Summary

建立 docs/WORKFLOW_SPEC.md；AGENTS/CLAUDE/原型说明/spec 索引与组件、IPC 规范加范围标注；Task 04 范围修订与剩余去向；DEVELOPMENT_PLAN 重组为 WF；新建父任务与 WF-00A/00B/01。无运行时改动，未提交。

### Main Changes

## WF-00A 规范切换与上下文校准（2026-09-23）

### 结论

- 开发主线切换为"以 MobaXterm 操作流程为主线"的交付包组织（WF-00 至 WF-08）；产品交互规则正文集中在 `docs/WORKFLOW_SPEC.md`（v0.1，规则编号 WS-xx，状态分已确认 / 默认值 / 待确认）。
- 旧规则处置：原型说明中"顶部只放 SSH 连接、左侧固定连接仓库、文件在右侧"降为历史参考并逐条标注替代关系；`component-guidelines.md` / `tauri-command-contracts.md` 中混入的入口位置约束标注为 `[Current implementation — WS-xx replaces at WF-yy]`，工程规则不变；Task 04 的"不改任何 UI"限定为该任务自身。
- Task 04 剩余范围：2c-2b → WF-00B；WorkbenchTab 联合 → WF-01；split anchor → WF-04B；MultiExec 第三刀 → WF-04C（与 Task 06 合并）。已完成切片（1a/1b/2a/2b/2c-1/2c-2a）保留，2c-2a 记录 CI `35600276051`，GUI 冒烟仍未做。
- 新任务：父任务 `09-23-nexaterm-workflow-mainline`（planning，持任务地图、迁移表、A01–A15）；WF-00A（in_progress，本会话）；WF-00B、WF-01（planning，PRD 已写明继承范围与验收编号）。
- 上下文加载路径校准：`.trellis/spec/frontend/index.md` 补 Pre-Development Checklist / Quality Check（此前缺失，before-dev 步骤 4 落空）；`CLAUDE.md` 引用改为 `@AGENTS.md`（git 跟踪名）；`.trellis/workflow.md` Guardrails 加一条项目规则；Task 04 与 WF-00A 的 implement/check manifest 引用同版规范并通过 validate。

### 事实修正

- `WorkspaceShell.tsx` 行数按 `git show <sha>:… | Measure-Object -Line`：HEAD 45418f3 = 13,076；347c8b2 = 13,132。交付方案与 Task 04 implement.md 的 14,0xx 系另一计数方法，已统一。
- Vitest 复跑：12 文件、177 passed / 1 todo。

### 待确认（WORKFLOW_SPEC §10）

菜单是否保留 File；次级工具面板位置；窄窗口收起；跟随开关默认值与手动浏览暂停；关闭实例时运行中传输策略；MultiExec 目标固定 vs 跟随焦点；"连接全部"递归/并发/预览；Windows X server 分发；未保存编辑恢复；树形分组 schema 冲突；会话导入优先级。

### 下一任务

WF-00B `09-23-wf-00b-close-lifecycle`：关闭/删除纯决策 action + characterization + 编排接入；验收 A01。


### Git Commits

(No commits - planning session)

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 4: WF-00B 关闭/删除生命周期：提交一、二

**Date**: 2026-09-23
**Task**: WF-00B 关闭/删除生命周期：提交一、二
**Branch**: `main`

### Summary

closeDecision 纯决策 + close action + followUp；六条关闭路径接入、过渡 setter 删除、检查脚本改行为断言。tsc/Vitest 209/build/boundary 通过；GUI 冒烟与 CI 待做。

### Main Changes

## WF-00B 关闭/删除生命周期收尾 —— 提交一、二（2026-09-23）

- `0079f15`：`sessionTabs/closeDecision.ts` 纯决策（五个 decide*，逐分支对应 45418f3 的六条关闭路径）、新 action（closeTerminals / closeConnections / closeLocalTerminals / removeRdp / removeVnc / focusPaneBinding / startConnecting / openSettings / closeSettings / clearActiveFile / consumeFollowUp）、reducer `followUp` 标记、controller `onFollowUp` 消费 effect；测试 32 例。
- `0f421fc`：WorkspaceShell 六条关闭路径改为"外部清理 → ref 计算 → 值式 set → 一次 dispatch"；删八个过渡 setter；`returnHomeWhenWorkspaceEmpty` / `rememberActiveTab` 无调用者删除；三个检查脚本改为行为断言。13,076 → 12,876 行。
- 验证：tsc、Vitest 209/1 todo、build、startup boundary、六个相关检查全过；全部 check-*.mjs 的 10 个失败与 HEAD worktree 完全一致，无新增。
- 接受的差异：回退激活晚一个 effect tick；决策读 reducer 当前指针（deleteConnection 先关 RDP/VNC 再关终端的边界）。
- 预存且未处理：`check-command-sender-active-tab-source.mjs` 等 10 个脚本（HEAD 即失败）。
- 待办：GUI 冒烟（关闭活动/非活动/最后一个、同 profile 两实例、分屏 pane、连接中立即关闭 A01、删除多终端连接、RDP/VNC 回退、设置页返回）；push 后记录 CI run；更新父任务地图。


### Git Commits

| Hash | Message |
|------|---------|
| `0079f15` | (see git log) |
| `0f421fc` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 5: WF-04A legacy migration and A07 native acceptance

**Date**: 2026-10-02
**Task**: WF-04A legacy migration and A07 native acceptance
**Branch**: `feat/wf04a-session-tree-consistency`

### Summary

完成 04A-4 原文备份/事务幂等迁移与显式映射；Rust 374、frontend 432 通过，CI 七项全绿。A07 macOS 原生 GUI 创建/移动/冲突/export/import/退出重启，7 组 3 连接数据库一致。main 图标 a0fcc0d 合入分支。PR #26 保持 Draft，未合并；WF-04B/C 和 PR #12 未动。

### Main Changes

详见 10-02-wf-04a-session-tree-consistency/implement.md 与 validation/a07.md。

### Git Commits

| Hash | Message |
|------|---------|
| `cf4c925` | (see git log) |
| `20116c3` | (see git log) |

### Testing

- Rust 374/374；frontend 432 passed / 1 todo；scripts 93 passed / 3 skipped。
- CI 36987698243 七项通过；A07 macOS 真实 GUI + 数据重启对照通过。

### Status

[OK] 实现与 macOS A07 已完成；PR #26 待维护者审核合并。

### Next Steps

- 等待最终组合 CI 与 PR 审核；不自行 merge、不启动 WF-04B/C。


## Session 6: WF-04A 原生补验与合并收尾

**Date**: 2026-10-02
**Task**: WF-04A 原生补验与合并收尾
**Branch**: `feat/wf04a-session-tree-consistency`

### Summary

补齐 legacy 冲突映射、失败保留输入、重启幂等与三主题真实 Tauri 验证；修复长路径网格溢出、portal 暗色错误色及重命名报告。Rust 374、前端 432 passed/1 todo，构建和 source/line-budget 通过。04A 子任务归档，父主线不变；PR #26 已获最终 CI 通过后合并授权，WF-04B/C 未启动。

### Main Changes

- 原生补验与数据证据：`.trellis/tasks/archive/2026-10/10-02-wf-04a-session-tree-consistency/validation/a07.md`。
- canonical 树与 FK 未改变；显示修复沿用共享 Radix/token，报告准确记录原名和目标名。

### Git Commits

| Hash | Message |
|------|---------|
| `d0357a6` | fix: polish legacy group migration feedback and verify native recovery |

### Testing

- [OK] `cargo test --lib`：374/374；`pnpm test`：432 passed / 1 todo。
- [OK] `pnpm build`、transfer/startup source gate、line budget、diff check。
- [OK] macOS 原生 legacy 失败/显式映射/重启与三主题；Windows/Linux 本轮仅 CI。

### Status

[OK] **Completed**

### Next Steps

- 核对 PR #26 最终 HEAD CI 后执行已授权的合并并同步 main；不启动 WF-04B/C。


## Session 7: 恢复 Claude 中断会话并完成 MultiExec 顶层底栏

**Date**: 2026-10-04
**Task**: 恢复 Claude 中断会话并完成 MultiExec 顶层底栏
**Branch**: `feat/wf04c-multiexec-entry`

### Summary

恢复 37860aaf 会话；接续 WF-04C 底栏与统一实例目标，补齐 Send 与 Live/停止接线，修复 updater 嵌套派发。531 测试、check/build/source gates、三主题和四实例浏览器 UI 通过；A09/A10 真实 Tauri 待验，A15 未开始。仅暂存待人工审核，不提交推送。

### Main Changes

# WF-04C 顶层入口验证（2026-10-04）

状态：**本地实现与自动化通过；真实 Tauri A09/A10 待维护者验收。**

## 代码与规范

- 分支：`feat/wf04c-multiexec-entry`，基线 `53eca97`，本次改动尚未提交。
- 交互规范：`docs/WORKFLOW_SPEC.md` v0.6，引用 WS-X03–X08 / WS-R02。
- 顶部 action 经共享执行器打开工作区底栏；目标只投影可输入终端实例，底栏与 Command Sender 共用一个目标集合。
- 除新增轻量组件与派生纯函数外没有新依赖；`WorkspaceShell` 未扩大冻结预算。

## 本地自动化

| 门禁 | 结果 |
| --- | --- |
| 全量 `pnpm test` | 69 文件通过，531 测试通过，1 个既有 todo |
| 最后定向 `pnpm exec vitest run` | 8 文件 / 46 测试通过 |
| `pnpm run check` | 通过 |
| `npm run build` | 通过，3410 模块，约 39.91 秒 |
| WF-04C source gate | 通过，新增顶层策略、adapter、底栏可见性与停止检查 |
| i18n 新入口 source gate | 通过 |
| 启动模块边界 source gate | 通过 |
| 行数预算 | 通过，未修改 `scripts/line-budget.json` |
| Trellis context manifests | 通过，implement / check 各 4 条有效规范引用 |
| 敏感信息工具扫描 | 未完成：提升权限后确认本机缺少 `gitleaks`（`tool_missing`），不能记为 PASS；另行人工审核本轮差异 |

构建保持重模块独立 chunk：App JS 约 1.16 KB；TerminalPanel 约 419 KB、SettingsView 约 99 KB、Docker 约 77 KB、RemoteFileEditor 约 3.74 MB。存在既有大 chunk 警告，未把重模块合回首屏。

## 浏览器 UI 验证

环境：Windows，缓存 Playwright 1.57.0 + Edge headless，Vite `http://127.0.0.1:5522/`；使用 `local-preview-*` 预览实例，不连接真实 PTY。

| 检查 | 观察结果 |
| --- | --- |
| 亮色 / 暗色 / system-dark | 1200×760 窗口截图检查通过，背景/文字/边框随主题 token 变化；system-dark 与显式暗色一致 |
| 最小桌面窗口 | 1100×760，工作区底栏宽 404px，控件换行，无新增水平溢出 |
| 四个同 profile 实例 | 1440×960，按实例序号显示四个目标，选择 A/B 后 C/D 保持未选 |
| 空目标与键盘 | 无终端时顶部入口有禁用原因；未勾选时 Live 禁用；键盘焦点及 Enter 激活有效 |
| 工作区切换 | Live 时切首页仍显示状态与停止，保持 A/B 选择 |
| Send | 从首页激活终端并显示 Command Sender；重复点击保持打开，两个入口共享 A/B |
| 停止与最后目标 | 停止有效；移除 A 后 B 仍 Live，移除 B 后停止并禁用 Live |
| 关闭与重开 | 关闭激活底栏停止 Live；重新打开不恢复广播 |
| 布局与错误 | 底栏按钮均在边界内；无未处理 pageerror |

截图与交互 JSON 仅保存在忽略目录 `.trellis/.runtime/wf04c-browser/`：`light.png`、`dark.png`、`system.png`、`narrow.png`、`four-targets-home.png`、`four-targets-send.png`、`interaction-results.json`。

## 证据边界

- 浏览器预览终端仍会显示既有“尺寸同步失败：缺少 Tauri invoke”提示；这是浏览器无原生后端的限制，没有隐藏提示或伪造写入成功。
- 项目现有主窗口最小宽度为 1100px（`app.css`）；640px 探查会裁切整个窗口，不作为本轮已通过的移动端支持证据。
- 此记录不证明真实终端每目标投递次数、2/4 pane 输入链路或目标断线/重连；A09/A10 按 `10-03-wf-04c-unified-multiexec/validation/a09-a10.md` 继续真实 Tauri 验收，尚未记录 PASS。
- 未提交、推送或触发本轮 CI；本任务不归档，A15 尚未开始。
- 差异人工检查及静态指示符检查未发现新增凭据；文本均为 UTF-8 无 BOM，任务元数据统一为 LF。静态指示符检查不替代缺失的 `gitleaks` 全历史扫描。
- 已用 `pnpm tauri dev` 启动包含本地入口改动的真实桌面开发版（`target/debug/nexaterm.exe`，Vite 5520）。启动时历史恢复项出现 `terminal_x11_prepare_failed` / `remote_exec_connect_refused`，与本机 X11/远端服务环境有关；仅证明窗口启动，不扩展为 A09/A10 通过。


### Git Commits

(No commits - planning session)

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
