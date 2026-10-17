import { beforeEach, describe, expect, it, vi } from "vitest";
const invoke=vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core",() => ({invoke}));
vi.mock("../i18n",() => ({getLocale:() => "en",t:(key:string)=>key}));
import { rloginCapabilities, rloginCancel, rloginClose, rloginRead, rloginReserve, rloginResize, rloginStart, rloginStatus, rloginWrite, rloginWriteText } from "./commands";
const id="10000000-0000-4000-8000-000000000001";
const status={epoch:"18446744073709551615",phase:"closed",reason:null,awaiting_ack:false,finished:true};
beforeEach(() => { invoke.mockReset(); });
describe("actual Rlogin typed wrappers", () => {
  it("uses backend capability and never fabricates Windows runtime or terminal availability", async () => {
    const cap={native_core:true,exact_flush:false,runtime_available:false,terminal_available:false,dns_available:false,reason:"legacy_socket_urgent_boundary_unavailable"};
    invoke.mockResolvedValue(cap); expect(await rloginCapabilities()).toEqual(cap); expect(invoke).toHaveBeenCalledWith("rlogin_capabilities",undefined);
  });
  it("pins the reserve request and dimensions and validates the returned generation", async () => {
    const request={local_address:"127.0.0.1",target_address:"127.0.0.1",port:513,local_user:"local",remote_user:"remote",
      terminal:"xterm",speed:38400,window:{rows:24,columns:80},allow_plaintext:true};
    invoke.mockResolvedValue(id); const work=rloginReserve(request); request.window.rows=1; request.target_address="10.0.0.1";
    expect(await work).toBe(id); expect(invoke.mock.calls[0]).toEqual(["rlogin_reserve",{request:{...request,target_address:"127.0.0.1",window:{rows:24,columns:80}}}]);
    invoke.mockResolvedValue("private invalid handle"); await expect(rloginReserve(request)).rejects.toThrow("rlogin_bridge_invalid_id");
  });
  it("uses camelCase only for top-level IDs and forwards cleanup errors", async () => {
    invoke.mockResolvedValue(undefined); await rloginStart(id); await rloginCancel(id); await rloginClose(id);
    expect(invoke.mock.calls).toEqual([["rlogin_start",{reservationId:id}],["rlogin_cancel",{reservationId:id}],["rlogin_close",{reservationId:id}]]);
    invoke.mockRejectedValue({code:"rlogin_session_unavailable",diagnostic_id:"fixture-diag",message:"fixture"});
    await expect(rloginClose(id)).rejects.toMatchObject({code:"rlogin_session_unavailable",diagnostic_id:"fixture-diag"});
  });
  it("retains raw bytes, snake_case nested fields and decimal ACK strings across localization", async () => {
    const request={reservation_id:id,epoch:status.epoch,ack:{epoch:"0",sequence:"9007199254740993"}};
    const output={...status,phase:"initial_exchange_ready",finished:false,awaiting_ack:true,requires_reset:false,
      frame:{epoch:status.epoch,sequence:"9007199254740994",data:[0,128,255]}};
    invoke.mockResolvedValue(output); expect(await rloginRead(request)).toEqual(output);
    expect(invoke).toHaveBeenLastCalledWith("rlogin_read",{request});
    invoke.mockResolvedValue(undefined); const input={reservation_id:id,data:[0,128,255]}; await rloginWrite(input);
    const resize={reservation_id:id,window:{rows:24,columns:80,x_pixels:0,y_pixels:0}}; await rloginResize(resize);
    expect(invoke.mock.calls.slice(-2)).toEqual([["rlogin_write",{request:input}],["rlogin_resize",{request:resize}]]);
  });
  it("queries status independently and refuses malformed wire data", async () => {
    invoke.mockResolvedValue(status); expect(await rloginStatus(id)).toEqual(status); expect(invoke).toHaveBeenLastCalledWith("rlogin_status",{reservationId:id});
    invoke.mockResolvedValue({...status,epoch:9007199254740992}); await expect(rloginStatus(id)).rejects.toThrow("rlogin_bridge_invalid_response");
    invoke.mockResolvedValue({...status,requires_reset:false,frame:{epoch:"0",sequence:"1",data:[256]}});
    await expect(rloginRead({reservation_id:id,epoch:"0",ack:null})).rejects.toThrow("rlogin_bridge_invalid_response");
  });
  it("pins text input without changing whitespace, controls or the frozen encoding",async () => {
    invoke.mockResolvedValue(undefined); const request={reservation_id:id,data:"  中\r\x1b[A\0  "};
    const sending=rloginWriteText(request); request.data="changed"; await sending;
    expect(invoke).toHaveBeenLastCalledWith("rlogin_write_text",{request:{reservation_id:id,data:"  中\r\x1b[A\0  "}});
    invoke.mockRejectedValue({code:"rlogin_encoding_failed",message:"fixture"});
    await expect(rloginWriteText(request)).rejects.toMatchObject({code:"rlogin_encoding_failed"});
  });
});
