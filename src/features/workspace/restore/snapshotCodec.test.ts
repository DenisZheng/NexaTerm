import { describe, expect, it } from "vitest";

import { decodeWorkspaceSnapshot, selectWorkspaceSnapshot } from "./snapshotCodec";

const valid = {
  activeItemId: "split",
  files: {
    directories: { "ssh:ssh-a": "/srv/app", "ssh:gone": "/stale" },
    followActivePane: true,
  },
  instances: [
    {
      id: "ssh:ssh-a",
      kind: "ssh",
      ordinal: 0,
      target: { kind: "profile", profileId: "profile-a" },
    },
  ],
  order: ["ssh:gone", "ssh:ssh-a", "ssh:ssh-a"],
  panes: {
    direction: "row",
    first: { id: "pane-a", instanceId: "ssh:ssh-a", kind: "leaf" },
    id: "root",
    kind: "split",
    ratio: 0.65,
    second: { id: "pane-b", instanceId: "ssh:gone", kind: "leaf" },
  },
  sidebar: { collapsed: false, view: "files" },
  version: 1,
};

describe("WF-07 workspace snapshot decoding", () => {
  it("恢复实例跟随开关，只接受仍存在 SSH 实例的布尔值", () => {
    const snapshot = decodeWorkspaceSnapshot({
      ...valid,
      files: { ...valid.files, followTerminalDirectories: { "ssh:ssh-a": true, "ssh:gone": true } },
    });
    expect(snapshot.files.followTerminalDirectories).toEqual({ "ssh:ssh-a": true });
    const invalid = decodeWorkspaceSnapshot({
      ...valid,
      files: { ...valid.files, followTerminalDirectories: { "ssh:ssh-a": "false" } },
    });
    expect(invalid.files.followTerminalDirectories).toEqual({});
  });

  it("sanitizes stale references while preserving the v1 shell", () => {
    const snapshot = decodeWorkspaceSnapshot(valid);
    expect(snapshot.order).toEqual(["ssh:ssh-a"]);
    expect(snapshot.files.directories).toEqual({ "ssh:ssh-a": "/srv/app" });
    expect(snapshot.panes && snapshot.panes.kind === "split" && snapshot.panes.second)
      .toEqual({ id: "pane-b", instanceId: null, kind: "leaf" });
  });

  it("falls back to backup when current is unsupported", () => {
    const selected = selectWorkspaceSnapshot({
      current: { ...valid, version: 99 },
      backup: valid,
    });
    expect(selected.source).toBe("backup");
    expect(selected.snapshot?.version).toBe(1);
    expect(selected.currentError).toContain("unsupported workspace snapshot version");
  });

  it("starts empty when neither current nor backup can be decoded", () => {
    expect(
      selectWorkspaceSnapshot({
        current: { version: 99 },
        backup: { version: 0 },
      }).snapshot,
    ).toBeNull();
  });
});
