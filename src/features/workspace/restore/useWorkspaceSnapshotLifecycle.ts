import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { workspaceSnapshotLoad, workspaceSnapshotSave } from "../../../shared/tauri/commands";
import { hasTauriRuntime } from "../../../shared/tauri/runtime";
import {
  getWorkspaceRemoteFileRevision,
  subscribeWorkspaceRemoteFileNavigation,
} from "./remoteFileSnapshotBridge";
import { selectWorkspaceSnapshot } from "./snapshotCodec";
import type { WorkspaceSnapshotV1 } from "./snapshotTypes";

export interface WorkspaceSnapshotLifecycleInput {
  enabled: boolean;
  onRestore: (snapshot: WorkspaceSnapshotV1) => void;
  restoreOnLaunch: boolean;
  snapshot: WorkspaceSnapshotV1;
}

const workspaceSnapshotDebounceMs = 500;

export function useWorkspaceSnapshotLifecycle(input: WorkspaceSnapshotLifecycleInput) {
  useSyncExternalStore(
    subscribeWorkspaceRemoteFileNavigation,
    getWorkspaceRemoteFileRevision,
    () => 0,
  );
  const restoreRef = useRef(input.onRestore);
  restoreRef.current = input.onRestore;
  const startedRef = useRef(false);
  const lastSavedRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const serializedSnapshot = JSON.stringify(input.snapshot);

  useEffect(() => {
    if (!input.enabled || startedRef.current) return;
    startedRef.current = true;

    if (!hasTauriRuntime() || !input.restoreOnLaunch) {
      lastSavedRef.current = serializedSnapshot;
      setReady(true);
      return;
    }

    let disposed = false;
    void workspaceSnapshotLoad()
      .then((envelope) => {
        if (disposed) return;
        const selection = selectWorkspaceSnapshot(envelope);
        if (selection.snapshot) {
          restoreRef.current(selection.snapshot);
          lastSavedRef.current = JSON.stringify(selection.snapshot);
        } else {
          lastSavedRef.current = serializedSnapshot;
        }
      })
      .catch((error) => {
        console.warn("workspace snapshot load failed", error);
        lastSavedRef.current = serializedSnapshot;
      })
      .finally(() => {
        if (!disposed) setReady(true);
      });

    return () => {
      disposed = true;
    };
  }, [input.enabled, input.restoreOnLaunch, serializedSnapshot]);

  useEffect(() => {
    if (!ready || !input.enabled || !hasTauriRuntime()) return;
    if (lastSavedRef.current === serializedSnapshot) return;

    const timer = window.setTimeout(() => {
      void workspaceSnapshotSave(input.snapshot)
        .then(() => {
          lastSavedRef.current = serializedSnapshot;
        })
        .catch((error) => console.warn("workspace snapshot save failed", error));
    }, workspaceSnapshotDebounceMs);
    return () => window.clearTimeout(timer);
  }, [input.enabled, input.snapshot, ready, serializedSnapshot]);
}
