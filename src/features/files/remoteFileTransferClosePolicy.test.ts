import { describe, expect, it } from "vitest";

import {
  currentRemoteFileTransferClosePolicy,
  planRemoteFileTransferClose,
} from "./remoteFileTransferClosePolicy";
import type { RemoteFileTransferItem } from "./remoteFileTransferTypes";

const item = (
  id: string,
  connectionId: string,
  status: RemoteFileTransferItem["status"],
): RemoteFileTransferItem => ({
  connectionId,
  createdAt: 1,
  direction: "upload",
  error: null,
  id,
  kind: "file",
  localPath: null,
  name: id,
  progress: 0,
  progressDetail: null,
  progressIndeterminate: false,
  remotePath: "/tmp/" + id,
  retry: null,
  speedText: null,
  stage: "传输中",
  startedAt: 1,
  status,
});

describe("WF-03C active transfer close policy", () => {
  const transfers = [
    item("a-running", "conn-a", "running"),
    item("a-queued", "conn-a", "queued"),
    item("a-done", "conn-a", "success"),
    item("b-running", "conn-b", "running"),
  ];

  it("preserves the current keep-running behavior while WS-F09 is pending", () => {
    expect(currentRemoteFileTransferClosePolicy.behavior).toBe("keep-running");
    expect(
      planRemoteFileTransferClose(transfers, new Set(["conn-a"])),
    ).toEqual({
      activeTransferIds: ["a-running", "a-queued"],
      cancelTransferIds: [],
      requiresConfirmation: false,
    });
  });

  it("can switch to confirm-and-cancel without changing ownership logic", () => {
    expect(
      planRemoteFileTransferClose(transfers, new Set(["conn-a"]), {
        behavior: "confirm-cancel-active",
      }),
    ).toEqual({
      activeTransferIds: ["a-running", "a-queued"],
      cancelTransferIds: ["a-running", "a-queued"],
      requiresConfirmation: true,
    });
  });

  it("does not involve sibling connection transfers", () => {
    expect(
      planRemoteFileTransferClose(transfers, new Set(["conn-b"])),
    ).toMatchObject({
      activeTransferIds: ["b-running"],
    });
  });
});
