import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// 执行真实连接接线与关闭判定，覆盖输出隔离及迟到会话回收。
const source = readFileSync(new URL("../src/features/layout/WorkspaceShell.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("WorkspaceShell.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = [];
function collect(node) {
  if (ts.isFunctionDeclaration(node) && ["startConnectionStep", "runConnectionStep", "connectingTabExists"].includes(node.name?.text)) {
    functions.push(node.getText(tree));
  }
  ts.forEachChild(node, collect);
}
collect(tree);
assert.equal(functions.length, 3);
const compiled = ts.transpileModule(functions.join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function runtime() {
  const tabs = { current: [{ id: "restored-a", ordinal: 0 }, { id: "restored-b", ordinal: 0 }] };
  const listeners = [];
  const connections = [];
  const handoffs = [];
  const closed = [];
  const refreshed = [];
  const context = {
    Date: { now: () => 1000 }, crypto: { randomUUID }, window: { setTimeout: () => 0 },
    tr: (key) => key,
    terminalTabsRef: tabs,
    isRdpConnection: () => false, isVncConnection: () => false,
    formatConnectionAddress: () => "example.invalid:22",
    credentialPromptTargetFromConnection: (connection) => ({ connectionId: connection.id, authKind: "password" }),
    buildConnectingTab: (_tabs, connection, step) => ({
      connectionId: connection.id, id: String(step.id), ordinal: 0, type: "connecting", connectionStep: step,
    }),
    setTerminalTabs: (update) => { tabs.current = update(tabs.current); },
    updateConnectingTabStep: () => {}, hasTauriRuntime: () => true,
    listenTerminalOutput: async (callback) => { listeners.push(callback); return () => {}; },
    setTerminalWarmupCaptureStop: () => {}, buildRuntimeCredentialRequest: () => ({}),
    terminalConnect: (request) => new Promise((resolve) => connections.push({ request, resolve })),
    terminalClose: async (sessionId) => { closed.push(sessionId); },
    refreshConnectedProfile: async (profileId) => { refreshed.push(profileId); },
    replaceConnectingTabWithTerminal: (tabId, sessionId, output) => { handoffs.push({ tabId, sessionId, output }); },
    stopTerminalWarmupCapture: () => {}, appendTerminalWarmupOutput: () => {},
  };
  const actions = vm.runInNewContext(`${compiled}\n({ startConnectionStep, runConnectionStep })`, context);
  return { ...actions, connections, handoffs, listeners, closed, refreshed,
    closeTab: (tabId) => { tabs.current = tabs.current.filter((tab) => tab.id !== tabId); },
    hasTab: (tabId) => tabs.current.some((tab) => tab.id === tabId) };
}

test("WF-07 同毫秒恢复的 SSH 实例不能收到彼此的启动输出", async () => {
  const run = runtime();
  run.startConnectionStep({ id: "profile-a", credential_mode: "inline" }, "terminal", false, "restored-a");
  run.startConnectionStep({ id: "profile-b", credential_mode: "inline" }, "terminal", false, "restored-b");
  await new Promise(setImmediate);
  assert.equal(run.connections.length, 2);
  assert.notEqual(run.connections[0].request.request_id, run.connections[1].request.request_id);
  for (const listener of run.listeners) {
    listener({ request_id: run.connections[0].request.request_id, session_id: "runtime-a", data: [65] });
  }
  run.connections[0].resolve("runtime-a");
  run.connections[1].resolve("runtime-b");
  await new Promise(setImmediate);
  assert.deepEqual(Array.from(run.handoffs.find((item) => item.tabId === "restored-a").output), [65]);
  assert.deepEqual(Array.from(run.handoffs.find((item) => item.tabId === "restored-b").output), []);
});

test("WF-07 同一逻辑 tab 重试仍分配独立 attempt 输出通道", async () => {
  const run = runtime();
  const tab = run.startConnectionStep({ id: "profile-a", credential_mode: "inline" }, "terminal", false, "restored-a");
  await new Promise(setImmediate);
  run.connections[0].resolve("runtime-first");
  await new Promise(setImmediate);
  const retry = run.runConnectionStep(tab.id, tab.connectionStep);
  await new Promise(setImmediate);
  assert.notEqual(run.connections[0].request.request_id, run.connections[1].request.request_id);
  run.connections[1].resolve("runtime-retry");
  await retry;
  assert.deepEqual(run.handoffs.map((item) => item.tabId), ["restored-a", "restored-a"]);
});

test("A01 关闭连接中标签后，迟到SSH会话必须回收而不是恢复标签", async () => {
  const run = runtime();
  const tab = run.startConnectionStep({ id: "profile-a", credential_mode: "prompt" }, "terminal", false, "restored-a");
  const pending = run.runConnectionStep(tab.id, tab.connectionStep);
  await new Promise(setImmediate);
  assert.equal(run.connections.length, 1);
  run.closeTab(tab.id);
  run.connections[0].resolve("late-runtime-a");
  await pending;
  assert.deepEqual(run.closed, ["late-runtime-a"]);
  assert.deepEqual(run.handoffs, []);
  assert.deepEqual(run.refreshed, []);
  assert.equal(run.hasTab(tab.id), false);
});

test("A01 同配置并行连接关闭一个，只回收其迟到会话并保留另一实例", async () => {
  const run = runtime();
  const profile = { id: "same-profile", credential_mode: "prompt" };
  const a = run.startConnectionStep(profile, "terminal", false, "restored-a");
  const b = run.startConnectionStep(profile, "terminal", false, "restored-b");
  const first = run.runConnectionStep(a.id, a.connectionStep);
  const second = run.runConnectionStep(b.id, b.connectionStep);
  await new Promise(setImmediate);
  assert.equal(run.connections.length, 2);
  run.closeTab(a.id);
  run.connections[0].resolve("late-runtime-a");
  run.connections[1].resolve("live-runtime-b");
  await Promise.all([first, second]);
  assert.deepEqual(run.closed, ["late-runtime-a"]);
  assert.deepEqual(run.handoffs.map((item) => [item.tabId, item.sessionId]), [["restored-b", "live-runtime-b"]]);
  assert.deepEqual(run.refreshed, ["same-profile"]);
  assert.equal(run.hasTab(a.id), false);
  assert.equal(run.hasTab(b.id), true);
});
