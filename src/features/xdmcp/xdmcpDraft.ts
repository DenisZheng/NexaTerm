import type { MessageKey } from "../../shared/i18n";
import type { XdmcpRequest } from "./xdmcpTypes";

export type XdmcpDraftErrors = Partial<Record<keyof XdmcpRequest, MessageKey>>;
function validAddress(value: string) {
  if (!/^(0|[1-9]\d{0,2})(\.(0|[1-9]\d{0,2})){3}$/.test(value)) return false;
  const bytes = value.split(".").map(Number);
  return bytes.every(byte => byte <= 255) && value !== "0.0.0.0" && value !== "255.255.255.255" && !(bytes[0] >= 224 && bytes[0] <= 239);
}
export function validateXdmcpDraft(request: XdmcpRequest): XdmcpDraftErrors {
  const errors: XdmcpDraftErrors = {};
  if (!validAddress(request.target)) errors.target = "xdmcp.invalidTarget";
  if (!validAddress(request.local_address)) errors.local_address = "xdmcp.invalidLocal";
  // 这里只做纯语法检查；本机平台、文件身份与原生格式仍由后端验证。
  if (!request.executable || request.executable.includes("\0") || new TextEncoder().encode(request.executable).length > 4096
      || !(/^[a-z]:[\\/]/i.test(request.executable) || request.executable.startsWith("/") || request.executable.startsWith("\\\\"))) errors.executable = "xdmcp.invalidEngine";
  if (!request.allow_external) errors.allow_external = "xdmcp.externalRequired";
  if (!request.allow_network) errors.allow_network = "xdmcp.networkRequired";
  return errors;
}
