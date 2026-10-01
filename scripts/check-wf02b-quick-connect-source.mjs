import { readFileSync } from "node:fs";

const quick = readFileSync(new URL("../src/features/connections/quickConnect.ts", import.meta.url), "utf8");
const runtime = readFileSync(new URL("../src/features/connections/quickConnectRuntime.ts", import.meta.url), "utf8");
const shell = readFileSync(new URL("../src/features/layout/WorkspaceShell.tsx", import.meta.url), "utf8");
const rust = readFileSync(new URL("../src-tauri/src/temporary_connections.rs", import.meta.url), "utf8");
const lib = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");

for (const needle of [
  "parseQuickConnectAddress",
  "ssh://",
  "DEFAULT_SSH_PORT = 22",
  "buildTemporaryConnectionProfile",
  'credential_mode: "prompt"',
]) {
  if (!quick.includes(needle)) throw new Error(`WF-02B Quick Connect parser contract missing: ${needle}`);
}

for (const needle of [
  "temporaryConnectionCreate",
  "temporaryConnectionSetCredentials",
  "temporaryConnectionTerminalConnect",
  "temporaryConnectionRelease",
]) {
  if (!runtime.includes(needle)) throw new Error(`WF-02B runtime wrapper missing: ${needle}`);
}

for (const needle of [
  "TemporaryConnectionManager",
  "ResolvedSshConfig",
  "resolve_transient_connection",
  "temporary_connection_terminal_connect",
  "temporary_connection_release",
]) {
  if (!rust.includes(needle)) throw new Error(`WF-02B Rust context missing: ${needle}`);
}

for (const forbidden of [
  "connection_upsert",
  "connectionUpsert",
  "INSERT INTO connections",
]) {
  if (rust.includes(forbidden)) {
    throw new Error(`WF-02B temporary context must not create a persisted profile: ${forbidden}`);
  }
}

for (const needle of [
  "temporaryConnections",
  "temporaryContextRef",
  "prepareTemporaryQuickConnectCredentials",
  "connectTemporaryQuickTerminal",
  "releaseTemporaryQuickConnectRefs",
]) {
  if (!shell.includes(needle)) throw new Error(`WF-02B shell wiring missing: ${needle}`);
}

if (!lib.includes("TemporaryConnectionManager::default()")) {
  throw new Error("WF-02B temporary manager is not registered in Tauri state");
}

console.log("WF-02B Quick Connect temporary-context source gate passed");
