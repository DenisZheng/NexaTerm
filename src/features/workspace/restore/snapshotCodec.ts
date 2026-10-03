import { clampTerminalSplitRatio } from "../../terminal/terminalSplitLayout";
import {
  HOME_ITEM_ID,
  SPLIT_ITEM_ID,
} from "../sessionTabs/instances";
import {
  WORKSPACE_SNAPSHOT_VERSION,
  type WorkspaceSnapshotInstance,
  type WorkspaceSnapshotPaneNode,
  type WorkspaceSnapshotTargetRef,
  type WorkspaceSnapshotV1,
} from "./snapshotTypes";

export interface WorkspaceSnapshotEnvelope {
  backup: unknown | null;
  current: unknown | null;
}

export interface WorkspaceSnapshotSelection {
  currentError: string | null;
  snapshot: WorkspaceSnapshotV1 | null;
  source: "backup" | "current" | "none";
}

const MAX_INSTANCES = 100;
const MAX_PANE_DEPTH = 8;

export function decodeWorkspaceSnapshot(value: unknown): WorkspaceSnapshotV1 {
  const root = record(value, "snapshot");
  if (root.version !== WORKSPACE_SNAPSHOT_VERSION) {
    throw new Error(`unsupported workspace snapshot version: ${String(root.version)}`);
  }

  const rawInstances = array(root.instances, "instances");
  if (rawInstances.length > MAX_INSTANCES) throw new Error("too many workspace instances");
  const instances = rawInstances.map(parseInstance);
  const ids = new Set<string>();
  for (const instance of instances) {
    if (ids.has(instance.id)) throw new Error(`duplicate workspace instance id: ${instance.id}`);
    ids.add(instance.id);
  }
  const sshIds = new Set(instances.filter((item) => item.kind === "ssh").map((item) => item.id));

  const panes = root.panes == null ? null : parsePane(root.panes, ids, 0);
  const order = dedupeStrings(array(root.order, "order")).filter((id) => ids.has(id));
  for (const instance of instances) if (!order.includes(instance.id)) order.push(instance.id);

  const files = record(root.files, "files");
  const directories: Record<string, string> = {};
  for (const [instanceId, path] of Object.entries(record(files.directories, "files.directories"))) {
    if (sshIds.has(instanceId) && typeof path === "string" && path.length > 0) {
      directories[instanceId] = path;
    }
  }

  const sidebar = record(root.sidebar, "sidebar");
  const sidebarView = sidebar.view === "files" ? "files" : "sessions";
  const activeItemId = sanitizeActiveItem(root.activeItemId, ids, panes !== null);

  return {
    activeItemId,
    files: {
      directories,
      followActivePane: Boolean(files.followActivePane),
    },
    instances,
    order,
    panes,
    sidebar: {
      collapsed: Boolean(sidebar.collapsed),
      view: sidebarView,
    },
    version: WORKSPACE_SNAPSHOT_VERSION,
  };
}

export function selectWorkspaceSnapshot(
  envelope: WorkspaceSnapshotEnvelope,
): WorkspaceSnapshotSelection {
  if (envelope.current != null) {
    try {
      return {
        currentError: null,
        snapshot: decodeWorkspaceSnapshot(envelope.current),
        source: "current",
      };
    } catch (error) {
      const currentError = error instanceof Error ? error.message : String(error);
      if (envelope.backup != null) {
        try {
          return {
            currentError,
            snapshot: decodeWorkspaceSnapshot(envelope.backup),
            source: "backup",
          };
        } catch {
          return { currentError, snapshot: null, source: "none" };
        }
      }
      return { currentError, snapshot: null, source: "none" };
    }
  }
  if (envelope.backup != null) {
    try {
      return {
        currentError: null,
        snapshot: decodeWorkspaceSnapshot(envelope.backup),
        source: "backup",
      };
    } catch {
      return { currentError: null, snapshot: null, source: "none" };
    }
  }
  return { currentError: null, snapshot: null, source: "none" };
}

function parseInstance(value: unknown): WorkspaceSnapshotInstance {
  const item = record(value, "instance");
  const id = nonEmptyString(item.id, "instance.id");
  const target = parseTarget(item.target);
  if (item.kind === "ssh") {
    return { id, kind: "ssh", ordinal: ordinal(item.ordinal), target };
  }
  if (item.kind === "local") {
    const source =
      item.source === "telnet" || item.source === "serial" ? item.source : "local";
    return { id, kind: "local", ordinal: ordinal(item.ordinal), source, target };
  }
  if (item.kind === "rdp") return { id, kind: "rdp", target };
  if (item.kind === "vnc") return { id, kind: "vnc", target };
  throw new Error(`unsupported workspace instance kind: ${String(item.kind)}`);
}

function parseTarget(value: unknown): WorkspaceSnapshotTargetRef {
  const target = record(value, "instance.target");
  if (target.kind === "profile") {
    return { kind: "profile", profileId: nonEmptyString(target.profileId, "profileId") };
  }
  if (target.kind === "temporary") {
    return { kind: "temporary", targetId: nonEmptyString(target.targetId, "targetId") };
  }
  throw new Error(`unsupported workspace target kind: ${String(target.kind)}`);
}

function parsePane(
  value: unknown,
  liveIds: ReadonlySet<string>,
  depth: number,
): WorkspaceSnapshotPaneNode {
  if (depth > MAX_PANE_DEPTH) throw new Error("workspace pane tree is too deep");
  const node = record(value, "pane");
  const id = nonEmptyString(node.id, "pane.id");
  if (node.kind === "leaf") {
    const instanceId = typeof node.instanceId === "string" && liveIds.has(node.instanceId)
      ? node.instanceId
      : null;
    return { id, instanceId, kind: "leaf" };
  }
  if (node.kind !== "split") throw new Error(`unsupported pane kind: ${String(node.kind)}`);
  return {
    direction: node.direction === "column" ? "column" : "row",
    first: parsePane(node.first, liveIds, depth + 1),
    id,
    kind: "split",
    ratio: clampTerminalSplitRatio(number(node.ratio, "pane.ratio")),
    second: parsePane(node.second, liveIds, depth + 1),
  };
}

function sanitizeActiveItem(
  value: unknown,
  liveIds: ReadonlySet<string>,
  hasPanes: boolean,
): string | null {
  if (value === HOME_ITEM_ID) return HOME_ITEM_ID;
  if (value === SPLIT_ITEM_ID) return hasPanes ? SPLIT_ITEM_ID : null;
  return typeof value === "string" && liveIds.has(value) ? value : null;
}

function ordinal(value: unknown) {
  const parsed = number(value, "instance.ordinal");
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error("invalid instance ordinal");
  return parsed;
}

function number(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`invalid ${label}`);
  return value;
}

function nonEmptyString(value: unknown, label: string) {
  if (typeof value !== "string" || value.length === 0 || value.length > 4096) {
    throw new Error(`invalid ${label}`);
  }
  return value;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`invalid ${label}`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`invalid ${label}`);
  return value;
}

function dedupeStrings(values: unknown[]) {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    if (typeof value !== "string" || seen.has(value)) return [];
    seen.add(value);
    return [value];
  });
}
