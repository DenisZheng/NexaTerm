import { describe, expect, it } from "vitest";
import type { ConnectionProfile } from "./connectionTypes";
import type { TerminalTab } from "../workspace/sessionTabs/types";
import { finalTemporaryContextRefs, rebindConnectionItems, rebindTemporaryTerminalTab } from "./quickConnectSession";

function tab(id: string, contextRef = "temp-ssh-1"): TerminalTab {
  return { connectionId: contextRef, id, ordinal: 0, requestId: `request-${id}`, sessionId: `session-${id}`, status: "已连接", temporaryContextRef: contextRef, title: "终端", type: "terminal", warmupOutput: [] };
}

describe("WF-02B temporary session save migration", () => {
  it("rebinds only the logical profile and preserves the live terminal session", () => {
    const before = tab("one");
    const after = rebindTemporaryTerminalTab(before, { id: "saved-1" } as ConnectionProfile);
    expect(after.connectionId).toBe("saved-1");
    expect(after.sessionId).toBe(before.sessionId);
    expect(after.requestId).toBe(before.requestId);
    expect(after.temporaryContextRef).toBe("temp-ssh-1");
  });
  it("moves connection-bound file state without changing item identity", () => {
    expect(rebindConnectionItems([{ connectionId: "temp-ssh-1", id: "file-1" }], "temp-ssh-1", "saved-1")).toStrictEqual([{ connectionId: "saved-1", id: "file-1" }]);
  });
  it("releases the temporary context only after its final owning tab closes", () => {
    const first = tab("one"); const second = tab("two");
    expect([...finalTemporaryContextRefs([first], [second])]).toEqual([]);
    expect([...finalTemporaryContextRefs([first, second], [])]).toEqual(["temp-ssh-1"]);
  });
});
