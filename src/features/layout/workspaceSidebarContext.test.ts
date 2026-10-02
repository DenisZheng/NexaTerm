import { describe, expect, it } from "vitest";

import { resolveWorkspaceSidebarFileContext } from "./workspaceSidebarContext";

const terminalTabs = [
  { id: "ssh-a", connectionId: "conn-a" },
  { id: "ssh-b", connectionId: "conn-b" },
];

const base = {
  activeTabId: "ssh-a",
  activeWorkspaceMode: "ssh" as const,
  focusedBinding: null,
  showingHome: false,
  splitActive: false,
  terminalDirectories: { "ssh-a": "/etc", "ssh-b": "/var/log" },
  terminalTabs,
};

describe("WF-03 Files context binding", () => {
  it("binds the active SSH terminal outside split mode", () => {
    expect(resolveWorkspaceSidebarFileContext(base)).toStrictEqual({
      connectionId: "conn-a",
      path: "/etc",
      tabId: "ssh-a",
    });
  });

  it("binds the focused SSH pane in split mode", () => {
    expect(resolveWorkspaceSidebarFileContext({
      ...base,
      splitActive: true,
      focusedBinding: { kind: "ssh", tabId: "ssh-b" },
    })).toStrictEqual({
      connectionId: "conn-b",
      path: "/var/log",
      tabId: "ssh-b",
    });
  });

  it("keeps two panes of the same saved connection isolated by terminal tab", () => {
    expect(resolveWorkspaceSidebarFileContext({
      ...base,
      activeTabId: "ssh-a",
      splitActive: true,
      focusedBinding: { kind: "ssh", tabId: "ssh-b" },
      terminalTabs: [
        { id: "ssh-a", connectionId: "conn-shared" },
        { id: "ssh-b", connectionId: "conn-shared" },
      ],
    })).toStrictEqual({
      connectionId: "conn-shared",
      path: "/var/log",
      tabId: "ssh-b",
    });
  });

  it("does not borrow a sibling SSH context for a local, empty, or stale focused pane", () => {
    expect(resolveWorkspaceSidebarFileContext({
      ...base,
      splitActive: true,
      focusedBinding: { kind: "local", tabId: "local-a" },
    })).toBeNull();
    expect(resolveWorkspaceSidebarFileContext({
      ...base,
      splitActive: true,
      focusedBinding: null,
    })).toBeNull();
    expect(resolveWorkspaceSidebarFileContext({
      ...base,
      splitActive: true,
      focusedBinding: { kind: "ssh", tabId: "missing" },
    })).toBeNull();
  });

  it("keeps a disconnected pane owner instead of borrowing a sibling directory", () => {
    expect(resolveWorkspaceSidebarFileContext({
      ...base,
      splitActive: true,
      focusedBinding: { kind: "ssh", tabId: "ssh-a" },
      terminalDirectories: { "ssh-b": "/var/log" },
      terminalTabs: [
        { id: "ssh-a", connectionId: "conn-shared" },
        { id: "ssh-b", connectionId: "conn-shared" },
      ],
    })).toStrictEqual({
      connectionId: "conn-shared",
      path: null,
      tabId: "ssh-a",
    });
  });

  it("keeps reconnect cwd updates on the original logical pane", () => {
    const reconnect = {
      ...base,
      splitActive: true,
      focusedBinding: { kind: "ssh" as const, tabId: "ssh-a" },
      terminalTabs: [
        { id: "ssh-a", connectionId: "conn-shared" },
        { id: "ssh-b", connectionId: "conn-shared" },
      ],
    };
    expect(resolveWorkspaceSidebarFileContext({
      ...reconnect,
      terminalDirectories: { "ssh-a": "/srv/app", "ssh-b": "/var/log" },
    })).toMatchObject({ tabId: "ssh-a", path: "/srv/app" });
    expect(resolveWorkspaceSidebarFileContext({
      ...reconnect,
      terminalDirectories: { "ssh-a": "/srv/app-next", "ssh-b": "/var/log" },
    })).toMatchObject({ tabId: "ssh-a", path: "/srv/app-next" });
  });

  it("does not expose the previous SSH context while Home is active", () => {
    expect(resolveWorkspaceSidebarFileContext({ ...base, showingHome: true })).toBeNull();
  });
});
