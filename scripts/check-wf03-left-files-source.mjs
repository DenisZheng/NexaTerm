import { readFileSync } from "node:fs";

const remote = readFileSync(new URL("../src/features/files/RemoteFilePanel.tsx", import.meta.url), "utf8");
const instanceState = readFileSync(new URL("../src/features/files/remoteFileInstanceState.ts", import.meta.url), "utf8");
const transferStore = readFileSync(new URL("../src/features/files/remoteFileTransferStore.ts", import.meta.url), "utf8");
const transferClosePolicy = readFileSync(new URL("../src/features/files/remoteFileTransferClosePolicy.ts", import.meta.url), "utf8");
const transferController = readFileSync(new URL("../src/features/files/useRemoteFileTransferController.ts", import.meta.url), "utf8");
const transferLifecycleTest = readFileSync(new URL("../src/features/files/remoteFileTransferLifecycle.test.ts", import.meta.url), "utf8");
const transferClosePolicyTest = readFileSync(new URL("../src/features/files/remoteFileTransferClosePolicy.test.ts", import.meta.url), "utf8");
const terminal = readFileSync(new URL("../src/features/terminal/TerminalPanel.tsx", import.meta.url), "utf8");
const terminalScope = readFileSync(new URL("../src/features/terminal/terminalEventScope.ts", import.meta.url), "utf8");
const terminalScopeTest = readFileSync(new URL("../src/features/terminal/terminalEventScope.test.ts", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../src/features/layout/WorkspaceSidebar.tsx", import.meta.url), "utf8");
const sidebarContextTest = readFileSync(new URL("../src/features/layout/workspaceSidebarContext.test.ts", import.meta.url), "utf8");
const shell = readFileSync(new URL("../src/features/layout/WorkspaceShell.tsx", import.meta.url), "utf8");
const itemClose = readFileSync(new URL("../src/features/workspace/sessionTabs/itemClose.ts", import.meta.url), "utf8");
const itemCloseTest = readFileSync(new URL("../src/features/workspace/sessionTabs/itemClose.test.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles/app.css", import.meta.url), "utf8");

for (const needle of [
  "export function RemoteFilesView",
  'activeTool="files"',
  'availableTools={["files"]}',
  "hideToolTabs",
  "followTerminalDirectory",
  "currentRemoteFileFollowPolicy",
  "canApplyDirectoryResponse",
]) {
  if (!remote.includes(needle)) throw new Error(`WF-03 reusable Files view missing: ${needle}`);
}

for (const needle of [
  "files?: ReactNode",
  "<WorkspaceSidebarFiles fileContext={fileContext} files={files} />",
  "fileContext && files",
]) {
  if (!sidebar.includes(needle)) throw new Error(`WF-03 sidebar live Files contract missing: ${needle}`);
}

for (const needle of [
  "files={workspaceSidebarFileContext ? (",
  "<RemoteFilesView",
  "key={workspaceSidebarFileContext.tabId}",
  'setWorkspaceSidebarView("files")',
  'availableTools={["monitor", "commands", "tools", "tunnels", "ai"]}',
]) {
  if (!shell.includes(needle)) throw new Error(`WF-03 shell Files wiring missing: ${needle}`);
}

for (const needle of [
  "remoteFileInstanceOwnerKey",
  "shouldResetRemoteFileNavigation",
  "canApplyRemoteFileDirectoryResponse",
  "manualBrowseBehavior",
]) {
  if (!instanceState.includes(needle)) throw new Error(`WF-03B instance Files ownership missing: ${needle}`);
}

if (!terminal.includes('import { matchesTerminalEvent } from "./terminalEventScope";')) {
  throw new Error("WF-03B TerminalPanel must reuse the scoped terminal event guard");
}
if (!terminalScope.includes("event.request_id === activeRequestId")) {
  throw new Error("WF-03B reconnect scope must reject stale request output");
}

for (const needle of [
  "expectedMtime: tab.metadata.mtime",
  "expectedSize: tab.metadata.size",
  "isRemoteFileConflict(error)",
  'saveState: "conflict"',
  "setPendingRemoteFileConflictId(tabId)",
]) {
  if (!shell.includes(needle)) throw new Error(`WF-03C editor conflict guard missing: ${needle}`);
}

for (const needle of [
  "if (tab?.dirty)",
  "setPendingRemoteFileCloseId(tabId)",
]) {
  if (!shell.includes(needle)) throw new Error(`WF-03C dirty editor close guard missing: ${needle}`);
}
for (const needle of [
  "dirtyFileNames",
  "planRemoteFileTransferClose",
  "transferIdsToCancel",
]) {
  if (!itemClose.includes(needle)) throw new Error(`WF-03C unified close planning missing: ${needle}`);
}

for (const needle of [
  "activeRemoteFileTransferIdsForConnections",
  "rebindRemoteFileTransferItem",
  "rebindRemoteFileTransferConnection",
  "connectionId: input.connectionId ?? null",
]) {
  if (!transferStore.includes(needle)) throw new Error(`WF-03C transfer ownership missing: ${needle}`);
}
for (const needle of [
  'behavior: "confirm-cancel-active"',
  '"keep-running"',
  "planRemoteFileTransferClose",
]) {
  if (!transferClosePolicy.includes(needle)) throw new Error(`WF-03C switchable WS-F09 policy missing: ${needle}`);
}
for (const needle of [
  "requestCancelTransfer",
  "isTransferNoLongerActive",
]) {
  if (!transferController.includes(needle)) throw new Error(`WF-03C transfer cancel lifecycle missing: ${needle}`);
}
for (const needle of [
  "function retryRemoteFileTransfer",
  "prepareTransferRetry",
  "runRemoteFileDownload",
  "rebindRemoteFileTransferConnection(ref, profile.id)",
  "getRemoteFileTransfers()",
  "plan.transferIdsToCancel",
]) {
  if (!shell.includes(needle)) throw new Error(`WF-03C transfer shell lifecycle missing: ${needle}`);
}
if ((shell.match(/connectionId: connection\.id/g) || []).length < 5) {
  throw new Error("WF-03C upload/download transfer creation must retain connection ownership");
}

for (const needle of [
  "keeps a disconnected pane owner instead of borrowing a sibling directory",
  "keeps reconnect cwd updates on the original logical pane",
]) {
  if (!sidebarContextTest.includes(needle)) throw new Error(`WF-03 reconnect coverage missing: ${needle}`);
}
for (const needle of [
  "rejects stale output that could carry an old cwd after reconnect",
  "rejects a sibling terminal event even when both terminals use the same saved profile",
]) {
  if (!terminalScopeTest.includes(needle)) throw new Error(`WF-03 stale cwd coverage missing: ${needle}`);
}
for (const needle of [
  "rebinds local upload ownership and retry connection after temporary save",
  "rebinds download retry input without changing transfer identity",
  "does not touch sibling connection transfers",
]) {
  if (!transferLifecycleTest.includes(needle)) throw new Error(`WF-03C transfer rebind coverage missing: ${needle}`);
}
for (const needle of [
  "defaults to confirm-and-cancel for active transfers after WS-F09 approval",
  "keeps the explicit keep-running policy available without changing ownership logic",
]) {
  if (!transferClosePolicyTest.includes(needle)) throw new Error(`WF-03C close-policy coverage missing: ${needle}`);
}
for (const needle of [
  "会丢弃未保存修改时需要确认",
  "WS-F09 默认 confirm-cancel-active",
  "WS-F09 没有编辑器时，关闭最后 SSH 仍询问并取消活动传输",
]) {
  if (!itemCloseTest.includes(needle)) throw new Error(`WF-03C close regression coverage missing: ${needle}`);
}

if (/\bpwd\b/i.test(shell) || /\bpwd\b/i.test(terminal) || /\bpwd\b/i.test(remote)) {
  throw new Error("WF-03 directory follow must not inject hidden pwd commands");
}
if (shell.includes('setRightTool("files")')) {
  throw new Error("WF-03 daily Files entry must no longer reopen the right-side Files tool");
}
if ((shell.match(/availableTools=\{\["monitor", "commands", "tools", "tunnels", "ai"\]\}/g) || []).length < 2) {
  throw new Error("WF-03 right-side SSH tools must exclude the Files tab");
}
for (const needle of [
  ".workspace-sidebar-files.is-live",
  ".remote-files-view",
]) {
  if (!css.includes(needle)) throw new Error(`WF-03 sidebar Files layout missing: ${needle}`);
}

console.log("WF-03A/03B/03C Files source gate passed");
