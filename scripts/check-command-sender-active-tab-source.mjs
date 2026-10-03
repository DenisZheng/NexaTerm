import { readFileSync } from "node:fs";

const workspaceShell = readFileSync("src/features/layout/WorkspaceShell.tsx", "utf8");
const multiExecTargets = readFileSync("src/features/workspace/multiExec/targets.ts", "utf8");

for (const legacy of [
  "function syncCommandSenderTargetTab(",
  "commandSenderTargetTabByConnectionId",
  "setCommandSenderTargetTabByConnectionId",
  "selectedCommandTargetKeys",
  "setSelectedCommandTargetKeys",
  "selectCommandSenderTargetTab(",
]) {
  if (workspaceShell.includes(legacy)) {
    throw new Error(`WF-04C fixed targets must remove legacy active-tab target ownership: ${legacy}`);
  }
}

for (const needle of [
  "multiExecTargets",
  "setMultiExecTargets",
  "buildMultiExecTargets({",
  "key={target.key}",
  "command-target-terminal-instance",
]) {
  if (!workspaceShell.includes(needle)) {
    throw new Error(`WF-04C Command Sender instance target wiring missing: ${needle}`);
  }
}

for (const needle of [
  "terminalPaneBindingKey(binding)",
  "target.key !== sourceKey",
]) {
  if (!multiExecTargets.includes(needle)) {
    throw new Error(`WF-04C instance target projection missing: ${needle}`);
  }
}

const sshActivation = workspaceShell.match(
  /function activateStandaloneTerminalTab\(tab: TerminalTab\) \{[\s\S]*?\n  \}\n\n  function activateTerminalTab/,
)?.[0];
if (!sshActivation || sshActivation.includes("setMultiExecTargets")) {
  throw new Error("SSH focus/activation must not mutate MultiExec targets.");
}

const localActivation = workspaceShell.match(
  /function activateStandaloneLocalTerminalTab\(tab: LocalTerminalTab\) \{[\s\S]*?\n  \}\n\n  function resolveDefaultLocalTerminalProfile/,
)?.[0];
if (!localActivation || localActivation.includes("setMultiExecTargets")) {
  throw new Error("Local focus/activation must not mutate MultiExec targets.");
}

console.log("Command Sender fixed-instance target source check passed.");
