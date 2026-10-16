import { useEffect, useRef, useState } from "react";
import { localProbeCancel, localProbeReserve, localProbeRun } from "../../shared/tauri/commands";
import type { LocalProbeRequest, LocalProbeResult } from "./localProbeTypes";
interface Operation { id?: string; cancelRequested: boolean; cancelPromise?: Promise<void> }
type Phase = "idle" | "reserving" | "running" | "cancelling" | "cancelled" | "done" | "error";
export function useLocalConnectionProbe(active: boolean) {
  const current = useRef<Operation | null>(null);
  const enabled = useRef(active);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<LocalProbeResult | null>(null);
  const [error, setError] = useState<"request" | "cancel" | null>(null);
  const owns = (op: Operation) => enabled.current && current.current === op;
  const release = (op: Operation) => {
    if (!op.id) return Promise.resolve();
    if (!op.cancelPromise) {
      op.cancelPromise = localProbeCancel(op.id).finally(() => { op.cancelPromise = undefined; });
    }
    return op.cancelPromise;
  };
  useEffect(() => {
    enabled.current = active;
    if (!active) { setPhase("idle"); setResult(null); setError(null); }
    return () => {
      enabled.current = false;
      const op = current.current;
      current.current = null;
      if (op) { op.cancelRequested = true; void release(op).catch(() => {}); }
    };
  }, [active]);
  async function run(request: LocalProbeRequest) {
    if (!enabled.current || current.current) return;
    const pinned = { ...request };
    const op: Operation = { cancelRequested: false };
    current.current = op; setPhase("reserving"); setResult(null); setError(null);
    try {
      op.id = await localProbeReserve();
      if (!owns(op) || op.cancelRequested) {
        await release(op);
        if (owns(op)) { current.current = null; setPhase("cancelled"); }
        return;
      }
      setPhase("running");
      const next = await localProbeRun(op.id, pinned);
      if (owns(op)) { current.current = null; setResult(next); setPhase("done"); setError(null); }
    } catch {
      if (owns(op)) {
        // A failed pre-run cancellation still owns a reservation and can be retried.
        if (op.id && op.cancelRequested) { setError("cancel"); setPhase("cancelling"); }
        else { void release(op).catch(() => {}); current.current = null; setError("request"); setPhase("error"); }
      }
    }
  }
  async function cancel() {
    const op = current.current;
    if (!op || !enabled.current) return;
    op.cancelRequested = true; setPhase("cancelling"); setError(null);
    if (!op.id) return;
    try {
      await release(op);
      if (owns(op)) { current.current = null; setPhase("cancelled"); }
    } catch { if (owns(op)) setError("cancel"); }
  }
  return { run, cancel, phase, result, error,
    busy: phase === "reserving" || phase === "running" || phase === "cancelling" };
}
