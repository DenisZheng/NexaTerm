// @vitest-environment jsdom
import { StrictMode, useState, type ReactNode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { remoteFileSaveAs } from "../../shared/tauri/commands";
import { useSessionTabsController } from "../workspace/sessionTabs/useSessionTabsController";
import type { RemoteFileTextAction } from "../files/remoteFileTextActions";
import { changeRemoteFileEditorContent } from "./remoteFileEditorState";
import type { RemoteFileEditorTab } from "./remoteFileEditorTypes";
import { useRemoteFileSaveAs } from "./useRemoteFileSaveAs";

vi.mock("../../shared/tauri/commands", () => ({ remoteFileSaveAs: vi.fn() }));
vi.mock("../../shared/tauri/runtime", () => ({ hasTauriRuntime: () => true }));
const metadata = { path: "/dir/copy.txt", name: "copy.txt", mtime: 2, size: 5 };
const file = (): RemoteFileEditorTab => ({ id: "file:a:/dir/original.txt", connectionId: "a", connectionName: "Fixture", name: "original.txt", path: "/dir/original.txt", content: "draft", savedContent: "old", dirty: true, saveState: "dirty", error: null, statusMessage: "modified", metadata: { ...metadata, path: "/dir/original.txt", name: "original.txt", mtime: 1, size: 3 } });
function deferred() {
  let resolve!: (result: { metadata: typeof metadata; conflict: boolean }) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<{ metadata: typeof metadata; conflict: boolean }>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup(strict = false) {
  const refresh = vi.fn();
  const hook = renderHook(() => {
    const tabs = useSessionTabsController({ defaultRemoteFileOpenMode: "split" });
    const [action, setAction] = useState<RemoteFileTextAction | null>(null);
    const [value, setValue] = useState("");
    const [error, setError] = useState<string | null>(null);
    const saveAs = useRemoteFileSaveAs({ action, tabs: tabs.remoteFileTabs, tabsRef: tabs.remoteFileTabsRef, operations: tabs.remoteFileEditorOperations, setTabs: tabs.setRemoteFileTabs, setAction, setValue, setError, formatError: (err) => String((err as Error).message), refresh, onRetarget: (connectionId, oldId, newId) => tabs.dispatchTabs({ type: "tabs/retargetFile", connectionId, oldId, newId }) });
    return { tabs, saveAs, action, value, error };
  }, strict ? { wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode> } : undefined);
  act(() => {
    hook.result.current.tabs.setRemoteFileTabs([file()]);
    hook.result.current.tabs.dispatchTabs({ type: "tabs/activateFile", connectionId: "a", fileTabId: file().id, rememberUnified: true, terminalTabId: null });
  });
  const request = () => act(() => hook.result.current.saveAs.request(file().id));
  const submit = (name = "copy.txt") => {
    const { action, saveAs } = hook.result.current;
    if (action?.action !== "save-as") throw new Error("expected save-as dialog");
    let job!: Promise<void>;
    act(() => { job = saveAs.submit(action, name); });
    return job;
  };
  const tab = () => hook.result.current.tabs.remoteFileTabsRef.current[0];
  return { ...hook, request, submit, tab, refresh };
}
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("Save As through the actual controller", () => {
  it("cancels without I/O and releases the source lock, including StrictMode", () => {
    const h = setup(true); h.request();
    expect(h.result.current.value).toBe("original.txt");
    expect(h.result.current.tabs.remoteFileEditorOperations.has(file().id, "save")).toBe(true);
    act(() => h.result.current.saveAs.cancel());
    expect(h.result.current.action).toBeNull();
    expect(h.result.current.tabs.remoteFileEditorOperations.has(file().id)).toBe(false);
    expect(remoteFileSaveAs).not.toHaveBeenCalled();
    expect(h.tab()).toEqual(file());
  });
  it("allows a clean verified file but blocks missing metadata, reads and simultaneous dialogs", () => {
    const h = setup();
    for (const blocked of [{ ...file(), metadata: null }, { ...file(), saveState: "loading" as const }]) {
      act(() => h.result.current.tabs.setRemoteFileTabs([blocked])); h.request();
      expect(h.result.current.action).toBeNull();
    }
    act(() => h.result.current.tabs.setRemoteFileTabs([{ ...file(), dirty: false, content: "old", saveState: "ready" }]));
    const read = h.result.current.tabs.remoteFileEditorOperations.begin(file().id, "read")!;
    h.request(); expect(h.result.current.action).toBeNull();
    h.result.current.tabs.remoteFileEditorOperations.finish(read);
    act(() => { h.result.current.saveAs.request(file().id); h.result.current.saveAs.request(file().id); });
    expect(h.result.current.action?.action).toBe("save-as");
  });
  it.each(["", ".", "..", "a/b", "a\\b", "nul\0name", "control\nname", "original.txt"])("rejects invalid/original target %j without I/O", async (name) => {
    const h = setup(); h.request(); await act(() => h.submit(name));
    expect(h.result.current.error).toBeTruthy();
    expect(remoteFileSaveAs).not.toHaveBeenCalled(); expect(h.tab()).toEqual(file());
  });
  it("refuses a target already open on the same connection", async () => {
    const h = setup();
    act(() => h.result.current.tabs.setRemoteFileTabs([file(), { ...file(), id: "copy", path: metadata.path }]));
    h.request(); await act(() => h.submit());
    expect(remoteFileSaveAs).not.toHaveBeenCalled(); expect(h.result.current.error).toBeTruthy();
  });
  it("reserves only one dialog even for two source requests in the same event", () => {
    const h = setup(); const other = { ...file(), id: "other", path: "/dir/other.txt" };
    act(() => h.result.current.tabs.setRemoteFileTabs([file(), other]));
    act(() => { h.result.current.saveAs.request(file().id); h.result.current.saveAs.request(other.id); });
    expect(h.result.current.action).toMatchObject({ sourceTabId: file().id });
    expect(h.result.current.tabs.remoteFileEditorOperations.has(other.id)).toBe(false);
  });
  it("serializes submits, captures source connection/text, retargets pointers and retains later edits", async () => {
    const io = deferred(); vi.mocked(remoteFileSaveAs).mockReturnValue(io.promise);
    const h = setup(); h.request(); const job = h.submit();
    const duplicate = h.submit();
    act(() => h.result.current.saveAs.cancel()); expect(h.result.current.action).not.toBeNull();
    act(() => h.result.current.tabs.setRemoteFileTabs((tabs) => tabs.map((tab) => changeRemoteFileEditorContent(tab, "new edit", "ready", "dirty"))));
    await act(async () => { io.resolve({ metadata, conflict: false }); await Promise.all([job, duplicate]); });
    expect(remoteFileSaveAs).toHaveBeenCalledExactlyOnceWith({ connectionId: "a", content: "draft", path: "/dir/copy.txt" });
    expect(h.tab()).toMatchObject({ id: "file:a:/dir/copy.txt", path: metadata.path, name: metadata.name, metadata, savedContent: "draft", content: "new edit", dirty: true, saveState: "dirty" });
    expect(h.result.current.tabs.activeRemoteFileTabId).toBe(h.tab().id);
    expect(h.result.current.tabs.activeUnifiedTabByConnectionId.a).toEqual({ kind: "file", id: h.tab().id });
    expect(h.refresh).toHaveBeenCalledWith("a", "/dir"); expect(h.result.current.action).toBeNull();
  });
  it("returns a clean file to saved state and does not steal a different active pointer", async () => {
    vi.mocked(remoteFileSaveAs).mockResolvedValue({ metadata, conflict: false });
    const h = setup(); h.request();
    act(() => h.result.current.tabs.dispatchTabs({ type: "tabs/setActiveRemoteFileTabId", value: "other" }));
    await act(() => h.submit());
    expect(h.tab()).toMatchObject({ dirty: false, saveState: "saved", savedContent: "draft" });
    expect(h.result.current.tabs.activeRemoteFileTabId).toBe("other");
  });
  it("preserves the original buffer/version after failure and supports a new-name retry", async () => {
    const io = deferred(); vi.mocked(remoteFileSaveAs).mockReturnValueOnce(io.promise).mockResolvedValueOnce({ metadata, conflict: false });
    const h = setup(); h.request(); const job = h.submit("exists.txt");
    act(() => h.result.current.tabs.setRemoteFileTabs((tabs) => tabs.map((tab) => changeRemoteFileEditorContent(tab, "later", "ready", "dirty"))));
    await act(async () => { io.reject(new Error("target exists")); await job; });
    expect(h.tab()).toMatchObject({ path: file().path, metadata: file().metadata, savedContent: "old", content: "later", dirty: true, saveState: "dirty" });
    expect(h.result.current.error).toBe("target exists"); expect(h.result.current.saveAs.busy).toBe(false);
    await act(() => h.submit());
    expect(h.tab()).toMatchObject({ path: metadata.path, savedContent: "later", dirty: false });
  });
  it("drops late completion after closing and reopening the same source path", async () => {
    const io = deferred(); vi.mocked(remoteFileSaveAs).mockReturnValue(io.promise);
    const h = setup(); h.request(); const job = h.submit();
    act(() => { h.result.current.tabs.setRemoteFileTabs([]); h.result.current.tabs.setRemoteFileTabs([{ ...file(), content: "reopened" }]); });
    expect(h.result.current.action).toBeNull();
    await act(async () => { io.resolve({ metadata, conflict: false }); await job; });
    expect(h.tab()).toMatchObject({ path: file().path, content: "reopened" }); expect(h.refresh).not.toHaveBeenCalled();
  });
  it("drops late failures after unmount", async () => {
    const io = deferred(); vi.mocked(remoteFileSaveAs).mockReturnValue(io.promise);
    const h = setup(); h.request(); const job = h.submit();
    h.unmount(); io.reject(new Error("late")); await job;
    expect(h.refresh).not.toHaveBeenCalled();
  });
  it("cannot clear or put an old failure into a newly opened source dialog", async () => {
    const io = deferred(); vi.mocked(remoteFileSaveAs).mockReturnValue(io.promise);
    const h = setup(); h.request(); const job = h.submit();
    act(() => { h.result.current.tabs.setRemoteFileTabs([]); h.result.current.tabs.setRemoteFileTabs([file()]); });
    h.request(); const nextAction = h.result.current.action;
    await act(async () => { io.reject(new Error("old failure")); await job; });
    expect(h.result.current.action).toBe(nextAction); expect(h.result.current.error).toBeNull();
    expect(h.result.current.tabs.remoteFileEditorOperations.has(file().id, "save")).toBe(true);
  });
  it("does not duplicate a target opened during I/O and reports that a copy was created", async () => {
    const io = deferred(); vi.mocked(remoteFileSaveAs).mockReturnValue(io.promise);
    const h = setup(); h.request(); const job = h.submit();
    act(() => h.result.current.tabs.setRemoteFileTabs((tabs) => [...tabs, { ...file(), id: "target", path: metadata.path }]));
    await act(async () => { io.resolve({ metadata, conflict: false }); await job; });
    expect(h.result.current.tabs.remoteFileTabs).toHaveLength(2); expect(h.tab().path).toBe(file().path);
    expect(h.result.current.error).toMatch(/created|已创建/); expect(h.tab().savedContent).toBe("old");
  });
});
