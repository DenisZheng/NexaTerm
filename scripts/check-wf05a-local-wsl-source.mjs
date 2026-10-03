import { readFileSync } from "node:fs";

const menu = readFileSync(new URL("../src/features/layout/NewSessionMenu.tsx", import.meta.url), "utf8");
const model = readFileSync(new URL("../src/features/layout/newSessionLocalEntries.ts", import.meta.url), "utf8");
const shell = readFileSync(new URL("../src/features/layout/WorkspaceShell.tsx", import.meta.url), "utf8");
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
for (const needle of ["desktopPlatform,", "localProfilesError,", "localProfiles: localTerminalProfiles"]) {
  if (!shell.includes(needle)) throw new Error(`WF-05A shell entry context missing: ${needle}`);
}
if (!plan.includes("### WF-05：把已有协议带入统一入口")) {
  throw new Error("WF-05A must remain under the 2026-09-23 WF-05 delivery package.");
}
if (!plan.includes("Local/WSL/Serial 属于 v1 核心")) {
  throw new Error("WF-05A must preserve the v1-core Local/WSL scope.");
}

console.log("WF-05A Local/WSL unified-entry source gate passed");
