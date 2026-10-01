// @vitest-environment jsdom
import { fireEvent, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { WorkspaceActionState } from "./actionRegistry";
import {
  actionFocusContextForKeyboardEvent,
  useWorkspaceActionShortcuts,
} from "./useWorkspaceActionShortcuts";

function state(enabled: boolean): WorkspaceActionState {
  return {
    actionId: "settings.open",
    binding: "Ctrl+,",
    enabled,
    target: enabled ? { kind: "application" } : null,
    reason: enabled ? null : "input-focus",
  };
}

describe("WF-01 4D-2 unified shortcuts", () => {
  it("classifies terminal search before editable input and ordinary inputs as editable", () => {
    const search = document.createElement("div");
    search.className = "terminal-search-bar";
    const searchInput = document.createElement("input");
    search.append(searchInput);
    document.body.append(search);
    expect(actionFocusContextForKeyboardEvent({ target: searchInput, isComposing: false }).kind)
      .toBe("terminal-search");

    const input = document.createElement("input");
    document.body.append(input);
    expect(actionFocusContextForKeyboardEvent({ target: input, isComposing: false }).kind)
      .toBe("editable");
  });

  it("marks menu focus and IME composition so policy can fail closed", () => {
    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    const button = document.createElement("button");
    menu.append(button);
    document.body.append(menu);
    expect(actionFocusContextForKeyboardEvent({ target: button, isComposing: true }))
      .toStrictEqual({ kind: "menu", composing: true });
  });

  it("dispatches matching enabled global shortcuts through the executor", () => {
    const executor = {
      resolve: vi.fn(() => state(true)),
      run: vi.fn(async () => ({ status: "executed" as const, state: state(true) })),
    };
    renderHook(() => useWorkspaceActionShortcuts({
      bindings: { "settings.open": "Ctrl+," },
      executor: executor as never,
    }));
    fireEvent.keyDown(window, { key: ",", ctrlKey: true });
    expect(executor.resolve).toHaveBeenCalledWith(expect.objectContaining({
      actionId: "settings.open", source: "shortcut",
      focus: { kind: "workspace", composing: undefined },
    }));
    expect(executor.run).toHaveBeenCalledTimes(1);
  });

  it("does not dispatch a matching shortcut when unified policy disables it", () => {
    const executor = { resolve: vi.fn(() => state(false)), run: vi.fn() };
    renderHook(() => useWorkspaceActionShortcuts({
      bindings: { "settings.open": "Ctrl+," },
      executor: executor as never,
    }));
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    fireEvent.keyDown(input, { key: ",", ctrlKey: true });
    expect(executor.resolve).toHaveBeenCalled();
    expect(executor.run).not.toHaveBeenCalled();
  });
});
