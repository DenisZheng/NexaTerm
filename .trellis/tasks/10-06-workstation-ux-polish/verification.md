# 本地验证与人工验收交接

## 最终人工确认与提交检查（2026-10-06）

- 维护者先在上一会话表示“我测试都OK了，帮我提交吧”，并在恢复会话中再次确认“都验收OK了，提交吧”。据此记录本轮 macOS 真实 Tauri UX 人工验收通过，并执行本地提交。
- 验收范围为本轮约定的 Home / Quick Connect、Sessions 与实例跳转、分组入口、Files 归属、Split、MultiExec、Toolbar、右侧工具、主题及双语。此结论来自维护者整体确认，不将代理中断前的零散检查补写为独立完成的逐项自动化证据。
- 提交前重验：`npm run check` 通过；`node node_modules/vitest/vitest.mjs run` 为 75 文件、556 PASS / 1 原有 TODO；quick-search、startup-module-boundary、line-budget、i18n-new-entry、WF-03、WF-04B、WF-04C 共 7 项门禁通过；`git diff --cached --check` 通过。
- 源码与原暂存候选一致，本次只补记验收结果，沿用下述已通过的 frontend build 证据。暂存差异已人工复核，生成物、依赖软链接、凭据和原生截图未纳入提交。
- 工程规范复核：本轮沿用实例投影、统一动作入口、token、i18n 与测试分层约定；没有新增 backend/API/持久化契约，无需追加 `.trellis/spec/`。
- 未授权 push / merge，远端 UX CI 尚未运行；A15 发布验收与 PR #12 保持原状态。启动时 `secret_missing` 的可恢复日志不因本轮 UX 验收而宣称已修复，未改 backend。

## 候选与运行现场

- 工作树：`/private/tmp/nexaterm-workflow-ux-polish`
- 分支：`feat/mobaxterm-workflow-ux-polish`
- 基线 HEAD：`e9a80f7c2dbf0428de59c77bb3b1a29e7f6ab119`（PR #42，仍 OPEN/Draft）。
- 本轮代码及人工验收记录按维护者授权一并提交到独立 UX 分支；未 push、未 merge，PR #12 未修改。
- 父任务只增加本子任务引用；不把 A15 或待确认 WS 项标记完成。

实际启动命令（仓库正式脚本）：

```sh
env pnpm_config_verify_deps_before_run=warn pnpm run tauri:dev
```

开发脚本执行原有 `pnpm build:mcp-sidecar && pnpm dev`，再由 Tauri 运行 Rust 应用。交接时原验收 dev 进程已停止，5520 由本工作树使用。原生窗口已通过窗口枚举和截图确认，并停在 Home 供维护者操作；这是验收准备现场，不代表提交时仍有进程运行。不以浏览器预览替代真实 Tauri 验收。

工作树复用原仓库的 `node_modules` 和 Rust `target`（本地软链接），package.json 和 pnpm-lock.yaml 已逐字节确认一致。pnpm 11 默认因工作树结构变化自动尝试 install，首次启动被 UNSAFE_MODULES_DIR 拒绝；成功命令只把此检查设为本次进程的 warn，未安装/升级依赖、未修改 pnpm 持久配置。软链接和生成的 sidecar 不纳入暂存。

## 自动验证

| 命令/项目 | 结果 | 边界 |
| --- | --- | --- |
| `npm run check` | PASS | TypeScript |
| `npm run build` | PASS | Vite 仍提示大于 500 kB 的 chunk；未为消除 warning 扩大重构 |
| `node node_modules/vitest/vitest.mjs run` | 75 文件；556 PASS / 1 原有 TODO | 包括实例、Files、批量、Split、MultiExec、Sidebar、Titlebar、ActionBar、i18n parity |
| `node scripts/check-line-budget.mjs` | PASS | 未放宽 WorkspaceShell 行数预算 |
| startup module boundary | PASS | TerminalPanel、Settings、Docker、Monaco 等仍分块/按需加载 |
| i18n、workspace snapshot、WF-02A/B、WF-03、WF-04B/C、WF-05A/B/C、WF-06A/B/C、WF-07、middle-click、empty-home source gates | PASS | 静态证据单列，不代替运行验收 |
| Quick Search source gate | PASS | 旧脚本的自编译路径及硬编码中文断言失效；原搜索行为用例迁入 `connectionSearch.test.ts`，入口连接与 i18n 检查保留 |
| `git diff --check` | PASS | 空白/冲突检查 |
| `node scripts/security-check.mjs secrets` | ENVIRONMENT-BLOCKED | 本机未安装 gitleaks，不能标记通过；已人工审查本次 diff 不含凭据或环境配置 |
| 本轮远端 CI | 未运行 | 本轮只做本地提交，未推送 UX 分支；PR #42 的 CI 不冒充本轮结果 |

## 视觉补充检查

使用独立临时 Chrome 配置加载本分支 production frontend，仅作为呈现补充：

- Light / English / 1440；Dark / English / 1100；system-dark / zh-CN / 1100：Home 可见，无文档水平溢出。
- 工具栏实际容器限宽 180px 时逐项进入 More，容器 scrollWidth 等于 clientWidth。
- UI 入口单元测试覆盖 English → zh-CN → English 与草稿保留。
- 780px 低于 Tauri 声明的最小宽度 1100，本轮不扩展原生支持尺寸。
- 原生 Tauri 已确认显示本轮 Quick Connect 与 Session Manager；后续维护者已确认本轮人工验收通过，来源及范围见首节。

截图和构建日志只在 `/private/tmp/nexaterm-ux-*`，不提交含用户会话信息的原生截图。

## 编译/运行警告

- Frontend：Vite chunk size warning；构建 exit 0。
- Rust app：15 个 unused import / dead-code warning；sidecar：1 个 unused function warning。涉及本轮未修改的旧 Rust 文件，不自行清理。
- 首轮 sidecar 有临时 placeholder 警告，随后正式 sidecar 已由仓库脚本编译并复制，Tauri 正常运行。
- pnpm：工作树结构与依赖缓存位置 warning，原因及处理见上；成功启动没有编译 error。

## 仍需确认/后续动作

- 本轮 macOS UX 人工验收已由维护者确认通过，无需重复该清单。
- 本地提交完成后，等待后续 push / CI 授权；不把提交写入 PR #42 分支。PR #42 合入后再对齐 main。
- WS-F03 手动浏览暂停/恢复、WS-N04 Windows X server 分发、WS-R03 未保存草稿恢复仍待产品确认，没有实现。
- A15 真实安装、签名、updater、迁移、性能、artifact hash 等继续保持原有待验收状态。
- 前轮独立 Files follow restore 补丁和已暂存对账材料没有混入本工作树。

## 修改文件

- `.trellis/tasks/09-23-nexaterm-workflow-mainline/task.json`
- `.trellis/tasks/10-06-workstation-ux-polish/check.jsonl`
- `.trellis/tasks/10-06-workstation-ux-polish/design.md`
- `.trellis/tasks/10-06-workstation-ux-polish/implement.jsonl`
- `.trellis/tasks/10-06-workstation-ux-polish/implement.md`
- `.trellis/tasks/10-06-workstation-ux-polish/prd.md`
- `.trellis/tasks/10-06-workstation-ux-polish/task.json`
- `.trellis/tasks/10-06-workstation-ux-polish/verification.md`
- `scripts/check-connection-quick-search-source.mjs`
- `src/features/connections/ConnectionOpenSessions.test.tsx`
- `src/features/connections/ConnectionOpenSessions.tsx`
- `src/features/connections/ConnectionPane.tsx`
- `src/features/connections/connectionSearch.test.ts`
- `src/features/files/RemoteFilePanel.tsx`
- `src/features/layout/AppActionBar.test.tsx`
- `src/features/layout/AppActionBar.tsx`
- `src/features/layout/AppToolbar.tsx`
- `src/features/layout/HomeSessionStart.test.tsx`
- `src/features/layout/HomeSessionStart.tsx`
- `src/features/layout/MultiExecBar.test.tsx`
- `src/features/layout/MultiExecBar.tsx`
- `src/features/layout/NewSessionMenu.tsx`
- `src/features/layout/WorkspaceShell.tsx`
- `src/features/layout/WorkspaceSidebar.test.tsx`
- `src/features/layout/WorkspaceSidebar.tsx`
- `src/features/layout/sessionNavigation.test.ts`
- `src/features/layout/sessionNavigation.ts`
- `src/features/layout/workspaceSidebarContext.ts`
- `src/features/shortcuts/actionPresentation.test.ts`
- `src/features/shortcuts/actionPresentation.ts`
- `src/features/terminal/TerminalSplitSurface.test.tsx`
- `src/features/terminal/TerminalSplitSurface.tsx`
- `src/shared/i18n/locales/en.json`
- `src/shared/i18n/locales/zh-CN.json`
- `src/styles/actionbar.css`
- `src/styles/app.css`
