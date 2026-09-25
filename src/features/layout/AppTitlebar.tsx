import { createPortal } from "react-dom";
import type {
  CSSProperties,
  KeyboardEvent,
  MouseEvent,
  PointerEvent,
  ReactNode,
} from "react";
import {
  Download,
  EllipsisVertical,
  House,
  Search,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useI18n } from "../../shared/i18n";
import { TabContextMenu } from "../../shared/ui/TabContextMenu";
import { Tooltip } from "../../shared/ui/Tooltip";
import { createMiddleClickCloseHandler } from "../../shared/ui/tabEvents";
import { hasTauriRuntime } from "../../shared/tauri/runtime";
import { NewSessionMenu, type NewSessionMenuProps } from "./NewSessionMenu";
import { filterTitlebarItems, pickVisibleTitlebarItems, type TitlebarItem } from "./titlebarItems";

const windowDragThresholdPx = 4;

interface AppTitlebarProps {
  activeItemId: string | null;
  appUpdateNotice?:
    | {
        label: string;
        onDismiss: () => void;
        onOpen: () => void;
      }
    | null;
  /** 顶层工作区项（WS-M02）：首页 + 会话实例 + 分屏组，已按顺序表排好。 */
  items: TitlebarItem[];
  leftPaneCollapsed: boolean;
  newSession: NewSessionMenuProps;
  onCloseAll: () => void;
  onCloseItem: (itemId: string) => void;
  onCloseOthers: (itemId: string) => void;
  onCloseToRight: (itemId: string) => void;
  onSelectItem: (itemId: string) => void;
  onToggleLeftPane: () => void;
}

export function AppTitlebar({
  activeItemId,
  appUpdateNotice,
  items,
  leftPaneCollapsed,
  newSession,
  onCloseAll,
  onCloseItem,
  onCloseOthers,
  onCloseToRight,
  onSelectItem,
  onToggleLeftPane,
}: AppTitlebarProps) {
  const { t } = useI18n();
  const titleTabsRef = useRef<HTMLElement | null>(null);
  const [titleTabsWidth, setTitleTabsWidth] = useState(0);
  const visibleItems = useMemo(
    () => pickVisibleTitlebarItems(items, activeItemId, titleTabsWidth),
    [activeItemId, items, titleTabsWidth],
  );
  const hiddenItemCount = items.length - visibleItems.length;
  const closableItems = items.filter((item) => item.closable);

  useLayoutEffect(() => {
    const element = titleTabsRef.current;
    if (!element) {
      return;
    }

    const updateWidth = () => setTitleTabsWidth(element.getBoundingClientRect().width);

    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }

    const observer = new ResizeObserver(() => updateWidth());
    observer.observe(element);
    window.addEventListener("resize", updateWidth);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, []);

  return (
    <header
      className="custom-titlebar"
      onDoubleClick={handleTitlebarDoubleClick}
      onPointerDown={handleDragStart}
    >
      <div className="macos-traffic-lights" role="group" aria-label={t("titlebar.windowControls")}>
        <button
          className="macos-traffic-light close"
          type="button"
          aria-label={t("titlebar.closeWindow")}
          onClick={() => void runTauriWindowAction("close")}
        />
        <button
          className="macos-traffic-light minimize"
          type="button"
          aria-label={t("titlebar.minimize")}
          onClick={() => void runTauriWindowAction("minimize")}
        />
        <button
          className="macos-traffic-light zoom"
          type="button"
          aria-label={t("titlebar.zoom")}
          onClick={() => void runTauriWindowAction("toggleMaximize")}
        />
      </div>

      <div className="title-leading">
        <Tooltip label={leftPaneCollapsed ? t("titlebar.expandSidebar") : t("titlebar.collapseSidebar")}>
          <button
            className="title-tool-button title-pane-toggle"
            type="button"
            aria-label={leftPaneCollapsed ? t("titlebar.expandSidebar") : t("titlebar.collapseSidebar")}
            aria-expanded={!leftPaneCollapsed}
            onClick={onToggleLeftPane}
          >
            <SidebarToggleGlyph collapsed={leftPaneCollapsed} />
          </button>
        </Tooltip>
      </div>

      <nav ref={titleTabsRef} className="title-session-tabs" aria-label={t("titlebar.tabs")}>
        {visibleItems.map((item) => {
          const active = item.id === activeItemId;
          const tabButton = (
            <Tooltip label={item.detail ? `${item.label} · ${item.detail}` : item.label}>
              <button
                className="tab instance-tab"
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => onSelectItem(item.id)}
              >
                <ItemKindBadge item={item} />
                <span className="tab-label">{item.label}</span>
              </button>
            </Tooltip>
          );

          if (!item.closable) {
            return (
              <div key={item.id} className={`tab-shell is-pinned ${active ? "active" : ""}`}>
                {tabButton}
              </div>
            );
          }

          const index = closableItems.indexOf(item);
          return (
            <TabContextMenu
              key={item.id}
              actions={[
                {
                  hint: "Ctrl+F4",
                  label: t("titlebar.close"),
                  onSelect: () => onCloseItem(item.id),
                },
                {
                  disabled: closableItems.length <= 1,
                  label: t("titlebar.closeOthers"),
                  onSelect: () => onCloseOthers(item.id),
                },
                {
                  disabled: index < 0 || index >= closableItems.length - 1,
                  label: t("titlebar.closeToRight"),
                  onSelect: () => onCloseToRight(item.id),
                },
                {
                  hint: "Ctrl+K W",
                  label: t("titlebar.closeAll"),
                  onSelect: onCloseAll,
                },
              ]}
            >
              <div
                className={`tab-shell ${active ? "active" : ""}`}
                onAuxClick={createMiddleClickCloseHandler(() => onCloseItem(item.id))}
              >
                {tabButton}
                <button
                  className="tab-close"
                  type="button"
                  aria-label={t("titlebar.closeItem", { label: item.label })}
                  onClick={() => onCloseItem(item.id)}
                >
                  <CloseGlyph />
                </button>
              </div>
            </TabContextMenu>
          );
        })}

        {hiddenItemCount > 0 ? (
          <TitlebarItemSwitcher
            activeItemId={activeItemId}
            hiddenItemCount={hiddenItemCount}
            items={items}
            onCloseItem={onCloseItem}
            onSelectItem={onSelectItem}
          />
        ) : null}

        <NewSessionMenu {...newSession} />
      </nav>

      <div className="title-trailing">
        {appUpdateNotice ? (
          <div className="title-update-entry" aria-label={t("titlebar.appUpdate")}>
            <button className="title-update-pill" type="button" onClick={appUpdateNotice.onOpen}>
              <Download className="title-tool-icon" aria-hidden="true" />
              <span>{appUpdateNotice.label}</span>
            </button>
            <Tooltip label={t("titlebar.dismissUpdateTooltip")}>
              <button
                className="title-update-close"
                type="button"
                aria-label={t("titlebar.dismissUpdate")}
                onClick={appUpdateNotice.onDismiss}
              >
                <X className="title-tool-icon" aria-hidden="true" />
              </button>
            </Tooltip>
          </div>
        ) : null}
        <div className="window-controls" aria-label={t("titlebar.windowControls")}>
        <button
          className="window-control"
          type="button"
          aria-label={t("titlebar.minimize")}
          onClick={() => void runTauriWindowAction("minimize")}
        >
          <MinimizeGlyph />
        </button>
        <button
          className="window-control"
          type="button"
          aria-label={t("titlebar.maximizeRestore")}
          onClick={() => void runTauriWindowAction("toggleMaximize")}
        >
          <MaximizeGlyph />
        </button>
        <button
          className="window-control close"
          type="button"
          aria-label={t("titlebar.closeWindow")}
          onClick={() => void runTauriWindowAction("close")}
        >
          <CloseGlyph />
        </button>
        </div>
      </div>
    </header>
  );

  function handleDragStart(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0 || event.detail > 1 || isInteractiveDragTarget(event.target)) {
      return;
    }

    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;

    function cleanup() {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", cleanup);
      window.removeEventListener("pointercancel", cleanup);
    }

    function handlePointerMove(moveEvent: globalThis.PointerEvent) {
      if (moveEvent.pointerId !== pointerId) {
        return;
      }

      const distanceX = Math.abs(moveEvent.clientX - startX);
      const distanceY = Math.abs(moveEvent.clientY - startY);
      if (distanceX < windowDragThresholdPx && distanceY < windowDragThresholdPx) {
        return;
      }

      cleanup();
      void startWindowDrag();
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", cleanup);
    window.addEventListener("pointercancel", cleanup);
  }

  function handleTitlebarDoubleClick(event: MouseEvent<HTMLElement>) {
    if (event.button !== 0 || isInteractiveDragTarget(event.target)) {
      return;
    }

    event.preventDefault();
    void runTauriWindowAction("toggleMaximize");
  }
}

/** 类型角标：首页用图标，其余用文字（SSH / 本地 / RDP / 分屏…）。 */
function ItemKindBadge({ item }: { item: TitlebarItem }) {
  return (
    <span className="tab-kind-badge" aria-hidden="true">
      {item.badge ?? <House className="title-tool-icon" />}
    </span>
  );
}

interface TitlebarItemSwitcherProps {
  activeItemId: string | null;
  hiddenItemCount: number;
  items: TitlebarItem[];
  onCloseItem: (itemId: string) => void;
  onSelectItem: (itemId: string) => void;
}

function TitlebarItemSwitcher({
  activeItemId,
  hiddenItemCount,
  items,
  onCloseItem,
  onSelectItem,
}: TitlebarItemSwitcherProps) {
  const { t } = useI18n();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<TitlebarSessionSwitcherPosition | null>(null);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const entries = useMemo(() => filterTitlebarItems(items, query), [items, query]);
  const selectedIndex = Math.min(highlightedIndex, Math.max(0, entries.length - 1));
  const selectedEntry = entries[selectedIndex] || null;

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    setPosition(readTitlebarSessionMenuPosition(triggerRef.current, entries.length));
  }, [entries.length, open, query]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setHighlightedIndex(0);
  }, [open, query]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function closeOnPointerDown(event: globalThis.PointerEvent) {
      const target = event.target as Node | null;
      if (
        target &&
        (triggerRef.current?.contains(target) || menuRef.current?.contains(target))
      ) {
        return;
      }

      setOpen(false);
    }

    function updatePosition() {
      setPosition(readTitlebarSessionMenuPosition(triggerRef.current, entries.length));
    }

    document.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [entries.length, open]);

  function openMenu() {
    setQuery("");
    setHighlightedIndex(0);
    setOpen(true);
  }

  function closeMenu() {
    setOpen(false);
    setQuery("");
    setHighlightedIndex(0);
  }

  function handleSelect(itemId: string) {
    closeMenu();
    onSelectItem(itemId);
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if ((event.ctrlKey || event.metaKey) && /^[1-9]$/.test(event.key)) {
      const targetEntry = entries[Number.parseInt(event.key, 10) - 1];
      if (targetEntry) {
        event.preventDefault();
        handleSelect(targetEntry.id);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((index) => Math.min(index + 1, Math.max(0, entries.length - 1)));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((index) => Math.max(index - 1, 0));
      return;
    }

    if (event.key === "Enter" && selectedEntry) {
      event.preventDefault();
      handleSelect(selectedEntry.id);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
    }
  }

  return (
    <>
      <Tooltip label={t("titlebar.moreItemsCount", { count: hiddenItemCount })}>
        <button
          ref={triggerRef}
          className="title-tool-button title-session-switcher-button"
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={t("titlebar.moreItemsHidden", { count: hiddenItemCount })}
          onClick={() => {
            if (open) {
              closeMenu();
              return;
            }
            openMenu();
          }}
        >
          <EllipsisVertical className="title-tool-icon" aria-hidden="true" />
        </button>
      </Tooltip>

      {open && position
        ? createPortal(
            <div
              ref={menuRef}
              className="connection-search-dialog title-session-switcher-menu"
              style={
                {
                  "--title-session-switcher-left": `${position.left}px`,
                  "--title-session-switcher-top": `${position.top}px`,
                  "--title-session-switcher-width": `${position.width}px`,
                  "--title-session-switcher-max-height": `${position.maxHeight}px`,
                } as CSSProperties
              }
              role="dialog"
              aria-label={t("titlebar.switcher.title")}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <div className="connection-search-head title-session-switcher-head">
                <div>
                  <div className="connection-search-title">{t("titlebar.switcher.title")}</div>
                  <p className="title-session-switcher-subtitle">{t("titlebar.switcher.subtitle")}</p>
                </div>
                <button
                  className="icon-button dialog-close-button"
                  type="button"
                  aria-label={t("titlebar.switcher.close")}
                  onClick={closeMenu}
                >
                  <X className="ui-icon" aria-hidden="true" />
                </button>
              </div>

              <label
                className="connection-search-input-wrap title-session-switcher-input-wrap"
                aria-label={t("titlebar.switcher.search")}
              >
                <Search className="ui-icon" aria-hidden="true" />
                <input
                  ref={inputRef}
                  spellCheck={false}
                  value={query}
                  placeholder={t("titlebar.switcher.placeholder")}
                  onKeyDown={handleMenuKeyDown}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                />
              </label>

              <div className="connection-search-section-title">
                <span>
                  {query.trim().length > 0 ? t("titlebar.switcher.results") : t("titlebar.switcher.open")}
                </span>
                <small>{entries.length.toString()}</small>
              </div>

              <div
                className="title-session-switcher-results connection-search-results"
                role="listbox"
                aria-label={t("titlebar.switcher.list")}
              >
                {entries.length === 0 ? (
                  <p className="connection-search-empty">{t("titlebar.switcher.empty")}</p>
                ) : null}

                {entries.map((entry, index) => {
                  const current = entry.id === activeItemId;

                  return (
                    <div
                      key={entry.id}
                      className={`connection-search-result title-session-switcher-row ${index === selectedIndex ? "active" : ""} ${current ? "current" : ""}`}
                      role="option"
                      aria-selected={index === selectedIndex}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      onClick={() => handleSelect(entry.id)}
                    >
                      <ItemKindBadge item={entry} />
                      <span className="connection-search-result-main title-session-switcher-main">
                        <strong>{entry.label}</strong>
                        {entry.detail ? <small>{entry.detail}</small> : null}
                      </span>
                      <div className="connection-search-result-side title-session-switcher-side">
                        {current ? (
                          <span className="connection-search-badge">{t("titlebar.switcher.current")}</span>
                        ) : null}
                        {entry.closable ? (
                          <Tooltip label={t("titlebar.closeItem", { label: entry.label })}>
                            <button
                              className="title-session-switcher-close"
                              type="button"
                              aria-label={t("titlebar.closeItem", { label: entry.label })}
                              onClick={(event) => {
                                event.stopPropagation();
                                onCloseItem(entry.id);
                              }}
                            >
                              <X className="ui-icon" aria-hidden="true" />
                            </button>
                          </Tooltip>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

interface TitlebarSessionSwitcherPosition {
  left: number;
  maxHeight: number;
  top: number;
  width: number;
}

function readTitlebarSessionMenuPosition(
  trigger: HTMLButtonElement | null,
  itemCount: number,
): TitlebarSessionSwitcherPosition | null {
  if (!trigger) {
    return null;
  }

  const rect = trigger.getBoundingClientRect();
  const viewportPadding = 12;
  const gap = 8;
  const width = Math.min(440, Math.max(340, window.innerWidth - viewportPadding * 2));
  const menuChromeHeight = 12 + 10 + 2;
  const rowHeight = 44;
  const titleHeight = 22;
  const desiredHeight = Math.min(
    560,
    Math.max(170, titleHeight + menuChromeHeight + itemCount * rowHeight),
  );
  const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
  const spaceAbove = rect.top - viewportPadding;
  const openAbove = spaceBelow < desiredHeight && spaceAbove > spaceBelow;
  const availableHeight = Math.max(200, (openAbove ? spaceAbove : spaceBelow) - gap);
  const maxHeight = Math.min(560, desiredHeight, availableHeight);

  return {
    left: Math.min(
      Math.max(viewportPadding, rect.right - width),
      Math.max(viewportPadding, window.innerWidth - width - viewportPadding),
    ),
    maxHeight,
    top: openAbove ? rect.top - gap - maxHeight : rect.bottom + gap,
    width,
  };
}

function isInteractiveDragTarget(target: EventTarget) {
  return target instanceof Element && Boolean(target.closest("button, input, textarea, select, a"));
}

async function startWindowDrag() {
  if (!hasTauriRuntime()) {
    return;
  }

  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().startDragging();
  } catch {
    return;
  }
}

async function runTauriWindowAction(action: "minimize" | "toggleMaximize" | "close") {
  if (!hasTauriRuntime()) {
    return;
  }

  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const currentWindow = getCurrentWindow();

    if (action === "minimize") {
      await currentWindow.minimize();
    } else if (action === "toggleMaximize") {
      await currentWindow.toggleMaximize();
    } else {
      await currentWindow.close();
    }
  } catch {
    return;
  }
}

function GlyphShell({ children }: { children: ReactNode }) {
  return (
    <svg
      className="title-tool-icon"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function SidebarToggleGlyph({ collapsed }: { collapsed: boolean }) {
  const railX = collapsed ? 11 : 6;

  return (
    <svg
      className="title-tool-icon"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.5" y="3.5" width="13" height="13" rx="3" />
      <rect x={railX} y="6.25" width="3" height="7.5" rx="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function MinimizeGlyph() {
  return (
    <GlyphShell>
      <path d="M4.5 10.5h7" />
    </GlyphShell>
  );
}

function MaximizeGlyph() {
  return (
    <GlyphShell>
      <rect x="4.5" y="4.5" width="7" height="7" rx="1" />
    </GlyphShell>
  );
}

function CloseGlyph() {
  return (
    <GlyphShell>
      <path d="m5 5 6 6" />
      <path d="m11 5-6 6" />
    </GlyphShell>
  );
}
