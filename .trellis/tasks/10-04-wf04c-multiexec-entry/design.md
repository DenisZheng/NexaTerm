# WF-04C MultiExec 顶层入口设计

## 形态（2026-10-04 维护者确认）

新增 MultiExec 底栏：顶部入口开/关；底栏 = 标题 + Live/Send 模式 + 激活状态与停止 + 逐实例目标勾选。发送仍走 Command Sender（共享同一目标集合）。对齐已评审原型（`prototype/light-neutral/mxterm-light-neutral.html` 底部 MultiExec 目标面板）与 WS-X08（激活时显眼状态与停止按钮）。

## 状态与数据流

- 事实来源不变：`multiExecMode` / `multiExecTargets`（`useTerminalSplitController` 持有）与 `multiExecRuntimeTargets` 投影（`workspace/multiExec/targets.ts`）。
- 新增仅为 UI 可见性：`multiExecBarOpen`（Shell `useState`，不持久化；WS-R02 要求 MultiExec 不随恢复自动开启）。
- `showMultiExecBar = multiExecBarOpen || multiExecMode === "live"`：从既有 Split Sync 启动 Live 时也显示控制面。底栏位于 `.main-workbench` 第二行，首页、SSH、Local、RDP、VNC 切换不隐藏它；不占右侧工具面板。
- 关闭底栏时若处于 live，则停止广播（底栏是激活状态的可见控制面）。
- 目标勾选复用 `setTerminalSplitSyncParticipant`；Live 开关复用 `setTerminalSplitSyncState`（含空目标守卫）。`multiExec/setTargets` 在 reducer 内原子处理最后目标移除后的模式变化，Shell 的 updater 只计算下一集合，避免 reducer 执行期间嵌套 dispatch。
- Send 显式打开 `openCommandSenderAndPrepareTargets`，再次点击保持打开。当前已显示终端时保持焦点；首页、桌面或统一文件页中点击 Send 时激活首个已选目标（无选择时首个可用目标），使现有 Command Sender 可见，不隐式选择该目标。

## 组件边界

`src/features/layout/MultiExecBar.tsx`（纯展示 + 回调，不持有业务状态）：

- props：`targets: MultiExecTarget[]`、`selectedKeys: ReadonlySet<string>`、`mode`、`error`、`onToggleTarget`、`onStartLive`、`onStop`、`onOpenCommandSender`、`onClose`。
- 按钮复用 `text-tool-button` / `icon-button`，勾选标记复用 `terminal-split-menu-check`；文案全部走 `multiExec.*` i18n key；空态与错误用 `role="status"` / `role="alert"`。
- Live 按钮在未选目标时禁用并给出提示；`mode === "live"` 时显示激活状态与停止按钮（WS-X08）。
- 目标标题超长时省略显示，通过共享 Tooltip 展示完整标题；操作和目标列表允许换行，目标区达到高度上限时滚动。背景、边框、选中、危险和焦点色全部使用全局 `--mx-*` token。

## 设计审查

本机 Claude 插件缓存未找到 `ui-ux-pro-max`。经维护者授权，官方技能仓库下载至忽略目录 `.trellis/.runtime/ui-ux-pro-max-skill`；读取其 SKILL 与 React / UX 检索结果后落实为：复用共享控件、显式选中与禁用状态、键盘焦点、完整标题提示、可见停止动作、三主题 token。技能文件与临时检索输出不提交。

## 策略层

- `actionRegistry.ts`：`terminal.multiExec` 改为 `{ target: "none", capability: "multi-exec" }`；工作区可见且 `context.commandSenderTargetCount > 0` 才可用，否则 `workspace-inactive` / `no-multi-exec-targets`。
- `actionContext.ts`：删除 `deferred-wf04c`，新增 `no-multi-exec-targets`。
- `actionPresentation.ts` + `actionbar.*.json`：移除旧 reason 文案，新增 `actionBar.reason.noMultiExecTargets`。
- `workspaceActionHandlers.ts`：新增 application 型 `toggleMultiExec`。

## 行数预算

Shell 当前 13,860 行 = 预算上限（只许减不许增）。把 `terminalSplitSyncPaneOptions` 的 memo 体（约 32 行）抽为 `src/features/layout/terminalSplitSyncOptions.ts` 纯函数，抵消接线新增（约 30 行），保持净增 ≤ 0。

## 测试

- 更新：`actionRegistry.test.ts`、`actionPresentation.test.ts`、`AppActionBar.test.tsx`、`workspaceActionHandlers.test.ts`、`useWorkspaceActionRuntime.test.tsx`（operations fixture 补 `toggleMultiExec`）。
- 新增：`MultiExecBar.test.tsx`（勾选回调、Live 门控、激活状态/停止、Send 跳转、空态、错误展示）。
- 新增：`terminalSplitSyncOptions.test.ts`（既有投影行为等价）；扩展 `multiExec/reducer.test.ts`（最后目标移除时停止 Live，Send 不受该停止规则影响）。
- 扩展 `check-wf04c-multiexec-source.mjs`：入口不得再 deferred；Shell 必须渲染 `MultiExecBar`。
- 浏览器验证：亮/暗/system-dark、1100px 最小桌面窗口、四实例勾选、键盘激活、首页切换、Send 重复打开、停止与收起。仅证明 UI，不替代真实 PTY/SSH A09/A10。结果见 `validation/entry.md`。
