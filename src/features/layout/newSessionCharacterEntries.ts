import type { ConnectionProtocol } from "../connections/connectionTypes";

export interface NewSessionCharacterEntry {
  labelKey: "newSession.telnet" | "newSession.serial";
  protocol: Extract<ConnectionProtocol, "telnet" | "serial">;
}

export const newSessionCharacterEntries: readonly NewSessionCharacterEntry[] = [
  { labelKey: "newSession.telnet", protocol: "telnet" },
  { labelKey: "newSession.serial", protocol: "serial" },
];
