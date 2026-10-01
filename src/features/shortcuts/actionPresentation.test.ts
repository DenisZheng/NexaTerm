import { describe, expect, it } from "vitest";
import en from "../../shared/i18n/locales/actionbar.en.json";
import zh from "../../shared/i18n/locales/actionbar.zh-CN.json";
import { actionPresentation, actionReasonKeys, menuGroups, toolbarEntries, partitionToolbar } from "./actionPresentation";
import { resolveWorkspaceAction, workspaceActionIds } from "./actionRegistry";
import { createWorkspaceActionExecutor } from "./actionExecutor";
import { defaultShortcutBindings } from "./shortcutRegistry";
import type { WorkspaceActionContext } from "./actionContext";

const context: WorkspaceActionContext = {
  workspaceVisible: true, activeItemId: "ssh:test", activePaneId: null,
  items: [{ id: "ssh:test", kind: "ssh" }],
  instances: [{ id: "ssh:test", kind: "ssh", canSearch: true, canSplit: true }],
  panes: [], commandSenderTargetCount: 1,
};

describe("WF-01 4C: entry presentation", () => {
  it("keeps the six confirmed groups in order", () => {
    expect(menuGroups.map(({ id }) => id)).toStrictEqual(["session", "view", "terminal", "tools", "settings", "help"]);
  });
  it("presents only registered actions and does not add shortcut preference keys", () => {
    for (const id of Object.keys(actionPresentation)) expect(workspaceActionIds.includes(id)).toBe(true);
    expect(Object.keys(defaultShortcutBindings).length).toBe(9);
    expect(Object.prototype.hasOwnProperty.call(actionPresentation, "ai.sendMessage")).toBe(false);
  });
  it("has complete matching catalogs for entries, groups and disabled reasons", () => {
    expect(Object.keys(en).sort()).toStrictEqual(Object.keys(zh).sort());
    const keys = [...Object.values(actionPresentation).map(({ labelKey }) => labelKey),
      ...menuGroups.map(({ labelKey }) => labelKey), ...Object.values(actionReasonKeys)];
    for (const key of keys) {
      expect(typeof en[key]).toBe("string"); expect(typeof zh[key]).toBe("string");
      expect(en[key].length > 0 && zh[key].length > 0).toBe(true);
    }
  });
  it("leaves all newly presented entries disabled without injected handlers", () => {
    const executor = createWorkspaceActionExecutor(() => ({ context, bindings: {}, handlers: {} }));
    for (const id of Object.keys(actionPresentation)) expect(executor.resolve({ actionId: id, source: "menu" }).enabled).toBe(false);
  });
  it("reads actual overrides and intentional unbinding instead of prototype hints", () => {
    const request = { actionId: "terminal.closeTab", source: "menu" as const };
    expect(resolveWorkspaceAction(request, context, {}).binding).toBe("Ctrl+Shift+W");
    expect(resolveWorkspaceAction(request, context, { "terminal.closeTab": "Meta+W" }).binding).toBe("Meta+W");
    expect(resolveWorkspaceAction(request, context, { "terminal.closeTab": null }).binding).toBe(null);
  });
  it("keeps Command Sender separate from deferred MultiExec and unverified X11", () => {
    expect(resolveWorkspaceAction({ actionId: "commandSender.toggle" }, context, {}).enabled).toBe(true);
    expect(resolveWorkspaceAction({ actionId: "terminal.multiExec" }, context, {}).reason).toBe("deferred-wf04c");
    expect(resolveWorkspaceAction({ actionId: "tools.x11" }, context, {}).reason).toBe("capability-unavailable");
  });
  it("requires explicit split capability even for a live terminal", () => {
    expect(resolveWorkspaceAction({ actionId: "terminal.splitRight" }, context, {}).enabled).toBe(true);
    const unavailable = { ...context, instances: [{ id: "ssh:test", kind: "ssh" as const }] };
    expect(resolveWorkspaceAction({ actionId: "terminal.splitRight" }, unavailable, {}).reason).toBe("split-unavailable");
  });
  it("covers every toolbar entry exactly once at every supported size", () => {
    for (const width of [0, 32, 120, 159, 160, 359, 360, 839, 840, 1600]) {
      const { visible, overflow } = partitionToolbar(width);
      const ids = [...visible, ...overflow].map(({ id }) => id);
      expect(ids.length).toBe(toolbarEntries.length);
      expect(new Set(ids).size).toBe(ids.length);
      expect([...ids].sort()).toStrictEqual(toolbarEntries.map(({ id }) => id).sort());
    }
  });
  it("retains the highest priority controls before lower priority tools", () => {
    const layout = partitionToolbar(200);
    expect(layout.visible.map(({ id }) => id)).toStrictEqual(["new-session", "split", "terminal.multiExec"]);
    expect(layout.overflow.some(({ id }) => id === "tools.tunnels")).toBe(true);
  });
  it("puts everything in overflow when only a single control can fit", () => {
    expect(partitionToolbar(80).visible.length).toBe(0);
    expect(partitionToolbar(80).overflow.length).toBe(toolbarEntries.length);
  });
  it("selects text, icons and reduced layouts without losing entries", () => {
    expect(partitionToolbar(1000).mode).toBe("labels");
    expect(partitionToolbar(600).mode).toBe("icons");
    expect(partitionToolbar(200).mode).toBe("reduced");
    expect(partitionToolbar(80).mode).toBe("overflow");
  });
  it("fails compactly for invalid measurements and never mutates the metadata", () => {
    const before = JSON.stringify(toolbarEntries);
    for (const width of [NaN, Infinity, -1]) expect(partitionToolbar(width).visible.length).toBe(0);
    expect(JSON.stringify(toolbarEntries)).toBe(before);
  });
});
