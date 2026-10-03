import type { ConnectionGroup } from "./connectionGroupModel";
import type {
  ConnectionProtocol,
  ConnectionProfile,
} from "./connectionTypes";

export const batchConnectMaxNewSessions = 20;
export const batchConnectMaxConcurrentAttempts = 4;

export type BatchConnectItemStatus =
  | "queued"
  | "connecting"
  | "waiting-user"
  | "success"
  | "failed"
  | "cancelled";

type BatchConnectProfile = Pick<
  ConnectionProfile,
  "credential_mode" | "group_id" | "id" | "name" | "protocol" | "rdp" | "vnc"
>;

type BatchConnectGroup = Pick<
  ConnectionGroup,
  "id" | "name" | "parentId" | "sortOrder"
>;

export interface BatchConnectCandidate {
  alreadyOpen: boolean;
  connectionId: string;
  groupId: string;
  groupPath: string;
  name: string;
  protocol: ConnectionProtocol;
  requiresInteraction: boolean;
}

export interface BatchConnectPreviewPlan {
  candidates: BatchConnectCandidate[];
  eligibleCount: number;
  selectedConnectionIds: string[];
  selectionLimitReached: boolean;
}

export interface BatchConnectRunItem {
  connectionId: string;
  error: string | null;
  status: BatchConnectItemStatus;
}

export interface BatchConnectRun {
  cancelRequested: boolean;
  items: BatchConnectRunItem[];
}

export interface BatchConnectCancelPlan {
  activeConnectionIds: string[];
  run: BatchConnectRun;
}

export function buildBatchConnectPreviewPlan(input: {
  connections: readonly BatchConnectProfile[];
  groups: readonly BatchConnectGroup[];
  includeDescendants: boolean;
  openConnectionIds?: ReadonlySet<string>;
  rootGroupId: string;
  selectionLimit?: number;
}): BatchConnectPreviewPlan {
  const {
    connections,
    groups,
    includeDescendants,
    rootGroupId,
    openConnectionIds = new Set<string>(),
    selectionLimit = batchConnectMaxNewSessions,
  } = input;
  const orderedGroups = collectGroups(groups, rootGroupId, includeDescendants);
  const pathById = new Map(
    orderedGroups.map((group) => [group.id, resolveGroupPath(groups, group.id)]),
  );
  const candidates = orderedGroups.flatMap((group) =>
    connections
      .filter((connection) => connection.group_id === group.id)
      .map(
        (connection): BatchConnectCandidate => ({
          alreadyOpen: openConnectionIds.has(connection.id),
          connectionId: connection.id,
          groupId: group.id,
          groupPath: pathById.get(group.id) || group.name,
          name: connection.name,
          protocol: connection.protocol || "ssh",
          requiresInteraction: requiresInteractiveCredential(connection),
        }),
      ),
  );
  const eligible = candidates.filter((candidate) => !candidate.alreadyOpen);
  const normalizedLimit = Math.max(0, selectionLimit);

  return {
    candidates,
    eligibleCount: eligible.length,
    selectedConnectionIds: eligible
      .slice(0, normalizedLimit)
      .map((candidate) => candidate.connectionId),
    selectionLimitReached: eligible.length > normalizedLimit,
  };
}

export function createBatchConnectRun(connectionIds: readonly string[]): BatchConnectRun {
  const seen = new Set<string>();
  return {
    cancelRequested: false,
    items: connectionIds.flatMap((connectionId) => {
      if (seen.has(connectionId)) return [];
      seen.add(connectionId);
      return [{ connectionId, error: null, status: "queued" as const }];
    }),
  };
}

export function batchConnectActiveCount(run: BatchConnectRun) {
  return run.items.filter((item) => isActiveStatus(item.status)).length;
}

export function nextBatchConnectConnectionIds(
  run: BatchConnectRun,
  concurrencyLimit = batchConnectMaxConcurrentAttempts,
) {
  if (run.cancelRequested) return [];
  const availableSlots = Math.max(0, concurrencyLimit - batchConnectActiveCount(run));
  if (availableSlots === 0) return [];
  return run.items
    .filter((item) => item.status === "queued")
    .slice(0, availableSlots)
    .map((item) => item.connectionId);
}

export function updateBatchConnectItem(
  run: BatchConnectRun,
  connectionId: string,
  status: BatchConnectItemStatus,
  error: string | null = null,
): BatchConnectRun {
  let changed = false;
  const items = run.items.map((item) => {
    if (item.connectionId !== connectionId) return item;
    const nextError = status === "failed" ? error : null;
    if (item.status === status && item.error === nextError) return item;
    changed = true;
    return { ...item, error: nextError, status };
  });
  return changed ? { ...run, items } : run;
}

export function requestBatchConnectCancel(run: BatchConnectRun): BatchConnectCancelPlan {
  const activeConnectionIds = run.items
    .filter((item) => isActiveStatus(item.status))
    .map((item) => item.connectionId);
  const items = run.items.map((item) =>
    item.status === "queued" ? { ...item, status: "cancelled" as const } : item,
  );
  return {
    activeConnectionIds,
    run: {
      cancelRequested: true,
      items,
    },
  };
}

export function retryFailedBatchConnectItems(run: BatchConnectRun): BatchConnectRun {
  let changed = run.cancelRequested;
  const items = run.items.map((item) => {
    if (item.status !== "failed") return item;
    changed = true;
    return { ...item, error: null, status: "queued" as const };
  });
  return changed ? { cancelRequested: false, items } : run;
}

export function batchConnectSummary(run: BatchConnectRun) {
  const counts: Record<BatchConnectItemStatus, number> = {
    queued: 0,
    connecting: 0,
    "waiting-user": 0,
    success: 0,
    failed: 0,
    cancelled: 0,
  };
  for (const item of run.items) counts[item.status] += 1;
  return counts;
}

function collectGroups(
  groups: readonly BatchConnectGroup[],
  rootGroupId: string,
  includeDescendants: boolean,
) {
  const root = groups.find((group) => group.id === rootGroupId);
  if (!root) return [];

  const originalIndex = new Map(groups.map((group, index) => [group.id, index]));
  const childrenByParent = new Map<string, BatchConnectGroup[]>();
  for (const group of groups) {
    if (!group.parentId) continue;
    const children = childrenByParent.get(group.parentId) || [];
    children.push(group);
    childrenByParent.set(group.parentId, children);
  }
  for (const children of childrenByParent.values()) {
    children.sort(
      (left, right) =>
        left.sortOrder - right.sortOrder ||
        (originalIndex.get(left.id) || 0) - (originalIndex.get(right.id) || 0),
    );
  }

  const ordered: BatchConnectGroup[] = [];
  const visited = new Set<string>();
  function visit(group: BatchConnectGroup) {
    if (visited.has(group.id)) return;
    visited.add(group.id);
    ordered.push(group);
    if (!includeDescendants) return;
    for (const child of childrenByParent.get(group.id) || []) visit(child);
  }
  visit(root);
  return ordered;
}

function resolveGroupPath(groups: readonly BatchConnectGroup[], groupId: string) {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const names: string[] = [];
  const visited = new Set<string>();
  let current = byId.get(groupId) || null;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    names.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) || null : null;
  }
  return names.join(" / ");
}

function requiresInteractiveCredential(
  connection: Pick<ConnectionProfile, "credential_mode" | "protocol" | "rdp" | "vnc">,
) {
  if (connection.protocol === "rdp") {
    return (
      connection.rdp?.security.credential_mode === "prompt" ||
      connection.rdp?.gateway?.credential_source === "prompt"
    );
  }
  if (connection.protocol === "vnc") {
    return connection.vnc?.security.credential_mode === "prompt";
  }
  return connection.credential_mode === "prompt";
}

function isActiveStatus(status: BatchConnectItemStatus) {
  return status === "connecting" || status === "waiting-user";
}
