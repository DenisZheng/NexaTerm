import { readFileSync } from "node:fs";

const model = readFileSync(new URL("../src/features/connections/batchConnectModel.ts", import.meta.url), "utf8");
const executor = readFileSync(new URL("../src/features/connections/batchConnectExecutor.ts", import.meta.url), "utf8");
const runtime = readFileSync(new URL("../src/features/connections/batchConnectWorkspaceRuntime.ts", import.meta.url), "utf8");
const pane = readFileSync(new URL("../src/features/connections/ConnectionPane.tsx", import.meta.url), "utf8");
const ui = readFileSync(new URL("../src/features/connections/BatchConnectUi.tsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("../src/features/layout/WorkspaceShell.tsx", import.meta.url), "utf8");
const splitActions = readFileSync(new URL("../src/features/workspace/split/actions.ts", import.meta.url), "utf8");
const instances = readFileSync(new URL("../src/features/workspace/sessionTabs/instances.ts", import.meta.url), "utf8");
const spec = readFileSync(new URL("../docs/WORKFLOW_SPEC.md", import.meta.url), "utf8");

for (const needle of [
  "batchConnectMaxNewSessions = 20",
  "batchConnectMaxConcurrentAttempts = 4",
  "selectionLimitReached",
  '"waiting-user"',
]) {
  if (!model.includes(needle)) throw new Error(`WF-04B bounded batch model missing: ${needle}`);
}
for (const needle of ["cancelRemaining()", "adapter.cancel(handle)", "results.set(connectionId, result)"]) {
  if (!executor.includes(needle)) throw new Error(`WF-04B executor lifecycle missing: ${needle}`);
}
for (const needle of [
  "batchWorkspaceClosePlan",
  "sshTabIds: handle.kind === \"ssh\" ? [handle.id] : []",
  "localTabIds: handle.kind === \"character\" ? [handle.id] : []",
]) {
  if (!runtime.includes(needle)) throw new Error(`WF-04B instance cancel isolation missing: ${needle}`);
}
for (const needle of ["BatchConnectPreviewDialog", "BatchConnectStatusPanel", 't("batchConnect.menu")']) {
  if (!pane.includes(needle)) throw new Error(`WF-04B tree UI missing: ${needle}`);
}
for (const needle of [
  "includeDescendants",
  "batchConnectMaxNewSessions",
  "cancelRemaining",
  "retryFailed",
]) {
  if (!ui.includes(needle)) throw new Error(`WF-04B preview/status UI missing: ${needle}`);
}
for (const needle of [
  'export type TerminalSplitHost = TerminalPaneBinding;',
  "type: \"split/setHost\"",
]) {
  if (!splitActions.includes(needle)) throw new Error(`WF-04B exact split host missing: ${needle}`);
}
if (splitActions.includes("setAnchorIndex")) {
  throw new Error("WF-04B must not persist a numeric split anchor that can drift from the host instance");
}
for (const needle of [
  "instanceItemId(split.host.kind, split.host.tabId)",
  "members.find((item) => item.id === hostId)",
]) {
  if (!instances.includes(needle)) throw new Error(`WF-04B split instance projection missing: ${needle}`);
}
for (const needle of [
  'group: "新建 SSH 实例"',
  'group: "新建 Telnet / 串口实例"',
  "splitGroupInsertionIndex(",
]) {
  if (!shell.includes(needle)) throw new Error(`WF-04B split picker/anchor wiring missing: ${needle}`);
}
if (shell.includes("terminalSplitAnchorIndex")) {
  throw new Error("WF-04B shell still depends on legacy numeric split anchor");
}
if (!spec.includes("| WS-X09 | 已确认（v0.5） | WF-04B |")) {
  throw new Error("WF-04B WS-X09 decision is not recorded as confirmed");
}

console.log("WF-04B bounded batch + instance split source gate passed");
