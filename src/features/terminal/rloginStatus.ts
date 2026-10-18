import type { MessageKey, Translate } from "../../shared/i18n";
import { rloginReasons } from "./rloginTypes";
const phaseKeys=new Map<string,MessageKey>([
  ["idle","workspace.rlogin.phase.idle"],["restored","workspace.rlogin.phase.idle"],["loading","workspace.rlogin.phase.loading"],
  ["checking","workspace.rlogin.phase.checking"],["consent","workspace.rlogin.phase.consent"],["reserving","workspace.rlogin.phase.reserving"],
  ["starting","workspace.rlogin.phase.starting"],["initial_exchange_ready","workspace.rlogin.phase.ready"],["closing","workspace.rlogin.phase.closing"],
  ["closed","workspace.rlogin.phase.closed"],["cancelled","workspace.rlogin.phase.cancelled"],["failed","workspace.rlogin.phase.failed"],["cleanup_failed","workspace.rlogin.phase.cleanupFailed"],
]);
const reasons=new Map<string,MessageKey>([
  ["legacy_socket_access_denied","workspace.rlogin.reason.permission"],["legacy_socket_invalid_address","workspace.rlogin.reason.address"],
  ["legacy_socket_ports_busy","workspace.rlogin.reason.ports"],["legacy_socket_ports_unavailable","workspace.rlogin.reason.ports"],
  ["legacy_socket_urgent_boundary_unavailable","workspace.rlogin.reason.platform"],["rlogin_attempt_unavailable","workspace.rlogin.reason.platform"],
  ["rlogin_session_busy","workspace.rlogin.reason.busy"],["rlogin_session_expired","workspace.rlogin.reason.expired"],
  ["rlogin_rejected","workspace.rlogin.reason.rejected"],["legacy_socket_timeout","workspace.rlogin.reason.timeout"],
  ["rlogin_attempt_cleanup_failed","workspace.rlogin.reason.cleanup"],["rlogin_entry_cleanup_pending","workspace.rlogin.reason.cleanup"],
  ["rlogin_encoding_failed","workspace.rlogin.reason.encoding"],["rlogin_terminal_decode_failed","workspace.rlogin.reason.encoding"],
]);
const safeCodes=new Set<string>([...rloginReasons,...reasons.keys(),"rlogin_entry_unavailable","rlogin_entry_failed","rlogin_entry_invalid_config","rlogin_attempt_failed",
  "rlogin_terminal_input_full","rlogin_terminal_input_invalid","rlogin_terminal_input_failed","rlogin_terminal_read_failed","rlogin_terminal_renderer_failed","rlogin_terminal_resize_failed",
  "rlogin_bridge_read_failed","rlogin_bridge_write_failed","rlogin_bridge_close_failed","rlogin_bridge_invalid_response"]);
export function rloginStatusLabel(phase:string,t:Translate){return t(phaseKeys.get(phase)??"workspace.rlogin.phase.idle");}
export function rloginReasonLabel(reason:string|null,t:Translate){
  if(!reason)return "";
  const message=t(reasons.get(reason)??"workspace.rlogin.reason.failed");
  return safeCodes.has(reason)?`${message} (${reason})`:message;
}
