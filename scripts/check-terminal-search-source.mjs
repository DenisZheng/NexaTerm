import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

function assertIncludes(source, needle, message) {
  if (!source.includes(needle)) {
    throw new Error(message);
  }
}

function assertNotIncludes(source, needle, message) {
  if (source.includes(needle)) {
    throw new Error(message);
  }
}

const packageJson = read("package.json");
const terminalPanel = read("src/features/terminal/TerminalPanel.tsx");
const searchPalette = read("src/features/terminal/terminalSearchPalette.ts");
const searchController = read("src/features/terminal/terminalSearchController.ts");
const searchBar = read("src/features/terminal/TerminalSearchBar.tsx");
const searchOwner = read("src/features/layout/useWorkspaceTerminalSearch.ts");
const workspaceShell = read("src/features/layout/WorkspaceShell.tsx");
const appCss = read("src/styles/app.css");

assertIncludes(
  packageJson,
  '"@xterm/addon-search"',
  "package.json must depend on @xterm/addon-search.",
);
assertIncludes(
  terminalPanel,
  'import { SearchAddon } from "@xterm/addon-search";',
  "TerminalPanel must import xterm SearchAddon.",
);
assertIncludes(
  terminalPanel,
  "terminal.loadAddon(searchAddon)",
  "TerminalPanel must load SearchAddon into xterm.",
);
assertIncludes(
  searchController,
  "addon.findNext",
  "TerminalPanel must support next-match search.",
);
assertIncludes(
  searchController,
  "addon.findPrevious",
  "TerminalPanel must support previous-match search.",
);
assertIncludes(
  searchController,
  "addon.clearDecorations",
  "TerminalPanel must clear search decorations when search closes.",
);
assertIncludes(
  searchPalette,
  'readHexToken("--mx-primary"',
  "TerminalPanel search decorations must derive colors from global mx tokens.",
);
assertNotIncludes(
  terminalPanel,
  'activeMatchBackground: "#fde68a"',
  "TerminalPanel search decorations must not use ad-hoc hard-coded highlight colors.",
);
assertNotIncludes(
  terminalPanel,
  "输入关键字",
  "TerminalPanel must not render a redundant empty-search prompt next to the search box.",
);
assertIncludes(
  terminalPanel,
  "selectionBackground",
  "TerminalPanel must tune xterm selection colors so the active search match is not rendered as a heavy black block.",
);
assertIncludes(
  searchBar,
  "CaseSensitive",
  "TerminalPanel must expose a compact case-sensitive search toggle button.",
);
assertIncludes(
  searchController,
  "caseSensitive",
  "TerminalPanel must pass case-sensitive mode into xterm search options.",
);
assertIncludes(
  workspaceShell,
  "terminal-search-toggle",
  "WorkspaceShell must expose a terminal search toolbar button.",
);
assertIncludes(
  workspaceShell,
  "searchOpen={",
  "WorkspaceShell must pass tab-scoped search state into TerminalPanel.",
);
assertIncludes(
  workspaceShell,
  "toggleTerminalSearchCaseSensitive",
  "WorkspaceShell must keep case-sensitive search state scoped by terminal tab.",
);
assertIncludes(
  appCss,
  ".terminal-search-bar",
  "app.css must style the terminal search bar.",
);
assertIncludes(
  appCss,
  "width: min(360px, calc(100% - 20px))",
  "Terminal search floating bar should stay compact.",
);
assertIncludes(
  appCss,
  "position: absolute",
  "Terminal search bar must float over the terminal instead of adding a full-width layout row.",
);
assertIncludes(
  appCss,
  "right: 10px",
  "Terminal search bar must be aligned to the right side of the terminal panel.",
);
assertNotIncludes(
  appCss,
  ".terminal-panel.terminal-search-open",
  "Terminal search bar must not add a separate row that exposes dark theme background bands.",
);

assertIncludes(workspaceShell, "useWorkspaceTerminalSearch(terminalTabs, localTerminalTabs)", "Search state must be owned by existing terminal instances.");
assertIncludes(workspaceShell, "searchWholeWord={", "SSH and Local must receive whole-word intent.");
if ((workspaceShell.match(/searchWholeWord=\{/g) || []).length !== 2 ||
    (workspaceShell.match(/onSearchNavigationHandled=\{/g) || []).length !== 2) {
  throw new Error("Both SSH and Local render paths must receive word mode and navigation acknowledgement.");
}
assertIncludes(searchBar, "WholeWord", "Search must expose the existing-style whole-word toggle.");
assertIncludes(searchBar, "isComposing", "IME confirmation must not navigate the search.");
assertIncludes(searchOwner, "availableRef.current.has(tabId)", "Late callbacks must not restore a closed tab query.");
assertIncludes(searchOwner, "++sequenceRef.current", "Navigation IDs must remain unique within the same millisecond.");
assertIncludes(searchOwner, "acknowledgeTerminalSearchNavigation", "Consumed requests must not replay after a panel remount.");
assertIncludes(terminalPanel, "searchController.dispose()", "Search timers/subscriptions must be disposed before xterm.");
assertNotIncludes(searchController, 'from "../../shared/tauri', "Search must have no native input API dependency.");
assertNotIncludes(searchController, "terminal.write", "Search must not transform terminal output or send input.");

console.log("terminal search source checks passed");
