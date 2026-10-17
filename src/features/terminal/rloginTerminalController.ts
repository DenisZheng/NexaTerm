import type { ConnectionTerminalEncoding } from "../connections/connectionTypes";
import type { RloginBridge } from "./rloginBridge";
import { RloginDecoder } from "./rloginDecoder";
import { RloginInputQueue } from "./rloginInput";
import { RloginTerminalError } from "./rloginTerminalError";
import type { RloginTerminalErrorCode } from "./rloginTerminalError";
import type { RloginWindow } from "./rloginTypes";
export interface RloginRenderer { write(text:string,onParsed:()=>void):void; dispose():void }
type Attachment = { renderer:RloginRenderer; parsed:(()=>void)|null };
// 由会话owner持有；pane只attach renderer，组件卸载不等于关闭会话。
export class RloginTerminalController {
  private accepting=true;
  private error:RloginTerminalErrorCode|null=null;
  private decoder:RloginDecoder;
  private input:RloginInputQueue;
  private attachment:Attachment|null=null;
  private ticking:Promise<void>|null=null;
  private resizing:Promise<void>|null=null;
  private pendingSize:RloginWindow|null=null;
  private closing:Promise<void>|null=null;
  constructor(private readonly bridge:RloginBridge,encoding:ConnectionTerminalEncoding) {
    try { this.decoder=new RloginDecoder(encoding); }
    catch (error) { void bridge.close().catch(() => {}); throw error; }
    this.input=new RloginInputQueue(data => bridge.writeText(data),code => this.stop(code));
  }
  snapshot() { return {...this.bridge.snapshot(),terminalError:this.error,input:this.input.snapshot(),attached:this.attachment!==null}; }
  attach(renderer:RloginRenderer):()=>void {
    if (!this.accepting) throw new RloginTerminalError("rlogin_terminal_closed");
    if (this.attachment) throw new RloginTerminalError("rlogin_terminal_renderer_busy");
    const attached:Attachment={renderer,parsed:null}; this.attachment=attached;
    let detached=false;
    return () => {
      if (detached) return; detached=true;
      // 先让迟到回调失效，再真正dispose，最后才能明确丢弃并ACK。
      if (this.attachment===attached) this.attachment=null;
      try { renderer.dispose(); }
      catch { this.stop("rlogin_terminal_renderer_failed"); return; }
      attached.parsed?.(); attached.parsed=null;
    };
  }
  tick():Promise<void> {
    if (!this.accepting) return Promise.resolve();
    if (this.ticking) return this.ticking;
    const work=this.poll(); this.ticking=work;
    void work.then(() => {this.ticking=null;},() => {this.ticking=null;}); return work;
  }
  private async poll() {
    try {
      const status=await this.bridge.poll();
      if (!this.accepting || !status) return;
      this.decoder.reset(status.epoch);
      const attached=this.attachment;
      if (attached) this.bridge.render((bytes,parsed) => {
        let text:string;
        try { text=this.decoder.decode(bytes); }
        catch { this.error ??= "rlogin_terminal_decode_failed"; throw new RloginTerminalError(this.error); }
        // decoder最多保留一个编码后缀；无文本不需要交给xterm。
        if (!text) { parsed(); return; }
        let completed=false;
        const done=() => {
          if (completed) return; completed=true;
          if (attached.parsed===done) attached.parsed=null;
          parsed();
        };
        attached.parsed=done;
        try {
          attached.renderer.write(text,() => {
            if (this.accepting && this.attachment===attached) done();
          });
        } catch { this.error ??= "rlogin_terminal_renderer_failed"; throw new RloginTerminalError(this.error); }
      });
      if (status.finished) {
        // WHATWG decoder的合法尾部已在stream调用产生文本；非法/截断尾部明确失败。
        if (this.decoder.finish()) throw new RloginTerminalError("rlogin_terminal_decode_failed");
        await this.close();
      }
    } catch (error) {
      if (!this.accepting) return;
      const code=this.error ?? (error instanceof RloginTerminalError ? error.code : "rlogin_terminal_read_failed");
      this.stop(code); throw new RloginTerminalError(code);
    }
  }
  send(text:string):Promise<void> {
    if (!this.accepting) return Promise.reject(new RloginTerminalError(this.error ?? "rlogin_terminal_closed"));
    return this.input.send(text);
  }
  resize(window:RloginWindow):Promise<void> {
    if (!this.accepting) return Promise.reject(new RloginTerminalError("rlogin_terminal_closed"));
    const {rows,columns,x_pixels=0,y_pixels=0}=window;
    if (![rows,columns,x_pixels,y_pixels].every(v => Number.isInteger(v) && v>=0 && v<=65535) || !rows || !columns) {
      this.stop("rlogin_terminal_resize_failed"); return Promise.reject(new RloginTerminalError("rlogin_terminal_resize_failed"));
    }
    this.pendingSize={rows,columns,x_pixels,y_pixels};
    if (this.resizing) return this.resizing;
    const work=Promise.resolve().then(async () => {
      while (this.accepting && this.pendingSize) {
        const size=this.pendingSize; this.pendingSize=null; await this.bridge.resize(size);
      }
    }).catch(() => {
      if (this.accepting) this.stop("rlogin_terminal_resize_failed");
      throw new RloginTerminalError("rlogin_terminal_resize_failed");
    });
    this.resizing=work;
    void work.then(() => {this.resizing=null;},() => {this.resizing=null;}); return work;
  }
  private stop(code:RloginTerminalErrorCode) { this.error ??= code; void this.close().catch(() => {}); }
  close():Promise<void> {
    if (this.closing) return this.closing;
    this.accepting=false; this.pendingSize=null;
    // bridge立即失效回调/IO；队列reject与已发操作真正完成分别处理。
    const input=this.input.close(this.error ?? "rlogin_terminal_closed");
    const work=Promise.allSettled([this.bridge.close(),input,this.resizing]).then(results => {
      const native=results[0]; if (native.status==="rejected") throw native.reason;
    });
    this.closing=work;
    void work.then(() => {this.closing=null;},() => {this.closing=null;}); return work;
  }
}
