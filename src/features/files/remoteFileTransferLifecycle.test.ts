import { describe, expect, it } from "vitest";

import {
  activeRemoteFileTransferIdsForConnections,
  rebindRemoteFileTransferItem,
} from "./remoteFileTransferStore";
import type { RemoteFileTransferItem } from "./remoteFileTransferTypes";

function transfer(
  overrides: Partial<RemoteFileTransferItem> = {},
): RemoteFileTransferItem {
  return {
    connectionId: "conn-a",
    createdAt: 1,
    direction: "upload",
    error: null,
    id: "transfer-a",
    kind: "file",
    localPath: null,
    name: "app.conf",
    progress: 0,
    progressDetail: null,
    progressIndeterminate: false,
    remotePath: "/etc/app.conf",
    retry: null,
    speedText: null,
    stage: "等待上传",
    startedAt: 1,
    status: "queued",
    ...overrides,
  };
}

describe("WF-03C remote transfer lifecycle", () => {
  it("selects only queued/running transfers owned by closing connections", () => {
    const items = [
      transfer({ id: "queued-a", status: "queued" }),
      transfer({ id: "running-a", status: "running" }),
      transfer({ id: "error-a", status: "error" }),
      transfer({ id: "running-b", connectionId: "conn-b", status: "running" }),
      transfer({ id: "unbound", connectionId: null, status: "running" }),
    ];
    expect(
      activeRemoteFileTransferIdsForConnections(items, new Set(["conn-a"])),
    ).toEqual(["queued-a", "running-a"]);
  });

  it("rebinds local upload ownership and retry connection after temporary save", () => {
    const item = transfer({
      connectionId: "temp:ctx-a",
      retry: {
        action: "local-file-upload",
        connectionId: "temp:ctx-a",
        conflictPolicy: "overwrite",
        localPath: "/tmp/app.conf",
        parentPath: "/etc",
      },
    });
    expect(
      rebindRemoteFileTransferItem(item, "temp:ctx-a", "saved-a"),
    ).toMatchObject({
      connectionId: "saved-a",
      retry: { connectionId: "saved-a" },
    });
  });

  it("rebinds download retry input without changing transfer identity", () => {
    const item = transfer({
      connectionId: "temp:ctx-a",
      direction: "download",
      retry: {
        action: "download",
        entry: { name: "app.log", path: "/var/log/app.log", type: "file" },
        input: {
          compress: false,
          conflictPolicy: "overwrite",
          connectionId: "temp:ctx-a",
          keepArchives: false,
          path: "/var/log/app.log",
        },
      },
    });
    const rebound = rebindRemoteFileTransferItem(item, "temp:ctx-a", "saved-a");
    expect(rebound.id).toBe(item.id);
    expect(rebound.connectionId).toBe("saved-a");
    expect(rebound.retry?.action).toBe("download");
    if (rebound.retry?.action === "download") {
      expect(rebound.retry.input.connectionId).toBe("saved-a");
    }
  });

  it("does not touch sibling connection transfers", () => {
    const item = transfer({ connectionId: "conn-b" });
    expect(rebindRemoteFileTransferItem(item, "conn-a", "saved-a")).toBe(item);
  });
});
