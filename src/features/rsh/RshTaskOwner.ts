import {compareCounter} from "../../shared/tauri/legacyWire";
import {RshError,MAX_TEXT_BYTES,type RshApi,type RshFrame,type RshRequest,type RshSignal,type RshStatus} from "./rshTypes";
import {safeRshReason} from "./rshWire";
export interface RshRenderer {reset():void;append(frame:RshFrame,signal:AbortSignal):Promise<void>;}
export interface RshSnapshot {generation:number;phase:"idle"|"starting"|"running"|"draining"|"closing"|"closed"|"cancelled"|"failed"|"cleanup_failed";
  reason:string|null;status:RshStatus|null;inputPending:boolean;eofRequested:boolean;signalPending:number;}
interface Attempt {id:string|null;cancelled:boolean;abort:AbortController;cleanup:Promise<void>|null;}
const failure=(code:string)=>new RshError(code);
const reason=(error:unknown)=>error instanceof RshError?error.code:safeRshReason(error&&typeof error==="object"&&"code" in error?error.code:null);
/** Private handle/config lifetime; public snapshots contain metadata only. */
export class RshTaskOwner {
  private state:RshSnapshot=Object.freeze({generation:0,phase:"idle",reason:null,status:null,inputPending:false,eofRequested:false,signalPending:0});
  private listeners=new Set<()=>void>();private current:Attempt|null=null;private work:Promise<void>|null=null;private closing:Promise<void>|null=null;
  private closed=false;private input:Promise<void>|null=null;private eof:Promise<void>|null=null;private signalTail:Promise<void>=Promise.resolve();
  constructor(private readonly api:RshApi,private readonly pause=()=>new Promise<void>(resolve=>setTimeout(resolve,25))){}
  getSnapshot=()=>this.state;
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  private publish(next:Partial<RshSnapshot>){
    if(next.status&&this.state.status&&Object.keys(next.status).every(key=>next.status![key as keyof RshStatus]===this.state.status![key as keyof RshStatus]))next={...next,status:this.state.status};
    const value={...this.state,...next};if((Object.keys(value) as Array<keyof RshSnapshot>).every(key=>value[key]===this.state[key]))return;
    this.state=Object.freeze(value);for(const listener of this.listeners)listener();
  }
  private valid(attempt:Attempt){if(this.current!==attempt||attempt.cancelled||this.closed)throw failure("legacy_socket_cancelled");}
  run(request:RshRequest,renderer:RshRenderer):Promise<void>{
    if(this.closed||this.closing||this.work||this.current?.id)return Promise.reject(failure("rsh_task_busy"));
    if(!request.allow_plaintext)return Promise.reject(failure("rsh_task_consent_required"));
    const frozen=Object.freeze({...request});const attempt:Attempt={id:null,cancelled:false,abort:new AbortController(),cleanup:null};
    this.current=attempt;this.publish({generation:this.state.generation+1,phase:"starting",reason:null,status:null,eofRequested:false,inputPending:false,signalPending:0});
    const work=this.execute(attempt,frozen,renderer);this.work=work;
    void work.then(()=>{if(this.work===work)this.work=null;},()=>{if(this.work===work)this.work=null;});return work;
  }
  private async execute(attempt:Attempt,request:RshRequest,renderer:RshRenderer){
    try{
      renderer.reset();this.valid(attempt);const capability=await this.api.capabilities();this.valid(attempt);
      if(!capability.runtime_available)throw failure("rsh_task_unavailable");
      attempt.id=await this.api.reserve(request);this.valid(attempt);
      await this.api.start(attempt.id);this.valid(attempt);this.publish({phase:"running"});
      await this.pump(attempt,renderer);
    }catch(error){
      try{await this.cleanup(attempt);}catch{this.publish({phase:"cleanup_failed",reason:"rsh_cleanup_failed"});throw failure("rsh_cleanup_failed");}
      this.publish({phase:attempt.cancelled?(this.closed?"closed":"cancelled"):"failed",reason:attempt.cancelled?null:reason(error)});
      if(!attempt.cancelled)throw failure(reason(error));
    }
  }
  private async pump(attempt:Attempt,renderer:RshRenderer){
    let ack:string|null=null;let last="0";
    while(true){
      this.valid(attempt);const id=attempt.id;if(!id)throw failure("rsh_task_expired");
      const reply=await this.api.read(id,ack);this.valid(attempt);ack=null;this.publish({status:reply.status});
      if(reply.frame){
        if(compareCounter(reply.frame.sequence,last)<=0)throw failure("rsh_invalid_response");
        await this.renderFrame(attempt,reply.frame,renderer);this.valid(attempt);last=reply.frame.sequence;ack=last;
      }
      if(reply.status.finished){
        attempt.id=null;this.publish({phase:reply.status.phase==="failed"?"failed":"closed",reason:reply.status.reason});return;
      }
      if(!reply.frame)await this.pause();
    }
  }
  private async renderFrame(attempt:Attempt,frame:RshFrame,renderer:RshRenderer){
    let complete=false,failed=false,error:unknown;let wake:(()=>void)|null=null;
    // One completion observer and one bounded status request; a paused display never accumulates handlers.
    void renderer.append(frame,attempt.abort.signal).then(()=>{complete=true;wake?.();},reason=>{complete=true;failed=true;error=reason;wake?.();});
    while(!complete){
      await new Promise<void>(resolve=>{const timer=setTimeout(resolve,250);wake=()=>{clearTimeout(timer);resolve();};if(complete)wake();});wake=null;
      this.valid(attempt);
      if(!complete){
        if(!attempt.id)throw failure("rsh_task_expired");
        const status=await this.api.status(attempt.id);this.valid(attempt);
        this.publish({status,...(['closed','failed'].includes(status.phase)?{phase:"draining" as const}:{})});
      }
    }
    if(failed)throw error;
  }
  private ready(){const attempt=this.current;
    if(!attempt||!attempt.id||attempt.cancelled||this.closed||this.state.phase!=="running")throw failure("rsh_task_not_ready");return attempt;
  }
  async send(text:string){
    const attempt=this.ready();if(this.input||this.state.eofRequested)throw failure(this.state.eofRequested?"rsh_stdin_closed":"rsh_task_busy");
    if(new TextEncoder().encode(text).length>MAX_TEXT_BYTES)throw failure("rsh_task_invalid_chunk");
    const id=attempt.id!;this.publish({inputPending:true});
    const operation=this.api.writeText(id,text);this.input=operation;
    try{await operation;this.valid(attempt);}finally{if(this.input===operation){this.input=null;this.publish({inputPending:false});}}
  }
  async stdinEof(){
    const attempt=this.ready();if(this.state.eofRequested)return;this.publish({eofRequested:true});
    try{await this.input;this.valid(attempt);const operation=this.api.stdinEof(attempt.id!);this.eof=operation;
      try{await operation;this.valid(attempt);}finally{if(this.eof===operation)this.eof=null;}
    }
    catch(error){if(this.current===attempt&&!attempt.cancelled)this.publish({eofRequested:false});throw error;}
  }
  signal(signal:RshSignal):Promise<void>{
    const attempt=this.ready();if(this.state.signalPending>=32)return Promise.reject(failure("rsh_task_busy"));
    this.publish({signalPending:this.state.signalPending+1});
    const work=this.signalTail.then(async()=>{this.valid(attempt);if(!attempt.id)throw failure("rsh_task_not_ready");await this.api.signal(attempt.id,signal);});
    this.signalTail=work.catch(()=>undefined);
    void work.then(()=>this.signalFinished(attempt),()=>this.signalFinished(attempt));return work;
  }
  private signalFinished(attempt:Attempt){if(this.current===attempt)this.publish({signalPending:Math.max(0,this.state.signalPending-1)});}
  private cleanup(attempt:Attempt):Promise<void>{
    if(attempt.cleanup)return attempt.cleanup;if(!attempt.id)return Promise.resolve();const id=attempt.id;
    const work=Promise.resolve().then(()=>this.api.close(id)).then(()=>{if(attempt.id===id)attempt.id=null;});attempt.cleanup=work;
    void work.then(()=>{if(attempt.cleanup===work)attempt.cleanup=null;},()=>{if(attempt.cleanup===work)attempt.cleanup=null;});return work;
  }
  cancel():Promise<void>{return this.stop(false);}
  close():Promise<void>{this.closed=true;return this.stop(true);}
  private stop(permanent:boolean):Promise<void>{
    if(this.closing)return this.closing;const attempt=this.current;if(!attempt){if(permanent)this.publish({phase:"closed"});return Promise.resolve();}
    attempt.cancelled=true;attempt.abort.abort();this.publish({phase:"closing"});
    const work=(async()=>{
      if(attempt.id){try{await this.api.cancel(attempt.id);}catch{/* Actual close is still required and authoritative. */}}
      const first=this.cleanup(attempt);const results=await Promise.allSettled([first,this.work,this.input,this.eof,this.signalTail]);
      // A reserve that returns after cancellation is cleaned inside execute before work settles.
      if(attempt.id||results[0].status==="rejected"){
        this.publish({phase:"cleanup_failed",reason:"rsh_cleanup_failed"});throw failure("rsh_cleanup_failed");
      }
      this.publish({phase:permanent||this.closed?"closed":"cancelled",reason:null});
    })();this.closing=work;void work.then(()=>{if(this.closing===work)this.closing=null;},()=>{if(this.closing===work)this.closing=null;});return work;
  }
}
