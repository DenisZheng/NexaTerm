import type { WorkspaceActionContext } from "../shortcuts/actionContext";
import type { TerminalPaneBinding } from "../terminal/terminalSplitLayout";
import { instanceItemId } from "../workspace/sessionTabs/instances";

export type WorkspaceActionItemInput =
  | { readonly id: string; readonly kind: "home" | "ssh" | "local" | "rdp" | "vnc" }
  | { readonly id: string; readonly kind: "split"; readonly memberIds: readonly string[] };

export interface WorkspaceActionContextInput {
  readonly workspaceVisible: boolean;
  readonly activeItemId: string | null;
  readonly activePaneId: string | null;
  readonly workspaceItems: readonly WorkspaceActionItemInput[];
  readonly terminalTabs: readonly { readonly id: string }[];
  readonly localTerminalTabs: readonly { readonly id: string }[];
  readonly rdpSessions: readonly { readonly id: string }[];
  readonly vncSessions: readonly { readonly id: string }[];
  readonly splitPanes: readonly {
    readonly id: string;
    readonly binding?: TerminalPaneBinding | null;
  }[];
  readonly terminalSearchByTabId: Readonly<Record<string, { readonly query: string } | undefined>>;
  readonly commandSenderTargetCount: number;
  readonly canSplitTerminal: boolean;
}

/**
 * Projects the live WorkspaceShell collections into the transient 4B action context.
 * This is not another session store: callers rebuild it from current shell state.
 */
export function buildWorkspaceActionContext(input: WorkspaceActionContextInput): WorkspaceActionContext {
  const terminalInstance = (kind: "ssh" | "local", tabId: string) => ({
    id: instanceItemId(kind, tabId),
    kind,
    canCreateTerminal: true,
    canSearch: true,
    canSplit: input.canSplitTerminal,
    searchQuery: input.terminalSearchByTabId[tabId]?.query,
  } as const);

  return {
    workspaceVisible: input.workspaceVisible,
    activeItemId: input.activeItemId,
    activePaneId: input.activePaneId,
    items: input.workspaceItems.map((item) => item.kind === "split"
      ? { id: item.id, kind: item.kind, memberIds: item.memberIds }
      : { id: item.id, kind: item.kind }),
    instances: [
      ...input.terminalTabs.map((tab) => terminalInstance("ssh", tab.id)),
      ...input.localTerminalTabs.map((tab) => terminalInstance("local", tab.id)),
      ...input.rdpSessions.map((session) => ({ id: instanceItemId("rdp", session.id), kind: "rdp" as const })),
      ...input.vncSessions.map((session) => ({ id: instanceItemId("vnc", session.id), kind: "vnc" as const })),
    ],
    panes: input.splitPanes.map((pane) => ({
      id: pane.id,
      itemId: "split",
      instanceId: pane.binding ? instanceItemId(pane.binding.kind, pane.binding.tabId) : null,
    })),
    commandSenderTargetCount: input.commandSenderTargetCount,
  };
}
