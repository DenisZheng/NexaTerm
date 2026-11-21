export const xdmcpReasons = ["unavailable", "busy", "expired", "invalid_request", "consent_required",
  "engine_unavailable", "port_in_use", "start_failed", "timeout", "cancelled", "stop_pending",
  "closed", "invalid_response", "cleanup_failed"] as const;
export type XdmcpReason = typeof xdmcpReasons[number];
export type XdmcpPhase = "reserved" | "starting" | "querying" | "stopping" | "closed" | "failed";
export interface XdmcpRequest {
  executable: string;
  target: string;
  local_address: string;
  allow_external: boolean;
  allow_network: boolean;
}
export interface XdmcpCapability {
  bundled: boolean;
  external: boolean;
  desktop_verified: boolean;
  reason: "engine_selection_required" | "platform_unavailable";
}
export interface XdmcpStatus { id: string; phase: XdmcpPhase; display: number | null; reason: XdmcpReason | null; }
export interface XdmcpApi {
  capabilities(): Promise<XdmcpCapability>;
  reserve(): Promise<string>;
  start(id: string, request: XdmcpRequest): Promise<XdmcpStatus>;
  status(): Promise<XdmcpStatus[]>;
  stop(id: string): Promise<void>;
}
export class XdmcpError extends Error {
  constructor(readonly reason: XdmcpReason) { super(`xdmcp_${reason}`); }
}
