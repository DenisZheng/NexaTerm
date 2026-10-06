import type messages from "../../shared/i18n/locales/actionbar.en.json";
import type { ActionDisabledReason } from "./actionContext";

export type ActionMessageKey = keyof typeof messages;
export type ActionMenuGroup = "session" | "view" | "terminal" | "tools" | "settings" | "help";
export type ActionIconName = "terminal" | "close" | "split" | "search" | "send" | "network" | "settings" | "panel" | "info" | "keyboard" | "plus";
export interface ActionPresentation {
  readonly group: ActionMenuGroup;
  readonly labelKey: ActionMessageKey;
  readonly icon: ActionIconName;
}

// Presentation only: identity, bindings, availability and execution remain in the existing registries.
export const menuGroups: readonly { id: ActionMenuGroup; labelKey: ActionMessageKey }[] = [
  { id: "session", labelKey: "actionBar.menu.session" },
  { id: "view", labelKey: "actionBar.menu.view" },
  { id: "terminal", labelKey: "actionBar.menu.terminal" },
  { id: "tools", labelKey: "actionBar.menu.tools" },
  { id: "settings", labelKey: "actionBar.menu.settings" },
  { id: "help", labelKey: "actionBar.menu.help" },
];
export const actionPresentation: Readonly<Record<string, ActionPresentation>> = {
  "connection.quickOpen": { group: "session", labelKey: "actionBar.action.quickOpen", icon: "search" },
  "workspace.closeItem": { group: "session", labelKey: "actionBar.action.closeItem", icon: "close" },
  "view.toggleSidebar": { group: "view", labelKey: "actionBar.action.sidebar", icon: "panel" },
  "view.toggleTools": { group: "view", labelKey: "actionBar.action.tools", icon: "panel" },
  "terminal.newTab": { group: "terminal", labelKey: "actionBar.action.newTerminal", icon: "plus" },
  "terminal.closeTab": { group: "terminal", labelKey: "actionBar.action.closeInstance", icon: "close" },
  "terminal.closePane": { group: "terminal", labelKey: "actionBar.action.closePane", icon: "close" },
  "terminal.closeSplitGroup": { group: "terminal", labelKey: "actionBar.action.closeGroup", icon: "close" },
  "terminal.splitRight": { group: "terminal", labelKey: "actionBar.action.splitRight", icon: "split" },
  "terminal.splitDown": { group: "terminal", labelKey: "actionBar.action.splitDown", icon: "split" },
  "terminal.splitFour": { group: "terminal", labelKey: "actionBar.action.splitFour", icon: "split" },
  "terminal.search.toggle": { group: "terminal", labelKey: "actionBar.action.search", icon: "search" },
  "terminal.search.next": { group: "terminal", labelKey: "actionBar.action.next", icon: "search" },
  "terminal.search.previous": { group: "terminal", labelKey: "actionBar.action.previous", icon: "search" },
  "terminal.multiExec": { group: "terminal", labelKey: "actionBar.action.multiExec", icon: "send" },
  "commandSender.toggle": { group: "tools", labelKey: "actionBar.action.commandSender", icon: "send" },
  "tools.tunnels": { group: "tools", labelKey: "actionBar.action.tunnels", icon: "network" },
  "tools.x11": { group: "tools", labelKey: "actionBar.action.x11", icon: "panel" },
  "settings.open": { group: "settings", labelKey: "actionBar.action.settings", icon: "settings" },
  "help.shortcuts": { group: "help", labelKey: "actionBar.action.shortcuts", icon: "keyboard" },
  "help.about": { group: "help", labelKey: "actionBar.action.about", icon: "info" },
};
export const actionReasonKeys: Readonly<Record<ActionDisabledReason, ActionMessageKey>> = {
  "workspace-inactive": "actionBar.reason.workspaceInactive",
  "no-active-session": "actionBar.reason.noSession",
  "target-missing": "actionBar.reason.missing",
  "wrong-target-kind": "actionBar.reason.wrongKind",
  "empty-pane": "actionBar.reason.emptyPane",
  "terminal-required": "actionBar.reason.terminalRequired",
  "terminal-unavailable": "actionBar.reason.terminalUnavailable",
  "search-query-empty": "actionBar.reason.noQuery",
  "unknown-action": "actionBar.reason.unknown",
  "local-only": "actionBar.reason.localOnly",
  "no-multi-exec-targets": "actionBar.reason.noMultiExecTargets",
  "no-command-targets": "actionBar.reason.noCommandTargets",
  "shortcut-unbound": "actionBar.reason.unbound",
  "input-focus": "actionBar.reason.inputFocus",
  "handler-unavailable": "actionBar.reason.noHandler",
  "action-pending": "actionBar.reason.pending",
  "capability-unavailable": "actionBar.reason.capability",
  "split-unavailable": "actionBar.reason.split",
  "tunnel-unavailable": "actionBar.reason.tunnels",
};
export const splitActionIds = ["terminal.splitRight", "terminal.splitDown", "terminal.splitFour"] as const;
export interface ToolbarEntry { readonly id: string; readonly priority: number }
export const toolbarEntries: readonly ToolbarEntry[] = [
  { id: "new-session", priority: 0 }, { id: "split", priority: 1 },
  { id: "terminal.multiExec", priority: 2 },
  { id: "tools.tunnels", priority: 4 }, { id: "tools.x11", priority: 5 },
  { id: "connection.quickOpen", priority: 6 }, { id: "settings.open", priority: 7 },
];

/** Width is the toolbar's available space AFTER the menubar, not the viewport width. */
export function partitionToolbar(availableWidth: number, x11Available = true) {
  const width = Number.isFinite(availableWidth) ? Math.max(0, availableWidth) : 0;
  const ordered = [...toolbarEntries].sort((a, b) => a.priority - b.priority);
  const candidates = ordered.filter(({ id }) => id !== "tools.x11" || x11Available);
  // 图标 32px + 间隙 2px；有溢出时预留 More 的完整位置。
  const allFit = candidates.length === ordered.length && width >= candidates.length * 34 - 2;
  const count = Math.min(candidates.length, Math.max(0, Math.floor((width - (allFit ? 0 : 34) + 2) / 34)));
  const visible = candidates.slice(0, count);
  const visibleIds = new Set(visible.map(({ id }) => id));
  const mode = width >= 840 ? "labels" : count === 0 ? "overflow" : count === candidates.length ? "icons" : "reduced";
  return { mode, visible, overflow: ordered.filter(({ id }) => !visibleIds.has(id)) };
}
