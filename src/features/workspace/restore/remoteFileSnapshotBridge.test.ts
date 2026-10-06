import { describe, expect, it, vi } from "vitest";
import { decodeWorkspaceSnapshot } from "./snapshotCodec";
import { toSnapshot } from "./snapshotTypes";
import {
  publishWorkspaceRemoteFileNavigation,
  seedWorkspaceRemoteFileDirectories,
  workspaceRemoteFileDirectories,
  workspaceRemoteFileFollowStates,
  workspaceRemoteFileStateKey,
} from "./remoteFileSnapshotBridge";

describe("WF-07 Files snapshot bridge", () => {
  it("序列化并冷启动后，同一配置的两个实例保留各自目录与跟随开关", async () => {
    const tabs = [
      { id: "roundtrip-a", connectionId: "shared-profile", ordinal: 0 },
      { id: "roundtrip-b", connectionId: "shared-profile", ordinal: 1 },
    ];
    const ids = tabs.map((tab) => tab.id);
    publishWorkspaceRemoteFileNavigation(workspaceRemoteFileStateKey(ids[0]), "/srv/a", true);
    publishWorkspaceRemoteFileNavigation(workspaceRemoteFileStateKey(ids[1]), "/srv/b", false);
    const snapshot = toSnapshot({
      activeItemId: `ssh:${ids[0]}`,
      files: {
        directories: workspaceRemoteFileDirectories(ids),
        followActivePane: true,
        followTerminalDirectories: workspaceRemoteFileFollowStates(ids),
      },
      order: ids.map((id) => `ssh:${id}`),
      sidebar: { collapsed: false, view: "files" },
      splitLayout: null,
    }, { terminalTabs: tabs, localTerminalTabs: [], rdpSessions: [], vncSessions: [] });
    const restored = decodeWorkspaceSnapshot(JSON.parse(JSON.stringify(snapshot)));

    vi.resetModules();
    const coldBridge = await import("./remoteFileSnapshotBridge");
    expect(coldBridge.workspaceRemoteFileFollowStates(ids)).toEqual({});
    coldBridge.seedWorkspaceRemoteFileDirectories(restored.files.directories, restored.files.followTerminalDirectories);
    expect(coldBridge.workspaceRemoteFileDirectories(ids)).toEqual({ "ssh:roundtrip-a": "/srv/a", "ssh:roundtrip-b": "/srv/b" });
    expect(coldBridge.workspaceRemoteFileFollowStates(ids)).toEqual({ "ssh:roundtrip-a": true, "ssh:roundtrip-b": false });
  });

  it("seeds restored directories and publishes later navigation by logical SSH instance", () => {
    seedWorkspaceRemoteFileDirectories({ "ssh:tab-a": "/srv/app" });
    expect(workspaceRemoteFileDirectories(["tab-a"])).toEqual({ "ssh:tab-a": "/srv/app" });

    publishWorkspaceRemoteFileNavigation(workspaceRemoteFileStateKey("tab-a"), "/srv/logs");
    expect(workspaceRemoteFileDirectories(["tab-a"])).toEqual({ "ssh:tab-a": "/srv/logs" });
  });
});
