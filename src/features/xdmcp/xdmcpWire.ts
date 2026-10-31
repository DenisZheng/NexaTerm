import { isLegacyId } from "../../shared/tauri/legacyWire";
import { XdmcpError, xdmcpReasons, type XdmcpCapability, type XdmcpReason, type XdmcpStatus } from "./xdmcpTypes";

const invalid = () => new XdmcpError("invalid_response");
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}
function reason(value: unknown): value is XdmcpReason {
  return typeof value === "string" && (xdmcpReasons as readonly string[]).includes(value);
}
export function xdmcpFailure(error: unknown): XdmcpReason {
  if (error instanceof XdmcpError) return error.reason;
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  const suffix = typeof code === "string" && code.startsWith("xdmcp_") ? code.slice(6) : null;
  return reason(suffix) ? suffix : "unavailable";
}
export function parseXdmcpId(value: unknown): string {
  if (!isLegacyId(value)) throw invalid();
  return value;
}
export function parseXdmcpCapability(value: unknown): XdmcpCapability {
  const row = record(value);
  if (typeof row.bundled !== "boolean" || typeof row.external !== "boolean" || typeof row.desktop_verified !== "boolean"
      || (row.reason !== "engine_selection_required" && row.reason !== "platform_unavailable")) throw invalid();
  return { bundled: row.bundled, external: row.external, desktop_verified: row.desktop_verified, reason: row.reason };
}
export function parseXdmcpStatus(value: unknown): XdmcpStatus {
  const row = record(value);
  if (typeof row.phase !== "string" || !["reserved", "starting", "querying", "stopping", "closed", "failed"].includes(row.phase)
      || !(row.display === null || (Number.isInteger(row.display) && Number(row.display) >= 100 && Number(row.display) <= 131))
      || !(row.reason === null || reason(row.reason))) throw invalid();
  return { id: parseXdmcpId(row.id), phase: row.phase as XdmcpStatus["phase"], display: row.display as number | null,
    reason: row.reason as XdmcpReason | null };
}
export function parseXdmcpStatuses(value: unknown): XdmcpStatus[] {
  if (!Array.isArray(value) || value.length > 20) throw invalid();
  const rows = Array.from(value, parseXdmcpStatus);
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw invalid();
  return rows;
}
