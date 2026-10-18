import type {RshRequest} from "./rshTypes";
import type {Translate} from "../../shared/i18n";
export type DraftField="target_address"|"local_address"|"port"|"local_user"|"remote_user"|"command"|"run_timeout_seconds"|"allow_plaintext";
export type DraftErrors=Partial<Record<DraftField,string>>;
const size=(text:string)=>new TextEncoder().encode(text).length;
export function validIpv4(value:string){const parts=value.split(".");return parts.length===4&&parts.every(p=>/^(0|[1-9][0-9]{0,2})$/.test(p)&&Number(p)<=255)&&value!=="0.0.0.0"&&value!=="255.255.255.255"&&!(Number(parts[0])>=224&&Number(parts[0])<=239);}
export function validDestination(value:string){
  if(validIpv4(value))return true;if(!value||value.length>253)return false;
  if(value.split('.').every(label=>/^[0-9]*$/.test(label)||/^0x[0-9a-f]+$/i.test(label)))return false;
  return value.replace(/\.$/,"").split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
}
export function validateDraft(request:RshRequest):DraftErrors{const errors:DraftErrors={};
  if(!validIpv4(request.local_address))errors.local_address="rsh.invalidAddress";if(!validDestination(request.target_address))errors.target_address="rsh.invalidAddress";
  if(!Number.isInteger(request.port)||request.port<1||request.port>65535)errors.port="rsh.invalidNumber";
  if(!Number.isInteger(request.run_timeout_seconds)||request.run_timeout_seconds<0||request.run_timeout_seconds>86400)errors.run_timeout_seconds="rsh.invalidNumber";
  for(const key of ["local_user","remote_user"] as const){if(size(request[key])<1||size(request[key])>16||/[\x00-\x1f\x7f-\x9f]/.test(request[key]))errors[key]="rsh.invalidUser";}
  if(size(request.command)<1||size(request.command)>65536||request.command.includes("\0"))errors.command="rsh.invalidCommand";
  if(!request.allow_plaintext)errors.allow_plaintext="rsh.consentRequired";return errors;
}
export function rshReasonLabel(reason:string,t:Translate){
  if(reason==="rsh_cleanup_failed")return t("rsh.reason.cleanup");
  if(reason.includes("access_denied")||reason.includes("ports_"))return t("rsh.reason.permission");
  if(reason.includes("busy"))return t("rsh.reason.busy");if(reason.includes("encoding"))return t("rsh.reason.encoding");
  if(reason.includes("timeout"))return t("rsh.reason.timeout");if(reason.includes("consent"))return t("rsh.consentRequired");
  if(reason.includes("invalid_chunk")||reason==="rsh_invalid_user"||reason==="rsh_invalid_command"||reason==="legacy_socket_invalid_address")return t("rsh.reason.invalid");
  if(reason.includes("dns_")||reason.includes("connect_failed")||reason.includes("secondary")||reason.includes("rejected")||reason.includes("handshake")||reason.includes("eof"))return t("rsh.reason.network");
  return t("rsh.reason.unavailable");
}
