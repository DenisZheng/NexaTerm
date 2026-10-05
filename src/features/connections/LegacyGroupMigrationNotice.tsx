import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useState } from "react";
import { useI18n } from "../../shared/i18n";
import { AppSelect } from "../../shared/ui/AppSelect";
import { groupOptions, type ConnectionGroup, type LegacyGroupReport, type LegacyGroupResolution } from "./connectionGroupModel";
import { groupErrorMessage } from "./useConnectionGroups";

/** 迁移证据与显式冲突处理；不在前端猜测或合并 canonical ID。 */
export default function LegacyGroupMigrationNotice({ report, groups, onResolve }: {
  report: LegacyGroupReport;
  groups: ConnectionGroup[];
  onResolve: (resolutions?: LegacyGroupResolution[]) => Promise<unknown>;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<LegacyGroupResolution[]>([]);
  if (report.complete && !report.rows.length && !report.repairs.length) return null;
  function show() {
    setDraft(report.rows.map((row, index) => {
      const parents = report.rows.flatMap((candidate, i) => candidate.id === row.parentId ? [i] : []);
      return { index, name: row.name, parent_index: parents.length === 1 && parents[0] !== index ? parents[0] : null, target_id: null };
    }));
    setError(null);
    setOpen(true);
  }
  function update(index: number, change: Partial<LegacyGroupResolution>) {
    setDraft((previous) => previous.map((row) => row.index === index ? { ...row, ...change } : row));
  }
  async function apply() {
    setBusy(true);
    setError(null);
    try { await onResolve(report.rows.length ? draft : undefined); setOpen(false); }
    catch (cause) { setError(groupErrorMessage(cause)); }
    finally { setBusy(false); }
  }
  return <>
    <button type="button" onClick={show}>{report.complete ? t("legacyGroups.showReport") : t("legacyGroups.process")}</button>
    <Dialog.Root open={open} onOpenChange={(next) => { if (!busy) setOpen(next); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-backdrop" />
        <Dialog.Content className="connection-dialog legacy-group-migration-dialog" onInteractOutside={(event) => event.preventDefault()}>
          <header className="dialog-head">
            <div className="dialog-title-group"><Dialog.Title asChild><strong>{t("legacyGroups.title")}</strong></Dialog.Title></div>
            <Dialog.Close asChild><button className="dialog-close-button" type="button" aria-label={t("legacyGroups.close")} disabled={busy}><X className="ui-icon" aria-hidden="true" /></button></Dialog.Close>
          </header>
          <Dialog.Description className="dialog-subtitle">
            {report.complete ? t("legacyGroups.description.complete") : t("legacyGroups.description.pending")}
          </Dialog.Description>
          <div className="dialog-body">
            <p>{t("legacyGroups.backup", { path: report.backup_path })}</p>
            {report.issue ? <p className="pane-error" role="alert">{report.issue}</p> : null}
            {report.repairs.map((repair, index) => <p key={index}>{repair}</p>)}
            {report.complete ? report.mappings.map((mapping, index) => <p key={index}>{mapping.legacy_id} → {mapping.canonical_id}</p>) : draft.map((row) => <section className="dialog-section" key={row.index}>
              <h3 className="dialog-section-title">{t("legacyGroups.row", { index: row.index + 1, name: report.rows[row.index].name, id: report.rows[row.index].id })}</h3>
              <label className="field"><span>{t("legacyGroups.name")}</span><input disabled={busy} aria-label={t("legacyGroups.nameAria", { index: row.index + 1 })} value={row.name} onChange={(event) => update(row.index, { name: event.target.value })} /></label>
              <label className="field"><span>{t("legacyGroups.parent")}</span><AppSelect disabled={busy} ariaLabel={t("legacyGroups.parentAria", { index: row.index + 1 })} value={row.parent_index === null ? "" : String(row.parent_index)} options={[{ value: "", label: t("legacyGroups.root") }, ...draft.filter((candidate) => candidate.index !== row.index).map((candidate) => ({ value: String(candidate.index), label: `${candidate.index + 1}. ${candidate.name}` }))]} onChange={(value) => update(row.index, { parent_index: value === "" ? null : Number(value) })} /></label>
              <label className="field"><span>{t("legacyGroups.target")}</span><AppSelect disabled={busy} ariaLabel={t("legacyGroups.targetAria", { index: row.index + 1 })} value={row.target_id || ""} options={[{ value: "", label: t("legacyGroups.newTarget") }, ...groupOptions(groups)]} onChange={(value) => update(row.index, { target_id: value || null })} /></label>
            </section>)}
            {error ? <p className="pane-error" role="alert">{error}</p> : null}
          </div>
          {!report.complete ? <footer className="dialog-actions"><button className="primary-button" type="button" disabled={busy} onClick={() => void apply()}>{busy ? t("legacyGroups.migrating") : report.rows.length ? t("legacyGroups.apply") : t("legacyGroups.retry")}</button></footer> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </>;
}
