import { readFileSync } from "node:fs";

const menu = readFileSync(new URL("../src/features/layout/NewSessionMenu.tsx", import.meta.url), "utf8");
const model = readFileSync(new URL("../src/features/layout/newSessionLocalEntries.ts", import.meta.url), "utf8");
const shell = readFileSync(new URL("../src/features/layout/WorkspaceShell.tsx", import.meta.url), "utf8");
const localProfiles = readFileSync(new URL("../src-tauri/src/terminal/local_profiles.rs", import.meta.url), "utf8");
const localRuntime = readFileSync(new URL("../src-tauri/src/terminal/local.rs", import.meta.url), "utf8");
const commands = readFileSync(new URL("../src/shared/tauri/commands.ts", import.meta.url), "utf8");
const tauriLib = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
const plan = readFileSync(new URL("../NEXATERM_WORKFLOW_DELIVERY_PLAN.md", import.meta.url), "utf8");

for (const needle of [
  'profile.kind !== "wsl"',
  'profile.kind === "wsl"',
  'input.platform === "windows"',
  '"detectionFailed"',
  '"notDetected"',
]) {
  if (!model.includes(needle)) throw new Error(`WF-05A Local/WSL entry model missing: ${needle}`);
}
for (const needle of [
  "buildNewSessionTerminalSections({",
  't("newSession.wsl")',
  "sections.wslProfiles",
  "newSession.wslNotDetected",
]) {
  if (!menu.includes(needle)) throw new Error(`WF-05A New Session wiring missing: ${needle}`);
}
for (const needle of [
  "desktopPlatform,",
  "localProfilesError: localTerminalProfilesError,",
  "localProfiles: localTerminalProfiles",
  "localTerminalWslCapability()",
  'setWslProviderStatus("available")',
  'setWslProviderStatus("probe_failed")',
]) {
  if (!shell.includes(needle)) throw new Error(`WF-05A shell entry context missing: ${needle}`);
}
for (const needle of [
  "WslProviderStatus",
  "CommandMissing",
  "NoDistribution",
  "ProbeTimeout",
  "ProbeFailed",
  "UnsupportedPlatform",
  "wsl_profile_identity_is_stable_across_refresh",
]) {
  if (!localProfiles.includes(needle)) throw new Error(`WF-05A WSL capability backend missing: ${needle}`);
}
for (const needle of [
  "wsl_profile_uses_shared_local_session_close_lifecycle",
  "LocalTerminalSession::open",
  "session.close()",
]) {
  if (!localRuntime.includes(needle)) throw new Error(`WF-05A Local/WSL lifecycle evidence missing: ${needle}`);
}
if (!commands.includes('invoke<WslProviderCapability>("local_terminal_wsl_capability")')) {
  throw new Error("WF-05A frontend WSL capability command missing.");
}
if (!tauriLib.includes("commands::local_terminal_wsl_capability")) {
  throw new Error("WF-05A Tauri WSL capability command registration missing.");
}
for (const needle of [
  '"commandMissing"',
  '"noDistribution"',
  '"probeTimeout"',
  '"probeFailed"',
  '"availableHidden"',
]) {
  if (!model.includes(needle)) throw new Error(`WF-05A exact WSL entry reason missing: ${needle}`);
}
if (!plan.includes("### WF-05：把已有协议带入统一入口")) {
  throw new Error("WF-05A must remain under the 2026-09-23 WF-05 delivery package.");
}
if (!plan.includes("Local/WSL/Serial 属于 v1 核心")) {
  throw new Error("WF-05A must preserve the v1-core Local/WSL scope.");
}

console.log("WF-05A Local/WSL unified-entry source gate passed");
