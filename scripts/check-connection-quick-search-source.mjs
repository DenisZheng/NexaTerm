import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const connectionPaneSource = readFileSync("src/features/connections/ConnectionPane.tsx", "utf8");
assert.match(connectionPaneSource, /onOpenSearch/);
assert.match(connectionPaneSource, /aria-label=\{t\("connectionPane.search"\)\}/);

const searchDialogSource = readFileSync("src/features/connections/ConnectionSearchDialog.tsx", "utf8");
assert.match(searchDialogSource, /ConnectionSearchDialog/);
assert.match(searchDialogSource, /Keybinding/);
assert.match(searchDialogSource, /value=\{`Ctrl\+\$\{\(index \+ 1\)\.toString\(\)\}`\}/);
assert.match(searchDialogSource, /handleOpenChange\(false\)/);
assert.match(searchDialogSource, /onQueryChange\(""\)/);

const workspaceShellSource = readFileSync("src/features/layout/WorkspaceShell.tsx", "utf8");
assert.match(workspaceShellSource, /ConnectionSearchDialog/);
assert.match(workspaceShellSource, /onSelectConnection=\{openConnectionSession\}/);

const styleSource = readFileSync("src/styles/app.css", "utf8");
assert.match(styleSource, /\.connection-search-dialog/);
assert.match(styleSource, /var\(--mx-/);

const homeSource = readFileSync("src/features/layout/HomeSessionStart.tsx", "utf8");
assert.match(homeSource, /parseQuickConnectAddress/);
assert.match(homeSource, /onQuickConnect\(parsed.target\)/);
assert.match(workspaceShellSource, /<HomeSessionStart newSession=\{newSessionEntry\} onQuickConnect=\{openQuickConnect\}/);
console.log("Connection quick search source gate passed; runtime cases live in connectionSearch.test.ts.");
