import { readFileSync } from "node:fs";

const remote = readFileSync(new URL("../src/features/files/RemoteFilePanel.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../src/features/layout/WorkspaceSidebar.tsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("../src/features/layout/WorkspaceShell.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles/app.css", import.meta.url), "utf8");

for (const needle of [
  "export function RemoteFilesView",
  'activeTool="files"',
  'availableTools={["files"]}',
  "hideToolTabs",
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
  'setWorkspaceSidebarView("files")',
  'availableTools={["monitor", "commands", "tools", "tunnels", "ai"]}',
]) {
  if (!shell.includes(needle)) throw new Error(`WF-03 shell Files wiring missing: ${needle}`);
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

console.log("WF-03A left Files source gate passed");
