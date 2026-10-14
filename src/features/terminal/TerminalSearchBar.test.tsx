// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocalePreference } from "../../shared/i18n";
import { TerminalSearchBar } from "./TerminalSearchBar";
import { TERMINAL_SEARCH_QUERY_LIMIT } from "./terminalSearchController";

beforeEach(() => {
  setLocalePreference("en");
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const props = () => ({ query: "needle", caseSensitive: false, wholeWord: false, result: { kind: "idle" as const },
  onQueryChange: vi.fn(), onCaseToggle: vi.fn(), onWholeWordToggle: vi.fn(), onNavigate: vi.fn(), onClose: vi.fn() });

describe("terminal search bar", () => {
  it("preserves input and exposes independent accessible matching toggles", () => {
    const p = props();
    const { rerender } = render(<TerminalSearchBar {...p} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  literal.*  " } });
    expect(p.onQueryChange).toHaveBeenCalledWith("  literal.*  ");
    fireEvent.click(screen.getByRole("button", { name: "Toggle whole-word matching" }));
    expect(p.onWholeWordToggle).toHaveBeenCalledTimes(1);
    expect(p.onCaseToggle).not.toHaveBeenCalled();
    rerender(<TerminalSearchBar {...p} wholeWord caseSensitive />);
    expect(screen.getByRole("button", { name: "Toggle whole-word matching" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Toggle case matching" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("uses Enter/Shift+Enter and buttons for the same navigation, including whitespace queries", () => {
    const p = props();
    render(<TerminalSearchBar {...p} query="  " />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", shiftKey: true });
    fireEvent.click(screen.getByRole("button", { name: "Find next" }));
    fireEvent.click(screen.getByRole("button", { name: "Find previous" }));
    expect(p.onNavigate.mock.calls).toEqual([["next"], ["previous"], ["next"], ["previous"]]);
  });

  it("does not navigate or close while composing text", () => {
    const p = props(); render(<TerminalSearchBar {...p} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", isComposing: true });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", keyCode: 229 });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape", isComposing: true });
    expect(p.onNavigate).not.toHaveBeenCalled(); expect(p.onClose).not.toHaveBeenCalled();
  });

  it("closes with Escape from a search control and cancels queued focus on unmount", () => {
    vi.useFakeTimers(); const p = props();
    const { unmount } = render(<TerminalSearchBar {...p} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Toggle case matching" }), { key: "Escape" });
    expect(p.onClose).toHaveBeenCalledTimes(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("disables empty and overlong queries without modifying their value", () => {
    const p = props(); const { rerender } = render(<TerminalSearchBar {...p} query="" />);
    expect((screen.getByRole("button", { name: "Find next" }) as HTMLButtonElement).disabled).toBe(true);
    const query = "x".repeat(TERMINAL_SEARCH_QUERY_LIMIT + 1);
    rerender(<TerminalSearchBar {...p} query={query} result={{ kind: "too-long" }} />);
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(query);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(p.onNavigate).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("1024");
  });

  it("announces a lower-bound cap and updates translated status on locale changes", () => {
    const p = props(); const { rerender } = render(<TerminalSearchBar {...p} result={{ kind: "limit" }} />);
    expect(screen.getByRole("status").textContent).toBe("At least 1000 matches");
    act(() => setLocalePreference("zh-CN"));
    rerender(<TerminalSearchBar {...p} result={{ kind: "no-match" }} />);
    expect(screen.getByRole("status").textContent).toBe("无匹配");
  });
});
