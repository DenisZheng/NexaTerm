import { readFileSync } from "node:fs";

const workspace = readFileSync(new URL("../src/features/layout/WorkspaceShell.tsx", import.meta.url), "utf8");
const titlebar = readFileSync(new URL("../src/features/layout/AppTitlebar.tsx", import.meta.url), "utf8");
const reducer = readFileSync(new URL("../src/features/workspace/sessionTabs/reducer.ts", import.meta.url), "utf8");

if (!workspace.includes("activeTabByConnectionId")) {
  throw new Error("WorkspaceShell should remember the active child tab per connection");
}

if (!workspace.includes("preferredTabForConnection")) {
  throw new Error("WorkspaceShell should resolve the preferred child tab when switching sessions");
}

// WF-00B：按连接记忆由 sessionTabs reducer 在激活 / 新建连接 / 关闭回退时写入，不再由 shell 的 rememberActiveTab 调用。
for (const caseName of ['case "tabs/activateTerminal"', 'case "tabs/startConnecting"']) {
  const start = reducer.indexOf(caseName);
  if (start === -1) {
    throw new Error(`sessionPointerReducer should handle ${caseName}`);
  }
  const body = reducer.slice(start, reducer.indexOf("case ", start + 1));
  if (!body.includes("rememberActive(")) {
    throw new Error(`${caseName} should update the remembered child tab on activation`);
  }
}
if (!reducer.includes("decision.remember")) {
  throw new Error("Close decisions should be able to update the remembered child tab");
}

if (!workspace.includes("activateTerminalTab(tab)")) {
  throw new Error("Subtab clicks should activate through the shared tab activation path");
}

if (titlebar.includes("session.tabs[0]")) {
  throw new Error("AppTitlebar should not reset a session to its first child tab");
}

console.log("Session subtab memory check passed.");
