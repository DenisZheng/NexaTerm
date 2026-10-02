import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { connectionGroupAssign, connectionGroupDelete, connectionGroupList, connectionGroupSave } from "../../shared/tauri/commands";
import { hasTauriRuntime } from "../../shared/tauri/runtime";
import type { ConnectionProfile } from "./connectionTypes";
import type { ConnectionGroup, ConnectionGroupInput } from "./connectionGroupModel";

/** 只有成功的后端读取才能更新目录；localStorage 树暂存待 04A-4 一次性迁移。 */
export function useConnectionGroups(enabled: boolean, connections: ConnectionProfile[], reloadConnections: () => Promise<void>) {
  const [groups, setGroups] = useState<ConnectionGroup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  const requestId = useRef(0);
  const reload = useCallback(async () => {
    const request = ++requestId.current;
    setReady(false);
    if (!enabled || !hasTauriRuntime()) {
      setGroups([]);
      return;
    }
    try {
      // 不解析后回写、不删除旧原文；迁移完成前禁止树写入。
      const legacy = window.localStorage.getItem("mxterm.connectionGroups.v2");
      if (legacy && legacy.trim() !== "[]") {
        throw new Error("旧分组树等待迁移，原始数据已保留。当前切片暂不允许修改分组。");
      }
      const rows = await connectionGroupList();
      if (request !== requestId.current) return;
      setGroups(rows.map((row) => ({ id: row.id, name: row.name, parentId: row.parent_id, color: row.color, sortOrder: row.sort_order })));
      setError(null);
      setReady(true);
    } catch (cause) {
      if (request === requestId.current) setError(groupErrorMessage(cause));
    }
  }, [enabled]);
  useEffect(() => {
    void reload();
    return () => { requestId.current += 1; };
  }, [reload, connections]);
  const mutate = useCallback(async (operation: () => Promise<unknown>) => {
    if (!ready || active.current) throw new Error("分组尚未就绪或正在保存，请稍后重试。");
    active.current = true;
    setBusy(true);
    try {
      await operation();
      await reloadConnections();
      await reload();
    } catch (cause) {
      setError(groupErrorMessage(cause));
      throw cause;
    } finally {
      active.current = false;
      setBusy(false);
    }
  }, [ready, reload, reloadConnections]);
  const save = useCallback((input: ConnectionGroupInput) => mutate(() => connectionGroupSave(input)), [mutate]);
  const remove = useCallback((id: string) => mutate(() => connectionGroupDelete(id)), [mutate]);
  const assign = useCallback((connection: ConnectionProfile, id: string | null) => mutate(() => connectionGroupAssign(connection.id, id)), [mutate]);
  const assignments = useMemo(() => Object.fromEntries(connections.filter((c) => c.group_id).map((c) => [c.id, c.group_id!])), [connections]);
  return { groups, assignments, error, ready, busy, reload, save, remove, assign };
}

export function groupErrorMessage(cause: unknown) {
  return cause && typeof cause === "object" && "message" in cause ? String(cause.message) : String(cause);
}
