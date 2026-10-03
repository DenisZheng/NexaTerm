import {
  batchConnectMaxConcurrentAttempts,
  type BatchConnectItemStatus,
} from "./batchConnectModel";

export interface BatchConnectExecutionResult {
  connectionId: string;
  error: string | null;
  status: "success" | "failed" | "cancelled";
}

export interface BatchConnectExecutionAdapter<Handle> {
  cancel(handle: Handle): Promise<void> | void;
  start(connectionId: string): Promise<Handle> | Handle;
  wait(
    handle: Handle,
    reportStatus: (status: Extract<BatchConnectItemStatus, "connecting" | "waiting-user">) => void,
  ): Promise<{ error?: string | null; status: "success" | "failed" }>;
}

export interface BatchConnectExecutionCallbacks {
  onItemStatus?(
    connectionId: string,
    status: BatchConnectItemStatus,
    error?: string | null,
  ): void;
}

export interface BatchConnectExecution {
  cancelRemaining(): Promise<void>;
  done: Promise<BatchConnectExecutionResult[]>;
}

export function createBatchConnectExecution<Handle>(
  connectionIds: readonly string[],
  adapter: BatchConnectExecutionAdapter<Handle>,
  callbacks: BatchConnectExecutionCallbacks = {},
  concurrencyLimit = batchConnectMaxConcurrentAttempts,
): BatchConnectExecution {
  const queue = uniqueConnectionIds(connectionIds);
  const active = new Map<string, Handle>();
  const results = new Map<string, BatchConnectExecutionResult>();
  const started = new Set<string>();
  let cancelRequested = false;
  let nextIndex = 0;

  for (const connectionId of queue) {
    callbacks.onItemStatus?.(connectionId, "queued", null);
  }

  async function cancelRemaining() {
    if (cancelRequested) return;
    cancelRequested = true;

    for (let index = nextIndex; index < queue.length; index += 1) {
      const connectionId = queue[index];
      if (started.has(connectionId) || results.has(connectionId)) continue;
      const result: BatchConnectExecutionResult = {
        connectionId,
        error: null,
        status: "cancelled",
      };
      results.set(connectionId, result);
      callbacks.onItemStatus?.(connectionId, "cancelled", null);
    }

    await Promise.allSettled(
      [...active.entries()].map(async ([connectionId, handle]) => {
        if (!results.has(connectionId)) {
          const result: BatchConnectExecutionResult = {
            connectionId,
            error: null,
            status: "cancelled",
          };
          results.set(connectionId, result);
          callbacks.onItemStatus?.(connectionId, "cancelled", null);
        }
        await adapter.cancel(handle);
      }),
    );
  }

  async function worker() {
    while (true) {
      if (cancelRequested) return;
      const index = nextIndex;
      nextIndex += 1;
      if (index >= queue.length) return;

      const connectionId = queue[index];
      if (results.has(connectionId)) continue;
      started.add(connectionId);
      callbacks.onItemStatus?.(connectionId, "connecting", null);

      let handle: Handle;
      try {
        handle = await adapter.start(connectionId);
      } catch (error) {
        const message = errorMessage(error);
        const result: BatchConnectExecutionResult = {
          connectionId,
          error: message,
          status: "failed",
        };
        results.set(connectionId, result);
        callbacks.onItemStatus?.(connectionId, "failed", message);
        continue;
      }

      active.set(connectionId, handle);
      if (cancelRequested) {
        try {
          await adapter.cancel(handle);
        } finally {
          active.delete(connectionId);
          if (!results.has(connectionId)) {
            const result: BatchConnectExecutionResult = {
              connectionId,
              error: null,
              status: "cancelled",
            };
            results.set(connectionId, result);
            callbacks.onItemStatus?.(connectionId, "cancelled", null);
          }
        }
        continue;
      }

      try {
        const outcome = await adapter.wait(handle, (status) => {
          if (!cancelRequested && !results.has(connectionId)) {
            callbacks.onItemStatus?.(connectionId, status, null);
          }
        });
        if (cancelRequested && results.get(connectionId)?.status === "cancelled") {
          continue;
        }
        const result: BatchConnectExecutionResult =
          outcome.status === "success"
            ? { connectionId, error: null, status: "success" }
            : {
                connectionId,
                error: outcome.error || "Connection failed.",
                status: "failed",
              };
        results.set(connectionId, result);
        callbacks.onItemStatus?.(connectionId, result.status, result.error);
      } catch (error) {
        if (cancelRequested && results.get(connectionId)?.status === "cancelled") {
          continue;
        }
        const message = errorMessage(error);
        const result: BatchConnectExecutionResult = {
          connectionId,
          error: message,
          status: "failed",
        };
        results.set(connectionId, result);
        callbacks.onItemStatus?.(connectionId, "failed", message);
      } finally {
        active.delete(connectionId);
      }
    }
  }

  const workerCount = Math.min(
    queue.length,
    Math.max(1, Math.floor(concurrencyLimit)),
  );
  const done = Promise.all(
    Array.from({ length: workerCount }, () => worker()),
  ).then(() =>
    queue.flatMap((connectionId) => {
      const result = results.get(connectionId);
      return result ? [result] : [];
    }),
  );

  return { cancelRemaining, done };
}

function uniqueConnectionIds(connectionIds: readonly string[]) {
  const seen = new Set<string>();
  return connectionIds.filter((connectionId) => {
    if (seen.has(connectionId)) return false;
    seen.add(connectionId);
    return true;
  });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
