import {
  HOME_ITEM_ID,
  SPLIT_ITEM_ID,
  instanceItemId,
} from "../sessionTabs/instances";
import {
  clampTerminalSplitRatio,
  type TerminalSplitNode,
} from "../../terminal/terminalSplitLayout";

export const WORKSPACE_SNAPSHOT_VERSION = 1 as const;

export type WorkspaceSnapshotSidebarView = "sessions" | "files";

/**
 * Restorable target identity only. Temporary targets are referenced by an
 * opaque, non-sensitive target id; credentials and transport secrets live
 * outside the workspace snapshot contract.
 */
export type WorkspaceSnapshotTargetRef =
  | { kind: "profile"; profileId: string }
  | { kind: "temporary"; targetId: string };

export type WorkspaceSnapshotInstance =
  | {
      id: string;
      kind: "ssh";
      ordinal: number;
      target: WorkspaceSnapshotTargetRef;
    }
  | {
      id: string;
      kind: "local";
      ordinal: number;
      source: "local" | "telnet" | "serial";
      target: WorkspaceSnapshotTargetRef;
    }
  | {
      id: string;
      kind: "rdp";
      target: WorkspaceSnapshotTargetRef;
    }
  | {
      id: string;
      kind: "vnc";
      target: WorkspaceSnapshotTargetRef;
    };

export type WorkspaceSnapshotPaneNode =
  | {
      id: string;
      instanceId: string | null;
      kind: "leaf";
    }
  | {
      direction: "row" | "column";
      first: WorkspaceSnapshotPaneNode;
      id: string;
      kind: "split";
      ratio: number;
      second: WorkspaceSnapshotPaneNode;
    };

export interface WorkspaceSnapshotV1 {
  activeItemId: string | null;
  files: {
    /** Last known directory by logical SSH instance id. */
    directories: Record<string, string>;
    followActivePane: boolean;
  };
  instances: WorkspaceSnapshotInstance[];
  /**
   * Logical instance order only. Home is fixed first and split groups derive
   * their position from their member instances, matching sessionTabs.order.
   */
  order: string[];
  panes: WorkspaceSnapshotPaneNode | null;
  sidebar: {
    collapsed: boolean;
    view: WorkspaceSnapshotSidebarView;
  };
  version: typeof WORKSPACE_SNAPSHOT_VERSION;
}

export interface WorkspaceSnapshotPointers {
  activeItemId: string | null;
  files: {
    /** Input keys are logical instance ids (for example ssh:<tabId>). */
    directories: Readonly<Record<string, string | null | undefined>>;
    followActivePane: boolean;
  };
  order: readonly string[];
  sidebar: {
    collapsed: boolean;
    view: WorkspaceSnapshotSidebarView;
  };
  splitLayout: TerminalSplitNode | null;
}

export interface WorkspaceSnapshotCollections {
  localTerminalTabs: readonly {
    id: string;
    ordinal: number;
    profileId: string;
    source?: "local" | "telnet" | "serial";
  }[];
  rdpSessions: readonly {
    connectionId: string;
    id: string;
  }[];
  targetRefs?: {
    connections?: Readonly<Record<string, WorkspaceSnapshotTargetRef | undefined>>;
    localProfiles?: Readonly<Record<string, WorkspaceSnapshotTargetRef | undefined>>;
  };
  terminalTabs: readonly {
    connectionId: string;
    id: string;
    ordinal: number;
  }[];
  vncSessions: readonly {
    connectionId: string;
    id: string;
  }[];
}

export function snapshotTargetRefs(snapshot: WorkspaceSnapshotV1): NonNullable<WorkspaceSnapshotCollections["targetRefs"]> {
  const connections: Record<string, WorkspaceSnapshotTargetRef> = {};
  const localProfiles: Record<string, WorkspaceSnapshotTargetRef> = {};
  for (const instance of snapshot.instances) {
    const target = copyTargetRef(instance.target);
    const ownerId = target.kind === "profile" ? target.profileId : target.targetId;
    if (instance.kind === "local") localProfiles[ownerId] = target;
    else connections[ownerId] = target;
  }
  return { connections, localProfiles };
}

/**
 * WS-R01 snapshot projection. This function deliberately copies a strict
 * whitelist instead of spreading runtime session objects.
 */
export function toSnapshot(
  pointers: WorkspaceSnapshotPointers,
  collections: WorkspaceSnapshotCollections,
): WorkspaceSnapshotV1 {
  const instances = collectSnapshotInstances(collections);
  const liveIds = new Set(instances.map((instance) => instance.id));
  const sshIds = new Set(
    instances.filter((instance) => instance.kind === "ssh").map((instance) => instance.id),
  );

  return {
    activeItemId: sanitizeActiveItemId(
      pointers.activeItemId,
      liveIds,
      pointers.splitLayout !== null,
    ),
    files: {
      directories: snapshotDirectories(pointers.files.directories, sshIds),
      followActivePane: pointers.files.followActivePane,
    },
    instances,
    order: snapshotOrder(pointers.order, instances),
    panes: pointers.splitLayout
      ? snapshotPaneNode(pointers.splitLayout, liveIds)
      : null,
    sidebar: {
      collapsed: pointers.sidebar.collapsed,
      view: pointers.sidebar.view,
    },
    version: WORKSPACE_SNAPSHOT_VERSION,
  };
}

function collectSnapshotInstances(
  collections: WorkspaceSnapshotCollections,
): WorkspaceSnapshotInstance[] {
  const connectionTargets = collections.targetRefs?.connections;
  const localProfileTargets = collections.targetRefs?.localProfiles;

  return [
    ...collections.terminalTabs.map(
      (tab): WorkspaceSnapshotInstance => ({
        id: instanceItemId("ssh", tab.id),
        kind: "ssh",
        ordinal: tab.ordinal,
        target: copyTargetRef(
          connectionTargets?.[tab.connectionId] ?? profileTarget(tab.connectionId),
        ),
      }),
    ),
    ...collections.localTerminalTabs.map(
      (tab): WorkspaceSnapshotInstance => ({
        id: instanceItemId("local", tab.id),
        kind: "local",
        ordinal: tab.ordinal,
        source: tab.source ?? "local",
        target: copyTargetRef(
          localProfileTargets?.[tab.profileId] ?? profileTarget(tab.profileId),
        ),
      }),
    ),
    ...collections.rdpSessions.map(
      (session): WorkspaceSnapshotInstance => ({
        id: instanceItemId("rdp", session.id),
        kind: "rdp",
        target: copyTargetRef(
          connectionTargets?.[session.connectionId] ?? profileTarget(session.connectionId),
        ),
      }),
    ),
    ...collections.vncSessions.map(
      (session): WorkspaceSnapshotInstance => ({
        id: instanceItemId("vnc", session.id),
        kind: "vnc",
        target: copyTargetRef(
          connectionTargets?.[session.connectionId] ?? profileTarget(session.connectionId),
        ),
      }),
    ),
  ];
}

function profileTarget(profileId: string): WorkspaceSnapshotTargetRef {
  return { kind: "profile", profileId };
}

function copyTargetRef(target: WorkspaceSnapshotTargetRef): WorkspaceSnapshotTargetRef {
  return target.kind === "profile"
    ? { kind: "profile", profileId: target.profileId }
    : { kind: "temporary", targetId: target.targetId };
}

function snapshotOrder(
  order: readonly string[],
  instances: readonly WorkspaceSnapshotInstance[],
): string[] {
  const liveIds = new Set(instances.map((instance) => instance.id));
  const seen = new Set<string>();
  const result: string[] = [];

  for (const id of order) {
    if (liveIds.has(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  for (const instance of instances) {
    if (!seen.has(instance.id)) {
      seen.add(instance.id);
      result.push(instance.id);
    }
  }
  return result;
}

function sanitizeActiveItemId(
  activeItemId: string | null,
  liveIds: ReadonlySet<string>,
  hasSplitLayout: boolean,
): string | null {
  if (activeItemId === HOME_ITEM_ID) {
    return HOME_ITEM_ID;
  }
  if (activeItemId === SPLIT_ITEM_ID) {
    return hasSplitLayout ? SPLIT_ITEM_ID : null;
  }
  return activeItemId && liveIds.has(activeItemId) ? activeItemId : null;
}

function snapshotDirectories(
  directories: Readonly<Record<string, string | null | undefined>>,
  sshIds: ReadonlySet<string>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [instanceId, path] of Object.entries(directories)) {
    if (sshIds.has(instanceId) && typeof path === "string" && path.length > 0) {
      result[instanceId] = path;
    }
  }
  return result;
}

function snapshotPaneNode(
  node: TerminalSplitNode,
  liveIds: ReadonlySet<string>,
): WorkspaceSnapshotPaneNode {
  if (node.kind === "leaf") {
    const instanceId = node.binding
      ? instanceItemId(node.binding.kind, node.binding.tabId)
      : null;
    return {
      id: node.id,
      instanceId: instanceId && liveIds.has(instanceId) ? instanceId : null,
      kind: "leaf",
    };
  }

  return {
    direction: node.direction,
    first: snapshotPaneNode(node.first, liveIds),
    id: node.id,
    kind: "split",
    ratio: clampTerminalSplitRatio(node.ratio),
    second: snapshotPaneNode(node.second, liveIds),
  };
}
