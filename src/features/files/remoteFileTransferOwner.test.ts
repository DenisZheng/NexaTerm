import { describe, expect, it } from "vitest";
import { captureRemoteFileTransferOwner, createRemoteFileTransferTargets, remoteFileTransferOwnerIsOpen } from "./remoteFileTransferOwner";
import type { ConnectionProfile } from "../connections/connectionTypes";

describe("WF-09-01 transfer owner", () => {
  const tabs = [{ id: "a", connectionId: "same" }, { id: "b", connectionId: "same" }];
  it("captures the pane identity independently of later focus", () => {
    const context = { tabId: "a", connectionId: "same" };
    const owner = captureRemoteFileTransferOwner(context);
    context.tabId = "b";
    expect(owner).toEqual({ ownerInstanceId: "ssh:a", connectionId: "same" });
    expect(captureRemoteFileTransferOwner(null)).toBeNull();
  });
  it("rejects a closed owner even when a sibling uses the same profile", () => {
    expect(remoteFileTransferOwnerIsOpen("ssh:a", "same", tabs)).toBe(true);
    expect(remoteFileTransferOwnerIsOpen("ssh:a", "same", tabs.slice(1))).toBe(false);
    expect(remoteFileTransferOwnerIsOpen("ssh:a", "other", tabs)).toBe(false);
    expect(remoteFileTransferOwnerIsOpen(null, "same", tabs.slice(1))).toBe(true);
    expect(remoteFileTransferOwnerIsOpen(null, "same", [])).toBe(false);
  });
  it("reads the current source after focus, close, and temporary-save changes", () => {
    let context = { fileContext: { tabId: "a", connectionId: "same" }, tabs: [...tabs],
      connections: new Map<string, ConnectionProfile>() };
    const transfer = () => ({ connectionId: "same", ownerInstanceId: "ssh:a" });
    const target = createRemoteFileTransferTargets(() => context, transfer);
    const captured = target.captureTransferOptions();
    context.fileContext = { tabId: "b", connectionId: "same" };
    expect(captured.ownerInstanceId).toBe("ssh:a");
    expect(target.transferOwnerForRun({ transferId: "original" }, "same")).toBe("ssh:a");
    context = { ...context, tabs: tabs.slice(1) };
    expect(target.canStartOwnedTransfer("ssh:a", "same")).toBe(false);
    context = { ...context, tabs: [{ id: "a", connectionId: "saved" }] };
    expect(target.canStartOwnedTransfer("ssh:a", "saved")).toBe(true);
    expect(target.canStartOwnedTransfer("ssh:a", "same")).toBe(false);
  });
});
