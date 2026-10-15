import { useEffect, useRef, useState } from "react";
import { FileText, Square } from "lucide-react";
import { useI18n } from "../../shared/i18n";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { terminalLogStart, terminalLogStatus, terminalLogStop, type TerminalLogStatus } from "../../shared/tauri/commands";
import { selectTerminalLogSavePath } from "../../shared/tauri/dialog";
import { hasTauriRuntime } from "../../shared/tauri/runtime";

const active = (status: TerminalLogStatus | null) => Boolean(status &&
  ["starting", "recording", "stopping"].includes(status.state));

export function TerminalLogControls({ sessionId, supported = true }: { sessionId: string | null; supported?: boolean }) {
  const { t } = useI18n();
  const current = useRef(sessionId);
  current.current = sessionId;
  const mounted = useRef(false);
  const operation = useRef(0);
  const [target, setTarget] = useState(sessionId);
  const [status, setStatus] = useState<TerminalLogStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; operation.current += 1; };
  }, []);

  useEffect(() => {
    operation.current += 1;
    setConfirmTarget(null);
    setBusy(false);
    if (sessionId) {
      setTarget(sessionId);
      setStatus(null);
      setFailed(false);
      setChecking(true);
      setRefresh((value) => value + 1);
    }
    // Disconnect retains the old polling target until flush completes.
  }, [sessionId]);

  useEffect(() => {
    if (!supported || !target || !hasTauriRuntime()) { setChecking(false); return; }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const generation = operation.current;
    async function poll() {
      try {
        const next = await terminalLogStatus(target!);
        if (cancelled || operation.current !== generation) return;
        setStatus(next);
        setChecking(false);
        if (active(next)) timer = setTimeout(() => void poll(), 750);
      } catch {
        if (!cancelled && operation.current === generation) {
          setFailed(true);
          setChecking(false);
        }
      }
    }
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [target, refresh, sessionId, supported]);

  async function start() {
    const pinned = confirmTarget;
    if (!supported || !pinned || pinned !== current.current || busy) return;
    const generation = ++operation.current;
    setBusy(true);
    try {
      const path = await selectTerminalLogSavePath();
      if (!path || !mounted.current || current.current !== pinned || generation !== operation.current) return;
      const next = await terminalLogStart(pinned, path);
      if (!mounted.current || current.current !== pinned || generation !== operation.current) return;
      setTarget(pinned);
      setStatus(next);
      setFailed(false);
    } catch {
      if (mounted.current && generation === operation.current) setFailed(true);
    } finally {
      if (mounted.current && generation === operation.current) {
        setBusy(false);
        setConfirmTarget(null);
        setRefresh((value) => value + 1);
      }
    }
  }

  async function stop() {
    if (!target || !status || busy) return;
    const generation = ++operation.current;
    setBusy(true);
    try {
      const next = await terminalLogStop(target, status.capture_id);
      if (mounted.current && generation === operation.current) { setStatus(next); setFailed(false); }
    } catch {
      if (mounted.current && generation === operation.current) setFailed(true);
    } finally {
      if (mounted.current && generation === operation.current) {
        setBusy(false);
        setRefresh((value) => value + 1);
      }
    }
  }

  return <div className="terminal-log-controls" onKeyDown={(event) => event.stopPropagation()}>
    {active(status) ? <button type="button" disabled={busy || status?.state === "stopping"}
      onClick={() => void stop()}><Square className="ui-icon" />{t("terminal.log.stop")}</button>
      : <button type="button" disabled={!supported || !sessionId || busy || checking || failed || !hasTauriRuntime()}
        onClick={() => setConfirmTarget(sessionId)}><FileText className="ui-icon" />{t("terminal.log.start")}</button>}
    <span role="status" aria-live="polite">{!supported ? t("terminal.log.unsupported") : failed ? t("terminal.log.error") : checking ? t("terminal.log.checking") :
      status ? `${t(`terminal.log.${status.state}`)} · ${status.bytes_written.toLocaleString()} B` : t("terminal.log.idle")}</span>
    {failed ? <button type="button" disabled={busy} onClick={() => { setFailed(false); setChecking(true); setRefresh((value) => value + 1); }}>
      {t("terminal.log.retry")}</button> : null}
    <ConfirmDialog open={Boolean(confirmTarget)} title={t("terminal.log.start")}
      description={t("terminal.log.warning")} confirmLabel={t("terminal.log.choose")}
      onConfirm={start} onOpenChange={(open) => { if (!open) setConfirmTarget(null); }} />
  </div>;
}
