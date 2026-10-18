import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultAdvancedConfig } from "../connections/connectionTypes";
import type { ConnectionProfile } from "../connections/connectionTypes";
import { RloginAttemptOwner } from "./rloginAttemptOwner";
import type { RloginAttemptClient } from "./rloginAttemptOwner";
import type { RloginReadReply } from "./rloginTypes";
let serial=0;
const id=()=>`aaaaaaaa-aaaa-4aaa-8aaa-${(++serial).toString().padStart(12,"0")}`;
const cleanups:Array<()=>Promise<unknown>>=[];
const releases:Array<()=>void>=[];
function gate<T>(fallback:T) { let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});releases.push(()=>resolve(fallback));return {promise,resolve}; }
async function turn() { for(let i=0;i<24;i++) await Promise.resolve(); }
const reply=(patch:Partial<RloginReadReply>={}):RloginReadReply=>({epoch:"0",phase:"starting",reason:null,awaiting_ack:false,finished:false,requires_reset:false,frame:null,...patch});
function fixture() {
  const profile:ConnectionProfile={id:"logical-profile",name:"Fixture",protocol:"rlogin",host:"127.0.0.1",port:513,username:"RemoteCase",credential_mode:"prompt",proxy:{kind:"none"},jump:{kind:"none"},advanced:{...defaultAdvancedConfig,terminal_encoding:"big5"},rlogin:{local_address:"127.0.0.1",local_user:"LocalCase",terminal:"vt100",speed:9600},is_favorite:false,created_at:"t",updated_at:"t"};
  const client={capabilities:vi.fn().mockResolvedValue({native_core:true,exact_flush:true,runtime_available:true,terminal_available:true,dns_available:false,reason:null}),reserve:vi.fn().mockImplementation(async()=>id()),start:vi.fn().mockResolvedValue(undefined),read:vi.fn().mockResolvedValue(reply()),write:vi.fn().mockResolvedValue(undefined),writeText:vi.fn().mockResolvedValue(undefined),resize:vi.fn().mockResolvedValue(undefined),close:vi.fn().mockResolvedValue(undefined)} satisfies RloginAttemptClient;
  const consent=vi.fn().mockResolvedValue(true);const owner=new RloginAttemptOwner(client,consent);
  cleanups.push(()=>owner.close().catch(()=>{}));return {profile,client,consent,owner,window:{rows:24,columns:80}};
}
beforeEach(()=>vi.useFakeTimers());
afterEach(async()=>{for(const release of releases.splice(0))release();for(const close of cleanups.splice(0))await close();vi.useRealTimers();});

describe("Rlogin workspace attempt lifecycle",()=>{
  it("freezes target/config/encoding/window before consent and never carries profile secrets",async()=>{
    const f=fixture(),allow=gate(false);f.consent.mockReturnValue(allow.promise);
    const connected=f.owner.connect(f.profile,f.window);await turn();
    const target=f.consent.mock.calls[0][0];expect(Object.isFrozen(target)).toBe(true);expect(Object.isFrozen(target.window)).toBe(true);
    f.profile.host="192.0.2.99";f.profile.rlogin!.local_user="changed";f.profile.advanced.terminal_encoding="utf-8";f.window.columns=120;
    allow.resolve(true);await connected;
    expect(f.client.reserve.mock.calls[0][0]).toEqual({local_address:"127.0.0.1",target_address:"127.0.0.1",port:513,local_user:"LocalCase",remote_user:"RemoteCase",terminal:"vt100",speed:9600,terminal_encoding:"big5",window:{rows:24,columns:80},allow_plaintext:true});
    expect(target).not.toHaveProperty("id");expect(target).not.toHaveProperty("credential_mode");expect(target).not.toHaveProperty("allow_plaintext");
  });
  it.each(["runtime_available","terminal_available"])("refuses unavailable %s without asking consent or reserving",async field=>{
    const f=fixture();f.client.capabilities.mockResolvedValue({...await f.client.capabilities(),[field]:false});
    await f.owner.connect(f.profile,f.window);expect(f.owner.getSnapshot()).toMatchObject({phase:"failed",reason:"rlogin_attempt_unavailable"});
    expect(f.consent).not.toHaveBeenCalled();expect(f.client.reserve).not.toHaveBeenCalled();expect(f.client.start).not.toHaveBeenCalled();
  });
  it("declined consent creates no transport",async()=>{
    const f=fixture();f.consent.mockResolvedValue(false);await f.owner.connect(f.profile,f.window);
    expect(f.owner.getSnapshot().phase).toBe("cancelled");expect(f.client.reserve).not.toHaveBeenCalled();expect(f.client.close).not.toHaveBeenCalled();
  });
  it("retains a fixed consent infrastructure failure instead of treating it as user approval",async()=>{
    const f=fixture();f.consent.mockRejectedValue({code:"rlogin_session_busy",raw_message:"private consent fixture"});await f.owner.connect(f.profile,f.window);
    expect(f.owner.getSnapshot()).toMatchObject({phase:"failed",reason:"rlogin_session_busy"});expect(f.client.reserve).not.toHaveBeenCalled();
    expect(JSON.stringify(f.owner.getSnapshot())).not.toContain("private");
  });
  it("cancels an unresolved consent and ignores its late approval",async()=>{
    const f=fixture(),allow=gate(false);f.consent.mockReturnValue(allow.promise);const connected=f.owner.connect(f.profile,f.window);await turn();
    const signal=f.consent.mock.calls[0][1];await f.owner.cancel();await connected;expect(signal.aborted).toBe(true);
    allow.resolve(true);await turn();expect(f.client.reserve).not.toHaveBeenCalled();expect(f.owner.getSnapshot().phase).toBe("cancelled");
  });
  it("waits a late reserve and only closes its old UUID, never starts it",async()=>{
    const f=fixture(),reserved=id(),reserve=gate(reserved);f.client.reserve.mockReturnValueOnce(reserve.promise);
    const connected=f.owner.connect(f.profile,f.window);await turn();expect(f.owner.getSnapshot().phase).toBe("reserving");
    let done=false;const cancelled=f.owner.cancel().then(()=>{done=true;});await turn();expect(done).toBe(false);
    reserve.resolve(reserved);await Promise.all([connected,cancelled]);expect(f.client.start).not.toHaveBeenCalled();expect(f.client.close).toHaveBeenCalledExactlyOnceWith(reserved);
    expect(f.owner.getSnapshot().phase).toBe("cancelled");expect(vi.getTimerCount()).toBe(0);
  });
  it("cancels native start immediately but waits both start and cleanup completions",async()=>{
    const f=fixture(),start=gate(undefined);f.client.start.mockReturnValueOnce(start.promise);
    const connected=f.owner.connect(f.profile,f.window);await turn();expect(f.owner.getSnapshot().phase).toBe("starting");
    let done=false;const closed=f.owner.close().then(()=>{done=true;});await turn();expect(f.client.close).toHaveBeenCalledTimes(1);expect(done).toBe(false);start.resolve(undefined);await Promise.all([connected,closed]);
    expect(f.client.close).toHaveBeenCalledTimes(1);expect(f.client.read).not.toHaveBeenCalled();expect(f.owner.getSnapshot().phase).toBe("closed");
  });
  it.each(["reserving","starting"] as const)("honors cancellation from a %s publication before issuing new IO",async phase=>{
    const f=fixture();f.owner.subscribe(()=>{if(f.owner.getSnapshot().phase===phase)void f.owner.cancel().catch(()=>{});});
    await f.owner.connect(f.profile,f.window);
    if(phase==="reserving") expect(f.client.reserve).not.toHaveBeenCalled();
    expect(f.client.start).not.toHaveBeenCalled();expect(f.owner.getSnapshot().phase).toBe("cancelled");
  });
  it("retains failed cleanup, blocks replacement while it fails and retries the same owner",async()=>{
    const f=fixture();f.client.start.mockRejectedValueOnce({code:"legacy_socket_access_denied",raw_message:"private fixture"});f.client.close.mockRejectedValue(Error("private cleanup"));
    await expect(f.owner.connect(f.profile,f.window)).rejects.toThrow("rlogin_attempt_cleanup_failed");
    const controller=f.owner.getController(),reserved=f.client.reserve.mock.results[0].value;
    expect(f.owner.getSnapshot().phase).toBe("cleanup_failed");await expect(f.owner.connect(f.profile,f.window)).rejects.toThrow("rlogin_attempt_cleanup_failed");
    expect(f.client.reserve).toHaveBeenCalledTimes(1);expect(f.owner.getController()).toBe(controller);expect(f.consent).toHaveBeenCalledTimes(1);
    const oldId=await reserved;expect(f.client.close.mock.calls.every(call=>call[0]===oldId)).toBe(true);
    f.client.close.mockResolvedValue(undefined);await f.owner.close();await f.owner.connect(f.profile,f.window);
    expect(f.consent).toHaveBeenCalledTimes(2);expect(f.owner.getSnapshot().generation).toBe(2);expect(JSON.stringify(f.owner.getSnapshot())).not.toContain("private");
  });
  it("cancels a new connect waiting for the previous generation cleanup",async()=>{
    const f=fixture();await f.owner.connect(f.profile,f.window);const closed=gate(undefined);f.client.close.mockReturnValueOnce(closed.promise);
    const next=f.owner.connect(f.profile,f.window);await turn();const cancel=f.owner.cancel();closed.resolve(undefined);await Promise.all([next,cancel]);
    expect(f.client.reserve).toHaveBeenCalledTimes(1);expect(f.consent).toHaveBeenCalledTimes(1);expect(f.owner.getSnapshot().phase).toBe("cancelled");
  });
  it("coalesces connect and keeps one timer/poll without publishing unchanged snapshots",async()=>{
    const f=fixture(),capability=await f.client.capabilities(),cap=gate(capability);f.client.capabilities.mockReturnValueOnce(cap.promise);
    const first=f.owner.connect(f.profile,f.window);expect(f.owner.connect(f.profile,f.window)).toBe(first);cap.resolve(capability);await first;expect(f.owner.getSnapshot().phase).toBe("initial_exchange_ready");
    const read=gate(reply());f.client.read.mockReturnValueOnce(read.promise);const notify=vi.fn();f.owner.subscribe(notify);const stable=f.owner.getSnapshot();
    expect(vi.getTimerCount()).toBe(1);await vi.advanceTimersByTimeAsync(25);await vi.advanceTimersByTimeAsync(1000);expect(f.client.read).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
    read.resolve(reply());await turn();expect(f.owner.getSnapshot()).toBe(stable);expect(notify).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(1);
    f.client.read.mockResolvedValue(reply({phase:"initial_exchange_ready"}));await vi.advanceTimersByTimeAsync(25);expect(f.owner.getSnapshot().phase).toBe("initial_exchange_ready");expect(notify).not.toHaveBeenCalled();
    await f.owner.close();expect(vi.getTimerCount()).toBe(0);
  });
  it("reports EOF as closed without inventing authentication or exit status",async()=>{
    const f=fixture();f.client.read.mockResolvedValue(reply({phase:"closed",finished:true}));await f.owner.connect(f.profile,f.window);await vi.advanceTimersByTimeAsync(25);await turn();
    expect(f.owner.getSnapshot()).toMatchObject({phase:"closed",reason:null});expect(f.owner.getSnapshot()).not.toHaveProperty("exit_code");expect(f.owner.getSnapshot()).not.toHaveProperty("authenticated");expect(f.client.close).toHaveBeenCalledTimes(1);
  });
  it("retains a controller close failure after EOF without an automatic retry loop",async()=>{
    const f=fixture();f.client.read.mockResolvedValue(reply({phase:"closed",finished:true}));f.client.close.mockRejectedValue(Error("private cleanup"));
    await f.owner.connect(f.profile,f.window);await vi.advanceTimersByTimeAsync(25);await turn();
    expect(f.owner.getSnapshot().phase).toBe("cleanup_failed");expect(f.client.close).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);expect(f.client.close).toHaveBeenCalledTimes(1);
    f.client.close.mockResolvedValue(undefined);await f.owner.close();expect(f.client.close).toHaveBeenCalledTimes(2);
  });
  it("publishes only a fixed reason for an ambiguous private read failure",async()=>{
    const f=fixture();f.client.read.mockRejectedValue(Error("private output fixture"));await f.owner.connect(f.profile,f.window);await vi.advanceTimersByTimeAsync(25);await turn();
    expect(f.owner.getSnapshot()).toMatchObject({phase:"failed",reason:"rlogin_terminal_read_failed"});expect(JSON.stringify(f.owner.getSnapshot())).not.toContain("private");expect(vi.getTimerCount()).toBe(0);
  });
});
