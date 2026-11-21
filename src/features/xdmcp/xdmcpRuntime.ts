import { xdmcpApi } from "../../shared/tauri/xdmcpCommands";
import { XdmcpSessionOwner } from "./XdmcpSessionOwner";
export function createXdmcpSession() { return new XdmcpSessionOwner(xdmcpApi); }
