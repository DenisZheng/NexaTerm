import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// 执行真实 shell 函数，替换 I/O；不复制异步目标选择实现。
const source = readFileSync(new URL("../src/features/layout/WorkspaceShell.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("WorkspaceShell.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const shell = tree.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "WorkspaceShell");
function runtime(names, stubs) {
  const functions = names.map((name) => {
    const node = shell.body.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert.ok(node, `Missing shell function ${name}`);
    return node.getText(tree);
  });
  const compiled = ts.transpile(functions.join("\n") + `\nglobalThis.functions = { ${names.join(",")} };`, { target: ts.ScriptTarget.ES2022 });
  const context = vm.createContext(stubs);
  vm.runInContext(compiled, context);
  return context.functions;
}

for (const directory of [false, true]) {
  test(`file picker pins the original pane before focus changes (directory=${directory})`, async () => {
    let resolvePicker;
    const picker = new Promise((resolve) => { resolvePicker = resolve; });
    const target = { connection: { id: "same-profile" }, ownerInstanceId: "ssh:a" };
    let activeTarget = target;
    const calls = [];
    const run = (...args) => calls.push(args);
    const name = directory ? "uploadRemoteDirectory" : "uploadRemoteFile";
    const api = runtime([name], {
      captureTransferOptions: () => activeTarget, hasTauriRuntime: () => true,
      selectLocalUploadFiles: () => picker, selectLocalUploadDirectories: () => picker,
      runLocalFileUpload: run, runLocalDirectoryUpload: run, showTransferPickerError: assert.fail,
    });
    api[name]("/original");
    activeTarget = { connection: { id: "other-profile" }, ownerInstanceId: "ssh:b" };
    resolvePicker(["/fixture/local"]);
    await picker; await Promise.resolve();
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "/original");
    assert.equal(calls[0][2], target);
  });
}

test("native metadata completion keeps the captured owner", async () => {
  let resolveMetadata;
  const metadata = new Promise((resolve) => { resolveMetadata = resolve; });
  const target = { connection: { id: "profile-a" }, ownerInstanceId: "ssh:a" };
  const calls = [];
  const api = runtime(["uploadNativeDroppedPath"], {
    localPathMetadata: () => metadata,
    runLocalDirectoryUpload: (...args) => calls.push(args), runLocalFileUpload: assert.fail, showTransferPickerError: assert.fail,
  });
  const pending = api.uploadNativeDroppedPath("/original", "/fixture/local", target);
  resolveMetadata({ kind: "directory", path: "/fixture/local" });
  await pending;
  assert.equal(calls[0][2], target);
});

test("batch downloads keep their initial owner across an asynchronous boundary", async () => {
  const calls = [], target = { connection: { id: "profile-a" }, ownerInstanceId: "ssh:a" };
  const api = runtime(["runRemoteFileDownloadQueue"], {
    runRemoteFileDownload: async (...args) => { calls.push(args); await Promise.resolve(); },
  });
  await api.runRemoteFileDownloadQueue([{ name: "one" }, { name: "two" }], target);
  assert.equal(calls.length, 2);
  assert.equal(calls[0][1], target);
  assert.equal(calls[1][1], target);
});

test("remote-to-local drop rejects a closed owner and pins an open source", () => {
  let open = false;
  const source = { connectionId: "same", ownerInstanceId: "ssh:a", entry: { name: "file", path: "/file", type: "file" } };
  const connection = { id: "same" }, calls = [];
  const api = runtime(["downloadRemoteFileToDirectory"], {
    connectionForTransfer: () => connection, canStartOwnedTransfer: () => open,
    runRemoteFileDownload: (...args) => calls.push(args),
  });
  api.downloadRemoteFileToDirectory(source, "/local");
  assert.equal(calls.length, 0);
  open = true;
  api.downloadRemoteFileToDirectory(source, "/local");
  assert.equal(calls[0][0], source.entry);
  assert.equal(calls[0][1].ownerInstanceId, "ssh:a");
  assert.equal(calls[0][1].downloadRoot, "/local");
});

test("queued upload uses the saved connection after a temporary owner is rebound", async () => {
  let row, task;
  const connections = new Map([["temp:fixture", { id: "temp:fixture" }], ["saved", { id: "saved" }]]);
  const calls = [];
  const api = runtime(["runLocalFileUpload", "connectionForQueuedTransfer"], {
    captureTransferOptions: () => ({ connection: connections.get("temp:fixture") }),
    transferOwnerForRun: () => "ssh:a", connectionForTransferOwner: (connection) => connection,
    canStartOwnedTransfer: () => true, normalizeRemotePath: (path) => path,
    localPathName: () => "file", joinRemotePath: (parent, name) => `${parent}/${name}`, tr: (key) => key,
    addRemoteFileTransfer: (input) => { row = { ...input, id: "transfer" }; return row.id; },
    enqueueRemoteFileTransfer: (_id, run) => { task = run; },
    getRemoteFileTransfer: () => row, connectionForTransfer: (id) => connections.get(id),
    updateRemoteFileTransfer: (_id, input) => Object.assign(row, input),
    isTransferNoLongerActive: () => false, setTransferProgress: () => {},
    remoteFileUploadLocalFile: async (input) => { calls.push(input); return { path: "/file" }; },
    finishUploadTransfer: () => {}, failTransfer: assert.fail, markTransferCanceled: assert.fail,
  });
  await api.runLocalFileUpload("/original", "/fixture/local", { conflictPolicy: "rename" });
  row.connectionId = "saved";
  await task();
  assert.equal(calls[0].connectionId, "saved");
  assert.equal(row.retry.connectionId, "saved");
  assert.equal(row.ownerInstanceId, "ssh:a");
});
