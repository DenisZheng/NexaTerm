import { describe, expect, it } from "vitest";

import { buildWorkspaceShellHydration } from "./shellHydration";
import type { WorkspaceSnapshotV1 } from "./snapshotTypes";

const snapshot: WorkspaceSnapshotV1 = {
  activeItemId: "split",
  files: { directories: { "ssh:ssh-a": "/srv/app" }, followActivePane: true },
  instances: [
    { id: "ssh:ssh-a", kind: "ssh", ordinal: 1, target: { kind: "profile", profileId: "profile-a" } },
    { id: "local:local-a", kind: "local", ordinal: 0, source: "local", target: { kind: "profile", profileId: "wsl-a" } },
    { id: "rdp:rdp-a", kind: "rdp", target: { kind: "profile", profileId: "rdp-profile" } },
    { id: "vnc:vnc-a", kind: "vnc", target: { kind: "profile", profileId: "vnc-profile" } },
  ],
  order: ["ssh:ssh-a", "local:local-a", "rdp:rdp-a", "vnc:vnc-a"],
  panes: {
    direction: "row",
    first: { id: "pane-a", instanceId: "ssh:ssh-a", kind: "leaf" },
    id: "split-root",
    kind: "split",
    ratio: 0.6,
    second: { id: "pane-b", instanceId: "local:local-a", kind: "leaf" },
  },
  sidebar: { collapsed: false, view: "files" },
  version: 1,
};

describe("WF-07 workspace shell hydration", () => {
  it("restores logical placeholders and split bindings without runtime session ids", () => {
    const hydration = buildWorkspaceShellHydration(snapshot, {
      connectionName: (id) => ({ "profile-a": "Production", "rdp-profile": "Desktop", "vnc-profile": "Lab" })[id] || null,
      localProfile: (id) => id === "wsl-a" ? { kind: "wsl", name: "Ubuntu" } : null,
    });

    expect(hydration.terminalTabs).toEqual([
      expect.objectContaining({ connectionId: "profile-a", id: "ssh-a", ordinal: 1, title: "Production" }),
    ]);
    expect(hydration.terminalTabs[0]).not.toHaveProperty("sessionId");
    expect(hydration.localTerminalTabs[0]).toEqual(
      expect.objectContaining({ id: "local-a", profileId: "wsl-a", profileKind: "wsl", title: "Ubuntu" }),
    );
    expect(hydration.splitLayout).toEqual({
      direction: "row",
      first: { binding: { kind: "ssh", tabId: "ssh-a" }, id: "pane-a", kind: "leaf" },
      id: "split-root",
      kind: "split",
      ratio: 0.6,
      second: { binding: { kind: "local", tabId: "local-a" }, id: "pane-b", kind: "leaf" },
    });
    expect(hydration.active).toEqual({ kind: "split", host: { kind: "ssh", tabId: "ssh-a" } });
    expect(hydration.focusedPaneId).toBe("pane-a");
  });

  it("fails closed for malformed logical instance ids", () => {
    expect(() =>
      buildWorkspaceShellHydration({
        ...snapshot,
        activeItemId: "bad-id",
        instances: [{ id: "bad-id", kind: "ssh", ordinal: 0, target: { kind: "profile", profileId: "p" } }],
        order: ["bad-id"],
        panes: null,
      }),
    ).toThrow("invalid workspace instance id");
  });
});
