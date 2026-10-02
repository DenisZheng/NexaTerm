import { terminalPaneBindingKey, type TerminalSplitPane } from "../../terminal/terminalSplitLayout";
import type { WorkspaceItem } from "./instances";
import {
  currentRemoteFileTransferClosePolicy,
  planRemoteFileTransferClose,
  type RemoteFileTransferCloseCandidate,
  type RemoteFileTransferClosePolicy,
} from "../../files/remoteFileTransferClosePolicy";

/**
 * 关闭操作的范围与计划 —— WF-01 切片 3（WS-M02 标签即实例 / WS-E05 编辑器随所属 SSH 工作区 / WS-E12 分屏组一个标签 / WS-F08 未保存编辑的关闭确认）。
 *
 * 顶栏的"关闭 / 关闭其他 / 关闭右侧 / 全部关闭"、分屏组关闭、以及工作区内会关掉 SSH 终端的入口，
 * 都先把选中的实例翻译成一份关闭计划，再由 shell 分派到 WF-00B 现有的关闭路径
 * （closeTerminalTabs / closeLocalTerminalTabs / closeRdpSessions / closeVncSessions / closeConnectionSessions），
 * 不新增第二套关闭逻辑。关闭后的激活项仍由各路径的 closeDecision 决定。纯函数；确认状态见 `useCloseRequest`。
 */

export type CloseScope = "all" | "others" | "right" | "self";

/** 按顶栏顺序算出要关闭的项；首页不可关闭，任何范围都不含首页。 */
export function closeScopeItemIds(
  items: readonly WorkspaceItem[],
  targetId: string,
  scope: CloseScope,
): string[] {
  const closable = items.filter((item) => item.kind !== "home").map((item) => item.id);
  switch (scope) {
    case "self":
      return closable.includes(targetId) ? [targetId] : [];
    case "others":
      return closable.filter((id) => id !== targetId);
    case "right": {
      const index = closable.indexOf(targetId);
      return index < 0 ? [] : closable.slice(index + 1);
    }
    case "all":
      return closable;
  }
}

/** 一次关闭操作的请求：只记录"关什么"，计划在执行（或确认）时按当时的实例状态计算。 */
export interface CloseRequest {
  /** 要关闭的实例 id（`ssh:` / `local:` / `rdp:` / `vnc:`）；分屏成员也可直接指定。 */
  instanceIds: readonly string[];
  /** 删除指定 pane；计划时按当前 pane 重新解析 binding，空 pane 只改布局。 */
  splitPaneIds?: readonly string[];
  /** 拆除分屏组：其当前成员（`CloseContext.splitMemberIds`）一并关闭。 */
  splitGroup: boolean;
}

/** 顶栏项 → 关闭请求：实例项按 id 关闭，分屏组项表示拆组；首页与未知 id 忽略。 */
export function closeRequestFromItems(itemIds: readonly string[], items: readonly WorkspaceItem[]): CloseRequest {
  const selected = new Set(itemIds);
  const instanceIds: string[] = [];
  let splitGroup = false;
  for (const item of items) {
    if (!selected.has(item.id) || item.kind === "home") {
      continue;
    }
    if (item.kind === "split") {
      splitGroup = true;
    } else {
      instanceIds.push(item.id);
    }
  }
  return { instanceIds, splitGroup };
}

/** 计划所需的当前状态；shell 从 ref 与渲染态组装，结构兼容即可直接传入。 */
export interface CloseContext {
  localTerminalTabs: readonly { id: string }[];
  rdpSessions: readonly { id: string }[];
  remoteFileTabs: readonly { connectionId: string; dirty: boolean; name: string }[];
  remoteFileTransfers?: readonly RemoteFileTransferCloseCandidate[];
  /** 当前分屏组成员实例 id（按 pane 顺序）；没有分屏时为空。 */
  splitMemberIds: readonly string[];
  /** 当前 pane 与实例的映射；用于确认后重算单 pane 关闭。 */
  splitPanes?: readonly { id: string; instanceId: string | null }[];
  terminalTabs: readonly { connectionId: string; id: string }[];
  vncSessions: readonly { id: string }[];
}

/** 从 shell 当前集合组装纯关闭上下文；只提取 planClose 需要的字段，不持有 UI 状态。 */
export function buildCloseContext(
  localTerminalTabs: readonly { id: string }[],
  rdpSessions: readonly { id: string }[],
  remoteFileTabs: readonly { connectionId: string; dirty: boolean; name: string }[],
  terminalSplitPanes: readonly Pick<TerminalSplitPane, "binding" | "id">[],
  terminalTabs: readonly { connectionId: string; id: string }[],
  vncSessions: readonly { id: string }[],
  remoteFileTransfers?: readonly RemoteFileTransferCloseCandidate[],
): CloseContext {
  return {
    localTerminalTabs: localTerminalTabs.map(({ id }) => ({ id })),
    rdpSessions: rdpSessions.map(({ id }) => ({ id })),
    remoteFileTabs: remoteFileTabs.map(({ connectionId, dirty, name }) => ({ connectionId, dirty, name })),
    ...(remoteFileTransfers ? { remoteFileTransfers } : {}),
    splitMemberIds: terminalSplitPanes.flatMap((pane) =>
      pane.binding ? [terminalPaneBindingKey(pane.binding)] : [],
    ),
    splitPanes: terminalSplitPanes.map((pane) => ({
      id: pane.id,
      instanceId: pane.binding ? terminalPaneBindingKey(pane.binding) : null,
    })),
    terminalTabs: terminalTabs.map(({ connectionId, id }) => ({ connectionId, id })),
    vncSessions: vncSessions.map(({ id }) => ({ id })),
  };
}

/** 需要确认时给对话框的摘要。 */
export interface CloseConfirmation {
  /** 最后一个终端被关、远程文件随之关闭的连接数。 */
  cascadeConnectionCount: number;
  /** 将被丢弃修改的未保存远程文件。 */
  dirtyFileNames: string[];
  /** 本次关闭的实例总数（含分屏成员）。 */
  instanceCount: number;
  /** 被拆除分屏组的成员数；未拆组时为 0。 */
  splitPaneCount: number;
  /** WS-F09 policy requests canceling these active transfers after confirmation. */
  activeTransferCount?: number;
}

export interface ClosePlan {
  /** 需要确认时的摘要；null 表示直接执行。 */
  confirmation: CloseConfirmation | null;
  /** 连接级关闭（closeConnectionSessions）：该连接的终端全部被关且仍有远程文件 tab。 */
  connectionIds: string[];
  localTabIds: string[];
  rdpSessionIds: string[];
  splitGroup: boolean;
  /** 单 pane 关闭时，执行阶段先删除这些 pane 的布局节点。 */
  splitPaneIds?: string[];
  /** 实例级关闭的 SSH 终端（不含已由连接级关闭覆盖的）。 */
  sshTabIds: string[];
  /** Present only when the configured WS-F09 policy cancels active transfers. */
  transferIdsToCancel?: string[];
  vncSessionIds: string[];
}

/**
 * 请求 → 关闭计划（连带关闭见 WS-E05，未保存确认见 WS-F08）。已不存在的实例忽略；各类 id 按当前集合顺序输出。
 *
 * - 连带远程文件：一次关闭后某 SSH 连接不再有任何终端（独立实例或分屏成员）而仍有远程文件 tab 时，
 *   改走连接级关闭，远程文件一并关闭——编辑器属于所属 SSH 工作区（WS-E05），没有终端就没有工作区可回。
 * - 确认：会丢弃未保存修改、拆除多个分屏成员或按 WS-F09 取消活动传输时需要确认；一次操作只确认一次。
 */
export function planClose(
  request: CloseRequest,
  context: CloseContext,
  transferClosePolicy: RemoteFileTransferClosePolicy = currentRemoteFileTransferClosePolicy,
): ClosePlan {
  const requestedPaneIds = new Set(request.splitPaneIds ?? []);
  const splitPanes = (context.splitPanes ?? []).filter((pane) => requestedPaneIds.has(pane.id));
  const splitPaneIds = splitPanes.map((pane) => pane.id);
  const paneInstanceIds = splitPanes.flatMap((pane) => pane.instanceId ? [pane.instanceId] : []);
  const closing = new Set([
    ...request.instanceIds,
    ...paneInstanceIds,
    ...(request.splitGroup ? context.splitMemberIds : []),
  ]);
  const closingSsh = context.terminalTabs.filter((tab) => closing.has(`ssh:${tab.id}`));
  const closingSshIds = new Set(closingSsh.map((tab) => tab.id));
  const filesByConnection = new Set(context.remoteFileTabs.map((tab) => tab.connectionId));

  const connectionIds: string[] = [];
  // 传输按连接归属，关闭最后一个实例时才释放；是否打开编辑器不影响传输确认。
  const releasedConnectionIds = new Set<string>();
  for (const tab of closingSsh) {
    if (releasedConnectionIds.has(tab.connectionId)) {
      continue;
    }
    const allClosing = context.terminalTabs
      .filter((other) => other.connectionId === tab.connectionId)
      .every((other) => closingSshIds.has(other.id));
    if (allClosing) {
      releasedConnectionIds.add(tab.connectionId);
      if (filesByConnection.has(tab.connectionId)) connectionIds.push(tab.connectionId);
    }
  }
  const cascading = new Set(connectionIds);

  const localTabIds = context.localTerminalTabs.filter((tab) => closing.has(`local:${tab.id}`)).map((tab) => tab.id);
  const rdpSessionIds = context.rdpSessions.filter((session) => closing.has(`rdp:${session.id}`)).map((s) => s.id);
  const vncSessionIds = context.vncSessions.filter((session) => closing.has(`vnc:${session.id}`)).map((s) => s.id);
  const splitPaneCount = request.splitGroup ? context.splitMemberIds.length : 0;
  const dirtyFileNames = context.remoteFileTabs
    .filter((tab) => tab.dirty && cascading.has(tab.connectionId))
    .map((tab) => tab.name);
  const transferDecision = planRemoteFileTransferClose(
    context.remoteFileTransfers ?? [],
    releasedConnectionIds,
    transferClosePolicy,
  );

  return {
    confirmation:
      dirtyFileNames.length > 0 || splitPaneCount > 1 || transferDecision.requiresConfirmation
        ? {
            ...(transferDecision.requiresConfirmation
              ? { activeTransferCount: transferDecision.activeTransferIds.length }
              : {}),
            cascadeConnectionCount: connectionIds.length,
            dirtyFileNames,
            instanceCount: closingSsh.length + localTabIds.length + rdpSessionIds.length + vncSessionIds.length,
            splitPaneCount,
          }
        : null,
    connectionIds,
    localTabIds,
    rdpSessionIds,
    splitGroup: request.splitGroup,
    ...(splitPaneIds.length > 0 ? { splitPaneIds } : {}),
    sshTabIds: closingSsh.filter((tab) => !cascading.has(tab.connectionId)).map((tab) => tab.id),
    ...(transferDecision.cancelTransferIds.length > 0
      ? { transferIdsToCancel: transferDecision.cancelTransferIds }
      : {}),
    vncSessionIds,
  };
}

/** 计划里没有任何要关闭或拆除的内容。 */
export function closePlanIsEmpty(plan: ClosePlan): boolean {
  return (
    !plan.splitGroup &&
    !(plan.splitPaneIds?.length) &&
    plan.connectionIds.length === 0 &&
    plan.sshTabIds.length === 0 &&
    plan.localTabIds.length === 0 &&
    plan.rdpSessionIds.length === 0 &&
    plan.vncSessionIds.length === 0
  );
}
