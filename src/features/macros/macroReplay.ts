import { writeMultiExecCommand } from "../workspace/multiExec/send";
import type { MultiExecTarget } from "../workspace/multiExec/targets";
import { resolvePinnedMultiExecTarget } from "../workspace/multiExec/targets";
import { MACRO_LIMITS, macroCommandBytes } from "./macroLimits";

export { MACRO_LIMITS } from "./macroLimits";
export interface MacroStep { readonly command: string; readonly delayMs: number; readonly masked?: boolean }
export interface MacroTarget { readonly key: string; readonly sessionId: string; readonly title: string }
export interface MacroPlan { readonly steps: readonly MacroStep[]; readonly targets: readonly MacroTarget[] }
export interface MacroRuntime {
  resolveTarget(key: string): MultiExecTarget | null;
  write(sessionId: string, data: string): Promise<void>;
}
export type MacroValidation = "steps" | "command" | "delay" | "targets" | "sensitive";
export type MacroDeliveryStatus = "written" | "failed" | "disconnected" | "timed_out";
export interface MacroDelivery { readonly step: number; readonly key: string; readonly status: MacroDeliveryStatus }
export interface MacroResult { readonly status: "completed" | "cancelled" | "failed"; readonly deliveries: readonly MacroDelivery[] }

/** 预览固定具体会话，不携带 profile、输出或持久化元数据。 */
export function createMacroPlan(steps: readonly MacroStep[], targets: readonly MultiExecTarget[]):
  { plan: MacroPlan; error?: never } | { plan?: never; error: MacroValidation } {
  if (!steps.length || steps.length > MACRO_LIMITS.steps) return { error: "steps" };
  if (steps.some((step) => step.masked)) return { error: "sensitive" };
  const sizes = steps.map((step) => macroCommandBytes(step.command));
  if (sizes.some((size) => size === null)
    || sizes.reduce<number>((sum, size) => sum + (size ?? 0), 0) > MACRO_LIMITS.totalBytes) return { error: "command" };
  if (steps.some((step) => !Number.isInteger(step.delayMs) || step.delayMs < 0 || step.delayMs > MACRO_LIMITS.delayMs)
    || steps.reduce((sum, step) => sum + step.delayMs, 0) > MACRO_LIMITS.totalDelayMs) return { error: "delay" };
  if (!targets.length || targets.length > MACRO_LIMITS.targets || new Set(targets.map((target) => target.key)).size !== targets.length
    || new Set(targets.map((target) => target.sessionId)).size !== targets.length
    || targets.some((target) => !target.key || !target.sessionId)) return { error: "targets" };
  return { plan: Object.freeze({
    steps: Object.freeze(steps.map((step) => Object.freeze({ command: step.command, delayMs: step.delayMs }))),
    targets: Object.freeze(targets.map(({ key, sessionId, title }) => Object.freeze({ key, sessionId, title }))),
  }) };
}

function waitBeforeStep(ms: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const finish = (ready: boolean) => { clearTimeout(timer); signal.removeEventListener("abort", cancel); resolve(ready); };
    const cancel = () => finish(false);
    const timer = setTimeout(() => finish(true), ms);
    signal.addEventListener("abort", cancel, { once: true });
  });
}

/** 只证明输入流投递，不解析输出、不记录历史、不自动重试。 */
export async function runMacro(plan: MacroPlan, runtime: MacroRuntime, signal: AbortSignal,
  onDelivery: (delivery: MacroDelivery) => void = () => {}): Promise<MacroResult> {
  const deliveries: MacroDelivery[] = [];
  const result = (status: MacroResult["status"]): MacroResult => ({ status, deliveries });
  const current = (target: MacroTarget) => resolvePinnedMultiExecTarget(target, runtime.resolveTarget);
  const report = (step: number, key: string, status: MacroDeliveryStatus) => {
    const delivery = { step, key, status }; deliveries.push(delivery); onDelivery(delivery);
  };
  if (signal.aborted) return result("cancelled");
  // 确认时整组校验，避免已知部分目标失效仍开始执行。
  for (const target of plan.targets) {
    if (!current(target)) { report(0, target.key, "disconnected"); return result("failed"); }
  }
  for (const [index, step] of plan.steps.entries()) {
    if (!await waitBeforeStep(step.delayMs, signal)) return result("cancelled");
    for (const target of plan.targets) {
      if (signal.aborted) return result("cancelled");
      let timedOut = false;
      const [delivery] = await writeMultiExecCommand({
        data: `${step.command}\r`, targetKeys: [target.key], resolveTarget: () => current(target),
        write: async (sessionId, data) => {
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            await Promise.race([
              runtime.write(sessionId, data),
              new Promise<never>((_, reject) => { timer = setTimeout(() => { timedOut = true; reject(new Error("macro_write_timeout")); }, MACRO_LIMITS.writeTimeoutMs); }),
            ]);
          } finally { clearTimeout(timer); }
        },
      });
      report(index, target.key, timedOut ? "timed_out" : delivery.status);
      if (signal.aborted) return result("cancelled");
      if (delivery.status !== "written") return result("failed");
    }
  }
  return result("completed");
}
