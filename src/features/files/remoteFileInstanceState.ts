export type RemoteFileManualBrowseBehavior = "keep-following" | "pause";

export interface RemoteFileFollowPolicy {
  defaultEnabled: boolean;
  manualBrowseBehavior: RemoteFileManualBrowseBehavior;
}

/**
 * Compatibility policy while WS-F03 is still pending.
 * Keep the pre-WF-03 behavior (manual locate unless the user explicitly enables follow)
 * and keep manual browsing reversible. Product defaults live here so changing WS-F03 later
 * does not require rewriting the Files state model.
 */
export const currentRemoteFileFollowPolicy: RemoteFileFollowPolicy = {
  defaultEnabled: false,
  manualBrowseBehavior: "keep-following",
};

export function remoteFileInstanceOwnerKey(
  stateKey: string | undefined,
  connectionId: string | null,
) {
  return stateKey || connectionId;
}

export function shouldResetRemoteFileNavigation(
  previousOwnerKey: string | null,
  nextOwnerKey: string | null,
) {
  return previousOwnerKey !== nextOwnerKey;
}

export function followStateAfterManualBrowse(
  enabled: boolean,
  policy: RemoteFileFollowPolicy,
) {
  return enabled && policy.manualBrowseBehavior === "pause" ? false : enabled;
}

export interface RemoteFileDirectoryRequestToken {
  connectionId: string;
  ownerKey: string | null;
  requestId: number;
  scope: number;
}

export interface RemoteFileDirectoryRequestState {
  connectionId: string | null;
  mounted: boolean;
  ownerKey: string | null;
  requestId: number;
  scope: number;
}

export function canApplyRemoteFileDirectoryResponse(
  request: RemoteFileDirectoryRequestToken,
  current: RemoteFileDirectoryRequestState,
  latestOnly: boolean,
) {
  if (
    !current.mounted ||
    request.ownerKey !== current.ownerKey ||
    request.connectionId !== current.connectionId ||
    request.scope !== current.scope
  ) {
    return false;
  }
  return !latestOnly || request.requestId === current.requestId;
}
