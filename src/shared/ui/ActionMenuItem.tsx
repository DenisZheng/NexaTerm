import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Menubar from "@radix-ui/react-menubar";
import { Columns2, Info, Keyboard, Network, PanelLeft, Plus, Search, Send, Settings2, Terminal, X, type LucideIcon } from "lucide-react";
import { useI18n } from "../i18n";
import { actionReasonKeys, type ActionIconName, type ActionPresentation } from "../../features/shortcuts/actionPresentation";
import type { WorkspaceActionState } from "../../features/shortcuts/actionRegistry";
import { Keybinding } from "./Keybinding";

const icons: Record<ActionIconName, LucideIcon> = {
  terminal: Terminal, close: X, split: Columns2, search: Search, send: Send,
  network: Network, settings: Settings2, panel: PanelLeft, info: Info, keyboard: Keyboard, plus: Plus,
};
export function ActionIcon({ name }: { name: ActionIconName }) {
  const Icon = icons[name];
  return <Icon className="ui-icon" aria-hidden="true" />;
}
export function ActionMenuItem({ variant = "dropdown", presentation, state, onSelect }: {
  variant?: "menubar" | "dropdown";
  presentation: ActionPresentation;
  state: WorkspaceActionState;
  onSelect: () => void;
}) {
  const { t } = useI18n();
  const Item = variant === "menubar" ? Menubar.Item : DropdownMenu.Item;
  const label = t(presentation.labelKey);
  const reason = state.reason ? t(actionReasonKeys[state.reason]) : null;
  return (
    <Item
      className="dropdown-menu-item app-entry-menu-item"
      disabled={!state.enabled}
      textValue={label}
      title={reason || label}
      aria-label={reason ? `${label}: ${reason}` : label}
      onSelect={() => { if (state.enabled) onSelect(); }}
    >
      <ActionIcon name={presentation.icon} />
      <span className="app-entry-copy">
        <span>{label}</span>
        {reason ? <small className="app-entry-reason">{reason}</small> : null}
      </span>
      {state.binding ? <Keybinding value={state.binding} compact /> : null}
    </Item>
  );
}
