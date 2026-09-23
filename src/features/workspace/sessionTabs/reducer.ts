import type { SessionTabsAction } from "./actions";
import {
  decideConnectionClose,
  decideLocalClose,
  decideRdpRemove,
  decideTerminalClose,
  decideVncRemove,
  type CloseDecision,
  type FollowUp,
} from "./closeDecision";
import type { UnifiedWorkbenchTab, WorkspaceMode } from "./types";

/**
 * 指针与记忆状态。五个会话集合（terminalTabs 等）暂不进 reducer：它们与 WorkspaceShell 里的
 * `*Ref` 同步写入耦合，留待 ref 通道消灭后再迁。
 */
export interface SessionPointerState {
  activeConnectionId: string | null;
  activeLocalTerminalTabId: string | null;
  activeRdpSessionId: string | null;
  activeRemoteFileTabId: string | null;
  /** 每个连接上次激活的终端 tab（不是派生值，是记忆）。 */
  activeTabByConnectionId: Record<string, string>;
  activeTabId: string | null;
  /** 统一模式下每个连接上次激活的 terminal/file tab。 */
  activeUnifiedTabByConnectionId: Record<string, UnifiedWorkbenchTab>;
  activeView: "workspace" | "settings";
  activeVncSessionId: string | null;
  /**
   * 关闭/删除决策要求 shell 在 reducer 之外执行的跨 seam 激活（原 updater 内的 activate* 调用）。
   * controller effect 消费后 dispatch `tabs/consumeFollowUp` 清除；同 split reducer 的 `collapsedTo`。
   */
  followUp: FollowUp | null;
  /** 独立于 mode 的首页记忆位：mode 不是 home 但没有会话时也可能显示首页。 */
  homeActive: boolean;
  mode: WorkspaceMode;
}

export const initialSessionPointerState: SessionPointerState = {
  activeConnectionId: null,
  activeLocalTerminalTabId: null,
  activeRdpSessionId: null,
  activeRemoteFileTabId: null,
  activeTabByConnectionId: {},
  activeTabId: null,
  activeUnifiedTabByConnectionId: {},
  activeView: "workspace",
  activeVncSessionId: null,
  followUp: null,
  homeActive: false,
  mode: "home",
};

function set<K extends keyof SessionPointerState>(
  state: SessionPointerState,
  key: K,
  value: SessionPointerState[K],
): SessionPointerState {
  return state[key] === value ? state : { ...state, [key]: value };
}

function rememberActive(state: SessionPointerState, connectionId: string, tabId: string) {
  return state.activeTabByConnectionId[connectionId] === tabId
    ? state
    : {
        ...state,
        activeTabByConnectionId: { ...state.activeTabByConnectionId, [connectionId]: tabId },
      };
}

function rememberUnified(state: SessionPointerState, connectionId: string, tab: UnifiedWorkbenchTab) {
  const current = state.activeUnifiedTabByConnectionId[connectionId];
  return current?.kind === tab.kind && current.id === tab.id
    ? state
    : {
        ...state,
        activeUnifiedTabByConnectionId: { ...state.activeUnifiedTabByConnectionId, [connectionId]: tab },
      };
}

/** 进入工作区视图并离开首页；所有激活类 action 的公共前缀。 */
function enterWorkspace(state: SessionPointerState, mode: WorkspaceMode): SessionPointerState {
  let next = set(state, "activeView", "workspace");
  next = set(next, "mode", mode);
  return set(next, "homeActive", false);
}

/** 按 closeDecision 的结果更新指针：patch 逐键 set，remember / forget 走记忆表，followUp 写标记。 */
function applyDecision(state: SessionPointerState, decision: CloseDecision): SessionPointerState {
  let next = state;
  for (const [key, value] of Object.entries(decision.patch) as [
    keyof CloseDecision["patch"],
    SessionPointerState[keyof CloseDecision["patch"]],
  ][]) {
    next = set(next, key, value as never);
  }
  if (decision.remember) {
    next = rememberActive(next, decision.remember.connectionId, decision.remember.tabId);
  }
  if (decision.forget && decision.forget.length > 0) {
    next = sessionPointerReducer(next, { type: "tabs/forgetConnections", connectionIds: decision.forget });
  }
  return set(next, "followUp", decision.followUp);
}

export function sessionPointerReducer(
  state: SessionPointerState,
  action: SessionTabsAction,
): SessionPointerState {
  switch (action.type) {
    case "tabs/activateTerminal": {
      let next = enterWorkspace(state, "ssh");
      next = set(next, "activeConnectionId", action.connectionId);
      next = set(next, "activeTabId", action.tabId);
      next = rememberActive(next, action.connectionId, action.tabId);
      if (action.rememberUnified) {
        next = rememberUnified(next, action.connectionId, { kind: "terminal", id: action.tabId });
      }
      return next;
    }
    case "tabs/activateLocal": {
      const next = enterWorkspace(state, "local");
      return set(next, "activeLocalTerminalTabId", action.tabId);
    }
    case "tabs/activateRdp": {
      let next = enterWorkspace(state, "rdp");
      next = set(next, "activeConnectionId", action.connectionId);
      return set(next, "activeRdpSessionId", action.sessionId);
    }
    case "tabs/activateVnc": {
      let next = enterWorkspace(state, "vnc");
      next = set(next, "activeConnectionId", action.connectionId);
      return set(next, "activeVncSessionId", action.sessionId);
    }
    case "tabs/activateFile": {
      // 原实现不改 activeView（文件 tab 只能在工作区内被激活），只改 homeActive / mode。
      let next = set(state, "homeActive", false);
      next = set(next, "mode", "ssh");
      next = set(next, "activeConnectionId", action.connectionId);
      next = set(next, "activeRemoteFileTabId", action.fileTabId);
      if (action.rememberUnified) {
        next = rememberUnified(next, action.connectionId, { kind: "file", id: action.fileTabId });
      }
      if (action.terminalTabId) {
        next = set(next, "activeTabId", action.terminalTabId);
        next = rememberActive(next, action.connectionId, action.terminalTabId);
      }
      return next;
    }
    case "tabs/activateSplitHost": {
      if (action.host.kind === "ssh") {
        const next = enterWorkspace(state, "ssh");
        return set(next, "activeConnectionId", action.host.connectionId);
      }
      return enterWorkspace(state, "local");
    }
    case "tabs/focusPaneBinding":
      return action.binding.kind === "ssh"
        ? set(state, "activeTabId", action.binding.tabId)
        : set(state, "activeLocalTerminalTabId", action.binding.tabId);
    case "tabs/startConnecting": {
      // 原 startConnectionStep：mode / homeActive / connection / tab / 记忆，不写 activeView。
      let next = set(state, "mode", "ssh");
      next = set(next, "homeActive", false);
      next = set(next, "activeConnectionId", action.connectionId);
      next = set(next, "activeTabId", action.tabId);
      return rememberActive(next, action.connectionId, action.tabId);
    }
    case "tabs/openSettings":
      return set(state, "activeView", "settings");
    case "tabs/closeSettings":
      return set(state, "activeView", "workspace");
    case "tabs/clearActiveFile":
      return set(state, "activeRemoteFileTabId", null);
    case "tabs/closeTerminals":
      return applyDecision(state, decideTerminalClose(state, action.closingTabs, action.snapshot));
    case "tabs/closeConnections":
      return applyDecision(
        state,
        decideConnectionClose(state, action.connectionIds, action.snapshot, action.variant),
      );
    case "tabs/closeLocalTerminals":
      return applyDecision(state, decideLocalClose(state, action.closingIds, action.snapshot));
    case "tabs/removeRdp":
      return applyDecision(state, decideRdpRemove(state, action.closingIds, action.snapshot));
    case "tabs/removeVnc":
      return applyDecision(state, decideVncRemove(state, action.closingIds, action.snapshot));
    case "tabs/consumeFollowUp":
      return set(state, "followUp", null);
    case "tabs/goHome": {
      let next = set(state, "activeView", "workspace");
      next = set(next, "mode", "home");
      return set(next, "homeActive", true);
    }
    case "tabs/returnHomeIfEmpty": {
      const { local, rdp, ssh, vnc } = action.counts;
      if (ssh !== 0 || local !== 0 || rdp !== 0 || vnc !== 0) {
        return state;
      }
      let next = set(state, "activeConnectionId", null);
      next = set(next, "activeTabId", null);
      next = set(next, "activeRdpSessionId", null);
      next = set(next, "activeVncSessionId", null);
      next = set(next, "activeLocalTerminalTabId", null);
      next = set(next, "mode", "home");
      return set(next, "homeActive", true);
    }
    case "tabs/fallbackHomeKeepPointers": {
      let next = set(state, "activeConnectionId", null);
      next = set(next, "mode", "home");
      return set(next, "homeActive", true);
    }
    case "tabs/rememberActive":
      return rememberActive(state, action.connectionId, action.tabId);
    case "tabs/forgetConnections": {
      if (action.connectionIds.length === 0) {
        return state;
      }
      const next = { ...state.activeTabByConnectionId };
      let changed = false;
      for (const id of action.connectionIds) {
        if (id in next) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? { ...state, activeTabByConnectionId: next } : state;
    }
    case "tabs/rememberUnified":
      return rememberUnified(state, action.connectionId, action.tab);
    case "tabs/forgetUnified": {
      if (action.connectionIds.length === 0) {
        return state;
      }
      const next = { ...state.activeUnifiedTabByConnectionId };
      let changed = false;
      for (const id of action.connectionIds) {
        if (id in next) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? { ...state, activeUnifiedTabByConnectionId: next } : state;
    }
    case "tabs/normalizeUnified": {
      // 原 WorkspaceShell 的 unified 记忆回退 effect，逻辑原样。
      const { fileTabs, terminalTabs } = action;
      let changed = false;
      const nextActiveTabs: Record<string, UnifiedWorkbenchTab> = {};
      Object.entries(state.activeUnifiedTabByConnectionId).forEach(([connectionId, activeTab]) => {
        const terminalTab = terminalTabs.find(
          (tab) => tab.connectionId === connectionId && tab.id === activeTab.id,
        );
        const fileTab = fileTabs.find(
          (tab) => tab.connectionId === connectionId && tab.id === activeTab.id,
        );
        if (
          (activeTab.kind === "terminal" && terminalTab) ||
          (activeTab.kind === "file" && fileTab)
        ) {
          nextActiveTabs[connectionId] = activeTab;
          return;
        }
        const fallbackFileTab = fileTabs.find((tab) => tab.connectionId === connectionId);
        const fallbackTerminalTab = terminalTabs.find((tab) => tab.connectionId === connectionId);
        if (fallbackFileTab) {
          nextActiveTabs[connectionId] = { kind: "file", id: fallbackFileTab.id };
        } else if (fallbackTerminalTab) {
          nextActiveTabs[connectionId] = { kind: "terminal", id: fallbackTerminalTab.id };
        }
        changed = true;
      });
      return changed ? { ...state, activeUnifiedTabByConnectionId: nextActiveTabs } : state;
    }
    case "tabs/setActiveConnectionId":
      return set(state, "activeConnectionId", action.value);
    case "tabs/setActiveTabId":
      return set(state, "activeTabId", action.value);
    case "tabs/setActiveRdpSessionId":
      return set(state, "activeRdpSessionId", action.value);
    case "tabs/setActiveVncSessionId":
      return set(state, "activeVncSessionId", action.value);
    case "tabs/setActiveLocalTerminalTabId":
      return set(state, "activeLocalTerminalTabId", action.value);
    case "tabs/setActiveRemoteFileTabId":
      return set(state, "activeRemoteFileTabId", action.value);
    case "tabs/setActiveView":
      return set(state, "activeView", action.value);
    case "tabs/setMode":
      return set(state, "mode", action.value);
    case "tabs/setHomeActive":
      return set(state, "homeActive", action.value);
    default:
      return state;
  }
}
