import { readFileSync } from "node:fs";

const dialog = readFileSync(new URL("../src/features/connections/ConnectionDialog.tsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("../src/features/layout/WorkspaceShell.tsx", import.meta.url), "utf8");
const policy = readFileSync(new URL("../src/features/connections/connectionDialogSubmit.ts", import.meta.url), "utf8");

for (const needle of [
  '"save-and-connect"',
  'tr("connection.submit.saveConnect")',
  'tr("connection.submit.saveOnly")',
  'tr("connection.submit.save")',
  'tr("connection.submit.saveNew")',
]) {
  if (!policy.includes(needle)) throw new Error(`WF-02A submit policy missing: ${needle}`);
}
for (const needle of [
  "connectionDialogSubmitPolicy(Boolean(connection && !duplicate))",
  "onSave(normalizeForSubmit(form, credentials), intent)",
  "reportValidity()",
]) {
  if (!dialog.includes(needle)) throw new Error(`WF-02A dialog wiring missing: ${needle}`);
}
for (const needle of [
  "const saved = await saveConnection(input);",
  'if (intent === "save-and-connect") openNewConnectionSession(saved);',
  "function openNewConnectionSession(connection: ConnectionProfile)",
  "startRdpSession(connection)",
  "startVncSession(connection)",
  "openCharacterTerminalInConnection(connection)",
  'startConnectionStep(connection, "terminal")',
]) {
  if (!shell.includes(needle)) throw new Error(`WF-02A shell wiring missing: ${needle}`);
}
function bodyBetween(start, end) {
  const a = shell.indexOf(start);
  const b = shell.indexOf(end, a);
  if (a < 0 || b < 0) throw new Error(`WF-02A source range missing: ${start}`);
  return shell.slice(a, b);
}
if (bodyBetween("function startRdpSession", "function revealNativeRdpHostSession").includes("preferredRdpSessionForConnection")) {
  throw new Error("WF-02A explicit RDP starter must create a new runtime instance");
}
if (bodyBetween("function startVncSession", "async function runVncSession").includes("preferredVncSessionForConnection")) {
  throw new Error("WF-02A explicit VNC starter must create a new runtime instance");
}
console.log("WF-02A save-and-connect source gate passed");
