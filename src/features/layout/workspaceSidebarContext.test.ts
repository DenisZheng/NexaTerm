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

  it("does not expose the previous SSH context while Home is active", () => {
    expect(resolveWorkspaceSidebarFileContext({ ...base, showingHome: true })).toBeNull();
  });
});
