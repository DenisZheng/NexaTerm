import assert from "node:assert/strict";
import { describe, it } from "vitest";

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
    assert.deepEqual(shortcutActions.map((action) => action.id), Object.keys(legacyBindings));
    assert.equal(new Set(shortcutActions.map((action) => action.id)).size, 9);
    assert.deepEqual(defaultShortcutBindings, legacyBindings);
    for (const action of shortcutActions) {
      assert.equal(action.defaultBinding, legacyBindings[action.id]);
    }
  });

  it("preserves scope, category, terminal eligibility, and the Command Sender name", () => {
    assert.deepEqual(shortcutActions.map((action) => action.scope), legacyScopes);
    assert.deepEqual(shortcutActions.map((action) => action.category), legacyCategories);
    assert.deepEqual(shortcutActions.map((action) => action.allowInTerminal), [
      true, true, true, true, true, true, true, false, true,
    ]);
    assert.ok(getShortcutAction("commandSender.toggle")?.label.includes("Command Sender"));
    assert.equal(shortcutActions.some((action) => /multiexec/i.test(action.id)), false);
  });

  it("resolves every absent user preference to its original default", () => {
    for (const action of shortcutActions) {
      assert.equal(resolveShortcutBinding({}, action), legacyBindings[action.id]);
      assert.equal(resolveShortcutBindingById({}, action.id), legacyBindings[action.id]);
    }
  });

  it("retains custom bindings and explicit null or undefined disables for every action", () => {
    for (const action of shortcutActions) {
      assert.equal(resolveShortcutBindingById({ [action.id]: "Meta+Shift+J" }, action.id), "Meta+Shift+J");
      assert.equal(resolveShortcutBindingById({ [action.id]: null }, action.id), null);
      assert.equal(resolveShortcutBindingById({ [action.id]: undefined }, action.id), null);
    }
  });

  it("does not normalize or replace a stored empty binding", () => {
    assert.equal(resolveShortcutBindingById({ "settings.open": "" }, "settings.open"), "");
  });

  it("ignores inherited preferences and supports null-prototype preference maps", () => {
    const inherited = Object.create({ "settings.open": "Alt+J" }) as Record<string, string>;
    assert.equal(resolveShortcutBindingById(inherited, "settings.open"), "Ctrl+,");
    const noPrototype = Object.assign(Object.create(null), { "settings.open": null });
    assert.equal(resolveShortcutBindingById(noPrototype, "settings.open"), null);
  });

  it("ignores unknown IDs without rewriting the preference map", () => {
    const bindings = Object.freeze({ "unknown.action": "Alt+J", "settings.open": null });
    assert.equal(getShortcutAction("unknown.action"), null);
    assert.equal(resolveShortcutBindingById(bindings, "unknown.action"), null);
    assert.deepEqual(bindings, { "unknown.action": "Alt+J", "settings.open": null });
  });

  it("preserves a persisted mixed preference map including the AI binding", () => {
    const bindings: Record<string, string | null> = JSON.parse(JSON.stringify({
      "settings.open": "Meta+,", "terminal.closeTab": null, "ai.sendMessage": "Ctrl+Enter",
    }));
    assert.equal(resolveShortcutBindingById(bindings, "settings.open"), "Meta+,");
    assert.equal(resolveShortcutBindingById(bindings, "terminal.closeTab"), null);
    assert.equal(resolveShortcutBindingById(bindings, aiSendMessageShortcutActionId), "Ctrl+Enter");
    assert.equal(resolveShortcutBindingById(bindings, "terminal.newTab"), "Ctrl+Shift+T");
  });

  it("keeps the existing ShortcutAction API usable without new registry metadata", () => {
    const action: ShortcutAction = {
      id: "legacy.custom", category: "tools", label: "Legacy", description: "Fixture",
      defaultBinding: "Alt+J", scope: "workspace", allowInTerminal: false,
    };
    assert.equal(resolveShortcutBinding({}, action), "Alt+J");
    assert.equal(resolveShortcutBinding({ "legacy.custom": null }, action), null);
  });
});

describe("WF-01 4A: explicit dispatch ownership", () => {
  it("marks eight global actions and one locally consumed AI action", () => {
    assert.deepEqual(shortcutActions.map((action) => action.dispatch), [
      "global", "global", "global", "global", "global", "global", "global", "local", "global",
    ]);
    assert.equal(getShortcutAction(aiSendMessageShortcutActionId)?.dispatch, "local");
  });

  it("projects only the eight global candidates without changing their order or identity", () => {
    const resolved = resolveGlobalShortcutBindings({});
    assert.deepEqual(resolved.map(({ action }) => action.id), globalActionIds);
    for (const { action, binding } of resolved) {
      assert.equal(action, getShortcutAction(action.id));
      assert.equal(binding, legacyBindings[action.id]);
    }
  });

  it("never promotes AI to a global action, including customized modified-key bindings", () => {
    for (const binding of ["Enter", "Ctrl+Enter", "Meta+Shift+J", null, undefined]) {
      const bindings = { [aiSendMessageShortcutActionId]: binding };
      const resolved = resolveGlobalShortcutBindings(bindings);
      assert.deepEqual(resolved.map(({ action }) => action.id), globalActionIds);
      assert.equal(resolveShortcutBindingById(bindings, aiSendMessageShortcutActionId), binding ?? null);
    }
  });

  it("retains global overrides and cleared bindings; unknown config keys cannot register actions", () => {
    const resolved = resolveGlobalShortcutBindings({
      "settings.open": "Meta+,", "terminal.closeTab": null,
      "terminal.search.next": undefined, "unknown.action": "Enter",
    });
    const byId = Object.fromEntries(resolved.map(({ action, binding }) => [action.id, binding]));
    assert.equal(byId["settings.open"], "Meta+,");
    assert.equal(byId["terminal.closeTab"], null);
    assert.equal(byId["terminal.search.next"], null);
    assert.equal(byId["connection.quickOpen"], "Ctrl+Shift+O");
    assert.equal(Object.prototype.hasOwnProperty.call(byId, "unknown.action"), false);
  });

  it("does not mutate frozen preferences or action definitions when projecting", () => {
    const definitionsBefore = JSON.stringify(shortcutActions);
    const defaultsBefore = { ...defaultShortcutBindings };
    const bindings = Object.freeze({ "settings.open": "Meta+,", "ai.sendMessage": null });
    resolveGlobalShortcutBindings(bindings);
    assert.equal(JSON.stringify(shortcutActions), definitionsBefore);
    assert.deepEqual(defaultShortcutBindings, defaultsBefore);
    assert.deepEqual(bindings, { "settings.open": "Meta+,", "ai.sendMessage": null });
  });

  it("re-resolves changed preferences instead of caching stale candidate bindings", () => {
    const first = resolveGlobalShortcutBindings({ "settings.open": "Meta+," });
    const next = resolveGlobalShortcutBindings({ "settings.open": null });
    assert.equal(first.find(({ action }) => action.id === "settings.open")?.binding, "Meta+,");
    assert.equal(next.find(({ action }) => action.id === "settings.open")?.binding, null);
    assert.notEqual(first, next);
  });
});
