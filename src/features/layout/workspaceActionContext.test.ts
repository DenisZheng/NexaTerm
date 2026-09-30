import { describe, expect, it } from "vitest";
import { buildWorkspaceActionContext } from "./workspaceActionContext";

const base = {
  workspaceVisible: true,
  activeItemId: "split",
  activePaneId: "pane-b",
  workspaceItems: [
    { id: "home", kind: "home" as const },
    { id: "split", kind: "split" as const, memberIds: ["ssh:ssh-1", "local:local-1"] },
    { id: "rdp:rdp-1", kind: "rdp" as const },
  ],
  terminalTabs: [{ id: "ssh-1" }],
  localTerminalTabs: [{ id: "local-1" }],
  rdpSessions: [{ id: "rdp-1" }],
  vncSessions: [{ id: "vnc-1" }],
  splitPanes: [
    { id: "pane-a", binding: { kind: "ssh" as const, tabId: "ssh-1" } },
    { id: "pane-b", binding: null },
    { id: "pane-c", binding: { kind: "local" as const, tabId: "local-1" } },
  ],
  terminalSearchByTabId: { "ssh-1": { query: "needle" }, "local-1": { query: "" } },
  commandSenderTargetCount: 2,
  canSplitTerminal: false,
  canOpenTunnels: true,
};

describe("WF-01 4D-1 workspace action context bridge", () => {
  it("keeps split members in instances even though they are folded out of top-level items", () => {
    const context = buildWorkspaceActionContext(base);
    expect(context.items).toStrictEqual(base.workspaceItems);
    expect(context.instances.map(({ id }) => id)).toStrictEqual([
      "ssh:ssh-1", "local:local-1", "rdp:rdp-1", "vnc:vnc-1",
    ]);
  });

  it("preserves empty panes instead of falling back to a sibling instance", () => {
    const context = buildWorkspaceActionContext(base);
    expect(context.activePaneId).toBe("pane-b");
    expect(context.panes.find(({ id }) => id === "pane-b")?.instanceId).toBe(null);
  });

  it("projects terminal capabilities and the current search query", () => {
    const context = buildWorkspaceActionContext(base);
    expect(context.instances[0]).toStrictEqual({
      id: "ssh:ssh-1", kind: "ssh", canCreateTerminal: true,
      canSearch: true, canSplit: false, searchQuery: "needle",
    });
    expect(context.instances[1]).toStrictEqual({
      id: "local:local-1", kind: "local", canCreateTerminal: true,
      canSearch: true, canSplit: false, searchQuery: "",
    });
  });

  it("does not grant terminal capabilities to RDP or VNC", () => {
    const context = buildWorkspaceActionContext({ ...base, canSplitTerminal: true });
    expect(context.instances[2]).toStrictEqual({ id: "rdp:rdp-1", kind: "rdp" });
    expect(context.instances[3]).toStrictEqual({ id: "vnc:vnc-1", kind: "vnc" });
  });

  it("passes workspace visibility and command-target count without deriving new state", () => {
    const context = buildWorkspaceActionContext({ ...base, workspaceVisible: false, commandSenderTargetCount: 0 });
    expect(context.workspaceVisible).toBe(false);
    expect(context.commandSenderTargetCount).toBe(0);
    expect(context.canOpenTunnels).toBe(true);
  });

  it("projects tunnel capability as a transient workspace flag", () => {
    expect(buildWorkspaceActionContext({ ...base, canOpenTunnels: false }).canOpenTunnels).toBe(false);
    expect(buildWorkspaceActionContext({ ...base, canOpenTunnels: true }).canOpenTunnels).toBe(true);
  });

  it("does not mutate frozen source collections", () => {
    const input = Object.freeze({
      ...base,
      workspaceItems: Object.freeze([...base.workspaceItems]),
      terminalTabs: Object.freeze([...base.terminalTabs]),
      splitPanes: Object.freeze([...base.splitPanes]),
    });
    expect(() => buildWorkspaceActionContext(input)).not.toThrow();
  });
});
