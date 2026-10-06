import { readFileSync } from "node:fs";

const sqlite = readFileSync(new URL("../src-tauri/src/storage_sqlite.rs", import.meta.url), "utf8");
const repository = readFileSync(new URL("../src-tauri/src/storage_repository.rs", import.meta.url), "utf8");
const rustBoundary = readFileSync(new URL("../src-tauri/src/workspace_snapshot.rs", import.meta.url), "utf8");
const snapshotTypes = readFileSync(new URL("../src/features/workspace/restore/snapshotTypes.ts", import.meta.url), "utf8");
const codec = readFileSync(new URL("../src/features/workspace/restore/snapshotCodec.ts", import.meta.url), "utf8");
const planner = readFileSync(new URL("../src/features/workspace/restore/restorePlan.ts", import.meta.url), "utf8");
const settings = readFileSync(new URL("../src/features/settings/settingsTypes.ts", import.meta.url), "utf8");
const tauriCommands = readFileSync(new URL("../src/shared/tauri/commands.ts", import.meta.url), "utf8");
const shell = readFileSync(new URL("../src/features/layout/WorkspaceShell.tsx", import.meta.url), "utf8");
const remoteFiles = readFileSync(new URL("../src/features/files/RemoteFilePanel.tsx", import.meta.url), "utf8");
const hydration = readFileSync(new URL("../src/features/workspace/restore/shellHydration.ts", import.meta.url), "utf8");
const lifecycle = readFileSync(new URL("../src/features/workspace/restore/useWorkspaceSnapshotLifecycle.ts", import.meta.url), "utf8");
const lifecycleRuntime = readFileSync(new URL("../src/features/layout/workspaceSnapshotRuntime.ts", import.meta.url), "utf8");
const filesBridge = readFileSync(new URL("../src/features/workspace/restore/remoteFileSnapshotBridge.ts", import.meta.url), "utf8");
const a14Acceptance = readFileSync(new URL("../src/features/workspace/restore/a14RestartAcceptance.test.ts", import.meta.url), "utf8");

for (const needle of [
  "CREATE TABLE IF NOT EXISTS workspace_snapshots",
  "current_json TEXT",
  "backup_json TEXT",
  "SQLITE_SCHEMA_VERSION: i64 = 4",
]) {
  if (!sqlite.includes(needle)) throw new Error(`WF-07 local snapshot schema missing: ${needle}`);
}

for (const needle of [
  "workspace_snapshot_get",
  "backup_json = workspace_snapshots.current_json",
  "workspace_snapshot_clear",
]) {
  if (!repository.includes(needle)) throw new Error(`WF-07 snapshot repository seam missing: ${needle}`);
}
const syncStart = repository.indexOf("fn export_sync_settings");
const syncEnd = repository.indexOf("pub fn connection_upsert", syncStart);
const syncBody = repository.slice(syncStart, syncEnd);
if (syncStart < 0 || syncEnd < 0 || syncBody.includes("workspace_snapshots")) {
  throw new Error("WF-07 local workspace snapshot must stay outside WebDAV sync settings export");
}

for (const needle of [
  "MAX_WORKSPACE_SNAPSHOT_BYTES",
  "reject_sensitive_keys",
  '"password"',
  '"sessionid"',
  '"x11cookie"',
  '"runtimecredentials"',
  '"broadcaststate"',
]) {
  if (!rustBoundary.includes(needle)) throw new Error(`WF-07 sensitive snapshot boundary missing: ${needle}`);
}

for (const needle of [
  "WORKSPACE_SNAPSHOT_VERSION",
  "selectWorkspaceSnapshot",
  'source: "backup"',
  "unsupported workspace snapshot version",
]) {
  if (!codec.includes(needle)) throw new Error(`WF-07 decoder/rollback seam missing: ${needle}`);
}

for (const needle of [
  'multiExecMode: "off"',
  '"missing-profile"',
  '"temporary-auth-required"',
  "availability.autoReconnect",
  'instance.kind === "ssh" || instance.kind === "local"',
]) {
  if (!planner.includes(needle)) throw new Error(`WF-07 restore planner seam missing: ${needle}`);
}

for (const needle of [
  "restoreWorkspaceOnLaunch",
  "reopenLastTerminal",
]) {
  if (!settings.includes(needle)) throw new Error(`WF-07 explicit restore setting missing: ${needle}`);
}

for (const needle of [
  "workspaceSnapshotLoad",
  "workspaceSnapshotSave",
  "workspaceSnapshotClear",
]) {
  if (!tauriCommands.includes(needle)) throw new Error(`WF-07 Tauri command wrapper missing: ${needle}`);
}

for (const forbidden of ["sessionId", "password", "privateKey", "x11Cookie", "broadcastState"]) {
  if (!snapshotTypes.includes(forbidden)) continue;
  if (!snapshotTypes.includes("strict whitelist")) {
    throw new Error("WF-07 snapshot contract lost its explicit whitelist boundary");
  }
}
for (const needle of ["toSnapshot(", "useWorkspaceSnapshotLifecycle", "restoreWorkspaceShell", 'setMultiExecMode("off")', "seedWorkspaceRemoteFileDirectories", "buildWorkspaceRestorePlan", "settings.basic.reopenLastTerminal", "requestAnimationFrame", "retryRestoredSshTab", "retryRestoredLocalTab"]) {
  if (!shell.includes(needle)) throw new Error(`WF-07 shell persistence/reconnect seam missing: ${needle}`);
}
for (const needle of ["runtime.load()", "runtime.save(snapshot)", "runtime.schedule", "workspaceSnapshotDebounceMs = 500"]) {
  if (!lifecycle.includes(needle)) throw new Error(`WF-07 snapshot lifecycle seam missing: ${needle}`);
}
for (const needle of ["workspaceSnapshotLoad", "workspaceSnapshotSave", "window.setTimeout", "window.clearTimeout"]) {
  if (!lifecycleRuntime.includes(needle)) throw new Error(`WF-07 snapshot runtime adapter missing: ${needle}`);
}
if (/shared\/tauri|\bwindow\.|\bdocument\./.test(lifecycle)) {
  throw new Error("WF-07 workspace lifecycle must keep Tauri and DOM in its runtime adapter");
}
if (!shell.includes('const prepareRequestId = `prepare-${crypto.randomUUID()}`')) {
  throw new Error("WF-07 SSH attempts must use unique output correlation ids");
}
if (!remoteFiles.includes("publishWorkspaceRemoteFileNavigation(stateKey, activeDirectoryPath)")) {
  throw new Error("WF-07 Files must persist the active browsing directory rather than the tree root");
}
for (const needle of ["buildWorkspaceShellHydration", "applyWorkspaceRestorePlanToHydration", "splitLayout", "focusedPaneId"]) {
  if (!hydration.includes(needle)) throw new Error(`WF-07 shell hydration seam missing: ${needle}`);
}
for (const needle of ["publishWorkspaceRemoteFileNavigation", "getWorkspaceRemoteFileNavigation"]) {
  if (!remoteFiles.includes(needle)) throw new Error(`WF-07 Files persistence seam missing: ${needle}`);
}
for (const needle of ["seedWorkspaceRemoteFileDirectories", "workspaceRemoteFileDirectories"]) {
  if (!filesBridge.includes(needle)) throw new Error(`WF-07 Files snapshot bridge missing: ${needle}`);
}

console.log("WF-07 snapshot storage, safe shell hydration, Files state, debounce persistence and restore planner source gate passed");

for (const needle of [
  "WF-07 A14 real restart acceptance",
  '"ssh:ssh-broken"',
  '"local:wsl-a"',
  'multiExecMode).toBe("off")',
  "automatic reconnect is disabled",
]) {
  if (!a14Acceptance.includes(needle)) throw new Error(`WF-07 A14 acceptance evidence missing: ${needle}`);
}
if (!rustBoundary.includes("workspace_snapshot_survives_repository_reopen_and_rotates_backup_for_a14")) {
  throw new Error("WF-07 A14 repository reopen evidence missing");
}
