// ISO-2022-JP与VT共用ESC。编码designation只进入decoder，VT控制只进入renderer。
// 仅保留最多两个待判定字节；CSI/OSC/DCS状态不缓存控制串正文。
export class RloginIsoDecoder {
  private decoder=new TextDecoder("iso-2022-jp",{fatal:true,ignoreBOM:true});
  private escape:number[]=[];
  private mode:"text"|"csi"|"escape"|"osc"|"string"="text";
  decode(bytes:Uint8Array):string {
    const output:string[]=[]; let start=0;
    const flush=(end:number) => {
      if (end>start) output.push(this.decoder.decode(bytes.subarray(start,end),{stream:true}));
    };
    for (let i=0;i<bytes.length;i++) {
      const b=bytes[i];
      if (this.escape.length) {
        start=i+1;
        if (b<0x20 || b===0x7f) {
          output.push(String.fromCharCode(...this.escape)); this.escape=[];
          if (b===0x1b) this.escape=[b]; else output.push(String.fromCharCode(b));
          if (b===0x18 || b===0x1a) this.mode="text";
          else if (this.mode!=="string" && this.mode!=="osc") this.mode="escape";
          continue;
        }
        if (this.escape.length===1 && (b===0x28 || b===0x24)) {this.escape.push(b);continue;}
        if (this.escape.length===2) {
          const prefix=this.escape[1];
          const designation=prefix===0x28 && [0x42,0x4a,0x49].includes(b) || prefix===0x24 && [0x40,0x42].includes(b);
          if (designation) output.push(this.decoder.decode(Uint8Array.of(0x1b,prefix,b),{stream:true}));
          else {
            if (b<0x20 || b>0x7e) throw Error("invalid terminal encoding");
            output.push(String.fromCharCode(0x1b,prefix,b));
            if (this.mode!=="string" && this.mode!=="osc") this.mode=b>=0x30?"text":"escape";
          }
          this.escape=[]; continue;
        }
        if (b<0x20 || b>0x7e) throw Error("invalid terminal encoding");
        output.push(String.fromCharCode(0x1b,b)); this.escape=[];
        if (this.mode==="string" || this.mode==="osc") { if (b===0x5c) this.mode="text"; }
        else if (b===0x5b) this.mode="csi";
        else if (b===0x5d) this.mode="osc";
        else if ([0x50,0x5e,0x5f,0x58].includes(b)) this.mode="string";
        else this.mode=b>=0x20 && b<=0x2f?"escape":"text";
        continue;
      }
      if (b===0x1b) { flush(i); this.escape=[b]; start=i+1; continue; }
      if (b<0x20 || b===0x7f) {
        flush(i); output.push(String.fromCharCode(b)); start=i+1;
        if (b===0x18 || b===0x1a || b===0x07 && this.mode==="osc") this.mode="text";
        continue;
      }
      if (this.mode==="csi" || this.mode==="escape") {
        if (b>0x7e) throw Error("invalid terminal encoding");
        output.push(String.fromCharCode(b)); start=i+1;
        if (b>=(this.mode==="csi"?0x40:0x30)) this.mode="text";
      }
    }
    flush(bytes.length); return output.join("");
  }
  finish() {
    if (this.escape.length) throw Error("incomplete terminal encoding");
    return this.decoder.decode();
  }
}
