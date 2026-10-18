import { RLOGIN_MAX_CHUNK, RloginBridgeError, rloginPhases, rloginReasons } from "./rloginTypes";
import type { RloginCapability, RloginFrame, RloginPhase, RloginReadReply, RloginReason, RloginStatus } from "./rloginTypes";
const phases: ReadonlySet<unknown> = new Set(rloginPhases);
const reasons: ReadonlySet<unknown> = new Set(rloginReasons);
export const invalidRloginResponse = () => new RloginBridgeError("rlogin_bridge_invalid_response");
export { compareCounter as compareRloginCounter, isCounter as isRloginCounter } from "../../shared/tauri/legacyWire";
import { isCounter as isRloginCounter, isLegacyId, isByteChunk } from "../../shared/tauri/legacyWire";
export function rloginId(value:unknown):string {if(!isLegacyId(value))throw new RloginBridgeError("rlogin_bridge_invalid_id");return value;}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidRloginResponse();
  return value as Record<string, unknown>;
}
const validBytes=(raw:unknown)=>isByteChunk(raw,RLOGIN_MAX_CHUNK);
function keys(value: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(value).length !== allowed.length || Object.keys(value).some(k => !allowed.includes(k))) throw invalidRloginResponse();
}
function status(value: Record<string, unknown>): RloginStatus {
  if (!isRloginCounter(value.epoch) || !phases.has(value.phase) || value.reason !== null && !reasons.has(value.reason)
    || typeof value.awaiting_ack !== "boolean" || typeof value.finished !== "boolean"
    || value.finished && (!['closed', 'failed'].includes(String(value.phase)) || value.awaiting_ack)) throw invalidRloginResponse();
  return { epoch:value.epoch, phase:value.phase as RloginPhase, reason:value.reason as RloginReason | null,
    awaiting_ack:value.awaiting_ack, finished:value.finished };
}
const statusKeys = ["epoch", "phase", "reason", "awaiting_ack", "finished"];
export function parseRloginStatus(raw: unknown): RloginStatus {
  const value=object(raw); keys(value,statusKeys); return status(value);
}
export function parseRloginRead(raw: unknown): RloginReadReply {
  const value=object(raw); keys(value,[...statusKeys,"requires_reset","frame"]); const common=status(value);
  if (typeof value.requires_reset !== "boolean") throw invalidRloginResponse();
  let frame: RloginFrame | null=null;
  if (value.frame !== null) {
    const f=object(value.frame); keys(f,["epoch","sequence","data"]);
    if (!isRloginCounter(f.epoch) || f.epoch !== common.epoch || !isRloginCounter(f.sequence) || f.sequence === "0"
      || !validBytes(f.data)
      || value.requires_reset || !common.awaiting_ack || common.finished) throw invalidRloginResponse();
    frame={epoch:f.epoch,sequence:f.sequence,data:f.data};
  }
  return {...common,requires_reset:value.requires_reset,frame};
}
export function parseRloginCapability(raw: unknown): RloginCapability {
  const value=object(raw); keys(value,["native_core","exact_flush","runtime_available","terminal_available","dns_available","reason"]);
  for (const name of ["native_core","exact_flush","runtime_available","terminal_available","dns_available"]) {
    if (typeof value[name] !== "boolean") throw invalidRloginResponse();
  }
  if (value.reason !== null && !reasons.has(value.reason) || value.runtime_available !== (value.native_core && value.exact_flush)) throw invalidRloginResponse();
  return {native_core:value.native_core as boolean,exact_flush:value.exact_flush as boolean,runtime_available:value.runtime_available as boolean,
    terminal_available:value.terminal_available as boolean,dns_available:value.dns_available as boolean,reason:value.reason as RloginReason | null};
}
