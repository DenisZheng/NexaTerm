import { describe, expect, it, vi } from "vitest";
import { RloginConsentQueue } from "./rloginConsentQueue";
import type { RloginTarget } from "../terminal/rloginAttemptOwner";
const target=(host="127.0.0.1"):RloginTarget=>Object.freeze({local_address:"127.0.0.1",target_address:host,port:513,local_user:"local",remote_user:"remote",terminal:"vt100",speed:9600,terminal_encoding:"utf-8",window:Object.freeze({rows:24,columns:80})});
describe("bounded Rlogin this-run consent queue",()=>{
  it("shows FIFO frozen targets and refuses stale confirm or close callbacks",async()=>{
    const queue=new RloginConsentQueue(),a=target(),b=target("192.0.2.2");
    const first=queue.request(a,new AbortController().signal),old=queue.getSnapshot()!;
    const second=queue.request(b,new AbortController().signal);expect(queue.getSnapshot()).toBe(old);
    expect(queue.respond(old.token,true)).toBe(true);expect(await first).toBe(true);
    expect(queue.getSnapshot()?.target).toBe(b);const current=queue.getSnapshot();
    expect(queue.respond(old.token,false)).toBe(false);expect(queue.respond(old.token,true)).toBe(false);expect(queue.getSnapshot()).toBe(current);
    expect(queue.respond(current!.token,false)).toBe(true);expect(await second).toBe(false);expect(queue.getSnapshot()).toBeNull();
  });
  it("aborts only the current request and a late old abort cannot cancel the next target",async()=>{
    const queue=new RloginConsentQueue(),a=new AbortController(),b=new AbortController();
    const first=queue.request(target(),a.signal),old=queue.getSnapshot()!;const second=queue.request(target("192.0.2.2"),b.signal);
    a.abort();expect(await first).toBe(false);const current=queue.getSnapshot()!;expect(current.token).not.toBe(old.token);
    a.abort();expect(queue.getSnapshot()).toBe(current);queue.respond(current.token,true);expect(await second).toBe(true);
  });
  it("removes a queued abort without changing the visible snapshot or notifying a render",async()=>{
    const queue=new RloginConsentQueue(),a=new AbortController(),b=new AbortController(),notify=vi.fn();
    const first=queue.request(target(),a.signal),current=queue.getSnapshot()!;queue.subscribe(notify);
    const second=queue.request(target("192.0.2.2"),b.signal);b.abort();expect(await second).toBe(false);
    expect(queue.getSnapshot()).toBe(current);expect(notify).not.toHaveBeenCalled();queue.respond(current.token,false);expect(await first).toBe(false);
  });
  it("caps pending promises/targets at16 and uses only a fixed busy code",async()=>{
    const queue=new RloginConsentQueue(),pending=Array.from({length:16},()=>queue.request(target(),new AbortController().signal));
    await expect(queue.request(target(),new AbortController().signal)).rejects.toMatchObject({code:"rlogin_session_busy",message:"rlogin_session_busy"});
    queue.dispose();expect(await Promise.all(pending)).toEqual(Array(16).fill(false));expect(queue.getSnapshot()).toBeNull();
  });
  it("does not open an already-aborted request and disposal settles every pending target",async()=>{
    const queue=new RloginConsentQueue(),aborted=new AbortController();aborted.abort();
    expect(await queue.request(target(),aborted.signal)).toBe(false);expect(queue.getSnapshot()).toBeNull();
    const first=queue.request(target(),new AbortController().signal),second=queue.request(target(),new AbortController().signal);queue.dispose();queue.dispose();
    expect(await Promise.all([first,second])).toEqual([false,false]);expect(await queue.request(target(),new AbortController().signal)).toBe(false);
  });
  it("exposes only the visible logical token and target, without native handles or permission persistence",()=>{
    const queue=new RloginConsentQueue();void queue.request(target(),new AbortController().signal);
    const snapshot=queue.getSnapshot()!;expect(Object.isFrozen(snapshot)).toBe(true);expect(Object.keys(snapshot)).toEqual(["token","target"]);
    for(const key of ["allow_plaintext","reservation_id","password","resolve","signal"])expect(snapshot.target).not.toHaveProperty(key);queue.dispose();
  });
});
