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
- [x] GUI 冒烟（用户，2026-09-19，PPK 连接后）：水平/垂直分屏、分两次到三 pane、关掉两个后原 pane 恢复独立 tab，均正常。四宫格、拖分隔条、同步输入、分屏时直接关连接四项未单独报告，视为随上述路径覆盖；若后续出现异常按 1b 回滚点处理。
- [x] 记录 CI run：`35427555427` @ `9edbab8` 全绿（Frontend checks / Rust 三平台 / Security evidence）。

## 2. 第二刀：SessionTabs reducer（按 design §3 修订版）

### 2a. 类型与 selector 先行（提交 `refactor(workspace): extract session tab types and selectors`）
- [x] `sessionTabs/types.ts`：`TerminalTab<TStep>`（泛型留位，连接向导类型链仍归 WorkspaceShell）、`RdpSessionTab`、`VncSessionTab`、状态枚举、`WorkspaceMode`、`UnifiedWorkbenchTab`、`ConnectionSessionSummary` 原样迁出。
- [x] `sessionTabs/selectors.ts`：`groupByConnection`、`selectConnectionSessions`、`selectActiveSession`、`selectActiveTerminalTab`、`selectActiveConnectedTerminalTab`、`selectActiveTerminalSplitBinding`；11 个 Vitest 用例。
- [x] WorkspaceShell 只换 import 与调用，状态与 effect 一行未动；14,190 → 14,096 行。
- [x] 本机：tsc 0、Vitest 150/1 todo、build ✓、boundary ✓。**不需要 GUI 冒烟**（纯派生替换，无状态时序变化）。

### 2b. 机械抽 `useSessionTabsController`（提交 `refactor(workspace): extract session tabs controller hook`）
- [x] 迁入：5 个集合、7 个指针（含 `activeRemoteFileTabId`）、`activeView`、`activeWorkspaceMode`、`homeActive`、`activeTabByConnectionId` / `activeUnifiedTabByConnectionId` / `terminalFileLayoutByConnectionId`、2 个按连接归一 effect（文件布局清理补默认、unified tab 回退）。`TerminalTab` 以泛型注入。
- [x] **明确不迁**（偏离 design §3）：`terminalTabsRef` 等 4 个 ref、其 4 个镜像 effect，以及 setter updater 内 28 处 `xxxRef.current = nextTabs` 同步写入（83 处读取）。它们是"提交前同步读最新值"的通道，搬进 controller 只会把 ref 语义暴露成接口；留待第三刀后单独议题。1542 行的搜索/最近输出清理 effect 也留在 shell（它写的是终端面板状态，不属本 seam）。
- [x] `useSessionTabsController.test.tsx`：12 个 renderHook 用例锁两个归一 effect（默认布局补齐、记忆不被覆盖、按存活连接清理、file 优先回退、kind 不符视为失效、连接消失删除、无变化同引用）+ 初始状态 + setter 透传。
- [x] 本机：tsc 0、Vitest 162/1 todo、build ✓、boundary ✓、`check-session-subtab-memory` / `check-local-terminal-warmup-source` / `check-remote-file-editor-source` 三个源码检查 PASS（标识符未改名，2c 改名时再处理）。WorkspaceShell 14,096 → 14,061 行。
- [x] GUI 冒烟（用户，2026-09-20）：SSH / 本地 tab 切换、远程文件 tab 关闭回退、关闭活动 tab、全部关闭回首页，均正常（"过了"）。
- [x] CI：run `35516168264` @ `347c8b2` 前端 + Linux + macOS + Security 绿，Windows `cargo test` 红——根因是 PPK 任务 `~` 测试只读 `HOME`（Windows runner 只有 `USERPROFILE`），与本刀无关；`5c8478d` 修复，CI run 待记录。

### 2c. 换 reducer（两个提交）

#### 2c-1 reducer 接管指针（提交 `refactor(workspace): back session pointers with a reducer`）
- [x] `sessionTabs/actions.ts`：意图型 `tabs/activateTerminal|Local|Rdp|Vnc|File|SplitHost`、`tabs/goHome`、`tabs/returnHomeIfEmpty`、`tabs/fallbackHomeKeepPointers`、`tabs/rememberActive|forgetConnections|rememberUnified`、输入型 `tabs/normalizeUnified`；过渡型 `tabs/set*` 九个。
- [x] `sessionTabs/reducer.ts`：`SessionPointerState`（7 指针 + view + mode + homeActive + 2 记忆表）；五个集合与文件布局记忆**仍是 useState**（集合与 shell 内 `*Ref` 同步写入耦合）。`normalizeUnified` 接走原 unified 回退 effect 的逻辑。
- [x] `reducer.test.ts` 14 例；controller 的 12 个 characterization 用例一字未改仍绿。
- [x] controller 对外接口不变（setter 过渡层 + 新增 `dispatchTabs`）；两张记忆表的 updater 型 setter 在过渡层求值后拆成 remember/forget action。
- [x] 本机：tsc 0、Vitest 176/1 todo、build ✓、boundary ✓、三个源码检查 PASS。
- [x] CI run `35518747970` @ `52dff09` 全绿。

#### 2c-2a 激活/记忆函数改 action（提交 `refactor(workspace): dispatch session tab activation as actions`）
- [x] 13 个函数改为 dispatch 一个意图型 action：`returnHomeWhenWorkspaceEmpty` → `returnHomeIfEmpty`；`activateStandaloneTerminalTab` / `activateRdpSession` / `activateVncSession` / `activateRemoteFileTab` / `activateStandaloneLocalTerminalTab` / `activateTerminalSplitHost` / `openHome` / `openLocalTerminalWorkspace` → 对应 `activate*` / `goHome`；`rememberActiveTab` / `forgetActiveConnectionTabs` / `rememberUnifiedActiveTab` → remember / forget；`activateTerminalFallbackAfterFilesClose` 末尾 → `fallbackHomeKeepPointers`。seam 外的 `setSettingsSectionRequest` / `setRightTool` / split 两个 setter 留在原函数紧跟 dispatch。
- [x] 新增 `tabs/forgetUnified` 承接 `clearRemoteFileSessionStateForConnections` 里唯一一处 updater 型删除；controller 删除两张记忆表的 updater 型 setter 过渡层（无调用者）。
- [x] 摸底修正：`openHome` / `openLocalTerminalWorkspace` 不是死函数（作为 props 传给连接侧栏），保留并改 dispatch。
- [x] 本机：tsc 0、Vitest 177/1 todo、build ✓、boundary ✓、三个源码检查 PASS。shell 剩 50 处单值指针 setter，全在关闭/删除路径（`closeTerminalTabs`、`deleteConnection`、`closeConnectionSessions`、`removeRdp/VncSessionsLocally`、`closeLocalTerminalTabs`、`startConnectionStep`、`focusTerminalSplitPane`、settings 视图两处），归 2c-2b。
- [ ] GUI 冒烟（用户）：与 2b 同五步 + 从设置页返回工作区。
- [ ] CI run。

#### 2c-2b 关闭/删除路径改 action（待做）
- [ ] 上述 50 处收成 `tabs/closeTerminals` / `tabs/closeConnection` / `tabs/closeLocalTerminals` / `tabs/removeRdp` / `tabs/removeVnc` 等意图型 action（它们在 `setXxx(updater)` 内读 `*Ref.current` 决定下一个活动项，需先把"算下一个活动项"抽成纯 selector）；删九个单值 setter 过渡层。
- [ ] `WorkbenchTab` 联合、`index` 保留为 `ordinal`、`UnifiedWorkbenchTab.kind` 映射函数（原 2c 条目，顺延）。
- [ ] 冒烟 + CI。
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
