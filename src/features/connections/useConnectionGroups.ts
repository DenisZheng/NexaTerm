import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { connectionGroupMigrateLegacy, connectionGroupAssign, connectionGroupDelete, connectionGroupList, connectionGroupSave } from "../../shared/tauri/commands";
import { hasTauriRuntime } from "../../shared/tauri/runtime";
import type { ConnectionProfile } from "./connectionTypes";
import { migrateGroupExpansion, type LegacyGroupReport, type LegacyGroupResolution, type ConnectionGroup, type ConnectionGroupInput } from "./connectionGroupModel";

/** 目录只持后端投影；旧树原文仅交给一次性迁移，不再作为业务 owner。 */
export function useConnectionGroups(enabled: boolean, connections: ConnectionProfile[], reloadConnections: () => Promise<void>) {
  const [migration, setMigration] = useState<LegacyGroupReport | null>(null);
  const [groups, setGroups] = useState<ConnectionGroup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  const requestId = useRef(0);
  const legacyRaw = useRef<string | null>(null);
  const refreshedAfterMigration = useRef(false);
  const reloadConnectionsRef = useRef(reloadConnections);
  reloadConnectionsRef.current = reloadConnections;
  const reload = useCallback(async (resolutions?: LegacyGroupResolution[]) => {
    const request = ++requestId.current;
    setReady(false);
    if (!enabled || !hasTauriRuntime()) {
      setGroups([]);
      return;
    }
    try {
      const legacy = window.localStorage.getItem("mxterm.connectionGroups.v2");
      if (resolutions && legacy !== legacyRaw.current) throw new Error("旧分组原文已变化，请关闭对话框并刷新后重新确认映射。");
      legacyRaw.current = legacy;
      const report = await connectionGroupMigrateLegacy(legacy, resolutions);
      if (request !== requestId.current) return;
      setMigration(report);
      if (report.complete) migrateGroupExpansion(window.localStorage, report);
      const rows = await connectionGroupList();
      if (request !== requestId.current) return;
      setGroups(rows.map((row) => ({ id: row.id, name: row.name, parentId: row.parent_id, color: row.color, sortOrder: row.sort_order })));
      setError(report.issue);
      setReady(report.complete);
      if (report.complete && !refreshedAfterMigration.current) {
        refreshedAfterMigration.current = true;
        await reloadConnectionsRef.current();
      }
      return report.complete;
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
  const resolveMigration = useCallback(async (resolutions?: LegacyGroupResolution[]) => {
    if (active.current) throw new Error("正在迁移，请稍后重试。");
    active.current = true;
    setBusy(true);
    try {
      if (!await reload(resolutions)) throw new Error("迁移未完成，请查看报告并调整映射后重试。");
    } finally { active.current = false; setBusy(false); }
  }, [reload]);
  const save = useCallback((input: ConnectionGroupInput) => mutate(() => connectionGroupSave(input)), [mutate]);
  const remove = useCallback((id: string) => mutate(() => connectionGroupDelete(id)), [mutate]);
  const assign = useCallback((connection: ConnectionProfile, id: string | null) => mutate(() => connectionGroupAssign(connection.id, id)), [mutate]);
  const assignments = useMemo(() => Object.fromEntries(connections.filter((c) => c.group_id).map((c) => [c.id, c.group_id!])), [connections]);
  return { groups, assignments, error, ready, busy, reload, save, remove, assign, migration, resolveMigration };
}

export function groupErrorMessage(cause: unknown) {
  return cause && typeof cause === "object" && "message" in cause ? String(cause.message) : String(cause);
}
