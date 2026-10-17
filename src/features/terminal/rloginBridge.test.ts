import { afterEach, describe, expect, it, vi } from "vitest";
import { RloginBridge } from "./rloginBridge";
import type { RloginClient } from "./rloginBridge";
import type { RloginReadReply } from "./rloginTypes";
function reply(overrides: Partial<RloginReadReply> = {}): RloginReadReply {
  return {epoch:"0",phase:"initial_exchange_ready",reason:null,awaiting_ack:false,finished:false,requires_reset:false,frame:null,...overrides};
}
function frame(epoch="0",sequence="1"): RloginReadReply {
  return reply({epoch,awaiting_ack:true,frame:{epoch,sequence,data:[0,128,255]}});
}
const tracked: RloginBridge[]=[];
const release: (()=>void)[]=[];
let serial=0;
const id = () => `10000000-0000-4000-8000-${(++serial).toString(16).padStart(12,"0")}`;
function deferred<T>(fallback: T) {
  let resolve!: (v:T)=>void; const promise=new Promise<T>(r => {resolve=r;});
  release.push(() => resolve(fallback)); return {promise,resolve};
}
function fixture(reservationId=id()) {
  const client={read:vi.fn<RloginClient["read"]>().mockResolvedValue(reply()),write:vi.fn<RloginClient["write"]>().mockResolvedValue(),
    resize:vi.fn<RloginClient["resize"]>().mockResolvedValue(),close:vi.fn<RloginClient["close"]>().mockResolvedValue()};
  const bridge=new RloginBridge(reservationId,client); tracked.push(bridge); return {bridge,client};
}
async function ready() { const f=fixture(); f.client.read.mockResolvedValueOnce(frame()); await f.bridge.poll(); return f; }
afterEach(async () => {
  release.splice(0).forEach(r => r());
  await Promise.all(tracked.splice(0).map(b => b.close().catch(() => b.close())));
});
describe("Rlogin one-frame delivery", () => {
  it("coalesces concurrent polls and keeps the received frame credited before rendering", async () => {
    const {bridge,client}=fixture(); const gate=deferred(frame()); client.read.mockReturnValueOnce(gate.promise);
    const a=bridge.poll(), b=bridge.poll(); expect(a).toBe(b); expect(client.read).toHaveBeenCalledTimes(1);
    gate.resolve(frame()); await a;
    expect(bridge.snapshot()).toMatchObject({frame:"ready",awaitingAck:false});
    client.read.mockResolvedValueOnce(reply({awaiting_ack:true})); await bridge.poll();
    expect(client.read.mock.lastCall?.[0].ack).toBeNull(); expect(bridge.snapshot().frame).toBe("ready");
  });
  it("renders bytes once and ACKs only the first parsed callback with exact backend strings", async () => {
    const {bridge,client}=await ready(); const writer=vi.fn(); expect(bridge.render(writer)).toBe(true);
    expect(Array.from(writer.mock.calls[0][0] as Uint8Array)).toEqual([0,128,255]);
    expect(bridge.render(writer)).toBe(false);
    client.read.mockResolvedValueOnce(reply({awaiting_ack:true})); await bridge.poll();
    expect(client.read.mock.lastCall?.[0].ack).toBeNull();
    const parsed=writer.mock.calls[0][1] as ()=>void; parsed(); parsed();
    await bridge.poll(); expect(client.read.mock.lastCall?.[0].ack).toEqual({epoch:"0",sequence:"1"});
    expect(bridge.snapshot().awaitingAck).toBe(false); expect(writer).toHaveBeenCalledTimes(1);
  });
  it("retains a callback ACK that arrives while a no-ACK read is outstanding", async () => {
    const {bridge,client}=await ready(); let parsed=()=>{}; bridge.render((_,done) => {parsed=done;});
    const gate=deferred(reply({awaiting_ack:true})); client.read.mockReturnValueOnce(gate.promise);
    const pending=bridge.poll(); parsed(); gate.resolve(reply({awaiting_ack:true})); await pending;
    expect(bridge.snapshot().awaitingAck).toBe(true); await bridge.poll();
    expect(client.read.mock.lastCall?.[0].ack).toEqual({epoch:"0",sequence:"1"});
  });
  it("discards an unrendered old frame on flush and keeps u64 counters exact", async () => {
    const {bridge,client}=await ready(); const max="18446744073709551615";
    client.read.mockResolvedValueOnce(reply({epoch:max,requires_reset:true,awaiting_ack:true})); await bridge.poll();
    expect(bridge.render(vi.fn())).toBe(false);
    client.read.mockResolvedValueOnce(frame(max,"9007199254740993")); await bridge.poll();
    expect(client.read.mock.lastCall?.[0]).toMatchObject({epoch:max,ack:{epoch:"0",sequence:"1"}});
    bridge.render((_,done) => done()); client.read.mockResolvedValueOnce(reply({epoch:max})); await bridge.poll();
    expect(client.read.mock.lastCall?.[0].ack).toEqual({epoch:max,sequence:"9007199254740993"});
  });
  it("keeps a committed renderer frame credited across repeated flush until parsing completes", async () => {
    const {bridge,client}=await ready(); const writer=vi.fn(); bridge.render(writer);
    for (const epoch of ["1","2"]) {
      client.read.mockResolvedValueOnce(reply({epoch,requires_reset:true,awaiting_ack:true})); await bridge.poll();
      expect(client.read.mock.lastCall?.[0].ack).toBeNull(); expect(bridge.snapshot().frame).toBe("writing");
    }
    (writer.mock.calls[0][1] as ()=>void)();
    client.read.mockResolvedValueOnce(frame("2","2")); await bridge.poll();
    expect(client.read.mock.lastCall?.[0]).toMatchObject({epoch:"2",ack:{epoch:"0",sequence:"1"}});
    expect(writer).toHaveBeenCalledTimes(1);
  });
  it("allows the response accepting an ACK to carry the next frame without reusing old callbacks", async () => {
    const {bridge,client}=await ready(); let old=()=>{}; bridge.render((_,done) => {old=done; done();});
    client.read.mockResolvedValueOnce(frame("0","2")); await bridge.poll(); old();
    expect(bridge.snapshot()).toMatchObject({frame:"ready",awaitingAck:false});
    client.read.mockResolvedValueOnce(reply({awaiting_ack:true})); await bridge.poll();
    expect(client.read.mock.lastCall?.[0].ack).toBeNull();
  });
  it("never acknowledges when a sink calls parsed and then throws", async () => {
    const {bridge,client}=await ready();
    expect(() => bridge.render((_,done) => {done(); throw Error("fixture sink");})).toThrow("rlogin_bridge_render_failed");
    await bridge.close(); expect(client.read).toHaveBeenCalledTimes(1); expect(bridge.snapshot().awaitingAck).toBe(false);
  });
  it("drains the EOF tail through the renderer and exact ACK before final cleanup", async () => {
    const {bridge,client}=fixture(); client.read.mockResolvedValueOnce({...frame(),phase:"closed"});
    expect((await bridge.poll())?.finished).toBe(false); expect(client.close).not.toHaveBeenCalled();
    bridge.render((_,done) => done()); client.read.mockResolvedValueOnce(reply({phase:"closed",finished:true}));
    expect((await bridge.poll())?.finished).toBe(true); await bridge.close();
    expect(bridge.snapshot().phase).toBe("closed"); expect(client.close).toHaveBeenCalledTimes(1);
  });
});
describe("Rlogin generation and cleanup", () => {
  it("invalidates old renderer callbacks before close and cannot mutate a new owner", async () => {
    const old=await ready(); let parsed=()=>{}; old.bridge.render((_,done) => {parsed=done;});
    const gate=deferred<void>(undefined); old.client.close.mockReturnValueOnce(gate.promise);
    const closing=old.bridge.close(); const next=await ready(); parsed();
    expect(old.bridge.render(vi.fn())).toBe(false); expect(old.bridge.snapshot().awaitingAck).toBe(false);
    expect(next.bridge.snapshot()).toMatchObject({frame:"ready",awaitingAck:false});
    gate.resolve(); await closing;
  });
  it("waits a late read even after native close completes, ignores its payload and retains the lease", async () => {
    const {bridge,client}=fixture(); const gate=deferred(frame()); client.read.mockReturnValueOnce(gate.promise);
    const reading=bridge.poll(); let completed=false; const closing=bridge.close().then(() => {completed=true;});
    await Promise.resolve(); await Promise.resolve(); expect(completed).toBe(false);
    expect(() => new RloginBridge(bridge.reservationId,client)).toThrow("rlogin_bridge_busy");
    gate.resolve(frame()); expect(await reading).toBeNull(); await closing;
    expect(bridge.render(vi.fn())).toBe(false); expect(client.read).toHaveBeenCalledTimes(1);
    fixture(bridge.reservationId);
  });
  it("coalesces close and keeps ownership until actual native close returns", async () => {
    const {bridge,client}=fixture(); const gate=deferred<void>(undefined); client.close.mockReturnValueOnce(gate.promise);
    const a=bridge.close(), b=bridge.close(); expect(a).toBe(b); await Promise.resolve();
    expect(bridge.snapshot().phase).toBe("closing"); expect(client.close).toHaveBeenCalledTimes(1);
    gate.resolve(); await a; expect(bridge.snapshot().phase).toBe("closed");
    expect(await bridge.poll()).toBeNull(); expect(() => bridge.write(new Uint8Array())).toThrow("rlogin_bridge_closed");
  });
  it("exposes failed cleanup with no raw reason, keeps the lease, and permits explicit retry", async () => {
    const {bridge,client}=fixture(); client.close.mockRejectedValueOnce(new Error("private fixture detail"));
    await expect(bridge.close()).rejects.toThrow("rlogin_bridge_close_failed");
    expect(bridge.snapshot()).toMatchObject({phase:"close_failed",error:"rlogin_bridge_close_failed"});
    expect(() => new RloginBridge(bridge.reservationId,client)).toThrow("rlogin_bridge_busy");
    await bridge.close(); expect(client.close).toHaveBeenCalledTimes(2); fixture(bridge.reservationId);
  });
  it("bounds owners and never evicts an active or closing generation", async () => {
    const active=Array.from({length:16},() => fixture());
    expect(() => fixture()).toThrow("rlogin_bridge_busy");
    await active[0].bridge.close(); fixture();
  });
  it("fails closed after an ambiguous read error and never retries or exposes the raw error", async () => {
    const {bridge,client}=fixture(); client.read.mockRejectedValueOnce(new Error("private fixture payload"));
    await expect(bridge.poll()).rejects.toThrow("rlogin_bridge_read_failed"); await bridge.close();
    expect(await bridge.poll()).toBeNull(); expect(client.read).toHaveBeenCalledTimes(1);
    expect(client.close).toHaveBeenCalledTimes(1); expect(JSON.stringify(bridge.snapshot())).not.toContain("private");
  });
  it("closes on a synchronous sink failure without acknowledging or replaying the bytes", async () => {
    const {bridge,client}=await ready();
    expect(() => bridge.render(() => {throw Error("private sink");})).toThrow("rlogin_bridge_render_failed");
    await bridge.close(); expect(client.read).toHaveBeenCalledTimes(1); expect(client.close).toHaveBeenCalledTimes(1);
  });
});
describe("Rlogin bounded input and window calls", () => {
  it("pins one byte call, rejects overlap/oversize before IO, and close waits the issued write", async () => {
    const {bridge,client}=fixture(); const gate=deferred<void>(undefined); client.write.mockReturnValueOnce(gate.promise);
    await expect(bridge.write(new Uint8Array(32769))).rejects.toThrow("rlogin_bridge_invalid_response");
    const data=new Uint8Array([0,255]); const writing=bridge.write(data); data[1]=1;
    await expect(bridge.write(data)).rejects.toThrow("rlogin_bridge_busy");
    expect(client.write.mock.calls[0][0].data).toEqual([0,255]); let done=false;
    const closing=bridge.close().then(() => {done=true;}); await Promise.resolve(); await Promise.resolve(); expect(done).toBe(false);
    gate.resolve(); await writing; await closing; expect(client.write).toHaveBeenCalledTimes(1);
  });
  it("pins dimensions, rejects overlapping resize, and waits the issued resize on close", async () => {
    const {bridge,client}=fixture(); const gate=deferred<void>(undefined); client.resize.mockReturnValueOnce(gate.promise);
    const window={rows:24,columns:80}; const resizing=bridge.resize(window); window.rows=1;
    await expect(bridge.resize(window)).rejects.toThrow("rlogin_bridge_busy");
    expect(client.resize.mock.calls[0][0].window.rows).toBe(24); const closing=bridge.close();
    gate.resolve(); await resizing; await closing;
  });
  it("close prevents queued-but-unissued input and resize from reaching the native owner", async () => {
    const {bridge,client}=fixture();
    const writing=bridge.write(new Uint8Array([0,255])); const resizing=bridge.resize({rows:24,columns:80});
    const results=Promise.allSettled([writing,resizing]); const closing=bridge.close();
    expect((await results).every(r => r.status === "rejected")).toBe(true); await closing;
    expect(client.write).not.toHaveBeenCalled(); expect(client.resize).not.toHaveBeenCalled();
  });
  it.each(["write","resize"] as const)("stops after %s failure without automatic replay", async operation => {
    const {bridge,client}=fixture(); client[operation].mockRejectedValueOnce(new Error("private fixture"));
    const work=operation === "write" ? bridge.write(new Uint8Array([1])) : bridge.resize({rows:24,columns:80});
    await expect(work).rejects.toThrow(`rlogin_bridge_${operation}_failed`); await bridge.close();
    expect(client[operation]).toHaveBeenCalledTimes(1); expect(bridge.snapshot().phase).toBe("closed");
  });
});
describe("Rlogin protocol drift stops the owner", () => {
  it.each([
    ["epoch regression",reply({epoch:"0"}),reply({epoch:"1",requires_reset:true})],
    ["missing reset",reply({epoch:"1"}),reply()],
    ["reset without change",reply({requires_reset:true}),reply()],
    ["unsolicited outstanding credit",reply({awaiting_ack:true}),reply()],
    ["second flight",frame("0","2"),frame()],
    ["sequence replay",frame(),frame()],
  ] as const)("rejects %s and closes", async (_name,bad,first) => {
    const {bridge,client}=fixture(); client.read.mockResolvedValueOnce(first); await bridge.poll();
    if (_name === "sequence replay") bridge.render((_,done) => done());
    client.read.mockResolvedValueOnce(bad); await expect(bridge.poll()).rejects.toThrow("rlogin_bridge_invalid_response");
    await bridge.close(); expect(client.close).toHaveBeenCalledTimes(1);
  });
});
