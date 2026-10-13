import type { RemoteFileEntry } from "./remoteFileTypes";
import type { RemoteFileTransferOwner } from "./remoteFileTransferOwner";

export const LOCAL_FILE_DROP_TYPE = "application/x-nexaterm-local-file";
export const REMOTE_FILE_DROP_TYPE = "application/x-mxterm-remote-file";

export interface RemoteFileDrop extends RemoteFileTransferOwner {
  entry: RemoteFileEntry;
}

/** 只接收应用自己的拖放元数据，字段白名单不携带凭据或文件内容。 */
export function readRemoteFileDrop(payload: string): RemoteFileDrop | null {
  try {
    const data: unknown = JSON.parse(payload);
    if (!data || typeof data !== "object") return null;
    const value = data as Record<string, unknown>;
    if (typeof value.connectionId !== "string" || !value.connectionId ||
        typeof value.ownerInstanceId !== "string" || !value.ownerInstanceId.startsWith("ssh:") ||
        !value.entry || typeof value.entry !== "object") return null;
    const entry = value.entry as Record<string, unknown>;
    if (typeof entry.name !== "string" || !entry.name || typeof entry.path !== "string" || !entry.path.startsWith("/") ||
        (entry.type !== "file" && entry.type !== "directory" && entry.type !== "symlink")) return null;
    return {
      connectionId: value.connectionId, ownerInstanceId: value.ownerInstanceId,
      entry: { name: entry.name, path: entry.path, type: entry.type },
    };
  } catch {
    return null;
  }
}
