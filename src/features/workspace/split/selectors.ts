import {
  collectTerminalSplitPanes,
  terminalPaneBindingKey,
  terminalSplitMaxPanes,
  type TerminalSplitNode,
  type TerminalSplitPane,
} from "../../terminal/terminalSplitLayout";

/** 派生 pane 列表；返回新数组，组件内需 useMemo。 */
export function selectSplitPanes(layout: TerminalSplitNode | null): TerminalSplitPane[] {
  return layout ? collectTerminalSplitPanes(layout) : [];
}

export function selectPaneByBinding(panes: readonly TerminalSplitPane[]) {
  const map = new Map<string, TerminalSplitPane>();
  for (const pane of panes) {
    if (pane.binding) {
      map.set(terminalPaneBindingKey(pane.binding), pane);
    }
  }
  return map;
}

export function selectMemberKeys(panes: readonly TerminalSplitPane[]) {
  return new Set(
    panes.flatMap((pane) => (pane.binding ? [terminalPaneBindingKey(pane.binding)] : [])),
  );
}

export function selectSplitExists(
  layout: TerminalSplitNode | null,
  panes: readonly TerminalSplitPane[],
) {
  return Boolean(layout && panes.length > 1);
}

export function selectCanAddPane(panes: readonly TerminalSplitPane[]) {
  return panes.length < terminalSplitMaxPanes;
}
