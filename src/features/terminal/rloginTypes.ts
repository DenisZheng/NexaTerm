// 原始字节契约；epoch/sequence不可转为JS number。
export const RLOGIN_MAX_CHUNK = 32 * 1024;
export const RLOGIN_MAX_TEXT_BYTES = 4096;
export const rloginPhases = ["reserved", "starting", "initial_exchange_ready", "closing", "closed", "failed"] as const;
export type RloginPhase = typeof rloginPhases[number];
export const rloginReasons = [
  "rlogin_dns_failed",
  "rlogin_dns_no_ipv4",
  "rlogin_session_denied",
  "rlogin_session_consent_required",
  "rlogin_session_busy",
  "rlogin_session_expired",
  "rlogin_session_duplicate",
  "rlogin_session_invalid_chunk",
  "rlogin_session_invalid_ack",
  "rlogin_session_not_ready",
  "rlogin_session_unavailable",
  "rlogin_encoding_invalid",
  "rlogin_encoding_failed",
  "rlogin_invalid_user",
  "rlogin_invalid_terminal",
  "rlogin_invalid_speed",
  "rlogin_invalid_window",
  "rlogin_rejected",
  "rlogin_rejection_too_long",
  "rlogin_unexpected_eof",
  "rlogin_already_finished",
  "legacy_socket_invalid_address",
  "legacy_socket_invalid_chunk",
  "legacy_socket_urgent_buffer_full",
  "legacy_socket_urgent_boundary_unavailable",
  "legacy_socket_access_denied",
  "legacy_socket_ports_busy",
  "legacy_socket_ports_unavailable",
  "legacy_socket_unavailable",
  "legacy_socket_connect_failed",
  "legacy_socket_timeout",
  "legacy_socket_cancelled",
  "legacy_socket_io_failed",
] as const;
export type RloginReason = typeof rloginReasons[number];
export interface RloginWindow { rows: number; columns: number; x_pixels?: number; y_pixels?: number }
export interface RloginReserveRequest {
  local_address: string; target_address: string; port: number; local_user: string; remote_user: string;
  terminal: string; speed: number; window: RloginWindow; allow_plaintext: boolean;
  terminal_encoding?: import("../connections/connectionTypes").ConnectionTerminalEncoding;
}
export interface RloginCapability {
  native_core: boolean; exact_flush: boolean; runtime_available: boolean;
  terminal_available: boolean; dns_available: boolean; reason: RloginReason | null;
}
export interface RloginAck { epoch: string; sequence: string }
export interface RloginReadRequest { reservation_id: string; epoch: string; ack: RloginAck | null }
export interface RloginWriteRequest { reservation_id: string; data: readonly number[] }
export interface RloginWriteTextRequest { reservation_id: string; data: string }
export interface RloginResizeRequest { reservation_id: string; window: RloginWindow }
export interface RloginStatus {
  epoch: string; phase: RloginPhase; reason: RloginReason | null; awaiting_ack: boolean; finished: boolean;
}
export interface RloginFrame extends RloginAck { data: readonly number[] }
export interface RloginReadReply extends RloginStatus { requires_reset: boolean; frame: RloginFrame | null }
export type RloginBridgeErrorCode = "rlogin_bridge_invalid_response" | "rlogin_bridge_invalid_id" | "rlogin_bridge_busy"
  | "rlogin_bridge_closed" | "rlogin_bridge_read_failed" | "rlogin_bridge_write_failed" | "rlogin_bridge_resize_failed"
  | "rlogin_bridge_render_failed" | "rlogin_bridge_close_failed" | "rlogin_bridge_runtime_unavailable";
export class RloginBridgeError extends Error {
  constructor(readonly code: RloginBridgeErrorCode) { super(code); this.name = "RloginBridgeError"; }
}
