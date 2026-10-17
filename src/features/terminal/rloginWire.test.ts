import { describe, expect, it } from "vitest";
import { compareRloginCounter, isRloginCounter, parseRloginCapability, parseRloginRead, parseRloginStatus, rloginId } from "./rloginWire";
const status={epoch:"0",phase:"closed",reason:null,awaiting_ack:false,finished:true};
const frame={epoch:"0",sequence:"9007199254740993",data:[0,128,255]};
const read={...status,finished:false,awaiting_ack:true,requires_reset:false,frame};
describe("Rlogin wire validation", () => {
  it("keeps zero, more than 2^53 and u64::MAX canonical strings without number conversion", () => {
    for (const value of ["0","1","9007199254740993","18446744073709551615"]) expect(isRloginCounter(value)).toBe(true);
    expect(compareRloginCounter("9007199254740993","9007199254740992")).toBeGreaterThan(0);
    expect(compareRloginCounter("100","99")).toBeGreaterThan(0);
    expect(parseRloginRead(read).frame?.sequence).toBe("9007199254740993");
    expect(parseRloginRead({...read,frame:{...frame,sequence:"18446744073709551615"}}).frame?.sequence).toBe("18446744073709551615");
  });
  it.each(["", "+1", "-1", "01", " 1", "1 ", "1e3", "1.0", "18446744073709551616", "000000000000000000000", "１", 0, null])("rejects noncanonical counter %s", value => {
    expect(isRloginCounter(value)).toBe(false);
    expect(() => parseRloginRead({...read,epoch:value})).toThrow("rlogin_bridge_invalid_response");
  });
  it.each([[],[256],[-1],[1.5],["1"],[null],new Array(1),new Array(32769).fill(0),"private"].map(data => ({data})))("rejects invalid byte payload %#", ({data}) => {
    expect(() => parseRloginRead({...read,frame:{...frame,data}})).toThrow("rlogin_bridge_invalid_response");
  });
  it("preserves all 256 bytes and accepts the exact chunk limit", () => {
    const data=Array.from({length:32768},(_,i) => i%256);
    expect(parseRloginRead({...read,frame:{...frame,data}}).frame?.data).toEqual(data);
  });
  it.each([
    {...read,extra:"private"}, {...read,frame:{...frame,sequence:"0"}}, {...read,frame:{...frame,epoch:"1"}},
    {...read,requires_reset:true}, {...read,awaiting_ack:false}, {...read,finished:true},
    {...read,phase:"authenticated"}, {...read,reason:"private reason"}, {...read,frame:{...frame,command:"private"}},
    {...status,phase:"initial_exchange_ready"}, {...status,awaiting_ack:true},
  ])("rejects schema/credit/phase drift without leaking payload %#", value => {
    const parser="requires_reset" in value ? parseRloginRead : parseRloginStatus;
    expect(() => parser(value)).toThrow("rlogin_bridge_invalid_response");
  });
  it("projects only known metadata and permits fixed reasons without guessing command success", () => {
    expect(parseRloginStatus({...status,reason:"legacy_socket_cancelled"})).toEqual({...status,reason:"legacy_socket_cancelled"});
    expect(() => parseRloginStatus({...status,exit_code:0})).toThrow("rlogin_bridge_invalid_response");
  });
  it("keeps supported and unavailable capability separate and rejects inconsistent flags", () => {
    const cap={native_core:true,exact_flush:false,runtime_available:false,terminal_available:false,dns_available:false,reason:"legacy_socket_urgent_boundary_unavailable"};
    expect(parseRloginCapability(cap)).toEqual(cap);
    expect(() => parseRloginCapability({...cap,runtime_available:true})).toThrow("rlogin_bridge_invalid_response");
    expect(() => parseRloginCapability({...cap,exact_flush:1})).toThrow("rlogin_bridge_invalid_response");
    expect(() => parseRloginCapability({...cap,password:"private"})).toThrow("rlogin_bridge_invalid_response");
  });
  it("requires canonical UUID-v4 generations", () => {
    const id="10000000-0000-4000-8000-000000000001"; expect(rloginId(id)).toBe(id);
    for (const value of ["",id.toUpperCase().replace("1000","ABCD"),id.replace(/-/g,""),"00000000-0000-0000-0000-000000000000",null]) {
      expect(() => rloginId(value)).toThrow("rlogin_bridge_invalid_id");
    }
  });
});
