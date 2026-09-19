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
- [ ] WorkspaceShell 改为调用 hook；行为零变化。验证 + 冒烟 + 提交 + CI。

### 1b. 换内脏（提交 `refactor(workspace): replace split controller internals with reducer`）
- [ ] 新建 `split/{actions,reducer,selectors}.ts` 与 `multiExec/{actions,reducer,selectors}.ts`（仅 mode/targets/error），按 design §2.2 / §2.3；`reducer.test.ts` 覆盖每个 action、`availableBindingsChanged` 的三种归一、未知 action 返回原引用。
- [ ] hook 内部改 `useReducer`，4 个归一 effect 收敛为一个 `availableBindingsChanged` dispatch + 一个 `collapsedTo` 回调 effect；1a 的 renderHook 用例不动仍绿。
- [ ] 记录接受的行为变化：closePane 关到空时 picker/sync 同帧清理。
- [ ] 验证：`pnpm run check`、`pnpm test`、`pnpm run build`、`node scripts/check-startup-module-boundary-source.mjs`；冒烟：开两 pane、四宫格、移动、同步输入、关一个、关全部、关闭宿主 tab。
- [ ] 记录前后行数与计数；提交；push，记录 CI run。

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

- [ ] `.trellis/spec/frontend/state-management.md`：reducer/action/selector 约定、目录、命名、测试要求。
- [ ] `docs/ARCHITECTURE.md`、`docs/CURRENT_STATE.md`：WorkspaceShell 状态所有权与前后数字。
- [ ] `docs/tasks/05-workspace-restore-and-schema.md`：注明快照输入为 `SessionTabsState` + `SplitState`。

## 5. 回滚点

每刀独立提交，`git revert <sha>` 即回滚；reducer 目录无其它消费者。

## 结果记录

### 2026-09-19 第一刀 1a
- 迁出：12 useState、3 ref、4 归一 effect、4 个辅助函数（`nextTerminalSplitId`、`terminalSessionIdForBinding`、`fallbackTerminalSplitBinding`、`createTerminalFourPane`）、`setsEqual`、`TerminalSplitHost` 类型；WorkspaceShell 由 14,370 行降到 14,190 行，`useState` 文本命中 108→96。
- 跨 seam 回调 `activateTerminalBindingAsStandalone` 经 ref 传入，effect 依赖数组与原版完全一致。
- 本机：tsc 0 错、Vitest 122 passed / 1 todo、build 通过、startup boundary PASS、hook 落在 WorkspaceShell chunk 内。
- 待用户 GUI 冒烟后推送。
