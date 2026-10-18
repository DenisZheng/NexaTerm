import type { ConnectionProfile } from "../connections/connectionTypes";
import { RloginBridge } from "./rloginBridge";
import type { RloginClient } from "./rloginBridge";
import { RloginTerminalController } from "./rloginTerminalController";
import { rloginReasons } from "./rloginTypes";
import type { RloginCapability, RloginReason, RloginReserveRequest, RloginWindow } from "./rloginTypes";

export type RloginTarget = Readonly<Omit<RloginReserveRequest, "allow_plaintext" | "window"> & { window: Readonly<RloginWindow> }>;
export interface RloginAttemptClient extends RloginClient {
  capabilities(): Promise<RloginCapability>;
  reserve(target: RloginReserveRequest): Promise<string>;
  start(id: string): Promise<void>;
}
export type RloginAttemptPhase = "idle" | "checking" | "consent" | "reserving" | "starting" | "initial_exchange_ready" | "closing" | "closed" | "cancelled" | "failed" | "cleanup_failed";
export interface RloginAttemptSnapshot { readonly generation: number; readonly phase: RloginAttemptPhase; readonly reason: string | null }
type Consent = (target:RloginTarget,signal:AbortSignal)=>Promise<boolean>;
type Attempt = {
  generation:number; cancelled:boolean; abort:AbortController; id:string|null;
  controller:RloginTerminalController|null; issued:Promise<void>; cleanup:Promise<void>|null;
  end:"closed"|"cancelled"|"failed"; reason:string|null; cleaned:boolean;
};
const nativeReasons = new Set<string>(rloginReasons);
function nativeReason(error:unknown):RloginReason|"rlogin_attempt_failed" {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string" && nativeReasons.has(error.code)) return error.code as RloginReason;
  return "rlogin_attempt_failed";
}
export function freezeRloginTarget(profile:ConnectionProfile,window:RloginWindow):RloginTarget {
  if (profile.protocol !== "rlogin" || !profile.rlogin) throw Error("rlogin_attempt_invalid_config");
  const {local_address,local_user,terminal,speed}=profile.rlogin;
  return Object.freeze({local_address,local_user,terminal,speed,target_address:profile.host,port:profile.port,
    remote_user:profile.username,terminal_encoding:profile.advanced.terminal_encoding,window:Object.freeze({...window})});
}

/** Workspace lifetime, independent of React, xterm and public terminal events. */
export class RloginAttemptOwner {
  private current:Attempt|null=null;
  private snapshot:RloginAttemptSnapshot=Object.freeze({generation:0,phase:"idle",reason:null});
  private listeners=new Set<()=>void>();
  private connecting:Promise<void>|null=null;
  private requestVersion=0;
  private timer:ReturnType<typeof setTimeout>|null=null;
  constructor(private readonly client:RloginAttemptClient,private readonly requestConsent:Consent) {}
  getSnapshot=()=>this.snapshot;
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};};
  getController=()=>this.current?.controller ?? null;
  private publish(a:Attempt,phase:RloginAttemptPhase,reason:string|null=a.reason) {
    if (this.current!==a) return;
    if (this.snapshot.generation===a.generation && this.snapshot.phase===phase && this.snapshot.reason===reason) return;
    this.snapshot=Object.freeze({generation:a.generation,phase,reason});
    for (const listener of this.listeners) listener();
  }
  connect(profile:ConnectionProfile,window:RloginWindow):Promise<void> {
    if (this.connecting) return this.connecting;
    // Freeze before capability/cleanup/consent awaits, including the window object.
    let target:RloginTarget;
    try { target=freezeRloginTarget(profile,window); }
    catch { return Promise.reject(Error("rlogin_attempt_invalid_config")); }
    const work=this.begin(target,++this.requestVersion);this.connecting=work;
    void work.then(()=>{this.connecting=null;},()=>{this.connecting=null;});return work;
  }
  private async begin(target:RloginTarget,version:number) {
    if (this.current) await this.finish("closed",false);
    if (version!==this.requestVersion) return;
    const a:Attempt={generation:this.snapshot.generation+1,cancelled:false,abort:new AbortController(),id:null,controller:null,
      issued:Promise.resolve(),cleanup:null,end:"cancelled",reason:null,cleaned:false};
    this.current=a;this.publish(a,"checking");
    a.issued=this.establish(a,target);
    await a.issued;
    if (a.cancelled || a.reason) await this.cleanup(a);
    else this.schedule(a);
  }
  private async establish(a:Attempt,target:RloginTarget) {
    try {
      const capability=await this.client.capabilities();
      if (a.cancelled) return;
      if (!capability.runtime_available || !capability.terminal_available) {
        a.reason=capability.reason ?? "rlogin_attempt_unavailable";a.end="failed";return;
      }
      this.publish(a,"consent");
      const allowed=await this.consent(a,target);
      if (a.cancelled || !allowed) {a.cancelled=true;return;}
      this.publish(a,"reserving");
      if (a.cancelled) return;
      a.id=await this.client.reserve({...target,window:{...target.window},allow_plaintext:true});
      if (a.cancelled) return;
      a.controller=new RloginTerminalController(new RloginBridge(a.id,this.client),target.terminal_encoding ?? "utf-8");
      this.publish(a,"starting");if (a.cancelled) return;await this.client.start(a.id);
    } catch (error) { if (!a.cancelled) {a.reason=nativeReason(error);a.end="failed";} }
  }
  private consent(a:Attempt,target:RloginTarget):Promise<boolean> {
    return new Promise(resolve=>{
      const signal=a.abort.signal;
      const finish=(value:boolean)=>{signal.removeEventListener("abort",cancel);resolve(value);};
      const cancel=()=>finish(false);
      signal.addEventListener("abort",cancel,{once:true});
      if (signal.aborted) {cancel();return;}
      // A late response is observed but cannot resume a cancelled attempt.
      Promise.resolve().then(()=>a.cancelled || signal.aborted ? false : this.requestConsent(target,signal)).then(value=>finish(value===true),()=>finish(false));
    });
  }
  private stopTimer() {if(this.timer!==null){clearTimeout(this.timer);this.timer=null;}}
  private schedule(a:Attempt) {
    if (a!==this.current || a.cancelled || a.cleaned || this.timer!==null) return;
    this.timer=setTimeout(()=>{this.timer=null;void this.poll(a);},25);
  }
  private async poll(a:Attempt) {
    if (a!==this.current || a.cancelled || !a.controller) return;
    try {await a.controller.tick();} catch { /* Fixed controller state is examined below. */ }
    if (a!==this.current || a.cancelled) return;
    const state=a.controller.snapshot();
    if (state.phase==="close_failed") {
      a.cancelled=true;a.end="failed";a.reason=state.terminalError ?? state.error ?? "rlogin_attempt_failed";
      this.stopTimer();this.publish(a,"cleanup_failed","rlogin_attempt_cleanup_failed");return;
    }
    if (state.terminalError || state.error || state.status?.reason) {
      a.reason=state.terminalError ?? state.error ?? state.status?.reason ?? "rlogin_attempt_failed";
      a.end="failed";a.cancelled=true;void this.cleanup(a).catch(()=>{});return;
    }
    if (state.phase==="closed" || state.status?.finished) {
      a.end="closed";a.cancelled=true;void this.cleanup(a).catch(()=>{});return;
    }
    if (state.status?.phase==="initial_exchange_ready") this.publish(a,"initial_exchange_ready");
    this.schedule(a);
  }
  cancel():Promise<void> {return this.finish("cancelled");}
  close():Promise<void> {return this.finish("closed");}
  private finish(end:Attempt["end"],invalidate=true):Promise<void> {
    if(invalidate)this.requestVersion++;
    const a=this.current;if(!a)return Promise.resolve();
    a.end=end;a.cancelled=true;a.abort.abort();this.stopTimer();return this.cleanup(a);
  }
  private cleanup(a:Attempt):Promise<void> {
    if (a.cleanup) return a.cleanup;
    if (a.cleaned) {this.publish(a,a.end);return Promise.resolve();}
    this.stopTimer();this.publish(a,"closing");
    const work=Promise.resolve().then(async()=>{
      const closeOwned=()=>a.controller ? a.controller.close() : a.id ? this.client.close(a.id) : Promise.resolve();
      if(a.id) {
        // start waits for native ACK: issue cancellation now, then wait both actual completions.
        const results=await Promise.allSettled([Promise.resolve().then(closeOwned),a.issued]);
        if(results[0].status==="rejected") throw results[0].reason;
      } else {
        // An unabortable reserve may return a lease later; only close it, never start it.
        await a.issued;await closeOwned();
      }
      a.cleaned=true;this.publish(a,a.end);
    }).catch(()=>{this.publish(a,"cleanup_failed","rlogin_attempt_cleanup_failed");throw Error("rlogin_attempt_cleanup_failed");});
    a.cleanup=work;void work.then(()=>{a.cleanup=null;},()=>{a.cleanup=null;});return work;
  }
}
