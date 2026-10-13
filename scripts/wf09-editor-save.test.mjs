import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/features/layout/WorkspaceShell.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("WorkspaceShell.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const shell = tree.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "WorkspaceShell");
const names = ["updateRemoteFileTab", "handleRemoteFileChange", "saveRemoteFile", "loadRemoteFileTab", "reloadRemoteFile", "discardRemoteFileChanges", "closeRemoteFileTab", "closeRemoteFileTabs", "sessionRef", "snapshotFromRefs"];
const functions = names.map((name) => shell.body.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(tree));
const require = createRequire(import.meta.url);
const helpersUrl = new URL("../src/features/editor/remoteFileEditorState.ts", import.meta.url);
let helpers = {};
if (existsSync(helpersUrl)) {
  const compiled = ts.transpile(readFileSync(helpersUrl, "utf8"), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS });
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, require });
  helpers = module.exports;
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const initialTab = () => ({
  id: "file:a:/file.conf", connectionId: "a", connectionName: "Fixture", path: "/file.conf", name: "file.conf",
  content: "submitted", savedContent: "original", dirty: true, saveState: "dirty", error: null,
  metadata: { path: "/file.conf", name: "file.conf", mtime: 1, size: 8 }, statusMessage: "modified",
});

function harness() {
  const io = deferred(), reads = [], writes = [], conflicts = [], refreshes = [], closes = [];
  const remoteFileTabsRef = { current: [initialTab()] };
  const remoteFileEditorOperations = helpers.createRemoteFileEditorOperations?.();
  const context = {
    ...helpers, remoteFileTabsRef, remoteFileEditorOperations,
    localTerminalTabsRef: { current: [] }, terminalTabsRef: { current: [] },
    rdpSessionsRef: { current: [] }, vncSessionsRef: { current: [] },
    hasTauriRuntime: () => true, tr: (key) => key, formatError: (error) => error.message || error.code || String(error),
    remoteFileWrite: (input) => { writes.push(input); return io.promise; },
    remoteFileRead: (...args) => { const job = deferred(); reads.push({ args, job }); return job.promise; },
    setRemoteFileTabs: (value) => {
      const next = typeof value === "function" ? value(remoteFileTabsRef.current) : value;
      for (const tab of remoteFileTabsRef.current) {
        if (!next.some((item) => item.id === tab.id)) remoteFileEditorOperations?.invalidate(tab.id);
      }
      remoteFileTabsRef.current = next;
    },
    triggerRemoteFileRefresh: (...args) => refreshes.push(args),
    remotePathParent: () => "/",
    isRemoteFileConflict: (error) => error.code === "remote_file_conflict",
    setPendingRemoteFileConflictId: (id) => conflicts.push(id),
    setPendingRemoteFileCloseId: (id) => closes.push(id),
    closeRemoteFileTabNow: () => assert.fail("dirty file must require confirmation"),
    closeRemoteFileTabsNow: () => assert.fail("dirty files must not be closed through a stale clean-tab list"),
    connectionById: new Map([["a", { id: "a" }]]),
  };
  Object.defineProperty(context, "remoteFileTabs", { configurable: true, get: () => remoteFileTabsRef.current });
  vm.createContext(context);
  vm.runInContext(ts.transpile(functions.join("\n") + `\nglobalThis.api = { ${names.join(",")} };`, { target: ts.ScriptTarget.ES2022 }), context);
  return { ...context.api, context, io, reads, writes, conflicts, refreshes, closes, tab: () => remoteFileTabsRef.current[0] };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("save completion acknowledges only the submitted text and preserves newer edits", async () => {
  const h = harness(), id = h.tab().id;
  h.saveRemoteFile(id);
  h.handleRemoteFileChange(id, "edited while saving");
  h.io.resolve({ metadata: { ...h.tab().metadata, mtime: 2, size: 9 } });
  await flush();
  assert.equal(h.writes[0].content, "submitted");
  assert.equal(h.tab().savedContent, "submitted");
  assert.equal(h.tab().content, "edited while saving");
  assert.equal(h.tab().dirty, true);
  assert.equal(h.tab().saveState, "dirty");
});

test("editing during save does not unlock a second write", async () => {
  const h = harness(), id = h.tab().id;
  h.saveRemoteFile(id);
  h.handleRemoteFileChange(id, "new edit");
  h.saveRemoteFile(id);
  await flush();
  assert.equal(h.writes.length, 1);
  h.io.resolve({ metadata: h.tab().metadata }); await flush();
});

test("save failure preserves unsaved text and the prior saved version", async () => {
  const h = harness(), id = h.tab().id;
  h.saveRemoteFile(id);
  h.handleRemoteFileChange(id, "new edit");
  h.io.reject(new Error("fixture failure")); await flush();
  assert.equal(h.tab().content, "new edit");
  assert.equal(h.tab().savedContent, "original");
  assert.equal(h.tab().dirty, true);
  assert.equal(h.tab().saveState, "error");
});

test("a late conflict after close/reopen cannot update the new tab or open a dialog", async () => {
  const h = harness(), id = h.tab().id;
  h.saveRemoteFile(id);
  await flush();
  h.context.setRemoteFileTabs([]);
  h.context.setRemoteFileTabs([{ ...initialTab(), content: "reopened", savedContent: "reopened", dirty: false, saveState: "ready" }]);
  h.io.reject({ code: "remote_file_conflict", message: "old conflict" }); await flush();
  assert.equal(h.tab().saveState, "ready");
  assert.equal(h.conflicts.length, 0);
});

test("reload and discard do not race an active save", async () => {
  const h = harness(), id = h.tab().id;
  h.saveRemoteFile(id);
  h.reloadRemoteFile(id);
  h.discardRemoteFileChanges(id);
  assert.equal(h.reads.length, 0);
  assert.equal(h.tab().content, "submitted");
  h.io.resolve({ metadata: h.tab().metadata }); await flush();
});

test("an older read response cannot replace a newer read", async () => {
  const h = harness(), id = h.tab().id;
  const first = h.loadRemoteFileTab({ id: "a" }, "/file.conf", id);
  const second = h.loadRemoteFileTab({ id: "a" }, "/file.conf", id);
  const result = (content) => ({ content, metadata: h.tab().metadata, path: "/file.conf", name: "file.conf" });
  h.reads[1].job.resolve(result("new read")); await second;
  h.reads[0].job.resolve(result("old read")); await first;
  assert.equal(h.tab().content, "new read");
});

test("a synchronous write exception reports failure and releases the save lock", async () => {
  const h = harness(), id = h.tab().id;
  h.context.remoteFileWrite = () => { throw new Error("fixture synchronous failure"); };
  assert.doesNotThrow(() => h.saveRemoteFile(id));
  await flush();
  assert.equal(h.tab().saveState, "error");
  assert.equal(h.context.remoteFileEditorOperations.has(id), false);
  assert.equal(h.tab().content, "submitted");
});

test("undo during an in-flight write retains the existing dirty-close confirmation", async () => {
  const h = harness(), id = h.tab().id;
  h.saveRemoteFile(id); await flush();
  h.handleRemoteFileChange(id, "original");
  h.closeRemoteFileTab(id);
  assert.deepEqual(h.closes, [id]);
  h.io.resolve({ metadata: h.tab().metadata }); await flush();
  assert.equal(h.tab().dirty, true);
  assert.equal(h.tab().savedContent, "submitted");
});

test("a failed read preserves the buffer and prevents saving against stale metadata", async () => {
  const h = harness(), id = h.tab().id;
  const read = h.loadRemoteFileTab({ id: "a" }, "/file.conf", id);
  h.reads[0].job.reject({ code: "remote_file_binary", message: "fixture binary" });
  await read;
  assert.equal(h.tab().content, "submitted");
  assert.equal(h.tab().dirty, true);
  assert.equal(h.tab().metadata, null);
  h.saveRemoteFile(id); await flush();
  assert.equal(h.writes.length, 0);
});

test("edits made after reload started are preserved when the read completes", async () => {
  const h = harness(), id = h.tab().id;
  h.reloadRemoteFile(id);
  h.handleRemoteFileChange(id, "edit after reload");
  h.reads[0].job.resolve({ content: "remote", metadata: h.tab().metadata, name: "file.conf", path: "/file.conf" });
  await flush();
  assert.equal(h.tab().content, "edit after reload");
  assert.equal(h.tab().savedContent, "remote");
  assert.equal(h.tab().dirty, true);
});

test("bulk close uses current dirty state even when the render snapshot was clean", () => {
  const h = harness(), id = h.tab().id;
  const staleRender = [{ ...h.tab(), dirty: false }];
  Object.defineProperty(h.context, "remoteFileTabs", { get: () => staleRender });
  h.closeRemoteFileTabs([id]);
  assert.deepEqual(h.closes, [id]);
});

test("close snapshots include same-event editor updates rather than stale render collections", () => {
  const h = harness(), id = h.tab().id;
  Object.defineProperty(h.context, "remoteFileTabs", { get: () => [] });
  const snapshot = h.snapshotFromRefs();
  assert.equal(snapshot.remoteFileTabs.length, 1);
  assert.equal(snapshot.remoteFileTabs[0].id, id);
  h.context.setRemoteFileTabs([]);
  assert.equal(h.snapshotFromRefs().remoteFileTabs.length, 0);
});
