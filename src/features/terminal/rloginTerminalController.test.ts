import { afterEach, describe, expect, it, vi } from "vitest";
import { RloginBridge } from "./rloginBridge";
import type { RloginClient } from "./rloginBridge";
import { RloginTerminalController } from "./rloginTerminalController";
import type { RloginReadReply } from "./rloginTypes";
function reply(overrides:Partial<RloginReadReply>={}):RloginReadReply {
  return {epoch:"0",phase:"initial_exchange_ready",reason:null,awaiting_ack:false,finished:false,requires_reset:false,frame:null,...overrides};
}
function frame(data:number[],sequence="1",epoch="0") {
  return reply({epoch,awaiting_ack:true,frame:{epoch,sequence,data}});
}
const tracked:RloginTerminalController[]=[], release:(()=>void)[]=[];
let serial=0;
function gate<T>(fallback:T) {
  let resolve!:(v:T)=>void; const promise=new Promise<T>(r => {resolve=r;}); release.push(() => resolve(fallback)); return {resolve,promise};
}
function fixture() {
  const client={read:vi.fn<RloginClient["read"]>().mockResolvedValue(reply()),write:vi.fn<RloginClient["write"]>().mockResolvedValue(),
    writeText:vi.fn<RloginClient["writeText"]>().mockResolvedValue(),resize:vi.fn<RloginClient["resize"]>().mockResolvedValue(),close:vi.fn<RloginClient["close"]>().mockResolvedValue()};
  const id=`20000000-0000-4000-8000-${(++serial).toString().padStart(12,"0")}`;
  const bridge=new RloginBridge(id,client),controller=new RloginTerminalController(bridge,"utf-8"); tracked.push(controller);
  const renderer={write:vi.fn<(text:string,done:()=>void)=>void>(),dispose:vi.fn()};
  return {client,bridge,controller,renderer};
}
async function turns() { for (let i=0;i<8;i++) await Promise.resolve(); }
afterEach(async () => {
  release.splice(0).forEach(done => done()); await Promise.all(tracked.splice(0).map(c => c.close().catch(() => c.close())));
});
describe("Rlogin credited terminal output",() => {
  it("coalesces ticks, creates no implicit loop and retains one raw frame without a renderer",async () => {
    const {client,controller,bridge}=fixture(),reading=gate(frame([65])); client.read.mockReturnValueOnce(reading.promise);
    const first=controller.tick(),second=controller.tick(); expect(first).toBe(second); reading.resolve(frame([65])); await first;
    expect(bridge.snapshot().frame).toBe("ready"); expect(client.read).toHaveBeenCalledTimes(1);
    client.read.mockResolvedValueOnce(reply({awaiting_ack:true})); await controller.tick(); expect(client.read.mock.lastCall?.[0].ack).toBeNull();
    expect(controller.snapshot().attached).toBe(false);
  });
  it("keeps an incremental suffix but ACKs visible text only after parsing",async () => {
    const {client,controller,renderer}=fixture(); controller.attach(renderer);
    client.read.mockResolvedValueOnce(frame([0xe4])); await controller.tick(); expect(renderer.write).not.toHaveBeenCalled();
    client.read.mockResolvedValueOnce(frame([0xb8,0xad],"2")); await controller.tick();
    expect(client.read.mock.lastCall?.[0].ack).toEqual({epoch:"0",sequence:"1"}); expect(renderer.write.mock.calls[0][0]).toBe("中");
    client.read.mockResolvedValueOnce(reply({awaiting_ack:true})); await controller.tick(); expect(client.read.mock.lastCall?.[0].ack).toBeNull();
    renderer.write.mock.calls[0][1](); await controller.tick(); expect(client.read.mock.lastCall?.[0].ack).toEqual({epoch:"0",sequence:"2"});
  });
  it("resets a held character on an exact epoch change before rendering new bytes",async () => {
    const {client,controller,renderer}=fixture(); controller.attach(renderer);
    client.read.mockResolvedValueOnce(frame([0xe4])); await controller.tick();
    client.read.mockResolvedValueOnce(reply({epoch:"9007199254740993",requires_reset:true})); await controller.tick();
    client.read.mockResolvedValueOnce(frame([65],"2","9007199254740993")); await controller.tick();
    expect(renderer.write.mock.calls.map(call => call[0])).toEqual(["A"]); renderer.write.mock.calls[0][1]();
  });
  it("discards an old ready frame on flush without calling the renderer",async () => {
    const {client,controller,renderer}=fixture(); client.read.mockResolvedValueOnce(frame([65])); await controller.tick(); controller.attach(renderer);
    client.read.mockResolvedValueOnce(reply({epoch:"1",requires_reset:true,awaiting_ack:true})); await controller.tick(); expect(renderer.write).not.toHaveBeenCalled();
    client.read.mockResolvedValueOnce(frame([66],"2","1")); await controller.tick();
    expect(client.read.mock.lastCall?.[0].ack).toEqual({epoch:"0",sequence:"1"}); expect(renderer.write.mock.calls[0][0]).toBe("B");
  });
  it("retains an already submitted frame through flush and never clears displayed content",async () => {
    const {client,controller,renderer}=fixture(); controller.attach(renderer); client.read.mockResolvedValueOnce(frame([65])); await controller.tick();
    client.read.mockResolvedValueOnce(reply({epoch:"1",requires_reset:true,awaiting_ack:true})); await controller.tick();
    expect(client.read.mock.lastCall?.[0].ack).toBeNull(); expect(renderer.dispose).not.toHaveBeenCalled(); expect(renderer.write).toHaveBeenCalledTimes(1);
    renderer.write.mock.calls[0][1](); client.read.mockResolvedValueOnce(frame([66],"2","1")); await controller.tick();
    expect(client.read.mock.lastCall?.[0].ack).toEqual({epoch:"0",sequence:"1"}); expect(renderer.write.mock.calls[1][0]).toBe("B");
  });
  it("waits actual renderer disposal before discarding its write, then ignores late callbacks",async () => {
    const {client,controller,bridge,renderer}=fixture(); const detach=controller.attach(renderer);
    client.read.mockResolvedValueOnce(frame([65])); await controller.tick(); const stale=renderer.write.mock.calls[0][1];
    renderer.dispose.mockImplementation(() => {stale();expect(bridge.snapshot()).toMatchObject({frame:"writing",awaitingAck:false});});
    detach(); detach(); expect(renderer.dispose).toHaveBeenCalledTimes(1); expect(bridge.snapshot()).toMatchObject({frame:null,awaitingAck:true});
    const next={write:vi.fn<(text:string,done:()=>void)=>void>(),dispose:vi.fn()}; controller.attach(next);
    client.read.mockResolvedValueOnce(frame([66],"2")); await controller.tick(); stale();
    expect(bridge.snapshot()).toMatchObject({frame:"writing",awaitingAck:false}); expect(next.write.mock.calls[0][0]).toBe("B");
    next.write.mock.calls[0][1]();
  });
  it("rejects duplicate renderer attachment without replacing the current owner",() => {
    const {controller,renderer}=fixture(); controller.attach(renderer);
    expect(() => controller.attach({write:vi.fn(),dispose:vi.fn()})).toThrow("rlogin_terminal_renderer_busy"); expect(renderer.dispose).not.toHaveBeenCalled();
  });
  it.each(["write","dispose"] as const)("closes on renderer %s failure with only a fixed error",async operation => {
    const {client,controller,renderer}=fixture(); renderer[operation].mockImplementation(() => {throw Error("private renderer fixture");});
    const detach=controller.attach(renderer); client.read.mockResolvedValueOnce(frame([65]));
    if (operation==="write") await expect(controller.tick()).rejects.toThrow("rlogin_terminal_renderer_failed");
    else {await controller.tick();detach();}
    await controller.close(); expect(controller.snapshot().terminalError).toBe("rlogin_terminal_renderer_failed"); expect(client.close).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(controller.snapshot())).not.toContain("private");
  });
  it("closes on invalid output and rejects a truncated EOF suffix without replacement",async () => {
    const invalid=fixture(); invalid.controller.attach(invalid.renderer); invalid.client.read.mockResolvedValueOnce(frame([255]));
    await expect(invalid.controller.tick()).rejects.toThrow("rlogin_terminal_decode_failed"); await invalid.controller.close(); expect(invalid.renderer.write).not.toHaveBeenCalled();
    const tail=fixture(); tail.controller.attach(tail.renderer); tail.client.read.mockResolvedValueOnce(frame([0xe4])); await tail.controller.tick();
    tail.client.read.mockResolvedValueOnce(reply({phase:"closed",finished:true}));
    await expect(tail.controller.tick()).rejects.toThrow("rlogin_terminal_decode_failed"); await tail.controller.close(); expect(tail.renderer.write).not.toHaveBeenCalled();
  });
  it("renders and parses the EOF tail before ACK and actual cleanup",async () => {
    const {client,controller,renderer}=fixture(); controller.attach(renderer); client.read.mockResolvedValueOnce({...frame([65]),phase:"closed"}); await controller.tick();
    expect(client.close).not.toHaveBeenCalled(); renderer.write.mock.calls[0][1](); client.read.mockResolvedValueOnce(reply({phase:"closed",finished:true})); await controller.tick();
    expect(client.read.mock.lastCall?.[0].ack).toEqual({epoch:"0",sequence:"1"}); expect(controller.snapshot().phase).toBe("closed");
    expect(controller.snapshot().status).not.toHaveProperty("exit_code"); expect(controller.snapshot().status).not.toHaveProperty("authenticated");
  });
  it("never retries a lost read and ignores a late output reply after close",async () => {
    const first=fixture(); first.client.read.mockRejectedValueOnce(Error("private wire fixture"));
    await expect(first.controller.tick()).rejects.toThrow("rlogin_terminal_read_failed"); await first.controller.close(); await first.controller.tick(); expect(first.client.read).toHaveBeenCalledTimes(1);
    const next=fixture(); next.controller.attach(next.renderer); const pending=gate(frame([65])); next.client.read.mockReturnValueOnce(pending.promise);
    const ticking=next.controller.tick(),closing=next.controller.close(); pending.resolve(frame([65])); await Promise.all([ticking,closing]); expect(next.renderer.write).not.toHaveBeenCalled();
  });
});
describe("Rlogin terminal input, resize and cleanup",() => {
  it("pins ordered Unicode chunks and preserves Enter/escape/control data",async () => {
    const {client,controller}=fixture(),pending=gate<void>(undefined); client.writeText.mockReturnValueOnce(pending.promise);
    const text="x".repeat(4095)+"😀中\r\x1b[A\0"; const sending=controller.send(text); await turns();
    expect(client.writeText).toHaveBeenCalledTimes(1); pending.resolve(); await sending;
    expect(client.writeText.mock.calls.map(call => call[0].data).join("")).toBe(text); expect(client.write).not.toHaveBeenCalled();
  });
  it("stops on input overflow and never admits a prefix of the rejected paste",async () => {
    const {client,controller}=fixture(); await expect(controller.send("x".repeat(128*1024+1))).rejects.toThrow("rlogin_terminal_input_full");
    await controller.close(); expect(client.writeText).not.toHaveBeenCalled(); expect(client.close).toHaveBeenCalledTimes(1);
    await expect(controller.send("retry")).rejects.toThrow("rlogin_terminal_input_full");
  });
  it("waits issued text IO after rejecting queued callers on close",async () => {
    const {client,controller}=fixture(),pending=gate<void>(undefined); client.writeText.mockReturnValueOnce(pending.promise);
    const sending=controller.send("x".repeat(8192)),settled=Promise.allSettled([sending]); await turns(); let done=false;
    const closing=controller.close().then(() => {done=true;}); expect((await settled)[0].status).toBe("rejected"); await turns(); expect(done).toBe(false);
    pending.resolve(); await closing; expect(client.writeText).toHaveBeenCalledTimes(1); expect(controller.snapshot().input.bytes).toBe(0);
  });
  it("surfaces ambiguous input failure without replay or raw message",async () => {
    const {client,controller}=fixture(); client.writeText.mockRejectedValueOnce(Error("private input fixture"));
    await expect(controller.send("private typed fixture")).rejects.toThrow("rlogin_terminal_input_failed"); await controller.close();
    expect(client.writeText).toHaveBeenCalledTimes(1); expect(controller.snapshot().terminalError).toBe("rlogin_terminal_input_failed"); expect(JSON.stringify(controller.snapshot())).not.toContain("private");
  });
  it("coalesces resize to one immutable latest size while a native call is outstanding",async () => {
    const {client,controller}=fixture(),pending=gate<void>(undefined); client.resize.mockReturnValueOnce(pending.promise);
    const first=controller.resize({rows:24,columns:80}); await turns();
    const latest={rows:40,columns:100},second=controller.resize({rows:30,columns:90}),third=controller.resize(latest); latest.rows=1;
    expect(second).toBe(first); expect(third).toBe(first); expect(client.resize).toHaveBeenCalledTimes(1); pending.resolve(); await first;
    expect(client.resize.mock.calls.map(call => call[0].window)).toEqual([{rows:24,columns:80,x_pixels:0,y_pixels:0},{rows:40,columns:100,x_pixels:0,y_pixels:0}]);
  });
  it("close waits issued resize and discards the newest unissued size",async () => {
    const {client,controller}=fixture(),pending=gate<void>(undefined); client.resize.mockReturnValueOnce(pending.promise);
    const resizing=controller.resize({rows:24,columns:80}); await turns(); void controller.resize({rows:40,columns:100});
    let done=false; const closing=controller.close().then(() => {done=true;}); await turns(); expect(done).toBe(false);
    pending.resolve(); await Promise.all([resizing,closing]); expect(client.resize).toHaveBeenCalledTimes(1);
  });
  it("rejects invalid size and retains cleanup failure for explicit retry",async () => {
    const invalid=fixture(); await expect(invalid.controller.resize({rows:0,columns:80})).rejects.toThrow("rlogin_terminal_resize_failed");
    await invalid.controller.close(); expect(invalid.client.resize).not.toHaveBeenCalled();
    const retry=fixture(); retry.client.close.mockRejectedValueOnce(Error("private cleanup fixture"));
    await expect(retry.controller.close()).rejects.toThrow("rlogin_bridge_close_failed"); expect(retry.controller.snapshot().phase).toBe("close_failed");
    await retry.controller.close(); expect(retry.client.close).toHaveBeenCalledTimes(2);
  });
});
