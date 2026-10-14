import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../shared/i18n";
import { WorkflowDialog } from "../../shared/ui/WorkflowDialog";
import type { MultiExecTarget } from "../workspace/multiExec/targets";
import { createMacroPlan, MACRO_LIMITS, runMacro, type MacroDelivery, type MacroPlan, type MacroResult, type MacroRuntime, type MacroStep, type MacroValidation } from "./macroReplay";

export function MacroDialog({ targets, runtime, onClose }: {
  targets: readonly MultiExecTarget[]; runtime: MacroRuntime; onClose(): void;
}) {
  const { t } = useI18n();
  const [steps, setSteps] = useState<MacroStep[]>([{ command: "", delayMs: 0 }]);
  const [plan, setPlan] = useState<MacroPlan | null>(null);
  const [error, setError] = useState<MacroValidation | null>(null);
  const [deliveries, setDeliveries] = useState<MacroDelivery[]>([]);
  const [result, setResult] = useState<MacroResult["status"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const active = useRef<AbortController | null>(null);
  const submitted = useRef(false);
  const alive = useRef(true);
  const runtimeRef = useRef(runtime); runtimeRef.current = runtime;
  useEffect(() => { alive.current = true; return () => { alive.current = false; active.current?.abort(); }; }, []);
  function close() { active.current?.abort(); onClose(); }
  function preview() {
    const next = createMacroPlan(steps, targets);
    setError(next.error ?? null);
    if (next.plan) { submitted.current = false; setPlan(next.plan); setResult(null); setDeliveries([]); }
  }
  async function execute() {
    if (!plan || active.current || submitted.current || result) return;
    submitted.current = true;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setStopping(false);
    try {
      const outcome = await runMacro(plan, {
        resolveTarget: (key) => runtimeRef.current.resolveTarget(key),
        write: (sessionId, data) => runtimeRef.current.write(sessionId, data),
      }, controller.signal, (delivery) => { if (alive.current) setDeliveries((items) => [...items, delivery]); });
      if (alive.current) setResult(outcome.status);
    } catch {
      // 不展示/记录可能包含命令或秘密的 native 原始错误。
      if (alive.current) setResult("failed");
    } finally { active.current = null; if (alive.current) setBusy(false); }
  }
  return <WorkflowDialog title={t("macros.title")} description={t("macros.description")} onClose={close} actions={<>
    {!busy && plan ? <button type="button" onClick={() => { setPlan(null); setResult(null); }}>{t("macros.edit")}</button> : <span />}
    <button type="button" onClick={() => { if (busy) { active.current?.abort(); setStopping(true); } else close(); }} disabled={stopping && busy}>
      {t(busy ? stopping ? "macros.stopping" : "macros.cancel" : "workspace.file.close")}
    </button>
    {!plan ? <button className="primary-button" type="button" onClick={preview}>{t("macros.preview")}</button> :
      !result ? <button className="primary-button" type="button" disabled={busy} onClick={() => void execute()}>{t("macros.execute")}</button> : null}
  </>}>
    <p className="dialog-subtitle">{t("macros.memoryOnly")}</p>
    {!plan ? <>
      <p>{t("macros.targetCount", { count: targets.length })}</p>
      {steps.map((step, index) => <fieldset className="workflow-step" key={index}>
        <legend>{t("macros.step", { number: index + 1 })}</legend>
        <label className="remote-file-name-field"><span>{t("macros.command")}</span>
          <textarea rows={3} spellCheck={false} autoComplete="off" value={step.command} onChange={(event) => { const command = event.target.value; setSteps((items) => items.map((item, i) => i === index ? { ...item, command } : item)); }} />
        </label>
        <label className="remote-file-name-field"><span>{t("macros.delay")}</span>
          <input type="number" min={0} max={MACRO_LIMITS.delayMs} step={100} value={step.delayMs} onChange={(event) => { const delayMs = Number(event.target.value); setSteps((items) => items.map((item, i) => i === index ? { ...item, delayMs } : item)); }} />
        </label>
        <button type="button" className="text-tool-button" disabled={steps.length === 1} onClick={() => setSteps((items) => items.filter((_, i) => i !== index))}>{t("macros.remove")}</button>
      </fieldset>)}
      <button type="button" className="text-tool-button" disabled={steps.length >= MACRO_LIMITS.steps} onClick={() => setSteps((items) => [...items, { command: "", delayMs: 0 }])}>{t("macros.add")}</button>
      {error ? <p className="remote-file-dialog-error" role="alert">{t(`macros.invalid.${error}`)}</p> : null}
    </> : <>
      <strong>{t("macros.fixedTargets")}</strong>
      <ul>{plan.targets.map((target) => <li key={target.key}>{target.title}</li>)}</ul>
      <ol>{plan.steps.map((step, index) => <li key={index}>
        <span>{t("macros.delayValue", { value: step.delayMs })}</span><pre className="workflow-command">{step.command}</pre>
      </li>)}</ol>
      <p className="dialog-subtitle">{t("macros.deliveryOnly")}</p>
      <div role="status" aria-live="polite">{t(result ? `macros.result.${result}` : busy ? "macros.running" : "macros.ready")}</div>
      {deliveries.length > 0 ? <ul>{deliveries.map((delivery, index) => <li key={index}>
        {t("macros.delivery", { step: delivery.step + 1, target: plan.targets.find((target) => target.key === delivery.key)?.title ?? "", status: t(`macros.status.${delivery.status}`) })}
      </li>)}</ul> : null}
    </>}
  </WorkflowDialog>;
}
