import {vi} from "vitest";
import {emptyStatus,type RshRequest,type RshReply} from "./rshTypes";
export const request=():RshRequest=>({local_address:"127.0.0.1",target_address:"example.invalid",port:514,local_user:"local",remote_user:"remote",command:" echo exact\n",encoding:"utf-8",run_timeout_seconds:0,allow_plaintext:true});
export function deferred<T>(){let resolve!:(value:T)=>void;let reject!:(error:unknown)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
export async function turn(){for(let i=0;i<25;i++)await Promise.resolve();}
export const reply=(patch:Partial<RshReply>={}):RshReply=>({status:{...emptyStatus(),phase:"initial_exchange_ready"},frame:null,...patch});
export const finished=()=>reply({status:{...emptyStatus(),phase:"closed",stdout_eof:true,stderr_eof:true,finished:true}});
export function apiFixture(){let serial=0;return {
  capabilities:vi.fn(async()=>({native_core:true,runtime_available:true,dns_available:true,reserved_ports_required:true})),
  reserve:vi.fn(async(_request:RshRequest)=>`aaaaaaaa-aaaa-4aaa-8aaa-${(++serial).toString().padStart(12,"0")}`),start:vi.fn(async()=>{}),
  read:vi.fn(async(_id:string,_ack:string|null)=>finished()),status:vi.fn(async()=>finished().status),
  writeText:vi.fn(async(_id:string,_text:string)=>{}),stdinEof:vi.fn(async(_id:string)=>{}),signal:vi.fn(async(_id:string,_signal:import("./rshTypes").RshSignal)=>{}),
  cancel:vi.fn(async(_id:string)=>{}),close:vi.fn(async(_id:string)=>{}),
};}
