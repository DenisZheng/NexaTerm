import { t as tr } from "../../shared/i18n";
import type { BatchConnectItemStatus } from "./batchConnectModel";
import type { ClosePlan } from "../workspace/sessionTabs/itemClose";
import { instanceItemId } from "../workspace/sessionTabs/instances";

export type BatchWorkspaceHandle =
  | { kind: "character"; id: string }
  | { kind: "rdp"; id: string }
  | { kind: "ssh"; id: string }
  | { kind: "vnc"; id: string };

interface BatchSshTab {
  connectionId: string;
  connectionStep?: {
    error?: string | null;
    status?: string | null;
  } | null;
  error?: string | null;
  id: string;
  sessionId?: string;
  type: "connecting" | "terminal";
}

interface BatchCharacterTab {
  error?: string | null;
  id: string;
  profileId: string;
  sessionId?: string;
  source?: "local" | "serial" | "telnet";
  status: string;
}

interface BatchRemoteSession {
  connectionId: string;
  error?: string | null;
  id: string;
  status: string;
}

export interface BatchWorkspaceSnapshot {
  localTerminalTabs: readonly BatchCharacterTab[];
  rdpSessions: readonly BatchRemoteSession[];
  terminalTabs: readonly BatchSshTab[];
  vncSessions: readonly BatchRemoteSession[];
}

type BatchHandleRuntimeState = {
  error: string | null;
  status: Extract<
    BatchConnectItemStatus,
    "connecting" | "failed" | "success" | "waiting-user"
  >;
};

export function collectBatchOpenConnectionIds(snapshot: BatchWorkspaceSnapshot) {
  const ids = new Set<string>();

  for (const tab of snapshot.terminalTabs) {
    if (sshTabRuntimeState(tab).status !== "failed") ids.add(tab.connectionId);
  }
  for (const tab of snapshot.localTerminalTabs) {
    if (
      (tab.source === "serial" || tab.source === "telnet") &&
      characterTabRuntimeState(tab).status !== "failed"
    ) {
      ids.add(tab.profileId);
    }
  }
  for (const session of snapshot.rdpSessions) {
    if (remoteSessionRuntimeState(session).status !== "failed") ids.add(session.connectionId);
  }
  for (const session of snapshot.vncSessions) {
    if (remoteSessionRuntimeState(session).status !== "failed") ids.add(session.connectionId);
  }

  return ids;
}

export function batchWorkspaceItemId(handle: BatchWorkspaceHandle) {
  return instanceItemId(handle.kind === "character" ? "local" : handle.kind, handle.id);
}

export function batchWorkspaceClosePlan(handle: BatchWorkspaceHandle): ClosePlan {
  return {
    confirmation: null,
    connectionIds: [],
    localTabIds: handle.kind === "character" ? [handle.id] : [],
    rdpSessionIds: handle.kind === "rdp" ? [handle.id] : [],
    splitGroup: false,
    sshTabIds: handle.kind === "ssh" ? [handle.id] : [],
    vncSessionIds: handle.kind === "vnc" ? [handle.id] : [],
  };
}

export function batchWorkspaceHandleState(
  handle: BatchWorkspaceHandle,
  snapshot: BatchWorkspaceSnapshot,
): BatchHandleRuntimeState {
  if (handle.kind === "ssh") {
    const tab = snapshot.terminalTabs.find((item) => item.id === handle.id);
    return tab
      ? sshTabRuntimeState(tab)
      : { error: tr("batch.error.sshClosed"), status: "failed" };
  }

  if (handle.kind === "character") {
    const tab = snapshot.localTerminalTabs.find((item) => item.id === handle.id);
    return tab
      ? characterTabRuntimeState(tab)
      : { error: tr("batch.error.terminalClosed"), status: "failed" };
  }

  const sessions = handle.kind === "rdp" ? snapshot.rdpSessions : snapshot.vncSessions;
  const session = sessions.find((item) => item.id === handle.id);
  return session
    ? remoteSessionRuntimeState(session)
    : { error: tr("batch.error.remoteClosed"), status: "failed" };
}

export async function waitForBatchWorkspaceHandle(
  handle: BatchWorkspaceHandle,
  readSnapshot: () => BatchWorkspaceSnapshot,
  reportStatus: (
    status: Extract<BatchConnectItemStatus, "connecting" | "waiting-user">,
  ) => void,
) {
  let lastStatus: "connecting" | "waiting-user" | null = null;

  while (true) {
    const state = batchWorkspaceHandleState(handle, readSnapshot());
    if (state.status === "success") return { status: "success" as const };
    if (state.status === "failed") {
      return {
        error: state.error || tr("batch.error.connection"),
        status: "failed" as const,
      };
    }
    if (state.status !== lastStatus) {
      lastStatus = state.status;
      reportStatus(state.status);
    }
    await delay(100);
  }
}

function sshTabRuntimeState(tab: BatchSshTab): BatchHandleRuntimeState {
  if (tab.type === "terminal" && tab.sessionId) {
    return { error: null, status: "success" };
  }

  const stepStatus = tab.connectionStep?.status || null;
  if (stepStatus === "prompt" || stepStatus === "waiting_host_key") {
    return { error: null, status: "waiting-user" };
  }
  if (stepStatus === "error" || tab.error) {
    return {
      error: tab.connectionStep?.error || tab.error || tr("batch.error.ssh"),
      status: "failed",
    };
  }
  return { error: null, status: "connecting" };
}

function characterTabRuntimeState(tab: BatchCharacterTab): BatchHandleRuntimeState {
  if (tab.sessionId) return { error: null, status: "success" };
  if (tab.error || tab.status === "连接失败") {
    return { error: tab.error || tr("batch.error.terminal"), status: "failed" };
  }
  return { error: null, status: "connecting" };
}

function remoteSessionRuntimeState(session: BatchRemoteSession): BatchHandleRuntimeState {
  if (session.status === "error") {
    return { error: session.error || tr("batch.error.remote"), status: "failed" };
  }
  if (session.status !== "launching") return { error: null, status: "success" };
  return { error: null, status: "connecting" };
}

function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}
