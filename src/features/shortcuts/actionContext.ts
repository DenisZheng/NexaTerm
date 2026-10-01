/** Transient views supplied by the workspace; never a second session store. */
export type ActionInstanceKind = "ssh" | "local" | "rdp" | "vnc";
export interface ActionInstanceRef {
  readonly id: string;
  readonly kind: ActionInstanceKind;
  readonly canCreateTerminal?: boolean;
  readonly canSearch?: boolean;
  readonly canSplit?: boolean;
  readonly searchQuery?: string;
}
export type ActionItemRef =
  | { readonly id: string; readonly kind: "home" | ActionInstanceKind }
  | { readonly id: string; readonly kind: "split"; readonly memberIds: readonly string[] };
export interface ActionPaneRef {
  readonly id: string;
  readonly itemId: string;
  readonly instanceId: string | null;
}
export interface WorkspaceActionContext {
  readonly workspaceVisible: boolean;
  readonly activeItemId: string | null;
  readonly activePaneId: string | null;
  readonly items: readonly ActionItemRef[];
  /** Includes split members omitted from the top-level item projection. IDs are logical instance IDs. */
  readonly instances: readonly ActionInstanceRef[];
  readonly panes: readonly ActionPaneRef[];
  readonly commandSenderTargetCount: number;
}

export type ActionTargetSelector =
  | { readonly kind: "item"; readonly itemId: string }
  | { readonly kind: "instance"; readonly instanceId: string }
  | { readonly kind: "pane"; readonly itemId: string; readonly paneId: string };
export type ActionTargetKind = "none" | "item" | "instance" | "terminal" | "pane" | "split-group";
export type ActionTarget =
  | { readonly kind: "application" }
  | { readonly kind: "item" | "split-group"; readonly itemId: string }
  | { readonly kind: "instance"; readonly instanceId: string; readonly instanceKind: ActionInstanceKind }
  | { readonly kind: "pane"; readonly itemId: string; readonly paneId: string; readonly instanceId: string | null };

/** Stable reason codes; presentation/localization belongs to the 4C entry components. */
export type ActionDisabledReason =
  | "workspace-inactive" | "no-active-session" | "target-missing" | "wrong-target-kind"
  | "empty-pane" | "terminal-required" | "terminal-unavailable" | "search-query-empty"
  | "unknown-action" | "local-only" | "deferred-wf04c" | "no-command-targets"
  | "shortcut-unbound" | "input-focus" | "handler-unavailable" | "action-pending"
  | "capability-unavailable" | "split-unavailable";
export type ActionTargetResolution =
  | { readonly target: ActionTarget; readonly reason: null }
  | { readonly target: null; readonly reason: ActionDisabledReason };

const missing = (): ActionTargetResolution => ({ target: null, reason: "target-missing" });
const wrongKind = (): ActionTargetResolution => ({ target: null, reason: "wrong-target-kind" });

/** Explicit selectors never fall back to current focus, the group host, or a sibling. */
export function resolveActionTarget(
  context: WorkspaceActionContext,
  kind: ActionTargetKind,
  selector?: ActionTargetSelector,
): ActionTargetResolution {
  if (kind === "none") {
    return selector ? wrongKind() : { target: { kind: "application" }, reason: null };
  }
  if (!context.workspaceVisible) return { target: null, reason: "workspace-inactive" };
  if (selector?.kind === "instance") {
    return kind === "instance" || kind === "terminal"
      ? resolveInstance(context, selector.instanceId, kind)
      : wrongKind();
  }

  const itemId = selector?.itemId ?? context.activeItemId;
  if (itemId === null) return { target: null, reason: "no-active-session" };
  const item = context.items.find((candidate) => candidate.id === itemId);
  if (!item) return missing();
  if (item.kind === "home") return { target: null, reason: "no-active-session" };

  if (kind === "item" || kind === "split-group") {
    if (selector?.kind === "pane" || (kind === "split-group" && item.kind !== "split")) return wrongKind();
    // Check standalone liveness too; the render projection may be one update behind.
    if (item.kind !== "split" && !context.instances.some((instance) => instance.id === item.id && instance.kind === item.kind)) return missing();
    return { target: { kind, itemId: item.id }, reason: null };
  }

  if (item.kind !== "split") {
    if (kind === "pane" || selector?.kind === "pane") return wrongKind();
    return resolveInstance(context, item.id, kind, item.kind);
  }

  const paneId = selector?.kind === "pane"
    ? selector.paneId
    : item.id === context.activeItemId ? context.activePaneId : null;
  const pane = context.panes.find((candidate) => candidate.id === paneId && candidate.itemId === item.id);
  if (!pane) return missing();
  if (pane.instanceId !== null) {
    const member = context.instances.find((instance) => instance.id === pane.instanceId);
    if (!item.memberIds.includes(pane.instanceId) || !member) return missing();
    if (member.kind !== "ssh" && member.kind !== "local") return wrongKind();
  }
  if (kind === "pane") {
    return { target: { kind: "pane", itemId: item.id, paneId: pane.id, instanceId: pane.instanceId }, reason: null };
  }
  if (pane.instanceId === null) return { target: null, reason: "empty-pane" };
  return resolveInstance(context, pane.instanceId, kind);
}

function resolveInstance(
  context: WorkspaceActionContext,
  instanceId: string,
  kind: "instance" | "terminal",
  expectedKind?: ActionInstanceKind,
): ActionTargetResolution {
  const instance = context.instances.find((candidate) => candidate.id === instanceId);
  if (!instance || (expectedKind && instance.kind !== expectedKind)) return missing();
  if (kind === "terminal" && instance.kind !== "ssh" && instance.kind !== "local") {
    return { target: null, reason: "terminal-required" };
  }
  // Pass logical identity only, not mutable session records, credentials, or runtime handles.
  return { target: { kind: "instance", instanceId, instanceKind: instance.kind }, reason: null };
}
