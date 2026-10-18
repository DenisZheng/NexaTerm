import type {RshTaskSession} from "../rsh/rshRuntime";
interface Slot {owner:Promise<RshTaskSession>;closing:Promise<void>|null;closed:boolean;}
/** Only private owners live here; workspace tabs/snapshots contain no command/handle. */
export class RshWorkspaceSessions {
  private slots=new Map<string,Slot>();private disposed=false;
  constructor(private readonly load=()=>import("../rsh/rshRuntime")){}
  open(id:string){
    if(this.disposed)throw new Error("rsh_task_unavailable");if(this.slots.has(id))return;
    const slot:Slot={owner:Promise.resolve().then(()=>this.load()).then(runtime=>runtime.createRshTask()),closing:null,closed:false};
    // Observe module failures even when the tab closes before its pane has mounted.
    void slot.owner.catch(()=>undefined);this.slots.set(id,slot);
  }
  get(id:string){return this.slots.get(id)?.owner??Promise.reject(new Error("rsh_task_expired"));}
  close(id:string):Promise<void>{const slot=this.slots.get(id);if(!slot)return Promise.resolve();if(slot.closing)return slot.closing;
    const work=slot.owner.then(async session=>{await session.owner.close();session.output.dispose();},()=>undefined).then(()=>{slot.closed=true;});slot.closing=work;
    void work.then(()=>{slot.closing=null;},()=>{slot.closing=null;});return work;
  }
  forget(id:string){const slot=this.slots.get(id);if(slot&&!slot.closed)throw new Error("rsh_cleanup_failed");this.slots.delete(id);}
  async dispose(){this.disposed=true;const results=await Promise.allSettled([...this.slots.keys()].map(id=>this.close(id)));
    if(results.some(r=>r.status==="rejected"))throw new Error("rsh_cleanup_failed");this.slots.clear();}
}
