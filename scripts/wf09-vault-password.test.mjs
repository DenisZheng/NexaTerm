import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// 执行现有 SettingsView 的真实安全表单 handler，覆盖 IPC 前的密码/确认语义。
const source = readFileSync(new URL("../src/features/settings/SettingsView.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("SettingsView.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const section = tree.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "SecuritySettingsSection");
const handlers = ["submitEnable", "submitUnlock", "submitChangePassword"];
function harness(input, ok = true) {
  const writes = [], updates = [], errors = [], clears = [];
  const context = {
    ...input, t: (key) => key, setLocalError: (error) => errors.push(error),
    onEnableMasterPassword: async (password) => { writes.push(password); return ok; },
    onUnlockSecuritySettings: async (password) => { writes.push(password); return ok; },
    onUpdate: (value) => updates.push(value), setSettingsUnlocked: () => {}, setEnabling: () => {}, setChangingPassword: () => {},
    ...Object.fromEntries(["setMasterPassword", "setConfirmPassword", "setUnlockPassword", "setNextPassword", "setNextConfirmPassword"].map((key) => [key, (value) => clears.push(value)])),
  };
  const code = handlers.map((name) => section.body.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(tree)).join("\n");
  vm.createContext(context);
  vm.runInContext(ts.transpile(code + `\nglobalThis.api = { ${handlers.join(", ")} };`, { target: ts.ScriptTarget.ES2022 }), context);
  return { ...context.api, writes, updates, errors, clears };
}
const event = { preventDefault() {} };
const fields = (password, confirmation = password) => ({ masterPassword: password, confirmPassword: confirmation, unlockPassword: password, nextPassword: password, nextConfirmPassword: confirmation });
for (const name of handlers) {
  test(`${name} preserves exact leading/trailing password characters`, async () => {
    const h = harness(fields(" fixture-password ")); await h[name](event);
    assert.deepEqual(h.writes, [" fixture-password "]); assert.equal(h.errors.at(-1), null);
  });
  test(`${name} rejects whitespace-only input without IPC`, async () => {
    const h = harness(fields(" \t ")); await h[name](event);
    assert.deepEqual(h.writes, []); assert.equal(h.errors.length, 1);
  });
  test(`${name} keeps the draft and settings when backend authentication/rekey fails`, async () => {
    const h = harness(fields("fixture-password"), false); await h[name](event);
    assert.equal(h.writes.length, 1); assert.deepEqual(h.updates, []); assert.deepEqual(h.clears, []);
  });
}
for (const name of ["submitEnable", "submitChangePassword"]) {
  test(`${name} compares confirmation exactly, including spaces`, async () => {
    const h = harness(fields(" fixture-password ", "fixture-password")); await h[name](event);
    assert.deepEqual(h.writes, []); assert.deepEqual(h.updates, []);
    assert.equal(h.errors.at(-1), "settings.security.error.passwordMismatch");
  });
}
