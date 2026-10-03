import type { WorkspaceSnapshotInstance, WorkspaceSnapshotV1 } from "./snapshotTypes";

export type WorkspaceRestoreItemStatus =
  | "missing-profile"
  | "ready"
  | "temporary-auth-required";

export interface WorkspaceRestoreItem {
  autoReconnect: boolean;
  instance: WorkspaceSnapshotInstance;
  status: WorkspaceRestoreItemStatus;
}

export interface WorkspaceRestorePlan {
  activeItemId: string | null;
  files: WorkspaceSnapshotV1["files"];
  items: WorkspaceRestoreItem[];
  multiExecMode: "off";
  order: string[];
  panes: WorkspaceSnapshotV1["panes"];
  sidebar: WorkspaceSnapshotV1["sidebar"];
}

export interface WorkspaceRestoreAvailability {
  autoReconnect: boolean;
  profileIds: ReadonlySet<string>;
  temporaryTargetIds?: ReadonlySet<string>;
}

export function buildWorkspaceRestorePlan(
  snapshot: WorkspaceSnapshotV1,
  availability: WorkspaceRestoreAvailability,
): WorkspaceRestorePlan {
  const temporaryTargetIds = availability.temporaryTargetIds ?? new Set<string>();
  const items = snapshot.instances.map((instance): WorkspaceRestoreItem => {
    const status = restoreStatus(instance, availability.profileIds, temporaryTargetIds);
    return {
      autoReconnect: status === "ready" && availability.autoReconnect,
      instance,
      status,
    };
  });

  return {
    activeItemId: snapshot.activeItemId,
    files: snapshot.files,
    items,
    multiExecMode: "off",
    order: snapshot.order,
    panes: snapshot.panes,
    sidebar: snapshot.sidebar,
  };
}

function restoreStatus(
  instance: WorkspaceSnapshotInstance,
  profileIds: ReadonlySet<string>,
  temporaryTargetIds: ReadonlySet<string>,
): WorkspaceRestoreItemStatus {
  if (instance.target.kind === "profile") {
    return profileIds.has(instance.target.profileId) ? "ready" : "missing-profile";
  }
  // A temporary target may retain a non-sensitive descriptor, but credentials
  // are intentionally never restored from the workspace snapshot.
  return temporaryTargetIds.has(instance.target.targetId)
    ? "temporary-auth-required"
    : "temporary-auth-required";
}
