import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { useI18n } from "../../shared/i18n";
import { remoteFileSaveAs } from "../../shared/tauri/commands";
import { hasTauriRuntime } from "../../shared/tauri/runtime";
import { joinRemotePath, remotePathParent } from "../files/remoteFilePaths";
import { isValidRemoteBaseName, type RemoteFileTextAction } from "../files/remoteFileTextActions";
import type { RemoteFileEditorTab } from "./remoteFileEditorTypes";
import { canSaveAsRemoteFileEditor, completeRemoteFileEditorSaveAs, previewRemoteFileEditorSave, remoteFileTabId, type createRemoteFileEditorOperations, type RemoteFileEditorOperationToken } from "./remoteFileEditorState";

type SaveAsAction = Extract<RemoteFileTextAction, { action: "save-as" }>;
interface Options {
  action: RemoteFileTextAction | null;
  tabs: RemoteFileEditorTab[];
  tabsRef: RefObject<RemoteFileEditorTab[]>;
  operations: ReturnType<typeof createRemoteFileEditorOperations>;
  setTabs: Dispatch<SetStateAction<RemoteFileEditorTab[]>>;
  setAction: Dispatch<SetStateAction<RemoteFileTextAction | null>>;
  setValue: (value: string) => void;
  setError: (error: string | null) => void;
  formatError: (error: unknown) => string;
  onRetarget: (connectionId: string, oldId: string, newId: string) => void;
  refresh: (connectionId: string, path: string) => void;
}

/** 内容仍归 sessionTabs；这里只管理命名弹窗及既有操作 token。 */
export function useRemoteFileSaveAs(options: Options) {
  const { t } = useI18n();
  const latest = useRef(options);
  latest.current = options;
  const pendingRef = useRef<RemoteFileEditorOperationToken | null>(null);
  const [pending, setPending] = useState<RemoteFileEditorOperationToken | null>(null);
  const previousAction = useRef<RemoteFileTextAction | null>(null);
  const requested = useRef<SaveAsAction | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  function clear(action: RemoteFileTextAction) {
    const current = latest.current;
    if (current.action !== action) return;
    if (action.action === "save-as") current.operations.finish(action.operation);
    current.setAction(null);
    current.setValue("");
    current.setError(null);
    pendingRef.current = null;
    setPending(null);
  }

  useEffect(() => {
    const old = previousAction.current;
    if (old !== options.action && old?.action === "save-as") options.operations.finish(old.operation);
    previousAction.current = options.action;
    if (options.action?.action === "save-as" && !options.operations.isCurrent(options.action.operation)) clear(options.action);
  }, [options.action, options.tabs, options.operations]);

  function request(tabId: string) {
    const current = latest.current;
    const tab = current.tabsRef.current.find((item) => item.id === tabId);
    if (current.action || pendingRef.current || (requested.current && current.operations.isCurrent(requested.current.operation)) || !canSaveAsRemoteFileEditor(tab)) return;
    const operation = current.operations.begin(tabId, "save");
    if (!operation) return;
    requested.current = { action: "save-as", connectionId: tab.connectionId, sourceTabId: tabId, parentPath: remotePathParent(tab.path), operation };
    current.setAction(requested.current);
    current.setValue(tab.name);
    current.setError(null);
  }

  function cancel() {
    const action = latest.current.action;
    if (action && !pendingRef.current) clear(action);
  }

  async function submit(action: SaveAsAction, value: string) {
    const current = latest.current;
    const { operations } = current;
    const { operation, sourceTabId } = action;
    const tab = current.tabsRef.current.find((item) => item.id === sourceTabId);
    if (current.action !== action || pendingRef.current || !operations.isCurrent(operation) || !canSaveAsRemoteFileEditor(tab)) return;
    const name = value.trim();
    if (!isValidRemoteBaseName(name)) { current.setError(t("files.editor.saveAs.invalidName")); return; }
    const path = joinRemotePath(action.parentPath, name);
    if (path === tab.path || current.tabsRef.current.some((item) => item.connectionId === tab.connectionId && item.path === path)) {
      current.setError(t("files.editor.saveAs.targetOpen")); return;
    }
    const submittedContent = tab.content;
    pendingRef.current = operation;
    setPending(operation);
    current.setError(null);
    current.setTabs((tabs) => tabs.map((item) => item.id === sourceTabId ? { ...item, error: null, saveState: "saving", statusMessage: t("files.editor.status.saving") } : item));
    try {
      const result = hasTauriRuntime()
        ? await remoteFileSaveAs({ connectionId: tab.connectionId, content: submittedContent, path })
        : previewRemoteFileEditorSave({ ...tab.metadata, path, name }, submittedContent);
      if (!operations.isCurrent(operation)) return;
      if (latest.current.tabsRef.current.some((item) => item.connectionId === tab.connectionId && item.path === result.metadata.path && item.id !== sourceTabId)) {
        throw new Error(t("files.editor.saveAs.createdTargetOpen"));
      }
      const id = remoteFileTabId(tab.connectionId, result.metadata.path);
      latest.current.setTabs((tabs) => tabs.map((item) => item.id === sourceTabId ? completeRemoteFileEditorSaveAs(item, submittedContent, result.metadata, id, t("files.editor.status.saved"), t("files.editor.status.dirty")) : item));
      latest.current.onRetarget(tab.connectionId, sourceTabId, id);
      latest.current.refresh(tab.connectionId, remotePathParent(result.metadata.path));
      clear(action);
    } catch (error) {
      if (!operations.isCurrent(operation)) return;
      latest.current.setTabs((tabs) => tabs.map((item) => {
        if (item.id !== sourceTabId) return item;
        const dirty = item.content !== item.savedContent;
        const preserveStatus = tab.saveState === "conflict" || tab.saveState === "error";
        return { ...item, dirty, error: tab.error, saveState: preserveStatus ? tab.saveState : dirty ? "dirty" : "ready", statusMessage: preserveStatus ? tab.statusMessage : t(dirty ? "files.editor.status.dirty" : "files.editor.status.ready") };
      }));
      if (latest.current.action === action) latest.current.setError(latest.current.formatError(error));
    } finally {
      if (pendingRef.current === operation) {
        pendingRef.current = null;
        if (mounted.current) setPending(null);
      }
    }
  }

  return { request, submit, cancel, busy: Boolean(pending && options.action?.action === "save-as" && pending === options.action.operation) };
}
