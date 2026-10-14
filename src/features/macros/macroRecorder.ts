import { shouldPauseMacroCapture } from "../commands/commandPrivacy";
import type { MultiExecTarget } from "../workspace/multiExec/targets";
import { MACRO_LIMITS, macroCommandBytes } from "./macroLimits";
import type { MacroStep, MacroTarget } from "./macroReplay";

export type RecordingReason = "stopped" | "disconnected" | "failed" | "partial" | "limit" | "sensitive";
export interface MacroRecordingSnapshot {
  readonly recording: boolean;
  readonly source: MacroTarget | null;
  readonly steps: readonly MacroStep[];
  readonly reason: RecordingReason | null;
  readonly omitHistory: boolean;
}
export interface MacroRecordingTicket { readonly generation: number; readonly sequence: number; readonly sessionId: string }
interface PendingStep { ticket: MacroRecordingTicket; command: string; masked: boolean; at: number; written: boolean; bytes: number }

/** Workspace-owned, bounded memory recorder. No terminal keystroke or persistence subscription. */
export function createMacroRecorder(resolveTarget: (key: string) => MultiExecTarget | null, now = () => performance.now()) {
  let generation = 0, sequence = 0, totalBytes = 0, totalDelay = 0;
  let lastAt: number | null = null;
  let pending: PendingStep[] = [];
  const listeners = new Set<() => void>();
  let snapshot: MacroRecordingSnapshot = Object.freeze({ recording: false, source: null, steps: Object.freeze([]), reason: null, omitHistory: false });
  const publish = (update: Partial<MacroRecordingSnapshot>) => {
    snapshot = Object.freeze({ ...snapshot, ...update });
    listeners.forEach((listener) => listener());
  };
  const validSource = () => snapshot.source && resolveTarget(snapshot.source.key)?.sessionId === snapshot.source.sessionId;
  const stop = (reason: RecordingReason = "stopped") => {
    generation += 1; pending = []; publish({ recording: false, reason });
  };
  const clear = () => {
    generation += 1; pending = []; totalBytes = 0; totalDelay = 0; lastAt = null;
    publish({ recording: false, source: null, steps: Object.freeze([]), reason: null, omitHistory: false });
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start(target: MultiExecTarget): boolean {
      if (resolveTarget(target.key)?.sessionId !== target.sessionId) return false;
      clear();
      publish({ recording: true, source: Object.freeze({ key: target.key, sessionId: target.sessionId, title: target.title }) });
      return true;
    },
    reconcile() { if (snapshot.source && !validSource() && (snapshot.recording || pending.length)) stop("disconnected"); },
    omitAutomaticHistory(targetKeys: readonly string[]) {
      return snapshot.omitHistory && Boolean(snapshot.source && targetKeys.includes(snapshot.source.key));
    },
    begin(command: string, appendEnter: boolean, targetKeys: readonly string[]): MacroRecordingTicket | null {
      if (!snapshot.recording || !snapshot.source) return null;
      if (!validSource()) { stop("disconnected"); return null; }
      if (!targetKeys.includes(snapshot.source.key)) return null;
      if (!appendEnter) { stop("partial"); return null; }
      if (snapshot.steps.length + pending.length >= MACRO_LIMITS.steps) { stop("limit"); return null; }
      const masked = shouldPauseMacroCapture(command);
      const bytes = masked ? 0 : macroCommandBytes(command);
      if (bytes === null || totalBytes + pending.reduce((sum, item) => sum + item.bytes, 0) + bytes > MACRO_LIMITS.totalBytes) { stop("limit"); return null; }
      const ticket = Object.freeze({ generation, sequence: ++sequence, sessionId: snapshot.source.sessionId });
      pending.push({ ticket, command: masked ? "" : command, masked, at: now(), written: false, bytes });
      // 先暂停接收再提交 native 写入；随后的密码回答不进入待完成队列。
      if (masked) publish({ recording: false, reason: "sensitive", omitHistory: true });
      return ticket;
    },
    finish(ticket: MacroRecordingTicket | null, written: boolean) {
      if (!ticket || ticket.generation !== generation) return;
      const entry = pending.find((item) => item.ticket.sequence === ticket.sequence);
      if (!entry) return;
      if (!validSource()) { stop("disconnected"); return; }
      if (!written) { stop("failed"); return; }
      entry.written = true;
      while (pending[0]?.written) {
        const next = pending.shift();
        if (!next) break;
        const delayMs = lastAt === null ? 0 : Math.floor(next.at - lastAt);
        if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > MACRO_LIMITS.delayMs || totalDelay + delayMs > MACRO_LIMITS.totalDelayMs) { stop("limit"); return; }
        totalBytes += next.bytes; totalDelay += delayMs; lastAt = next.at;
        const step: MacroStep = Object.freeze({ command: next.command, delayMs, ...(next.masked ? { masked: true } : {}) });
        publish({ steps: Object.freeze([...snapshot.steps, step]) });
      }
    },
    stop, clear,
    dispose() { clear(); listeners.clear(); },
  };
}
export type MacroRecorder = ReturnType<typeof createMacroRecorder>;
