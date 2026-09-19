import type { TerminalPaneBinding, TerminalSplitNode } from "../../terminal/terminalSplitLayout";

/** 分屏宿主：分屏 tab 挂在哪个连接（ssh）或本地终端（local）之下。 */
export type TerminalSplitHost =
  | { connectionId: string; kind: "ssh" }
  | { kind: "local" };

/** 打开 pane 选择器的请求；`key` 单调递增用于触发重新打开同一 pane 的选择器。 */
export interface TerminalSplitPickerOpenRequest {
  key: number;
  paneId: string;
}

export interface FourPaneIds {
  bottomLeft: string;
  bottomRight: string;
  leftSplit: string;
  rightSplit: string;
  root: string;
  topLeft: string;
  topRight: string;
}

/**
 * 分屏 action。命名 `split/动词`。
 * action 只携带意图（paneId、binding、可用集合），布局结果由 reducer 计算；
 * 唯一例外是 `split/setLayout`，它是给旧代码里“闭包内已算好 nextLayout”的调用点用的过渡通道，
 * 第二刀清理这些调用点后应删除。
 */
export type SplitAction =
  | {
      type: "split/setLayout";
      layout:
        | TerminalSplitNode
        | null
        | ((current: TerminalSplitNode | null) => TerminalSplitNode | null);
    }
  | { type: "split/setHost"; host: TerminalSplitHost | null }
  | { type: "split/setAnchorIndex"; anchorIndex: number }
  | { type: "split/setTabActive"; active: boolean }
  | { type: "split/focusPane"; paneId: string | null }
  | { type: "split/bumpRevision" }
  | { type: "split/setAutoCreateSameSession"; enabled: boolean }
  | { type: "split/setPicker"; request: TerminalSplitPickerOpenRequest | null }
  | { type: "split/setConfirmClose"; open: boolean }
  /** 可用 binding 集合变化（tab 增删、连接状态变化）：一次完成失效清理、超上限重建、单 pane 收缩。 */
  | {
      type: "split/availableBindingsChanged";
      availableKeys: ReadonlySet<string>;
      fallbackBinding: TerminalPaneBinding | null;
      allocateIds: () => FourPaneIds;
    }
  /** 单 pane 收缩已由 controller 处理完副作用，清除待回调标记。 */
  | { type: "split/collapseHandled" };
