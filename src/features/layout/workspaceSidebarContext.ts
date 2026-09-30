import type { WorkspaceMode } from "../workspace/sessionTabs/types";

export interface WorkspaceSidebarTerminal {
  connectionId: string;
  id: string;
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
