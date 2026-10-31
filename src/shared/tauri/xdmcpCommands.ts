import { invoke } from "@tauri-apps/api/core";
import { XdmcpError, type XdmcpApi } from "../../features/xdmcp/xdmcpTypes";
import { parseXdmcpCapability, parseXdmcpId, parseXdmcpStatus, parseXdmcpStatuses, xdmcpFailure } from "../../features/xdmcp/xdmcpWire";

async function call(command: string, args?: Record<string, unknown>): Promise<unknown> {
  try { return await invoke<unknown>(command, args); }
  catch (error) { throw new XdmcpError(xdmcpFailure(error)); }
}
export const xdmcpApi: XdmcpApi = {
  capabilities: () => call("xdmcp_capabilities").then(parseXdmcpCapability),
  reserve: () => call("xdmcp_reserve").then(parseXdmcpId),
  start: (reservationId, request) => call("xdmcp_start", { reservationId, request: {
    executable: request.executable, target: request.target, local_address: request.local_address,
    allow_external: request.allow_external, allow_network: request.allow_network,
  } }).then(parseXdmcpStatus),
  status: () => call("xdmcp_status").then(parseXdmcpStatuses),
  stop: async reservationId => {
    if (await call("xdmcp_stop", { reservationId }) !== null) throw new XdmcpError("invalid_response");
  },
};
