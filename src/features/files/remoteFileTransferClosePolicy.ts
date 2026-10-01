import type { RemoteFileTransferItem } from "./remoteFileTransferTypes";

export type RemoteFileTransferCloseCandidate = Pick<
  RemoteFileTransferItem,
  "connectionId" | "id" | "status"
>;

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
  items: readonly RemoteFileTransferCloseCandidate[],
  closingConnectionIds: ReadonlySet<string>,
  policy: RemoteFileTransferClosePolicy = currentRemoteFileTransferClosePolicy,
): RemoteFileTransferCloseDecision {
  const activeTransferIds = items
    .filter(
      (item) =>
        Boolean(item.connectionId) &&
        closingConnectionIds.has(item.connectionId || "") &&
        (item.status === "queued" || item.status === "running"),
    )
    .map((item) => item.id);
  const cancelActive = policy.behavior === "confirm-cancel-active";
  return {
    activeTransferIds,
    cancelTransferIds: cancelActive ? activeTransferIds : [],
    requiresConfirmation: cancelActive && activeTransferIds.length > 0,
  };
}
