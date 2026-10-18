import { pinRloginProfile } from "../connections/rloginProfile";
import type { ConnectionProfile } from "../connections/connectionTypes";
import type { RloginAttemptOwner, RloginAttemptSnapshot, RloginTarget } from "../terminal/rloginAttemptOwner";
import type { RloginWindow } from "../terminal/rloginTypes";

export type RloginOwnedAttempt=Pick<RloginAttemptOwner,"connect"|"cancel"|"close"|"getSnapshot"|"subscribe"|"getController">;
export type RloginConsentRequest=(target:RloginTarget,signal:AbortSignal)=>Promise<boolean>;
export interface RloginRuntimeModule { createRloginAttempt(requestConsent:RloginConsentRequest):RloginOwnedAttempt }
export interface RloginWorkspaceSnapshot {
  readonly generation:number;readonly phase:RloginAttemptSnapshot["phase"]|"loading";
  readonly reason:string|null;readonly closeIntent:boolean;
}
interface Slot {
  owner:RloginOwnedAttempt|null;initialize:Promise<RloginOwnedAttempt|null>;connect:Promise<void>|null;
  closing:Promise<void>|null;closeIntent:boolean;closed:boolean;cancelledBeforeOwner:boolean;
  unsubscribe:(()=>void)|null;state:RloginWorkspaceSnapshot;
}
const failure=(code:string)=>new Error(code);

/** Logical instance lifetime; owner/UUID/bytes stay outside React state and snapshots. */
export class RloginWorkspaceSessions {
  private slots=new Map<string,Slot>();
  private disposed=false;
  private disposing:Promise<void>|null=null;
  constructor(private readonly loadRuntime:()=>Promise<RloginRuntimeModule>,private readonly consent:RloginConsentRequest,
    private readonly onState:(tabId:string,state:RloginWorkspaceSnapshot)=>void) {}
  getOwner(tabId:string){return this.slots.get(tabId)?.owner ?? null;}
  getState(tabId:string){return this.slots.get(tabId)?.state ?? null;}
  private publish(tabId:string,slot:Slot,next:Omit<RloginWorkspaceSnapshot,"closeIntent">) {
    if(this.slots.get(tabId)!==slot)return;
    const previous=slot.state;
    if(previous.generation===next.generation && previous.phase===next.phase && previous.reason===next.reason && previous.closeIntent===slot.closeIntent)return;
    slot.state=Object.freeze({...next,closeIntent:slot.closeIntent});if(!this.disposed)this.onState(tabId,slot.state);
  }
  connect(tabId:string,profile:ConnectionProfile,window:RloginWindow):Promise<void> {
    if(this.disposed)return Promise.reject(failure("rlogin_entry_unavailable"));
    // Freeze before module loading and any old-generation cleanup await.
    let pinned:ConnectionProfile;
    try {pinned=pinRloginProfile(profile);}catch{return Promise.reject(failure("rlogin_entry_invalid_config"));}
    const size=Object.freeze({...window});
    let slot=this.slots.get(tabId);
    if(slot?.closeIntent)return Promise.reject(failure("rlogin_entry_cleanup_pending"));
    if(slot?.connect)return slot.connect;
    let created=false;
    if(!slot || slot.cancelledBeforeOwner || (!slot.owner && slot.state.phase==="failed")) {
      slot={owner:null,initialize:Promise.resolve(null),connect:null,closing:null,closeIntent:false,closed:false,cancelledBeforeOwner:false,unsubscribe:null,
        state:Object.freeze({generation:0,phase:"idle",reason:null,closeIntent:false})};
      this.slots.set(tabId,slot);const owned=slot;created=true;
      owned.initialize=Promise.resolve().then(()=>{
        if(this.disposed || owned.closeIntent || owned.cancelledBeforeOwner || this.slots.get(tabId)!==owned)return null;
        return this.loadRuntime();
      }).then(runtime=>{
        if(!runtime || this.disposed || owned.closeIntent || owned.cancelledBeforeOwner || this.slots.get(tabId)!==owned)return null;
        const owner=runtime.createRloginAttempt(this.consent);owned.owner=owner;
        owned.unsubscribe=owner.subscribe(()=>this.publish(tabId,owned,owner.getSnapshot()));return owner;
      });
    }
    const owned=slot;
    const work=owned.initialize.then(owner=>{
      if(!owner || this.disposed || owned.closeIntent || owned.cancelledBeforeOwner)return;
      return owner.connect(pinned,size);
    }).catch(()=>{
      if(!this.disposed && !owned.closeIntent && !owned.cancelledBeforeOwner && (!owned.owner || owned.owner.getSnapshot().phase==="idle")) {
        this.publish(tabId,owned,{generation:owned.state.generation,phase:"failed",reason:"rlogin_entry_unavailable"});
      }
      throw failure(owned.state.phase==="cleanup_failed" ? "rlogin_attempt_cleanup_failed" : "rlogin_entry_failed");
    });
    owned.connect=work;void work.then(()=>{owned.connect=null;},()=>{owned.connect=null;});
    if(created)this.publish(tabId,owned,{generation:0,phase:"loading",reason:null});
    return work;
  }
  async cancel(tabId:string):Promise<void> {
    const slot=this.slots.get(tabId);if(!slot)return;
    if(slot.closeIntent)throw failure("rlogin_entry_cleanup_pending");
    if(!slot.owner)slot.cancelledBeforeOwner=true;
    this.publish(tabId,slot,{...slot.state,phase:"closing"});
    const owner=slot.owner;
    const native=owner ? Promise.resolve().then(()=>owner.cancel()) : Promise.resolve();
    const results=await Promise.allSettled([native,slot.initialize,slot.connect]);
    if(results[0].status==="rejected")throw failure("rlogin_attempt_cleanup_failed");
    if(!slot.owner)this.publish(tabId,slot,{...slot.state,phase:"cancelled",reason:null});
  }
  close(tabId:string):Promise<void> {
    const slot=this.slots.get(tabId);if(!slot)return Promise.resolve();
    if(slot.closing)return slot.closing;
    slot.closeIntent=true;this.publish(tabId,slot,{...slot.state,phase:"closing"});
    const owner=slot.owner;
    const native=owner ? Promise.resolve().then(()=>owner.close()) : Promise.resolve();
    const work=Promise.allSettled([native,slot.initialize,slot.connect]).then(results=>{
      if(results[0].status==="rejected") {
        this.publish(tabId,slot,{...slot.state,phase:"cleanup_failed",reason:"rlogin_attempt_cleanup_failed"});
        throw failure("rlogin_attempt_cleanup_failed");
      }
      slot.closed=true;this.publish(tabId,slot,{...slot.state,phase:"closed"});
    });
    slot.closing=work;void work.then(()=>{slot.closing=null;},()=>{slot.closing=null;});return work;
  }
  forget(tabId:string) {
    const slot=this.slots.get(tabId);if(!slot)return;
    if(!slot.closed || slot.closing)throw failure("rlogin_entry_cleanup_pending");
    slot.unsubscribe?.();this.slots.delete(tabId);
  }
  dispose():Promise<void> {
    if(this.disposing)return this.disposing;
    if(this.disposed && !this.slots.size)return Promise.resolve();
    this.disposed=true;
    const work=Promise.allSettled([...this.slots.keys()].map(id=>this.close(id))).then(results=>{
      if(results.some(result=>result.status==="rejected"))throw failure("rlogin_attempt_cleanup_failed");
      for(const slot of this.slots.values())slot.unsubscribe?.();this.slots.clear();
    });
    this.disposing=work;void work.then(()=>{this.disposing=null;},()=>{this.disposing=null;});return work;
  }
}
