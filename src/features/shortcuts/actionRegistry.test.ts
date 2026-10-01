import { describe, expect, it } from "vitest";

import { resolveActionTarget, type WorkspaceActionContext } from "./actionContext";
import { resolveWorkspaceAction, workspaceActionIds } from "./actionRegistry";
import { createWorkspaceActionExecutor } from "./actionExecutor";
import { defaultShortcutBindings, shortcutActions } from "./shortcutRegistry";

function fixture(): WorkspaceActionContext {
  return {
    workspaceVisible: true,
    activeItemId: "split",
    activePaneId: "pane-local",
    items: [
      { id: "home", kind: "home" },
      { id: "ssh:outside", kind: "ssh" },
      { id: "split", kind: "split", memberIds: ["ssh:inside", "local:inside"] },
      { id: "rdp:desktop", kind: "rdp" },
    ],
    instances: [
      { id: "ssh:outside", kind: "ssh", canCreateTerminal: true, canSearch: true, searchQuery: "outside" },
      { id: "ssh:inside", kind: "ssh", canCreateTerminal: true, canSearch: true, searchQuery: "inside" },
      { id: "local:inside", kind: "local", canCreateTerminal: true, canSearch: true, searchQuery: "local" },
      { id: "rdp:desktop", kind: "rdp" },
    ],
    panes: [
      { id: "pane-ssh", itemId: "split", instanceId: "ssh:inside" },
      { id: "pane-local", itemId: "split", instanceId: "local:inside" },
      { id: "pane-empty", itemId: "split", instanceId: null },
    ],
    commandSenderTargetCount: 2,
  };
}

const currentInstance = { kind: "instance", instanceId: "local:inside", instanceKind: "local" };

describe("WF-01 4B: target resolution", () => {
  it("resolves the focused member, not the split host or a sibling", () => {
    expect(resolveActionTarget(fixture(), "instance")).toStrictEqual({ target: currentInstance, reason: null });
  });

  it("distinguishes an instance, its pane, and the entire split group", () => {
    const context = fixture();
    expect(resolveActionTarget(context, "pane").target).toStrictEqual({
      kind: "pane", itemId: "split", paneId: "pane-local", instanceId: "local:inside",
    });
    expect(resolveActionTarget(context, "item").target).toStrictEqual({ kind: "item", itemId: "split" });
    expect(resolveActionTarget(context, "split-group").target).toStrictEqual({ kind: "split-group", itemId: "split" });
    expect(resolveActionTarget(context, "instance").target).toStrictEqual(currentInstance);
  });

  it("uses an explicit context-menu target without activating it", () => {
    const context = fixture();
    const before = JSON.stringify(context);
    expect(resolveActionTarget(context, "instance", { kind: "item", itemId: "ssh:outside" }).target)
      .toStrictEqual({ kind: "instance", instanceId: "ssh:outside", instanceKind: "ssh" });
    expect(JSON.stringify(context)).toBe(before);
  });

  it("does not fall back when an explicit item, pane, or instance has disappeared", () => {
    const context = fixture();
    expect(resolveActionTarget(context, "instance", { kind: "item", itemId: "missing" }).reason).toBe("target-missing");
    expect(resolveActionTarget(context, "instance", { kind: "pane", itemId: "split", paneId: "missing" }).reason).toBe("target-missing");
    expect(resolveActionTarget(context, "instance", { kind: "instance", instanceId: "missing" }).reason).toBe("target-missing");
  });

  it("allows explicitly targeting a live split member as an instance", () => {
    expect(resolveActionTarget(fixture(), "instance", { kind: "instance", instanceId: "ssh:inside" }).target)
      .toStrictEqual({ kind: "instance", instanceId: "ssh:inside", instanceKind: "ssh" });
  });

  it("keeps an empty pane separate from an instance and never closes the group implicitly", () => {
    const context = { ...fixture(), activePaneId: "pane-empty" };
    expect(resolveActionTarget(context, "instance").reason).toBe("empty-pane");
    expect(resolveActionTarget(context, "pane").target).toStrictEqual({
      kind: "pane", itemId: "split", paneId: "pane-empty", instanceId: null,
    });
  });

  it("rejects a pane that belongs to another item or points outside the group", () => {
    const context = fixture();
    expect(resolveActionTarget(context, "instance", { kind: "pane", itemId: "ssh:outside", paneId: "pane-local" }).reason).toBe("wrong-target-kind");
    const changed = { ...context, panes: [{ id: "pane-local", itemId: "split", instanceId: "ssh:outside" }] };
    expect(resolveActionTarget(changed, "instance").reason).toBe("target-missing");
  });

  it("does not use a stale focused pane when a standalone item is active", () => {
    const context = { ...fixture(), activeItemId: "ssh:outside" };
    expect(resolveActionTarget(context, "instance").target)
      .toStrictEqual({ kind: "instance", instanceId: "ssh:outside", instanceKind: "ssh" });
    expect(resolveActionTarget(context, "split-group").reason).toBe("wrong-target-kind");
  });

  it("allows closing a desktop instance but not treating it as a terminal", () => {
    const context = { ...fixture(), activeItemId: "rdp:desktop" };
    expect(resolveActionTarget(context, "instance").target)
      .toStrictEqual({ kind: "instance", instanceId: "rdp:desktop", instanceKind: "rdp" });
    expect(resolveActionTarget(context, "terminal").reason).toBe("terminal-required");
  });

  it("rejects home, missing active selection, and a hidden workspace", () => {
    expect(resolveActionTarget({ ...fixture(), activeItemId: "home" }, "instance").reason).toBe("no-active-session");
    expect(resolveActionTarget({ ...fixture(), activeItemId: null }, "instance").reason).toBe("no-active-session");
    expect(resolveActionTarget({ ...fixture(), workspaceVisible: false }, "instance").reason).toBe("workspace-inactive");
    expect(resolveActionTarget({ ...fixture(), workspaceVisible: false }, "none").target).toStrictEqual({ kind: "application" });
  });

  it("does not infer a pane from a group host when its focus is missing", () => {
    expect(resolveActionTarget({ ...fixture(), activePaneId: null }, "instance").reason).toBe("target-missing");
  });

  it("treats IDs as opaque and preserves embedded colons", () => {
    const context: WorkspaceActionContext = {
      ...fixture(), activeItemId: "ssh:opaque:7",
      items: [{ id: "ssh:opaque:7", kind: "ssh" }],
      instances: [{ id: "ssh:opaque:7", kind: "ssh" }],
    };
    expect(resolveActionTarget(context, "instance").target)
      .toStrictEqual({ kind: "instance", instanceId: "ssh:opaque:7", instanceKind: "ssh" });
  });
});

describe("WF-01 4B: policies and shortcut compatibility", () => {
  it("extends the existing registry without registering new shortcut defaults", () => {
    expect(shortcutActions.length).toBe(9);
    expect(Object.keys(defaultShortcutBindings).length).toBe(9);
    expect(workspaceActionIds.slice(0, 9)).toStrictEqual(shortcutActions.map(({ id }) => id));
    expect(new Set(workspaceActionIds).size).toBe(workspaceActionIds.length);
    expect(resolveWorkspaceAction({ actionId: "workspace.closeItem" }, fixture(), {}).binding).toBe(null);
  });

  it("preserves default, custom, null and undefined binding resolution", () => {
    const request = { actionId: "terminal.closeTab" };
    expect(resolveWorkspaceAction(request, fixture(), {}).binding).toBe("Ctrl+Shift+W");
    expect(resolveWorkspaceAction(request, fixture(), { "terminal.closeTab": "Meta+W" }).binding).toBe("Meta+W");
    expect(resolveWorkspaceAction(request, fixture(), { "terminal.closeTab": null }).binding).toBe(null);
    expect(resolveWorkspaceAction(request, fixture(), { "terminal.closeTab": undefined }).binding).toBe(null);
  });

  it("keeps AI local for every entry source even when its binding is customized", () => {
    for (const source of ["menu", "toolbar", "context-menu", "shortcut"] as const) {
      expect(resolveWorkspaceAction({ actionId: "ai.sendMessage", source }, fixture(), { "ai.sendMessage": "Ctrl+Enter" }).reason).toBe("local-only");
    }
  });

  it("keeps MultiExec deferred and Command Sender independently available", () => {
    expect(resolveWorkspaceAction({ actionId: "terminal.multiExec" }, fixture(), {}).reason).toBe("deferred-wf04c");
    expect(resolveWorkspaceAction({ actionId: "commandSender.toggle" }, fixture(), {}).enabled).toBe(true);
    expect(resolveWorkspaceAction({ actionId: "commandSender.toggle" }, { ...fixture(), commandSenderTargetCount: 0 }, {}).reason).toBe("no-command-targets");
  });

  it("enables tunnels only for an SSH workspace capability", () => {
    expect(resolveWorkspaceAction({ actionId: "tools.tunnels" }, fixture(), {}).reason).toBe("tunnel-unavailable");
    expect(resolveWorkspaceAction(
      { actionId: "tools.tunnels" },
      { ...fixture(), canOpenTunnels: true },
      {},
    ).enabled).toBe(true);
  });

  it("derives terminal capabilities and query availability from the selected instance", () => {
    const context = fixture();
    const request = { actionId: "terminal.search.next" };
    expect(resolveWorkspaceAction(request, context, {}).enabled).toBe(true);
    const emptyQuery = { ...context, instances: context.instances.map((instance) => ({ ...instance, searchQuery: "  " })) };
    expect(resolveWorkspaceAction(request, emptyQuery, {}).reason).toBe("search-query-empty");
    expect(resolveWorkspaceAction({ actionId: "terminal.search.toggle" }, emptyQuery, {}).enabled).toBe(true);
    const disabled = { ...context, instances: context.instances.map((instance) => ({ ...instance, canSearch: false, canCreateTerminal: false })) };
    expect(resolveWorkspaceAction(request, disabled, {}).reason).toBe("terminal-unavailable");
    expect(resolveWorkspaceAction({ actionId: "terminal.newTab" }, disabled, {}).reason).toBe("terminal-unavailable");
  });

  it("has different targets for close-tab, close-pane, close-item and close-group", () => {
    const context = fixture();
    expect(resolveWorkspaceAction({ actionId: "terminal.closeTab" }, context, {}).target).toStrictEqual(currentInstance);
    expect(resolveWorkspaceAction({ actionId: "terminal.closePane" }, context, {}).target?.kind).toBe("pane");
    expect(resolveWorkspaceAction({ actionId: "workspace.closeItem" }, context, {}).target?.kind).toBe("item");
    expect(resolveWorkspaceAction({ actionId: "terminal.closeSplitGroup" }, context, {}).target?.kind).toBe("split-group");
  });

  it("filters ordinary editable inputs, open menus, and IME composition for shortcuts only", () => {
    for (const kind of ["editable", "menu"] as const) {
      expect(resolveWorkspaceAction({ actionId: "settings.open", source: "shortcut", focus: { kind } }, fixture(), {}).reason).toBe("input-focus");
      expect(resolveWorkspaceAction({ actionId: "settings.open", source: "menu", focus: { kind } }, fixture(), {}).enabled).toBe(true);
    }
    expect(resolveWorkspaceAction({ actionId: "terminal.closeTab", source: "shortcut", focus: { kind: "terminal", composing: true } }, fixture(), {}).reason).toBe("input-focus");
  });

  it("retains terminal-search focus policy and accepts terminal-safe shortcuts", () => {
    expect(resolveWorkspaceAction({ actionId: "terminal.search.next", source: "shortcut", focus: { kind: "terminal-search" } }, fixture(), {}).enabled).toBe(true);
    expect(resolveWorkspaceAction({ actionId: "settings.open", source: "shortcut", focus: { kind: "terminal-search" } }, fixture(), {}).reason).toBe("input-focus");
    expect(resolveWorkspaceAction({ actionId: "settings.open", source: "shortcut", focus: { kind: "terminal" } }, fixture(), {}).enabled).toBe(true);
  });

  it("fails closed for missing keyboard context, cleared bindings and menu-only shortcut dispatch", () => {
    expect(resolveWorkspaceAction({ actionId: "settings.open", source: "shortcut" }, fixture(), {}).reason).toBe("input-focus");
    expect(resolveWorkspaceAction({ actionId: "settings.open", source: "shortcut", focus: { kind: "workspace" } }, fixture(), { "settings.open": null }).reason).toBe("shortcut-unbound");
    expect(resolveWorkspaceAction({ actionId: "workspace.closeItem", source: "shortcut", focus: { kind: "workspace" } }, fixture(), {}).reason).toBe("shortcut-unbound");
  });

  it("rejects unknown action and prototype-property names", () => {
    for (const actionId of ["unknown", "__proto__", "constructor", "toString"]) {
      expect(resolveWorkspaceAction({ actionId }, fixture(), {}).reason).toBe("unknown-action");
    }
  });
});

describe("WF-01 4B: injected unified execution", () => {
  it("re-resolves the current context at execution time rather than using a rendered state", async () => {
    let context = fixture();
    const targets: unknown[] = [];
    const executor = createWorkspaceActionExecutor(() => ({ context, bindings: {}, handlers: {
      "terminal.closeTab": (target) => { targets.push(target); },
    } }));
    expect(executor.resolve({ actionId: "terminal.closeTab" }).target).toStrictEqual(currentInstance);
    context = { ...context, activePaneId: "pane-ssh" };
    expect((await executor.run({ actionId: "terminal.closeTab" })).status).toBe("executed");
    expect(targets).toStrictEqual([{ kind: "instance", instanceId: "ssh:inside", instanceKind: "ssh" }]);
  });

  it("refuses a context-menu target deleted after menu rendering without closing the active item", async () => {
    let context = fixture();
    const targets: unknown[] = [];
    const executor = createWorkspaceActionExecutor(() => ({ context, bindings: {}, handlers: {
      "terminal.closeTab": (target) => { targets.push(target); },
    } }));
    const request = { actionId: "terminal.closeTab", target: { kind: "instance" as const, instanceId: "ssh:outside" } };
    expect(executor.resolve(request).enabled).toBe(true);
    context = { ...context, instances: context.instances.filter(({ id }) => id !== "ssh:outside") };
    expect((await executor.run(request)).status).toBe("disabled");
    expect(targets).toStrictEqual([]);
  });

  it("reports missing handlers and never invokes inherited handlers", async () => {
    let calls = 0;
    const handlers = Object.create({ "settings.open": () => { calls += 1; } });
    const executor = createWorkspaceActionExecutor(() => ({ context: fixture(), bindings: {}, handlers }));
    expect(executor.resolve({ actionId: "settings.open" }).reason).toBe("handler-unavailable");
    expect((await executor.run({ actionId: "settings.open" })).status).toBe("disabled");
    expect(calls).toBe(0);
  });

  it("shares one handler across menu, toolbar, context menu and keyboard", async () => {
    const targets: unknown[] = [];
    const executor = createWorkspaceActionExecutor(() => ({ context: fixture(), bindings: {}, handlers: {
      "terminal.closeTab": (target) => { targets.push(target); },
    } }));
    for (const source of ["menu", "toolbar", "context-menu", "shortcut"] as const) {
      expect((await executor.run({ actionId: "terminal.closeTab", source, focus: { kind: "terminal" } })).status).toBe("executed");
    }
    expect(targets).toStrictEqual([currentInstance, currentInstance, currentInstance, currentInstance]);
  });

  it("cannot execute deferred or locally-owned actions even if a handler is injected", async () => {
    let calls = 0;
    const executor = createWorkspaceActionExecutor(() => ({ context: fixture(), bindings: {}, handlers: {
      "ai.sendMessage": () => { calls += 1; }, "terminal.multiExec": () => { calls += 1; },
    } }));
    expect((await executor.run({ actionId: "ai.sendMessage" })).status).toBe("disabled");
    expect((await executor.run({ actionId: "terminal.multiExec" })).status).toBe("disabled");
    expect(calls).toBe(0);
  });

  it("blocks duplicate in-flight execution and releases the guard afterwards", async () => {
    let release = () => {};
    let calls = 0;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const executor = createWorkspaceActionExecutor(() => ({ context: fixture(), bindings: {}, handlers: {
      "settings.open": () => { calls += 1; return pending; },
    } }));
    const first = executor.run({ actionId: "settings.open" });
    expect(executor.resolve({ actionId: "settings.open" }).reason).toBe("action-pending");
    expect((await executor.run({ actionId: "settings.open" })).status).toBe("disabled");
    expect(calls).toBe(1);
    release();
    expect((await first).status).toBe("executed");
    expect(executor.resolve({ actionId: "settings.open" }).enabled).toBe(true);
  });

  it("returns async failures without retrying or leaving an action permanently busy", async () => {
    let calls = 0;
    const error = new Error("test failure");
    const executor = createWorkspaceActionExecutor(() => ({ context: fixture(), bindings: {}, handlers: {
      "settings.open": async () => { calls += 1; throw error; },
    } }));
    const result = await executor.run({ actionId: "settings.open" });
    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.error).toBe(error);
    expect(calls).toBe(1);
    expect(executor.resolve({ actionId: "settings.open" }).enabled).toBe(true);
  });

  it("reads current handler and preferences on each invocation", async () => {
    let calls = 0;
    let enabled = true;
    const executor = createWorkspaceActionExecutor(() => ({ context: fixture(),
      bindings: { "settings.open": enabled ? "Meta+," : null },
      handlers: { "settings.open": () => { calls += enabled ? 1 : 10; } },
    }));
    expect(executor.resolve({ actionId: "settings.open" }).binding).toBe("Meta+,");
    enabled = false;
    expect((await executor.run({ actionId: "settings.open", source: "shortcut", focus: { kind: "workspace" } })).status).toBe("disabled");
    expect((await executor.run({ actionId: "settings.open", source: "menu" })).status).toBe("executed");
    expect(calls).toBe(10);
  });
});
