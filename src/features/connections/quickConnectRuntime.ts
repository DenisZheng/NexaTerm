import type { ConnectionAuthKind, ConnectionProfile } from "./connectionTypes";
import {
  buildTemporaryConnectionProfile,
  type QuickConnectTarget,
} from "./quickConnect";
import {
  temporaryConnectionCreate,
  temporaryConnectionRelease,
  temporaryConnectionSave,
  temporaryConnectionSetCredentials,
  temporaryConnectionTerminalConnect,
} from "../../shared/tauri/commands";
import { hasTauriRuntime } from "../../shared/tauri/runtime";

interface TemporaryCredentialDraft {
  authKind: ConnectionAuthKind;
  password: string;
  privateKeyPassphrase: string;
  privateKeyPath: string;
}

export async function createTemporaryQuickConnectProfile(
  target: QuickConnectTarget,
): Promise<ConnectionProfile> {
  const ownerInstanceId = `quick-${Date.now().toString()}-${Math.random().toString(36).slice(2, 8)}`;
  const contextRef = hasTauriRuntime()
    ? await temporaryConnectionCreate({
        owner_instance_id: ownerInstanceId,
        host: target.host,
        port: target.port,
        username: target.username,
      })
    : `temp-preview-${ownerInstanceId}`;
  return buildTemporaryConnectionProfile(contextRef, target);
}

export function prepareTemporaryQuickConnectCredentials(
  contextRef: string,
  username: string,
  draft: TemporaryCredentialDraft,
) {
  if (!hasTauriRuntime()) return Promise.resolve();
  return temporaryConnectionSetCredentials({
    context_ref: contextRef,
    username,
    auth_kind: draft.authKind,
    password: draft.authKind === "password" ? draft.password || undefined : undefined,
    private_key_path: draft.authKind === "private_key" ? draft.privateKeyPath || undefined : undefined,
    private_key_passphrase:
      draft.authKind === "private_key" ? draft.privateKeyPassphrase || undefined : undefined,
  });
}

export function connectTemporaryQuickTerminal(contextRef: string, requestId: string) {
  return temporaryConnectionTerminalConnect({
    context_ref: contextRef,
    request_id: requestId,
    cols: 80,
    rows: 24,
  });
}

export function releaseTemporaryQuickConnectRefs(contextRefs: Iterable<string>) {
  if (!hasTauriRuntime()) return;
  for (const contextRef of contextRefs) {
    void temporaryConnectionRelease(contextRef).catch(() => undefined);
  }
}

export function saveTemporaryQuickConnectProfile(contextRef: string, name?: string) {
  if (!hasTauriRuntime()) {
    return Promise.reject(new Error("Temporary session saving requires the Tauri runtime."));
  }
  return temporaryConnectionSave(contextRef, name);
}
