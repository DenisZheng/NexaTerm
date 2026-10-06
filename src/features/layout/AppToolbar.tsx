import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronRight, Columns2, MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../shared/i18n";
import { ActionIcon, ActionMenuItem } from "../../shared/ui/ActionMenuItem";
import { RovingToolbar } from "../../shared/ui/RovingToolbar";
import { Tooltip } from "../../shared/ui/Tooltip";
import { actionPresentation, actionReasonKeys, partitionToolbar, splitActionIds } from "../shortcuts/actionPresentation";
import type { ActionEntryProps } from "./actionEntryProps";
import { NewSessionMenu, NewSessionSubMenu } from "./NewSessionMenu";

export function AppToolbar({ newSession, resolveAction, onRunAction, activeActions = {} }: ActionEntryProps & {
  activeActions?: Readonly<Record<string, boolean>>;
}) {
  const { t } = useI18n();
  const measureRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = measureRef.current;
    if (!element) return;
    const measure = () => setWidth(element.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) setWidth(entries[0].contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const layout = partitionToolbar(width, resolveAction({ actionId: "tools.x11", source: "toolbar" }).enabled);
  const showLabel = layout.mode === "labels";

  function actionItem(actionId: string) {
    const request = { actionId, source: "toolbar" as const };
    return <ActionMenuItem key={actionId} presentation={actionPresentation[actionId]}
      state={resolveAction(request)} onSelect={() => onRunAction(request)} />;
  }
  function splitItems() { return splitActionIds.map(actionItem); }
  function overflowItem(id: string) {
    if (id === "new-session") return <NewSessionSubMenu key={id} {...newSession} />;
    if (id !== "split") return actionItem(id);
    return (
      <DropdownMenu.Sub key={id}>
        <DropdownMenu.SubTrigger className="dropdown-menu-item" textValue={t("actionBar.split")}>
          <Columns2 className="ui-icon" aria-hidden="true" />{t("actionBar.split")}
          <ChevronRight className="ui-icon" aria-hidden="true" />
        </DropdownMenu.SubTrigger>
        <DropdownMenu.Portal><DropdownMenu.SubContent className="dropdown-menu-content app-entry-menu" sideOffset={4}>
          {splitItems()}
        </DropdownMenu.SubContent></DropdownMenu.Portal>
      </DropdownMenu.Sub>
    );
  }
  function visibleItem(id: string) {
    if (id === "new-session") return <NewSessionMenu key={id} {...newSession} toolbar showLabel={showLabel} />;
    if (id === "split") return (
      <DropdownMenu.Root key={id} modal={false}>
        <Tooltip label={t("actionBar.split")}><DropdownMenu.Trigger asChild>
          <button type="button" data-toolbar-control className="app-toolbar-button" aria-label={t("actionBar.split")}
            aria-pressed={Boolean(activeActions.split)}>
            <Columns2 className="ui-icon" aria-hidden="true" />{showLabel ? <span>{t("actionBar.split")}</span> : null}
          </button>
        </DropdownMenu.Trigger></Tooltip>
        <DropdownMenu.Portal><DropdownMenu.Content align="end" sideOffset={4} className="dropdown-menu-content app-entry-menu">
          {splitItems()}
        </DropdownMenu.Content></DropdownMenu.Portal>
      </DropdownMenu.Root>
    );
    const request = { actionId: id, source: "toolbar" as const };
    const state = resolveAction(request);
    const entry = actionPresentation[id];
    const label = t(entry.labelKey);
    const description = state.reason ? t(actionReasonKeys[state.reason]) : label;
    return (
      <Tooltip key={id} label={state.binding ? `${description} (${state.binding})` : description}>
        <button type="button" data-toolbar-control className="app-toolbar-button" aria-label={label}
          aria-pressed={id in activeActions ? activeActions[id] : undefined}
          aria-disabled={!state.enabled} title={description}
          onClick={() => { if (state.enabled) onRunAction(request); }}>
          <ActionIcon name={entry.icon} />{showLabel ? <span>{label}</span> : null}
        </button>
      </Tooltip>
    );
  }
  return (
    <div ref={measureRef} className="app-toolbar-slot" data-toolbar-mode={layout.mode}>
      <RovingToolbar className="app-toolbar" label={t("actionBar.toolbar")}>
        {layout.visible.map(({ id }) => visibleItem(id))}
        {layout.overflow.length ? (
          <DropdownMenu.Root modal={false}>
            <Tooltip label={t("actionBar.more")}><DropdownMenu.Trigger asChild>
              <button type="button" data-toolbar-control className="app-toolbar-button" aria-label={t("actionBar.more")}>
                <MoreHorizontal className="ui-icon" aria-hidden="true" />
              </button>
            </DropdownMenu.Trigger></Tooltip>
            <DropdownMenu.Portal><DropdownMenu.Content align="end" sideOffset={4} className="dropdown-menu-content app-entry-menu">
              {layout.overflow.map(({ id }) => overflowItem(id))}
            </DropdownMenu.Content></DropdownMenu.Portal>
          </DropdownMenu.Root>
        ) : null}
      </RovingToolbar>
    </div>
  );
}
