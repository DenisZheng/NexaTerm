// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceTerminalSearch } from "./useWorkspaceTerminalSearch";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const tabs = [{ id: "ssh-a" }, { id: "ssh-b" }];
const local = [{ id: "local-a" }];

describe("workspace terminal search owner", () => {
  it("keeps exact queries and modes independent across SSH and Local instances", () => {
    const { result } = renderHook(() => useWorkspaceTerminalSearch(tabs, local));
    act(() => {
      result.current.updateTerminalSearchQuery("ssh-a", "  needle  ");
      result.current.toggleTerminalSearchCaseSensitive("ssh-a");
      result.current.toggleTerminalSearchWholeWord("ssh-a");
      result.current.updateTerminalSearchQuery("local-a", "other");
    });
    expect(result.current.terminalSearchByTabId["ssh-a"]).toEqual({ open: true, query: "  needle  ", caseSensitive: true, wholeWord: true });
    expect(result.current.terminalSearchByTabId["local-a"]).toEqual({ open: true, query: "other", caseSensitive: false, wholeWord: false });
    expect(result.current.terminalSearchByTabId["ssh-b"]).toBeUndefined();
    act(() => result.current.closeTerminalSearch("ssh-a"));
    expect(result.current.terminalSearchByTabId["local-a"].open).toBe(true);
    act(() => result.current.toggleTerminalSearch("ssh-a"));
    expect(result.current.terminalSearchByTabId["ssh-a"].wholeWord).toBe(true);
  });

  it("assigns unique request IDs to repeated navigation in the same millisecond", () => {
    vi.spyOn(Date, "now").mockReturnValue(1);
    const { result } = renderHook(() => useWorkspaceTerminalSearch(tabs, local));
    act(() => result.current.requestTerminalSearchNavigation("next", "ssh-a"));
    const first = result.current.terminalSearchNavigationRequest;
    act(() => result.current.requestTerminalSearchNavigation("previous", "ssh-a"));
    expect(result.current.terminalSearchNavigationRequest).toEqual({ id: (first?.id || 0) + 1, direction: "previous", tabId: "ssh-a" });
  });

  it("prunes closed tabs and rejects late callbacks without resurrecting their state", () => {
    const { result, rerender } = renderHook(({ ssh }) => useWorkspaceTerminalSearch(ssh, local), { initialProps: { ssh: tabs } });
    act(() => {
      result.current.updateTerminalSearchQuery("ssh-a", "private fixture query");
      result.current.requestTerminalSearchNavigation("next", "ssh-a");
      result.current.updateTerminalSearchQuery("local-a", "keep");
    });
    const late = result.current;
    rerender({ ssh: [{ id: "ssh-b" }] });
    act(() => {
      late.updateTerminalSearchQuery("ssh-a", "late");
      late.toggleTerminalSearchWholeWord("ssh-a");
      late.requestTerminalSearchNavigation("next", "ssh-a");
    });
    expect(result.current.terminalSearchByTabId["ssh-a"]).toBeUndefined();
    expect(result.current.terminalSearchNavigationRequest).toBeNull();
    expect(result.current.terminalSearchByTabId["local-a"].query).toBe("keep");
  });

  it("ignores null or unsupported instance actions", () => {
    const { result } = renderHook(() => useWorkspaceTerminalSearch(tabs, local));
    act(() => { result.current.toggleTerminalSearch(null); result.current.toggleTerminalSearch("rdp-a"); });
    expect(result.current.terminalSearchByTabId).toEqual({});
  });

  it("consumes completed requests once and preserves a newer request during a late acknowledgement", () => {
    const { result } = renderHook(() => useWorkspaceTerminalSearch(tabs, local));
    act(() => result.current.requestTerminalSearchNavigation("next", "ssh-a"));
    const old = result.current.terminalSearchNavigationRequest!;
    act(() => result.current.requestTerminalSearchNavigation("previous", "ssh-b"));
    const current = result.current.terminalSearchNavigationRequest!;
    act(() => result.current.acknowledgeTerminalSearchNavigation(old));
    expect(result.current.terminalSearchNavigationRequest).toEqual(current);
    act(() => result.current.acknowledgeTerminalSearchNavigation(current));
    expect(result.current.terminalSearchNavigationRequest).toBeNull();
  });
});
