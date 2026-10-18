import {useEffect,useLayoutEffect,useId,useRef,useState,useSyncExternalStore,type FormEvent} from "react";
import {Loader2,Play,RefreshCw,Square,X} from "lucide-react";
import {useI18n,type MessageKey} from "../../shared/i18n";
import {AppSelect} from "../../shared/ui/AppSelect";
import {terminalEncodingOptions} from "../connections/connectionTypes";
import type {RshWorkspaceSessions} from "../layout/rshWorkspaceSessions";
import type {RshTaskSession} from "./rshRuntime";
import type {RshSnapshot} from "./RshTaskOwner";
import {RshError,type RshRequest,type RshSignal} from "./rshTypes";
import {validateDraft,rshReasonLabel,type DraftErrors,type DraftField} from "./rshDraft";
import {RshOutputView} from "./RshOutputView";
interface Props {tabId:string;title:string;active:boolean;sessions:RshWorkspaceSessions;onClose:()=>void;onState:(state:RshSnapshot)=>void;}
export default function RshCommandPane(props:Props){
  const {t}=useI18n();const[session,setSession]=useState<RshTaskSession|null>(null);const[failed,setFailed]=useState(false);
  useEffect(()=>{let gone=false;void props.sessions.get(props.tabId).then(value=>{if(!gone)setSession(value);},()=>{if(!gone)setFailed(true);});return()=>{gone=true;};},[props.sessions,props.tabId]);
  return <section className={`command-task-pane ${props.active?"":"is-hidden"}`} aria-label={props.title} aria-hidden={!props.active}>
    {session?<ReadyPane {...props} session={session}/>:<div className="terminal-direct-status"><p role={failed?"alert":"status"}>{t(failed?"rsh.reason.unavailable":"rsh.loading")}</p><button type="button" onClick={props.onClose}>{t("rsh.close")}</button></div>}
  </section>;
}
function ReadyPane({session,title,onState,onClose}:Props&{session:RshTaskSession}){
  const {t}=useI18n(),id=useId();const owner=session.owner;const snapshot=useSyncExternalStore(owner.subscribe,owner.getSnapshot);
  const report=useRef(onState);report.current=onState;useEffect(()=>{report.current(snapshot);},[snapshot.phase,snapshot.reason]);
  const[draft,setDraft]=useState<RshRequest>({local_address:"",target_address:"",port:514,local_user:"",remote_user:"",command:"",encoding:"utf-8",run_timeout_seconds:0,allow_plaintext:false});
  const[encoding,setEncoding]=useState(draft.encoding),[errors,setErrors]=useState<DraftErrors>({}),[notice,setNotice]=useState<string|null>(null);
  const[input,setInput]=useState(""),[signal,setSignal]=useState<RshSignal>("interrupt");const summary=useRef<HTMLDivElement>(null),focusErrors=useRef(false);
  useLayoutEffect(()=>{if(focusErrors.current){focusErrors.current=false;summary.current?.focus();}},[errors]);
  const locked=["starting","running","draining","closing","cleanup_failed"].includes(snapshot.phase);const running=snapshot.phase==="running";
  const stdinReady=running&&!snapshot.eofRequested&&!snapshot.status?.stdin_eof;
  const change=(key:keyof RshRequest,value:string|number|boolean)=>{setDraft(previous=>({...previous,[key]:value,allow_plaintext:key==="allow_plaintext"?Boolean(value):false}));
    setErrors(previous=>{const next={...previous};delete next[key as DraftField];return next;});};
  const errorText=(error:unknown)=>rshReasonLabel(error instanceof RshError?error.code:"rsh_task_unavailable",t);
  const action=async(work:()=>Promise<void>)=>{setNotice(null);try{await work();}catch(error){setNotice(errorText(error));}};
  function submit(event:FormEvent){event.preventDefault();if(locked)return;const found=validateDraft(draft);setErrors(found);
    if(Object.keys(found).length){focusErrors.current=true;return;}
    const frozen={...draft};setDraft(previous=>({...previous,allow_plaintext:false}));setEncoding(frozen.encoding);setNotice(null);
    void owner.run(frozen,session.output).catch(()=>undefined);
  }
  const field=(key:Exclude<DraftField,"allow_plaintext"|"command">,label:MessageKey,type="text")=><label className="settings-field" htmlFor={`${id}-${key}`}>
    <span>{t(label)}</span><input id={`${id}-${key}`} className="settings-input" type={type} autoComplete="off" spellCheck={false}
      value={typeof draft[key]==="number"&&Number.isNaN(draft[key])?"":draft[key]} disabled={locked} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key]?`${id}-${key}-error`:undefined}
      onChange={event=>change(key,type==="number"?(event.target.value===""?NaN:Number(event.target.value)):event.target.value)}/>
    {errors[key]?<span id={`${id}-${key}-error`} className="pane-error">{t(errors[key] as MessageKey)}</span>:null}</label>;
  return <>
    <header className="command-task-header"><strong>{title}</strong><span role="status">{t(`rsh.phase.${snapshot.phase}`)}</span>
      {['starting','running','draining'].includes(snapshot.phase)?<button type="button" className="text-tool-button" onClick={()=>{void action(()=>owner.cancel());}}><Square className="ui-icon" aria-hidden="true"/>{t("rsh.cancel")}</button>:null}
      <button type="button" className="text-tool-button" disabled={snapshot.phase==="closing"} onClick={onClose}><X className="ui-icon" aria-hidden="true"/>{t(snapshot.phase==="cleanup_failed"?"rsh.retryClose":"rsh.close")}</button>
    </header>
    <form className="command-task-form" noValidate onSubmit={submit} autoComplete="off">
      <p className="settings-help">{t("rsh.hint")}</p>
      {Object.keys(errors).length?<div ref={summary} role="alert" tabIndex={-1} className="pane-error"><strong>{t("rsh.validationTitle")}</strong><ul>{Object.entries(errors).map(([key,value])=><li key={key}><a href={`#${id}-${key}`}>{t(value as MessageKey)}</a></li>)}</ul></div>:null}
      <div className="command-task-fields">{field("target_address","rsh.target")}{field("local_address","rsh.local")}{field("local_user","rsh.localUser")}{field("remote_user","rsh.remoteUser")}
        {field("port","rsh.port","number")}{field("run_timeout_seconds","rsh.timeout","number")}
        <div className="settings-field"><span>{t("rsh.encoding")}</span><AppSelect ariaLabel={t("rsh.encoding")} value={draft.encoding} options={terminalEncodingOptions} disabled={locked} onChange={value=>change("encoding",value)}/></div>
      </div>
      <label className="settings-field" htmlFor={`${id}-command`}><span>{t("rsh.command")}</span><textarea id={`${id}-command`} className="settings-input command-task-command" rows={3} value={draft.command} disabled={locked} spellCheck={false} aria-invalid={Boolean(errors.command)} aria-describedby={errors.command?`${id}-command-error`:undefined} onChange={event=>change("command",event.target.value)}/>
        {errors.command?<span id={`${id}-command-error`} className="pane-error">{t(errors.command as MessageKey)}</span>:null}</label>
      <label className="command-task-toggle" htmlFor={`${id}-allow_plaintext`}><input id={`${id}-allow_plaintext`} type="checkbox" checked={draft.allow_plaintext} disabled={locked} onChange={event=>change("allow_plaintext",event.target.checked)}/>{t("rsh.consent")}</label>
      {errors.allow_plaintext?<p className="pane-error">{t("rsh.consentRequired")}</p>:null}
      <button type="submit" className="repository-primary-button" disabled={locked} aria-busy={snapshot.phase==="starting"}>
        {snapshot.phase==="starting"?<Loader2 className="ui-icon spin" aria-hidden="true"/>:snapshot.generation?<RefreshCw className="ui-icon" aria-hidden="true"/>:<Play className="ui-icon" aria-hidden="true"/>}{t(snapshot.generation?"rsh.rerun":"rsh.run")}</button>
    </form>
    {snapshot.reason||notice?<p role="alert" className="pane-error">{notice??rshReasonLabel(snapshot.reason!,t)}</p>:null}
    <p className="settings-help">{t("rsh.unknown")}</p>
    <RshOutputView output={session.output} encoding={encoding} status={snapshot.status}/>
    <div className="command-task-input"><label className="settings-field" htmlFor={`${id}-stdin`}><span>{t("rsh.stdin")} · {t(snapshot.status?.stdin_eof?"rsh.eof":"rsh.open")}</span><textarea id={`${id}-stdin`} className="settings-input" rows={2} value={input} disabled={!stdinReady||snapshot.inputPending} spellCheck={false} onChange={event=>setInput(event.target.value)}/><span className="settings-help">{t("rsh.stdinHint")}</span></label>
      <div className="command-task-actions"><button type="button" className="text-tool-button" disabled={!stdinReady||snapshot.inputPending||!input} onClick={()=>{void action(async()=>{await owner.send(input);setInput("");});}}>{t("rsh.send")}</button>
        <button type="button" className="text-tool-button" disabled={!stdinReady||snapshot.inputPending} onClick={()=>{void action(()=>owner.stdinEof());}}>{t("rsh.stdinEof")}</button>
        <AppSelect className="command-task-signal" ariaLabel={t("rsh.signal")} value={signal} options={(["hangup","interrupt","quit","kill","terminate"] as const).map(value=>({value,label:value}))} disabled={!running} onChange={setSignal}/>
        <button type="button" className="text-tool-button" disabled={!running||snapshot.signalPending>=32} onClick={()=>{void action(()=>owner.signal(signal));}}>{t("rsh.sendSignal")}</button>
      </div>
    </div>
  </>;
}
