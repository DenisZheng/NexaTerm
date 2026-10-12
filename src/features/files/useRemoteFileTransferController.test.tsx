// @vitest-environment jsdom
import { StrictMode, type ReactNode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRemoteFileTransferController } from "./useRemoteFileTransferController";
import {
  addRemoteFileTransfer, getRemoteFileTransfer, remoteFileTransferStore,
  removeRemoteFileTransfer, updateRemoteFileTransfer,
} from "./remoteFileTransferStore";

const mocks = vi.hoisted(() => ({ cancel: vi.fn(), listen: vi.fn() }));
vi.mock("../../shared/tauri/commands", () => ({ remoteFileCancelTransfer: mocks.cancel }));
vi.mock("../../shared/tauri/events", () => ({ listenRemoteFileTransferProgress: mocks.listen }));
vi.mock("../../shared/tauri/runtime", () => ({ hasTauriRuntime: () => true }));

function transfer() {
  return addRemoteFileTransfer({ connectionId: "fixture", direction: "upload", kind: "file",
    name: "fixture.txt", remotePath: "/fixture.txt", stage: "queued" });
}
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush() { await act(async () => { await Promise.resolve(); }); }
function controller(concurrentTransfers = 1) {
  const onTaskError = vi.fn((id: string) => updateRemoteFileTransfer(id, { status: "error" }));
  const hook = renderHook(({ limit }) => useRemoteFileTransferController({
    concurrentTransfers: limit, onTaskError,
  }), { initialProps: { limit: concurrentTransfers } });
  return { ...hook, onTaskError };
}
beforeEach(() => {
  remoteFileTransferStore.setState({ items: [] });
  mocks.cancel.mockResolvedValue(true);
  mocks.listen.mockResolvedValue(vi.fn());
});
afterEach(() => { cleanup(); vi.clearAllMocks(); remoteFileTransferStore.setState({ items: [] }); });

describe("WF-09-01A transfer scheduling", () => {
  it("bounds concurrency and preserves FIFO when the limit is reduced", async () => {
    const hook = controller(2);
    const jobs = Array.from({ length: 4 }, () => deferred());
    const order: number[] = [];
    jobs.forEach((job, index) => hook.result.current.enqueueRemoteFileTransfer(transfer(), () => {
      order.push(index); return job.promise;
    }));
    await flush();
    expect(order).toEqual([0, 1]);
    hook.rerender({ limit: 1 });
    jobs[0].resolve(); await flush();
    expect(order).toEqual([0, 1]);
    jobs[1].resolve(); await flush();
    expect(order).toEqual([0, 1, 2]);
    jobs[2].resolve(); await flush();
    expect(order).toEqual([0, 1, 2, 3]);
    jobs[3].resolve(); await flush();
  });

  it("does not execute unknown or removed rows", async () => {
    const hook = controller();
    const active = deferred();
    hook.result.current.enqueueRemoteFileTransfer(transfer(), () => active.promise);
    const removed = transfer();
    const task = vi.fn(async () => {});
    hook.result.current.enqueueRemoteFileTransfer(removed, task);
    hook.result.current.enqueueRemoteFileTransfer("missing", task);
    removeRemoteFileTransfer(removed);
    active.resolve(); await flush();
    expect(task).not.toHaveBeenCalled();
  });

  it("duplicate enqueue keeps the original queued task", async () => {
    const hook = controller();
    const active = deferred();
    hook.result.current.enqueueRemoteFileTransfer(transfer(), () => active.promise);
    const id = transfer();
    const original = vi.fn(async () => {}), replacement = vi.fn(async () => {});
    hook.result.current.enqueueRemoteFileTransfer(id, original);
    hook.result.current.enqueueRemoteFileTransfer(id, replacement);
    active.resolve(); await flush();
    expect(original).toHaveBeenCalledTimes(1);
    expect(replacement).not.toHaveBeenCalled();
  });

  it.each(["synchronous", "asynchronous"])("releases the slot after a %s exception", async (kind) => {
    const hook = controller();
    const id = transfer(), error = new Error("fixture failure");
    const task = () => { if (kind === "synchronous") throw error; return Promise.reject(error); };
    expect(() => hook.result.current.enqueueRemoteFileTransfer(id, task)).not.toThrow();
    const next = vi.fn(async () => {});
    hook.result.current.enqueueRemoteFileTransfer(transfer(), next);
    await flush();
    expect(hook.onTaskError).toHaveBeenCalledWith(id, error);
    expect(hook.onTaskError).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("cancels queued work locally and retains a running slot until settled", async () => {
    const hook = controller();
    const active = deferred(), id = transfer(), queued = transfer();
    hook.result.current.enqueueRemoteFileTransfer(id, () => active.promise);
    await flush();
    const next = vi.fn(async () => {});
    hook.result.current.enqueueRemoteFileTransfer(queued, next);
    hook.result.current.requestCancelTransfer(queued);
    expect(mocks.cancel).not.toHaveBeenCalled();
    hook.result.current.requestCancelTransfer(id);
    expect(mocks.cancel).toHaveBeenCalledWith(id);
    const last = vi.fn(async () => {});
    hook.result.current.enqueueRemoteFileTransfer(transfer(), last);
    await flush(); expect(last).not.toHaveBeenCalled();
    active.resolve(); await flush();
    expect(next).not.toHaveBeenCalled();
    expect(last).toHaveBeenCalledTimes(1);
    expect(getRemoteFileTransfer(id)?.status).toBe("canceled");
  });

  it("unmount cancels owned work and late rejection never drains the queue", async () => {
    const hook = controller();
    const active = deferred(), id = transfer(), queued = transfer(), unrelated = transfer();
    hook.result.current.enqueueRemoteFileTransfer(id, () => active.promise);
    await flush();
    const next = vi.fn(async () => {});
    hook.result.current.enqueueRemoteFileTransfer(queued, next);
    hook.unmount();
    expect(getRemoteFileTransfer(id)?.status).toBe("canceled");
    expect(getRemoteFileTransfer(queued)?.status).toBe("canceled");
    expect(getRemoteFileTransfer(unrelated)?.status).toBe("queued");
    expect(mocks.cancel).toHaveBeenCalledWith(id);
    active.reject(new Error("late")); await flush();
    expect(next).not.toHaveBeenCalled();
    expect(hook.onTaskError).not.toHaveBeenCalled();
  });

  it("treats a removed row as inactive after asynchronous preflight", () => {
    const hook = controller(), id = transfer();
    expect(hook.result.current.isTransferNoLongerActive(id)).toBe(false);
    removeRemoteFileTransfer(id);
    expect(hook.result.current.isTransferNoLongerActive(id)).toBe(true);
  });

  it("works after StrictMode effect replay and releases a late event listener", async () => {
    let resolveListener!: (cleanup: () => void) => void;
    mocks.listen.mockImplementation(() => new Promise<() => void>((resolve) => { resolveListener = resolve; }));
    const hook = renderHook(() => useRemoteFileTransferController({ concurrentTransfers: 1, onTaskError: vi.fn() }), {
      wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>,
    });
    const task = vi.fn(async () => {});
    hook.result.current.enqueueRemoteFileTransfer(transfer(), task);
    await flush(); expect(task).toHaveBeenCalledTimes(1);
    hook.unmount();
    const unlisten = vi.fn(); resolveListener(unlisten); await flush();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});
