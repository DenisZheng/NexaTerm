import type { RemoteFileTransferItem } from "./remoteFileTransferTypes";
import { activeRemoteFileTransferIdsForConnections } from "./remoteFileTransferStore";

export type RemoteFileTransferCloseBehavior =
  | "keep-running"
  | "confirm-cancel-active";

export interface RemoteFileTransferClosePolicy {
  behavior: RemoteFileTransferCloseBehavior;
}

/**
 * WS-F09 is still a product decision. Preserve today's behavior while keeping the
 * close-session policy in one switchable place instead of hard-coding it into Shell.
 */
export const currentRemoteFileTransferClosePolicy: RemoteFileTransferClosePolicy = {
  behavior: "keep-running",
};

export interface RemoteFileTransferCloseDecision {
  activeTransferIds: string[];
  cancelTransferIds: string[];
  requiresConfirmation: boolean;
}

export function planRemoteFileTransferClose(
  items: readonly RemoteFileTransferItem[],
  closingConnectionIds: ReadonlySet<string>,
  policy: RemoteFileTransferClosePolicy = currentRemoteFileTransferClosePolicy,
): RemoteFileTransferCloseDecision {
  const activeTransferIds = activeRemoteFileTransferIdsForConnections(
    items,
    closingConnectionIds,
  );
  const cancelActive = policy.behavior === "confirm-cancel-active";
  return {
    activeTransferIds,
    cancelTransferIds: cancelActive ? activeTransferIds : [],
    requiresConfirmation: cancelActive && activeTransferIds.length > 0,
  };
}
