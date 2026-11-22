import { describe, expect, it } from "vitest";
import { canSaveRemoteFileEditor, changeRemoteFileEditorContent, completeRemoteFileEditorSave, createRemoteFileEditorOperations, previewRemoteFileEditorSave, remoteFileEditorIsReadOnly } from "./remoteFileEditorState";
import type { RemoteFileEditorTab } from "./remoteFileEditorTypes";

const tab = (): RemoteFileEditorTab => ({ id: "file:fixture:/file", connectionId: "fixture", connectionName: "Fixture",
  name: "file", path: "/file", content: "draft", savedContent: "original", dirty: true, error: null,
  metadata: null, saveState: "dirty", statusMessage: "modified" });
const metadata = { name: "file", path: "/file", mtime: 1, size: 5 };

describe("remote editor state", () => {
  it("protects unread/failed files while allowing edits during a verified save", () => {
    expect(remoteFileEditorIsReadOnly(tab())).toBe(true);
    expect(remoteFileEditorIsReadOnly({ ...tab(), metadata, saveState: "loading" })).toBe(true);
    expect(remoteFileEditorIsReadOnly({ ...tab(), metadata: null, saveState: "error" })).toBe(true);
    expect(remoteFileEditorIsReadOnly({ ...tab(), metadata, saveState: "saving" })).toBe(false);
    expect(remoteFileEditorIsReadOnly({ ...tab(), metadata, saveState: "conflict" })).toBe(false);
  });
  it("uses UTF-8 byte size for browser preview metadata", () => {
    expect(previewRemoteFileEditorSave(metadata, "中文", 2)).toEqual({ conflict: false, metadata: { ...metadata, mtime: 2, size: 6 } });
  });
  it("requires editable metadata and rejects loading/saving tabs", () => {
    expect(canSaveRemoteFileEditor(undefined)).toBe(false);
    expect(canSaveRemoteFileEditor(tab())).toBe(false);
    expect(canSaveRemoteFileEditor({ ...tab(), metadata })).toBe(true);
    expect(canSaveRemoteFileEditor({ ...tab(), metadata, saveState: "saving" })).toBe(false);
    expect(canSaveRemoteFileEditor({ ...tab(), metadata, saveState: "loading" })).toBe(false);
    expect(canSaveRemoteFileEditor({ ...tab(), metadata, dirty: false })).toBe(false);
    expect(canSaveRemoteFileEditor({ ...tab(), metadata, dirty: false }, true)).toBe(true);
  });
  it("keeps the save lock and dirty close behavior when content changes in flight", () => {
    const saving = { ...tab(), saveState: "saving" as const, statusMessage: "saving" };
    const result = changeRemoteFileEditorContent(saving, "later", "ready", "modified");
    expect(result).toMatchObject({ content: "later", dirty: true, saveState: "saving", statusMessage: "saving" });
    expect(changeRemoteFileEditorContent(result, "later", "ready", "modified")).toBe(result);
  });
  it("marks only acknowledged content saved and preserves newer content", () => {
    const latest = { ...tab(), content: "later" };
    const result = completeRemoteFileEditorSave(latest, "draft", metadata, "saved", "modified");
    expect(result).toMatchObject({ content: "later", savedContent: "draft", dirty: true, saveState: "dirty" });
    expect(latest.savedContent).toBe("original");
  });
  it("undoing to the old saved text during a write still requires close confirmation", () => {
    const saving = { ...tab(), saveState: "saving" as const };
    const result = changeRemoteFileEditorContent(saving, "original", "ready", "modified");
    expect(result.dirty).toBe(true);
    expect(completeRemoteFileEditorSave(result, "draft", metadata, "saved", "modified").dirty).toBe(true);
  });
  it("is clean when the current buffer matches the acknowledged content", () => {
    const result = completeRemoteFileEditorSave(tab(), "draft", metadata, "saved", "modified");
    expect(result).toMatchObject({ dirty: false, saveState: "saved", savedContent: "draft" });
  });
  it("preserves conflict status while editing until explicit conflict resolution", () => {
    const result = changeRemoteFileEditorContent({ ...tab(), saveState: "conflict", error: "remote changed" }, "later", "ready", "modified");
    expect(result).toMatchObject({ saveState: "conflict", error: "remote changed", content: "later" });
  });
});

describe("remote editor operation scope", () => {
  it("serializes saves per tab while allowing a separate file", () => {
    const ops = createRemoteFileEditorOperations(), first = ops.begin("a", "save")!;
    expect(ops.begin("a", "save")).toBeNull();
    expect(ops.begin("a", "read")).toBeNull();
    expect(ops.begin("b", "save")).not.toBeNull();
    ops.finish(first);
    expect(ops.begin("a", "save")).not.toBeNull();
  });
  it("a superseded read cannot apply or release the newer operation", () => {
    const ops = createRemoteFileEditorOperations(), old = ops.begin("a", "read")!, latest = ops.begin("a", "read")!;
    expect(ops.isCurrent(old)).toBe(false);
    ops.finish(old);
    expect(ops.isCurrent(latest)).toBe(true);
    expect(ops.begin("a", "save")).toBeNull();
  });
  it("closing/reopening the same key does not reuse a token", () => {
    const ops = createRemoteFileEditorOperations(), old = ops.begin("a", "save")!;
    ops.invalidate("a");
    const latest = ops.begin("a", "read")!;
    expect(ops.isCurrent(old)).toBe(false);
    expect(ops.isCurrent(latest)).toBe(true);
  });
  it("invalidates late callbacks on disposal and supports StrictMode activation", () => {
    const ops = createRemoteFileEditorOperations(), old = ops.begin("a", "save")!;
    ops.dispose();
    expect(ops.isCurrent(old)).toBe(false);
    expect(ops.begin("a", "save")).toBeNull();
    ops.activate();
    const latest = ops.begin("a", "save")!;
    ops.finish(old);
    expect(ops.isCurrent(latest)).toBe(true);
  });
});
