import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RloginWorkspaceSessions } from "./rloginWorkspaceSessions";
import type { RloginConsentRequest, RloginRuntimeModule } from "./rloginWorkspaceSessions";
import { RloginAttemptOwner } from "../terminal/rloginAttemptOwner";
import { defaultAdvancedConfig } from "../connections/connectionTypes";
import type { ConnectionProfile } from "../connections/connectionTypes";
let sequence=0;
const releases:Array<()=>void>=[],services:RloginWorkspaceSessions[]=[];
function gate<T>(fallback:T){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});releases.push(()=>resolve(fallback));return {promise,resolve};}
async function turn(){for(let i=0;i<32;i++)await Promise.resolve();}
beforeEach(()=>vi.useFakeTimers());
afterEach(async()=>{for(const release of releases.splice(0))release();for(const service of services.splice(0))await service.dispose().catch(()=>{});vi.useRealTimers();});
function fixture(){
  const profile:ConnectionProfile={id:"saved-profile",name:"Fixture",protocol:"rlogin",host:"127.0.0.1",port:513,username:"RemoteCase",credential_mode:"prompt",proxy:{kind:"none"},jump:{kind:"none"},advanced:{...defaultAdvancedConfig,terminal_encoding:"big5"},rlogin:{local_address:"127.0.0.1",local_user:"LocalCase",terminal:"vt100",speed:9600},is_favorite:false,created_at:"t",updated_at:"t"};
  const client={capabilities:vi.fn().mockResolvedValue({native_core:true,exact_flush:true,runtime_available:true,terminal_available:true,dns_available:false,reason:null}),reserve:vi.fn().mockImplementation(async()=>`dddddddd-dddd-4ddd-8ddd-${(++sequence).toString().padStart(12,"0")}`),start:vi.fn().mockResolvedValue(undefined),read:vi.fn().mockResolvedValue({epoch:"0",phase:"initial_exchange_ready",reason:null,awaiting_ack:false,finished:false,requires_reset:false,frame:null}),write:vi.fn().mockResolvedValue(undefined),writeText:vi.fn().mockResolvedValue(undefined),resize:vi.fn().mockResolvedValue(undefined),close:vi.fn().mockResolvedValue(undefined)};
  const runtime={createRloginAttempt:vi.fn((consent:RloginConsentRequest)=>new RloginAttemptOwner(client,consent))} satisfies RloginRuntimeModule;
  const load=vi.fn().mockResolvedValue(runtime),consent=vi.fn().mockResolvedValue(true),onState=vi.fn();
  const service=new RloginWorkspaceSessions(load,consent,onState);services.push(service);return {profile,client,runtime,load,consent,onState,service,window:{rows:24,columns:80}};
}
describe("Rlogin logical workspace lifetime",()=>{
  it("pins independent metadata/window before lazy loading and coalesces the pending connect",async()=>{
    const f=fixture(),loaded=gate(f.runtime);f.load.mockReturnValueOnce(loaded.promise);
    f.profile.inline_password="private fixture";const first=f.service.connect("tab",f.profile,f.window);expect(f.service.connect("tab",f.profile,f.window)).toBe(first);
    f.profile.host="192.0.2.99";f.profile.rlogin!.local_user="changed";f.profile.advanced.terminal_encoding="utf-8";f.window.columns=120;
    loaded.resolve(f.runtime);await first;
    expect(f.client.reserve.mock.calls[0][0]).toMatchObject({target_address:"127.0.0.1",local_user:"LocalCase",terminal_encoding:"big5",window:{rows:24,columns:80}});
    expect(JSON.stringify(f.consent.mock.calls)).not.toContain("private");expect(f.service.getState("tab")?.phase).toBe("initial_exchange_ready");expect(f.load).toHaveBeenCalledTimes(1);
  });
  it("waits a cancelled lazy import and never creates an owner or transport from its late module",async()=>{
    const f=fixture(),loaded=gate(f.runtime);f.load.mockReturnValueOnce(loaded.promise);const connect=f.service.connect("tab",f.profile,f.window);await turn();
    let done=false;const close=f.service.close("tab").then(()=>{done=true;});expect(()=>f.service.forget("tab")).toThrow("rlogin_entry_cleanup_pending");await turn();expect(done).toBe(false);
    loaded.resolve(f.runtime);await Promise.all([connect,close]);expect(f.runtime.createRloginAttempt).not.toHaveBeenCalled();expect(f.client.reserve).not.toHaveBeenCalled();expect(f.consent).not.toHaveBeenCalled();
    expect(f.service.getState("tab")).toMatchObject({phase:"closed",closeIntent:true});f.service.forget("tab");expect(f.service.getState("tab")).toBeNull();
  });
  it("handles close triggered synchronously by the loading publication before any lazy work",async()=>{
    const f=fixture();let close:Promise<void>|undefined;f.onState.mockImplementation((_id,state)=>{if(state.phase==="loading")close=f.service.close("tab");});
    await f.service.connect("tab",f.profile,f.window);await close;expect(f.load).not.toHaveBeenCalled();expect(f.client.reserve).not.toHaveBeenCalled();expect(f.service.getState("tab")?.phase).toBe("closed");
  });
  it("cancel before owner creation retains an unconnected tab and requires an explicit fresh connect",async()=>{
    const f=fixture(),loaded=gate(f.runtime);f.load.mockReturnValueOnce(loaded.promise);const connect=f.service.connect("tab",f.profile,f.window);await turn();const cancel=f.service.cancel("tab");
    loaded.resolve(f.runtime);await Promise.all([connect,cancel]);expect(f.service.getState("tab")?.phase).toBe("cancelled");expect(f.runtime.createRloginAttempt).not.toHaveBeenCalled();
    await f.service.connect("tab",f.profile,f.window);expect(f.runtime.createRloginAttempt).toHaveBeenCalledTimes(1);expect(f.consent).toHaveBeenCalledTimes(1);expect(f.client.start).toHaveBeenCalledTimes(1);
  });
  it("closes an issued native start immediately, but retains the slot until start and cleanup finish",async()=>{
    const f=fixture(),start=gate(undefined);f.client.start.mockReturnValueOnce(start.promise);const connect=f.service.connect("tab",f.profile,f.window);await turn();
    let done=false;const close=f.service.close("tab").then(()=>{done=true;});await turn();expect(f.client.close).toHaveBeenCalledTimes(1);expect(done).toBe(false);expect(()=>f.service.forget("tab")).toThrow("rlogin_entry_cleanup_pending");
    start.resolve(undefined);await Promise.all([connect,close]);f.service.forget("tab");expect(f.service.getOwner("tab")).toBeNull();
  });
  it("keeps a failed close owner/UUID, blocks reconnect/removal and retries that same cleanup",async()=>{
    const f=fixture();await f.service.connect("tab",f.profile,f.window);const owner=f.service.getOwner("tab"),nativeId=await f.client.reserve.mock.results[0].value;
    f.client.close.mockRejectedValueOnce(Error("private cleanup"));await expect(f.service.close("tab")).rejects.toThrow("rlogin_attempt_cleanup_failed");
    expect(f.service.getOwner("tab")).toBe(owner);expect(f.service.getState("tab")).toMatchObject({phase:"cleanup_failed",closeIntent:true});expect(()=>f.service.forget("tab")).toThrow("rlogin_entry_cleanup_pending");
    await expect(f.service.connect("tab",f.profile,f.window)).rejects.toThrow("rlogin_entry_cleanup_pending");expect(f.client.reserve).toHaveBeenCalledTimes(1);
    await f.service.close("tab");expect(f.client.close.mock.calls.map(call=>call[0])).toEqual([nativeId,nativeId]);f.service.forget("tab");expect(f.service.getState("tab")).toBeNull();
  });
  it("keeps same-profile siblings isolated when only one logical instance closes",async()=>{
    const f=fixture();await Promise.all([f.service.connect("a",f.profile,f.window),f.service.connect("b",f.profile,f.window)]);
    const a=await f.client.reserve.mock.results[0].value,b=await f.client.reserve.mock.results[1].value;expect(a).not.toBe(b);
    await f.service.close("a");f.service.forget("a");expect(f.client.close.mock.calls.map(call=>call[0])).toEqual([a]);expect(f.service.getState("b")?.phase).toBe("initial_exchange_ready");expect(vi.getTimerCount()).toBe(1);
  });
  it("does not auto-retry a failed module load but permits an explicit user retry",async()=>{
    const f=fixture();f.load.mockRejectedValueOnce(Error("private module path"));await expect(f.service.connect("tab",f.profile,f.window)).rejects.toThrow("rlogin_entry_failed");
    expect(f.service.getState("tab")).toMatchObject({phase:"failed",reason:"rlogin_entry_unavailable"});expect(f.load).toHaveBeenCalledTimes(1);
    f.profile.host="192.0.2.2";await f.service.connect("tab",f.profile,f.window);expect(f.load).toHaveBeenCalledTimes(2);expect(f.client.reserve.mock.calls[0][0].target_address).toBe("192.0.2.2");
  });
  it("allows a module-load failure to close without a ghost tab or native cleanup",async()=>{
    const f=fixture();f.load.mockRejectedValueOnce(Error("private module"));await f.service.connect("tab",f.profile,f.window).catch(()=>{});await f.service.close("tab");f.service.forget("tab");expect(f.client.close).not.toHaveBeenCalled();
  });
  it("retains failed disposal for retry while blocking new connections and UI notifications",async()=>{
    const f=fixture();await f.service.connect("tab",f.profile,f.window);f.client.close.mockRejectedValueOnce(Error("private cleanup"));f.onState.mockClear();
    await expect(f.service.dispose()).rejects.toThrow("rlogin_attempt_cleanup_failed");expect(f.service.getOwner("tab")).not.toBeNull();expect(f.onState).not.toHaveBeenCalled();
    await expect(f.service.connect("other",f.profile,f.window)).rejects.toThrow("rlogin_entry_unavailable");await f.service.dispose();expect(f.service.getOwner("tab")).toBeNull();expect(f.client.close).toHaveBeenCalledTimes(2);
  });
  it("rejects non-Rlogin profiles without loading a provider",async()=>{
    const f=fixture();await expect(f.service.connect("tab",{...f.profile,protocol:"ssh"},f.window)).rejects.toThrow("rlogin_entry_invalid_config");expect(f.load).not.toHaveBeenCalled();
  });
});
