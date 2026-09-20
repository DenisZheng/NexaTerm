import { useEffect, useState } from "react";

import type { RemoteFileEditorTab } from "../../editor/remoteFileEditorTypes";
import type { RemoteFileOpenMode } from "../../settings/settingsTypes";
import type { LocalTerminalTab } from "../../terminal/localTerminalTypes";

import type { RdpSessionTab, UnifiedWorkbenchTab, VncSessionTab, WorkspaceMode } from "./types";

/**
 * 会话 tab controller 需要从外部读取的输入。
 */
export interface SessionTabsControllerInputs {
  /** 新连接首次打开远程文件时的默认布局；来自设置。 */
  defaultRemoteFileOpenMode: RemoteFileOpenMode;
}

/**
 * 会话 tab 状态 controller —— Task 04 第二刀 2b。
 *
 * 把 WorkspaceShell 中五个会话集合、七个"当前项"指针、工作区模式、首页记忆位、
 * 三个按连接的记忆表，以及两个按连接归一的 effect **原样**迁出；逻辑一行未改。
 *
 * 明确不迁的：`terminalTabsRef` 等四个 ref 及其在 setter updater 里的同步写入。
 * 它们是"提交前同步读最新值"的通道，与 React 状态是两套语义，留在 WorkspaceShell，
 * 待第三刀后单独消灭；controller 只暴露 state 与 setter。
 *
 * `TTerminalTab` 由调用方注入（它携带连接向导步骤类型，属于 WorkspaceShell）。
 */
export function useSessionTabsController<TTerminalTab extends { connectionId: string; id: string }>(
  inputs: SessionTabsControllerInputs,
) {
  const { defaultRemoteFileOpenMode } = inputs;

  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [activeTabByConnectionId, setActiveTabByConnectionId] = useState<Record<string, string>>({});
  const [activeView, setActiveView] = useState<"workspace" | "settings">("workspace");
  const [terminalTabs, setTerminalTabs] = useState<TTerminalTab[]>([]);
  const [rdpSessions, setRdpSessions] = useState<RdpSessionTab[]>([]);
  const [vncSessions, setVncSessions] = useState<VncSessionTab[]>([]);
  const [activeRdpSessionId, setActiveRdpSessionId] = useState<string | null>(null);
  const [activeVncSessionId, setActiveVncSessionId] = useState<string | null>(null);
  const [localTerminalTabs, setLocalTerminalTabs] = useState<LocalTerminalTab[]>([]);
  const [activeWorkspaceMode, setActiveWorkspaceMode] = useState<WorkspaceMode>("home");
  const [activeLocalTerminalTabId, setActiveLocalTerminalTabId] = useState<string | null>(null);
  const [remoteFileTabs, setRemoteFileTabs] = useState<RemoteFileEditorTab[]>([]);
  const [activeRemoteFileTabId, setActiveRemoteFileTabId] = useState<string | null>(null);
  const [terminalFileLayoutByConnectionId, setTerminalFileLayoutByConnectionId] =
    useState<Record<string, RemoteFileOpenMode>>({});
  const [activeUnifiedTabByConnectionId, setActiveUnifiedTabByConnectionId] =
    useState<Record<string, UnifiedWorkbenchTab>>({});
  const [homeActive, setHomeActive] = useState(true);

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

  // 归一 2：统一 tab 记忆失效时回退，优先回退到该连接的 file tab，其次 terminal tab。
  useEffect(() => {
    setActiveUnifiedTabByConnectionId((activeTabs) => {
      let changed = false;
      const nextActiveTabs: Record<string, UnifiedWorkbenchTab> = {};

      Object.entries(activeTabs).forEach(([connectionId, activeTab]) => {
        const terminalTab = terminalTabs.find(
          (tab) => tab.connectionId === connectionId && tab.id === activeTab.id,
        );
        const fileTab = remoteFileTabs.find(
          (tab) => tab.connectionId === connectionId && tab.id === activeTab.id,
        );

        if (
          (activeTab.kind === "terminal" && terminalTab) ||
          (activeTab.kind === "file" && fileTab)
        ) {
          nextActiveTabs[connectionId] = activeTab;
          return;
        }

        const fallbackFileTab = remoteFileTabs.find((tab) => tab.connectionId === connectionId);
        const fallbackTerminalTab = terminalTabs.find((tab) => tab.connectionId === connectionId);
        if (fallbackFileTab) {
          nextActiveTabs[connectionId] = { kind: "file", id: fallbackFileTab.id };
        } else if (fallbackTerminalTab) {
          nextActiveTabs[connectionId] = { kind: "terminal", id: fallbackTerminalTab.id };
        }
        changed = true;
      });

      return changed ? nextActiveTabs : activeTabs;
    });
  }, [remoteFileTabs, terminalTabs]);

  return {
    activeConnectionId,
    activeLocalTerminalTabId,
    activeRdpSessionId,
    activeRemoteFileTabId,
    activeTabByConnectionId,
    activeTabId,
    activeUnifiedTabByConnectionId,
    activeView,
    activeVncSessionId,
    activeWorkspaceMode,
    homeActive,
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
