import { readFileSync } from "node:fs";

// 行为契约：从本地终端工作区打开 SSH 连接时，主工作区必须切回 ssh 模式，且不能依赖 homeActive=false。
// WF-00B 起 startConnectionStep 只 dispatch `tabs/startConnecting`，模式与活动 tab 由 reducer 一次写齐。

const workspaceShell = readFileSync("src/features/layout/WorkspaceShell.tsx", "utf8");
const reducer = readFileSync("src/features/workspace/sessionTabs/reducer.ts", "utf8");

function extractFunctionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) {
    throw new Error(`Source should define ${name}`);
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

const startConnectionStepBody = extractFunctionBody(workspaceShell, "startConnectionStep");

if (!startConnectionStepBody.includes('type: "tabs/startConnecting"')) {
  throw new Error(
    "Opening an SSH connection must dispatch tabs/startConnecting so the main workspace switches back to SSH.",
  );
}

const caseStart = reducer.indexOf('case "tabs/startConnecting"');
if (caseStart === -1) {
  throw new Error("sessionPointerReducer must handle tabs/startConnecting.");
}
const caseBody = reducer.slice(caseStart, reducer.indexOf("case ", caseStart + 1));
const modeIndex = caseBody.indexOf('"mode", "ssh"');
const activeTabIndex = caseBody.indexOf('"activeTabId", action.tabId');
if (modeIndex === -1) {
  throw new Error("tabs/startConnecting must set workspace mode to ssh.");
}
if (activeTabIndex !== -1 && modeIndex > activeTabIndex) {
  throw new Error("SSH workspace mode should be set before activating the new SSH terminal tab.");
}

console.log("workspace SSH activation source check passed");
