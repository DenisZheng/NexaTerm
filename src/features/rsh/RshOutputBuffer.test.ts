import {describe,it,expect} from "vitest";
import {RshOutputBuffer,outputText} from "./RshOutputBuffer";
import {turn} from "./testFixtures";
describe("Rsh credited output display",()=>{
  it("waits for committed rendering and keeps exact binary bytes",async()=>{const output=new RshOutputBuffer();const signal=new AbortController();let done=false;
    const work=output.append({sequence:"1",stream:"stderr",data:[0,255,1]},signal.signal).then(()=>{done=true;});await turn();expect(done).toBe(false);
    expect([...output.bytes("stderr")]).toEqual([0,255,1]);output.consumed(output.getSnapshot().revision);await work;expect(done).toBe(true);
  });
  it("bounds retained bytes, pauses delivery and resumes only after explicit clear plus commit",async()=>{const output=new RshOutputBuffer();const signal=new AbortController();
    for(let i=0;i<31;i++){const appended=output.append({sequence:String(i+1),stream:"stdout",data:new Array(32768).fill(i)},signal.signal);output.consumed(output.getSnapshot().revision);await appended;}
    let done=false;const last=output.append({sequence:"32",stream:"stdout",data:[255]},signal.signal).then(()=>{done=true;});await turn();
    expect(done).toBe(false);expect(output.getSnapshot().paused).toBe(true);expect(output.getSnapshot().stdout).toBe(31*32768);
    output.clear("stdout");expect(output.getSnapshot().stdout).toBe(1);expect(done).toBe(false);output.consumed(output.getSnapshot().revision);await last;expect([...output.bytes("stdout")]).toEqual([255]);
  });
  it("cancel aborts an unrendered flight without acknowledging it",async()=>{const output=new RshOutputBuffer();const signal=new AbortController();
    const work=output.append({sequence:"1",stream:"stdout",data:[1]},signal.signal);const expected=expect(work).rejects.toThrow("rsh_renderer_closed");signal.abort();await expected;
    output.consumed(output.getSnapshot().revision);output.dispose();expect(output.getSnapshot().stdout).toBe(0);
  });
  it("shows malformed encoding as exact hex and preserves split multibyte input",()=>{
    expect(outputText(Uint8Array.from([0xff,0]),"utf-8",false,true)).toEqual({hex:true,text:"ff 00"});
    expect(outputText(Uint8Array.from([0xe4,0xb8]),"utf-8",false,false)).toEqual({hex:false,text:""});
    expect(outputText(Uint8Array.from([0xe4,0xb8,0xad]),"utf-8",false,true)).toEqual({hex:false,text:"中"});
  });
});
