import { RLOGIN_MAX_TEXT_BYTES } from "./rloginTypes";
import { RloginTerminalError } from "./rloginTerminalError";
import type { RloginTerminalErrorCode } from "./rloginTerminalError";
export const RLOGIN_INPUT_BYTES=128*1024;
export const RLOGIN_INPUT_ITEMS=256;
// 先验证整个调用，再创建分块；UTF-8预算与Rust String::len一致，不替换孤立surrogate。
export function prepareRloginInput(text: string, byteBudget: number, itemBudget: number) {
  if (typeof text !== "string") throw new RloginTerminalError("rlogin_terminal_input_invalid");
  if (text.length>byteBudget) throw new RloginTerminalError("rlogin_terminal_input_full");
  let bytes=0, chunkBytes=0, start=0;
  const ends: number[]=[];
  for (let i=0;i<text.length;) {
    const value=text.charCodeAt(i); let width=1, length=1;
    if (value>=0xd800 && value<=0xdbff) {
      const next=text.charCodeAt(i+1);
      if (!(next>=0xdc00 && next<=0xdfff)) throw new RloginTerminalError("rlogin_terminal_input_invalid");
      width=2; length=4;
    } else if (value>=0xdc00 && value<=0xdfff) throw new RloginTerminalError("rlogin_terminal_input_invalid");
    else if (value>=0x800) length=3;
    else if (value>=0x80) length=2;
    bytes+=length;
    if (bytes>byteBudget) throw new RloginTerminalError("rlogin_terminal_input_full");
    if (chunkBytes+length>RLOGIN_MAX_TEXT_BYTES) {
      ends.push(i); chunkBytes=0;
      if (ends.length>=itemBudget) throw new RloginTerminalError("rlogin_terminal_input_full");
    }
    chunkBytes+=length; i+=width;
  }
  if (text.length) ends.push(text.length);
  if (ends.length>itemBudget) throw new RloginTerminalError("rlogin_terminal_input_full");
  const chunks=ends.map(end => {const part=text.slice(start,end); start=end; return part;});
  return {bytes,chunks};
}
type Batch = { remaining:number; resolve:()=>void; reject:(error:RloginTerminalError)=>void };
type Chunk = { data:string; bytes:number; batch:Batch };
export class RloginInputQueue {
  private accepting=true;
  private error: RloginTerminalErrorCode="rlogin_terminal_closed";
  private bytes=0;
  private items=0;
  private batches=new Set<Batch>();
  private queue: Chunk[]=[];
  private running: Promise<void> | null=null;
  constructor(private readonly write:(data:string)=>Promise<void>,private readonly onError:(code:RloginTerminalErrorCode)=>void) {}
  snapshot() { return {bytes:this.bytes,items:this.items,calls:this.batches.size}; }
  send(data:string): Promise<void> {
    if (!this.accepting) return Promise.reject(new RloginTerminalError(this.error));
    try {
      if (this.batches.size>=RLOGIN_INPUT_ITEMS) throw new RloginTerminalError("rlogin_terminal_input_full");
      const prepared=prepareRloginInput(data,RLOGIN_INPUT_BYTES-this.bytes,RLOGIN_INPUT_ITEMS-this.items);
      if (!prepared.chunks.length) return Promise.resolve();
      const result=new Promise<void>((resolve,reject) => {
        const batch={remaining:prepared.chunks.length,resolve,reject}; this.batches.add(batch);
        this.bytes+=prepared.bytes; this.items+=prepared.chunks.length;
        // 每块很小；总预算预检完成后才计算各块UTF-8长度。
        const encoder=new TextEncoder();
        this.queue.push(...prepared.chunks.map(text => ({data:text,bytes:encoder.encode(text).length,batch})));
      });
      this.pump(); return result;
    } catch (error) {
      const code=error instanceof RloginTerminalError ? error.code : "rlogin_terminal_input_invalid";
      this.fail(code); return Promise.reject(new RloginTerminalError(code));
    }
  }
  private pump() {
    if (this.running) return;
    const work=Promise.resolve().then(async () => {
      while (this.accepting && this.queue.length) {
        const item=this.queue.shift()!;
        try {
          await this.write(item.data);
          if (this.batches.has(item.batch) && --item.batch.remaining===0) {
            this.batches.delete(item.batch); item.batch.resolve();
          }
        } catch { this.fail("rlogin_terminal_input_failed"); }
        finally { this.bytes-=item.bytes; this.items--; }
      }
    });
    this.running=work;
    void work.then(() => { this.running=null; if (this.accepting && this.queue.length) this.pump(); });
  }
  private fail(code:RloginTerminalErrorCode) { void this.close(code); this.onError(code); }
  close(code:RloginTerminalErrorCode="rlogin_terminal_closed"): Promise<void> {
    this.accepting=false; this.error=code;
    for (const batch of this.batches) batch.reject(new RloginTerminalError(code));
    this.batches.clear();
    for (const item of this.queue) {this.bytes-=item.bytes;this.items--;}
    this.queue=[]; return this.running ?? Promise.resolve();
  }
}
