import {RshError,MAX_CHUNK,type RshFrame,type RshStream} from "./rshTypes";
import type {RshRenderer} from "./RshTaskOwner";
const LIMIT=1024*1024-MAX_CHUNK;
interface Waiter {frame:RshFrame;signal:AbortSignal;revision:number|null;resolve:()=>void;reject:(reason:Error)=>void;abort:()=>void;}
export interface OutputSnapshot {revision:number;stdout:number;stderr:number;paused:boolean;}
/** Retain exact bytes; one response is ACKed only after a committed render or an explicit clear. */
export class RshOutputBuffer implements RshRenderer {
  private chunks:Record<RshStream,Uint8Array[]>={stdout:[],stderr:[]};private sizes={stdout:0,stderr:0};
  private state:OutputSnapshot=Object.freeze({revision:0,stdout:0,stderr:0,paused:false});
  private listeners=new Set<()=>void>();private waiting:Waiter|null=null;private closed=false;
  getSnapshot=()=>this.state;
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  private publish(){this.state=Object.freeze({revision:this.state.revision+1,...this.sizes,paused:this.waiting?.revision===null});for(const listener of this.listeners)listener();}
  reset(){this.reject("rsh_renderer_reset");this.chunks={stdout:[],stderr:[]};this.sizes={stdout:0,stderr:0};this.publish();}
  append(frame:RshFrame,signal:AbortSignal):Promise<void>{
    if(this.closed||signal.aborted)return Promise.reject(new RshError("rsh_renderer_closed"));
    if(this.waiting)return Promise.reject(new RshError("rsh_task_busy"));
    return new Promise<void>((resolve,reject)=>{
      const abort=()=>{this.reject("rsh_renderer_closed");this.publish();};
      const waiting:Waiter={frame,signal,revision:null,resolve,reject,abort};this.waiting=waiting;signal.addEventListener("abort",abort,{once:true});
      this.storeWaiting();this.publish();if(waiting.revision!==null)waiting.revision=this.state.revision;
    });
  }
  private storeWaiting(){const waiting=this.waiting;if(!waiting||waiting.revision!==null)return;
    const {stream,data}=waiting.frame;if(this.sizes[stream]+data.length>LIMIT)return;
    this.chunks[stream].push(Uint8Array.from(data));this.sizes[stream]+=data.length;waiting.revision=this.state.revision+1;
  }
  consumed(revision:number){const waiting=this.waiting;if(!waiting||waiting.revision===null||revision<waiting.revision)return;
    this.waiting=null;waiting.signal.removeEventListener("abort",waiting.abort);waiting.resolve();
  }
  clear(stream:RshStream){this.chunks[stream]=[];this.sizes[stream]=0;this.storeWaiting();this.publish();}
  bytes(stream:RshStream){const bytes=new Uint8Array(this.sizes[stream]);let offset=0;for(const chunk of this.chunks[stream]){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;}
  private reject(code:string){const waiting=this.waiting;if(!waiting)return;this.waiting=null;waiting.signal.removeEventListener("abort",waiting.abort);waiting.reject(new RshError(code));}
  dispose(){this.closed=true;this.reject("rsh_renderer_closed");this.chunks={stdout:[],stderr:[]};this.sizes={stdout:0,stderr:0};this.publish();}
}
export function outputText(bytes:Uint8Array,encoding:string,hex:boolean,eof:boolean):{text:string;hex:boolean}{
  if(!hex){try{return {text:new TextDecoder(encoding,{fatal:true,ignoreBOM:true}).decode(bytes,{stream:!eof}),hex:false};}catch{/* Exact bytes stay available as hex. */}}
  const lines:string[]=[];for(let i=0;i<bytes.length;i+=16){lines.push(Array.from(bytes.subarray(i,i+16),b=>b.toString(16).padStart(2,"0")).join(" "));}
  return {text:lines.join("\n"),hex:true};
}
