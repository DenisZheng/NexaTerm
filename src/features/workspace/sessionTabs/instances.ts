import type { LocalTerminalTab } from "../../terminal/localTerminalTypes";
import type { TerminalPaneBinding } from "../../terminal/terminalSplitLayout";
import type { TerminalSplitHost } from "../split/actions";

import type { CloseSnapshot } from "./closeDecision";
import type { WorkspaceMode } from "./types";

/**
 * 工作区项投影 —— WF-01 切片 2（WS-M02 / WS-M03 / WS-M05 / WS-E11–E13）。
 *
 * 顶层标签代表会话实例：用 selector 从四个实例集合（SSH 终端、本地 / telnet / serial 终端、RDP、VNC）
 * 投影，不复制第二份会话数据；`SessionPointerState.order` 只负责排序。远程文件 tab 不是顶层项
 * （WS-E05：编辑器留在所属 SSH 工作区内）。纯函数，shell 在切片 3 接线。
 */

export const HOME_ITEM_ID = "home";
/** 同一时间至多一个分屏组，用固定 id；布局根节点 id 会随增减 pane 变化，不适合作身份。 */
export const SPLIT_ITEM_ID = "split";

export type InstanceKind = "local" | "rdp" | "ssh" | "vnc";

type LocalTerminalSource = NonNullable<LocalTerminalTab["source"]>;

export type InstanceItem =
  | { kind: "ssh"; id: string; connectionId: string; ordinal: number; tabId: string }
  | { kind: "local"; id: string; ordinal: number; profileId: string; source: LocalTerminalSource; tabId: string }
  | { kind: "rdp"; id: string; connectionId: string; sessionId: string }
  | { kind: "vnc"; id: string; connectionId: string; sessionId: string };

/** 能放进分屏 pane 的终端类实例。 */
export type TerminalInstanceItem = Extract<InstanceItem, { kind: "local" | "ssh" }>;

/** 分屏组（WS-E12）：成员不再单独成项；`host` 决定标题。 */
export interface SplitGroupItem {
  kind: "split";
  id: typeof SPLIT_ITEM_ID;
  host: TerminalInstanceItem;
  /** 按 pane 布局顺序的成员实例 id。 */
  memberIds: readonly string[];
}

export type WorkspaceItem = { kind: "home"; id: typeof HOME_ITEM_ID } | InstanceItem | SplitGroupItem;

/** 投影输入：shell 的四个实例集合，结构兼容，直接传即可。 */
export interface InstanceCollections {
  localTerminalTabs: readonly Pick<LocalTerminalTab, "id" | "ordinal" | "profileId" | "source">[];
  rdpSessions: readonly { connectionId: string; id: string }[];
  terminalTabs: readonly { connectionId: string; id: string; ordinal: number }[];
  vncSessions: readonly { connectionId: string; id: string }[];
}

/** 当前分屏组；分屏不存在时传 null。 */
export interface SplitGroupInput {
  /** 按 pane 布局顺序的已绑定 binding（空 pane 不含）。 */
  bindings: readonly TerminalPaneBinding[];
  host: TerminalSplitHost;
}

/** 实例项 id：`kind:原始id`。ssh / local 与 `terminalPaneBindingKey` 同格式，分屏成员可直接对应。 */
export function instanceItemId(kind: InstanceKind, rawId: string) {
  return `${kind}:${rawId}`;
}

/**
 * owner（SSH 连接 / 本地 profile / telnet-serial 连接）内下一个实例编号：现有最大值 + 1，0 起。
 * 编号在创建时写入实例、之后不变，只用于标题（WS-E11），不是排序位；关闭中间实例留下的空号不复用。
 */
export function nextOrdinal(ordinals: readonly number[]) {
  return Math.max(-1, ...ordinals) + 1;
}

/**
 * 顶层工作区项：首页恒在最前；实例按 `order` 排列，集合里有而表里没有的按 ssh → local → rdp → vnc
 * 的集合顺序补尾（顺序表与集合之间的不一致窗口），表里已不存在的 id 忽略。分屏成员折叠为一个分屏组项，
 * 占成员中最靠前的位置（WS-E12）。返回新数组，组件内需 useMemo。
 */
export function selectWorkspaceItems(
  collections: InstanceCollections,
  order: readonly string[],
  split: SplitGroupInput | null,
): WorkspaceItem[] {
  const instances = collectInstances(collections);
  const ordered: InstanceItem[] = [];
  const placed = new Set<string>();
  for (const id of order) {
    const item = instances.get(id);
    if (item) {
      ordered.push(item);
      placed.add(id);
    }
  }
  instances.forEach((item, id) => {
    if (!placed.has(id)) {
      ordered.push(item);
    }
  });

  const group = split ? buildSplitGroup(split, instances) : null;
  const memberIds = new Set(group?.memberIds);
  const items: WorkspaceItem[] = [{ kind: "home", id: HOME_ITEM_ID }];
  let groupPlaced = false;
  for (const item of ordered) {
    if (!memberIds.has(item.id)) {
      items.push(item);
    } else if (group && !groupPlaced) {
      items.push(group);
      groupPlaced = true;
    }
  }
  return items;
}

/** 四个集合 → 实例项；Map 插入顺序即补尾顺序（ssh → local → rdp → vnc，各自保持集合顺序）。 */
function collectInstances(collections: InstanceCollections) {
  const instances = new Map<string, InstanceItem>();
  for (const tab of collections.terminalTabs) {
    const id = instanceItemId("ssh", tab.id);
    instances.set(id, { kind: "ssh", id, connectionId: tab.connectionId, ordinal: tab.ordinal, tabId: tab.id });
  }
  for (const tab of collections.localTerminalTabs) {
    const id = instanceItemId("local", tab.id);
    instances.set(id, {
      kind: "local",
      id,
      ordinal: tab.ordinal,
      profileId: tab.profileId,
      // source 是可选字段，缺省即本地 shell。
      source: tab.source ?? "local",
      tabId: tab.id,
    });
  }
  for (const session of collections.rdpSessions) {
    const id = instanceItemId("rdp", session.id);
    instances.set(id, { kind: "rdp", id, connectionId: session.connectionId, sessionId: session.id });
  }
  for (const session of collections.vncSessions) {
    const id = instanceItemId("vnc", session.id);
    instances.set(id, { kind: "vnc", id, connectionId: session.connectionId, sessionId: session.id });
  }
  return instances;
}

/**
 * 成员为 binding 仍指向现存实例的 pane（按布局顺序）；没有可用成员时不成项。
 * 分屏宿主在代码里是连接级（某个 ssh 连接 / 本地），标题取 pane 顺序中第一个属于宿主的成员，找不到则取第一个成员。
 */
function buildSplitGroup(
  split: SplitGroupInput,
  instances: ReadonlyMap<string, InstanceItem>,
): SplitGroupItem | null {
  const members: TerminalInstanceItem[] = [];
  for (const binding of split.bindings) {
    const item = instances.get(instanceItemId(binding.kind, binding.tabId));
    if (item?.kind === "ssh" || item?.kind === "local") {
      members.push(item);
    }
  }
  if (members.length === 0) {
    return null;
  }
  const host = members.find((item) => belongsToHost(item, split.host)) ?? members[0];
  return { kind: "split", id: SPLIT_ITEM_ID, host, memberIds: members.map((item) => item.id) };
}

function belongsToHost(item: TerminalInstanceItem, host: TerminalSplitHost) {
  return host.kind === "ssh" ? item.kind === "ssh" && item.connectionId === host.connectionId : item.kind === "local";
}

/** 标题查找；名称可能查不到（连接已删除、profile 已隐藏），此时返回 null。 */
export interface ItemTitleLookups {
  /** 已保存连接名：SSH / RDP / VNC，以及 telnet / serial（其 profileId 即连接 id）共用。 */
  connectionName: (connectionId: string) => string | null;
  localProfileName: (profileId: string) => string | null;
}

/**
 * 实例标签标题的结构化描述（WS-E11：`配置名 · 终端 N`、`profile 名 · N`、`配置名 · RDP / VNC`）。
 * 这里不拼文案（WS-E09 不新增硬编码中文），由 UI 经 i18n 格式化；`ordinal` 为 owner 内 0 起编号，
 * 显示基数在切片 3 接 UI 时与终端内部标题一起确定。`name` 为 null 时回退文案由 UI 决定。
 */
export type WorkspaceItemTitle =
  | { kind: "home" }
  | { kind: "local"; name: string | null; ordinal: number }
  | { kind: "rdp"; name: string | null }
  | { kind: "ssh"; name: string | null; ordinal: number }
  | { kind: "vnc"; name: string | null };

export function itemTitle(item: WorkspaceItem, lookups: ItemTitleLookups): WorkspaceItemTitle {
  switch (item.kind) {
    case "home":
      return { kind: "home" };
    case "ssh":
      return { kind: "ssh", name: lookups.connectionName(item.connectionId), ordinal: item.ordinal };
    case "local":
      return {
        kind: "local",
        name:
          item.source === "local"
            ? lookups.localProfileName(item.profileId)
            : lookups.connectionName(item.profileId),
        ordinal: item.ordinal,
      };
    case "rdp":
      return { kind: "rdp", name: lookups.connectionName(item.connectionId) };
    case "vnc":
      return { kind: "vnc", name: lookups.connectionName(item.connectionId) };
    case "split":
      return itemTitle(item.host, lookups);
  }
}

/**
 * shell 已解析好的活动状态（WS-M03"活动工作区项"的来源）。RDP / VNC 传 `selectActiveSession` 的结果而非原始指针：
 * 活动会话有按连接回退的规则，这里不重复实现。
 */
export interface ActiveInstanceRefs {
  localTerminalTabId: string | null;
  mode: WorkspaceMode;
  rdpSessionId: string | null;
  /** shell 的 showingHome：mode 为 home，或工作区为空且首页记忆位为真。 */
  showingHome: boolean;
  /** 分屏面正在显示（shell 的 terminalSplitActive）。 */
  splitActive: boolean;
  terminalTabId: string | null;
  vncSessionId: string | null;
}

/**
 * 活动工作区项 id：显示首页时为首页；终端模式下分屏面正在显示、或活动实例是分屏成员时为分屏组；
 * 否则为当前 mode 的活动实例。活动实例不在 items 里（已关闭、只剩远程文件 tab 等）时为 null。
 */
export function selectActiveItemId(active: ActiveInstanceRefs, items: readonly WorkspaceItem[]): string | null {
  if (active.showingHome) {
    return HOME_ITEM_ID;
  }
  const split = items.find((item): item is SplitGroupItem => item.kind === "split") ?? null;
  const terminalMode = active.mode === "ssh" || active.mode === "local";
  if (split && terminalMode && active.splitActive) {
    return split.id;
  }
  const instanceId = activeInstanceId(active);
  if (!instanceId) {
    return null;
  }
  if (split?.memberIds.includes(instanceId)) {
    return split.id;
  }
  return items.some((item) => item.id === instanceId) ? instanceId : null;
}

function activeInstanceId(active: ActiveInstanceRefs) {
  switch (active.mode) {
    case "ssh":
      return active.terminalTabId ? instanceItemId("ssh", active.terminalTabId) : null;
    case "local":
      return active.localTerminalTabId ? instanceItemId("local", active.localTerminalTabId) : null;
    case "rdp":
      return active.rdpSessionId ? instanceItemId("rdp", active.rdpSessionId) : null;
    case "vnc":
      return active.vncSessionId ? instanceItemId("vnc", active.vncSessionId) : null;
    case "home":
      return null;
  }
}

/**
 * 关闭 / 删除后仍存在的实例项 id，用于裁剪顺序表。传 `closingConnectionIds`（closeConnections）时，
 * 快照里被关闭连接的终端 / RDP / VNC 一并排除，与 `decideConnectionClose` 的防御性过滤一致。
 */
export function liveInstanceIds(snapshot: CloseSnapshot, closingConnectionIds?: ReadonlySet<string>) {
  const kept = (ref: { connectionId: string }) => !closingConnectionIds?.has(ref.connectionId);
  return new Set([
    ...snapshot.terminalTabs.filter(kept).map((tab) => instanceItemId("ssh", tab.id)),
    ...snapshot.localTerminalTabs.map((tab) => instanceItemId("local", tab.id)),
    ...snapshot.rdpSessions.filter(kept).map((session) => instanceItemId("rdp", session.id)),
    ...snapshot.vncSessions.filter(kept).map((session) => instanceItemId("vnc", session.id)),
  ]);
}
