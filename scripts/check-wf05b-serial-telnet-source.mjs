import { readFileSync } from "node:fs";

const entries = readFileSync(new URL("../src/features/layout/newSessionCharacterEntries.ts", import.meta.url), "utf8");
const menu = readFileSync(new URL("../src/features/layout/NewSessionMenu.tsx", import.meta.url), "utf8");
const dialog = readFileSync(new URL("../src/features/connections/ConnectionDialog.tsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("../src/features/layout/WorkspaceShell.tsx", import.meta.url), "utf8");
const serialAvailability = readFileSync(new URL("../src/features/connections/serialPortAvailability.ts", import.meta.url), "utf8");
const telnet = readFileSync(new URL("../src-tauri/src/terminal/telnet.rs", import.meta.url), "utf8");
const serial = readFileSync(new URL("../src-tauri/src/terminal/serial.rs", import.meta.url), "utf8");
const manager = readFileSync(new URL("../src-tauri/src/terminal/manager.rs", import.meta.url), "utf8");
const plan = readFileSync(new URL("../NEXATERM_WORKFLOW_DELIVERY_PLAN.md", import.meta.url), "utf8");

for (const needle of [
  'protocol: "telnet"',
  'protocol: "serial"',
  '"newSession.telnet"',
  '"newSession.serial"',
]) {
  if (!entries.includes(needle)) throw new Error(`WF-05B character entry contract missing: ${needle}`);
}
for (const needle of [
  "newSessionCharacterEntries.map",
  "props.onCreateConnection(entry.protocol)",
]) {
  if (!menu.includes(needle)) throw new Error(`WF-05B New Session wiring missing: ${needle}`);
}
for (const needle of [
  "initialProtocol?: ConnectionProtocol | null",
  'port: protocolDefaultPorts[initialProtocol || "ssh"]',
  'protocol: initialProtocol || "ssh"',
]) {
  if (!dialog.includes(needle)) throw new Error(`WF-05B ConnectionDialog protocol preset missing: ${needle}`);
}
for (const needle of [
  "pendingConnectionProtocol",
  "createConnection(undefined, protocol)",
  "setPendingConnectionProtocol(initialProtocol || null)",
  "initialProtocol={pendingConnectionProtocol}",
]) {
  if (!shell.includes(needle)) throw new Error(`WF-05B shell protocol preset wiring missing: ${needle}`);
}
if (!/function openCharacterConnectionSession[\s\S]*existingTab[\s\S]*activateLocalTerminalTab\(existingTab\)/.test(shell)) {
  throw new Error("WF-05B ordinary Character open must be allowed to focus an existing instance.");
}
if (!/function openNewConnectionSessionWithActivation[\s\S]*openCharacterTerminalInConnection\(connection, activate\)/.test(shell)) {
  throw new Error("WF-05B explicit new-instance path must create a Character sibling instance.");
}
for (const needle of ['"loading"', '"available"', '"no_ports"', '"list_failed"']) {
  if (!serialAvailability.includes(needle)) {
    throw new Error(`WF-05B Serial availability state missing: ${needle}`);
  }
}
for (const needle of [
  "loopback_open_write_close_releases_socket_and_reader",
  'TcpListener::bind(("127.0.0.1", 0))',
  "opened.session.close().await",
  "reader_closed.is_none()",
]) {
  if (!telnet.includes(needle)) throw new Error(`WF-05B Telnet lifecycle evidence missing: ${needle}`);
}
for (const needle of [
  "SerialCloseSignal",
  "serial_close_signal_is_shared_and_idempotent",
  "close_signal.close()",
]) {
  if (!serial.includes(needle)) throw new Error(`WF-05B Serial close signal missing: ${needle}`);
}
for (const needle of [
  "let close_signal = session.close_signal();",
  "ManagedTerminalSession::Serial(session)",
  "while !close_signal.is_closed()",
]) {
  if (!manager.includes(needle)) throw new Error(`WF-05B manager close/reader contract missing: ${needle}`);
}
if (!plan.includes("Serial/Telnet 已有实现，沿现有 LocalTerminalTab source 适配目标模型")) {
  throw new Error("WF-05B must reuse the existing Serial/Telnet providers under WF-05.");
}
if (!plan.includes("Serial 验收需要真实设备或明确记录的模拟串口；不能用 SSH 测试代替")) {
  throw new Error("WF-05B must preserve the real-Serial acceptance boundary.");
}

console.log("WF-05B Serial/Telnet entry and lifecycle source gate passed");
