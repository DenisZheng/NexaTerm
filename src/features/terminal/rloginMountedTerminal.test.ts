import { afterEach, describe, expect, it, vi } from "vitest";
import { RloginBridge } from "./rloginBridge";
import type { RloginClient } from "./rloginBridge";
import { RloginTerminalController } from "./rloginTerminalController";
import { mountRloginTerminal } from "./rloginMountedTerminal";
import type { RloginReadReply } from "./rloginTypes";
let nextId=0;
const cleanups:Array<()=>Promise<void>>=[];
afterEach(async()=>{for(const cleanup of cleanups.splice(0))await cleanup();});
async function turn(){for(let i=0;i<24;i++)await Promise.resolve();}
const reply=(patch:Partial<RloginReadReply>={}):RloginReadReply=>({epoch:"0",phase:"initial_exchange_ready",reason:null,awaiting_ack:false,finished:false,requires_reset:false,frame:null,...patch});
function fixture(){
  const client={read:vi.fn().mockResolvedValue(reply()),write:vi.fn().mockResolvedValue(undefined),writeText:vi.fn().mockResolvedValue(undefined),resize:vi.fn().mockResolvedValue(undefined),close:vi.fn().mockResolvedValue(undefined)} satisfies RloginClient;
  const bridge=new RloginBridge(`bbbbbbbb-bbbb-4bbb-8bbb-${(++nextId).toString().padStart(12,"0")}`,client);
  const controller=new RloginTerminalController(bridge,"utf-8"),events:string[]=[];
  let text!:(data:string)=>void,binary!:(data:string)=>void,resize!:(size:{cols:number;rows:number})=>void;
  const surface={cols:80,rows:24,write:vi.fn<(text:string,onParsed:()=>void)=>void>(),dispose:vi.fn(()=>{events.push("surface-dispose");}),
    onData:vi.fn((callback:typeof text)=>{text=callback;return {dispose:()=>{events.push("data-off");}};}),
    onBinary:vi.fn((callback:typeof binary)=>{binary=callback;return {dispose:()=>{events.push("binary-off");}};}),
    onResize:vi.fn((callback:typeof resize)=>{resize=callback;return {dispose:()=>{events.push("resize-off");}};}),
  };
  let ready=true,active=true,unmount:(()=>void)|null=null;
  const adapter={controller,inputAvailable:()=>ready},failure=vi.fn();
  const mount=()=>{unmount=mountRloginTerminal(surface,adapter,{canResize:()=>active,onFailure:failure});return unmount;};
  cleanups.push(async()=>{unmount?.();await controller.close();});
  return {client,bridge,controller,surface,adapter,failure,events,mount,text:(s:string)=>text(s),binary:(s:string)=>binary(s),resize:(cols:number,rows:number)=>resize({cols,rows}),setReady:(value:boolean)=>{ready=value;},setActive:(value:boolean)=>{active=value;}};
}
describe("private mounted Rlogin IO binding",()=>{
  it("writes credited output directly and ACKs only after the exact parser callback",async()=>{
    const f=fixture();f.mount();f.client.read.mockResolvedValueOnce(reply({awaiting_ack:true,frame:{epoch:"0",sequence:"1",data:[65]}})).mockResolvedValueOnce(reply({awaiting_ack:true}));
    await f.controller.tick();expect(f.surface.write.mock.calls[0][0]).toBe("A");
    await f.controller.tick();expect(f.client.read.mock.lastCall?.[0].ack).toBeNull();
    f.surface.write.mock.calls[0][1]();await f.controller.tick();expect(f.client.read.mock.lastCall?.[0].ack).toEqual({epoch:"0",sequence:"1"});
  });
  it("stops handlers and truly disposes before discarding an outstanding write",async()=>{
    const f=fixture(),unmount=f.mount();f.client.read.mockResolvedValueOnce(reply({awaiting_ack:true,frame:{epoch:"0",sequence:"1",data:[65]}}));await f.controller.tick();
    const stale=f.surface.write.mock.calls[0][1];f.surface.dispose.mockImplementation(()=>{f.events.push("surface-dispose");stale();expect(f.bridge.snapshot()).toMatchObject({frame:"writing",awaitingAck:false});});
    unmount();unmount();expect(f.events).toEqual(["data-off","binary-off","resize-off","surface-dispose"]);expect(f.surface.dispose).toHaveBeenCalledTimes(1);
    expect(f.bridge.snapshot()).toMatchObject({frame:null,awaitingAck:true});stale();expect(f.bridge.snapshot().awaitingAck).toBe(true);expect(f.client.close).not.toHaveBeenCalled();
  });
  it("uses one ordered text/raw input queue and preserves literal controls and local-escape text",async()=>{
    const f=fixture();let release!:()=>void;const pending=new Promise<void>(r=>{release=r;});f.client.writeText.mockReturnValueOnce(pending);f.mount();
    f.text("~.\r\x1b[A中");f.binary("\0\x80\xff");f.text("tail");await turn();expect(f.client.writeText).toHaveBeenCalledTimes(1);expect(f.client.write).not.toHaveBeenCalled();
    release();await turn();expect(f.client.writeText.mock.calls.map(c=>c[0].data)).toEqual(["~.\r\x1b[A中","tail"]);expect(f.client.write.mock.calls[0][0].data).toEqual([0,128,255]);
  });
  it("rejects input and resize before readiness and after pane disposal without replay",async()=>{
    const f=fixture();f.setReady(false);const unmount=f.mount();f.text("secret input");f.binary("\xff");f.resize(90,30);await turn();
    expect(f.client.writeText).not.toHaveBeenCalled();expect(f.client.write).not.toHaveBeenCalled();expect(f.client.resize).not.toHaveBeenCalled();
    f.setReady(true);f.text("fresh");await turn();expect(f.client.writeText.mock.calls.map(c=>c[0].data)).toEqual(["fresh"]);
    unmount();f.text("late");f.binary("\x80");f.resize(100,40);await turn();expect(f.client.writeText).toHaveBeenCalledTimes(1);expect(f.client.write).not.toHaveBeenCalled();expect(f.client.resize).not.toHaveBeenCalled();
  });
  it("sends initial/current size only for an active renderer through native resize",async()=>{
    const f=fixture();f.setActive(false);f.mount();f.resize(90,30);await turn();expect(f.client.resize).not.toHaveBeenCalled();
    f.setActive(true);f.resize(100,40);await turn();expect(f.client.resize.mock.lastCall?.[0].window).toEqual({columns:100,rows:40,x_pixels:0,y_pixels:0});
  });
  it("disposes a rejected second surface while retaining the first renderer",()=>{
    const f=fixture();f.mount();const second={...f.surface,dispose:vi.fn()};
    expect(()=>mountRloginTerminal(second,f.adapter,{canResize:()=>true,onFailure:f.failure})).toThrow("rlogin_terminal_renderer_busy");
    expect(second.dispose).toHaveBeenCalledTimes(1);expect(f.surface.dispose).not.toHaveBeenCalled();expect(f.controller.snapshot().attached).toBe(true);
  });
  it("invalid raw input closes with a fixed code and never enters the native write",async()=>{
    const f=fixture();f.mount();f.binary("\u0100private");await turn();
    expect(f.client.write).not.toHaveBeenCalled();expect(f.failure).toHaveBeenCalledWith("rlogin_terminal_input_invalid");expect(f.client.close).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(f.controller.snapshot())).not.toContain("private");
  });
  it("actual surface disposal failure uses the controller failure/cleanup path",async()=>{
    const f=fixture(),unmount=f.mount();f.surface.dispose.mockImplementation(()=>{throw Error("private disposal");});unmount();await turn();
    expect(f.controller.snapshot().terminalError).toBe("rlogin_terminal_renderer_failed");expect(f.client.close).toHaveBeenCalledTimes(1);expect(JSON.stringify(f.controller.snapshot())).not.toContain("private");
  });
});
