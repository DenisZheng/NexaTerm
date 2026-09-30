import type { ActionTarget, WorkspaceActionContext } from "./actionContext";
import {
  resolveWorkspaceAction,
  type WorkspaceActionRequest,
  type WorkspaceActionState,
} from "./actionRegistry";

export type WorkspaceActionHandler = (target: ActionTarget) => void | Promise<void>;
export interface WorkspaceActionSnapshot {
  readonly context: WorkspaceActionContext;
  readonly bindings: Readonly<Record<string, string | null | undefined>>;
  readonly handlers: Readonly<Partial<Record<string, WorkspaceActionHandler>>>;
}
export type WorkspaceActionResult =
  | { readonly status: "disabled"; readonly state: WorkspaceActionState }
  | { readonly status: "executed"; readonly state: WorkspaceActionState }
  | { readonly status: "failed"; readonly state: WorkspaceActionState; readonly error: unknown };

/**
 * One framework-neutral execution boundary. Keep one executor per workspace and supply current
 * committed state through readSnapshot. 4D injects business handlers and the existing close controller.
 * This module never closes sessions itself and never registers DOM listeners.
 */
export function createWorkspaceActionExecutor(readSnapshot: () => WorkspaceActionSnapshot) {
  const pending = new Set<string>();

  function resolveWithSnapshot(request: WorkspaceActionRequest, snapshot: WorkspaceActionSnapshot) {
    const state = resolveWorkspaceAction(request, snapshot.context, snapshot.bindings);
    if (!state.enabled) return state;
    if (!Object.prototype.hasOwnProperty.call(snapshot.handlers, request.actionId) ||
        typeof snapshot.handlers[request.actionId] !== "function") {
      return { ...state, enabled: false, reason: "handler-unavailable" as const };
    }
    return pending.has(request.actionId)
      ? { ...state, enabled: false, reason: "action-pending" as const }
      : state;
  }

  function resolve(request: WorkspaceActionRequest): WorkspaceActionState {
    return resolveWithSnapshot(request, readSnapshot());
  }

  async function run(request: WorkspaceActionRequest): Promise<WorkspaceActionResult> {
    // Recheck target existence, capability and the handler from ONE fresh snapshot, not menu render state.
    const snapshot = readSnapshot();
    const state = resolveWithSnapshot(request, snapshot);
    const handler = snapshot.handlers[request.actionId];
    if (!state.enabled || !state.target || typeof handler !== "function") return { status: "disabled", state };
    pending.add(request.actionId);
    try {
      await handler(state.target);
      return { status: "executed", state };
    } catch (error: unknown) {
      // Caller must present failures; no silent fallback, logging sensitive payloads or automatic retry.
      return { status: "failed", state, error };
    } finally {
      pending.delete(request.actionId);
    }
  }

  return { resolve, run };
}
