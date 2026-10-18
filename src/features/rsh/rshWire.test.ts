import {describe,it,expect} from "vitest";
import {parseRshRead,parseRshStatus,parseRshId,safeRshReason} from "./rshWire";
import {emptyStatus} from "./rshTypes";
const raw=()=>({status:{...emptyStatus(),phase:"initial_exchange_ready",awaiting_ack:true},frame:{sequence:"18446744073709551615",stream:"stderr",data:[0,255]}});
describe("Rsh typed wire",()=>{
  it("preserves exact counters and independent binary stream tags",()=>{expect(parseRshRead(raw()).frame).toEqual(raw().frame);});
  it.each([[],[256],[-1],[1.1],new Array(1),new Array(32769).fill(0)])("rejects an invalid byte vector %#",data=>{const value=raw();value.frame.data=data;expect(()=>parseRshRead(value)).toThrow();});
  it.each(["0","01","+1","18446744073709551616",9007199254740992])("refuses malformed or rounded sequence %#",sequence=>{expect(()=>parseRshRead({...raw(),frame:{...raw().frame,sequence}})).toThrow();});
  it("never accepts an invented exit0, raw server reason, unknown field or merged stream",()=>{
    expect(()=>parseRshStatus({...emptyStatus(),remote_exit_code:0})).toThrow();expect(()=>parseRshStatus({...emptyStatus(),reason:"private remote bytes"})).toThrow();
    expect(()=>parseRshRead({...raw(),command:"private"})).toThrow();expect(()=>parseRshRead({...raw(),frame:{...raw().frame,stream:"merged"}})).toThrow();
    expect(safeRshReason("private remote bytes")).toBe("rsh_task_unavailable");
  });
  it("requires canonical per-run UUIDv4",()=>{expect(parseRshId("aaaaaaaa-aaaa-4aaa-8aaa-000000000001")).toHaveLength(36);expect(()=>parseRshId("private-target")).toThrow();});
});
