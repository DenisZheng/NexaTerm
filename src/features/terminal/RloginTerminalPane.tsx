import { useLayoutEffect, useState } from "react";
import { CircleAlert, Loader2, RefreshCw, TerminalSquare, X } from "lucide-react";
import { useI18n } from "../../shared/i18n";
import { TerminalStatePanel } from "../../shared/ui/TerminalStatePanel";
import { TerminalPanel } from "./TerminalPanel";
import type { TerminalPanelProps } from "./TerminalPanel";
import type { RloginOwnedAttempt, RloginWorkspaceSnapshot } from "../layout/rloginWorkspaceSessions";
import { rloginReasonLabel, rloginStatusLabel } from "./rloginStatus";
export type RloginTerminalAppearance=Pick<TerminalPanelProps,"active"|"className"|"style"|"visible"|"onPaneFocus"|"ctrlVPaste"|"cursorBlink"|"cursorStyle"|"fontFamily"|"fontSize"|"theme"|"keywordRules"|"layoutRevision"|"clearRequestId"|"onSearchClose"|"onSearchCaseSensitiveToggle"|"onSearchWholeWordToggle"|"onSearchQueryChange"|"onSearchNavigationHandled"|"searchCaseSensitive"|"searchWholeWord"|"searchNavigationRequest"|"searchOpen"|"searchQuery">;
interface Props {
  tabId:string;title:string;owner:RloginOwnedAttempt|null;snapshot:RloginWorkspaceSnapshot|null;profileAvailable:boolean;
  appearance:RloginTerminalAppearance;onConnect:()=>void;onCancel:()=>void;onClose:()=>void;
}
export default function RloginTerminalPane({tabId,title,owner,snapshot,profileAvailable,appearance,onConnect,onCancel,onClose}:Props){
  const {t}=useI18n(),controller=owner?.getController()??null;
  const [mountedGeneration,setMountedGeneration]=useState<number|null>(null);
  const phase=snapshot?.phase??"restored",closing=Boolean(snapshot?.closeIntent);
  const busy=["loading","checking","consent","reserving","starting","closing"].includes(phase);
  const failed=phase==="failed" || phase==="cleanup_failed";
  const connectAllowed=profileAvailable && !closing && !busy && phase!=="cleanup_failed";
  const label=rloginStatusLabel(phase,t),error=profileAvailable?rloginReasonLabel(snapshot?.reason??null,t):t("workspace.rlogin.profileMissing");
  const actions=<div className="local-terminal-status-actions">
    {busy && !closing && phase!=="closing"?<button type="button" onClick={onCancel}>{t("workspace.rlogin.cancelConnect")}</button>:null}
    {connectAllowed?<button className="primary-button" type="button" onClick={onConnect}><RefreshCw className="ui-icon" aria-hidden="true"/>{t(phase==="restored"||phase==="idle"?"workspace.rlogin.connect":"workspace.rlogin.reconnect")}</button>:null}
    {!busy || phase==="cleanup_failed"?<button type="button" onClick={onClose}><X className="ui-icon" aria-hidden="true"/>{t(phase==="cleanup_failed"?"workspace.rlogin.retryClose":"workspace.tabs.close")}</button>:null}
  </div>;
  const generation=snapshot?.generation??0;
  useLayoutEffect(()=>{if(controller && phase==="initial_exchange_ready")setMountedGeneration(generation);},[controller,phase,generation]);
  if(controller && (phase==="initial_exchange_ready" || mountedGeneration===generation) && owner) {
    const adapter={controller,inputAvailable:()=>owner.getController()===controller && owner.getSnapshot().phase==="initial_exchange_ready",
      requestReconnect:onConnect,reconnectAvailable:()=>profileAvailable && !closing && !["checking","consent","reserving","starting","closing","cleanup_failed"].includes(owner.getSnapshot().phase)};
    return <TerminalPanel {...appearance} tabId={tabId} title={title} rlogin={adapter}
      rloginHeader={<div className={`terminal-instance-bar ${failed?"is-error":""}`}><span className="terminal-instance-bar-copy" role="status" aria-live="polite" title={t("workspace.rlogin.readyHint")}>{label}{error?` · ${error}`:""}</span>{actions}</div>}
      connection={null} autoConnect={false} logSupported={false} initialSessionId="" onStatusChange={()=>{}}/>;
  }
  return <TerminalStatePanel ariaLabel={`${title} · Rlogin`} visible={appearance.visible??appearance.active}
    className={`local-terminal-status ${failed?"is-error":""} ${appearance.className??""}`} style={appearance.style} onPaneFocus={appearance.onPaneFocus}
    icon={failed?<CircleAlert className="ui-icon" aria-hidden="true"/>:busy?<Loader2 className="ui-icon spin" aria-hidden="true"/>:<TerminalSquare className="ui-icon" aria-hidden="true"/>}
    message={label} description={title} error={error} actions={actions}/>;
}
