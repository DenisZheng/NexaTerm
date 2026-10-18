import {useLayoutEffect,useMemo,useState,useSyncExternalStore} from "react";
import {useI18n} from "../../shared/i18n";
import {outputText,type RshOutputBuffer} from "./RshOutputBuffer";
import type {RshStatus} from "./rshTypes";
export function RshOutputView({output,encoding,status}:{output:RshOutputBuffer;encoding:string;status:RshStatus|null}){
  const {t}=useI18n();const snapshot=useSyncExternalStore(output.subscribe,output.getSnapshot);const[hex,setHex]=useState(false);
  const stdout=useMemo(()=>outputText(output.bytes("stdout"),encoding,hex,Boolean(status?.stdout_eof)),[output,snapshot.revision,encoding,hex,status?.stdout_eof]);
  const stderr=useMemo(()=>outputText(output.bytes("stderr"),encoding,hex,Boolean(status?.stderr_eof)),[output,snapshot.revision,encoding,hex,status?.stderr_eof]);
  useLayoutEffect(()=>{output.consumed(snapshot.revision);},[output,snapshot.revision]);
  return <div className="command-task-output">
    <label className="command-task-toggle"><input type="checkbox" checked={hex} onChange={e=>setHex(e.target.checked)}/>{t("rsh.hex")}</label>
    {snapshot.paused?<p role="status" className="pane-error">{t("rsh.paused")}</p>:null}
    <div className="command-task-streams">{(["stdout","stderr"] as const).map(stream=>{const view=stream==="stdout"?stdout:stderr;
      return <section key={stream} aria-label={stream}><div className="command-task-stream-header"><strong>{stream}</strong>
        <span>{t("rsh.bytes",{count:snapshot[stream]})} · {t(status?.[stream==="stdout"?"stdout_eof":"stderr_eof"]?"rsh.eof":"rsh.open")}</span>
        <button type="button" className="text-tool-button" onClick={()=>output.clear(stream)}>{t("rsh.clear")}</button></div>
        {view.hex&&!hex?<p className="settings-help">{t("rsh.hexFallback")}</p>:null}<pre tabIndex={0} aria-label={`${stream} ${view.hex?"hex":"text"}`}>{view.text}</pre></section>;
    })}</div>
  </div>;
}
