import { readFileSync } from "node:fs";

const actions = readFileSync(new URL("../src/features/workspace/multiExec/actions.ts", import.meta.url), "utf8");
const reducer = readFileSync(new URL("../src/features/workspace/multiExec/reducer.ts", import.meta.url), "utf8");
const acceptance = readFileSync(new URL("../src/features/workspace/multiExec/acceptance.test.ts", import.meta.url), "utf8");
const live = readFileSync(new URL("../src/features/workspace/multiExec/live.ts", import.meta.url), "utf8");
const send = readFileSync(new URL("../src/features/workspace/multiExec/send.ts", import.meta.url), "utf8");
const targets = readFileSync(new URL("../src/features/workspace/multiExec/targets.ts", import.meta.url), "utf8");
const fixtureReadme = readFileSync(new URL("../tests/fixtures/README.md", import.meta.url), "utf8");
const shell = readFileSync(new URL("../src/features/layout/WorkspaceShell.tsx", import.meta.url), "utf8");
const spec = readFileSync(new URL("../docs/WORKFLOW_SPEC.md", import.meta.url), "utf8");

for (const needle of [
  'export type MultiExecMode = "off" | "live" | "send";',
  'type: "multiExec/setMode"',
  'type: "multiExec/setTargets"',
]) {
  if (!actions.includes(needle)) throw new Error(`WF-04C mode/target contract missing: ${needle}`);
}

for (const needle of [
  'state.mode === "live"',
  "action.availableKeys.has(key)",
]) {
  if (!reducer.includes(needle)) throw new Error(`WF-04C reducer contract missing: ${needle}`);
}

if (/next\.add\(action\.focusedKey\)/.test(reducer)) {
  throw new Error("WF-04C fixed targets must never auto-add the focused terminal.");
}
if (!reducer.includes("availability 只允许移除失效实例")) {
  throw new Error("WF-04C reducer must document shrink-only target reconciliation.");
}
for (const needle of [
  "terminalPaneBindingKey(binding)",
  'kind: "ssh"',
  'kind: tab.source === "telnet" ? "telnet" : tab.source === "serial" ? "serial" : "local"',
  "target.key !== sourceKey",
]) {
  if (!targets.includes(needle)) throw new Error(`WF-04C instance target projection missing: ${needle}`);
}

for (const needle of [
  "multiExecTargets",
  "setMultiExecTargets",
  "buildMultiExecTargets({",
  "command-target-terminal-instance",
]) {
  if (!shell.includes(needle)) throw new Error(`WF-04C Command Sender unified target wiring missing: ${needle}`);
}
for (const legacy of [
  "selectedCommandTargetKeys",
  "commandSenderTargetTabByConnectionId",
  "syncCommandSenderTargetTab(",
  "selectCommandSenderTargetTab(",
  "target.tabs",
]) {
  if (shell.includes(legacy)) throw new Error(`WF-04C legacy Command Sender target ownership remains: ${legacy}`);
}

for (const needle of [
  "selectLiveFanoutTargets",
  "Promise.allSettled",
  'status: "written"',
  'status: "failed"',
]) {
  if (!live.includes(needle)) throw new Error(`WF-04C live executor contract missing: ${needle}`);
}
for (const needle of [
  "writeMultiExecLiveInput({",
  'multiExecMode !== "live"',
  "activeTerminalToolbarTabId !== tabId",
  'setMultiExecMode("live")',
]) {
  if (!shell.includes(needle)) throw new Error(`WF-04C live wiring missing: ${needle}`);
}
if (shell.includes("handleTerminalSplitUserInput")) {
  throw new Error("WF-04C must replace split-only input mirroring with unified live input.");
}
if (shell.includes("setTerminalSplitSyncParticipantKeys(new Set())")) {
  throw new Error("Closing/resetting Split must not erase fixed MultiExec target selection.");
}

for (const needle of [
  'status: "written"',
  'status: "failed"',
  'status: "disconnected"',
  "for (const key of input.targetKeys)",
  "await input.write(target.sessionId, input.data)",
]) {
  if (!send.includes(needle)) throw new Error(`WF-04C send executor contract missing: ${needle}`);
}
if (send.includes("Promise.all")) {
  throw new Error("WF-04C send executor must keep ordered one-write-per-target delivery.");
}
for (const needle of [
  "writeMultiExecCommand({",
  'setMultiExecMode("send")',
  'delivery.status === "disconnected"',
]) {
  if (!shell.includes(needle)) throw new Error(`WF-04C send wiring missing: ${needle}`);
}

for (const needle of [
  "A09: fixed two-instance targets receive live/send once while unselected instances stay out",
  "A10: disconnect shrinks the target set and same-profile reconnect never auto-joins or replays",
  'focusedKey: "ssh:b-1"',
  'focusedKey: "ssh:new-a"',
]) {
  if (!acceptance.includes(needle)) {
    throw new Error(`WF-04C A09/A10 acceptance automation missing: ${needle}`);
  }
}
for (const needle of [
  "## WF-04C A09 / A10 GUI acceptance",
  "### A09 fixed targets + live/send",
  "### A10 disconnect + reconnect",
]) {
  if (!fixtureReadme.includes(needle)) {
    throw new Error(`WF-04C real Tauri acceptance instructions missing: ${needle}`);
  }
}

if (!spec.includes("| WS-X04 | 已确认（v0.6） | WF-04C |")) {
  throw new Error("WF-04C WS-X04 decision must be confirmed in WORKFLOW_SPEC v0.6.");
}

console.log("WF-04C fixed-target MultiExec source gate passed");
