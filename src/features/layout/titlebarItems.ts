import type { Translate } from "../../shared/i18n";
import { displayOrdinal, itemTitle, type WorkspaceItem } from "../workspace/sessionTabs/instances";

/**
 * 顶栏实例标签的显示模型 —— WF-01 切片 3（WS-M02 / WS-E11 / WS-E12）。
 *
 * 由 `selectWorkspaceItems` 的工作区项 + 名称查找 + i18n 生成标签文案、类型角标与副标题；
 * 可见集合裁剪与切换器搜索也在这里，保持 AppTitlebar 只管渲染。纯函数。
 */

export interface TitlebarItemLookups {
  /** 连接地址（`user@host:port` 等），用于 tooltip 与切换器副标题；查不到返回 null。 */
  connectionAddress: (connectionId: string) => string | null;
  connectionName: (connectionId: string) => string | null;
  localProfileName: (profileId: string) => string | null;
}

export interface TitlebarItem {
  /** 类型角标文字（SSH / 本地 / RDP…）；首页为 null。类型不只靠颜色区分。 */
  badge: string | null;
  closable: boolean;
  detail: string | null;
  id: string;
  kind: WorkspaceItem["kind"];
  label: string;
}

export function buildTitlebarItems(
  items: readonly WorkspaceItem[],
  lookups: TitlebarItemLookups,
  t: Translate,
): TitlebarItem[] {
  return items.map((item) => ({
    badge: itemBadge(item, t),
    closable: item.kind !== "home",
    detail: itemDetail(item, lookups),
    id: item.id,
    kind: item.kind,
    label: itemLabel(item, lookups, t),
  }));
}

function itemLabel(item: WorkspaceItem, lookups: TitlebarItemLookups, t: Translate): string {
  const title = itemTitle(item, lookups);
  switch (title.kind) {
    case "home":
      return t("item.home");
    case "ssh": {
      const name = title.name ?? t("item.unknownConnection");
      const n = displayOrdinal(title.ordinal);
      return n === null ? t("item.sshTerminal", { name }) : t("item.sshTerminalN", { n, name });
    }
    case "local": {
      const terminal = item.kind === "split" ? item.host : item;
      const fallback =
        terminal.kind === "local" && terminal.source !== "local" ? t("item.unknownConnection") : t("item.unknownProfile");
      const name = title.name ?? fallback;
      const n = displayOrdinal(title.ordinal);
      return n === null ? name : t("item.localN", { n, name });
    }
    case "rdp":
      return t("item.rdp", { name: title.name ?? t("item.unknownConnection") });
    case "vnc":
      return t("item.vnc", { name: title.name ?? t("item.unknownConnection") });
  }
}

function itemBadge(item: WorkspaceItem, t: Translate): string | null {
  switch (item.kind) {
    case "home":
      return null;
    case "split":
      return t("kind.split");
    case "local":
      return t(item.source === "telnet" ? "kind.telnet" : item.source === "serial" ? "kind.serial" : "kind.local");
    case "ssh":
      return t("kind.ssh");
    case "rdp":
      return t("kind.rdp");
    case "vnc":
      return t("kind.vnc");
  }
}

function itemDetail(item: WorkspaceItem, lookups: TitlebarItemLookups): string | null {
  switch (item.kind) {
    case "home":
      return null;
    case "split":
      return itemDetail(item.host, lookups);
    case "local":
      return item.source === "local" ? null : lookups.connectionAddress(item.profileId);
    case "ssh":
    case "rdp":
    case "vnc":
      return lookups.connectionAddress(item.connectionId);
  }
}

const FALLBACK_VISIBLE_ITEMS = 4;
const TAB_GAP = 6;
const TABS_PADDING = 20;
const SWITCHER_WIDTH = 34;

/**
 * 按可用宽度挑出可见标签：从左往右放能放下的项，放不下的进切换器；活动项若被挤出则钉到末尾，
 * 必要时从尾部让位。宽度未知（首帧未测量）时退回固定前 4 项并钉住活动项。
 */
export function pickVisibleTitlebarItems(
  items: readonly TitlebarItem[],
  activeId: string | null,
  availableWidth: number,
): TitlebarItem[] {
  const active = activeId ? items.find((item) => item.id === activeId) ?? null : null;

  if (!Number.isFinite(availableWidth) || availableWidth <= 0) {
    if (items.length <= FALLBACK_VISIBLE_ITEMS) {
      return [...items];
    }
    const visible = items.slice(0, FALLBACK_VISIBLE_ITEMS);
    return active && !visible.includes(active) ? [...visible.slice(0, -1), active] : visible;
  }

  const switcherWidth = items.length > 1 ? SWITCHER_WIDTH : 0;
  const budget = Math.max(0, availableWidth - TABS_PADDING - switcherWidth);
  const fitted: TitlebarItem[] = [];
  let consumed = 0;
  for (const item of items) {
    const next = consumed + (fitted.length > 0 ? TAB_GAP : 0) + estimateItemWidth(item);
    if (next > budget) {
      break;
    }
    fitted.push(item);
    consumed = next;
  }

  if (fitted.length === items.length || !active || fitted.includes(active)) {
    return fitted.length === items.length ? [...items] : fitted;
  }

  const activeWidth = estimateItemWidth(active);
  const trimmed = fitted.slice();
  while (trimmed.length > 0 && itemsWidth(trimmed) + TAB_GAP + activeWidth > budget) {
    trimmed.pop();
  }
  return [...trimmed, active];
}

function estimateItemWidth(item: TitlebarItem) {
  return Math.min(182, Math.max(118, 80 + item.label.trim().length * 5.2));
}

function itemsWidth(items: readonly TitlebarItem[]) {
  return items.reduce((width, item, index) => width + estimateItemWidth(item) + (index > 0 ? TAB_GAP : 0), 0);
}

/** 切换器搜索：按标题、地址、角标不区分大小写匹配；空查询返回全部。 */
export function filterTitlebarItems(items: readonly TitlebarItem[], query: string): TitlebarItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [...items];
  }
  return items.filter((item) =>
    [item.label, item.detail, item.badge].some((field) => field?.toLowerCase().includes(needle)),
  );
}
