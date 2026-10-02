/** 后端目录的显示投影；路径用于展示，所有选择与归属使用稳定 ID。 */
export interface ConnectionGroup {
  id: string;
  name: string;
  parentId: string | null;
  color: string;
  sortOrder: number;
}

export interface StoredConnectionGroup {
  id: string;
  name: string;
  parent_id: string | null;
  color: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ConnectionGroupInput {
  id?: string;
  name: string;
  parent_id: string | null;
  color: string;
}

export interface LegacyGroupRow { id: string; name: string; color: string; parentId: string | null }
export interface LegacyGroupResolution { index: number; name: string; parent_index: number | null; target_id: string | null }
export interface LegacyGroupReport {
  complete: boolean;
  backup_path: string;
  issue: string | null;
  rows: LegacyGroupRow[];
  mappings: { legacy_id: string; canonical_id: string }[];
  repairs: string[];
}

/** 展开状态单独迁移；旧 v1 保留，成功后 v2 不再受旧 ID 影响。 */
export function migrateGroupExpansion(storage: Storage, report: LegacyGroupReport) {
  const key = "mxterm.connectionExpandedFolders.v2";
  if (!report.complete || storage.getItem(key) !== null) return;
  const raw = storage.getItem("mxterm.connectionExpandedFolders.v1");
  let previous: Record<string, unknown> = {};
  try { const value: unknown = raw ? JSON.parse(raw) : {}; if (value && typeof value === "object" && !Array.isArray(value)) previous = value as Record<string, unknown>; }
  catch { /* 展开状态损坏不影响业务树；旧原文保留。 */ }
  const next: Record<string, boolean> = {};
  for (const key of ["favorites", "recent"]) if (typeof previous[key] === "boolean") next[key] = previous[key];
  for (const mapping of report.mappings) {
    const expanded = previous[`group-${mapping.legacy_id}`];
    if (typeof expanded === "boolean") next[`group-${mapping.canonical_id}`] = expanded;
  }
  storage.setItem(key, JSON.stringify(next));
}

export function groupOptions(groups: Pick<ConnectionGroup, "id" | "name" | "parentId">[]) {
  const byId = new Map(groups.map((group) => [group.id, group]));
  return groups.map((group) => {
    const names = [group.name];
    const visited = new Set([group.id]);
    let parent = group.parentId;
    while (parent && !visited.has(parent)) {
      visited.add(parent);
      const ancestor = byId.get(parent);
      if (!ancestor) break;
      names.unshift(ancestor.name);
      parent = ancestor.parentId;
    }
    return { value: group.id, label: names.join(" / ") };
  });
}

export function groupDescendants(groups: ConnectionGroup[], id: string): Set<string> {
  const ids = new Set([id]);
  const pending = [id];
  while (pending.length) {
    const parent = pending.pop();
    for (const group of groups) {
      if (group.parentId === parent && !ids.has(group.id)) {
        ids.add(group.id);
        pending.push(group.id);
      }
    }
  }
  return ids;
}
