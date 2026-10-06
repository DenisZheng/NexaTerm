import type { WorkspaceMode } from "../workspace/sessionTabs/types";
import type { Translate } from "../../shared/i18n";
import type { WorkspaceSidebarFileContext } from "./WorkspaceSidebar";
import type { OpenSessionEntry } from "./sessionNavigation";

export interface WorkspaceSidebarTerminal {
  connectionId: string;
  id: string;
}

/** 归属文案与 resolver 的绑定共用同一实例 ID，不另选最近/同 profile 的实例。 */
export function describeWorkspaceSidebarFiles(
  binding: WorkspaceSidebarResolvedFileContext | null,
  entries: readonly OpenSessionEntry[],
  terminals: readonly (WorkspaceSidebarTerminal & { type: string; sessionId?: string | null })[],
  paneNumber: number | null,
  t: Translate,
): WorkspaceSidebarFileContext | null {
  if (!binding) return null;
  const entry = entries.find((item) => item.id === `ssh:${binding.tabId}`);
  const terminal = terminals.find((item) => item.id === binding.tabId);
  return {
    ...binding,
    connectionName: entry?.label || null,
    instanceTitle: entry?.label || null,
    address: entry?.detail || null,
    status: t(terminal?.type === "terminal" && terminal.sessionId ? "sidebar.filesConnected" : "sidebar.filesNotConnected"),
    paneNumber,
  };
}

export interface WorkspaceSidebarBinding {
  kind: "ssh" | "local";
  tabId: string;
}

export interface WorkspaceSidebarResolvedFileContext {
  connectionId: string;
  path: string | null;
  tabId: string;
}

interface ResolveWorkspaceSidebarFileContextInput {
  activeTabId: string | null;
  activeWorkspaceMode: WorkspaceMode;
  focusedBinding: WorkspaceSidebarBinding | null | undefined;
  showingHome: boolean;
  splitActive: boolean;
  terminalDirectories: Readonly<Record<string, string | null | undefined>>;
  terminalTabs: readonly WorkspaceSidebarTerminal[];
}

/**
 * Resolves the Files shell strictly from the active SSH context.
 * A split with an empty/local/stale focused pane fails closed instead of borrowing a sibling session.
 */
export function resolveWorkspaceSidebarFileContext({
  activeTabId,
  activeWorkspaceMode,
  focusedBinding,
  showingHome,
  splitActive,
  terminalDirectories,
  terminalTabs,
}: ResolveWorkspaceSidebarFileContextInput): WorkspaceSidebarResolvedFileContext | null {
  if (showingHome) {
    return null;
  }

  const tabId = splitActive
    ? focusedBinding?.kind === "ssh"
      ? focusedBinding.tabId
      : null
    : activeWorkspaceMode === "ssh"
      ? activeTabId
      : null;

  if (!tabId) {
    return null;
  }

  const tab = terminalTabs.find((candidate) => candidate.id === tabId);
  if (!tab) {
    return null;
  }

  return {
    connectionId: tab.connectionId,
    path: terminalDirectories[tab.id] || null,
    tabId: tab.id,
  };
}
