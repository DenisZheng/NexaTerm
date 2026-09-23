import { readFileSync } from "node:fs";

// 行为契约：关闭最后一个工作区项后回首页，且回首页前清空活动指针。
// WF-00B 起决策在 sessionTabs reducer / closeDecision 内，本检查断言的是这条链路，而不是 shell 里的 setter 序列。

const workspaceShell = readFileSync("src/features/layout/WorkspaceShell.tsx", "utf8");
const reducer = readFileSync("src/features/workspace/sessionTabs/reducer.ts", "utf8");
const closeDecision = readFileSync("src/features/workspace/sessionTabs/closeDecision.ts", "utf8");

// 1. shell 的关闭/删除路径全部经 reducer 决策，不再在集合 updater 内写指针或调用 activate*。
for (const needle of [
  'type: "tabs/closeTerminals"',
  'type: "tabs/closeConnections"',
  'type: "tabs/closeLocalTerminals"',
  'type: "tabs/removeRdp"',
  'type: "tabs/removeVnc"',
]) {
  if (!workspaceShell.includes(needle)) {
    throw new Error(`WorkspaceShell close/delete paths must dispatch the session close actions: ${needle}`);
  }
}

function extractFunctionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) {
    throw new Error(`WorkspaceShell should define ${name}`);
  }
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(bodyStart + 1, index);
      }
    }
  }
  throw new Error(`Could not parse ${name} body`);
}

for (const name of [
  "closeTerminalTabs",
  "closeConnectionSessions",
  "deleteConnection",
  "closeLocalTerminalTabs",
  "removeRdpSessionsLocally",
  "removeVncSessionsLocally",
]) {
  const body = extractFunctionBody(workspaceShell, name);
  if (/set(?:TerminalTabs|LocalTerminalTabs|RdpSessions|VncSessions)\(\s*\(/.test(body)) {
    throw new Error(
      `${name} must not decide the next active item inside a collection updater; compute from refs and dispatch a close action.`,
    );
  }
  if (/\bactivate(?:RdpSession|VncSession|TerminalTab|LocalTerminalTab)\(/.test(body)) {
    throw new Error(`${name} must not call activate* directly; the reducer returns a followUp for that.`);
  }
}

// 2. reducer 的全空回首页把五个活动指针清空并置 mode=home / homeActive=true。
if (
  !/case "tabs\/returnHomeIfEmpty":[\s\S]*?"activeConnectionId", null[\s\S]*?"activeTabId", null[\s\S]*?"activeRdpSessionId", null[\s\S]*?"activeVncSessionId", null[\s\S]*?"activeLocalTerminalTabId", null[\s\S]*?"mode", "home"[\s\S]*?"homeActive", true/.test(
    reducer,
  )
) {
  throw new Error("sessionPointerReducer returnHomeIfEmpty must clear active ids before returning Home.");
}

// 3. closeDecision 的回首页 patch 与 reducer 同一套字段；rdp/vnc 关光后落到它。
if (
  !/RETURN_HOME_PATCH[\s\S]*?activeLocalTerminalTabId: null[\s\S]*?activeRdpSessionId: null[\s\S]*?activeVncSessionId: null/.test(
    closeDecision,
  ) ||
  !closeDecision.includes("...RETURN_HOME_PATCH")
) {
  throw new Error("closeDecision must fall back to the full return-home patch when no session remains.");
}
if (!closeDecision.includes("homeActive: true") || !closeDecision.includes('mode: "home"')) {
  throw new Error("closeDecision must return to Home when the workspace is empty.");
}

console.log("Workspace empty-home source check passed.");
