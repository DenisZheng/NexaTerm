import {
  terminalPaneBindingKey,
  type TerminalPaneBinding,
} from "../../terminal/terminalSplitLayout";

export function splitGroupInsertionIndex(
  tabs: readonly { id: string }[],
  kind: TerminalPaneBinding["kind"],
  host: TerminalPaneBinding | null,
  memberKeys: ReadonlySet<string>,
) {
  if (!host || host.kind !== kind) return tabs.length;

  let visibleIndex = 0;
  for (const tab of tabs) {
    if (tab.id === host.tabId) return visibleIndex;
    const key = terminalPaneBindingKey({ kind, tabId: tab.id });
    if (!memberKeys.has(key)) visibleIndex += 1;
  }
  return visibleIndex;
}
