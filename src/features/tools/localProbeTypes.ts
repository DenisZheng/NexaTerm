export type LocalProbeKind = "dns" | "tcp";
export interface LocalProbeRequest { kind: LocalProbeKind; host: string; port: number }
export type LocalProbeReason = "resolved" | "connected" | "cancelled" | "deadline" | "busy" |
  "invalid_host" | "invalid_port" | "resolution_failed" | "no_addresses" | "connection_refused" |
  "connect_failed" | "address_limit" | "worker_unavailable";
export interface LocalProbeResult {
  kind: LocalProbeKind;
  status: "success" | "cancelled" | "timed_out" | "unavailable" | "failed" | "invalid_input";
  reason: LocalProbeReason;
  duration_ms: number;
  address_count: number;
  addresses_truncated: boolean;
}
