import { existsSync, readFileSync } from "node:fs";

const tabContextMenuPath = "src/shared/ui/TabContextMenu.tsx";
const titlebarSource = readFileSync("src/features/layout/AppTitlebar.tsx", "utf8");
const workspaceSource = readFileSync("src/features/layout/WorkspaceShell.tsx", "utf8");
const styles = readFileSync("src/styles/app.css", "utf8");

if (!existsSync(tabContextMenuPath)) {
  throw new Error("TabContextMenu shared component should exist.");
}

const tabContextMenuSource = readFileSync(tabContextMenuPath, "utf8");

for (const [sourceName, source, needles] of [
  [
    "TabContextMenu.tsx",
    tabContextMenuSource,
    [
      "@radix-ui/react-context-menu",
      "export interface TabContextMenuAction",
      "hint?: string",
      "separatorBefore?: boolean",
      "ContextMenu.Trigger asChild",
      "tab-context-menu-hint",
    ],
  ],
  [
    "AppTitlebar.tsx",
    titlebarSource,
    [
      // WF-01 切片 3：顶栏标签是会话实例（WS-M02），关闭范围按实例计算。
      "TabContextMenu",
      "onCloseAll",
      "onCloseToRight(item.id)",
      "onCloseOthers(item.id)",
      "Ctrl+K W",
    ],
  ],
  [
    "WorkspaceShell.tsx",
    workspaceSource,
    [
      "closeOtherRemoteFileTabs",
      "closeRemoteFileTabsToRight",
      "closeSavedRemoteFileTabsForConnection",
      "closeOtherTerminalTabs",
      "closeTerminalTabsToRight",
      "closeOtherLocalTerminalTabs",
      "closeLocalTerminalTabsToRight",
      "closeWorkspaceItems(itemId, \"others\")",
      "closeWorkspaceItems(itemId, \"right\")",
      "copyRemotePath(tab.path)",
      "isClosableSavedRemoteFileTab",
    ],
  ],
  [
    "app.css",
    styles,
    [
      ".tab-context-menu-content",
      ".context-menu-item.tab-context-menu-item",
      ".tab-context-menu-label",
      ".tab-context-menu-hint",
      ".context-menu-item.tab-context-menu-item.danger",
    ],
  ],
]) {
  for (const needle of needles) {
    if (!source.includes(needle)) {
      throw new Error(`${sourceName} is missing expected tab context menu source: ${needle}`);
    }
  }
}

for (const functionName of [
  "closeRemoteFileTabsToRight",
  "closeTerminalTabsToRight",
  "closeLocalTerminalTabsToRight",
]) {
  const match = workspaceSource.match(new RegExp(`function ${functionName}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}`));
  if (!match || !match[0].includes("if (index < 0)")) {
    throw new Error(`${functionName} should guard missing tab indexes before slicing.`);
  }
}

// 顶栏实例的"关闭右侧"由 closeScopeItemIds 计算，目标不存在时返回空（itemClose.test.ts 覆盖）。
const itemCloseSource = readFileSync("src/features/workspace/sessionTabs/itemClose.ts", "utf8");
if (!itemCloseSource.includes("return index < 0 ? [] : closable.slice(index + 1);")) {
  throw new Error("closeScopeItemIds should guard missing item indexes before slicing.");
}

console.log("Tab context menu source check passed.");
