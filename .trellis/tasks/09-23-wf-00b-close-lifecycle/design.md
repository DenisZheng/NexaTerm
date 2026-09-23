# WF-00B 设计：关闭/删除路径的纯决策与编排接入

> 2026-09-23。依据：`prd.md`、Task 04 design §3（指针靠多 setter 序列而非 effect 同步）、`state-management.md` reducer 约定、`WorkspaceShell.tsx` @ `45418f3` 的 6 条关闭路径实读。

## 1. 现状（实读 45418f3）

六条关闭/删除路径共用一个形状：

1. **updater 外**：`stopTerminalWarmupCapture`、`closeRuntimeTerminalSessions`、`removeDirectoryState`、`invalidateDockerExecConnection`、`rdpCloseSession` / `vncCloseSession`、`clearRemoteFileSessionStateForConnections`。这部分已经是"外层执行清理"，保留。
2. **updater 内**（问题所在）：`setTerminalTabs((tabs) => { … nextTabs …; terminalTabsRef.current = nextTabs; <算下一个活动项>; <调 set* 指针 setter 或 activateRdp/Vnc/LocalTerminal*>; return nextTabs; })`。指针 setter 是 dispatch 的过渡封装，`activate*` 还会 `setRightTool` / `setSettingsSectionRequest` / split setter / `syncCommandSenderTargetTab`——全是 updater 内的外部副作用。

| 路径 | 行 | 读取的活动指针来源 | 回退顺序 |
| --- | --- | --- | --- |
| `closeTerminalTabs` | 7193 | 闭包 `activeTabId` / `activeConnectionId`；文件用闭包 `remoteFileTabs` | 同连接终端 → 任一终端 → 同连接文件 → 任一文件 → rdp → vnc → local；全空回首页 |
| `closeConnectionSessions` | 7326 | 闭包 `activeConnectionId`；文件用 `remainingRemoteFileTabs` | 任一终端 → 非关闭连接的文件 → rdp → vnc → local；全空回首页 |
| `deleteConnection` | 3997 | 同上 | 同 `closeConnectionSessions`，但 `!nextTabs.some(id===activeTabId)` 时只补 `activeTabId` |
| `closeLocalTerminalTabs` | 6152 | 闭包 `activeLocalTerminalTabId` | 下一个 local → 全空回首页 → 有 ssh 则只切 mode=ssh（不选 tab）→ rdp → vnc |
| `removeRdpSessionsLocally` | 6647 | 闭包 `activeRdpSessionId` / `mode` | 同连接 rdp → 任一 rdp → vnc → 终端 → local → `returnHomeIfEmpty` |
| `removeVncSessionsLocally` | 7021 | 同上（vnc） | 同连接 vnc → 任一 vnc → rdp → 终端 → local → `returnHomeIfEmpty` |

回退顺序**各路径不一致**（终端关闭先 rdp 后 vnc；rdp 关闭先 vnc 后终端），本包按现状保留，不统一；统一属产品变化，归 WF-01 实例投影时再议。

指针读闭包而非 ref：在 `deleteConnection` 里先 `closeRdpSessions`（可能已改活动指针）再做终端关闭决策时，闭包值是过期的。见 §5 接受的差异。

## 2. 目标形状

```
src/features/workspace/sessionTabs/
  closeDecision.ts        纯函数：decide<Kind>Close(pointers, snapshot) → { patch, followUp }
  closeDecision.test.ts   每条路径的场景表（node 环境）
  actions.ts              + tabs/closeTerminals | closeConnections | closeLocalTerminals | removeRdp | removeVnc
                          + tabs/clearActiveFile | tabs/focusPaneBinding | tabs/startConnecting | tabs/openSettings | tabs/closeSettings
                          + tabs/consumeFollowUp
                          − 八个 tabs/set*（保留 tabs/setActiveRemoteFileTabId 一个，见 §4）
  reducer.ts              SessionPointerState + followUp: FollowUp | null
  useSessionTabsController.ts  新增 onFollowUp 回调输入；effect 消费 followUp
```

### 2.1 决策函数

```ts
interface CloseSnapshot {
  /** 移除后的集合（只带决策需要的字段）。 */
  terminalTabs: readonly { id: string; connectionId: string }[];
  remoteFileTabs: readonly { id: string; connectionId: string }[];
  localTerminalTabs: readonly { id: string }[];
  rdpSessions: readonly { id: string; connectionId: string }[];
  vncSessions: readonly { id: string; connectionId: string }[];
}
type FollowUp =
  | { kind: "terminal"; tabId: string; connectionId: string }
  | { kind: "local"; tabId: string }
  | { kind: "rdp"; sessionId: string; connectionId: string }
  | { kind: "vnc"; sessionId: string; connectionId: string };
interface CloseDecision { patch: Partial<SessionPointerState>; forget?: string[]; remember?: { connectionId; tabId }; followUp: FollowUp | null }

decideTerminalClose(pointers, closingTabs: {id, connectionId}[], snapshot)
decideConnectionClose(pointers, closingConnectionIds, snapshot)   // deleteConnection 与 closeConnectionSessions 共用，后者的 remainingFileTabs 已在 snapshot 里
decideLocalClose(pointers, closingIds, snapshot)
decideRdpRemove(pointers, closingIds, snapshot)
decideVncRemove(pointers, closingIds, snapshot)
```

- `patch` 只含当前代码用 `set*` 直接写的指针；当前代码调 `activateRdpSession(x)` 等的分支变成 `followUp`，**不在决策里展开成指针**——因为 `activate*` 除指针外还有 split / 右侧工具 / 命令目标同步等跨 seam 效果，必须由 shell 执行，且 `activateTerminalTab` 会先判分屏 pane 再决定走 `activateSplitHost` 还是 `activateTerminal`，展开会复制这段判断。
- 决策只读 `pointers` 与 `snapshot`，不读记忆表（现有六条路径都不读 `activeTabByConnectionId`）。

### 2.2 reducer

- 新增 `followUp: FollowUp | null` 字段（同 split reducer 的 `collapsedTo` 模式）。`tabs/close*` / `tabs/remove*` 各 case：`const d = decideX(state, …)`；应用 `patch`、`forget`、`remember`；`followUp = d.followUp`。
- `tabs/consumeFollowUp`：置 null。
- 决策**在 reducer 内用 reducer 自己的 state**，不再读 shell 闭包。

### 2.3 controller

```ts
inputs: { defaultRemoteFileOpenMode, onFollowUp?: (f: FollowUp) => void }
useEffect(() => { if (!pointers.followUp) return; onFollowUpRef.current?.(pointers.followUp); dispatch({ type: "tabs/consumeFollowUp" }); }, [pointers.followUp]);
```

shell 的 `onFollowUp` 按 kind 调用现有 `activateTerminalTab(tab)` / `activateLocalTerminalTab(tab)` / `activateRdpSession(session)` / `activateVncSession(session)`（用 `*Ref.current` 按 id 找实体；实体已不存在则忽略）。这些函数内部的 dispatch 对 reducer 是幂等的（无变化返回原引用）。

### 2.4 shell 六条路径改写模板

```ts
function closeTerminalTabs(tabIds) {
  const closing = new Set(tabIds);
  const closingTabs = terminalTabsRef.current.filter((t) => closing.has(t.id));
  // 1. 外部清理（不变）
  closingTabs.forEach((t) => stopTerminalWarmupCapture(t.id));
  closeRuntimeTerminalSessions(closingTabs);
  setTerminalDirectories((d) => removeDirectoryState(d, closingTabs.map((t) => t.id)));
  // 2. 集合更新：从 ref 算，值式 set，不再 updater
  const nextTabs = terminalTabsRef.current.filter((t) => !closing.has(t.id));
  finalClosedConnectionIds(closingTabs, nextTabs).forEach(invalidateDockerExecConnection);
  terminalTabsRef.current = nextTabs;
  setTerminalTabs(nextTabs);
  // 3. 一次决策
  dispatchTabs({ type: "tabs/closeTerminals", closingTabs: pick(closingTabs), snapshot: snapshotFromRefs({ terminalTabs: nextTabs, remoteFileTabs }) });
}
```

`snapshotFromRefs` 从五个 `*Ref.current` 组装，只挑 id/connectionId。`closeTerminalTabs` 的文件列表按现状用渲染态 `remoteFileTabs`，`closeConnectionSessions` / `deleteConnection` 用 `clearRemoteFileSessionStateForConnections` 的返回值——差异保留。

### 2.5 其余单值 setter 调用点

| 调用点 | 现状 | 新 action |
| --- | --- | --- |
| `focusTerminalSplitPane` | `setActiveTabId(tab.id)` 或 `setActiveLocalTerminalTabId(tab.id)` + `syncCommandSenderTargetTab` | `tabs/focusPaneBinding { kind: "ssh" \| "local", tabId }`；命令目标同步留在 shell |
| `startConnectionStep` | mode=ssh、homeActive=false、connection、tab、remember（**不写 activeView**） | `tabs/startConnecting { connectionId, tabId }`，语义与 `activateTerminal` 差一个 activeView，单独 case |
| `openSettingsSection` / `returnFromSettings` | `setActiveView` | `tabs/openSettings` / `tabs/closeSettings` |
| `activateRemoteFileFallbackAfterRemoval` 2744、`closeRemoteFileTabsNow` 2967 | `setActiveRemoteFileTabId(null)` | `tabs/clearActiveFile` |
| 3206（重命名后重指文件 tab） | `setActiveRemoteFileTabId(id)` | 保留 `tabs/setActiveRemoteFileTabId` 过渡 action（唯一保留者，文档标注；文件 tab 归 WF-03） |

## 3. 静态检查脚本

| 脚本 | 现断言 | 处置 |
| --- | --- | --- |
| `check-workspace-empty-home-source.mjs` | `returnHomeWhenWorkspaceEmpty` 函数体内含 `setActiveConnectionId(null) … setHomeActive(true)` 序列，以及 `removeRdp/VncSessionsLocally` 里的 `returnHomeWhenWorkspaceEmpty({ rdpCount })` | 2c-2a 后该函数已是 dispatch，此断言疑似已漂移（开工第 0 步先跑）。改为断言 reducer `tabs/returnHomeIfEmpty` 存在且 `decideRdpRemove`/`decideVncRemove` 的全空分支落到回首页 |
| `check-workspace-ssh-activation-source.mjs` | `startConnectionStep` 内 `setActiveWorkspaceMode("ssh")` 早于 `setActiveTabId(tab.id)` | 改为断言 `tabs/startConnecting` dispatch，且 reducer 该 case 写 `mode: "ssh"` |
| `check-session-subtab-memory.mjs`、`check-local-terminal-warmup-source.mjs`、`check-remote-file-editor-source.mjs` | 标识符仍存在 | 不动 |

原则同 Task 04 design §5：脚本检查行为契约，不检查变量名。

## 4. 过渡 setter 清理

八个删除：`setActiveConnectionId`、`setActiveTabId`、`setActiveRdpSessionId`、`setActiveVncSessionId`、`setActiveLocalTerminalTabId`、`setActiveView`、`setActiveWorkspaceMode`、`setHomeActive`。删除前 `grep -n 'set<Name>(' WorkspaceShell.tsx` 必须为 0 命中；有命中就不删并在 implement.md 记录调用点。`setActiveRemoteFileTabId` 保留一个调用点（3206），controller 内标 `@deprecated`。

## 5. 接受的行为差异（需在 implement.md 结果记录复述）

1. 回退激活（`activate*`）从 updater 内同步调用改为 reducer `followUp` → controller effect → shell 调用：晚一个 effect tick，仍在同一提交前，与 1b 的 `collapsedTo` 同类。
2. 决策读 reducer 当前指针而非 shell 闭包。可观察差异只在 `deleteConnection` 先关掉该连接的活动 RDP/VNC 再关终端时：旧代码用过期的 `activeConnectionId`，新代码用已被 RDP 回退改写的值。两种结果都落在"该连接被删除后选一个合理的活动项"，新值更一致；写一条测试固定新行为。
3. 集合从 `updater` 改为"ref 计算 + 值式 set"：ref 已由 28 处写入保证同步（Task 04 2b 记录），无可观察差异。

不接受：改变任何回退顺序；合并五类集合；删除 `*Ref` 通道。

## 6. 测试

- `closeDecision.test.ts`（node）：每个 decide* 覆盖 PRD 六场景——关闭活动 / 非活动 / 最后一个 / 同连接多实例只关一个 / 分屏 pane 内的 tab（决策与非分屏相同，pane 收缩由 split reducer 负责）/ 连接中（`type: "connecting"`）tab；加"全空回首页"与"回退顺序"表驱动用例。
- `reducer.test.ts`：新 action 各一例 + `followUp` 设置与 `consumeFollowUp` 清除 + 无变化同引用。
- `useSessionTabsController.test.tsx`：`onFollowUp` 恰好调用一次并清除；现有 12 例一字不改仍绿。
- 保留：`runConnectionStep` 的 `connectingTabExists()` 与晚返回 session 关闭不在本包改动，A01 由真实窗口冒烟 + 现有 `check-terminal-startup-output-source.mjs`（若覆盖）证明；无法单测 shell 闭包。

## 7. 提交切分与回滚

1. `refactor(workspace): add close decision selectors and session close actions` — 只加纯函数、action、reducer case、controller followUp、测试；shell 不变。可独立 revert。
2. `refactor(workspace): route session close paths through close actions` — 六条路径 + 五个单值 setter 调用点改写，删八个过渡 setter，更新两个检查脚本。可独立 revert 回提交 1。

每步：`pnpm run check`、`pnpm test`、`pnpm run build`、`node scripts/check-startup-module-boundary-source.mjs`、五个相关 `check-*.mjs`。
