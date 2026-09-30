// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceActionContextInput } from "./workspaceActionContext";
import type { WorkspaceActionOperations } from "./workspaceActionHandlers";
import { useWorkspaceActionRuntime } from "./useWorkspaceActionRuntime";

const context = (workspaceVisible = true): WorkspaceActionContextInput => ({
  workspaceVisible,
  activeItemId: "ssh:tab-a",
  activePaneId: null,
  workspaceItems: [{ id: "home", kind: "home" }, { id: "ssh:tab-a", kind: "ssh" }],
  terminalTabs: [{ id: "tab-a" }],
  localTerminalTabs: [], rdpSessions: [], vncSessions: [], splitPanes: [],
  terminalSearchByTabId: { "tab-a": { query: "needle" } },
  commandSenderTargetCount: 1,
  canSplitTerminal: true,
});
const operations = (): WorkspaceActionOperations => ({
  quickOpen: vi.fn(), openSettings: vi.fn(), toggleSidebar: vi.fn(), toggleTools: vi.fn(),
  toggleCommandSender: vi.fn(), closeInstance: vi.fn(), newTerminal: vi.fn(), toggleSearch: vi.fn(),
  searchNext: vi.fn(), searchPrevious: vi.fn(), splitRight: vi.fn(), splitDown: vi.fn(), splitFour: vi.fn(),
});

describe("WF-01 4D-1 stable workspace action runtime", () => {
  it("keeps one executor while resolve reads the latest shell-derived snapshot", () => {
    const ops = operations();
    const { result, rerender } = renderHook(
      ({ visible }) => useWorkspaceActionRuntime(context(visible), {}, ops),
      { initialProps: { visible: true } },
    );
    const first = result.current;
    expect(first.resolve({ actionId: "terminal.closeTab", source: "menu" }).enabled).toBe(true);
    rerender({ visible: false });
    expect(result.current).toBe(first);
    expect(first.resolve({ actionId: "terminal.closeTab", source: "menu" }).reason).toBe("workspace-inactive");
  });

  it("runs the newest injected operation without rebuilding the executor", async () => {
    const firstOps = operations();
    const secondOps = operations();
    const { result, rerender } = renderHook(
      ({ ops }) => useWorkspaceActionRuntime(context(true), {}, ops),
      { initialProps: { ops: firstOps } },
    );
    const executor = result.current;
    rerender({ ops: secondOps });
    await executor.run({ actionId: "terminal.closeTab", source: "menu" });
    expect(firstOps.closeInstance).not.toHaveBeenCalled();
    expect(secondOps.closeInstance).toHaveBeenCalledWith(
      { kind: "instance", instanceId: "ssh:tab-a", instanceKind: "ssh" }, "tab-a",
    );
  });
});
