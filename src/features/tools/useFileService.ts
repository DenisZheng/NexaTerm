import { useEffect, useRef, useState } from "react";
import { fileServiceAudit, fileServiceReserve, fileServiceStart, fileServiceStatus, fileServiceStop } from "../../shared/tauri/commands";
import { fileServiceError, type FileServiceAudit, type FileServiceError, type FileServiceStatus } from "./fileServiceTypes";
interface Operation { id?: string; owned: boolean; cancelled: boolean; stopping?: Promise<void> }
type Phase = "idle" | "reserving" | "starting" | "running" | "stopping" | "error";
export function useFileService(active: boolean) {
  const enabled = useRef(active); const current = useRef<Operation | null>(null);
  const statusRef = useRef<FileServiceStatus | null>(null);
  const epoch = useRef(0); const auditRequest = useRef(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<FileServiceStatus | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<FileServiceError | null>(null);
  const [audit, setAudit] = useState<FileServiceAudit[]>([]);
  const [auditError, setAuditError] = useState(false);
  const owns = (op: Operation) => enabled.current && current.current === op;
  const release = (op: Operation) => {
    if (!op.id) return Promise.resolve();
    if (!op.stopping) op.stopping = fileServiceStop(op.id).finally(() => { op.stopping = undefined; });
    return op.stopping;
  };
  const clear = () => { current.current = null; statusRef.current = null; setStatus(null); setToken(null); setPhase("idle"); };
  async function refreshAudit() {
    const revision = epoch.current; const request = ++auditRequest.current;
    try { const next = await fileServiceAudit(); if (enabled.current && epoch.current === revision && request === auditRequest.current) { setAudit(next); setAuditError(false); } }
    catch { if (enabled.current && epoch.current === revision && request === auditRequest.current) setAuditError(true); }
  }
  useEffect(() => {
    enabled.current = active; epoch.current += 1;
    if (!active) { clear(); setError(null); setAudit([]); return; }
    let disposed = false; let reading = false;
    const refresh = async () => {
      if (disposed || reading) return;
      const before = current.current;
      // The start/stop response owns transitions until it has completed.
      if (before && (!before.id || before.cancelled || before.owned && !statusRef.current)) return;
      reading = true;
      try {
        const next = await fileServiceStatus();
        if (disposed || current.current !== before) return;
        setError(null);
        if (next) {
          if (!before || next.id !== before.id) { current.current = { id: next.id, owned: false, cancelled: false }; setToken(null); }
          setStatus(next); statusRef.current = next;
          setPhase(next.phase === "running" ? "running" : next.phase === "stopping" ? "stopping" : "starting");
        } else if (before) { clear(); statusRef.current = null; }
      } catch { if (!disposed && current.current === before) setError("unavailable"); }
      finally { reading = false; }
    };
    void refresh(); const timer = window.setInterval(() => { void refresh(); }, 2000);
    return () => {
      disposed = true; enabled.current = false; epoch.current += 1; window.clearInterval(timer);
      const op = current.current; current.current = null; statusRef.current = null;
      if (op?.owned) { op.cancelled = true; void release(op).catch(() => {}); }
    };
  }, [active]);
  async function start(path: string, port: number) {
    if (!enabled.current || current.current) return;
    const op: Operation = { owned: true, cancelled: false };
    current.current = op; statusRef.current = null; setPhase("reserving"); setStatus(null); setToken(null); setError(null);
    try {
      op.id = await fileServiceReserve();
      if (!owns(op) || op.cancelled) {
        await release(op); if (owns(op)) clear(); return;
      }
      setPhase("starting");
      const next = await fileServiceStart(op.id, path, port);
      if (!owns(op) || op.cancelled) { await release(op); if (owns(op)) clear(); return; }
      statusRef.current = next.status; setStatus(next.status); setToken(next.token); setPhase("running"); void refreshAudit();
    } catch (failure) {
      if (!owns(op)) return;
      try { await release(op); } catch { if (owns(op)) { op.cancelled = true; setPhase("stopping"); setError("stop_pending"); } return; }
      if (owns(op)) { clear(); setError(fileServiceError(failure)); setPhase("error"); void refreshAudit(); }
    }
  }
  async function stop() {
    const op = current.current; if (!op || !enabled.current) return;
    op.cancelled = true; setPhase("stopping"); setError(null);
    if (!op.id) return;
    try { await release(op); if (owns(op)) { clear(); statusRef.current = null; void refreshAudit(); } }
    catch (failure) { if (owns(op)) setError(fileServiceError(failure)); }
  }
  return { phase, status, token, error, audit, auditError, start, stop, refreshAudit,
    busy: phase !== "idle" && phase !== "error" };
}
