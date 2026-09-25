import type { WorkspaceItem } from "./instances";

/**
 * 顶层工作区项的关闭范围与关闭计划 —— WF-01 切片 3。
 *
 * 顶栏的"关闭 / 关闭其他 / 关闭右侧 / 全部关闭"作用于实例项（WS-M02），这里把选中的项翻译成 shell
 * 现有的关闭路径（WF-00B 的 closeTerminalTabs / closeLocalTerminalTabs / closeRdpSessions /
 * closeVncSessions / 分屏组关闭），不新增第二套关闭逻辑。纯函数，shell 按计划依次调用。
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

export interface ItemCloseContext {
  /** 当前有远程文件 tab 的连接。 */
  remoteFileConnectionIds: ReadonlySet<string>;
  /** 当前全部 SSH 终端 tab（含分屏成员）。 */
  terminalTabs: readonly { connectionId: string; id: string }[];
}

export interface ItemClosePlan {
  /** 连接级关闭（closeConnectionSessions）：该连接的 SSH 实例全部被关且仍有远程文件 tab。 */
  connectionIds: string[];
  localTabIds: string[];
  rdpSessionIds: string[];
  /** 分屏组项被选中：走分屏组关闭（多 pane 时有确认）。 */
  splitGroup: boolean;
  sshTabIds: string[];
  vncSessionIds: string[];
}

/**
 * 选中项 → 关闭计划。首页与已不存在的 id 忽略。
 *
 * 远程编辑器属于所属 SSH 工作区（WS-E05），不是顶层项；若关掉某连接的最后一个 SSH 实例后该连接仍有
 * 远程文件 tab，这些 tab 在顶栏上将无处可回。因此这种情况改走连接级关闭：远程文件一并关闭，
 * 有未保存修改时由 closeConnectionSessions 弹出现有的确认。分屏组的 SSH 成员也计入"是否全部关闭"。
 */
export function planItemClose(
  itemIds: readonly string[],
  items: readonly WorkspaceItem[],
  context: ItemCloseContext,
): ItemClosePlan {
  const selected = new Set(itemIds);
  const plan: ItemClosePlan = {
    connectionIds: [],
    localTabIds: [],
    rdpSessionIds: [],
    splitGroup: false,
    sshTabIds: [],
    vncSessionIds: [],
  };
  const closingTerminalIds = new Set<string>();
  const sshTabIds: { connectionId: string; tabId: string }[] = [];

  for (const item of items) {
    if (!selected.has(item.id)) {
      continue;
    }
    switch (item.kind) {
      case "home":
        break;
      case "ssh":
        sshTabIds.push({ connectionId: item.connectionId, tabId: item.tabId });
        closingTerminalIds.add(item.tabId);
        break;
      case "local":
        plan.localTabIds.push(item.tabId);
        break;
      case "rdp":
        plan.rdpSessionIds.push(item.sessionId);
        break;
      case "vnc":
        plan.vncSessionIds.push(item.sessionId);
        break;
      case "split":
        plan.splitGroup = true;
        item.memberIds.forEach((memberId) => {
          if (memberId.startsWith("ssh:")) {
            closingTerminalIds.add(memberId.slice("ssh:".length));
          }
        });
        break;
    }
  }

  const connectionClosed = (connectionId: string) =>
    context.remoteFileConnectionIds.has(connectionId) &&
    context.terminalTabs
      .filter((tab) => tab.connectionId === connectionId)
      .every((tab) => closingTerminalIds.has(tab.id));

  for (const { connectionId, tabId } of sshTabIds) {
    if (connectionClosed(connectionId)) {
      if (!plan.connectionIds.includes(connectionId)) {
        plan.connectionIds.push(connectionId);
      }
    } else {
      plan.sshTabIds.push(tabId);
    }
  }
  return plan;
}
