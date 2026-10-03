import { readFileSync } from "node:fs";

const sqlite = readFileSync(new URL("../src-tauri/src/storage_sqlite.rs", import.meta.url), "utf8");
const repository = readFileSync(new URL("../src-tauri/src/storage_repository.rs", import.meta.url), "utf8");
const rustBoundary = readFileSync(new URL("../src-tauri/src/workspace_snapshot.rs", import.meta.url), "utf8");
const snapshotTypes = readFileSync(new URL("../src/features/workspace/restore/snapshotTypes.ts", import.meta.url), "utf8");
const codec = readFileSync(new URL("../src/features/workspace/restore/snapshotCodec.ts", import.meta.url), "utf8");
const planner = readFileSync(new URL("../src/features/workspace/restore/restorePlan.ts", import.meta.url), "utf8");
const settings = readFileSync(new URL("../src/features/settings/settingsTypes.ts", import.meta.url), "utf8");
const tauriCommands = readFileSync(new URL("../src/shared/tauri/commands.ts", import.meta.url), "utf8");

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

console.log("WF-07 local snapshot storage, rollback, sensitive-data boundary and restore planner source gate passed");
