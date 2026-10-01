import { describe, expect, it } from "vitest";

import { toSnapshot, WORKSPACE_SNAPSHOT_VERSION } from "./snapshotTypes";

describe("WF-01 workspace snapshot contract", () => {
  it("projects logical instances, order, panes, Files state, and sidebar state", () => {
    const pointers = {
      activeItemId: "split",
      broadcastState: "active-secret-state",
      files: {
        directories: {
          "ssh:ssh-a": "/srv/app",
          "local:local-a": "/tmp/local",
          "ssh:stale": "/private/stale",
        },
        followActivePane: true,
      },
      order: ["rdp:rdp-a", "ssh:ssh-a", "stale", "rdp:rdp-a"],
      sidebar: { collapsed: false, view: "files" as const },
      splitLayout: {
        direction: "row" as const,
        first: {
          binding: { kind: "ssh" as const, tabId: "ssh-a" },
          id: "pane-a",
          kind: "leaf" as const,
        },
        id: "split-root",
        kind: "split" as const,
        ratio: 0.66,
        second: {
          binding: { kind: "local" as const, tabId: "local-a" },
          id: "pane-b",
          kind: "leaf" as const,
        },
      },
    };

    const collections = {
      terminalTabs: [
        {
          connectionId: "ssh-profile",
          id: "ssh-a",
          ordinal: 0,
          password: "fixture-password",
          privateKey: "fixture-private-key",
          sessionId: "runtime-ssh-session",
          x11Cookie: "fixture-x11-cookie",
        },
      ],
      localTerminalTabs: [
        {
          id: "local-a",
          ordinal: 1,
          profileId: "local-profile",
          sessionId: "runtime-local-session",
          source: "local" as const,
        },
      ],
      rdpSessions: [
        {
          connectionId: "rdp-profile",
          id: "rdp-a",
          sessionId: "runtime-rdp-session",
        },
      ],
      vncSessions: [
        {
          connectionId: "vnc-profile",
          id: "vnc-a",
          sessionId: "runtime-vnc-session",
        },
      ],
      targetRefs: {
        connections: {
          "ssh-profile": {
            kind: "temporary" as const,
            targetId: "temporary-target-a",
            password: "target-secret",
          },
        },
      },
    };

    const snapshot = toSnapshot(pointers, collections);

    expect(snapshot).toStrictEqual({
      activeItemId: "split",
      files: {
        directories: { "ssh:ssh-a": "/srv/app" },
        followActivePane: true,
      },
      instances: [
        {
          id: "ssh:ssh-a",
          kind: "ssh",
          ordinal: 0,
          target: { kind: "temporary", targetId: "temporary-target-a" },
        },
        {
          id: "local:local-a",
          kind: "local",
          ordinal: 1,
          source: "local",
          target: { kind: "profile", profileId: "local-profile" },
        },
        {
          id: "rdp:rdp-a",
          kind: "rdp",
          target: { kind: "profile", profileId: "rdp-profile" },
        },
        {
          id: "vnc:vnc-a",
          kind: "vnc",
          target: { kind: "profile", profileId: "vnc-profile" },
        },
      ],
      order: ["rdp:rdp-a", "ssh:ssh-a", "local:local-a", "vnc:vnc-a"],
      panes: {
        direction: "row",
        first: { id: "pane-a", instanceId: "ssh:ssh-a", kind: "leaf" },
        id: "split-root",
        kind: "split",
        ratio: 0.66,
        second: { id: "pane-b", instanceId: "local:local-a", kind: "leaf" },
      },
      sidebar: { collapsed: false, view: "files" },
      version: WORKSPACE_SNAPSHOT_VERSION,
    });

    const serialized = JSON.stringify(snapshot);
    for (const forbidden of [
      "sessionId",
      "password",
      "privateKey",
      "x11Cookie",
      "broadcastState",
      "runtime-ssh-session",
      "fixture-password",
      "fixture-private-key",
      "fixture-x11-cookie",
      "target-secret",
      "active-secret-state",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("fails closed for stale active items and stale pane bindings", () => {
    const snapshot = toSnapshot(
      {
        activeItemId: "ssh:missing",
        files: {
          directories: {
            "ssh:missing": "/stale",
            "ssh:ssh-a": "",
          },
          followActivePane: false,
        },
        order: ["ssh:missing"],
        sidebar: { collapsed: true, view: "sessions" },
        splitLayout: {
          binding: { kind: "ssh", tabId: "missing" },
          id: "pane-stale",
          kind: "leaf",
        },
      },
      {
        localTerminalTabs: [],
        rdpSessions: [],
        terminalTabs: [{ connectionId: "profile-a", id: "ssh-a", ordinal: 0 }],
        vncSessions: [],
      },
    );

    expect(snapshot.activeItemId).toBeNull();
    expect(snapshot.order).toStrictEqual(["ssh:ssh-a"]);
    expect(snapshot.files.directories).toStrictEqual({});
    expect(snapshot.panes).toStrictEqual({
      id: "pane-stale",
      instanceId: null,
      kind: "leaf",
    });
  });

  it("drops the split active item when there is no split layout", () => {
    const snapshot = toSnapshot(
      {
        activeItemId: "split",
        files: { directories: {}, followActivePane: true },
        order: [],
        sidebar: { collapsed: false, view: "files" },
        splitLayout: null,
      },
      {
        localTerminalTabs: [],
        rdpSessions: [],
        terminalTabs: [],
        vncSessions: [],
      },
    );

    expect(snapshot.activeItemId).toBeNull();
    expect(snapshot.panes).toBeNull();
  });
});
