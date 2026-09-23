import type { SessionPointerState } from "./reducer";

/**
 * 关闭/删除路径的纯决策 —— WF-00B。
 *
 * 每个 `decide*` 逐分支对应 WorkspaceShell @ 45418f3 里一条关闭路径 updater 内的"算下一个活动项"逻辑：
 * - `patch`：原代码用 `set*` 直接写的指针；
 * - `remember` / `forget`：原代码调 `rememberActiveTab` / `forgetActiveConnectionTabs` 的部分；
 * - `followUp`：原代码调 `activateRdpSession` / `activateVncSession` / `activateTerminalTab` /
 *   `activateLocalTerminalTab` 的分支。这些函数除指针外还有 split / 右侧工具 / 命令目标同步等跨 seam 效果，
 *   所以不在这里展开成指针，而是交给 shell 在 reducer 之外执行（见 useSessionTabsController 的 onFollowUp）。
 *
 * 各路径的回退顺序互不一致（终端关闭先 rdp 后 vnc；rdp 关闭先 vnc 后终端），按现状保留；统一属产品变化，归 WF-01。
 * 决策只读 pointers 与 snapshot，不读记忆表。
 */

export interface SessionRef {
  connectionId: string;
  id: string;
}

/** 移除后的集合快照；只带决策需要的字段。 */
export interface CloseSnapshot {
  localTerminalTabs: readonly { id: string }[];
  rdpSessions: readonly SessionRef[];
  remoteFileTabs: readonly SessionRef[];
  terminalTabs: readonly SessionRef[];
  vncSessions: readonly SessionRef[];
}

export type FollowUp =
  | { kind: "local"; tabId: string }
  | { kind: "rdp"; connectionId: string; sessionId: string }
  | { kind: "terminal"; connectionId: string; tabId: string }
  | { kind: "vnc"; connectionId: string; sessionId: string };

export type PointerPatch = Partial<
  Pick<
    SessionPointerState,
    | "activeConnectionId"
    | "activeLocalTerminalTabId"
    | "activeRdpSessionId"
    | "activeRemoteFileTabId"
    | "activeTabId"
    | "activeVncSessionId"
    | "homeActive"
    | "mode"
  >
>;

export interface CloseDecision {
  followUp: FollowUp | null;
  forget?: readonly string[];
  patch: PointerPatch;
  remember?: { connectionId: string; tabId: string };
}

type Pointers = Pick<
  SessionPointerState,
  | "activeConnectionId"
  | "activeLocalTerminalTabId"
  | "activeRdpSessionId"
  | "activeTabId"
  | "activeVncSessionId"
  | "mode"
>;

const HOME_PATCH: PointerPatch = {
  activeConnectionId: null,
  activeTabId: null,
  homeActive: true,
  mode: "home",
};

/** 原 `returnHomeWhenWorkspaceEmpty` 全空分支写的指针。 */
const RETURN_HOME_PATCH: PointerPatch = {
  ...HOME_PATCH,
  activeLocalTerminalTabId: null,
  activeRdpSessionId: null,
  activeVncSessionId: null,
};

function workspaceEmpty(s: CloseSnapshot) {
  return (
    s.terminalTabs.length === 0 &&
    s.remoteFileTabs.length === 0 &&
    s.localTerminalTabs.length === 0 &&
    s.rdpSessions.length === 0 &&
    s.vncSessions.length === 0
  );
}

function rdpFollowUp(session: SessionRef | undefined): FollowUp | null {
  return session ? { kind: "rdp", connectionId: session.connectionId, sessionId: session.id } : null;
}

function vncFollowUp(session: SessionRef | undefined): FollowUp | null {
  return session ? { kind: "vnc", connectionId: session.connectionId, sessionId: session.id } : null;
}

function terminalFollowUp(tab: SessionRef | undefined): FollowUp | null {
  return tab ? { kind: "terminal", connectionId: tab.connectionId, tabId: tab.id } : null;
}

function localFollowUp(tab: { id: string } | undefined): FollowUp | null {
  return tab ? { kind: "local", tabId: tab.id } : null;
}

/** 终端关闭后的通用回退：rdp → vnc → local（原 closeTerminalTabs / closeConnectionSessions / deleteConnection 共用顺序）。 */
function fallbackRdpVncLocal(s: CloseSnapshot): FollowUp | null {
  return rdpFollowUp(s.rdpSessions[0]) ?? vncFollowUp(s.vncSessions[0]) ?? localFollowUp(s.localTerminalTabs[0]);
}

/**
 * `closeTerminalTabs`（原 7201-7290 行）。
 * `closingTabs` 是被关闭的终端 tab（移除前的实体）；`snapshot.terminalTabs` 是移除后的列表。
 */
export function decideTerminalClose(
  pointers: Pointers,
  closingTabs: readonly SessionRef[],
  snapshot: CloseSnapshot,
): CloseDecision {
  const nextTabs = snapshot.terminalTabs;
  const files = snapshot.remoteFileTabs;
  const activeClosingTab = pointers.activeTabId
    ? closingTabs.find((tab) => tab.id === pointers.activeTabId) ?? null
    : null;
  const closingActiveConnectionTab =
    activeClosingTab ??
    (pointers.activeConnectionId
      ? closingTabs.find((tab) => tab.connectionId === pointers.activeConnectionId) ?? null
      : null);

  const patch: PointerPatch = workspaceEmpty(snapshot) ? { ...HOME_PATCH } : {};
  let remember: CloseDecision["remember"];
  let forget: string[] | undefined;
  let followUp: FollowUp | null = null;

  if (activeClosingTab) {
    const nextActiveTab =
      nextTabs.find((tab) => tab.connectionId === activeClosingTab.connectionId) ?? nextTabs[0] ?? null;
    const nextActiveFile =
      files.find((tab) => tab.connectionId === activeClosingTab.connectionId) ?? files[0] ?? null;
    patch.activeTabId = nextActiveTab?.id ?? null;
    patch.activeConnectionId = nextActiveTab?.connectionId ?? nextActiveFile?.connectionId ?? null;
    if (nextActiveFile && !nextActiveTab) {
      patch.activeRemoteFileTabId = nextActiveFile.id;
    }
    if (nextActiveTab) {
      remember = { connectionId: nextActiveTab.connectionId, tabId: nextActiveTab.id };
    } else {
      forget = [activeClosingTab.connectionId];
      if (!nextActiveFile) {
        followUp = fallbackRdpVncLocal(snapshot);
      }
    }
  } else if (
    closingActiveConnectionTab &&
    pointers.activeConnectionId === closingActiveConnectionTab.connectionId &&
    !nextTabs.some((tab) => tab.connectionId === closingActiveConnectionTab.connectionId)
  ) {
    const nextActiveFile =
      files.find((tab) => tab.connectionId === closingActiveConnectionTab.connectionId) ?? files[0] ?? null;
    patch.activeConnectionId = nextTabs[0]?.connectionId ?? nextActiveFile?.connectionId ?? null;
    forget = [closingActiveConnectionTab.connectionId];
    if (!nextTabs[0] && !nextActiveFile) {
      followUp = fallbackRdpVncLocal(snapshot);
    }
  }

  return { followUp, forget, patch, remember };
}

/**
 * `closeConnectionSessions`（原 7362-7411 行，variant = "sessions"）与 `deleteConnection`（原 4017-4061 行，variant = "delete"）。
 * 两者差异：
 * - "sessions" 的文件回退先找非关闭连接的文件；"delete" 直接取第一个；
 * - "sessions" 只要有文件就写 activeRemoteFileTabId；"delete" 只在没有终端时写；
 * - "delete" 在活动连接不是被删连接时，若 activeTabId 已不存在则补 nextTabs[0]。
 * `snapshot` 的 rdp/vnc 若仍含关闭连接的会话，会在这里按连接过滤（原代码对 ref 的防御性过滤）。
 */
export function decideConnectionClose(
  pointers: Pointers,
  closingConnectionIds: readonly string[],
  snapshot: CloseSnapshot,
  variant: "delete" | "sessions",
): CloseDecision {
  const closing = new Set(closingConnectionIds);
  const nextTabs = snapshot.terminalTabs.filter((tab) => !closing.has(tab.connectionId));
  const files = snapshot.remoteFileTabs;
  const rdp = snapshot.rdpSessions.filter((session) => !closing.has(session.connectionId));
  const vnc = snapshot.vncSessions.filter((session) => !closing.has(session.connectionId));
  const local = snapshot.localTerminalTabs;

  const patch: PointerPatch =
    nextTabs.length === 0 && files.length === 0 && local.length === 0 && rdp.length === 0 && vnc.length === 0
      ? { ...HOME_PATCH }
      : {};
  let followUp: FollowUp | null = null;

  if (pointers.activeConnectionId && closing.has(pointers.activeConnectionId)) {
    const nextActiveTab = nextTabs[0] ?? null;
    const nextActiveFile =
      variant === "sessions"
        ? files.find((tab) => !closing.has(tab.connectionId)) ?? files[0] ?? null
        : files[0] ?? null;
    patch.activeTabId = nextActiveTab?.id ?? null;
    patch.activeConnectionId = nextActiveTab?.connectionId ?? nextActiveFile?.connectionId ?? null;
    if (nextActiveFile && (variant === "sessions" || !nextActiveTab)) {
      patch.activeRemoteFileTabId = nextActiveFile.id;
    } else if (!nextActiveTab) {
      followUp = rdpFollowUp(rdp[0]) ?? vncFollowUp(vnc[0]) ?? localFollowUp(local[0]);
    }
  } else if (variant === "delete" && !nextTabs.some((tab) => tab.id === pointers.activeTabId)) {
    patch.activeTabId = nextTabs[0]?.id ?? null;
  }

  return { followUp, patch };
}

/** `closeLocalTerminalTabs`（原 6158-6182 行）。 */
export function decideLocalClose(
  pointers: Pointers,
  closingIds: readonly string[],
  snapshot: CloseSnapshot,
): CloseDecision {
  const closing = new Set(closingIds);
  if (!pointers.activeLocalTerminalTabId || !closing.has(pointers.activeLocalTerminalTabId)) {
    return { followUp: null, patch: {} };
  }
  const nextActive = snapshot.localTerminalTabs[0] ?? null;
  const patch: PointerPatch = { activeLocalTerminalTabId: nextActive?.id ?? null };
  let followUp: FollowUp | null = null;
  if (!nextActive) {
    if (workspaceEmpty(snapshot)) {
      patch.homeActive = true;
      patch.mode = "home";
    } else if (snapshot.terminalTabs.length > 0) {
      patch.mode = "ssh";
    } else if (snapshot.rdpSessions.length > 0) {
      followUp = rdpFollowUp(snapshot.rdpSessions[0]);
    } else if (snapshot.vncSessions.length > 0) {
      followUp = vncFollowUp(snapshot.vncSessions[0]);
    }
  }
  return { followUp, patch };
}

type RemoteKind = "rdp" | "vnc";

/**
 * `removeRdpSessionsLocally`（原 6653-6689 行）与 `removeVncSessionsLocally`（原 7027-7063 行）同形，
 * 只是集合与"另一种远程桌面"互换：rdp 关闭后先找 vnc，vnc 关闭后先找 rdp，再终端、本地，最后 `returnHomeWhenWorkspaceEmpty`。
 */
function decideRemoteDesktopRemove(
  kind: RemoteKind,
  pointers: Pointers,
  closingIds: readonly string[],
  snapshot: CloseSnapshot,
): CloseDecision {
  const closing = new Set(closingIds);
  const activeId = kind === "rdp" ? pointers.activeRdpSessionId : pointers.activeVncSessionId;
  const activeClosed = activeId ? closing.has(activeId) : pointers.mode === kind;
  if (!activeClosed) {
    return { followUp: null, patch: {} };
  }
  const nextSessions = kind === "rdp" ? snapshot.rdpSessions : snapshot.vncSessions;
  const sameConnection = pointers.activeConnectionId
    ? nextSessions.find((session) => session.connectionId === pointers.activeConnectionId) ?? null
    : null;
  const nextSession = sameConnection ?? nextSessions[0] ?? null;
  const idKey = kind === "rdp" ? "activeRdpSessionId" : "activeVncSessionId";
  if (nextSession) {
    return {
      followUp: null,
      patch: {
        [idKey]: nextSession.id,
        activeConnectionId: nextSession.connectionId,
        homeActive: false,
        mode: kind,
      },
    };
  }
  const other = kind === "rdp" ? vncFollowUp(snapshot.vncSessions[0]) : rdpFollowUp(snapshot.rdpSessions[0]);
  const followUp =
    other ?? terminalFollowUp(snapshot.terminalTabs[0]) ?? localFollowUp(snapshot.localTerminalTabs[0]);
  if (followUp) {
    return { followUp, patch: { [idKey]: null } };
  }
  // 原 returnHomeWhenWorkspaceEmpty({ rdpCount: nextSessions.length })：走到这里其它集合已为空，
  // nextSessions 也为空（否则上面已选中），因此必然回首页并清五个指针。
  return { followUp: null, patch: { ...RETURN_HOME_PATCH, [idKey]: null } };
}

export function decideRdpRemove(pointers: Pointers, closingIds: readonly string[], snapshot: CloseSnapshot) {
  return decideRemoteDesktopRemove("rdp", pointers, closingIds, snapshot);
}

export function decideVncRemove(pointers: Pointers, closingIds: readonly string[], snapshot: CloseSnapshot) {
  return decideRemoteDesktopRemove("vnc", pointers, closingIds, snapshot);
}
