import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { PanelsTopLeft } from "lucide-react";
import { useI18n } from "../../shared/i18n";
import { Tooltip } from "../../shared/ui/Tooltip";
import type { OpenSessionEntry } from "../layout/sessionNavigation";

interface ConnectionOpenSessionsProps {
  connectionName: string;
  entries: readonly OpenSessionEntry[];
  onSelect: (instanceId: string) => void;
}

/** 打开数量不是连接健康状态；一个实例直达，多个实例显式选择。 */
export function ConnectionOpenSessions({ connectionName, entries, onSelect }: ConnectionOpenSessionsProps) {
  const { t } = useI18n();
  if (entries.length === 0) return null;
  const label = t("connectionPane.opened", { name: connectionName, count: entries.length });
  const button = (
    <button className="tree-open-sessions" type="button" aria-label={label}
      onMouseDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        if (entries.length === 1) onSelect(entries[0].id);
      }}>
      <PanelsTopLeft className="ui-icon" aria-hidden="true" />
      <span>{entries.length}</span>
    </button>
  );
  if (entries.length === 1) return <Tooltip label={t("connectionPane.jumpTo", { name: entries[0].label })}>{button}</Tooltip>;
  return (
    <DropdownMenu.Root modal={false}>
      <Tooltip label={label}><DropdownMenu.Trigger asChild>{button}</DropdownMenu.Trigger></Tooltip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="dropdown-menu-content app-entry-menu" side="right" align="start" sideOffset={4}>
          <DropdownMenu.Label className="title-new-session-menu-heading">{label}</DropdownMenu.Label>
          {entries.map((entry) => (
            <DropdownMenu.Item className="dropdown-menu-item" key={entry.id} onSelect={() => onSelect(entry.id)}>
              <span className="tab-kind-badge">{entry.badge}</span>
              <span className="app-entry-copy">
                <span>{entry.label}</span>
                {entry.detail ? <small className="app-entry-reason">{entry.detail}</small> : null}
              </span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
