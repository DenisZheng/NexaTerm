import type { LocalTerminalTab } from "../../terminal/localTerminalTypes";
import type { TerminalPaneBinding, TerminalSplitNode } from "../../terminal/terminalSplitLayout";
import type {
  RdpSessionTab,
  TerminalTab as SessionTerminalTab,
  VncSessionTab,
} from "../sessionTabs/types";
import type {
  WorkspaceSnapshotInstance,
  WorkspaceSnapshotPaneNode,
  WorkspaceSnapshotV1,
} from "./snapshotTypes";
import type { WorkspaceRestoreItem, WorkspaceRestorePlan } from "./restorePlan";

export type RestoredTerminalTab = SessionTerminalTab<never>;

export type WorkspaceShellRestoreTarget =
  | { kind: "home" }
  | { kind: "split"; host: TerminalPaneBinding }
  | { kind: "ssh"; connectionId: string; tabId: string }
  | { kind: "local"; tabId: string }
  | { kind: "rdp"; connectionId: string; sessionId: string }
  | { kind: "vnc"; connectionId: string; sessionId: string };

export interface WorkspaceShellRestoreLookups {
  connectionName?: (connectionId: string) => string | null;
  localProfile?: (profileId: string) => { kind: string; name: string } | null;
}

export interface WorkspaceShellHydration {
  active: WorkspaceShellRestoreTarget;
  focusedPaneId: string | null;
  localTerminalTabs: LocalTerminalTab[];
  rdpSessions: RdpSessionTab[];
  splitHost: TerminalPaneBinding | null;
  splitLayout: TerminalSplitNode | null;
  terminalTabs: RestoredTerminalTab[];
  vncSessions: VncSessionTab[];
}

export function buildWorkspaceShellHydration(
  snapshot: WorkspaceSnapshotV1,
  lookups: WorkspaceShellRestoreLookups = {},
): WorkspaceShellHydration {
  const byId = new Map(snapshot.instances.map((instance) => [instance.id, instance]));
  const terminalTabs = snapshot.instances.flatMap((instance): RestoredTerminalTab[] => {
    if (instance.kind !== "ssh") return [];
    const tabId = rawInstanceId(instance);
    const connectionId = targetId(instance);
    return [{
      connectionId,
      id: tabId,
      ordinal: instance.ordinal,
      status: "restored",
      title: lookups.connectionName?.(connectionId) || connectionId,
      type: "terminal",
      warmupOutput: [],
    }];
  });
  const localTerminalTabs = snapshot.instances.flatMap((instance): LocalTerminalTab[] => {
    if (instance.kind !== "local") return [];
    const tabId = rawInstanceId(instance);
    const profileId = targetId(instance);
    const profile = instance.source === "local" ? lookups.localProfile?.(profileId) || null : null;
    return [{
      id: tabId,
      ordinal: instance.ordinal,
      profileId,
      profileKind: profile?.kind || instance.source,
      source: instance.source,
      status: "restored",
      title: profile?.name || lookups.connectionName?.(profileId) || profileId,
      warmupOutput: [],
    }];
  });
  const rdpSessions = snapshot.instances.flatMap((instance): RdpSessionTab[] => {
    if (instance.kind !== "rdp") return [];
    const sessionId = rawInstanceId(instance);
    const connectionId = targetId(instance);
    return [{
      connectionId,
      createdAt: 0,
      id: sessionId,
      message: "workspace-restored",
      status: "error",
      title: lookups.connectionName?.(connectionId) || connectionId,
    }];
  });
  const vncSessions = snapshot.instances.flatMap((instance): VncSessionTab[] => {
    if (instance.kind !== "vnc") return [];
    const sessionId = rawInstanceId(instance);
    const connectionId = targetId(instance);
    return [{
      connectionId,
      createdAt: 0,
      id: sessionId,
      message: "workspace-restored",
      status: "error",
      title: lookups.connectionName?.(connectionId) || connectionId,
    }];
  });
  const splitLayout = snapshot.panes ? restorePane(snapshot.panes, byId) : null;
  const splitHost = splitLayout ? firstBinding(splitLayout) : null;
  const focusedPaneId = splitLayout ? firstBoundPaneId(splitLayout) : null;

  return {
    active: restoreActive(snapshot.activeItemId, byId, splitHost),
    focusedPaneId,
    localTerminalTabs,
    rdpSessions,
    splitHost,
    splitLayout,
    terminalTabs,
    vncSessions,
  };
}

export function applyWorkspaceRestorePlanToHydration(
  hydration: WorkspaceShellHydration,
  plan: WorkspaceRestorePlan,
): WorkspaceShellHydration {
  const byId = new Map(plan.items.map((item) => [item.instance.id, item]));
  return {
    ...hydration,
    terminalTabs: hydration.terminalTabs.map((tab) => ({
      ...tab,
      ...terminalRestoreState(byId.get(`ssh:${tab.id}`)),
    })),
    localTerminalTabs: hydration.localTerminalTabs.map((tab) => ({
      ...tab,
      ...terminalRestoreState(byId.get(`local:${tab.id}`)),
    })),
    rdpSessions: hydration.rdpSessions.map((session) => ({
      ...session,
      ...desktopRestoreState(byId.get(`rdp:${session.id}`)),
    })),
    vncSessions: hydration.vncSessions.map((session) => ({
      ...session,
      ...desktopRestoreState(byId.get(`vnc:${session.id}`)),
    })),
  };
}

function terminalRestoreState(item: WorkspaceRestoreItem | undefined) {
  if (!item) return { error: "工作区恢复项缺失。", status: "连接失败" };
  if (item.status === "missing-profile") {
    return { error: "保存的连接或终端配置已不存在，可修复配置后重试。", status: "连接失败" };
  }
  if (item.status === "temporary-auth-required") {
    return { error: "临时连接凭据不会持久化，请重新建立或认证该连接。", status: "连接失败" };
  }
  return item.autoReconnect
    ? { error: undefined, status: "正在恢复" }
    : { error: "工作区已恢复；自动重连未开启，可手动重试。", status: "连接失败" };
}

function desktopRestoreState(item: WorkspaceRestoreItem | undefined) {
  const state = terminalRestoreState(item);
  return {
    error: state.error || null,
    message: state.error ? null : "工作区已恢复；桌面会话保持停止，可手动重试。",
    status: "error" as const,
  };
}

function restoreActive(
  activeItemId: string | null,
  byId: ReadonlyMap<string, WorkspaceSnapshotInstance>,
  splitHost: TerminalPaneBinding | null,
): WorkspaceShellRestoreTarget {
  if (activeItemId === "home" || !activeItemId) return { kind: "home" };
  if (activeItemId === "split" && splitHost) return { kind: "split", host: splitHost };
  const instance = byId.get(activeItemId);
  if (!instance) return { kind: "home" };
  const id = rawInstanceId(instance);
  const ownerId = targetId(instance);
  if (instance.kind === "ssh") return { kind: "ssh", connectionId: ownerId, tabId: id };
  if (instance.kind === "local") return { kind: "local", tabId: id };
  if (instance.kind === "rdp") return { kind: "rdp", connectionId: ownerId, sessionId: id };
  return { kind: "vnc", connectionId: ownerId, sessionId: id };
}

function restorePane(
  node: WorkspaceSnapshotPaneNode,
  byId: ReadonlyMap<string, WorkspaceSnapshotInstance>,
): TerminalSplitNode {
  if (node.kind === "leaf") {
    const instance = node.instanceId ? byId.get(node.instanceId) || null : null;
    const binding = instance && (instance.kind === "ssh" || instance.kind === "local")
      ? { kind: instance.kind, tabId: rawInstanceId(instance) } satisfies TerminalPaneBinding
      : undefined;
    return { binding, id: node.id, kind: "leaf" };
  }
  return {
    direction: node.direction,
    first: restorePane(node.first, byId),
    id: node.id,
    kind: "split",
    ratio: node.ratio,
    second: restorePane(node.second, byId),
  };
}

function firstBinding(node: TerminalSplitNode): TerminalPaneBinding | null {
  if (node.kind === "leaf") return node.binding || null;
  return firstBinding(node.first) || firstBinding(node.second);
}

function firstBoundPaneId(node: TerminalSplitNode): string | null {
  if (node.kind === "leaf") return node.binding ? node.id : null;
  return firstBoundPaneId(node.first) || firstBoundPaneId(node.second);
}

function rawInstanceId(instance: WorkspaceSnapshotInstance) {
  const prefix = `${instance.kind}:`;
  if (!instance.id.startsWith(prefix) || instance.id.length === prefix.length) {
    throw new Error(`invalid workspace instance id for ${instance.kind}: ${instance.id}`);
  }
  return instance.id.slice(prefix.length);
}

function targetId(instance: WorkspaceSnapshotInstance) {
  return instance.target.kind === "profile" ? instance.target.profileId : instance.target.targetId;
}
