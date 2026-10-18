import { describe, expect, it } from "vitest";

import { newSessionCharacterEntries } from "./newSessionCharacterEntries";

describe("WF-05B character new-session entries", () => {
  it("exposes Telnet, Serial and native Rlogin as explicit protocol presets", () => {
    expect(newSessionCharacterEntries).toEqual([
      { labelKey: "newSession.telnet", protocol: "telnet" },
      { labelKey: "newSession.serial", protocol: "serial" },
      { labelKey: "newSession.rlogin", protocol: "rlogin" },
    ]);
  });

  it("does not silently broaden the entry list to desktop protocols", () => {
    expect(newSessionCharacterEntries.map((entry) => entry.protocol)).not.toContain("rdp");
    expect(newSessionCharacterEntries.map((entry) => entry.protocol)).not.toContain("vnc");
  });
});
