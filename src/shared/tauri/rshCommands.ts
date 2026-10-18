import {invoke} from "@tauri-apps/api/core";
import {parseRshCapability,parseRshId,parseRshRead,parseRshStatus,safeRshReason} from "../../features/rsh/rshWire";
import {RshError,type RshApi,type RshRequest} from "../../features/rsh/rshTypes";
async function call(command:string,args?:Record<string,unknown>):Promise<unknown>{
  try{return await invoke<unknown>(command,args);}catch(error){
    const code=error&&typeof error==="object"&&"code" in error?error.code:null;throw new RshError(safeRshReason(code));
  }
}
const action=async(command:string,args:Record<string,unknown>)=>{await call(command,args);};
export const rshApi:RshApi={
  capabilities:()=>call("rsh_capabilities").then(parseRshCapability),
  reserve:(request:RshRequest)=>call("rsh_reserve",{request:{...request}}).then(parseRshId),
  start:reservationId=>action("rsh_start",{reservationId}),
  read:(reservation_id,ack)=>call("rsh_read",{request:{reservation_id,ack}}).then(parseRshRead),
  status:reservationId=>call("rsh_status",{reservationId}).then(parseRshStatus),
  writeText:(reservation_id,data)=>action("rsh_write_text",{request:{reservation_id,data}}),
  stdinEof:reservationId=>action("rsh_stdin_eof",{reservationId}),
  signal:(reservation_id,signal)=>action("rsh_signal",{request:{reservation_id,signal}}),
  cancel:reservationId=>action("rsh_cancel",{reservationId}),close:reservationId=>action("rsh_close",{reservationId}),
};
