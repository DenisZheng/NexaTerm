import { describe, expect, it, vi } from "vitest";
import { createWorkspaceActionHandlers, type WorkspaceActionOperations } from "./workspaceActionHandlers";

function setup() {
  const operation = () => vi.fn();
  const operations: WorkspaceActionOperations = {
    quickOpen: operation(), openSettings: operation(), toggleSidebar: operation(), toggleTools: operation(),
    toggleCommandSender: operation(), toggleMultiExec: operation(), openTunnels: operation(), closeItem: operation(), closeInstance: operation(),
    closePane: operation(), closeSplitGroup: operation(), newTerminal: operation(), toggleSearch: operation(),
    searchNext: operation(), searchPrevious: operation(), splitRight: operation(), splitDown: operation(), splitFour: operation(),
  };
  return { operations, handlers: createWorkspaceActionHandlers(operations) };
}

describe("WF-01 4D-1 workspace action business adapter", () => {
  it("maps application actions to injected operations without leaking presentation targets", () => {
    const { handlers, operations } = setup();
    const target = { kind: "application" as const };
    handlers["connection.quickOpen"](target);
    handlers["settings.open"](target);
    handlers["view.toggleSidebar"](target);
    handlers["view.toggleTools"](target);
    handlers["commandSender.toggle"](target);
    handlers["terminal.multiExec"](target);
    handlers["tools.tunnels"](target);
    expect(operations.quickOpen).toHaveBeenCalledWith();
    expect(operations.openSettings).toHaveBeenCalledWith();
    expect(operations.toggleSidebar).toHaveBeenCalledWith();
    expect(operations.toggleTools).toHaveBeenCalledWith();
    expect(operations.toggleCommandSender).toHaveBeenCalledWith();
    expect(operations.toggleMultiExec).toHaveBeenCalledExactlyOnceWith();
    expect(operations.openTunnels).toHaveBeenCalledWith();
  });

  it("routes item, pane, and split-group close targets without changing identity", () => {
    const { handlers, operations } = setup();
    const item = { kind: "item" as const, itemId: "ssh:tab-a" };
    const pane = { kind: "pane" as const, itemId: "split", paneId: "pane-a", instanceId: "ssh:tab-a" };
    const group = { kind: "split-group" as const, itemId: "split" };
    handlers["workspace.closeItem"](item);
    handlers["terminal.closePane"](pane);
    handlers["terminal.closeSplitGroup"](group);
    expect(operations.closeItem).toHaveBeenCalledWith(item);
    expect(operations.closePane).toHaveBeenCalledWith(pane);
    expect(operations.closeSplitGroup).toHaveBeenCalledWith(group);
  });

  it("passes logical identity plus the raw instance id to instance operations", () => {
    const { handlers, operations } = setup();
    const target = { kind: "instance" as const, instanceId: "ssh:tab:with:colons", instanceKind: "ssh" as const };
    for (const id of ["terminal.closeTab", "terminal.newTab", "terminal.search.toggle", "terminal.search.next",
      "terminal.search.previous", "terminal.splitRight", "terminal.splitDown", "terminal.splitFour"]) {
      handlers[id](target);
    }
    for (const operation of [operations.closeInstance, operations.newTerminal, operations.toggleSearch,
      operations.searchNext, operations.searchPrevious, operations.splitRight, operations.splitDown, operations.splitFour]) {
      expect(operation).toHaveBeenCalledWith(target, "tab:with:colons");
    }
  });

  it("fails closed for wrong application/instance kinds and non-terminal instances", () => {
    const { handlers, operations } = setup();
    handlers["terminal.closeTab"]({ kind: "application" });
    handlers["settings.open"]({ kind: "instance", instanceId: "local:tab-a", instanceKind: "local" });
    handlers["terminal.splitRight"]({ kind: "instance", instanceId: "rdp:session-a", instanceKind: "rdp" });
    expect(operations.closeInstance).not.toHaveBeenCalled();
    expect(operations.openSettings).not.toHaveBeenCalled();
    expect(operations.splitRight).not.toHaveBeenCalled();
  });

  it("registers the implemented workspace actions", () => {
    const { handlers } = setup();
    expect(handlers["terminal.multiExec"]).toBeTypeOf("function");
    expect(handlers["tools.tunnels"]).toBeTypeOf("function");
    expect(handlers["terminal.closePane"]).toBeTypeOf("function");
    expect(handlers["terminal.closeSplitGroup"]).toBeTypeOf("function");
  });
});
