import { useState } from "react";
import { useI18n } from "../../shared/i18n";
import { AppSelect } from "../../shared/ui/AppSelect";
import { WorkflowDialog } from "../../shared/ui/WorkflowDialog";
import type { MultiExecTarget } from "../workspace/multiExec/targets";

export function MacroRecordingDialog({ targets, onStart, onClose }: {
  targets: readonly MultiExecTarget[]; onStart(target: MultiExecTarget): boolean; onClose(): void;
}) {
  const { t } = useI18n();
  const [key, setKey] = useState("");
  const [error, setError] = useState(false);
  const source = targets.find((target) => target.key === key);
  return <WorkflowDialog title={t("macros.record.title")} description={t("macros.record.description")} onClose={onClose} actions={<>
    <span /><button type="button" onClick={onClose}>{t("common.cancel")}</button>
    <button className="primary-button" type="button" disabled={!source} onClick={() => { if (source && !onStart(source)) setError(true); }}>{t("macros.record.start")}</button>
  </>}>
    <AppSelect ariaLabel={t("macros.record.source")} value={key} options={[
      { value: "", label: t("macros.record.choose") }, ...targets.map((target) => ({ value: target.key, label: target.title })),
    ]} onChange={(value) => { setKey(value); setError(false); }} />
    <p className="dialog-subtitle">{t("macros.record.privacy")}</p>
    <p className="dialog-subtitle">{t("macros.record.replace")}</p>
    {error ? <p className="remote-file-dialog-error" role="alert">{t("macros.record.disconnected")}</p> : null}
  </WorkflowDialog>;
}
