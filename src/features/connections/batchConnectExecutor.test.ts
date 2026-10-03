import { describe, expect, it } from "vitest";

import {
  createBatchConnectExecution,
  type BatchConnectExecutionAdapter,
} from "./batchConnectExecutor";

interface Handle {
  id: string;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

describe("batch connect executor", () => {
  it("starts at most four attempts and fills a slot only after completion", async () => {
    const waits = new Map<string, ReturnType<typeof deferred<{ status: "success" }>>>();
    const starts: string[] = [];
    const adapter: BatchConnectExecutionAdapter<Handle> = {
      cancel: () => undefined,
      start: (connectionId) => {
        starts.push(connectionId);
        waits.set(connectionId, deferred());
        return { id: connectionId };
      },
      wait: (handle) => waits.get(handle.id)!.promise,
    };

    const execution = createBatchConnectExecution(
      ["a", "b", "c", "d", "e", "f"],
      adapter,
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(starts).toEqual(["a", "b", "c", "d"]);

    waits.get("a")!.resolve({ status: "success" });
    await Promise.resolve();
    await Promise.resolve();

    expect(starts).toEqual(["a", "b", "c", "d", "e"]);

    for (const id of ["b", "c", "d", "e"]) {
      waits.get(id)!.resolve({ status: "success" });
    }
    await Promise.resolve();
    await Promise.resolve();
    waits.get("f")!.resolve({ status: "success" });

    await expect(execution.done).resolves.toHaveLength(6);
  });

  it("reports waiting-user without freeing its concurrency slot", async () => {
    const waitA = deferred<{ status: "success" }>();
    const statuses: Array<[string, string]> = [];
    const starts: string[] = [];
    const adapter: BatchConnectExecutionAdapter<Handle> = {
      cancel: () => undefined,
      start: (connectionId) => {
        starts.push(connectionId);
        return { id: connectionId };
      },
      wait: async (handle, report) => {
        if (handle.id === "a") {
          report("waiting-user");
          return waitA.promise;
        }
        return { status: "success" };
      },
    };

    const execution = createBatchConnectExecution(
      ["a", "b"],
      adapter,
      { onItemStatus: (id, status) => statuses.push([id, status]) },
      1,
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(starts).toEqual(["a"]);
    expect(statuses).toContainEqual(["a", "waiting-user"]);

    waitA.resolve({ status: "success" });
    await execution.done;
    expect(starts).toEqual(["a", "b"]);
  });

  it("cancels only queued and active work owned by this execution", async () => {
    const activeWait = deferred<{ status: "success" }>();
    const cancelled: string[] = [];
    const statuses: Array<[string, string]> = [];
    const adapter: BatchConnectExecutionAdapter<Handle> = {
      cancel: (handle) => {
        cancelled.push(handle.id);
        activeWait.reject(new Error("cancelled"));
      },
      start: (connectionId) => ({ id: connectionId }),
      wait: (handle) =>
        handle.id === "a" ? activeWait.promise : Promise.resolve({ status: "success" }),
    };

    const execution = createBatchConnectExecution(
      ["a", "b", "c"],
      adapter,
      { onItemStatus: (id, status) => statuses.push([id, status]) },
      1,
    );
    await Promise.resolve();
    await Promise.resolve();
    await execution.cancelRemaining();
    const results = await execution.done;

    expect(cancelled).toEqual(["a"]);
    expect(results).toEqual([
      { connectionId: "a", error: null, status: "cancelled" },
      { connectionId: "b", error: null, status: "cancelled" },
      { connectionId: "c", error: null, status: "cancelled" },
    ]);
    expect(statuses).toContainEqual(["b", "cancelled"]);
    expect(statuses).toContainEqual(["c", "cancelled"]);
  });

  it("keeps successful items when another attempt fails", async () => {
    const adapter: BatchConnectExecutionAdapter<Handle> = {
      cancel: () => undefined,
      start: (connectionId) => ({ id: connectionId }),
      wait: async (handle) =>
        handle.id === "bad"
          ? { error: "auth failed", status: "failed" }
          : { status: "success" },
    };

    const execution = createBatchConnectExecution(["ok", "bad"], adapter, {}, 2);

    await expect(execution.done).resolves.toEqual([
      { connectionId: "ok", error: null, status: "success" },
      { connectionId: "bad", error: "auth failed", status: "failed" },
    ]);
  });
});
