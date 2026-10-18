import type { RloginTarget } from "../terminal/rloginAttemptOwner";
export interface RloginConsentSnapshot { readonly token:number; readonly target:RloginTarget }
interface Entry { token:number;target:RloginTarget;signal:AbortSignal;abort:()=>void;resolve:(allowed:boolean)=>void }
export class RloginConsentQueueError extends Error {
  readonly code="rlogin_session_busy";
  constructor(){super("rlogin_session_busy");}
}
/** Transient, bounded target permits; never persisted or attached to a saved profile. */
export class RloginConsentQueue {
  private entries:Entry[]=[];
  private current:RloginConsentSnapshot|null=null;
  private listeners=new Set<()=>void>();
  private token=0;
  private disposed=false;
  getSnapshot=()=>this.current;
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};};
  request(target:RloginTarget,signal:AbortSignal):Promise<boolean> {
    if(this.disposed || signal.aborted)return Promise.resolve(false);
    if(this.entries.length>=16 || this.token>=Number.MAX_SAFE_INTEGER)return Promise.reject(new RloginConsentQueueError());
    return new Promise(resolve=>{
      const token=++this.token;
      const entry:Entry={token,target,signal,resolve,abort:()=>{this.settle(entry,false);}};
      this.entries.push(entry);signal.addEventListener("abort",entry.abort,{once:true});
      if(signal.aborted)this.settle(entry,false);else this.publish();
    });
  }
  respond(token:number,allowed:boolean):boolean {
    const entry=this.entries[0];
    if(!entry || this.current?.token!==token || entry.token!==token)return false;
    this.settle(entry,allowed===true);return true;
  }
  private settle(entry:Entry,allowed:boolean) {
    const index=this.entries.indexOf(entry);if(index<0)return;
    this.entries.splice(index,1);entry.signal.removeEventListener("abort",entry.abort);
    entry.resolve(allowed);this.publish();
  }
  private publish() {
    const entry=this.entries[0];
    if(this.current?.token===(entry?.token ?? undefined) || (!this.current && !entry))return;
    this.current=entry ? Object.freeze({token:entry.token,target:entry.target}) : null;
    for(const listener of this.listeners)listener();
  }
  dispose() {
    if(this.disposed)return;this.disposed=true;
    for(const entry of this.entries){entry.signal.removeEventListener("abort",entry.abort);entry.resolve(false);}
    this.entries=[];this.publish();this.listeners.clear();
  }
}
