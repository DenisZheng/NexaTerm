import type { RemoteFileMetadata, RemoteFileReadResult, RemoteFileWriteResult } from "../files/remoteFileTypes";
import type { RemoteFileEditorTab } from "./remoteFileEditorTypes";
import { normalizeRemotePath } from "../files/remoteFilePaths";

export function remoteFileTabId(connectionId: string, path: string) {
  return `file:${connectionId}:${normalizeRemotePath(path)}`;
}

export function remoteFileEditorIsReadOnly(tab: RemoteFileEditorTab) {
  return !tab.metadata || tab.saveState === "loading";
}

export function canSaveRemoteFileEditor(tab: RemoteFileEditorTab | undefined, overwrite = false): tab is RemoteFileEditorTab & { metadata: RemoteFileMetadata } {
  return Boolean(tab?.metadata && (tab.dirty || overwrite) && tab.saveState !== "loading" && tab.saveState !== "saving");
}

export function canSaveAsRemoteFileEditor(tab: RemoteFileEditorTab | undefined): tab is RemoteFileEditorTab & { metadata: RemoteFileMetadata } {
  return canSaveRemoteFileEditor(tab, true);
}

export function completeRemoteFileEditorSaveAs(
  tab: RemoteFileEditorTab, submittedContent: string, metadata: RemoteFileMetadata, id: string, saved: string, modified: string,
): RemoteFileEditorTab {
  return { ...completeRemoteFileEditorSave(tab, submittedContent, metadata, saved, modified), id, path: metadata.path, name: metadata.name };
}

export function previewRemoteFileEditorSave(metadata: RemoteFileMetadata, content: string, mtime = Date.now()): RemoteFileWriteResult {
  return { conflict: false, metadata: { ...metadata, mtime, size: new TextEncoder().encode(content).length } };
}

export function changeRemoteFileEditorContent(tab: RemoteFileEditorTab, content: string, ready: string, modified: string) {
  if (content === tab.content) return tab;
  const dirty = tab.saveState === "saving" || content !== tab.savedContent;
  const busyOrConflict = tab.saveState === "saving" || tab.saveState === "loading" || tab.saveState === "conflict" || (tab.saveState === "error" && !tab.metadata);
  return { ...tab, content, dirty,
    saveState: busyOrConflict ? tab.saveState : dirty ? "dirty" as const : "ready" as const,
    statusMessage: busyOrConflict ? tab.statusMessage : dirty ? modified : ready };
}

export function completeRemoteFileEditorRead(
  tab: RemoteFileEditorTab, initialContent: string,
  result: Pick<RemoteFileReadResult, "content" | "metadata" | "name" | "path">, ready: string, modified: string,
): RemoteFileEditorTab {
  const content = tab.content === initialContent ? result.content : tab.content;
  const dirty = content !== result.content;
  return { ...tab, content, dirty, error: null, metadata: result.metadata, name: result.name,
    path: result.path, savedContent: result.content, saveState: dirty ? "dirty" : "ready", statusMessage: dirty ? modified : ready };
}

/** 服务端只保存了 submittedContent，不能把 promise 期间的新编辑也视为已保存。 */
export function completeRemoteFileEditorSave(
  tab: RemoteFileEditorTab, submittedContent: string, metadata: RemoteFileMetadata, saved: string, modified: string,
): RemoteFileEditorTab {
  const dirty = tab.content !== submittedContent;
  return { ...tab, dirty, error: null, metadata, savedContent: submittedContent,
    saveState: dirty ? "dirty" : "saved", statusMessage: dirty ? modified : saved };
}

type OperationKind = "read" | "save";
export interface RemoteFileEditorOperationToken { id: string; kind: OperationKind; nonce: symbol }

/** 只存异步请求身份，不存文件内容；使关闭/重开同路径和卸载后的回调失效。 */
export function createRemoteFileEditorOperations() {
  const operations = new Map<string, RemoteFileEditorOperationToken>();
  let active = true;
  return {
    begin(id: string, kind: OperationKind): RemoteFileEditorOperationToken | null {
      const current = operations.get(id);
      if (!active || (current && (kind === "save" || current.kind === "save"))) return null;
      const token = { id, kind, nonce: Symbol(kind) };
      operations.set(id, token);
      return token;
    },
    has(id: string, kind?: OperationKind) {
      const current = operations.get(id);
      return Boolean(current && (!kind || current.kind === kind));
    },
    isCurrent(token: RemoteFileEditorOperationToken) { return active && operations.get(token.id) === token; },
    finish(token: RemoteFileEditorOperationToken) { if (operations.get(token.id) === token) operations.delete(token.id); },
    invalidate(id: string) { operations.delete(id); },
    activate() { active = true; },
    dispose() { active = false; operations.clear(); },
  };
}
