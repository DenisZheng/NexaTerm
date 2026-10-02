import { useCallback, useRef, useState } from "react";

import {
  createBatchConnectExecution,
  type BatchConnectExecution,
  type BatchConnectExecutionAdapter,
} from "./batchConnectExecutor";
import {
  createBatchConnectRun,
  retryFailedBatchConnectItems,
  updateBatchConnectItem,
  type BatchConnectRun,
} from "./batchConnectModel";

export interface BatchConnectWorkspaceAdapter<Handle>
  extends BatchConnectExecutionAdapter<Handle> {
  focus(handle: Handle): void;
}

export interface BatchConnectController<Handle> {
  active: boolean;
  cancelRemaining(): Promise<void>;
  dismiss(): boolean;
  focus(connectionId: string): void;
  groupId: string | null;
  retryFailed(): boolean;
  run: BatchConnectRun | null;
  start(groupId: string, connectionIds: readonly string[]): boolean;
}

export function useBatchConnectController<Handle>(
  adapter: BatchConnectWorkspaceAdapter<Handle>,
): BatchConnectController<Handle> {
  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;

  const [groupId, setGroupId] = useState<string | null>(null);
  const [run, setRun] = useState<BatchConnectRun | null>(null);
  const executionRef = useRef<BatchConnectExecution | null>(null);
  const generationRef = useRef(0);
  const handlesRef = useRef(new Map<string, Handle>());

  const launch = useCallback((connectionIds: readonly string[], generation: number) => {
    const execution = createBatchConnectExecution<Handle>(
      connectionIds,
      {
        cancel: (handle) => adapterRef.current.cancel(handle),
        start: async (connectionId) => {
          const handle = await adapterRef.current.start(connectionId);
          if (generation === generationRef.current) {
            handlesRef.current.set(connectionId, handle);
          }
          return handle;
        },
        wait: (handle, reportStatus) =>
          adapterRef.current.wait(handle, reportStatus),
      },
      {
        onItemStatus: (connectionId, status, error = null) => {
          if (generation !== generationRef.current) return;
          setRun((current) =>
            current
              ? updateBatchConnectItem(current, connectionId, status, error)
              : current,
          );
        },
      },
    );
    executionRef.current = execution;
    void execution.done.finally(() => {
      if (
        generation === generationRef.current &&
        executionRef.current === execution
      ) {
        executionRef.current = null;
      }
    });
  }, []);

  const start = useCallback(
    (nextGroupId: string, connectionIds: readonly string[]) => {
      if (executionRef.current || connectionIds.length === 0) return false;
      generationRef.current += 1;
      const generation = generationRef.current;
      handlesRef.current.clear();
      setGroupId(nextGroupId);
      setRun(createBatchConnectRun(connectionIds));
      launch(connectionIds, generation);
      return true;
    },
    [launch],
  );

  const cancelRemaining = useCallback(async () => {
    await executionRef.current?.cancelRemaining();
  }, []);

  const retryFailed = useCallback(() => {
    if (executionRef.current || !run) return false;
    const failedIds = run.items
      .filter((item) => item.status === "failed")
      .map((item) => item.connectionId);
    if (failedIds.length === 0) return false;

    generationRef.current += 1;
    const generation = generationRef.current;
    setRun((current) => (current ? retryFailedBatchConnectItems(current) : current));
    launch(failedIds, generation);
    return true;
  }, [launch, run]);

  const focus = useCallback((connectionId: string) => {
    const handle = handlesRef.current.get(connectionId);
    if (handle) adapterRef.current.focus(handle);
  }, []);

  const dismiss = useCallback(() => {
    if (executionRef.current) return false;
    generationRef.current += 1;
    handlesRef.current.clear();
    setGroupId(null);
    setRun(null);
    return true;
  }, []);

  const active = Boolean(
    run?.items.some((item) =>
      item.status === "queued" ||
      item.status === "connecting" ||
      item.status === "waiting-user",
    ),
  );

  return {
    active,
    cancelRemaining,
    dismiss,
    focus,
    groupId,
    retryFailed,
    run,
    start,
  };
}
