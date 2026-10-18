import { useSyncExternalStore } from "react";
import { useI18n } from "../../shared/i18n";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import type { RloginConsentQueue } from "./rloginConsentQueue";

export function RloginConsentDialog({queue}:{queue:RloginConsentQueue}) {
  const request=useSyncExternalStore(queue.subscribe,queue.getSnapshot);
  const {t}=useI18n();
  if(!request)return null;
  const {token,target}=request;
  return <ConfirmDialog key={token} open title={t("workspace.rlogin.consentTitle")}
    confirmLabel={t("workspace.rlogin.allowOnce")} cancelLabel={t("common.cancel")}
    description={t("workspace.rlogin.consentBody",{remoteUser:target.remote_user,host:target.target_address,port:target.port,
      localUser:target.local_user,localAddress:target.local_address,terminal:target.terminal,speed:target.speed,encoding:target.terminal_encoding??"utf-8"})}
    onConfirm={()=>{queue.respond(token,true);}}
    onOpenChange={open=>{if(!open)queue.respond(token,false);}}/>;
}
