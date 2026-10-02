import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { AppSelect } from "../../shared/ui/AppSelect";
import { groupOptions, type ConnectionGroup, type LegacyGroupReport, type LegacyGroupResolution } from "./connectionGroupModel";
import { groupErrorMessage } from "./useConnectionGroups";

/** 迁移证据与显式冲突处理；不在前端猜测或合并 canonical ID。 */
export default function LegacyGroupMigrationNotice({ report, groups, onResolve }: {
  report: LegacyGroupReport;
  groups: ConnectionGroup[];
  onResolve: (resolutions?: LegacyGroupResolution[]) => Promise<unknown>;
}) {
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
    <button type="button" onClick={show}>{report.complete ? "查看旧分组迁移报告" : "处理旧分组迁移"}</button>
    <Dialog.Root open={open} onOpenChange={(next) => { if (!busy) setOpen(next); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-backdrop" />
        <Dialog.Content className="connection-dialog" onInteractOutside={(event) => event.preventDefault()}>
          <header className="dialog-head">
            <Dialog.Title>旧分组迁移</Dialog.Title>
            <Dialog.Close asChild><button type="button" disabled={busy}>关闭</button></Dialog.Close>
          </header>
          <Dialog.Description className="dialog-subtitle">
            {report.complete ? "迁移已完成。后续启动不会重新应用旧树。" : "请逐行确认名称、父组和目标。选择已有分组会更新其名称、位置和颜色，连接仍归属于原 ID；新建分组不会转移已有连接。"}
          </Dialog.Description>
          <div className="dialog-body">
            <p>原文备份：{report.backup_path}</p>
            {report.issue ? <p className="pane-error" role="alert">{report.issue}</p> : null}
            {report.repairs.map((repair, index) => <p key={index}>{repair}</p>)}
            {report.complete ? report.mappings.map((mapping, index) => <p key={index}>{mapping.legacy_id} → {mapping.canonical_id}</p>) : draft.map((row) => <section className="dialog-section" key={row.index}>
              <h3 className="dialog-section-title">旧分组 {row.index + 1}：{report.rows[row.index].name}（{report.rows[row.index].id}）</h3>
              <label className="field"><span>名称</span><input disabled={busy} aria-label={`名称 ${row.index + 1}`} value={row.name} onChange={(event) => update(row.index, { name: event.target.value })} /></label>
              <label className="field"><span>父组</span><AppSelect disabled={busy} ariaLabel={`父组 ${row.index + 1}`} value={row.parent_index === null ? "" : String(row.parent_index)} options={[{ value: "", label: "根目录" }, ...draft.filter((candidate) => candidate.index !== row.index).map((candidate) => ({ value: String(candidate.index), label: `${candidate.index + 1}. ${candidate.name}` }))]} onChange={(value) => update(row.index, { parent_index: value === "" ? null : Number(value) })} /></label>
              <label className="field"><span>目标分组</span><AppSelect disabled={busy} ariaLabel={`目标分组 ${row.index + 1}`} value={row.target_id || ""} options={[{ value: "", label: "新建分组（不转移已有连接）" }, ...groupOptions(groups)]} onChange={(value) => update(row.index, { target_id: value || null })} /></label>
            </section>)}
            {error ? <p className="pane-error" role="alert">{error}</p> : null}
          </div>
          {!report.complete ? <footer className="dialog-actions"><button className="primary-button" type="button" disabled={busy} onClick={() => void apply()}>{busy ? "正在迁移…" : report.rows.length ? "确认映射并迁移" : "重试读取原数据"}</button></footer> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </>;
}
