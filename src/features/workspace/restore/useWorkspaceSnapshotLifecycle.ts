import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  getWorkspaceRemoteFileRevision,
  subscribeWorkspaceRemoteFileNavigation,
} from "./remoteFileSnapshotBridge";
import { selectWorkspaceSnapshot, type WorkspaceSnapshotEnvelope } from "./snapshotCodec";
import type { WorkspaceSnapshotV1 } from "./snapshotTypes";

export interface WorkspaceSnapshotLifecycleInput {
  enabled: boolean;
  onRestore: (snapshot: WorkspaceSnapshotV1) => void;
  restoreOnLaunch: boolean;
  snapshot: WorkspaceSnapshotV1;
  runtime: WorkspaceSnapshotRuntime | null;
}

export interface WorkspaceSnapshotRuntime {
  load: () => Promise<WorkspaceSnapshotEnvelope>;
  save: (snapshot: WorkspaceSnapshotV1) => Promise<void>;
  schedule: (callback: () => void, delayMs: number) => () => void;
  reportError: (operation: "load" | "save", error: unknown) => void;
}

const workspaceSnapshotDebounceMs = 500;

export function useWorkspaceSnapshotLifecycle(input: WorkspaceSnapshotLifecycleInput) {
  useSyncExternalStore(
    subscribeWorkspaceRemoteFileNavigation,
    getWorkspaceRemoteFileRevision,
    () => 0,
  );
  const inputRef = useRef(input);
  inputRef.current = input;
  const restoredRef = useRef(false);
  const lastSavedRef = useRef<string | null>(null);
  const saveQueueRef = useRef(Promise.resolve());
  const [ready, setReady] = useState(false);
  const serializedSnapshot = JSON.stringify(input.snapshot);

  useEffect(() => {
    if (!input.enabled || restoredRef.current) return;
    const runtime = input.runtime;

    if (!runtime || !input.restoreOnLaunch) {
      restoredRef.current = true;
      lastSavedRef.current = JSON.stringify(inputRef.current.snapshot);
      setReady(true);
      return;
    }

    let disposed = false;
    void runtime.load()
      .then((envelope) => {
        if (disposed) return;
        const selection = selectWorkspaceSnapshot(envelope);
        if (selection.snapshot) {
          inputRef.current.onRestore(selection.snapshot);
          lastSavedRef.current = JSON.stringify(selection.snapshot);
        } else {
          lastSavedRef.current = JSON.stringify(inputRef.current.snapshot);
        }
        restoredRef.current = true;
        setReady(true);
      })
      .catch((error) => {
        if (disposed) return;
        runtime.reportError("load", error);
        lastSavedRef.current = JSON.stringify(inputRef.current.snapshot);
        restoredRef.current = true;
        setReady(true);
      });

    return () => {
      disposed = true;
    };
  }, [input.enabled, input.restoreOnLaunch, input.runtime]);

  useEffect(() => {
    const runtime = input.runtime;
    if (!ready || !input.enabled || !runtime) return;
    if (lastSavedRef.current === serializedSnapshot) return;

    const snapshot = inputRef.current.snapshot;
    return runtime.schedule(() => {
      // 按内容 debounce；串行写入保证较慢的旧保存不会覆盖新布局。
      saveQueueRef.current = saveQueueRef.current
        .then(() => runtime.save(snapshot))
        .then(() => {
          lastSavedRef.current = serializedSnapshot;
        })
        .catch((error) => runtime.reportError("save", error));
    }, workspaceSnapshotDebounceMs);
  }, [input.enabled, input.runtime, ready, serializedSnapshot]);
}
