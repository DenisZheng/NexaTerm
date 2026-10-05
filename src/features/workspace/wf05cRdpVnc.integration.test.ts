import { describe, expect, it } from "vitest";

import { buildMultiExecTargets } from "./multiExec/targets";
import {
  initialSessionPointerState,
  sessionPointerReducer,
  type SessionPointerState,
} from "./sessionTabs/reducer";
import {
  selectWorkspaceItems,
  type InstanceCollections,
} from "./sessionTabs/instances";

const remote = (id: string, connectionId: string) => ({ id, connectionId });

function collections(): InstanceCollections {
  return {
    localTerminalTabs: [
      {
        id: "local-1",
        ordinal: 0,
        profileId: "pwsh",
        source: "local",
      },
    ],
    rdpSessions: [remote("rdp-a-1", "rdp-a"), remote("rdp-a-2", "rdp-a")],
    terminalTabs: [
      {
        connectionId: "ssh-a",
        id: "ssh-a-1",
        ordinal: 0,
      },
    ],
    vncSessions: [remote("vnc-a-1", "vnc-a"), remote("vnc-a-2", "vnc-a")],
  };
}

describe("WF-05C RDP/VNC workspace instance contract", () => {
  it("projects same-profile RDP/VNC siblings as distinct top-level workspace instances", () => {
    const items = selectWorkspaceItems(collections(), [], null);

    expect(items.filter((item) => item.kind === "rdp").map((item) => item.id)).toEqual([
      "rdp:rdp-a-1",
      "rdp:rdp-a-2",
    ]);
    expect(items.filter((item) => item.kind === "vnc").map((item) => item.id)).toEqual([
      "vnc:vnc-a-1",
      "vnc:vnc-a-2",
    ]);
  });

  it("closing an active RDP sibling reselects only the surviving RDP instance", () => {
    const state: SessionPointerState = {
      ...initialSessionPointerState,
      activeConnectionId: "rdp-a",
      activeRdpSessionId: "rdp-a-1",
      homeActive: false,
      mode: "rdp",
      order: ["rdp:rdp-a-1", "rdp:rdp-a-2", "vnc:vnc-a-1"],
    };
    const next = sessionPointerReducer(state, {
      type: "tabs/removeRdp",
      closingIds: ["rdp-a-1"],
      snapshot: {
        localTerminalTabs: [],
        rdpSessions: [remote("rdp-a-2", "rdp-a")],
        remoteFileTabs: [],
        terminalTabs: [],
        vncSessions: [remote("vnc-a-1", "vnc-a")],
      },
    });

    expect(next).toMatchObject({
      activeConnectionId: "rdp-a",
      activeRdpSessionId: "rdp-a-2",
      mode: "rdp",
      homeActive: false,
    });
    expect(next.order).toEqual(["rdp:rdp-a-2", "vnc:vnc-a-1"]);
  });

  it("closing an active VNC sibling reselects only the surviving VNC instance", () => {
    const state: SessionPointerState = {
      ...initialSessionPointerState,
      activeConnectionId: "vnc-a",
      activeVncSessionId: "vnc-a-1",
      homeActive: false,
      mode: "vnc",
      order: ["vnc:vnc-a-1", "vnc:vnc-a-2", "rdp:rdp-a-1"],
    };
    const next = sessionPointerReducer(state, {
      type: "tabs/removeVnc",
      closingIds: ["vnc-a-1"],
      snapshot: {
        localTerminalTabs: [],
        rdpSessions: [remote("rdp-a-1", "rdp-a")],
        remoteFileTabs: [],
        terminalTabs: [],
        vncSessions: [remote("vnc-a-2", "vnc-a")],
      },
    });

    expect(next).toMatchObject({
      activeConnectionId: "vnc-a",
      activeVncSessionId: "vnc-a-2",
      mode: "vnc",
      homeActive: false,
    });
    expect(next.order).toEqual(["vnc:vnc-a-2", "rdp:rdp-a-1"]);
  });

  it("keeps RDP/VNC outside terminal MultiExec even while they are top-level workspace items", () => {
    const items = selectWorkspaceItems(collections(), [], null);
    expect(items.some((item) => item.kind === "rdp")).toBe(true);
    expect(items.some((item) => item.kind === "vnc")).toBe(true);

    const targets = buildMultiExecTargets({
      sshTabs: [
        {
          connectionId: "ssh-a",
          id: "ssh-a-1",
          sessionId: "ssh-runtime-1",
          title: "SSH A",
          type: "terminal",
        },
      ],
      localTabs: [
        {
          id: "local-1",
          profileId: "pwsh",
          sessionId: "local-runtime-1",
          source: "local",
          title: "PowerShell",
        },
      ],
    });

    expect(targets.map((target) => target.key)).toEqual(["ssh:ssh-a-1", "local:local-1"]);
    expect(targets.every((target) => target.kind !== ("rdp" as never))).toBe(true);
    expect(targets.every((target) => target.kind !== ("vnc" as never))).toBe(true);
  });
});
