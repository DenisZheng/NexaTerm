import { describe, expect, it } from "vitest";

import {
  batchWorkspaceClosePlan,
  batchWorkspaceHandleState,
  batchWorkspaceItemId,
  collectBatchOpenConnectionIds,
  type BatchWorkspaceSnapshot,
} from "./batchConnectWorkspaceRuntime";

function snapshot(
  input: Partial<BatchWorkspaceSnapshot> = {},
): BatchWorkspaceSnapshot {
  return {
    localTerminalTabs: [],
    rdpSessions: [],
    terminalTabs: [],
    vncSessions: [],
    ...input,
  };
}

describe("batch connect workspace runtime", () => {
  it("counts only live or connecting remote profiles as already open", () => {
    const ids = collectBatchOpenConnectionIds(
      snapshot({
        localTerminalTabs: [
          {
            id: "telnet-ok",
            profileId: "telnet-profile",
            sessionId: "pty-1",
            source: "telnet",
            status: "已连接",
          },
          {
            error: "failed",
            id: "serial-failed",
            profileId: "serial-profile",
            source: "serial",
            status: "连接失败",
          },
          {
            id: "local-shell",
            profileId: "pwsh",
            sessionId: "pty-2",
            source: "local",
            status: "已连接",
          },
        ],
        rdpSessions: [
          { connectionId: "rdp-ok", id: "rdp-1", status: "external" },
          { connectionId: "rdp-failed", error: "no runner", id: "rdp-2", status: "error" },
        ],
        terminalTabs: [
          {
            connectionId: "ssh-prompt",
            connectionStep: { status: "prompt" },
            id: "ssh-1",
            type: "connecting",
          },
          {
            connectionId: "ssh-failed",
            connectionStep: { error: "auth", status: "error" },
            error: "auth",
            id: "ssh-2",
            type: "connecting",
          },
        ],
        vncSessions: [
          { connectionId: "vnc-launching", id: "vnc-1", status: "launching" },
        ],
      }),
    );

    expect([...ids].sort()).toEqual(
      ["rdp-ok", "ssh-prompt", "telnet-profile", "vnc-launching"].sort(),
    );
  });

  it("maps SSH prompt and host-key states to waiting-user", () => {
    const prompt = batchWorkspaceHandleState(
      { kind: "ssh", id: "ssh-1" },
      snapshot({
        terminalTabs: [
          {
            connectionId: "profile",
            connectionStep: { status: "prompt" },
            id: "ssh-1",
            type: "connecting",
          },
        ],
      }),
    );
    const hostKey = batchWorkspaceHandleState(
      { kind: "ssh", id: "ssh-2" },
      snapshot({
        terminalTabs: [
          {
            connectionId: "profile",
            connectionStep: { status: "waiting_host_key" },
            id: "ssh-2",
            type: "connecting",
          },
        ],
      }),
    );

    expect(prompt.status).toBe("waiting-user");
    expect(hostKey.status).toBe("waiting-user");
  });

  it("uses the concrete instance id for focus and cancellation", () => {
    expect(batchWorkspaceItemId({ kind: "character", id: "telnet-2" })).toBe(
      "local:telnet-2",
    );
    expect(batchWorkspaceItemId({ kind: "ssh", id: "ssh-3" })).toBe("ssh:ssh-3");

    expect(batchWorkspaceClosePlan({ kind: "ssh", id: "ssh-3" })).toMatchObject({
      connectionIds: [],
      localTabIds: [],
      rdpSessionIds: [],
      sshTabIds: ["ssh-3"],
      vncSessionIds: [],
    });
    expect(batchWorkspaceClosePlan({ kind: "rdp", id: "rdp-4" }).rdpSessionIds).toEqual([
      "rdp-4",
    ]);
  });

  it("reports concrete terminal and remote-session outcomes", () => {
    expect(
      batchWorkspaceHandleState(
        { kind: "ssh", id: "ssh-ok" },
        snapshot({
          terminalTabs: [
            {
              connectionId: "p",
              id: "ssh-ok",
              sessionId: "session",
              type: "terminal",
            },
          ],
        }),
      ).status,
    ).toBe("success");

    expect(
      batchWorkspaceHandleState(
        { kind: "rdp", id: "rdp-bad" },
        snapshot({
          rdpSessions: [
            {
              connectionId: "p",
              error: "runner failed",
              id: "rdp-bad",
              status: "error",
            },
          ],
        }),
      ),
    ).toEqual({ error: "runner failed", status: "failed" });
  });
});
