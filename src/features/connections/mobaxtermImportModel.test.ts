import { describe, expect, it } from "vitest";

import { canSelectMobaXtermRow, isMobaXtermRowEditable } from "./mobaxtermImportModel";
import type { MobaXtermImportItem } from "./mobaxtermImportTypes";

function row(overrides: Partial<MobaXtermImportItem> = {}): MobaXtermImportItem {
  return {
    source_index: 0,
    name: "Server",
    kind: "ssh",
    source_type_code: "0",
    host: "server.example.test",
    port: 22,
    username: null,
    status: "needs_input",
    missing_fields: ["username"],
    warnings: [],
    conflict: "none",
    selectable: false,
    ...overrides,
  };
}

describe("MobaXterm row-specific username selection", () => {
  it("enables a username-missing SSH row as soon as its own username is filled", () => {
    const item = row();
    expect(isMobaXtermRowEditable(item)).toBe(true);
    expect(canSelectMobaXtermRow(item, "Server", "")).toBe(false);
    expect(canSelectMobaXtermRow(item, "Server", " qa-user ")).toBe(true);
  });

  it("does not require replacing a source username with the shared fallback", () => {
    const item = row({
      username: "deploy",
      effective_username: "deploy",
      status: "ready",
      missing_fields: [],
      selectable: true,
    });
    expect(canSelectMobaXtermRow(item, "Server", "deploy")).toBe(true);
    expect(canSelectMobaXtermRow(item, "Server", "root")).toBe(true);
  });

  it("keeps invalid, unsupported and Jump/Proxy rows blocked even with a username", () => {
    expect(canSelectMobaXtermRow(row({ status: "invalid" }), "Server", "root")).toBe(false);
    expect(canSelectMobaXtermRow(row({ kind: "wsl", status: "unsupported" }), "Server", "root")).toBe(false);
    expect(
      canSelectMobaXtermRow(
        row({ missing_fields: ["username", "network_settings_review"] }),
        "Server",
        "root",
      ),
    ).toBe(false);
  });

  it("requires a new name for an existing session or name conflict", () => {
    for (const conflict of ["exact_duplicate", "name_conflict"] as const) {
      const item = row({ conflict });
      expect(canSelectMobaXtermRow(item, "Server", "root")).toBe(false);
      expect(canSelectMobaXtermRow(item, "Server (imported)", "root")).toBe(true);
    }
  });

  it("refuses an empty renamed connection or whitespace-only username", () => {
    const item = row();
    expect(canSelectMobaXtermRow(item, "   ", "deploy")).toBe(false);
    expect(canSelectMobaXtermRow(item, "Server", "  ")).toBe(false);
  });
});
