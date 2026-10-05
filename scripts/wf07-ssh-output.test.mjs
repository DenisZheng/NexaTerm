import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// 执行 shell 当前的真实连接接线，防止仅测试 ID 工具却漏掉调用方回退到时间戳。
const source = readFileSync(new URL("../src/features/layout/WorkspaceShell.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("WorkspaceShell.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = [];
function collect(node) {
  if (ts.isFunctionDeclaration(node) && ["startConnectionStep", "runConnectionStep"].includes(node.name?.text)) {
    functions.push(node.getText(tree));
  }
  ts.forEachChild(node, collect);
}
collect(tree);
assert.equal(functions.length, 2);
const compiled = ts.transpileModule(functions.join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function runtime() {
  const tabs = { current: [{ id: "restored-a", ordinal: 0 }, { id: "restored-b", ordinal: 0 }] };
  const listeners = [];
  const connections = [];
  const handoffs = [];
  const context = {
    Date: { now: () => 1000 }, crypto: { randomUUID }, window: { setTimeout: () => 0 },
    terminalTabsRef: tabs,
    isRdpConnection: () => false, isVncConnection: () => false,
    formatConnectionAddress: () => "example.invalid:22",
    buildConnectingTab: (_tabs, connection, step) => ({
      connectionId: connection.id, id: String(step.id), ordinal: 0, type: "connecting", connectionStep: step,
    }),
    setTerminalTabs: (update) => { tabs.current = update(tabs.current); },
    updateConnectingTabStep: () => {}, hasTauriRuntime: () => true,
    listenTerminalOutput: async (callback) => { listeners.push(callback); return () => {}; },
    setTerminalWarmupCaptureStop: () => {}, buildRuntimeCredentialRequest: () => ({}),
    terminalConnect: (request) => new Promise((resolve) => connections.push({ request, resolve })),
    connectingTabExists: () => true, refreshConnectedProfile: async () => {},
    replaceConnectingTabWithTerminal: (tabId, sessionId, output) => { handoffs.push({ tabId, sessionId, output }); },
    stopTerminalWarmupCapture: () => {}, appendTerminalWarmupOutput: () => {},
  };
  const actions = vm.runInNewContext(`${compiled}\n({ startConnectionStep, runConnectionStep })`, context);
  return { ...actions, connections, handoffs, listeners };
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
