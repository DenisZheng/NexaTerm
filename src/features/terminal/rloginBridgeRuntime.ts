import { rloginClose, rloginRead, rloginResize, rloginWrite, rloginWriteText } from "../../shared/tauri/commands";
import { hasTauriRuntime } from "../../shared/tauri/runtime";
import { RloginBridge } from "./rloginBridge";
import { RloginBridgeError } from "./rloginTypes";
// 后续终端按需调用；本模块不挂载UI、不创建会话或后台轮询器。
export function createRloginBridge(reservationId: string) {
  if (typeof window === "undefined" || !hasTauriRuntime()) throw new RloginBridgeError("rlogin_bridge_runtime_unavailable");
  return new RloginBridge(reservationId,{read:rloginRead,write:rloginWrite,writeText:rloginWriteText,resize:rloginResize,close:rloginClose});
}
