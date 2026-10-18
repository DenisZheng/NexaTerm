import type { ConnectionProtocol } from "../connections/connectionTypes";

export interface NewSessionCharacterEntry {
  labelKey: "newSession.telnet" | "newSession.serial" | "newSession.rlogin";
  protocol: Extract<ConnectionProtocol, "telnet" | "serial" | "rlogin">;
}

export const newSessionCharacterEntries: readonly NewSessionCharacterEntry[] = [
  { labelKey: "newSession.telnet", protocol: "telnet" },
  { labelKey: "newSession.serial", protocol: "serial" },
  { labelKey: "newSession.rlogin", protocol: "rlogin" },
];
