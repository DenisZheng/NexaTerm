import { describe, expect, it } from "vitest";

import { buildWorkspaceRestorePlan } from "./restorePlan";
import { applyWorkspaceRestorePlanToHydration, buildWorkspaceShellHydration } from "./shellHydration";
import type { WorkspaceSnapshotV1 } from "./snapshotTypes";

const restartSnapshot: WorkspaceSnapshotV1 = {
  activeItemId: "split",
  files: {
    directories: {
      "ssh:ssh-a": "/srv/a",
      "ssh:ssh-b": "/srv/b",
      "ssh:ssh-broken": "/srv/deleted",
    },
    followActivePane: true,
  },
  instances: [
    { id: "ssh:ssh-a", kind: "ssh", ordinal: 0, target: { kind: "profile", profileId: "ssh-a" } },
    { id: "ssh:ssh-b", kind: "ssh", ordinal: 1, target: { kind: "profile", profileId: "ssh-b" } },
    { id: "ssh:ssh-broken", kind: "ssh", ordinal: 2, target: { kind: "profile", profileId: "deleted-profile" } },
    { id: "local:local-a", kind: "local", ordinal: 0, source: "local", target: { kind: "profile", profileId: "local-a" } },
    { id: "local:wsl-a", kind: "local", ordinal: 1, source: "local", target: { kind: "profile", profileId: "wsl-a" } },
  ],
  order: ["ssh:ssh-a", "ssh:ssh-b", "ssh:ssh-broken", "local:local-a", "local:wsl-a"],
  panes: {
    direction: "row",
    first: {
      direction: "column",
      first: { id: "pane-ssh-a", instanceId: "ssh:ssh-a", kind: "leaf" },
      id: "split-left",
      kind: "split",
      ratio: 0.55,
      second: { id: "pane-broken", instanceId: "ssh:ssh-broken", kind: "leaf" },
    },
    id: "split-root",
    kind: "split",
    ratio: 0.58,
    second: {
      direction: "column",
      first: { id: "pane-local", instanceId: "local:local-a", kind: "leaf" },
      id: "split-right",
      kind: "split",
      ratio: 0.5,
      second: { id: "pane-wsl", instanceId: "local:wsl-a", kind: "leaf" },
    },
  },
  sidebar: { collapsed: false, view: "files" },
  version: 1,
};

const availableProfiles = new Set(["ssh-a", "ssh-b", "local-a", "wsl-a"]);

function hydrate(autoReconnect: boolean) {
  const plan = buildWorkspaceRestorePlan(restartSnapshot, {
    autoReconnect,
    profileIds: availableProfiles,
  });
  const hydration = applyWorkspaceRestorePlanToHydration(
    buildWorkspaceShellHydration(restartSnapshot, {
      connectionName: (id) =>
        ({
          "ssh-a": "SSH A",
          "ssh-b": "SSH B",
          "deleted-profile": "Deleted SSH",
        })[id] || null,
      localProfile: (id) =>
        ({
          "local-a": { kind: "local", name: "Local" },
          "wsl-a": { kind: "wsl", name: "Ubuntu 24.04" },
        })[id] || null,
    }),
    plan,
  );
  return { hydration, plan };
}

describe("WF-07 A14 real restart acceptance", () => {
  it("restores a multi-session split workspace, isolates one deleted profile, and forces MultiExec off", () => {
    const { hydration, plan } = hydrate(true);

    expect(plan.order).toEqual(restartSnapshot.order);
    expect(plan.panes).toEqual(restartSnapshot.panes);
    expect(plan.files).toEqual(restartSnapshot.files);
    expect(plan.sidebar).toEqual(restartSnapshot.sidebar);
    expect(plan.multiExecMode).toBe("off");

    expect(plan.items.map((item) => [item.instance.id, item.status, item.autoReconnect])).toEqual([
      ["ssh:ssh-a", "ready", true],
      ["ssh:ssh-b", "ready", true],
      ["ssh:ssh-broken", "missing-profile", false],
      ["local:local-a", "ready", true],
      ["local:wsl-a", "ready", true],
    ]);

    expect(hydration.terminalTabs).toHaveLength(3);
    expect(hydration.localTerminalTabs).toHaveLength(2);
    expect(hydration.terminalTabs.find((tab) => tab.id === "ssh-a")).toMatchObject({
      status: "正在恢复",
      title: "SSH A",
    });
    expect(hydration.terminalTabs.find((tab) => tab.id === "ssh-b")).toMatchObject({
      status: "正在恢复",
      title: "SSH B",
    });
    expect(hydration.terminalTabs.find((tab) => tab.id === "ssh-broken")).toMatchObject({
      error: expect.stringContaining("已不存在"),
      status: "连接失败",
      title: "Deleted SSH",
    });
    expect(hydration.localTerminalTabs.find((tab) => tab.id === "local-a")).toMatchObject({
      profileKind: "local",
      status: "正在恢复",
      title: "Local",
    });
    expect(hydration.localTerminalTabs.find((tab) => tab.id === "wsl-a")).toMatchObject({
      profileKind: "wsl",
      status: "正在恢复",
      title: "Ubuntu 24.04",
    });

    expect(hydration.active).toEqual({
      kind: "split",
      host: { kind: "ssh", tabId: "ssh-a" },
    });
    expect(hydration.focusedPaneId).toBe("pane-ssh-a");
    expect(hydration.splitLayout).toEqual({
      direction: "row",
      first: {
        direction: "column",
        first: { binding: { kind: "ssh", tabId: "ssh-a" }, id: "pane-ssh-a", kind: "leaf" },
        id: "split-left",
        kind: "split",
        ratio: 0.55,
        second: { binding: { kind: "ssh", tabId: "ssh-broken" }, id: "pane-broken", kind: "leaf" },
      },
      id: "split-root",
      kind: "split",
      ratio: 0.58,
      second: {
        direction: "column",
        first: { binding: { kind: "local", tabId: "local-a" }, id: "pane-local", kind: "leaf" },
        id: "split-right",
        kind: "split",
        ratio: 0.5,
        second: { binding: { kind: "local", tabId: "wsl-a" }, id: "pane-wsl", kind: "leaf" },
      },
    });
  });

  it("restores the same shell without reconnecting when reopen-last-terminal is disabled", () => {
    const { hydration, plan } = hydrate(false);

    expect(plan.multiExecMode).toBe("off");
    expect(plan.items.filter((item) => item.status === "ready").every((item) => !item.autoReconnect)).toBe(true);
    expect(hydration.terminalTabs.find((tab) => tab.id === "ssh-a")).toMatchObject({
      error: expect.stringContaining("自动重连未开启"),
      status: "连接失败",
    });
    expect(hydration.localTerminalTabs.find((tab) => tab.id === "wsl-a")).toMatchObject({
      error: expect.stringContaining("自动重连未开启"),
      status: "连接失败",
    });
  });
});
