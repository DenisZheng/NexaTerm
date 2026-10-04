import { workspaceSnapshotLoad, workspaceSnapshotSave } from "../../shared/tauri/commands";
import type { WorkspaceSnapshotRuntime } from "../workspace/restore/useWorkspaceSnapshotLifecycle";

/** Tauri 和浏览器计时留在接线层，workspace hook 只处理生命周期。 */
export const workspaceSnapshotRuntime: WorkspaceSnapshotRuntime = {
  load: workspaceSnapshotLoad,
  save: workspaceSnapshotSave,
  schedule(callback, delayMs) {
    const timer = window.setTimeout(callback, delayMs);
    return () => window.clearTimeout(timer);
  },
  reportError(operation, error) {
    console.warn(`workspace snapshot ${operation} failed`, error);
  },
};
