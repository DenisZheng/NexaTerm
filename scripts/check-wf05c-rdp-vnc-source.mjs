import { readFileSync } from "node:fs";

const model = readFileSync(new URL("../src/features/layout/newSessionRemoteDesktopEntries.ts", import.meta.url), "utf8");
const menu = readFileSync(new URL("../src/features/layout/NewSessionMenu.tsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("../src/features/layout/WorkspaceShell.tsx", import.meta.url), "utf8");
const rdp = readFileSync(new URL("../src-tauri/src/rdp.rs", import.meta.url), "utf8");
const vnc = readFileSync(new URL("../src-tauri/src/vnc.rs", import.meta.url), "utf8");
const plan = readFileSync(new URL("../NEXATERM_WORKFLOW_DELIVERY_PLAN.md", import.meta.url), "utf8");

for (const needle of [
  '"embedded"',
  '"embedded_with_fallback"',
  '"external"',
  '"unavailable"',
  '"probe_failed"',
  'runners.includes("mstsc_activex")',
  'runners.includes("novnc")',
]) {
  if (!model.includes(needle)) throw new Error(`WF-05C capability projection missing: ${needle}`);
}
for (const needle of [
  't("newSession.remoteDesktops")',
  'props.onCreateConnection(protocol)',
  'remoteDesktopCapabilityLabelKey(capability)',
  '"newSession.rdp"',
  '"newSession.vnc"',
]) {
  if (!menu.includes(needle)) throw new Error(`WF-05C New Session remote entry missing: ${needle}`);
}
for (const needle of [
  "rdpTestRunner()",
  "vncTestRunner()",
  "Promise.allSettled",
  "remoteDesktopEntryCapabilities",
  "setRemoteDesktopEntryCapabilities",
]) {
  if (!shell.includes(needle)) throw new Error(`WF-05C runner probe wiring missing: ${needle}`);
}
for (const needle of [
  "RdpRunnerKind::MstscActiveX",
  "RdpRunnerKind::Mstsc",
  "RdpRunnerKind::Freerdp",
  "RdpRunnerKind::MacosApp",
  "supports_embedded",
]) {
  if (!rdp.includes(needle)) throw new Error(`WF-05C existing RDP provider contract missing: ${needle}`);
}
for (const needle of [
  "VncRunnerKind::Novnc",
  "supports_embedded: true",
  "launch_embedded_bridge",
]) {
  if (!vnc.includes(needle)) throw new Error(`WF-05C existing VNC provider contract missing: ${needle}`);
}
if (!plan.includes("RDP 保留 Windows embedded、其它平台 external 的真实差异；VNC 复用现有 noVNC/bridge")) {
  throw new Error("WF-05C must preserve the documented RDP/VNC platform differences.");
}
if (!plan.includes("Telnet/RDP/VNC 继续接入统一入口，但作为 Experimental，不阻塞 v1")) {
  throw new Error("WF-05C must remain Experimental/non-blocking under WF-05.");
}

console.log("WF-05C RDP/VNC capability and entry source gate passed");
