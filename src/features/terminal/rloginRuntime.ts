import { RloginAttemptOwner } from "./rloginAttemptOwner";
import type { RloginTarget } from "./rloginAttemptOwner";
import { rloginCapabilities, rloginClose, rloginRead, rloginReserve, rloginResize, rloginStart, rloginWrite, rloginWriteText } from "../../shared/tauri/commands";
import { hasTauriRuntime } from "../../shared/tauri/runtime";

/** Loaded only when a logical Rlogin instance explicitly connects. No browser provider. */
export function createRloginAttempt(requestConsent:(target:RloginTarget,signal:AbortSignal)=>Promise<boolean>) {
  return new RloginAttemptOwner({
    capabilities:()=>hasTauriRuntime() ? rloginCapabilities() : Promise.resolve({native_core:false,exact_flush:false,runtime_available:false,terminal_available:false,dns_available:false,reason:"rlogin_session_unavailable"}),
    reserve:rloginReserve,start:rloginStart,read:rloginRead,write:rloginWrite,writeText:rloginWriteText,resize:rloginResize,close:rloginClose,
  },requestConsent);
}
