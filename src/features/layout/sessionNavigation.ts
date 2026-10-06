import type { Translate } from "../../shared/i18n";
import type { WorkspaceItem } from "../workspace/sessionTabs/instances";
import { buildTitlebarItems, type TitlebarItem, type TitlebarItemLookups } from "./titlebarItems";

export interface OpenSessionEntry extends TitlebarItem {
  connectionId: string;
}

/** 树只展示已有实例的投影；本地 profile 不能与保存连接的 ID 混用。 */
export function buildOpenSessionEntries(
  items: readonly WorkspaceItem[],
  lookups: TitlebarItemLookups,
  t: Translate,
): OpenSessionEntry[] {
  return items.flatMap((item) => {
    if (item.kind === "home" || item.kind === "split" || (item.kind === "local" && item.source === "local")) return [];
    return [{
      ...buildTitlebarItems([item], lookups, t)[0],
      connectionId: item.kind === "local" ? item.profileId : item.connectionId,
    }];
  });
}
