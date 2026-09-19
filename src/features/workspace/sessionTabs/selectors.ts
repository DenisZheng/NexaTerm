import type { TerminalPaneBinding } from "../../terminal/terminalSplitLayout";

import type { ConnectionSessionSummary, WorkspaceMode } from "./types";

/** 按 connectionId 分组；保持原插入顺序。返回新 Map，组件内需 useMemo。 */
export function groupByConnection<T extends { connectionId: string }>(items: readonly T[]) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(item.connectionId) || [];
    group.push(item);
    groups.set(item.connectionId, group);
  }
  return groups;
}

/**
 * 每个连接下的会话摘要（终端 + RDP + VNC 合并）。
 * 合并顺序：终端 → RDP → VNC，与 WorkspaceShell 原实现一致。
 */
export function selectConnectionSessions(
  terminalsByConnection: ReadonlyMap<string, readonly { id: string }[]>,
  rdpByConnection: ReadonlyMap<string, readonly { id: string }[]>,
  vncByConnection: ReadonlyMap<string, readonly { id: string }[]>,
): ConnectionSessionSummary[] {
  const sessions = new Map<string, ConnectionSessionSummary>();
  const merge = (groups: ReadonlyMap<string, readonly { id: string }[]>) => {
    groups.forEach((tabs, connectionId) => {
      const existing = sessions.get(connectionId);
      sessions.set(connectionId, {
        connectionId,
        tabs: existing ? [...existing.tabs, ...tabs] : [...tabs],
      });
    });
  };
  merge(terminalsByConnection);
  merge(rdpByConnection);
  merge(vncByConnection);
  return Array.from(sessions.values());
}

/**
 * 活动 RDP/VNC 会话：优先 activeSessionId（且必须属于 activeConnectionId），否则该连接下第一个。
 * 与原 WorkspaceShell 的 `activeRdpSession` / `activeVncSession` 表达式等价。
 */
export function selectActiveSession<T extends { connectionId: string; id: string }>(
  sessions: readonly T[],
  sessionsByConnection: ReadonlyMap<string, readonly T[]>,
  activeSessionId: string | null,
  activeConnectionId: string | null,
): T | null {
  const byId = activeSessionId
    ? sessions.find(
        (session) =>
          session.id === activeSessionId &&
          (!activeConnectionId || session.connectionId === activeConnectionId),
      ) || null
    : null;
  if (byId) {
    return byId;
  }
  const connectionSessions = activeConnectionId
    ? sessionsByConnection.get(activeConnectionId) || []
    : [];
  return connectionSessions[0] || null;
}

export function selectActiveTerminalTab<T extends { id: string }>(
  tabs: readonly T[],
  activeTabId: string | null,
): T | null {
  return activeTabId ? tabs.find((tab) => tab.id === activeTabId) || null : null;
}

/** 已建立会话的活动终端 tab（type=terminal 且有 sessionId），否则 null。 */
export function selectActiveConnectedTerminalTab<
  T extends { sessionId?: string; type: "connecting" | "terminal" },
>(activeTab: T | null): T | null {
  return activeTab?.type === "terminal" && activeTab.sessionId ? activeTab : null;
}

/** 当前工作区模式下“活动终端”对应的分屏 binding。 */
export function selectActiveTerminalSplitBinding(
  mode: WorkspaceMode,
  activeTerminalTab: { id: string } | null,
  activeLocalTerminalTab: { id: string } | null,
): TerminalPaneBinding | null {
  if (mode === "local" && activeLocalTerminalTab) {
    return { kind: "local", tabId: activeLocalTerminalTab.id };
  }
  if (mode === "ssh" && activeTerminalTab) {
    return { kind: "ssh", tabId: activeTerminalTab.id };
  }
  return null;
}
