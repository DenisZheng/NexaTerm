import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { Dispatch } from "react";

import type { RemoteFileEditorTab } from "../../editor/remoteFileEditorTypes";
import type { RemoteFileOpenMode } from "../../settings/settingsTypes";
import type { LocalTerminalTab } from "../../terminal/localTerminalTypes";

import type { SessionTabsAction } from "./actions";
import type { FollowUp } from "./closeDecision";
import { initialSessionPointerState, sessionPointerReducer } from "./reducer";
import type { RdpSessionTab, VncSessionTab, WorkspaceMode } from "./types";

export type { SessionTabsAction } from "./actions";
export type { CloseSnapshot, FollowUp, SessionRef } from "./closeDecision";

/**
 * 会话 tab controller 需要从外部读取的输入。
 */
export interface SessionTabsControllerInputs {
  /** 新连接首次打开远程文件时的默认布局；来自设置。 */
  defaultRemoteFileOpenMode: RemoteFileOpenMode;
  /**
   * 关闭/删除决策要求的跨 seam 激活（原 updater 内的 activateRdpSession / activateVncSession /
   * activateTerminalTab / activateLocalTerminalTab）。在 reducer 提交后的 effect 中调用一次；
   * 实体已不存在时由 shell 自行忽略。经 ref 读取，不进 effect 依赖。
   */
  onFollowUp?: (followUp: FollowUp) => void;
}

/**
 * 会话 tab 状态 controller —— Task 04 第二刀 2c-1 + WF-00B。
 *
 * 指针、模式、首页记忆位与两张记忆表由 `sessionPointerReducer` 持有；五个会话集合与文件布局记忆
 * 仍是 `useState`（集合与 WorkspaceShell 里的 `*Ref` 同步写入耦合，待 ref 通道消灭后再迁）。
 *
 * 对外暴露 `dispatchTabs`（意图型 action）以及九个单值 setter 过渡层（内部转 dispatch）；
 * 两张记忆表只能经 remember / forget 系列 action 修改。过渡层在 WF-00B 关闭路径改完后删除。
 */
export function useSessionTabsController<TTerminalTab extends { connectionId: string; id: string }>(
  inputs: SessionTabsControllerInputs,
) {
  const { defaultRemoteFileOpenMode, onFollowUp } = inputs;

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

  // 跨 seam 回调走 ref，与 split controller 的 onCollapseToStandalone 一致。
  const onFollowUpRef = useRef(onFollowUp);
  onFollowUpRef.current = onFollowUp;

  // 归一 0（WF-00B）：关闭/删除决策的跨 seam 激活在 reducer 之外执行一次，然后清除标记。
  useEffect(() => {
    if (!pointers.followUp) {
      return;
    }
    const followUp = pointers.followUp;
    dispatchTabs({ type: "tabs/consumeFollowUp" });
    onFollowUpRef.current?.(followUp);
  }, [pointers.followUp]);

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
    setActiveTabId,
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
