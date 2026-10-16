import { useEffect, useRef, useState } from "react";
import { Copy, File, FolderOpen, Play, RefreshCw, Square } from "lucide-react";
import { useI18n } from "../../shared/i18n";
import { selectFileServiceFile } from "../../shared/tauri/dialog";
import { hasTauriRuntime } from "../../shared/tauri/runtime";
import { fileServiceDownloadCommand } from "./fileServiceTypes";
import { useFileService } from "./useFileService";
export function LocalFileService({ active }: { active: boolean }) {
  const { t } = useI18n(); const desktop = hasTauriRuntime();
  const service = useFileService(active && desktop);
  const [path, setPath] = useState(""); const [port, setPort] = useState("0");
  const [picking, setPicking] = useState(false); const pickerBusy = useRef(false);
  const [notice, setNotice] = useState<"copied" | "copyFailed" | "chooseFailed" | null>(null);
  const revision = useRef(0); const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { revision.current += 1; return () => { revision.current += 1; }; }, [active]);
  const portValid = /^\d+$/.test(port) && (Number(port) === 0 || Number(port) >= 1024 && Number(port) <= 65535);
  const name = path.split(/[\\/]/).pop() || "";
  const endpoint = service.status?.port ? `http://127.0.0.1:${service.status.port}/file` : "";
  async function choose() {
    if (!active || !desktop || service.busy || pickerBusy.current) return;
    const version = revision.current; pickerBusy.current = true; setPicking(true); setNotice(null);
    try { const selected = await selectFileServiceFile(); if (version === revision.current && selected) setPath(selected); }
    catch { if (version === revision.current) setNotice("chooseFailed"); }
    finally { pickerBusy.current = false; if (mounted.current) setPicking(false); }
  }
  async function copyCommand() {
    if (!endpoint || !service.token || service.phase !== "running") return;
    const version = revision.current;
    const command = fileServiceDownloadCommand(service.status?.port, service.token, navigator.platform.toLowerCase().startsWith("win"));
    if (!command) { setNotice("copyFailed"); return; }
    try { const clipboard = await import("@tauri-apps/plugin-clipboard-manager"); await clipboard.writeText(command); if (version === revision.current) setNotice("copied"); }
    catch { if (version === revision.current) setNotice("copyFailed"); }
  }
  return <section className="network-diagnostics" aria-label={t("fileService.title")}>
    <header className="docker-tool-summary network-diagnostics-summary"><div><strong>{t("fileService.title")}</strong><span>{t("fileService.scope")}</span></div><File className="ui-icon" aria-hidden="true" /></header>
    <form className="network-diagnostic-form" onSubmit={(event) => {
      event.preventDefault(); if (active && desktop && path && portValid && !picking) { setNotice(null); void service.start(path, Number(port)); }
    }}>
      <label className="network-diagnostic-field"><span>{t("fileService.file")}</span><input value={name} readOnly placeholder={t("fileService.noFile")} /></label>
      <button className="toolbox-mini-button" type="button" disabled={!active || !desktop || service.busy || picking} onClick={() => void choose()}><FolderOpen className="ui-icon" aria-hidden="true" />{t("fileService.choose")}</button>
      <label className="network-diagnostic-field"><span>{t("fileService.port")}</span><input value={port} inputMode="numeric" disabled={service.busy} aria-invalid={!portValid} onChange={(event) => setPort(event.target.value)} /></label>
      <p>{t("fileService.limits")}</p>
      {!desktop ? <p>{t("localProbe.desktop")}</p> : null}
      {!portValid ? <p role="alert">{t("fileService.error.invalid_port")}</p> : null}
      <div className="network-diagnostic-actions">
        <button className="toolbox-mini-button primary" type="submit" disabled={!active || !desktop || !path || !portValid || picking || service.busy}><Play className="ui-icon" aria-hidden="true" />{t("fileService.start")}</button>
        <button className="toolbox-mini-button" type="button" disabled={!active || !service.busy} onClick={() => void service.stop()}><Square className="ui-icon" aria-hidden="true" />{t("fileService.stop")}</button>
      </div>
      {service.error ? <p role="alert" className="docker-inline-error">{t(`fileService.error.${service.error}`)}</p> : null}
      <div role="status" aria-live="polite"><strong>{t(`fileService.phase.${service.phase}`)}</strong>{service.status?.size != null ? <p>{t("fileService.size", { bytes: service.status.size })}</p> : null}</div>
      {endpoint ? <label className="network-diagnostic-field"><span>{t("fileService.address")}</span><input value={endpoint} readOnly /></label> : null}
      {service.token ? <><label className="network-diagnostic-field"><span>{t("fileService.token")}</span><input type="password" value={service.token} readOnly autoComplete="off" /></label>
        <button className="toolbox-mini-button" type="button" disabled={service.phase !== "running"} onClick={() => void copyCommand()}><Copy className="ui-icon" aria-hidden="true" />{t("fileService.copy")}</button><p>{t("fileService.copyHint")}</p></>
        : service.status?.phase === "running" ? <p>{t("fileService.adopted")}</p> : null}
      {notice ? <p role={notice === "copied" ? "status" : "alert"}>{t(`fileService.${notice}`)}</p> : null}
      <details><summary>{t("fileService.audit")}</summary><p>{t("fileService.auditHint")}</p>
        <button className="toolbox-mini-button" type="button" disabled={!active || !desktop} onClick={() => void service.refreshAudit()}><RefreshCw className="ui-icon" aria-hidden="true" />{t("fileService.refreshAudit")}</button>
        {service.auditError ? <p role="alert">{t("fileService.auditFailed")}</p> : null}
        <ul>{service.audit.slice(-8).reverse().map((entry) => <li key={entry.sequence}><time>{new Date(entry.timestamp_ms).toLocaleTimeString()}</time>{" · "}{t(`fileService.audit.${entry.kind}`)}</li>)}</ul>
      </details>
    </form>
  </section>;
}
