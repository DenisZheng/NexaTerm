import { describe, expect, it, vi } from "vitest";
import { prepareRloginBinaryInput, RloginInputQueue, RLOGIN_INPUT_BYTES, RLOGIN_INPUT_ITEMS } from "./rloginInput";
function gate() { let resolve!:()=>void; const promise=new Promise<void>(r => {resolve=r;}); return {promise,resolve}; }
async function turn() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }

describe("Rlogin shared binary and text input owner", () => {
  it("keeps every byte including NUL/DEL/128..255 without text encoding", () => {
    const data=String.fromCharCode(...Array.from({length:256},(_,i)=>i));
    expect(prepareRloginBinaryInput(data,256,1)).toEqual({bytes:256,chunks:[Array.from({length:256},(_,i)=>i)]});
    const chunks=prepareRloginBinaryInput("\xff".repeat(32769),32769,2).chunks;
    expect(chunks.map(c=>c.length)).toEqual([32768,1]); expect(chunks[1]).toEqual([255]);
  });
  it.each(["\u0100","a\ud800","\udc00","\ud83d\ude00"])("rejects non-byte binary strings before admission", data => {
    expect(()=>prepareRloginBinaryInput(data,RLOGIN_INPUT_BYTES,RLOGIN_INPUT_ITEMS)).toThrow("rlogin_terminal_input_invalid");
  });
  it("issues mixed events in order through one actual write at a time", async () => {
    const first=gate(),events:unknown[]=[];
    const text=vi.fn(async (data:string)=>{events.push(data); if(events.length===1) await first.promise;});
    const raw=vi.fn(async (data:readonly number[])=>{events.push(data);}); const queue=new RloginInputQueue(text,vi.fn(),raw);
    const a=queue.send("text"),b=queue.sendBinary("\0\x80\xff"),c=queue.send("中文"); await turn();
    expect(events).toEqual(["text"]); expect(queue.snapshot()).toEqual({bytes:13,items:3,calls:3});
    first.resolve(); await Promise.all([a,b,c]); expect(events).toEqual(["text",[0,128,255],"中文"]);
    expect(queue.snapshot()).toEqual({bytes:0,items:0,calls:0}); await queue.close();
  });
  it("includes issued text in the shared raw admission budget and enqueues no binary prefix", async () => {
    const first=gate(),raw=vi.fn(),queue=new RloginInputQueue(()=>first.promise,vi.fn(),raw);
    const pending=Promise.allSettled([queue.send("a".repeat(4096))]); await turn();
    await expect(queue.sendBinary("\xff".repeat(RLOGIN_INPUT_BYTES-4096+1))).rejects.toThrow("rlogin_terminal_input_full");
    expect(raw).not.toHaveBeenCalled(); expect((await pending)[0].status).toBe("rejected");
    const close=queue.close(); first.resolve(); await close;
  });
  it("rejects queued binary immediately on close but waits an issued raw write", async () => {
    const first=gate(),raw=vi.fn(()=>first.promise),queue=new RloginInputQueue(vi.fn(),vi.fn(),raw);
    const pending=Promise.allSettled([queue.sendBinary("\xff"),queue.sendBinary("\x80")]); await turn();
    let closed=false; const close=queue.close().then(()=>{closed=true;});
    expect((await pending).every(r=>r.status==="rejected")).toBe(true); expect(closed).toBe(false); expect(raw).toHaveBeenCalledTimes(1);
    first.resolve(); await close; expect(queue.snapshot()).toEqual({bytes:0,items:0,calls:0});
  });
  it("never retries an ambiguous raw failure or issues a following text event", async () => {
    const text=vi.fn(),raw=vi.fn().mockRejectedValue(Error("private fixture")),error=vi.fn();const queue=new RloginInputQueue(text,error,raw);
    const results=await Promise.allSettled([queue.sendBinary("\xff"),queue.send("later")]);
    expect(results.every(r=>r.status==="rejected")).toBe(true); expect(raw).toHaveBeenCalledTimes(1); expect(text).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith("rlogin_terminal_input_failed"); await queue.close();
  });
});
