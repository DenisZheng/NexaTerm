import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { FolderOpen, Play, RefreshCw, Square, X } from "lucide-react";
import { useI18n, type MessageKey } from "../../shared/i18n";
import { selectXdmcpEngine } from "../../shared/tauri/dialog";
import type { XdmcpWorkspaceSessions } from "../layout/xdmcpWorkspaceSessions";
import type { XdmcpSessionOwner, XdmcpSnapshot } from "./XdmcpSessionOwner";
import type { XdmcpRequest } from "./xdmcpTypes";
import { xdmcpFailure } from "./xdmcpWire";
import { validateXdmcpDraft, type XdmcpDraftErrors } from "./xdmcpDraft";

interface Props { tabId: string; title: string; active: boolean; sessions: XdmcpWorkspaceSessions; onClose: () => void; onState: (state: XdmcpSnapshot) => void; }
export default function XdmcpSessionPane(props: Props) {
  const { t } = useI18n();
  const [owner, setOwner] = useState<XdmcpSessionOwner | null>(null), [failed, setFailed] = useState(false);
  useEffect(() => {
    let gone = false;
    void props.sessions.get(props.tabId).then(value => { if (!gone) setOwner(value); }, () => { if (!gone) setFailed(true); });
    return () => { gone = true; };
  }, [props.sessions, props.tabId]);
  return <section className={`command-task-pane ${props.active ? "" : "is-hidden"}`} aria-label={props.title} aria-hidden={!props.active}>
    {owner ? <ReadyPane {...props} owner={owner} /> : <div className="terminal-direct-status">
      <p role={failed ? "alert" : "status"}>{t(failed ? "xdmcp.reason.unavailable" : "xdmcp.loading")}</p>
      <button type="button" className="text-tool-button" onClick={props.onClose}>{t("xdmcp.close")}</button>
    </div>}
  </section>;
}
function ReadyPane({ owner, title, onClose, onState }: Props & { owner: XdmcpSessionOwner }) {
  const { t } = useI18n(), id = useId(), snapshot = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  const report = useRef(onState); report.current = onState;
  useEffect(() => { report.current(snapshot); }, [snapshot]);
  const [draft, setDraft] = useState<XdmcpRequest>({ executable: "", target: "", local_address: "", allow_external: false, allow_network: false });
  const [errors, setErrors] = useState<XdmcpDraftErrors>({}), [notice, setNotice] = useState<MessageKey | null>(null), [selecting, setSelecting] = useState(false);
  const summary = useRef<HTMLDivElement>(null), focusErrors = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useLayoutEffect(() => { if (focusErrors.current) { focusErrors.current = false; summary.current?.focus(); } }, [errors]);
  const locked = selecting || ["starting", "querying", "stopping", "cleanup_failed"].includes(snapshot.phase);
  function change(key: keyof XdmcpRequest, value: string | boolean) {
    setDraft(previous => ({ ...previous, ...(typeof value === "string" ? { allow_external: false, allow_network: false } : {}), [key]: value }));
    setErrors(previous => { const next = { ...previous }; delete next[key]; return next; }); setNotice(null);
  }
  async function action(work: () => Promise<void>) {
    setNotice(null);
    try { await work(); } catch (error) { if (mounted.current) setNotice(`xdmcp.reason.${xdmcpFailure(error)}`); }
  }
  function submit(event: FormEvent) {
    event.preventDefault(); if (locked) return;
    const found = validateXdmcpDraft(draft); setErrors(found);
    if (Object.keys(found).length) { focusErrors.current = true; return; }
    const request = { ...draft }; setDraft(previous => ({ ...previous, allow_external: false, allow_network: false }));
    void action(() => owner.connect(request));
  }
  async function chooseEngine() {
    setSelecting(true); setNotice(null);
    try { const selected = await selectXdmcpEngine(); if (mounted.current && selected !== null) change("executable", selected); }
    catch { if (mounted.current) setNotice("xdmcp.selectFailed"); }
    finally { if (mounted.current) setSelecting(false); }
  }
  const field = (key: "target" | "local_address" | "executable", label: MessageKey) => <label className="settings-field" htmlFor={`${id}-${key}`}>
    <span id={`${id}-${key}-label`}>{t(label)}</span><input id={`${id}-${key}`} aria-labelledby={`${id}-${key}-label`} className="settings-input" value={draft[key]} disabled={locked} autoComplete="off" spellCheck={false}
      aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `${id}-${key}-error` : undefined} onChange={event => change(key, event.target.value)} />
    {errors[key] ? <span id={`${id}-${key}-error`} className="pane-error">{t(errors[key])}</span> : null}
  </label>;
  return <>
    <header className="command-task-header"><strong>{title}</strong><span role="status">{t(`xdmcp.phase.${snapshot.phase}`)}</span>
      {["starting", "querying"].includes(snapshot.phase) ? <button type="button" className="text-tool-button" onClick={() => { void action(() => owner.cancel()); }}><Square className="ui-icon" aria-hidden="true" />{t("xdmcp.cancel")}</button> : null}
      <button type="button" className="text-tool-button" disabled={snapshot.phase === "stopping"} onClick={onClose}><X className="ui-icon" aria-hidden="true" />{t(snapshot.phase === "cleanup_failed" ? "xdmcp.retryClose" : "xdmcp.close")}</button>
    </header>
    <form className="command-task-form" noValidate autoComplete="off" onSubmit={submit}>
      <p className="settings-help">{t("xdmcp.developmentHint")}</p>
      {Object.keys(errors).length ? <div ref={summary} role="alert" tabIndex={-1} className="pane-error"><strong>{t("xdmcp.validationTitle")}</strong><ul>
        {Object.entries(errors).map(([key, value]) => <li key={key}><a href={`#${id}-${key}`}>{t(value)}</a></li>)}
      </ul></div> : null}
      <div className="command-task-fields">{field("target", "xdmcp.target")}{field("local_address", "xdmcp.local")}</div>
      {field("executable", "xdmcp.engine")}
      <button type="button" className="text-tool-button" disabled={locked} onClick={() => { void chooseEngine(); }}><FolderOpen className="ui-icon" aria-hidden="true" />{t("xdmcp.chooseEngine")}</button>
      <p className="settings-help">{t("xdmcp.networkHint")}</p>
      {(["allow_external", "allow_network"] as const).map(key => <div key={key}>
        <label className="command-task-toggle" htmlFor={`${id}-${key}`}><input id={`${id}-${key}`} type="checkbox" checked={draft[key]} disabled={locked}
          aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `${id}-${key}-error` : undefined} onChange={event => change(key, event.target.checked)} />{t(key === "allow_external" ? "xdmcp.externalConsent" : "xdmcp.networkConsent")}</label>
        {errors[key] ? <p id={`${id}-${key}-error`} className="pane-error">{t(errors[key])}</p> : null}
      </div>)}
      <button type="submit" className="repository-primary-button" disabled={locked} aria-busy={snapshot.phase === "starting"}>
        {snapshot.generation ? <RefreshCw className="ui-icon" aria-hidden="true" /> : <Play className="ui-icon" aria-hidden="true" />}{t(snapshot.generation ? "xdmcp.reconnect" : "xdmcp.connect")}
      </button>
    </form>
    <p className="settings-help">{t("xdmcp.windowHint")}</p>
    {snapshot.display !== null ? <p className="settings-help">{t("xdmcp.display", { display: snapshot.display, port: 6000 + snapshot.display })}</p> : null}
    {notice || (snapshot.reason && !["closed", "cancelled"].includes(snapshot.reason)) ? <p role="alert" className="pane-error">{t(notice ?? `xdmcp.reason.${snapshot.reason!}`)}</p> : null}
  </>;
}
