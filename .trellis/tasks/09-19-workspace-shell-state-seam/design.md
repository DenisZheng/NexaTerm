# WorkspaceShell 状态 seam 设计

## 1. 总体形状

```
src/features/workspace/
  split/        reducer.ts  actions.ts  selectors.ts  reducer.test.ts   ← 第一刀
  sessionTabs/  reducer.ts  actions.ts  selectors.ts  reducer.test.ts   ← 第二刀
  multiExec/    reducer.ts  actions.ts  selectors.ts  reducer.test.ts   ← 第三刀
```

- `reducer.ts`：`export function <seam>Reducer(state, action): State` 与 `initial<Seam>State`；纯函数，不可变更新，未知 action 返回原引用。
- `actions.ts`：`type <Seam>Action = { type: "split/…", … }` 判别联合，加同名构造器；action 名用 `seam/动词` 前缀，便于日志与测试检索。
- `selectors.ts`：派生值（如"当前 pane 的 binding"、"活动 SSH tab 的 connectionId"），纯函数，供 WorkspaceShell 的 `useMemo` 调用；派生值一律不再单独存 state。
- WorkspaceShell 内：`const [split, dispatchSplit] = useReducer(splitReducer, initialSplitState)`；原 `setX(...)` 调用点逐个改 `dispatchSplit(action)`；`useEffect` 副作用保持原位置，只把读写目标换成 reducer state。
- 新目录不进首屏 chunk 之外的任何懒加载模块：reducer 只被 WorkspaceShell 引用，而 WorkspaceShell 本身已是懒加载 chunk，startup boundary 不变。

## 2. 第一刀：Split

**实际清单**（比 PRD 摸底多 3 个，2026-09-19 核对 `WorkspaceShell.tsx` 1004-1022 行）：

| 现 useState | 目标字段 | setter 调用点 |
| --- | --- | --- |
| `terminalSplitLayout` | `layout: TerminalSplitNode \| null` | 18 |
| `terminalSplitHost` | `host: TerminalSplitHost \| null` | 7 |
| `terminalSplitAnchorIndex` | `anchorIndex: number` | 3 |
| `terminalSplitTabActive` | `tabActive: boolean` | 11 |
| `focusedTerminalPaneId` | `focusedPaneId: string \| null` | 14 |
| `terminalSplitLayoutRevision` | `revision: number` | 3 |
| `terminalSplitAutoCreateSameSession` | `autoCreateSameSession: boolean` | — |
| `terminalSplitPickerOpenRequest` | `pickerRequest: { key, paneId } \| null` | — |
| `terminalSplitSyncEnabled` | `sync.enabled: boolean` | 12 |
| `terminalSplitSyncParticipantKeys` | `sync.participantKeys: ReadonlySet<string>` | — |
| `terminalSplitSyncError` | `sync.error: string \| null` | 9 |
| `terminalSplitCloseConfirmOpen` | `closeConfirmOpen: boolean` | 3 |

不动：`terminalClearRequest`（属终端面板指令，非布局状态）、两个 picker ref、`editorTerminalSplitPercent`（属编辑器/终端分栏，非 pane split）。

Action 按业务意图而非 setter 命名，多个 setter 连改的地方合成一个 action，这是 reducer 相对 useState 的实际收益：

- `split/open`（host, layout, anchorIndex）、`split/close`、`split/replaceLayout`（layout，revision 自增）、`split/updateRatio`、`split/focusPane`、`split/setTabActive`、`split/requestPicker` / `split/clearPicker`、`split/setAutoCreateSameSession`、`split/sync.enable` / `split/sync.disable` / `split/sync.setParticipants` / `split/sync.fail`、`split/confirmClose.open` / `split/confirmClose.close`、`split/bindingsRemoved`（调用 `removeTerminalSplitBindings`，结果为 null 时连带清 host/focus/sync）。

Reducer 内部复用 `terminalSplitLayout.ts` 的纯函数，不复制布局逻辑。`sync.*` 在第三刀整体移交 MultiExec reducer，第一刀先放在 split 下是为了不让 sync 状态在两刀之间无主。

**Characterization**：先在 `src/features/workspace/split/reducer.test.ts` 用"从现有 setter 序列翻译出的 action 序列"写用例：打开两 pane → 移动 binding → 关闭一 pane → 布局收缩为 leaf 且 host 保留；关闭最后 pane → host/focus/sync 全清；sync 开启后移除参与者 binding → participantKeys 同步收缩；`revision` 只在 layout 变化时自增。

## 3. 第二刀：SessionTabs

目标类型：

```ts
type WorkbenchTab =
  | { kind: "home"; id: "home" }
  | { kind: "ssh"; id; connectionId; title; status; sessionId?; requestId?; connectionStep?; error?; warmupOutput }
  | { kind: "local"; id; profileId; title; status; … }
  | { kind: "rdp"; id; connectionId; title; status; … }
  | { kind: "vnc"; id; connectionId; title; status; … }
  | { kind: "editor"; id; ownerTabId?; path; … };   // remoteFileTabs 迁入，ownerTabId 本任务不填
interface SessionTabsState { tabs: WorkbenchTab[]; activeTabId: string; }
```

- 五个集合合并为 `tabs`，顺序即 tab 栏顺序（现 `index` 字段退役）。
- 六个 active 指针只保留 `activeTabId`；`activeConnectionId`、`activeRdpSessionId`、`activeVncSessionId`、`activeLocalTerminalTabId`、`activeRemoteFileTabId`、`activeTabByConnectionId` 全部改为 `selectors.ts` 派生。现有 13 个同步 effect 中，只做"指针互相对齐"的直接删除，做真实副作用（连接、事件订阅、聚焦）的保留并改读 selector。
- Action：`tabs/open`、`tabs/close`、`tabs/activate`、`tabs/move`、`tabs/patch`（按 id 局部更新 status/title/error）、`tabs/replaceConnecting`（connecting → terminal 的 type 迁移）、`tabs/closeByConnection`。
- 这是三刀里唯一可能改变时序的一刀（删同步 effect 会去掉一次额外渲染）；characterization 要覆盖：连接中 tab 关闭、重连后 sessionId 替换、关闭活动 tab 后激活相邻哪一个、RDP/VNC 会话失败后 tab 留存与否。这些行为以**现有实现**为准，测试记录现状而不是改进它。

## 4. 第三刀：MultiExec

```ts
interface MultiExecState {
  mode: "off" | "live" | "send";
  targets: ReadonlySet<string>;           // WorkbenchTab id（ssh/local）
  input: string;
  history: CommandHistoryEntry[];
  delivery: Record<string, CommandSenderDeliveryStatus>;
  panelOpen: boolean;
  snippets: { items; localGroups; loading; error; dialog; draft; formError; selectedId; clearHistoryOpen };
}
```

- 吸收 command sender 全部 11 个 useState 与 `selectedCommandTargetKeys`；从 Split reducer 接走 `sync.*`：`mode: "live"` 即原 `syncEnabled`，`targets` 即原 `participantKeys`。
- `buildCommandSenderTargets` 移到 `selectors.ts`，输入改为 SessionTabs 的 `tabs` + `activeTabId`（这也是要求第二刀先完成的原因）。
- 本任务只合并 owner；Live Input 与 Command Send 的实际执行路径（terminal write vs. send command）仍走各自现有函数，UI 入口不变。

## 5. 接入与回滚

- 每刀一个提交，信息格式 `refactor(workspace): extract <seam> reducer`；上一刀 CI 全绿才开下一刀。
- 每刀前后记录 `WorkspaceShell.tsx` 行数、`useState` / `useEffect` 计数，写进 implement.md。
- 回滚：`git revert` 该刀提交即可；reducer 目录无外部消费者，revert 无残留。
- 不加 feature flag：reducer 替换 useState 是同步等价改写，双路径并存反而制造双写。

## 6. 风险

- 第二刀删除同步 effect 可能改变某些"下一帧才对齐"的边界行为，characterization 与手动冒烟（开/关/重连 SSH、RDP、本地终端各一次）双保险。
- `useReducer` 的 dispatch 引用稳定，但 selector 结果需 `useMemo`，否则传给子组件的对象每次新建会触发 xterm 面板多余重渲染；每刀跑一次 `check-startup-module-boundary-source.mjs` 与 build 体积对比。
- 第三刀把 `sync` 从 split 挪走会再改一次 TerminalSplitSurface 的 props 来源；提前在第一刀把 sync 读写集中到两三个调用点，减少第三刀的触面。
