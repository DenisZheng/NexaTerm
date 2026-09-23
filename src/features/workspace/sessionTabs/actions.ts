import type { CloseSnapshot, SessionRef } from "./closeDecision";
import type { UnifiedWorkbenchTab, WorkspaceMode } from "./types";

/**
 * 会话 tab action，命名 `tabs/动词`。
 *
 * 2c-1 只覆盖 seam 内的多 setter 序列；每个 activate* 对应 WorkspaceShell 里一个激活函数中
 * 属于本 seam 的那部分写入（activeView / mode / homeActive / activeConnectionId / 类型专属指针 / 记忆表）。
 * 不属于本 seam 但在同一函数里同写的（settings 面板请求、右侧工具栏、split 状态）仍由调用方各自处理。
 *
 * WF-00B 加入关闭/删除意图型 action：reducer 用 `closeDecision.ts` 从当前指针与移除后的集合快照算出
 * 下一个活动项；需要跨 seam 激活的分支写入 `followUp`，由 controller effect 交给 shell 执行。
 *
 * `tabs/set*` 是与旧 setter 一一对应的过渡通道，调用点改为意图型 action 后删除。
 */
export type SessionTabsAction =
  // ---- 意图型 ----
  | { type: "tabs/activateTerminal"; connectionId: string; tabId: string; rememberUnified: boolean }
  | { type: "tabs/activateLocal"; tabId: string }
  | { type: "tabs/activateRdp"; connectionId: string; sessionId: string }
  | { type: "tabs/activateVnc"; connectionId: string; sessionId: string }
  /** 激活远程文件 tab；`terminalTabId` 为同连接下应同时置为活动的终端 tab（调用方按记忆/首选算出），可空。 */
  | {
      type: "tabs/activateFile";
      connectionId: string;
      fileTabId: string;
      rememberUnified: boolean;
      terminalTabId: string | null;
    }
  /** 分屏宿主激活：ssh 宿主带 connectionId，local 宿主不带。 */
  | { type: "tabs/activateSplitHost"; host: { kind: "ssh"; connectionId: string } | { kind: "local" } }
  /** 分屏 pane 获得焦点：只改该 pane binding 对应类型的单个指针（原 focusTerminalSplitPane）。 */
  | { type: "tabs/focusPaneBinding"; binding: { kind: "local" | "ssh"; tabId: string } }
  /** 新建连接向导 tab 并激活（原 startConnectionStep）：同 activateTerminal 但不写 activeView、不写 unified 记忆。 */
  | { type: "tabs/startConnecting"; connectionId: string; tabId: string }
  | { type: "tabs/openSettings" }
  | { type: "tabs/closeSettings" }
  | { type: "tabs/goHome" }
  /** 工作区无任何会话时回首页并清空全部指针；有会话则不动。 */
  | { type: "tabs/returnHomeIfEmpty"; counts: { local: number; rdp: number; ssh: number; vnc: number } }
  | { type: "tabs/rememberActive"; connectionId: string; tabId: string }
  | { type: "tabs/forgetConnections"; connectionIds: readonly string[] }
  | { type: "tabs/rememberUnified"; connectionId: string; tab: UnifiedWorkbenchTab }
  | { type: "tabs/forgetUnified"; connectionIds: readonly string[] }
  /** 输入型：终端/文件 tab 集合变化后校正 unified 记忆（失效则 file 优先回退，连接消失则删除）。 */
  | {
      type: "tabs/normalizeUnified";
      fileTabs: readonly { connectionId: string; id: string }[];
      terminalTabs: readonly { connectionId: string; id: string }[];
    }
  /** 关闭文件面板后无终端/RDP/VNC 可回退时的兜底：回首页但保留其它指针（原 activateTerminalFallbackAfterFilesClose 末尾）。 */
  | { type: "tabs/fallbackHomeKeepPointers" }
  /** 活动文件 tab 被移除且无可回退文件（原 closeRemoteFileTabsNow / activateRemoteFileFallbackAfterRemoval 的置空）。 */
  | { type: "tabs/clearActiveFile" }
  // ---- 关闭/删除（WF-00B）。snapshot 为移除后的集合；closing* 为被移除的实体。 ----
  | { type: "tabs/closeTerminals"; closingTabs: readonly SessionRef[]; snapshot: CloseSnapshot }
  | {
      type: "tabs/closeConnections";
      connectionIds: readonly string[];
      snapshot: CloseSnapshot;
      /** "sessions" = closeConnectionSessions；"delete" = deleteConnection（差异见 closeDecision）。 */
      variant: "delete" | "sessions";
    }
  | { type: "tabs/closeLocalTerminals"; closingIds: readonly string[]; snapshot: CloseSnapshot }
  | { type: "tabs/removeRdp"; closingIds: readonly string[]; snapshot: CloseSnapshot }
  | { type: "tabs/removeVnc"; closingIds: readonly string[]; snapshot: CloseSnapshot }
  /** controller 已把 followUp 交给 shell 执行后清除标记。 */
  | { type: "tabs/consumeFollowUp" }
  // ---- 过渡型（与旧 setter 同语义） ----
  | { type: "tabs/setActiveConnectionId"; value: string | null }
  | { type: "tabs/setActiveTabId"; value: string | null }
  | { type: "tabs/setActiveRdpSessionId"; value: string | null }
  | { type: "tabs/setActiveVncSessionId"; value: string | null }
  | { type: "tabs/setActiveLocalTerminalTabId"; value: string | null }
  | { type: "tabs/setActiveRemoteFileTabId"; value: string | null }
  | { type: "tabs/setActiveView"; value: "workspace" | "settings" }
  | { type: "tabs/setMode"; value: WorkspaceMode }
  | { type: "tabs/setHomeActive"; value: boolean };
