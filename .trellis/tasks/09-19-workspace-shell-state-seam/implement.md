# WorkspaceShell 状态 seam 实施计划

## 0. 启动前门禁

- Task 03 Vitest 门禁已在 CI（`35411114576` 全绿）。
- 基线数字（2026-09-19，`2b56749`）：`WorkspaceShell.tsx` 14,370 行；`useState` 声明 78（组件内 77）、`useEffect` 39 + `useLayoutEffect` 4、`useReducer` 0。
- 评审：`review-plan.md`（2026-09-19）结论"需先修改"，design.md 已按其修订；实施以修订版为准。
- 本机：Node 24 / pnpm 11.22.0 / rustup 1.98.1，`tauri dev` 可运行，可做手动冒烟。

## 1. 第一刀：Split（两个提交）

### 1a. 机械抽 hook + characterization（提交 `refactor(workspace): extract split controller hook`）
- [x] 新建 `src/features/workspace/split/useTerminalSplitController.ts`：把 1004-1023 行 12 个 useState、3 个 ref、4 个归一 effect（1221 / 1459 / 1481 / 1500）原样移入，不改逻辑；外部依赖以 inputs/回调传入。
- [x] `useTerminalSplitController.test.tsx`（jsdom + renderHook）：19 个行为用例，在旧实现上全绿（2026-09-19，本机 Vitest 122 passed）。
- [x] WorkspaceShell 改为调用 hook；行为零变化。本机验证通过，提交 `7c33e23` 已推送；GUI 冒烟推迟到 1b 后一次性做。

### 1b. 换内脏（提交 `refactor(workspace): replace split controller internals with reducer`）
- [x] 新建 `split/{actions,reducer,selectors}.ts` 与 `multiExec/{actions,reducer}.ts`（仅 mode/targets/error）；`reducer.test.ts` 各覆盖 action、归一三种分支、未知 action / 无变化返回原引用（split 11 例、multiExec 6 例）。
- [x] hook 内部改 `useReducer`，4 个归一 effect 收敛为 `availableBindingsChanged` + `targetsAvailable` + 一个 `collapsedTo` 回调 effect；1a 的 19 个 renderHook 用例一字未改仍绿。
- [x] 记录接受的行为变化：见「结果记录」。
- [x] 验证：tsc 0 错、Vitest 139 passed / 1 todo、build 通过、startup boundary PASS、reducer 落在 WorkspaceShell chunk。
- [ ] GUI 冒烟（用户）：开两 pane、四宫格、移动、同步输入、关一个、关全部、关闭宿主 tab。
- [ ] 记录 CI run。

## 2. 第二刀：SessionTabs reducer（按 design §3 修订版）

- [ ] 机械抽 `useSessionTabsController`（五个集合、七个指针含 `activeRemoteFileTabId`、`activeWorkspaceMode`、`homeActive`、三个 byConnection 记忆、4 个 ref 镜像 effect），renderHook characterization 先绿：关闭活动 tab 相邻激活、connecting→terminal、重连 sessionId 替换、RDP/VNC 失败留存、回退 file tab 规则。
- [ ] `sessionTabs/` 三件套；`WorkbenchTab` 联合，`index` 保留为 `ordinal`；`UnifiedWorkbenchTab.kind` 映射函数。
- [ ] 把 46 个多 setter 函数逐个收成原子 action（`tabs/activate`、`tabs/close` 等）；不删 effect。
- [ ] `terminalSplitAnchorIndex` 语义改为按 owner tab id 锚定（design §2.2 备注）。
- [ ] 静态脚本：`check-session-subtab-memory.mjs`、`check-local-terminal-warmup-source.mjs`、`check-remote-file-editor-source.mjs` 改断言 selector/action 名，提交信息说明。
- [ ] 验证同第一刀，冒烟加 SSH/本地/RDP 各开关一次、断线重连、关闭活动 tab、回首页。
- [ ] 提交 `refactor(workspace): extract session tabs reducer`；push，记录 CI run。

## 3. 第三刀：MultiExec reducer

- [ ] 新建 `multiExec/` 三件套；`buildCommandSenderTargets` 迁入 `selectors.ts` 并改为消费 SessionTabs state。
- [ ] 扩展第一刀已建的 `multiExec/`：`mode` 加 `"send"`，吸收 command sender 状态与 `commandSenderTargetTabByConnectionId`。
- [ ] 吸收 command sender 11 个 useState 与 `selectedCommandTargetKeys`。
- [ ] 验证同前，加 `node scripts/check-command-sender-active-tab-source.mjs` 与 `check-command-sender-mvp-source.mjs`（两脚本此前已知漂移，若失败先核对是否为脚本假设过期，不为迁就脚本改行为）。
- [ ] 提交 `refactor(workspace): extract multi-exec reducer`；push，记录 CI run。

## 4. 文档

- [x] `.trellis/spec/frontend/state-management.md`：reducer/action/selector 约定、目录、命名、测试要求（2026-09-19，index 状态 To fill → Partial）。
- [ ] `docs/ARCHITECTURE.md`、`docs/CURRENT_STATE.md`：WorkspaceShell 状态所有权与前后数字。
- [ ] `docs/tasks/05-workspace-restore-and-schema.md`：注明快照输入为 `SessionTabsState` + `SplitState`。

## 5. 回滚点

每刀独立提交，`git revert <sha>` 即回滚；reducer 目录无其它消费者。

## 结果记录

### 2026-09-19 第一刀 1a
- 迁出：12 useState、3 ref、4 归一 effect、4 个辅助函数（`nextTerminalSplitId`、`terminalSessionIdForBinding`、`fallbackTerminalSplitBinding`、`createTerminalFourPane`）、`setsEqual`、`TerminalSplitHost` 类型；WorkspaceShell 由 14,370 行降到 14,190 行，`useState` 文本命中 108→96。
- 跨 seam 回调 `activateTerminalBindingAsStandalone` 经 ref 传入，effect 依赖数组与原版完全一致。
- 本机：tsc 0 错、Vitest 122 passed / 1 todo、build 通过、startup boundary PASS、hook 落在 WorkspaceShell chunk 内。
- 待用户 GUI 冒烟后推送。→ 已推送（用户外出，冒烟合并到 1b 后一次做）。

### 2026-09-19 第一刀 1b
- `split/`：`SplitState` 10 字段（layout/host/anchorIndex/tabActive/focusedPaneId/revision/autoCreateSameSession/picker/confirmCloseOpen/collapsedTo）。`TerminalSplitHost`、`TerminalSplitPickerOpenRequest` 类型迁到 `actions.ts`。
- `multiExec/`：`MultiExecState { mode: off|live, targets, error }` 接走原 sync 三个 useState。
- 对外接口（hook 返回值）与 1a 完全一致；12 个 `set*` 现为 dispatch 薄包装（`useCallback` 稳定引用），标注为过渡层，第二刀替换调用点后删除。`split/setLayout` 保留函数式更新以承接旧代码里 6 处 `setTerminalSplitLayout((layout) => …)`。
- 保留为 ref：id 计数器、picker 请求计数器、pendingPane（只在事件内同步读写，不参与渲染）；比 design §2.2 的“并入 state”保守，理由是并入会让 `requestTerminalSplitPicker` 变成两次 dispatch，收益为零。
- **接受的行为变化**：(1) 原 4 个 effect 各自触发、可能跨两帧完成的归一（失效清理 → 单 pane 收缩），现在一次 reduce 完成，中间态少一帧；(2) 单 pane 收缩时原 effect 直接同步调用 `activateTerminalBindingAsStandalone`，现在经 `collapsedTo` 标记在下一个 effect 里调用，晚一个 effect tick 但仍在同一提交前；characterization 用例对二者均不敏感，已验证。
- 本机：tsc 0、Vitest 139/1 todo、build ✓、boundary ✓、WorkspaceShell 行数 14,190（本步不动 shell）。
