import { connectionNetworkKind, isConnectionStageError } from "./connectionErrorCodes";
import { parseSshNodeFailure } from "./jumpRuntime";
export type FailureStage = "connect" | "proxy" | "host_key" | "auth" | "forward" | "channel" | "configuration" | "unknown";
export type FailureReason = "timeout" | "refused" | "unreachable" | "reset" | "rejected" | "failed";
export interface ConnectionFailureDiagnosis {
  stage: FailureStage;
  reason: FailureReason;
  stepIndex: number;
  nodeRole: "target" | "jump" | "forward_destination" | "chain" | "unknown";
  nodeConnectionId?: string;
}
export function diagnoseConnectionFailure(error: unknown, targetConnectionId?: string): ConnectionFailureDiagnosis {
  const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : "";
  const node = parseSshNodeFailure(error);
  let stage: FailureStage = "unknown";
  if (code === "host_key_unknown" || code === "host_key_changed" || code.startsWith("host_key_")) stage = "host_key";
  else if (code.startsWith("proxy_")) stage = "proxy";
  else if (code.startsWith("connection_jump_") || code.startsWith("connection_proxy_") || code.startsWith("vault_")) stage = "configuration";
  else if (node?.stage === "direct_tcpip" || code === "jump_direct_tcpip_failed" || code === "jump_direct_tcpip_timeout") stage = "forward";
  else if (node?.stage === "auth" || /^(terminal|jump)_auth_/.test(code) || /^(terminal|jump)_private_key_/.test(code) || /^(connection_)?credential_/.test(code)) stage = "auth";
  else if (/^terminal_(channel_open|pty|shell)_/.test(code)) stage = "channel";
  else if (node?.stage === "connect" || isConnectionStageError(code)) stage = "connect";
  const reason: FailureReason = connectionNetworkKind(code) ?? (code.endsWith("_timeout") ? "timeout" : code.endsWith("_rejected") ? "rejected" : "failed");
  const nodeConnectionId = node?.connectionId && node.connectionId.length <= 256 ? node.connectionId : undefined;
  const nodeRole = stage === "unknown" ? "unknown" : stage === "forward" ? "forward_destination" : nodeConnectionId
    ? nodeConnectionId === targetConnectionId ? "target" : targetConnectionId ? "jump" : "unknown"
    : code.startsWith("jump_") || code.startsWith("connection_jump_") ? "chain" : "target";
  return { stage, reason, stepIndex: stage === "host_key" ? 2 : stage === "auth" ? 3 : stage === "channel" ? 4 : 1,
    nodeRole, ...(nodeConnectionId ? { nodeConnectionId } : {}) };
}
export function safeDiagnosticId(value: unknown): string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : "";
}
