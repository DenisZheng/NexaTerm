import { useI18n } from "../../shared/i18n";
import { safeDiagnosticId, type ConnectionFailureDiagnosis } from "./connectionFailureDiagnosis";
export function ConnectionFailureDetails({ diagnosis, nodeLabel, diagnosticId }: {
  diagnosis: ConnectionFailureDiagnosis; nodeLabel?: string; diagnosticId?: string;
}) {
  const { t } = useI18n();
  const id = safeDiagnosticId(diagnosticId);
  const network = ["timeout", "refused", "unreachable", "reset"].includes(diagnosis.reason);
  return <div className="connection-failure-details">
    <dl>
      <div><dt>{t("connectionDiagnosis.phase")}</dt><dd>{t(`connectionDiagnosis.stage.${diagnosis.stage}`)}</dd></div>
      <div><dt>{t(`connectionDiagnosis.node.${diagnosis.nodeRole}`)}</dt><dd>{nodeLabel || t("connectionDiagnosis.node.unspecified")}</dd></div>
    </dl>
    <p className="connection-step-error-tip">{t(`connectionDiagnosis.advice.${diagnosis.stage}`)}</p>
    {network && diagnosis.stage !== "unknown" ? <p className="connection-step-error-tip">{t(`connectionDiagnosis.reason.${diagnosis.reason as "timeout" | "refused" | "unreachable" | "reset"}`)}</p> : null}
    {id ? <small>{t("connectionDiagnosis.id", { id })}</small> : null}
  </div>;
}
