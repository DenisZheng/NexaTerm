export interface RemoteFileTransferOwner {
  connectionId: string;
  ownerInstanceId: string;
}

/** 只使用逻辑 tab 身份，不把可重连的 Rust sessionId 当作 owner。 */
export function captureRemoteFileTransferOwner(
  context: { connectionId: string; tabId: string } | null,
): RemoteFileTransferOwner | null {
  return context ? { connectionId: context.connectionId, ownerInstanceId: `ssh:${context.tabId}` } : null;
}

export function remoteFileTransferOwnerIsOpen(
  ownerInstanceId: string | null | undefined,
  connectionId: string,
  tabs: readonly { id: string; connectionId: string }[],
) {
  return ownerInstanceId
    ? tabs.some((tab) => `ssh:${tab.id}` === ownerInstanceId && tab.connectionId === connectionId)
    : tabs.some((tab) => tab.connectionId === connectionId);
}
import type { ConnectionProfile } from "../connections/connectionTypes";
import type { RemoteFileTransferItem } from "./remoteFileTransferTypes";


interface TransferTargetContext {
  fileContext: { connectionId: string; tabId: string } | null;
  connections: ReadonlyMap<string, ConnectionProfile>;
  tabs: readonly { id: string; connectionId: string }[];
}

/** 通过 getter 读取现有会话事实源；异步回调不保留过期连接集合。 */
export function createRemoteFileTransferTargets(
  context: () => TransferTargetContext,
  transfer: (id: string) => Pick<RemoteFileTransferItem, "connectionId" | "ownerInstanceId"> | null,
) {
  function connectionForTransfer(id: string) { return context().connections.get(id) || null; }
  function captureTransferOptions() {
    const owner = captureRemoteFileTransferOwner(context().fileContext);
    return { connection: owner ? connectionForTransfer(owner.connectionId) ?? undefined : undefined,
      ownerInstanceId: owner?.ownerInstanceId ?? null };
  }
  function transferOwnerForRun(options: { transferId?: string; ownerInstanceId?: string | null }, connectionId: string) {
    const current = captureRemoteFileTransferOwner(context().fileContext);
    return options.transferId ? transfer(options.transferId)?.ownerInstanceId ?? null
      : options.ownerInstanceId ?? (current?.connectionId === connectionId ? current.ownerInstanceId : null);
  }
  function connectionForTransferOwner(connection: ConnectionProfile | null | undefined, ownerInstanceId: string | null) {
    const tab = ownerInstanceId ? context().tabs.find((item) => `ssh:${item.id}` === ownerInstanceId) : null;
    return tab ? connectionForTransfer(tab.connectionId) : connection;
  }
  function canStartOwnedTransfer(ownerInstanceId: string | null, connectionId: string) {
    return remoteFileTransferOwnerIsOpen(ownerInstanceId, connectionId, context().tabs);
  }
  return { connectionForTransfer, captureTransferOptions, transferOwnerForRun, connectionForTransferOwner, canStartOwnedTransfer };
}
