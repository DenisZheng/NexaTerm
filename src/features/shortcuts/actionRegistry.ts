import {
  getShortcutAction,
  resolveShortcutBindingById,
  shortcutActions,
} from "./shortcutRegistry";
import {
  resolveActionTarget,
  type ActionDisabledReason,
  type ActionTarget,
  type ActionTargetKind,
  type ActionTargetSelector,
  type WorkspaceActionContext,
} from "./actionContext";

export interface ActionFocusContext {
  readonly kind: "workspace" | "editable" | "terminal" | "terminal-search" | "menu";
  readonly composing?: boolean;
}
export interface WorkspaceActionRequest {
  readonly actionId: string;
  readonly target?: ActionTargetSelector;
  readonly source?: "menu" | "toolbar" | "context-menu" | "shortcut";
  /** Event-derived focus for shortcut dispatch; omitted focus fails closed. */
  readonly focus?: ActionFocusContext;
}
export interface WorkspaceActionState {
  readonly actionId: string;
  readonly binding: string | null;
  readonly enabled: boolean;
  readonly target: ActionTarget | null;
  readonly reason: ActionDisabledReason | null;
}
interface ActionPolicy {
  readonly target: ActionTargetKind;
  readonly capability?: "create-terminal" | "search" | "search-result" | "command-targets" | "split" | "tunnels";
  readonly deferred?: ActionDisabledReason;
}

// Policies extend canonical shortcut definitions; labels, scopes and bindings are not copied here.
const shortcutPolicies: Readonly<Record<string, ActionPolicy>> = {
  "connection.quickOpen": { target: "none" },
  "settings.open": { target: "none" },
  "terminal.newTab": { target: "terminal", capability: "create-terminal" },
  "terminal.closeTab": { target: "instance" },
  "terminal.search.toggle": { target: "terminal", capability: "search" },
  "terminal.search.next": { target: "terminal", capability: "search-result" },
  "terminal.search.previous": { target: "terminal", capability: "search-result" },
  "ai.sendMessage": { target: "none", deferred: "local-only" },
  "commandSender.toggle": { target: "none", capability: "command-targets" },
};
// Entry-only actions intentionally do not create shortcut preference keys or default bindings.
const entryPolicies: Readonly<Record<string, ActionPolicy>> = {
  "view.toggleSidebar": { target: "none" },
  "view.toggleTools": { target: "none" },
  "terminal.splitRight": { target: "terminal", capability: "split" },
  "terminal.splitDown": { target: "terminal", capability: "split" },
  "terminal.splitFour": { target: "terminal", capability: "split" },
  "tools.tunnels": { target: "none", capability: "tunnels" },
  "tools.x11": { target: "none", deferred: "capability-unavailable" },
  "help.shortcuts": { target: "none" },
  "help.about": { target: "none" },
  "workspace.closeItem": { target: "item" },
  "terminal.closePane": { target: "pane" },
  "terminal.closeSplitGroup": { target: "split-group" },
  "terminal.multiExec": { target: "none", deferred: "deferred-wf04c" },
};
export const workspaceActionIds: readonly string[] = [
  ...shortcutActions.map(({ id }) => id), ...Object.keys(entryPolicies),
];
const owns = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);

/** Pure policy resolution. UI consumers use the executor's resolve() to also check handler/busy state. */
export function resolveWorkspaceAction(
  request: WorkspaceActionRequest,
  context: WorkspaceActionContext,
  bindings: Readonly<Record<string, string | null | undefined>>,
): WorkspaceActionState {
  const { actionId } = request;
  const shortcut = getShortcutAction(actionId);
  const policy = shortcut && owns(shortcutPolicies, actionId)
    ? shortcutPolicies[actionId]
    : owns(entryPolicies, actionId) ? entryPolicies[actionId] : null;
  const binding = resolveShortcutBindingById(bindings, actionId);
  const disabled = (reason: ActionDisabledReason): WorkspaceActionState => ({
    actionId, binding, enabled: false, target: null, reason,
  });
  if (!policy) return disabled("unknown-action");
  if (shortcut?.dispatch === "local") return disabled("local-only");
  if (policy.deferred) return disabled(policy.deferred);

  if (request.source === "shortcut") {
    if (!shortcut || !binding) return disabled("shortcut-unbound");
    const focus = request.focus;
    if (!focus || focus.composing || focus.kind === "editable" || focus.kind === "menu") return disabled("input-focus");
    if (focus.kind === "terminal" && !shortcut.allowInTerminal) return disabled("input-focus");
    if (focus.kind === "terminal-search" && shortcut.scope !== "terminal" && shortcut.scope !== "terminal-search") return disabled("input-focus");
  }

  const resolved = resolveActionTarget(context, policy.target, request.target);
  if (resolved.reason) return disabled(resolved.reason);
  const { target } = resolved;
  if (policy.capability === "command-targets" && !(context.commandSenderTargetCount > 0)) return disabled("no-command-targets");
  if (policy.capability === "tunnels" && !context.canOpenTunnels) return disabled("tunnel-unavailable");
  if (target.kind === "instance" && policy.capability) {
    const instance = context.instances.find(({ id }) => id === target.instanceId);
    if (policy.capability === "split") {
      if (instance?.canSplit !== true) return disabled("split-unavailable");
    } else if (policy.capability === "create-terminal") {
      if (instance?.canCreateTerminal !== true) return disabled("terminal-unavailable");
    } else if (policy.capability === "search" || policy.capability === "search-result") {
      if (instance?.canSearch !== true) return disabled("terminal-unavailable");
      if (policy.capability === "search-result" && !instance.searchQuery?.trim()) return disabled("search-query-empty");
    }
  }
  return { actionId, binding, target, enabled: true, reason: null };
}
