import { lazy, Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Circle, ListVideo } from "lucide-react";
import { useI18n } from "../../shared/i18n";
import type { MultiExecTarget } from "../workspace/multiExec/targets";
import type { MacroRuntime } from "./macroReplay";
import { createMacroRecorder, type MacroRecorder } from "./macroRecorder";

const MacroDialog = lazy(async () => ({ default: (await import("./MacroDialog")).MacroDialog }));
const MacroRecordingDialog = lazy(async () => ({ default: (await import("./MacroRecordingDialog")).MacroRecordingDialog }));

export function MacroLauncher({ targets, selectedKeys, runtime, onOpen, recorder, onStartRecording }: {
  targets: readonly MultiExecTarget[]; selectedKeys: ReadonlySet<string>; runtime: MacroRuntime; onOpen(): void;
  recorder?: MacroRecorder; onStartRecording?(): void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [recordingDialog, setRecordingDialog] = useState(false);
  const runtimeRef = useRef(runtime); runtimeRef.current = runtime;
  const fallback = useMemo(() => createMacroRecorder((key) => runtimeRef.current.resolveTarget(key)), []);
  const store = recorder ?? fallback;
  const capture = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => () => store.clear(), [store]);
  useEffect(() => { store.reconcile(); }, [store, targets]);
  function edit() { store.stop(); onOpen(); setOpen(true); }
  const selected = targets.filter((target) => selectedKeys.has(target.key));
  return <>
    <button className="text-tool-button multi-exec-bar-mode" type="button"
      disabled={!selected.length && !capture.source}
      onClick={edit}>
      <ListVideo className="ui-icon" aria-hidden="true" /><span>{t("macros.title")}</span>
    </button>
    {recorder && onStartRecording && !capture.recording ? <button className="text-tool-button multi-exec-bar-mode" type="button" disabled={!selected.length} onClick={() => setRecordingDialog(true)}>
      <Circle className="ui-icon" aria-hidden="true" /><span>{t("macros.record.title")}</span>
    </button> : null}
    {capture.source ? <>
      <span className="multi-exec-bar-status" role="status">{t(capture.recording ? "macros.record.active" : "macros.record.paused", { source: capture.source.title, count: capture.steps.length })}</span>
      <button className="text-tool-button" type="button" onClick={edit}>{t("macros.record.review")}</button>
      <button className="text-tool-button" type="button" onClick={() => store.clear()}>{t("macros.record.discard")}</button>
      {capture.reason && capture.reason !== "stopped" ? <span className="multi-exec-bar-hint">{t(`macros.record.reason.${capture.reason}`)}</span> : null}
      {capture.omitHistory ? <span className="multi-exec-bar-hint">{t("macros.record.historyOmitted")}</span> : null}
    </> : null}
    {open ? <Suspense fallback={<span role="status">{t("commands.loading")}</span>}>
      <MacroDialog targets={selected} runtime={runtime} initialSteps={capture.steps} onClose={() => { setOpen(false); store.clear(); }} />
    </Suspense> : null}
    {recordingDialog ? <Suspense fallback={<span role="status">{t("commands.loading")}</span>}>
      <MacroRecordingDialog targets={selected} onClose={() => setRecordingDialog(false)} onStart={(target) => {
        if (!store.start(target)) return false;
        setRecordingDialog(false); onStartRecording?.(); return true;
      }} />
    </Suspense> : null}
  </>;
}
