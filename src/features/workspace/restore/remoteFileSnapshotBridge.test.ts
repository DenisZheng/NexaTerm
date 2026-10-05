import { describe, expect, it } from "vitest";
import {
  publishWorkspaceRemoteFileNavigation,
  seedWorkspaceRemoteFileDirectories,
  workspaceRemoteFileDirectories,
  workspaceRemoteFileStateKey,
} from "./remoteFileSnapshotBridge";

describe("WF-07 Files snapshot bridge", () => {
  it("seeds restored directories and publishes later navigation by logical SSH instance", () => {
    seedWorkspaceRemoteFileDirectories({ "ssh:tab-a": "/srv/app" });
    expect(workspaceRemoteFileDirectories(["tab-a"])).toEqual({ "ssh:tab-a": "/srv/app" });

    publishWorkspaceRemoteFileNavigation(workspaceRemoteFileStateKey("tab-a"), "/srv/logs");
    expect(workspaceRemoteFileDirectories(["tab-a"])).toEqual({ "ssh:tab-a": "/srv/logs" });
  });
});
