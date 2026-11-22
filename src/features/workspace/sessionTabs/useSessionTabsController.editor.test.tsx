// @vitest-environment jsdom
import { StrictMode, type ReactNode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useSessionTabsController } from "./useSessionTabsController";
import type { RemoteFileEditorTab } from "../../editor/remoteFileEditorTypes";

const file = (): RemoteFileEditorTab => ({ id: "file:fixture:/file", connectionId: "fixture", connectionName: "Fixture",
  content: "draft", savedContent: "original", dirty: true, error: null, metadata: null,
  name: "file", path: "/file", saveState: "dirty", statusMessage: null });
afterEach(cleanup);

describe("editor collection and I/O scope", () => {
  it("updates the ref in the same event and invalidates a closed file before reopening", () => {
    const { result } = renderHook(() => useSessionTabsController({ defaultRemoteFileOpenMode: "split" }));
    act(() => {
      result.current.setRemoteFileTabs([file()]);
      expect(result.current.remoteFileTabsRef.current).toHaveLength(1);
      const old = result.current.remoteFileEditorOperations.begin(file().id, "save")!;
      result.current.setRemoteFileTabs([]);
      result.current.setRemoteFileTabs([file()]);
      expect(result.current.remoteFileEditorOperations.isCurrent(old)).toBe(false);
    });
    expect(result.current.remoteFileTabs).toHaveLength(1);
    expect(result.current.remoteFileTabsRef.current).toBe(result.current.remoteFileTabs);
  });
  it("disposes operations on unmount and works after StrictMode effect replay", () => {
    const hook = renderHook(() => useSessionTabsController({ defaultRemoteFileOpenMode: "split" }), {
      wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>,
    });
    const ops = hook.result.current.remoteFileEditorOperations;
    const token = ops.begin("file", "save")!;
    expect(ops.isCurrent(token)).toBe(true);
    hook.unmount();
    expect(ops.isCurrent(token)).toBe(false);
  });
});
