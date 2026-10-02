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
