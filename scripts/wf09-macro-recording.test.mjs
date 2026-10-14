import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// 执行真实 Sender handler 与 recorder；只替换外部 IPC/UI 接口。
const moduleCache = new Map();
function loadModule(path) {
  if (moduleCache.has(path)) return moduleCache.get(path);
  const exports = {}; moduleCache.set(path, exports);
  const code = ts.transpile(readFileSync(path, "utf8"), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
  vm.runInNewContext(code, { exports, TextEncoder, performance, require: (name) => {
    assert.ok(name.startsWith(".")); return loadModule(resolve(dirname(path), `${name}.ts`));
  } });
  return exports;
}
const { createMacroRecorder } = loadModule(resolve("src/features/macros/macroRecorder.ts"));
const { isSensitiveCommand } = loadModule(resolve("src/features/commands/commandPrivacy.ts"));
const { writeMultiExecCommand } = loadModule(resolve("src/features/workspace/multiExec/send.ts"));
const { resolvePinnedMultiExecTarget } = loadModule(resolve("src/features/workspace/multiExec/targets.ts"));
const source = readFileSync("src/features/layout/WorkspaceShell.tsx", "utf8");
const tree = ts.createSourceFile("WorkspaceShell.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const shell = tree.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "WorkspaceShell");
const handler = shell.body.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "sendCommandTextToTargets");
const terminalSource = readFileSync("src/features/terminal/TerminalPanel.tsx", "utf8");
const terminalTree = ts.createSourceFile("TerminalPanel.tsx", terminalSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let onDataNode;
function findOnData(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(terminalTree) === "dataDisposable") onDataNode = node.initializer.arguments[0];
  ts.forEachChild(node, findOnData);
}
findOnData(terminalTree);
const historyHelpers = terminalTree.statements.filter((node) => ts.isFunctionDeclaration(node) && ["createTerminalInputHistoryState", "applyTerminalInputHistoryData"].includes(node.name?.text)).map((node) => node.getText(terminalTree)).join("\n");
const a = { key: "ssh:a", sessionId: "fixture-a", title: "Fixture A" };
const b = { key: "ssh:b", sessionId: "fixture-b", title: "Fixture B" };
function harness(writer = async () => {}) {
  const live = new Map([a, b].map((target) => [target.key, target])); const writes = [], history = [], marks = [];
  const resolveTarget = (key) => live.get(key) ?? null;
  const recorder = createMacroRecorder(resolveTarget, () => 0); recorder.start(a);
  const noop = () => {};
  const context = {
    selectedCommandTargets: [a], macroRecorder: recorder, writeMultiExecCommand, resolvePinnedMultiExecTarget,
    resolveCurrentMultiExecTarget: resolveTarget, hasTauriRuntime: () => true, isSensitiveCommand,
    terminalWrite: async (id, data) => { writes.push({ id, data }); await writer(id, data); },
    tr: (key) => key, formatError: () => "sanitized fixture error", uniqueCommandHistoryScopes: (scopes) => scopes,
    commandHistoryRecord: async (request) => { history.push(request); return { id: "fixture-history" }; },
    commandSnippetMarkUsed: async (id) => { marks.push(id); return { id }; },
    loadCommandLibrary: async () => {}, isCommandLibraryCommandMissingError: () => false,
    commandLibraryRestartMessage: () => "fixture", upsertCommandSnippet: (items) => items,
    ...Object.fromEntries(["setMultiExecMode", "setCommandSenderDeliveryByKey", "setMultiExecTargets", "setCommandSenderLastSentLabel", "clearCommandSenderInput", "setSelectedCommandHistoryId", "setCommandSnippets", "setCommandLibraryError", "setCommandLibraryUnavailableReason"].map((key) => [key, noop])),
  };
  vm.createContext(context); vm.runInContext(ts.transpile(handler.getText(tree) + "\nglobalThis.send = sendCommandTextToTargets;", { target: ts.ScriptTarget.ES2022 }), context);
  return { send: context.send, recorder, live, writes, history, marks };
}
test("successful explicit source write enters macro with exact text, preserving ordinary history", async () => {
  const h = harness(); await h.send(" pwd ", true, null);
  assert.equal(h.recorder.getSnapshot().steps[0].command, " pwd "); assert.equal(h.writes[0].data, " pwd \r"); assert.equal(h.history[0].command, "pwd");
});
test("confirmed source input enters the draft without waiting for other broadcast recipients", async () => {
  let finish;
  const h = harness((id) => id === b.sessionId ? new Promise((resolve) => { finish = resolve; }) : Promise.resolve());
  const send = h.send("pwd", true, null, [a, b]); await new Promise(setImmediate);
  assert.equal(h.recorder.getSnapshot().steps.length, 1); h.recorder.stop(); finish(); await send;
  assert.equal(h.recorder.getSnapshot().steps.length, 1);
});
test("other selected source does not enter the recording", async () => {
  const h = harness(); await h.send("pwd", true, null, [b]); assert.equal(h.recorder.getSnapshot().steps.length, 0);
});
test("sensitive submission pauses before IPC completion, omits history and preserves explicit snippet use counts", async () => {
  let finish; const h = harness(() => new Promise((resolve) => { finish = resolve; }));
  const send = h.send("export TOKEN=synthetic-secret-marker", true, "fixture-snippet");
  assert.equal(h.recorder.getSnapshot().recording, false); assert.equal(h.recorder.begin("synthetic-secret-marker", true, [a.key]), null);
  finish(); await send; const snapshot = h.recorder.getSnapshot();
  assert.equal(snapshot.steps[0].command, ""); assert.equal(snapshot.steps[0].masked, true);
  assert.equal(h.history.length, 0); assert.deepEqual(h.marks, ["fixture-snippet"]); assert.ok(!JSON.stringify(snapshot).includes("synthetic-secret-marker"));
});
test("late success after stop and restart cannot enter the new source recording", async () => {
  let finish; const h = harness(() => new Promise((resolve) => { finish = resolve; })); const send = h.send("pwd", true, null);
  h.recorder.stop(); h.recorder.start(b); finish(); await send; assert.equal(h.recorder.getSnapshot().steps.length, 0);
});
test("a queued target cannot transfer input or capture to a reconnected session", async () => {
  let finish; const h = harness((id) => id === b.sessionId ? new Promise((resolve) => { finish = resolve; }) : Promise.resolve());
  const send = h.send("pwd", true, null, [b, a]); h.live.set(a.key, { ...a, sessionId: "replacement-session" }); finish(); await send;
  assert.deepEqual(h.writes.map((write) => write.id), [b.sessionId]); assert.equal(h.recorder.getSnapshot().steps.length, 0); assert.equal(h.recorder.getSnapshot().reason, "disconnected");
});
test("failed source writes do not enter macro or automatic history", async () => {
  const h = harness(async () => { throw new Error("synthetic-error-marker"); }); await h.send("pwd", true, null);
  assert.equal(h.recorder.getSnapshot().reason, "failed"); assert.equal(h.recorder.getSnapshot().steps.length, 0); assert.equal(h.history.length, 0);
});
test("authentication replies remain excluded from automatic history across pause and late completion", async () => {
  const h = harness(); await h.send("sudo id", true, null);
  h.history.length = 0; await h.send("synthetic-auth-answer", true, null);
  assert.equal(h.history.length, 0); assert.ok(!JSON.stringify(h.recorder.getSnapshot()).includes("synthetic-auth-answer"));
});
test("clearing a recording cannot publish an authentication reply that was already pending", async () => {
  let finish; let waiting = false;
  const h = harness(() => waiting ? new Promise((resolve) => { finish = resolve; }) : Promise.resolve());
  await h.send("sudo id", true, null); h.history.length = 0;
  waiting = true; const send = h.send("synthetic-auth-answer", true, null); h.recorder.clear(); finish(); await send;
  assert.equal(h.history.length, 0); assert.equal(h.recorder.getSnapshot().source, null);
});
function terminalHarness(initialAllowed) {
  let allowed = initialAllowed, finish;
  const history = [], writes = [];
  const context = {
    sessionIdRef: { current: "fixture-a" }, inputDirectoryStateRef: { current: {} }, inputHistoryStateRef: { current: { buffer: "old fragment", dirty: false } },
    applyTerminalInputDirectoryData: (state) => ({ state }), onCurrentDirectoryChange: undefined,
    tabId: "a", canRecordTerminalInputHistoryRef: { current: () => allowed }, onUserInputRef: { current: () => {} },
    onTerminalInputCommandRef: { current: (_id, command) => history.push(command) }, isSensitiveCommand,
    terminalWrite: (_id, data) => { writes.push(data); return new Promise((resolve) => { finish = resolve; }); },
    terminal: { writeln() {} }, currentT: () => "fixture", formatError: () => "fixture",
  };
  vm.createContext(context); vm.runInContext(ts.transpile(historyHelpers + "\nglobalThis.onData = " + onDataNode.getText(terminalTree), { target: ts.ScriptTarget.ES2022 }), context);
  return { input: context.onData, history, writes, state: context.inputHistoryStateRef, setAllowed: (value) => { allowed = value; }, finish: async () => { finish(); await new Promise(setImmediate); } };
}
test("protected terminal input still reaches native I/O but never fills history buffer, even if the draft is later cleared", async () => {
  const h = terminalHarness(false); h.input("synthetic-auth-answer\r"); h.setAllowed(true); await h.finish();
  assert.deepEqual(h.writes, ["synthetic-auth-answer\r"]); assert.deepEqual(h.history, []); assert.equal(h.state.current.buffer, "");
});
test("new privacy pause suppresses a late terminal history callback without dropping terminal input", async () => {
  const h = terminalHarness(true); h.state.current.buffer = ""; h.input("pwd\r"); h.setAllowed(false); await h.finish();
  assert.deepEqual(h.writes, ["pwd\r"]); assert.deepEqual(h.history, []);
});
