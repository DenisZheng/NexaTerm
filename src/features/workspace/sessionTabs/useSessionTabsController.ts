import { useCallback, useEffect, useReducer, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { RemoteFileEditorTab } from "../../editor/remoteFileEditorTypes";
import type { RemoteFileOpenMode } from "../../settings/settingsTypes";
import type { LocalTerminalTab } from "../../terminal/localTerminalTypes";

import type { SessionTabsAction } from "./actions";
import { initialSessionPointerState, sessionPointerReducer } from "./reducer";
import type { RdpSessionTab, UnifiedWorkbenchTab, VncSessionTab, WorkspaceMode } from "./types";

export type { SessionTabsAction } from "./actions";

/**
 * 会话 tab controller 需要从外部读取的输入。
 */
export interface SessionTabsControllerInputs {
  /** 新连接首次打开远程文件时的默认布局；来自设置。 */
  defaultRemoteFileOpenMode: RemoteFileOpenMode;
}

function resolve<T>(next: SetStateAction<T>, current: T): T {
  return typeof next === "function" ? (next as (value: T) => T)(current) : next;
}

/**
 * 会话 tab 状态 controller —— Task 04 第二刀 2c-1。
 *
 * 指针、模式、首页记忆位与两张记忆表由 `sessionPointerReducer` 持有；五个会话集合与文件布局记忆
 * 仍是 `useState`（集合与 WorkspaceShell 里的 `*Ref` 同步写入耦合，待 ref 通道消灭后再迁）。
 *
 * 对外仍暴露 2b 的全部 setter 名作为过渡层（内部转 dispatch），另暴露 `dispatchTabs` 供 2c-2
 * 把 WorkspaceShell 的激活函数改为意图型 action。
 */
export function useSessionTabsController<TTerminalTab extends { connectionId: string; id: string }>(
  inputs: SessionTabsControllerInputs,
) {
  const { defaultRemoteFileOpenMode } = inputs;

  const [pointers, dispatchTabs] = useReducer(sessionPointerReducer, {
    ...initialSessionPointerState,
    homeActive: true,
  });
  const [terminalTabs, setTerminalTabs] = useState<TTerminalTab[]>([]);
  const [rdpSessions, setRdpSessions] = useState<RdpSessionTab[]>([]);
  const [vncSessions, setVncSessions] = useState<VncSessionTab[]>([]);
  const [localTerminalTabs, setLocalTerminalTabs] = useState<LocalTerminalTab[]>([]);
  const [remoteFileTabs, setRemoteFileTabs] = useState<RemoteFileEditorTab[]>([]);
  const [terminalFileLayoutByConnectionId, setTerminalFileLayoutByConnectionId] =
    useState<Record<string, RemoteFileOpenMode>>({});

  // 归一 1：文件布局记忆只保留仍有终端或文件 tab 的连接；有文件 tab 但无记忆的连接补默认布局。
  useEffect(() => {
    setTerminalFileLayoutByConnectionId((layouts) => {
      const liveConnectionIds = new Set([
        ...terminalTabs.map((tab) => tab.connectionId),
        ...remoteFileTabs.map((tab) => tab.connectionId),
      ]);
      const fileConnectionIds = new Set(remoteFileTabs.map((tab) => tab.connectionId));
      let changed = false;
      const nextLayouts: Record<string, RemoteFileOpenMode> = {};

      Object.entries(layouts).forEach(([connectionId, mode]) => {
        if (!liveConnectionIds.has(connectionId)) {
          changed = true;
          return;
        }
        nextLayouts[connectionId] = mode;
      });

      fileConnectionIds.forEach((connectionId) => {
        if (!nextLayouts[connectionId]) {
          nextLayouts[connectionId] = defaultRemoteFileOpenMode;
          changed = true;
        }
      });

      return changed ? nextLayouts : layouts;
    });
  }, [defaultRemoteFileOpenMode, remoteFileTabs, terminalTabs]);

  // 归一 2：统一 tab 记忆失效时回退（逻辑在 reducer 的 normalizeUnified 内）。
  useEffect(() => {
    dispatchTabs({ type: "tabs/normalizeUnified", fileTabs: remoteFileTabs, terminalTabs });
  }, [remoteFileTabs, terminalTabs]);

  // ---- 过渡层：与 2b 同名的 setter，内部转 dispatch。2c-2 替换调用点后逐个删除。 ----
  const setActiveConnectionId = useCallback(
    (value: string | null) => dispatchTabs({ type: "tabs/setActiveConnectionId", value }),
    [],
  );
  const setActiveTabId = useCallback(
    (value: string | null) => dispatchTabs({ type: "tabs/setActiveTabId", value }),
    [],
  );
  const setActiveRdpSessionId = useCallback(
    (value: string | null) => dispatchTabs({ type: "tabs/setActiveRdpSessionId", value }),
    [],
  );
  const setActiveVncSessionId = useCallback(
    (value: string | null) => dispatchTabs({ type: "tabs/setActiveVncSessionId", value }),
    [],
  );
  const setActiveLocalTerminalTabId = useCallback(
    (value: string | null) => dispatchTabs({ type: "tabs/setActiveLocalTerminalTabId", value }),
    [],
  );
  const setActiveRemoteFileTabId = useCallback(
    (value: string | null) => dispatchTabs({ type: "tabs/setActiveRemoteFileTabId", value }),
    [],
  );
  const setActiveView = useCallback(
    (value: "workspace" | "settings") => dispatchTabs({ type: "tabs/setActiveView", value }),
    [],
  );
  const setActiveWorkspaceMode = useCallback(
    (value: WorkspaceMode) => dispatchTabs({ type: "tabs/setMode", value }),
    [],
  );
  const setHomeActive = useCallback(
    (value: boolean) => dispatchTabs({ type: "tabs/setHomeActive", value }),
    [],
  );
  // 两张记忆表的旧 setter 接受 updater 函数（调用点在 rememberActiveTab 等处）。
  // 过渡期在这里对当前值求值再整体替换；2c-2 把这些调用点改为 remember*/forget* action 后删除。
  const pointersRef = { current: pointers };
  const setActiveTabByConnectionId: Dispatch<SetStateAction<Record<string, string>>> = useCallback(
    (next) => {
      const value = resolve(next, pointersRef.current.activeTabByConnectionId);
      if (value === pointersRef.current.activeTabByConnectionId) {
        return;
      }
      const keep = new Set(Object.keys(value));
      const removed = Object.keys(pointersRef.current.activeTabByConnectionId).filter((k) => !keep.has(k));
      if (removed.length > 0) {
        dispatchTabs({ type: "tabs/forgetConnections", connectionIds: removed });
      }
      for (const [connectionId, tabId] of Object.entries(value)) {
        dispatchTabs({ type: "tabs/rememberActive", connectionId, tabId });
      }
    },
    // pointersRef 每次渲染重建，闭包内读的是最新 pointers。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pointers.activeTabByConnectionId],
  );
  const setActiveUnifiedTabByConnectionId: Dispatch<SetStateAction<Record<string, UnifiedWorkbenchTab>>> =
    useCallback(
      (next) => {
        const value = resolve(next, pointersRef.current.activeUnifiedTabByConnectionId);
        if (value === pointersRef.current.activeUnifiedTabByConnectionId) {
          return;
        }
        for (const [connectionId, tab] of Object.entries(value)) {
          dispatchTabs({ type: "tabs/rememberUnified", connectionId, tab });
        }
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [pointers.activeUnifiedTabByConnectionId],
    );

  return {
    activeConnectionId: pointers.activeConnectionId,
    activeLocalTerminalTabId: pointers.activeLocalTerminalTabId,
    activeRdpSessionId: pointers.activeRdpSessionId,
    activeRemoteFileTabId: pointers.activeRemoteFileTabId,
    activeTabByConnectionId: pointers.activeTabByConnectionId,
    activeTabId: pointers.activeTabId,
    activeUnifiedTabByConnectionId: pointers.activeUnifiedTabByConnectionId,
    activeView: pointers.activeView,
    activeVncSessionId: pointers.activeVncSessionId,
    activeWorkspaceMode: pointers.mode,
    dispatchTabs: dispatchTabs as Dispatch<SessionTabsAction>,
    homeActive: pointers.homeActive,
    localTerminalTabs,
    rdpSessions,
    remoteFileTabs,
    setActiveConnectionId,
    setActiveLocalTerminalTabId,
    setActiveRdpSessionId,
    setActiveRemoteFileTabId,
    setActiveTabByConnectionId,
    setActiveTabId,
    setActiveUnifiedTabByConnectionId,
    setActiveView,
    setActiveVncSessionId,
    setActiveWorkspaceMode,
    setHomeActive,
    setLocalTerminalTabs,
    setRdpSessions,
    setRemoteFileTabs,
    setTerminalFileLayoutByConnectionId,
    setTerminalTabs,
    setVncSessions,
    terminalFileLayoutByConnectionId,
    terminalTabs,
    vncSessions,
  };
}
