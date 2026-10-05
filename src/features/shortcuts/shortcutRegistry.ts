import type {
  RegisteredShortcutAction,
  ShortcutAction,
  ShortcutCategory,
} from "./shortcutTypes";

export const aiSendMessageShortcutActionId = "ai.sendMessage";

export const shortcutCategories: ShortcutCategory[] = [
  { id: "general", label: "General" },
  { id: "terminal", label: "Terminal" },
  { id: "search", label: "Search" },
  { id: "tools", label: "Tools" },
];

export const shortcutActions: RegisteredShortcutAction[] = [
  {
    id: "connection.quickOpen",
    dispatch: "global",
    category: "general",
    label: "Quick open connection",
    description: "Open the connection search panel.",
    defaultBinding: "Ctrl+Shift+O",
    scope: "global",
    allowInTerminal: true,
  },
  {
    id: "settings.open",
    dispatch: "global",
    category: "general",
    label: "Open settings",
    description: "Open Settings.",
    defaultBinding: "Ctrl+,",
    scope: "global",
    allowInTerminal: true,
  },
  {
    id: "terminal.newTab",
    dispatch: "global",
    category: "terminal",
    label: "New terminal tab",
    description: "Open a new SSH or local terminal tab from the current context.",
    defaultBinding: "Ctrl+Shift+T",
    scope: "terminal",
    allowInTerminal: true,
  },
  {
    id: "terminal.closeTab",
    dispatch: "global",
    category: "terminal",
    label: "Close current terminal tab",
    description: "Close the active SSH or local terminal tab.",
    defaultBinding: "Ctrl+Shift+W",
    scope: "terminal",
    allowInTerminal: true,
  },
  {
    id: "terminal.search.toggle",
    dispatch: "global",
    category: "search",
    label: "Toggle terminal search",
    description: "Show or hide search for the active terminal.",
    defaultBinding: "Ctrl+Shift+F",
    scope: "terminal",
    allowInTerminal: true,
  },
  {
    id: "terminal.search.next",
    dispatch: "global",
    category: "search",
    label: "Find next",
    description: "Jump to the next terminal search result.",
    defaultBinding: "F3",
    scope: "terminal-search",
    allowInTerminal: true,
  },
  {
    id: "terminal.search.previous",
    dispatch: "global",
    category: "search",
    label: "Find previous",
    description: "Jump to the previous terminal search result.",
    defaultBinding: "Shift+F3",
    scope: "terminal-search",
    allowInTerminal: true,
  },
  {
    id: aiSendMessageShortcutActionId,
    dispatch: "local",
    category: "tools",
    label: "Send AI message",
    description: "Send the current question from the AI chat input.",
    defaultBinding: "Enter",
    scope: "workspace",
    allowInTerminal: false,
  },
  {
    id: "commandSender.toggle",
    dispatch: "global",
    category: "tools",
    label: "Toggle Command Sender",
    description: "Show or hide the Command Sender panel.",
    defaultBinding: "Ctrl+Shift+K",
    scope: "workspace",
    allowInTerminal: true,
  },
];

export const defaultShortcutBindings: Record<string, string | null> = Object.fromEntries(
  shortcutActions.map((action) => [action.id, action.defaultBinding]),
);

export function getShortcutAction(actionId: string) {
  return shortcutActions.find((action) => action.id === actionId) || null;
}

export function resolveShortcutBindingById(
  bindings: Record<string, string | null | undefined>,
  actionId: string,
) {
  const action = getShortcutAction(actionId);
  return action ? resolveShortcutBinding(bindings, action) : null;
}

export function resolveShortcutBinding(
  bindings: Record<string, string | null | undefined>,
  action: ShortcutAction,
) {
  return Object.prototype.hasOwnProperty.call(bindings, action.id)
    ? bindings[action.id] ?? null
    : action.defaultBinding;
}

/** 从同一动作表派生全局候选；不复制动作定义或用户绑定。 */
export function resolveGlobalShortcutBindings(
  bindings: Record<string, string | null | undefined>,
) {
  return shortcutActions
    .filter((action) => action.dispatch === "global")
    .map((action) => ({ action, binding: resolveShortcutBinding(bindings, action) }));
}
