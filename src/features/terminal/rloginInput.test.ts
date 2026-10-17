import { describe, expect, it, vi } from "vitest";
import { prepareRloginInput, RloginInputQueue, RLOGIN_INPUT_BYTES, RLOGIN_INPUT_ITEMS } from "./rloginInput";
function gate() { let resolve!:()=>void; const promise=new Promise<void>(r => {resolve=r;}); return {promise,resolve}; }
async function turn() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }
describe("Rlogin text input preflight",() => {
  it("preserves raw controls, spaces and surrogate pairs, using UTF-8 bytes for chunking",() => {
    const text="a".repeat(4095)+"😀中\r\0\x1b[A  ";
    const prepared=prepareRloginInput(text,RLOGIN_INPUT_BYTES,RLOGIN_INPUT_ITEMS);
    expect(prepared.chunks.join("")).toBe(text); expect(prepared.chunks[0].length).toBe(4095);
    expect(prepared.bytes).toBe(new TextEncoder().encode(text).length);
    for (const part of prepared.chunks) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(4096);
  });
  it.each(["\ud800","\udc00","prefix\ud800suffix"])("rejects malformed Unicode without substitution",text => {
    expect(() => prepareRloginInput(text,RLOGIN_INPUT_BYTES,RLOGIN_INPUT_ITEMS)).toThrow("rlogin_terminal_input_invalid");
  });
  it("preflights the whole call against byte and item budgets",() => {
    expect(() => prepareRloginInput("中".repeat(1366),4096,2)).toThrow("rlogin_terminal_input_full");
    expect(() => prepareRloginInput("x".repeat(4097),8192,1)).toThrow("rlogin_terminal_input_full");
    expect(prepareRloginInput("",0,0)).toEqual({bytes:0,chunks:[]});
  });
});
describe("Rlogin bounded keyboard and paste queue",() => {
  it("issues one chunk at a time in order and resolves a paste only after its final chunk",async () => {
    const first=gate(),write=vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined),error=vi.fn();
    const queue=new RloginInputQueue(write,error); const text="x".repeat(4095)+"😀中\r";
    let done=false; const paste=queue.send(text).then(() => {done=true;}); const key=queue.send("next");
    await turn(); expect(write).toHaveBeenCalledTimes(1); expect(done).toBe(false);
    expect(queue.snapshot()).toMatchObject({bytes:new TextEncoder().encode(text).length+4,items:3,calls:2});
    first.resolve(); await Promise.all([paste,key]);
    expect(write.mock.calls.map(call => call[0]).join("")).toBe(text+"next");
    expect(error).not.toHaveBeenCalled(); expect(queue.snapshot()).toEqual({bytes:0,items:0,calls:0}); await queue.close();
  });
  it("includes in-flight bytes and rejects an oversized paste before enqueueing any prefix",async () => {
    const first=gate(),write=vi.fn().mockReturnValue(first.promise),error=vi.fn(),queue=new RloginInputQueue(write,error);
    const pending=queue.send("a".repeat(4096)); const settled=Promise.allSettled([pending]); await turn();
    await expect(queue.send("b".repeat(RLOGIN_INPUT_BYTES-4096+1))).rejects.toThrow("rlogin_terminal_input_full");
    expect(write).toHaveBeenCalledTimes(1); expect(error).toHaveBeenCalledWith("rlogin_terminal_input_full");
    expect((await settled)[0].status).toBe("rejected"); expect(queue.snapshot().bytes).toBe(4096);
    const closed=queue.close(); first.resolve(); await closed; expect(queue.snapshot()).toEqual({bytes:0,items:0,calls:0});
  });
  it("bounds small calls by item count without an unlimited promise chain",async () => {
    const first=gate(),write=vi.fn().mockReturnValue(first.promise),error=vi.fn(),queue=new RloginInputQueue(write,error);
    const pending=Array.from({length:256},() => queue.send("a")); const settled=Promise.allSettled(pending); await turn();
    expect(queue.snapshot()).toEqual({bytes:256,items:256,calls:256});
    await expect(queue.send("z")).rejects.toThrow("rlogin_terminal_input_full");
    expect((await settled).every(result => result.status==="rejected")).toBe(true); expect(write).toHaveBeenCalledTimes(1);
    first.resolve(); await queue.close(); expect(queue.snapshot().items).toBe(0);
  });
  it("rejects invalid Unicode before IO, closes input and exposes only fixed errors",async () => {
    const write=vi.fn(),error=vi.fn(),queue=new RloginInputQueue(write,error);
    await expect(queue.send("private\ud800")).rejects.toThrow("rlogin_terminal_input_invalid");
    expect(write).not.toHaveBeenCalled(); await expect(queue.send("retry")).rejects.toThrow("rlogin_terminal_input_invalid");
    await queue.close(); expect(JSON.stringify(queue.snapshot())).not.toContain("private");
  });
  it("never retries an ambiguous failed write or dispatches its queued suffix",async () => {
    const write=vi.fn().mockRejectedValue(new Error("private input fixture")),error=vi.fn(),queue=new RloginInputQueue(write,error);
    await expect(queue.send("x".repeat(8192))).rejects.toThrow("rlogin_terminal_input_failed"); await queue.close();
    expect(write).toHaveBeenCalledTimes(1); expect(error).toHaveBeenCalledTimes(1); expect(queue.snapshot().bytes).toBe(0);
  });
  it("close rejects callers immediately but waits actual issued IO and never sends queued input",async () => {
    const first=gate(),write=vi.fn().mockReturnValue(first.promise),queue=new RloginInputQueue(write,vi.fn());
    const pending=queue.send("x".repeat(8192)); const settled=Promise.allSettled([pending]); await turn();
    let done=false; const closing=queue.close().then(() => {done=true;});
    expect((await settled)[0].status).toBe("rejected"); expect(done).toBe(false); expect(queue.snapshot().bytes).toBe(4096);
    first.resolve(); await closing; expect(done).toBe(true); expect(write).toHaveBeenCalledTimes(1);
    await expect(queue.send("next")).rejects.toThrow("rlogin_terminal_closed");
  });
});
