import {
  collectTerminalSplitPanes,
  createTerminalFourPaneLayout,
  removeTerminalSplitBindings,
  terminalPaneBindingKey,
  terminalPaneBindingsEqual,
  terminalSplitMaxPanes,
  type TerminalPaneBinding,
  type TerminalSplitNode,
} from "../../terminal/terminalSplitLayout";

import type {
  FourPaneIds,
  SplitAction,
  TerminalSplitHost,
  TerminalSplitPickerOpenRequest,
} from "./actions";

export interface SplitState {
  anchorIndex: number;
  autoCreateSameSession: boolean;
  /** 单 pane 收缩后待切回独立 tab 的 binding；controller 消费后 dispatch `collapseHandled` 清除。 */
  collapsedTo: TerminalPaneBinding | null;
  confirmCloseOpen: boolean;
  focusedPaneId: string | null;
  host: TerminalSplitHost | null;
  layout: TerminalSplitNode | null;
  picker: TerminalSplitPickerOpenRequest | null;
  revision: number;
  tabActive: boolean;
}

export const initialSplitState: SplitState = {
  anchorIndex: 0,
  autoCreateSameSession: true,
  collapsedTo: null,
  confirmCloseOpen: false,
  focusedPaneId: null,
  host: null,
  layout: null,
  picker: null,
  revision: 0,
  tabActive: false,
};

/** 布局被整体清空时的状态（关闭组、所有 binding 失效、单 pane 收缩共用）。 */
function cleared(state: SplitState, collapsedTo: TerminalPaneBinding | null): SplitState {
  return {
    ...state,
    collapsedTo,
    focusedPaneId: null,
    host: null,
    layout: null,
    picker: null,
    tabActive: false,
  };
}

export function createFourPane(bindings: readonly TerminalPaneBinding[], ids: FourPaneIds) {
  const layout = createTerminalFourPaneLayout(bindings, ids);
  const panes = collectTerminalSplitPanes(layout);
  const emptyPane = panes.find((pane) => !pane.binding) || null;
  const focusedPane =
    emptyPane ||
    panes.find((pane) => pane.binding && terminalPaneBindingsEqual(pane.binding, bindings[0])) ||
    panes[0] ||
    null;
  return {
    emptyPaneId: emptyPane?.id || null,
    focusedPaneId: focusedPane?.id || ids.topLeft,
    layout,
  };
}

/**
 * 归一：对应原 WorkspaceShell 的三个 effect（失效清理 / 超上限重建 / 单 pane 收缩），
 * 按原 effect 的执行顺序在一次 reduce 内完成。
 */
function normalize(
  state: SplitState,
  availableKeys: ReadonlySet<string>,
  fallbackBinding: TerminalPaneBinding | null,
  allocateIds: () => FourPaneIds,
): SplitState {
  if (!state.layout) {
    return state;
  }
  const currentPanes = collectTerminalSplitPanes(state.layout);
  const unavailable = new Set(
    currentPanes.flatMap((pane) =>
      pane.binding && !availableKeys.has(terminalPaneBindingKey(pane.binding))
        ? [terminalPaneBindingKey(pane.binding)]
        : [],
    ),
  );
  let layout = removeTerminalSplitBindings(state.layout, unavailable);
  if (!layout) {
    return cleared(state, null);
  }
  let panes = collectTerminalSplitPanes(layout);
  let focusedPaneId = state.focusedPaneId;
  if (!focusedPaneId || !panes.some((pane) => pane.id === focusedPaneId)) {
    focusedPaneId = panes[0]?.id || null;
  }
  if (panes.length > terminalSplitMaxPanes) {
    const focusedBinding = panes.find((pane) => pane.id === focusedPaneId)?.binding || null;
    const binding = focusedBinding || panes.find((pane) => pane.binding)?.binding || fallbackBinding;
    if (binding) {
      const bindings = [
        binding,
        ...panes.flatMap((pane) =>
          pane.binding && !terminalPaneBindingsEqual(pane.binding, binding) ? [pane.binding] : [],
        ),
      ].slice(0, terminalSplitMaxPanes);
      const four = createFourPane(bindings, allocateIds());
      layout = four.layout;
      focusedPaneId = four.focusedPaneId;
      panes = collectTerminalSplitPanes(layout);
    }
  }
  if (panes.length === 1) {
    return cleared(state, panes[0]?.binding || null);
  }
  if (layout === state.layout && focusedPaneId === state.focusedPaneId) {
    return state;
  }
  return { ...state, focusedPaneId, layout };
}

export function splitReducer(state: SplitState, action: SplitAction): SplitState {
  switch (action.type) {
    case "split/setLayout": {
      const layout =
        typeof action.layout === "function" ? action.layout(state.layout) : action.layout;
      return layout === state.layout ? state : { ...state, layout };
    }
    case "split/setHost":
      return action.host === state.host ? state : { ...state, host: action.host };
    case "split/setAnchorIndex":
      return action.anchorIndex === state.anchorIndex
        ? state
        : { ...state, anchorIndex: action.anchorIndex };
    case "split/setTabActive":
      return action.active === state.tabActive ? state : { ...state, tabActive: action.active };
    case "split/focusPane":
      return action.paneId === state.focusedPaneId
        ? state
        : { ...state, focusedPaneId: action.paneId };
    case "split/bumpRevision":
      return { ...state, revision: state.revision + 1 };
    case "split/setAutoCreateSameSession":
      return action.enabled === state.autoCreateSameSession
        ? state
        : { ...state, autoCreateSameSession: action.enabled };
    case "split/setPicker":
      return action.request === state.picker ? state : { ...state, picker: action.request };
    case "split/setConfirmClose":
      return action.open === state.confirmCloseOpen
        ? state
        : { ...state, confirmCloseOpen: action.open };
    case "split/availableBindingsChanged":
      return normalize(state, action.availableKeys, action.fallbackBinding, action.allocateIds);
    case "split/collapseHandled":
      return state.collapsedTo === null ? state : { ...state, collapsedTo: null };
    default:
      return state;
  }
}
