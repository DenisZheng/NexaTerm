import type { RemoteFileEditorOperationToken } from "../editor/remoteFileEditorState";
import type { RemoteFileEntry } from "./remoteFileTypes";

export type RemoteFileTextAction =
  | { action: "create-directory"; connectionId: string; parentPath: string }
  | { action: "create-file"; connectionId: string; parentPath: string }
  | { action: "rename"; connectionId: string; entry: RemoteFileEntry }
  | { action: "save-as"; connectionId: string; parentPath: string; sourceTabId: string; operation: RemoteFileEditorOperationToken };

export function isValidRemoteBaseName(name: string) {
  const trimmed = name.trim();
  return Boolean(trimmed) && trimmed !== "." && trimmed !== ".." && !/[\\/\u0000-\u001f\u007f]/.test(trimmed);
}
