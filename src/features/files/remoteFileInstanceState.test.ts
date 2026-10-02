import { describe, expect, it } from "vitest";

import {
  canApplyRemoteFileDirectoryResponse,
  currentRemoteFileFollowPolicy,
  followStateAfterManualBrowse,
  remoteFileInstanceOwnerKey,
  shouldResetRemoteFileNavigation,
  type RemoteFileDirectoryRequestState,
  type RemoteFileDirectoryRequestToken,
} from "./remoteFileInstanceState";

describe("WF-03B remote Files instance state", () => {
  it("uses the logical terminal stateKey as owner across temporary to saved rebind", () => {
    expect(remoteFileInstanceOwnerKey("ssh-file-panel:tab-a", "temp:ctx-a")).toBe("ssh-file-panel:tab-a");
    expect(remoteFileInstanceOwnerKey("ssh-file-panel:tab-a", "saved-a")).toBe("ssh-file-panel:tab-a");
    expect(shouldResetRemoteFileNavigation("ssh-file-panel:tab-a", "ssh-file-panel:tab-a")).toBe(false);
  });

  it("resets navigation only when the logical Files owner changes", () => {
    expect(shouldResetRemoteFileNavigation("ssh-file-panel:tab-a", "ssh-file-panel:tab-b")).toBe(true);
    expect(shouldResetRemoteFileNavigation("conn-a", "conn-b")).toBe(true);
  });

  it("keeps WS-F03 policy reversible instead of baking manual pause into the state model", () => {
    expect(currentRemoteFileFollowPolicy.defaultEnabled).toBe(false);
    expect(followStateAfterManualBrowse(true, currentRemoteFileFollowPolicy)).toBe(true);
    expect(
      followStateAfterManualBrowse(true, {
        defaultEnabled: true,
        manualBrowseBehavior: "pause",
      }),
    ).toBe(false);
  });

  it("rejects pane A's delayed response after the Files owner has switched to pane B", () => {
    const requestA: RemoteFileDirectoryRequestToken = {
      connectionId: "conn-shared",
      ownerKey: "ssh-file-panel:pane-a",
      requestId: 7,
      scope: 3,
    };
    const currentB: RemoteFileDirectoryRequestState = {
      connectionId: "conn-shared",
      mounted: true,
      ownerKey: "ssh-file-panel:pane-b",
      requestId: 2,
      scope: 1,
    };
    expect(canApplyRemoteFileDirectoryResponse(requestA, currentB, false)).toBe(false);
    expect(canApplyRemoteFileDirectoryResponse(requestA, { ...currentB, mounted: false }, false)).toBe(false);
  });

  it("invalidates old requests when a temporary connection is rebound without changing owner", () => {
    const oldTemporaryRequest: RemoteFileDirectoryRequestToken = {
      connectionId: "temp:ctx-a",
      ownerKey: "ssh-file-panel:tab-a",
      requestId: 4,
      scope: 8,
    };
    const savedState: RemoteFileDirectoryRequestState = {
      connectionId: "saved-a",
      mounted: true,
      ownerKey: "ssh-file-panel:tab-a",
      requestId: 5,
      scope: 9,
    };
    expect(canApplyRemoteFileDirectoryResponse(oldTemporaryRequest, savedState, false)).toBe(false);
  });

  it("allows same-owner cached tree responses but reserves loading/error state for the latest request", () => {
    const request: RemoteFileDirectoryRequestToken = {
      connectionId: "conn-a",
      ownerKey: "ssh-file-panel:tab-a",
      requestId: 10,
      scope: 4,
    };
    const current: RemoteFileDirectoryRequestState = {
      connectionId: "conn-a",
      mounted: true,
      ownerKey: "ssh-file-panel:tab-a",
      requestId: 11,
      scope: 4,
    };
    expect(canApplyRemoteFileDirectoryResponse(request, current, false)).toBe(true);
    expect(canApplyRemoteFileDirectoryResponse(request, current, true)).toBe(false);
  });
});
