import type { ConnectionTerminalEncoding } from "../connections/connectionTypes";
import { RloginTerminalError } from "./rloginTerminalError";
import { RloginIsoDecoder } from "./rloginIsoDecoder";
const labels:ReadonlySet<string>=new Set(["utf-8","gbk","gb18030","big5","euc-jp","iso-2022-jp","shift-jis","euc-kr"]);
export class RloginDecoder {
  private decoder: TextDecoder | RloginIsoDecoder;
  private epoch="0";
  private finished=false;
  constructor(private readonly encoding: ConnectionTerminalEncoding) { this.decoder=this.create(); }
  private create() {
    if (!labels.has(this.encoding)) throw new RloginTerminalError("rlogin_terminal_encoding_invalid");
    try { return this.encoding==="iso-2022-jp" ? new RloginIsoDecoder() : new TextDecoder(this.encoding,{fatal:true,ignoreBOM:true}); }
    catch { throw new RloginTerminalError("rlogin_terminal_encoding_invalid"); }
  }
  reset(epoch:string) {
    if (this.epoch!==epoch) { this.decoder=this.create(); this.epoch=epoch; }
  }
  decode(bytes:Uint8Array): string {
    if (this.finished) throw new RloginTerminalError("rlogin_terminal_closed");
    try {
      if (this.decoder instanceof RloginIsoDecoder) return this.decoder.decode(bytes);
      // C0/DEL是终端控制，不交给可能带有平台兼容映射的文本decoder。
      const output:string[]=[]; let start=0;
      for (let i=0;i<bytes.length;i++) {
        if (bytes[i]>=0x20 && bytes[i]!==0x7f) continue;
        if (i>start) output.push(this.decoder.decode(bytes.subarray(start,i),{stream:true}));
        output.push(String.fromCharCode(bytes[i])); start=i+1;
      }
      if (start<bytes.length) output.push(this.decoder.decode(bytes.subarray(start),{stream:true}));
      return output.join("");
    }
    catch { throw new RloginTerminalError("rlogin_terminal_decode_failed"); }
  }
  finish() {
    if (this.finished) return "";
    this.finished=true;
    try { return this.decoder instanceof RloginIsoDecoder ? this.decoder.finish() : this.decoder.decode(); }
    catch { throw new RloginTerminalError("rlogin_terminal_decode_failed"); }
  }
}
