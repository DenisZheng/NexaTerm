// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocalePreference, t } from "../../shared/i18n";
import { createWorkspaceActionExecutor, type WorkspaceActionHandler } from "../shortcuts/actionExecutor";
import type { WorkspaceActionContext } from "../shortcuts/actionContext";
import { actionPresentation } from "../shortcuts/actionPresentation";
import type { LocalTerminalProfile } from "../terminal/localTerminalTypes";
import { AppActionBar } from "./AppActionBar";

class TestResizeObserver {
  static all: TestResizeObserver[] = [];
  private element: Element | null = null;
  constructor(private callback: ResizeObserverCallback) { TestResizeObserver.all.push(this); }
  observe(element: Element) { this.element = element; }
  unobserve() { this.element = null; }
  disconnect = vi.fn();
  resize(width: number) {
    if (this.element) this.callback([{ target: this.element, contentRect: { width, height: 34 } }] as ResizeObserverEntry[], this as unknown as ResizeObserver);
  }
}
const scrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
beforeEach(() => {
  TestResizeObserver.all = [];
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  setLocalePreference("en");
});
afterEach(() => {
  cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  if (scrollIntoView) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scrollIntoView);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});
function resize(width: number) { act(() => { [...TestResizeObserver.all].forEach((observer) => observer.resize(width)); }); }
const profile: LocalTerminalProfile = {
  id: "fixture-profile", name: "Fixture shell", kind: "bash", platform: "linux", source: "custom",
  command: "fixture-shell", args: [], env: {}, icon: "terminal", hidden: false, detected: true,
};
function setup(overrides: Record<string, WorkspaceActionHandler> = {}, bindings: Record<string, string | null> = {}, targetCount = 1) {
  let context: WorkspaceActionContext = {
    workspaceVisible: true, activeItemId: "ssh:test", activePaneId: null,
    items: [{ id: "ssh:test", kind: "ssh" }],
    instances: [{ id: "ssh:test", kind: "ssh", canSearch: true, canSplit: true, canCreateTerminal: true, searchQuery: "fixture" }],
    panes: [], commandSenderTargetCount: targetCount,
  };
  const handlers: Record<string, WorkspaceActionHandler> = Object.fromEntries(Object.keys(actionPresentation).map((id) => [id, vi.fn()]));
  Object.assign(handlers, overrides);
  const executor = createWorkspaceActionExecutor(() => ({ context, bindings, handlers }));
  const newSession = {
    localProfiles: [profile], localProfilesLoading: false,
    onOpenLocalProfile: vi.fn(), onCreateConnection: vi.fn(), onQuickOpen: vi.fn(),
  };
  const view = render(<AppActionBar executor={executor} newSession={newSession} />);
  return { ...view, handlers, newSession, updateContext(next: WorkspaceActionContext) { context = next; }, getContext: () => context };
}
async function open(name: string, role: "button" | "menuitem" = "menuitem") {
  const control = screen.getByRole(role, { name });
  act(() => control.focus());
  fireEvent.keyDown(control, { key: "Enter" });
  await screen.findByRole("menu");
  return control;
}

describe("WF-01 4C: real Radix entry interactions", () => {
  it("keeps all six menus while the complete toolbar folds into overflow", () => {
    setup(); resize(80);
    expect(within(screen.getByRole("menubar")).getAllByRole("menuitem").map((node) => node.textContent))
      .toStrictEqual(["Session", "View", "Terminal", "Tools", "Settings", "Help"]);
    expect(within(screen.getByRole("toolbar")).getAllByRole("button").length).toBe(1);
    expect(screen.getByRole("button", { name: "More tools" })).toBeDefined();
  });
  it("moves between menus with arrow keys", async () => {
    setup();
    const first = screen.getByRole("menuitem", { name: "Session" });
    act(() => first.focus()); fireEvent.keyDown(first, { key: "ArrowRight" });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "View" })));
  });
  it("opens from the keyboard and restores trigger focus on Escape", async () => {
    setup(); const trigger = await open("Terminal");
    fireEvent.keyDown(document.activeElement || screen.getByRole("menu"), { key: "Escape" });
    await waitFor(() => { expect(screen.queryByRole("menu")).toBe(null); expect(document.activeElement).toBe(trigger); });
  });
  it("uses the real binding and dispatches the menu action once", async () => {
    const { handlers } = setup({}, { "terminal.closeTab": "Meta+W" });
    await open("Terminal");
    const item = screen.getByRole("menuitem", { name: "Close current instance" });
    expect(item.textContent?.includes("Meta+W")).toBe(true);
    fireEvent.click(item);
    await waitFor(() => expect(handlers["terminal.closeTab"]).toHaveBeenCalledTimes(1));
    expect(handlers["terminal.closeTab"]).toHaveBeenCalledWith({ kind: "instance", instanceId: "ssh:test", instanceKind: "ssh" });
  });
  it("omits an intentionally cleared binding instead of showing a prototype default", async () => {
    setup({}, { "terminal.closeTab": null }); await open("Terminal");
    expect(screen.getByRole("menuitem", { name: "Close current instance" }).textContent).toBe("Close current instance");
  });
  it("dispatches MultiExec from the terminal menu once", async () => {
    const { handlers } = setup(); await open("Terminal");
    const item = screen.getByRole("menuitem", { name: "MultiExec" });
    expect(item.getAttribute("aria-disabled")).not.toBe("true");
    fireEvent.click(item);
    await waitFor(() => expect(handlers["terminal.multiExec"]).toHaveBeenCalledExactlyOnceWith({ kind: "application" }));
  });
  it("explains why MultiExec is unavailable when no terminal targets remain", async () => {
    const state = setup({}, {}, 0);
    await open("Terminal");
    const item = screen.getByRole("menuitem", { name: /MultiExec.*No terminal targets/ });
    expect(item.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(item);
    expect(state.handlers["terminal.multiExec"]).not.toHaveBeenCalled();
  });
  it("dispatches MultiExec from the compact toolbar overflow", async () => {
    const { handlers } = setup(); resize(80); await open("More tools", "button");
    fireEvent.click(screen.getByRole("menuitem", { name: "MultiExec" }));
    await waitFor(() => expect(handlers["terminal.multiExec"]).toHaveBeenCalledExactlyOnceWith({ kind: "application" }));
  });
  it("keeps Command Sender available independently in overflow", async () => {
    const { handlers } = setup(); resize(80); await open("More tools", "button");
    fireEvent.click(screen.getByRole("menuitem", { name: "Command Sender" }));
    await waitFor(() => expect(handlers["commandSender.toggle"]).toHaveBeenCalledTimes(1));
    expect(handlers["terminal.multiExec"]).not.toHaveBeenCalled();
  });
  it("reuses local-profile choices in the toolbar new-session menu", async () => {
    const { newSession } = setup(); resize(1000); await open(t("newSession.title"), "button");
    fireEvent.click(screen.getByRole("menuitem", { name: /Fixture shell/ }));
    expect(newSession.onOpenLocalProfile).toHaveBeenCalledTimes(1);
    expect(newSession.onOpenLocalProfile).toHaveBeenCalledWith(profile);
  });
  it("supports toolbar Home/End and keeps one tab stop", () => {
    setup(); resize(1000);
    const buttons = within(screen.getByRole("toolbar")).getAllByRole("button");
    act(() => buttons[0].focus()); fireEvent.keyDown(buttons[0], { key: "End" });
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(document.activeElement).toBe(buttons[0]);
    expect(buttons.filter((node) => node.tabIndex === 0).length).toBe(1);
  });
  it("does not redirect a stale visible close entry to another session", async () => {
    const state = setup(); await open("Terminal");
    state.updateContext({ ...state.getContext(), instances: [] });
    fireEvent.click(screen.getByRole("menuitem", { name: "Close current instance" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent?.includes("no longer exists")).toBe(true);
    expect(state.handlers["terminal.closeTab"]).not.toHaveBeenCalled();
  });
  it("shows a safe failure without exposing raw error details or retrying", async () => {
    const handler = vi.fn(async () => { throw new Error("private-fixture-error-detail"); });
    setup({ "settings.open": handler }); await open("Settings");
    fireEvent.click(screen.getByRole("menuitem", { name: t("actionBar.action.settings") }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent?.includes("could not be completed")).toBe(true);
    expect(alert.textContent?.includes("private-fixture-error-detail")).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);
  });
  it("updates entry labels when the existing locale changes", () => {
    setup(); act(() => setLocalePreference("zh-CN"));
    expect(screen.getByRole("menuitem", { name: "\u4f1a\u8bdd" })).toBeDefined();
    expect(screen.getByRole("menubar", { name: "\u4e3b\u83dc\u5355" })).toBeDefined();
  });
  it("disconnects the toolbar measurement observer on unmount", () => {
    const state = setup(); state.unmount();
    expect(TestResizeObserver.all.length > 0).toBe(true);
    expect(TestResizeObserver.all.every((observer) => observer.disconnect.mock.calls.length > 0)).toBe(true);
  });
});
