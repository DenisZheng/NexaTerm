import type { UnifiedWorkbenchTab, WorkspaceMode } from "./types";

/**
 * 会话 tab action，命名 `tabs/动词`。
 *
 * 2c-1 只覆盖 seam 内的多 setter 序列；每个 activate* 对应 WorkspaceShell 里一个激活函数中
 * 属于本 seam 的那部分写入（activeView / mode / homeActive / activeConnectionId / 类型专属指针 / 记忆表）。
 * 不属于本 seam 但在同一函数里同写的（settings 面板请求、右侧工具栏、split 状态）仍由调用方各自处理。
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
