import { describe, expect, it } from "vitest";

import {
  aiSendMessageShortcutActionId,
  defaultShortcutBindings,
  getShortcutAction,
  resolveGlobalShortcutBindings,
  resolveShortcutBinding,
  resolveShortcutBindingById,
  shortcutActions,
} from "./shortcutRegistry";
import type { ShortcutAction } from "./shortcutTypes";

const legacyBindings: Record<string, string> = {
  "connection.quickOpen": "Ctrl+Shift+O",
  "settings.open": "Ctrl+,",
  "terminal.newTab": "Ctrl+Shift+T",
  "terminal.closeTab": "Ctrl+Shift+W",
  "terminal.search.toggle": "Ctrl+Shift+F",
  "terminal.search.next": "F3",
  "terminal.search.previous": "Shift+F3",
  "ai.sendMessage": "Enter",
  "commandSender.toggle": "Ctrl+Shift+K",
};

const legacyScopes = [
  "global", "global", "terminal", "terminal", "terminal", "terminal-search",
  "terminal-search", "workspace", "workspace",
];

const legacyCategories = [
  "general", "general", "terminal", "terminal", "search", "search", "search",
  "tools", "tools",
];

const globalActionIds = Object.keys(legacyBindings).filter((id) => id !== "ai.sendMessage");

describe("WF-01 4A: shortcut compatibility", () => {
  it("preserves exactly nine action IDs, their order, and every default binding", () => {
    expect(shortcutActions.map((action) => action.id)).toStrictEqual(Object.keys(legacyBindings));
    expect(new Set(shortcutActions.map((action) => action.id)).size).toBe(9);
    expect(defaultShortcutBindings).toStrictEqual(legacyBindings);
    for (const action of shortcutActions) {
      expect(action.defaultBinding).toBe(legacyBindings[action.id]);
    }
  });

  it("preserves scope, category, terminal eligibility, and the Command Sender name", () => {
    expect(shortcutActions.map((action) => action.scope)).toStrictEqual(legacyScopes);
    expect(shortcutActions.map((action) => action.category)).toStrictEqual(legacyCategories);
    expect(shortcutActions.map((action) => action.allowInTerminal)).toStrictEqual([
      true, true, true, true, true, true, true, false, true,
    ]);
    expect(getShortcutAction("commandSender.toggle")?.label.includes("Command Sender")).toBe(true);
    expect(shortcutActions.some((action) => /multiexec/i.test(action.id))).toBe(false);
  });

  it("resolves every absent user preference to its original default", () => {
    for (const action of shortcutActions) {
      expect(resolveShortcutBinding({}, action)).toBe(legacyBindings[action.id]);
      expect(resolveShortcutBindingById({}, action.id)).toBe(legacyBindings[action.id]);
    }
  });

  it("retains custom bindings and explicit null or undefined disables for every action", () => {
    for (const action of shortcutActions) {
      expect(resolveShortcutBindingById({ [action.id]: "Meta+Shift+J" }, action.id)).toBe("Meta+Shift+J");
      expect(resolveShortcutBindingById({ [action.id]: null }, action.id)).toBe(null);
      expect(resolveShortcutBindingById({ [action.id]: undefined }, action.id)).toBe(null);
    }
  });

  it("does not normalize or replace a stored empty binding", () => {
    expect(resolveShortcutBindingById({ "settings.open": "" }, "settings.open")).toBe("");
  });

  it("ignores inherited preferences and supports null-prototype preference maps", () => {
    const inherited = Object.create({ "settings.open": "Alt+J" }) as Record<string, string>;
    expect(resolveShortcutBindingById(inherited, "settings.open")).toBe("Ctrl+,");
    const noPrototype = Object.assign(Object.create(null), { "settings.open": null });
    expect(resolveShortcutBindingById(noPrototype, "settings.open")).toBe(null);
  });

  it("ignores unknown IDs without rewriting the preference map", () => {
    const bindings = Object.freeze({ "unknown.action": "Alt+J", "settings.open": null });
    expect(getShortcutAction("unknown.action")).toBe(null);
    expect(resolveShortcutBindingById(bindings, "unknown.action")).toBe(null);
    expect(bindings).toStrictEqual({ "unknown.action": "Alt+J", "settings.open": null });
  });

  it("preserves a persisted mixed preference map including the AI binding", () => {
    const bindings: Record<string, string | null> = JSON.parse(JSON.stringify({
      "settings.open": "Meta+,", "terminal.closeTab": null, "ai.sendMessage": "Ctrl+Enter",
    }));
    expect(resolveShortcutBindingById(bindings, "settings.open")).toBe("Meta+,");
    expect(resolveShortcutBindingById(bindings, "terminal.closeTab")).toBe(null);
    expect(resolveShortcutBindingById(bindings, aiSendMessageShortcutActionId)).toBe("Ctrl+Enter");
    expect(resolveShortcutBindingById(bindings, "terminal.newTab")).toBe("Ctrl+Shift+T");
  });

  it("keeps the existing ShortcutAction API usable without new registry metadata", () => {
    const action: ShortcutAction = {
      id: "legacy.custom", category: "tools", label: "Legacy", description: "Fixture",
      defaultBinding: "Alt+J", scope: "workspace", allowInTerminal: false,
    };
    expect(resolveShortcutBinding({}, action)).toBe("Alt+J");
    expect(resolveShortcutBinding({ "legacy.custom": null }, action)).toBe(null);
  });
});

describe("WF-01 4A: explicit dispatch ownership", () => {
  it("marks eight global actions and one locally consumed AI action", () => {
    expect(shortcutActions.map((action) => action.dispatch)).toStrictEqual([
      "global", "global", "global", "global", "global", "global", "global", "local", "global",
    ]);
    expect(getShortcutAction(aiSendMessageShortcutActionId)?.dispatch).toBe("local");
  });

  it("projects only the eight global candidates without changing their order or identity", () => {
    const resolved = resolveGlobalShortcutBindings({});
    expect(resolved.map(({ action }) => action.id)).toStrictEqual(globalActionIds);
    for (const { action, binding } of resolved) {
      expect(action).toBe(getShortcutAction(action.id));
      expect(binding).toBe(legacyBindings[action.id]);
    }
  });

  it("never promotes AI to a global action, including customized modified-key bindings", () => {
    for (const binding of ["Enter", "Ctrl+Enter", "Meta+Shift+J", null, undefined]) {
      const bindings = { [aiSendMessageShortcutActionId]: binding };
      const resolved = resolveGlobalShortcutBindings(bindings);
      expect(resolved.map(({ action }) => action.id)).toStrictEqual(globalActionIds);
      expect(resolveShortcutBindingById(bindings, aiSendMessageShortcutActionId)).toBe(binding ?? null);
    }
  });

  it("retains global overrides and cleared bindings; unknown config keys cannot register actions", () => {
    const resolved = resolveGlobalShortcutBindings({
      "settings.open": "Meta+,", "terminal.closeTab": null,
      "terminal.search.next": undefined, "unknown.action": "Enter",
    });
    const byId = Object.fromEntries(resolved.map(({ action, binding }) => [action.id, binding]));
    expect(byId["settings.open"]).toBe("Meta+,");
    expect(byId["terminal.closeTab"]).toBe(null);
    expect(byId["terminal.search.next"]).toBe(null);
    expect(byId["connection.quickOpen"]).toBe("Ctrl+Shift+O");
    expect(Object.prototype.hasOwnProperty.call(byId, "unknown.action")).toBe(false);
  });

  it("does not mutate frozen preferences or action definitions when projecting", () => {
    const definitionsBefore = JSON.stringify(shortcutActions);
    const defaultsBefore = { ...defaultShortcutBindings };
    const bindings = Object.freeze({ "settings.open": "Meta+,", "ai.sendMessage": null });
    resolveGlobalShortcutBindings(bindings);
    expect(JSON.stringify(shortcutActions)).toBe(definitionsBefore);
    expect(defaultShortcutBindings).toStrictEqual(defaultsBefore);
    expect(bindings).toStrictEqual({ "settings.open": "Meta+,", "ai.sendMessage": null });
  });

  it("re-resolves changed preferences instead of caching stale candidate bindings", () => {
    const first = resolveGlobalShortcutBindings({ "settings.open": "Meta+," });
    const next = resolveGlobalShortcutBindings({ "settings.open": null });
    expect(first.find(({ action }) => action.id === "settings.open")?.binding).toBe("Meta+,");
    expect(next.find(({ action }) => action.id === "settings.open")?.binding).toBe(null);
    expect(first).not.toBe(next);
  });
});
