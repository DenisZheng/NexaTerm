import type { RloginTerminalController } from "./rloginTerminalController";
import { RloginTerminalError } from "./rloginTerminalError";
import type { RloginTerminalErrorCode } from "./rloginTerminalError";

interface Disposable { dispose():void }
export interface RloginTerminalSurface {
  readonly cols:number; readonly rows:number;
  write(text:string,onParsed:()=>void):void;
  dispose():void;
  onData(callback:(data:string)=>void):Disposable;
  onBinary(callback:(data:string)=>void):Disposable;
  onResize(callback:(size:{cols:number;rows:number})=>void):Disposable;
}
export interface RloginTerminalAdapter {
  readonly controller:RloginTerminalController;
  inputAvailable():boolean;
  requestReconnect?():void;
  reconnectAvailable?():boolean;
}
interface Options { canResize():boolean; onFailure(code:RloginTerminalErrorCode):void }

/** Only private, credited Rlogin IO. Pane disposal never closes its workspace owner. */
export function mountRloginTerminal(surface:RloginTerminalSurface,adapter:RloginTerminalAdapter,options:Options):()=>void {
  let disposed=false;
  let detach:(()=>void)|null=null;
  const subscriptions:Disposable[]=[];
  const report=(error:unknown,fallback:RloginTerminalErrorCode)=>options.onFailure(error instanceof RloginTerminalError ? error.code : fallback);
  const issue=(operation:()=>Promise<void>,fallback:RloginTerminalErrorCode)=>{
    if(disposed || !adapter.inputAvailable()) return;
    try {void operation().catch(error=>{if(!disposed)report(error,fallback);});}
    catch(error){report(error,fallback);}
  };
  const resize=(cols:number,rows:number)=>{
    if(options.canResize()) issue(()=>adapter.controller.resize({columns:cols,rows}),"rlogin_terminal_resize_failed");
  };
  const cleanup=()=>{
    if(disposed)return;disposed=true;
    for(const subscription of subscriptions) {
      try {subscription.dispose();} catch {options.onFailure("rlogin_terminal_renderer_failed");}
    }
    // attach's detach owns the actual surface disposal and only then discards its parser credit.
    if(detach)detach();
    else {try {surface.dispose();} catch {options.onFailure("rlogin_terminal_renderer_failed");}}
  };
  try {
    detach=adapter.controller.attach({write:(text,onParsed)=>surface.write(text,onParsed),dispose:()=>surface.dispose()});
    subscriptions.push(surface.onData(data=>issue(()=>adapter.controller.send(data),"rlogin_terminal_input_failed")));
    subscriptions.push(surface.onBinary(data=>issue(()=>adapter.controller.sendBinary(data),"rlogin_terminal_input_failed")));
    subscriptions.push(surface.onResize(({cols,rows})=>resize(cols,rows)));
    resize(surface.cols,surface.rows);
    return cleanup;
  } catch(error) {
    cleanup();
    throw error instanceof RloginTerminalError ? error : new RloginTerminalError("rlogin_terminal_renderer_failed");
  }
}
