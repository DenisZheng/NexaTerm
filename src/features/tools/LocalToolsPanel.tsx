import { lazy, Suspense, useState } from "react";
import { File, Network } from "lucide-react";
import { useI18n } from "../../shared/i18n";
import { LocalConnectionDiagnostics } from "./LocalConnectionDiagnostics";
const LocalFileService = lazy(() => import("./LocalFileService").then((module) => ({ default: module.LocalFileService })));
export function LocalToolsPanel(props: { active: boolean; initialHost?: string; initialPort?: number }) {
  const { t } = useI18n(); const [view, setView] = useState<"network" | "files">("network");
  return <section className="toolbox-tool"><nav className="toolbox-mode-tabs" aria-label={t("docker.toolbox.typeAria")}>
    <button type="button" className={view === "network" ? "active" : ""} onClick={() => setView("network")}><Network className="ui-icon" aria-hidden="true" />{t("docker.toolbox.network")}</button>
    <button type="button" className={view === "files" ? "active" : ""} onClick={() => setView("files")}><File className="ui-icon" aria-hidden="true" />{t("fileService.title")}</button>
  </nav>{view === "network" ? <LocalConnectionDiagnostics {...props} /> : <Suspense fallback={null}><LocalFileService active={props.active} /></Suspense>}</section>;
}
