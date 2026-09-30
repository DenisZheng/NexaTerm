import * as Menubar from "@radix-ui/react-menubar";
import { useI18n } from "../../shared/i18n";
import { ActionMenuItem } from "../../shared/ui/ActionMenuItem";
import { actionPresentation, menuGroups } from "../shortcuts/actionPresentation";
import type { ActionEntryProps } from "./actionEntryProps";
import { NewSessionSubMenu } from "./NewSessionMenu";

export function AppMenuBar({ newSession, resolveAction, onRunAction }: ActionEntryProps) {
  const { t } = useI18n();
  return (
    <Menubar.Root loop className="app-menubar" aria-label={t("actionBar.menubar")}>
      {menuGroups.map((group) => (
        <Menubar.Menu key={group.id}>
          <Menubar.Trigger className="app-menubar-trigger">{t(group.labelKey)}</Menubar.Trigger>
          <Menubar.Portal><Menubar.Content align="start" sideOffset={4}
            className="dropdown-menu-content app-entry-menu">
            {group.id === "session" ? <NewSessionSubMenu {...newSession} variant="menubar" /> : null}
            {Object.entries(actionPresentation).filter(([, entry]) => entry.group === group.id).map(([actionId, entry]) => {
              const request = { actionId, source: "menu" as const };
              return <ActionMenuItem key={actionId} variant="menubar" presentation={entry}
                state={resolveAction(request)} onSelect={() => onRunAction(request)} />;
            })}
          </Menubar.Content></Menubar.Portal>
        </Menubar.Menu>
      ))}
    </Menubar.Root>
  );
}
