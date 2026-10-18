import {isByteChunk,isCounter,isLegacyId} from "../../shared/tauri/legacyWire";
import {phases,RshError,type RshCapability,type RshReply,type RshStatus} from "./rshTypes";
const reasons=new Set(["rsh_task_denied","rsh_task_consent_required","rsh_task_busy","rsh_task_expired","rsh_task_duplicate","rsh_task_invalid_chunk","rsh_task_invalid_ack",
  "rsh_task_not_ready","rsh_task_unavailable","rsh_encoding_invalid","rsh_encoding_failed","rsh_dns_failed","rsh_dns_no_ipv4","rsh_invalid_timeout","rsh_run_timeout","rsh_stdin_closed",
  "rsh_invalid_user","rsh_invalid_command","rsh_invalid_secondary_port","rsh_invalid_secondary_peer","rsh_rejected","rsh_rejection_too_long","rsh_unexpected_eof","rsh_already_finished","rsh_invalid_handshake",
  "legacy_socket_invalid_address","legacy_socket_invalid_chunk","legacy_socket_access_denied","legacy_socket_ports_busy","legacy_socket_ports_unavailable","legacy_socket_unavailable",
  "legacy_socket_connect_failed","legacy_socket_timeout","legacy_socket_cancelled","legacy_socket_io_failed"]);
export function safeRshReason(value:unknown):string{return typeof value==="string"&&reasons.has(value)?value:"rsh_task_unavailable";}
const invalid=()=>new RshError("rsh_invalid_response");
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value))throw invalid();return value as Record<string,unknown>;}
function keys(value:Record<string,unknown>,allowed:readonly string[]){if(Object.keys(value).length!==allowed.length||Object.keys(value).some(key=>!allowed.includes(key)))throw invalid();}
export function parseRshId(value:unknown):string{if(!isLegacyId(value))throw invalid();return value;}
export function parseRshStatus(raw:unknown):RshStatus{
  const v=record(raw);keys(v,["phase","reason","stdin_eof","stdout_eof","stderr_eof","awaiting_ack","finished","remote_exit_code"]);
  if(!phases.includes(v.phase as RshStatus["phase"])||v.reason!==null&&(typeof v.reason!=="string"||!reasons.has(v.reason))||v.remote_exit_code!==null)throw invalid();
  for(const key of ["stdin_eof","stdout_eof","stderr_eof","awaiting_ack","finished"]){if(typeof v[key]!=="boolean")throw invalid();}
  if(v.finished&&(v.awaiting_ack||!['closed','failed'].includes(String(v.phase))))throw invalid();
  return {phase:v.phase as RshStatus["phase"],reason:v.reason as string|null,stdin_eof:v.stdin_eof as boolean,stdout_eof:v.stdout_eof as boolean,
    stderr_eof:v.stderr_eof as boolean,awaiting_ack:v.awaiting_ack as boolean,finished:v.finished as boolean,remote_exit_code:null};
}
export function parseRshRead(raw:unknown):RshReply{
  const v=record(raw);keys(v,["status","frame"]);const status=parseRshStatus(v.status);if(v.frame===null)return {status,frame:null};
  const f=record(v.frame);keys(f,["sequence","stream","data"]);
  if(!isCounter(f.sequence)||f.sequence==="0"||(f.stream!=="stdout"&&f.stream!=="stderr")||!isByteChunk(f.data)||!status.awaiting_ack||status.finished)throw invalid();
  return {status,frame:{sequence:f.sequence,stream:f.stream,data:f.data}};
}
export function parseRshCapability(raw:unknown):RshCapability{const v=record(raw);keys(v,["native_core","runtime_available","dns_available","reserved_ports_required"]);
  if(Object.values(v).some(value=>typeof value!=="boolean"))throw invalid();return {native_core:v.native_core===true,runtime_available:v.runtime_available===true,dns_available:v.dns_available===true,reserved_ports_required:v.reserved_ports_required===true};}
