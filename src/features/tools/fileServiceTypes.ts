export interface FileServiceStatus {
  id: string;
  phase: "reserved" | "starting" | "running" | "stopping";
  port: number | null;
  size: number | null;
}
export interface FileServiceStarted { status: FileServiceStatus; token: string }
export type FileServiceAuditKind = "started" | "stopped" | "expired" | "start_failed" | "cancelled" |
  "request_ok" | "request_denied" | "request_rejected" | "request_timeout" | "request_failed" | "service_failed";
export interface FileServiceAudit { sequence: number; timestamp_ms: number; kind: FileServiceAuditKind }
export type FileServiceError = "unavailable" | "busy" | "expired" | "invalid_port" | "invalid_file" |
  "read_failed" | "too_large" | "timeout" | "cancelled" | "port_in_use" | "permission_denied" | "bind_failed" | "stop_pending";
const errorKinds = new Set<string>(["unavailable", "busy", "expired", "invalid_port", "invalid_file", "read_failed",
  "too_large", "timeout", "cancelled", "port_in_use", "permission_denied", "bind_failed", "stop_pending"]);
export function fileServiceError(error: unknown): FileServiceError {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string" && error.code.startsWith("file_service_")) {
    const kind = error.code.slice("file_service_".length);
    if (errorKinds.has(kind)) return kind as FileServiceError;
  }
  return "unavailable";
}

export function fileServiceDownloadCommand(port: number | null | undefined, token: string | null, windows: boolean): string | null {
  if (!Number.isInteger(port) || !port || port < 1 || port > 65535 || !token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return `${windows ? "curl.exe" : "curl"} --fail --header "Authorization: Bearer ${token}" "http://127.0.0.1:${port}/file" --output download.bin`;
}
