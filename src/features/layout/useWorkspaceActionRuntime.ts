import { useRef } from "react";
import {
  createWorkspaceActionExecutor,
  type WorkspaceActionSnapshot,
} from "../shortcuts/actionExecutor";
import {
  buildWorkspaceActionContext,
  type WorkspaceActionContextInput,
} from "./workspaceActionContext";
import {
  createWorkspaceActionHandlers,
  type WorkspaceActionOperations,
} from "./workspaceActionHandlers";

/** Keeps one executor while feeding it the newest committed shell-derived snapshot every render. */
export function useWorkspaceActionRuntime(
  input: WorkspaceActionContextInput,
  bindings: Readonly<Record<string, string | null | undefined>>,
  operations: WorkspaceActionOperations,
) {
  const snapshotRef = useRef<WorkspaceActionSnapshot | null>(null);
  const executorRef = useRef<ReturnType<typeof createWorkspaceActionExecutor> | null>(null);
  snapshotRef.current = {
    context: buildWorkspaceActionContext(input),
    bindings,
    handlers: createWorkspaceActionHandlers(operations),
  };
  executorRef.current ??= createWorkspaceActionExecutor(() => {
    if (!snapshotRef.current) throw new Error("workspace action snapshot unavailable");
    return snapshotRef.current;
  });
  return executorRef.current;
}
