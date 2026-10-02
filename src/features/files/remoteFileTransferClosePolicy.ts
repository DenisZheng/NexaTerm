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

/** WS-F09 已确认：活动传输先询问，用户确认后取消；策略由关闭计划统一消费。 */
export const currentRemoteFileTransferClosePolicy: RemoteFileTransferClosePolicy = {
  behavior: "confirm-cancel-active",
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
