import type { ConnectionTerminalEncoding } from "../connections/connectionTypes";
export const MAX_CHUNK=32768;
export const MAX_TEXT_BYTES=4096;
export const phases=["reserved","starting","initial_exchange_ready","closing","closed","failed"] as const;
export type RshPhase=typeof phases[number];
export type RshStream="stdout"|"stderr";
export type RshSignal="hangup"|"interrupt"|"quit"|"kill"|"terminate";
export interface RshRequest {local_address:string;target_address:string;port:number;local_user:string;remote_user:string;command:string;
  encoding:ConnectionTerminalEncoding;run_timeout_seconds:number;allow_plaintext:boolean;}
export interface RshStatus {phase:RshPhase;reason:string|null;stdin_eof:boolean;stdout_eof:boolean;stderr_eof:boolean;
  awaiting_ack:boolean;finished:boolean;remote_exit_code:null;}
export interface RshFrame {sequence:string;stream:RshStream;data:readonly number[];}
export interface RshReply {status:RshStatus;frame:RshFrame|null;}
export interface RshCapability {native_core:boolean;runtime_available:boolean;dns_available:boolean;reserved_ports_required:boolean;}
export interface RshApi {
  capabilities():Promise<RshCapability>;reserve(request:RshRequest):Promise<string>;start(id:string):Promise<void>;
  read(id:string,ack:string|null):Promise<RshReply>;status(id:string):Promise<RshStatus>;
  writeText(id:string,data:string):Promise<void>;stdinEof(id:string):Promise<void>;signal(id:string,signal:RshSignal):Promise<void>;
  cancel(id:string):Promise<void>;close(id:string):Promise<void>;
}
export class RshError extends Error {constructor(readonly code:string){super(code);this.name="RshError";}}
export const emptyStatus=():RshStatus=>({phase:"reserved",reason:null,stdin_eof:false,stdout_eof:false,stderr_eof:false,awaiting_ack:false,finished:false,remote_exit_code:null});
