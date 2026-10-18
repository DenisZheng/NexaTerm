import { readFileSync } from "node:fs";

const dialogSource = readFileSync("src/features/connections/ConnectionDialog.tsx", "utf8");

const requiredSnippets = [
  {
    message: "ConnectionDialog should keep default protocol ports centralized.",
    snippet: "const protocolDefaultPorts",
  },
  {
    message: "ConnectionDialog should detect serial endpoint state before protocol switches.",
    snippet: "function usesSerialEndpoint",
  },
  {
    message: "ConnectionDialog protocol switch should prevent serial endpoint leakage.",
    snippet: "const serialEndpoint = usesSerialEndpoint(current);",
  },
  {
    message: "ConnectionDialog protocol switch should clear serial host when leaving serial.",
    snippet: 'host: serialEndpoint ? "" : current.host',
  },
  {
    message: "ConnectionDialog protocol switch should reset serial port when leaving serial.",
    snippet: "port: serialEndpoint",
  },
  {
    message: "ConnectionDialog should reset serial endpoint to the RDP default port.",
    snippet: "? protocolDefaultPorts.rdp",
  },
  {
    message: "ConnectionDialog should reset serial endpoint to the VNC default port.",
    snippet: "? protocolDefaultPorts.vnc",
  },
  {
    message: "ConnectionDialog should reset serial endpoint to the Telnet default port.",
    snippet: "? protocolDefaultPorts.telnet",
  },
  {
    message: "ConnectionDialog should reset serial endpoint to the SSH default port.",
    snippet: "? protocolDefaultPorts.ssh",
  },
  {
    message: "Connection host fields should use direct input guidance.",
    snippet: 'placeholder={t("connectionDialog.hostPlaceholder")}',
  },
  {
    message: "Connection username fields should use direct input guidance.",
    snippet: 'placeholder={t("connectionDialog.usernamePlaceholder")}',
  },
];

for (const { message, snippet } of requiredSnippets) {
  if (!dialogSource.includes(snippet)) {
    throw new Error(`${message}: ${snippet}`);
  }
}

const rloginFields = readFileSync("src/features/connections/RloginConnectionFields.tsx", "utf8");
const optionalNameLabel = 't("connectionDialog.field.nameOptional")';
const optionalNameLabelCount = dialogSource.split(optionalNameLabel).length - 1;
if (optionalNameLabelCount !== 4 || !rloginFields.includes(optionalNameLabel)) {
  throw new Error("Every connection protocol name field should visibly explain that it may be blank.");
}

for (const placeholder of [
  'placeholder="192.168.1.20"',
  'placeholder="203.0.113.70"',
  'placeholder="root"',
  'placeholder="administrator"',
]) {
  if (dialogSource.includes(placeholder)) {
    throw new Error(`Connection fields should not use example values as placeholders: ${placeholder}`);
  }
}

const normalizeSource = readFileSync("src/features/connections/connectionForm.ts", "utf8");
if (!dialogSource.includes('from "./connectionForm"') || !normalizeSource.includes('if (form.protocol === "rlogin") return normalizeRloginInput(form);')) {
  throw new Error("ConnectionDialog must use the extracted converter and explicit Rlogin branch.");
}

const protocolIsolationChecks = [
  {
    protocol: "rdp",
    owns: ["rdp: withDefaultRdpConfig(form.rdp)"],
    clears: ["rlogin: undefined", "vnc: undefined", "telnet: undefined", "serial: undefined"],
  },
  {
    protocol: "vnc",
    owns: ["vnc: withDefaultVncConfig(form.vnc)"],
    clears: ["rlogin: undefined", "rdp: undefined", "telnet: undefined", "serial: undefined"],
  },
  {
    protocol: "telnet",
    owns: ["telnet: withDefaultTelnetConfig(form.telnet)"],
    clears: ["rlogin: undefined", "rdp: undefined", "vnc: undefined", "serial: undefined"],
  },
  {
    protocol: "serial",
    owns: ["serial: {", "port_name: portName"],
    clears: ["rlogin: undefined", "rdp: undefined", "vnc: undefined", "telnet: undefined"],
  },
  {
    protocol: "ssh",
    owns: ['protocol: "ssh"'],
    clears: ["rlogin: undefined", "rdp: undefined", "vnc: undefined", "telnet: undefined", "serial: undefined"],
  },
];

for (const { protocol, owns, clears } of protocolIsolationChecks) {
  const protocolIndex = normalizeSource.indexOf(`protocol: "${protocol}"`);
  if (protocolIndex === -1) {
    throw new Error(`normalizeForSubmit should explicitly submit the active ${protocol} protocol.`);
  }

  const nextProtocolIndex = protocolIsolationChecks
    .filter((check) => check.protocol !== protocol)
    .map((check) => normalizeSource.indexOf(`protocol: "${check.protocol}"`, protocolIndex + 1))
    .filter((index) => index !== -1)
    .sort((left, right) => left - right)[0];
  const branchSource = normalizeSource.slice(
    protocolIndex,
    nextProtocolIndex === undefined ? normalizeSource.length : nextProtocolIndex,
  );

  for (const snippet of [...owns, ...clears]) {
    if (!branchSource.includes(snippet)) {
      throw new Error(`normalizeForSubmit ${protocol} branch should isolate active-tab data: ${snippet}`);
    }
  }
}

console.log("Connection protocol submit source check passed.");
