# WorkspaceShell 状态 seam 设计

> 2026-09-19 修订版：吸收 `review-plan.md` 的 B1-B6 阻塞项与 S1-S7 建议。修订点在各节以「评审修订」标出。

## 1. 总体形状

```
src/features/workspace/
  split/        reducer.ts  actions.ts  selectors.ts  useTerminalSplitController.ts  *.test.ts   ← 第一刀
  multiExec/    reducer.ts  actions.ts  selectors.ts  *.test.ts                                     ← 第一刀（仅 sync）+ 第三刀
  sessionTabs/  reducer.ts  actions.ts  selectors.ts  *.test.ts                                     ← 第二刀
```

- `reducer.ts`：`export function <seam>Reducer(state, action): State` 与 `initial<Seam>State`；纯函数，不可变更新，未知 action 返回原引用。
- `actions.ts`：`type <Seam>Action` 判别联合 + 构造器；名字用 `seam/动词`。**action 携带意图（paneId、tabId、可用 binding 集合），reducer 从 state 计算结果；禁止调用方在闭包里算好 `nextLayout` 再塞进 payload**（评审 S7，避免保留闭包过期读）。
- `selectors.ts`：派生值纯函数；返回新对象的 selector 在组件里必须 `useMemo`（评审 S7，xterm 面板对多余渲染敏感）。
- `features/workspace/` 与既有 `features/layout/` 的边界：`workspace/` 只放状态所有权（reducer/selector/controller hook），`layout/` 继续放视图组件与编排；写入 `state-management.md`。
- 新目录只被 WorkspaceShell 引用，WorkspaceShell 本身是懒加载 chunk，startup boundary 不变。

## 2. 第一刀：Split（含 sync 独立成 multiExec 雏形）

### 2.1 Characterization 方法（评审修订 B6 / S1）

"从 setter 序列翻译 action 序列"不是 characterization，因为它不执行旧代码。改为两步：

1. **机械抽 hook**：把 1004-1023 行的 12 个 `useState`、3 个 ref（`terminalSplitPickerPendingPaneRef`、`terminalSplitPickerRequestRef`、`terminalSplitIdRef`）以及 4 个归一 effect（1221-1258 失效 binding 清理、1459-1479 超上限重建四宫格、1481-1498 单 pane 清空、1500-1528 sync 参与者收缩）**原样**搬进 `useTerminalSplitController(inputs)`，一行逻辑不改，只是移动。inputs 是它读取的外部状态（`terminalTabs`、`localTerminalTabs` 的 binding key 集合等）；跨 seam 副作用 `activateTerminalBindingAsStandalone`（1496 行）作为回调参数传入。
2. 用 `@testing-library/react` 的 `renderHook`（`// @vitest-environment jsdom`）写约 20 个行为用例，先在旧实现上跑绿；再把 hook 内脏换成 `useReducer`，用例不动仍绿。reducer 自身的纯函数测试在其上追加。

### 2.2 状态映射（评审修订 B5）

| 现 useState / ref | 目标字段 | setter 调用点 |
| --- | --- | --- |
| `terminalSplitLayout` | `layout` | 14 |
| `terminalSplitHost` | `host` | 6 |
| `terminalSplitAnchorIndex` | `anchorIndex`（注意：是按连接过滤后的插入位，第二刀需改为按 owner tab id 锚定，评审 S4） | 2 |
| `terminalSplitTabActive` | `tabActive` | 10 |
| `focusedTerminalPaneId` | `focusedPaneId` | 13 |
| `terminalSplitLayoutRevision` | `revision`（只在 resize end 自增，9077 行） | 2 |
| `terminalSplitAutoCreateSameSession` | `autoCreateSameSession` | 1（回调透传 8962） |
| `terminalSplitPickerOpenRequest` + `terminalSplitPickerPendingPaneRef` | `picker: { key, paneId, pendingPaneId } \| null`（ref 并入，二者在 1491/4779/4952/5089 成对清零） | 5 |
| `terminalSplitPickerRequestRef` | `picker.key` 计数并入 state | — |
| `terminalSplitIdRef` | `nextId: number`（reducer 需要生成 pane/split id；`nextTerminalSplitId` 4611 行退役） | — |
| `terminalSplitCloseConfirmOpen` | `closeConfirmOpen` | 1 |
| `terminalSplitSyncEnabled` / `terminalSplitSyncParticipantKeys` / `terminalSplitSyncError` | **不进 split**，直接进 `multiExec/`：`{ mode: "off" \| "live", targets: ReadonlySet<string>, error }`（评审 S3：`TerminalSplitLayout` 只吃 `syncEnabled`/`syncParticipantKeys` 两个 prop，传入点两行，一步到位省一次搬迁） | 11 / 6 / 8 |

不动：`terminalClearRequest`、`editorTerminalSplitPercent`。

### 2.3 Action 集（评审修订 B4 / S2）

意图型：

- `split/open(hostTabId, anchorIndex, bindings)`、`split/openFour(bindings)`、`split/activateTab`（tabActive=true，同时清 multiExec error 由调用方 dispatch 两个 action）、`split/deactivate`（tabActive=false）、`split/closePane(paneId)`、`split/closeGroup`、`split/assignBinding(paneId, binding)`（layout + focus + 清 picker）、`split/moveBinding`、`split/focusPane`、`split/updateRatio(splitId, ratio)`、`split/resizeEnd`（revision++）、`split/requestPicker(paneId)` / `split/clearPicker`、`split/setAutoCreateSameSession`、`split/confirmClose.open` / `.close`。

输入型（把 4 个归一 effect 的逻辑收进 reducer）：

- `split/availableBindingsChanged(availableKeys: ReadonlySet<string>)`：一次完成失效 binding 剔除、超上限重建四宫格、单 pane 收缩。reducer 返回值附带 `collapsedTo?: TerminalPaneBinding`，controller hook 里唯一保留的 effect 据此调用 `onCollapseToStandalone`（原 1496 行副作用）。
- multiExec 侧对应 `multiExec/targetsAvailable(availableKeys)`：收缩 targets，少于 2 个自动 `mode: "off"`（原 1500-1528 与 5019-5031 的嵌套 setter 逻辑，reducer 化后变纯）。

明确接受的一处行为变化（评审 S2 表末行）：现 `closePane` 关到空时不清 picker/sync、靠下一帧 effect 补；reducer 化后同一 action 内完成。中间态少一帧，用户不可见，记录于 implement.md。

## 3. 第二刀：SessionTabs（评审修订 B1-B3，重写）

**修正的前提**：指针不是靠 effect 同步，而是 46 个函数里手写的多 setter 序列（如 `activateStandaloneTerminalTab` 5121-5135 一次写 5 个 setter + 3 个记忆函数；`returnHomeWhenWorkspaceEmpty` 4548-4554 写 7 个）。触及 tab 状态的 11 个 effect 没有一个是纯对齐：4 个是 ref 镜像，2 个是带业务规则的派生回退（1772-1834，含"优先回退 file tab"），2 个是 RDP/VNC 视口同步，1 个属 split。**因此第二刀不删 effect**，收益来自把多 setter 序列收成原子 action。

状态形状：

```ts
interface SessionTabsState {
  tabs: WorkbenchTab[];                     // 五个集合合并，顺序 = tab 栏顺序
  activeTabId: string | null;
  mode: WorkspaceMode;                      // "home"|"ssh"|"local"|"rdp"|"vnc"，与 activeTab.kind 同源但保留（B2）
  homeActive: boolean;                      // 独立记忆位（1970 行 showingHome 规则），不可派生（B2）
  lastActiveByConnection: Record<string, string>;        // 原 activeTabByConnectionId（B3，功能不是派生）
  lastUnifiedByConnection: Record<string, string>;       // 原 activeUnifiedTabByConnectionId
  fileLayoutByConnection: Record<string, …>;             // 原 terminalFileLayoutByConnectionId
}
```

- `activeConnectionId`、`activeRdp/Vnc/LocalTerminalId`、`activeRemoteFileTabId`、`activeView` 派生；`commandSenderTargetTabByConnectionId` 归第三刀。
- `WorkbenchTab` 联合：`home | ssh | local | rdp | vnc | editor`。`TerminalTab.index` **保留为 `ordinal`**，它是每连接内编号用于标题"终端 N"（12317 行），不是排序位（评审 S4）。`UnifiedWorkbenchTab.kind`（`terminal | file`）与新 union 之间提供映射函数，1920-1930 行改读映射。
- 原子 action：`tabs/activate(tabId)` 一次写 activeTabId + mode + homeActive + lastActiveByConnection；`tabs/open`、`tabs/close(tabId)`（内含相邻激活规则与 `returnHomeWhenWorkspaceEmpty` 逻辑）、`tabs/patch`、`tabs/replaceConnecting`、`tabs/closeByConnection`、`tabs/goHome`。`tabs/move` 预留不实现（当前无拖拽重排）。
- 4 个 ref 镜像 effect：与 reducer state 一起保留在 controller hook 内，异步回调改读 `stateRef.current`；不试图消灭。
- Characterization 同第一刀方法：先机械抽 `useSessionTabsController`，renderHook 锁定：关闭活动 tab 的相邻激活、connecting→terminal 迁移、重连 sessionId 替换、RDP/VNC 失败留存、回退 file tab 规则。

## 4. 第三刀：MultiExec 合并

- 第一刀已建 `multiExec/`（`mode: off|live`、`targets`、`error`）。第三刀扩展 `mode` 加 `"send"`，并吸收 command sender 11 个 useState 与 `selectedCommandTargetKeys`、`commandSenderTargetTabByConnectionId`。
- `buildCommandSenderTargets` 迁入 `selectors.ts`，输入改为 `SessionTabsState`。
- 只合并 owner，执行路径与 UI 入口不变。

## 5. 静态检查脚本影响（评审修订 S5）

以源码文本断言标识符的脚本，改名前先决定"改脚本断言"还是"保留旧名作 selector 变量名"，逐刀登记：

| 刀 | 脚本 | 断言的标识符 |
| --- | --- | --- |
| 二 | `check-session-subtab-memory.mjs` | `activeTabByConnectionId` |
| 二 | `check-local-terminal-warmup-source.mjs` | `localTerminalTabs` |
| 二 | `check-remote-file-editor-source.mjs` | `remoteFileTabs` |
| 三 | `check-command-sender-mvp-source.mjs`、`check-command-sender-active-tab-source.mjs` | `selectedCommandTargetKeys`、`commandSenderInput`、`commandSenderOpen` |

原则：脚本检查的是行为契约，不是变量名；优先改脚本去断言 selector/action 名，并在提交信息里说明。

## 6. 接入与回滚

- 每刀一提交：`refactor(workspace): extract <seam> reducer`；上一刀 CI 全绿再开下一刀。第一刀实际是两个提交：`extract split controller hook`（纯移动 + characterization）→ `replace split controller internals with reducer`。
- 每刀前后记录 `WorkspaceShell.tsx` 行数、`useState` 声明数（基线 78，组件内 77）、`useEffect` 39 + `useLayoutEffect` 4。
- 回滚 `git revert`；不加 feature flag。

## 7. 顺序与风险

- 顺序保持 Split → SessionTabs → MultiExec（评审 S6：Task 05 快照同时需要 `SplitState`，Split 先做无损失且是排练）。第二刀在本修订版 §3 基础上开工，不再以"删 effect"为目标。
- `useMemo` selector 与 `Set` 稳定性写进 state-management.md 作规范条目。
