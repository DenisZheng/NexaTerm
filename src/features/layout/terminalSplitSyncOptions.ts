import { t } from "../../shared/i18n";
import { terminalPaneBindingKey, type TerminalPaneBinding } from "../terminal/terminalSplitLayout";

/** 同步菜单的目标行（TerminalSplitSyncMenu 的 panes 输入）。 */
export interface TerminalSplitSyncPaneOption {
  disabled?: boolean;
  key: string;
  label: string;
  locked?: boolean;
}

interface TerminalSplitSyncSessionOption {
  binding?: TerminalPaneBinding | null;
  value: string;
  label: string;
}

/**
 * 由分屏 pane 与会话选项派生同步菜单的目标列表。
 * 从 WorkspaceShell 的 memo 原样抽出（WF-04C MultiExec 入口任务，行数预算），行为不变。
 */
export function buildTerminalSplitSyncPaneOptions(input: {
  focusedBinding: TerminalPaneBinding | null | undefined;
  panes: readonly { binding?: TerminalPaneBinding | null }[];
  sessionOptions: readonly TerminalSplitSyncSessionOption[];
  sessionIdForBinding: (binding: TerminalPaneBinding) => string | null | undefined;
  syncEnabled: boolean;
}): TerminalSplitSyncPaneOption[] {
  const optionByKey = new Map(
    input.sessionOptions.filter((option) => option.binding).map((option) => [option.value, option]),
  );
  const focusedKey = input.focusedBinding ? terminalPaneBindingKey(input.focusedBinding) : null;
  return input.panes.flatMap((pane, index) => {
    if (!pane.binding) {
      return [];
    }
    const key = terminalPaneBindingKey(pane.binding);
    const option = optionByKey.get(key);
    return [
      {
        disabled: !input.sessionIdForBinding(pane.binding),
        key,
        label: `${option?.label || t("terminal.split.defaultLabel", { index: index + 1 })}${
          input.syncEnabled && key === focusedKey ? t("terminal.split.primarySuffix") : ""
        }`,
        locked: false,
      },
    ];
  });
}
