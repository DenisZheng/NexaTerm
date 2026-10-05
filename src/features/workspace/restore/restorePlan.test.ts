import { describe, expect, it } from "vitest";

import { buildWorkspaceRestorePlan } from "./restorePlan";
import type { WorkspaceSnapshotV1 } from "./snapshotTypes";

const snapshot: WorkspaceSnapshotV1 = {
  activeItemId: "ssh:ssh-a",
  files: { directories: { "ssh:ssh-a": "/srv" }, followActivePane: true },
  instances: [
    {
      id: "ssh:ssh-a",
      kind: "ssh",
      ordinal: 0,
      target: { kind: "profile", profileId: "profile-a" },
    },
    {
      id: "ssh:ssh-missing",
      kind: "ssh",
      ordinal: 1,
      target: { kind: "profile", profileId: "deleted-profile" },
    },
    {
      id: "ssh:ssh-temp",
      kind: "ssh",
      ordinal: 2,
      target: { kind: "temporary", targetId: "temp-a" },
    },
  ],
  order: ["ssh:ssh-a", "ssh:ssh-missing", "ssh:ssh-temp"],
  panes: null,
  sidebar: { collapsed: false, view: "files" },
  version: 1,
};

describe("WF-07 restore planner", () => {
  it("isolates missing and temporary targets without blocking ready siblings", () => {
    const plan = buildWorkspaceRestorePlan(snapshot, {
      autoReconnect: true,
      profileIds: new Set(["profile-a"]),
    });
    expect(plan.items.map((item) => [item.instance.id, item.status, item.autoReconnect])).toEqual([
      ["ssh:ssh-a", "ready", true],
      ["ssh:ssh-missing", "missing-profile", false],
      ["ssh:ssh-temp", "temporary-auth-required", false],
    ]);
    expect(plan.multiExecMode).toBe("off");
  });

  it("restores shell without reconnect when the explicit setting is off", () => {
    const plan = buildWorkspaceRestorePlan(snapshot, {
      autoReconnect: false,
      profileIds: new Set(["profile-a"]),
    });
    expect(plan.items[0]?.status).toBe("ready");
    expect(plan.items[0]?.autoReconnect).toBe(false);
    expect(plan.order).toEqual(snapshot.order);
    expect(plan.files).toEqual(snapshot.files);
  });
});


it("auto-reconnect applies only to terminal instances, not RDP/VNC runners", () => {
  const mixed: WorkspaceSnapshotV1 = {
    ...snapshot,
    instances: [
      ...snapshot.instances,
      { id: "local:local-a", kind: "local", ordinal: 0, source: "local", target: { kind: "profile", profileId: "local-a" } },
      { id: "rdp:rdp-a", kind: "rdp", target: { kind: "profile", profileId: "rdp-a" } },
      { id: "vnc:vnc-a", kind: "vnc", target: { kind: "profile", profileId: "vnc-a" } },
    ],
  };
  const plan = buildWorkspaceRestorePlan(mixed, {
    autoReconnect: true,
    profileIds: new Set(["profile-a", "local-a", "rdp-a", "vnc-a"]),
  });
  expect(plan.items.find((item) => item.instance.id === "local:local-a")?.autoReconnect).toBe(true);
  expect(plan.items.find((item) => item.instance.id === "rdp:rdp-a")?.autoReconnect).toBe(false);
  expect(plan.items.find((item) => item.instance.id === "vnc:vnc-a")?.autoReconnect).toBe(false);
});
