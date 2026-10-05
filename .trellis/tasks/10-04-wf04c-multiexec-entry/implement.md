# WF-04C MultiExec 顶层入口实施

## 切片

- [x] 01 策略与执行器：`actionContext.ts` / `actionRegistry.ts` / `actionPresentation.ts` / `actionbar.*.json` 翻转入口并新增 `no-multi-exec-targets`；`workspaceActionHandlers.ts` + runtime fixture 补 `toggleMultiExec`。
- [x] 02 底栏组件：`src/features/layout/MultiExecBar.tsx` + `multiExec.*` i18n keys + `app.css`（token，亮/暗/system-dark）+ `MultiExecBar.test.tsx`。
- [x] 03 Shell 接线：`multiExecBarOpen`、`toggleMultiExecBar`、operations 接线、渲染与 `multi-exec-open` 网格行；抽取 `terminalSplitSyncOptions.ts` 保持行数 ≤ 预算；最后目标移除后的 Live 停止归入 reducer 原子更新。
- [x] 04 测试与门禁：更新既有测试；扩展 `check:wf04c-multiexec`；`pnpm run check`、定向 + 全量 `pnpm test`、`npm run build`、`check:line-budget`、`check:i18n-new-entry`、`check-startup-module-boundary-source` 通过；浏览器主题与交互检查通过，详见 `validation/entry.md`。
- [x] 05a 记录：更新任务、规范、验收报告与会话日志，审核暂存 diff；维护者随后授权提交并推送现有 `feat/wf04c-multiexec-entry` 分支，明确暂不合主线。
- [ ] 05b 验收：A09/A10 真实 Tauri 验收由维护者按 `a09-a10.md` 执行后回填；本任务保持 `in_progress`，不归档。

## 恢复记录（2026-10-04）

- 原 Claude 会话：`37860aaf-ebab-4ce4-af41-2738eca2e2c5`；恢复时策略、组件、Shell 接线尚未完整，未有通过的交付门禁。
- 本轮补齐底栏与共享目标、Send 显式打开和跨工作区可见性，修复 updater 内嵌套派发；未增加依赖或修改行数预算。
- 自动化：69 个测试文件通过，531 个测试通过，1 个既有 todo；最近定向回归 8 文件 / 46 测试通过。
- 验收状态：顶层入口已本地接入，A09/A10 从入口阻塞转为真实 Tauri 待验；A15 未开始。

## 回滚

策略翻转、底栏组件、Shell 接线、抽取各自独立可 revert；抽取的纯函数与原 memo 行为等价（测试锁定）。
