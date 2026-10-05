import { memo, useState } from "react";
import {
  Archive,
  ChevronDown,
  Clipboard,
  ExternalLink,
  FileText,
  Folder,
  FolderOpen,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { useI18n } from "../../shared/i18n";
import { Tooltip } from "../../shared/ui/Tooltip";
import {
  clearFinishedTransfers,
  useRemoteFileTransferStore,
} from "./remoteFileTransferStore";
import type { RemoteFileTransferItem } from "./remoteFileTransferTypes";
import {
  clampTransferProgress,
  formatTransferDetailTime,
  transferDirectionLabel,
  transferDisplayStatusLabel,
  transferFileTypeClass,
  transferFileTypeLabel,
  transferInlineErrorText,
  transferItemSizeText,
  transferKindLabel,
  transferSourcePath,
  transferTargetPath,
} from "./remoteFileTransferUtils";

interface RemoteFileTransferPanelProps {
  onCancel: (transferId: string) => void;
  onCopyPath: (path: string) => void;
  onRemove: (transferId: string) => void;
  onRetry: (transferId: string) => void;
  onOpenLocalPath: (path: string) => void;
  onRevealLocalPath: (path: string) => void;
}

export function RemoteFileTransferPanel(props: RemoteFileTransferPanelProps) {
  const { t } = useI18n();
  const transfers = useRemoteFileTransferStore((state) => state.items);
  const [expanded, setExpanded] = useState(false);
  const runningCount = transfers.filter((item) => item.status === "running").length;
  const queuedCount = transfers.filter((item) => item.status === "queued").length;
  const errorCount = transfers.filter((item) => item.status === "error").length;
  const finishedCount = transfers.filter((item) =>
    ["success", "skipped", "canceled"].includes(item.status),
  ).length;
  const summaryTransfer =
    transfers.find((item) => ["running", "queued"].includes(item.status)) ||
    transfers.find((item) => item.status === "error") ||
    transfers[0] ||
    null;
  const summaryProgress = summaryTransfer ? clampTransferProgress(summaryTransfer.progress) : 0;
  const summaryProgressText = summaryTransfer
    ? `${Math.round(summaryProgress).toString()}%`
    : t("files.transfer.idle");
  const summaryProgressScale = summaryProgress / 100;

  return (
    <section className={`transfer-panel ${expanded ? "open" : ""}`} aria-label={t("files.transfer.aria")}>
      <header className="transfer-panel-bar">
        <div className="transfer-panel-summary transfer-progress-summary">
          <strong>{t("files.transfer.title")}</strong>
          {runningCount > 0 ? <span className="transfer-chip running">{t("files.transfer.running", { count: runningCount })}</span> : null}
          {queuedCount > 0 ? <span className="transfer-chip">{t("files.transfer.queued", { count: queuedCount })}</span> : null}
          {errorCount > 0 ? <span className="transfer-chip error">{t("files.transfer.failed", { count: errorCount })}</span> : null}
          {transfers.length === 0 ? <span className="transfer-chip">{t("files.transfer.none")}</span> : null}
        </div>
        <div className="transfer-progress-mini" aria-hidden="true">
          <span style={{ transform: `scaleX(${summaryProgressScale.toString()})` }} />
        </div>
        <span className="transfer-panel-percent">{summaryProgressText}</span>
        <button
          className="transfer-panel-toggle"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? t("files.transfer.collapse") : t("files.transfer.expand")}
          <ChevronDown className="ui-icon" aria-hidden="true" />
        </button>
      </header>

      <div className="transfer-drawer">
        <div className="transfer-drawer-head">
          <strong>{t("files.transfer.queue")}</strong>
          <button type="button" disabled={finishedCount === 0} onClick={clearFinishedTransfers}>
            {t("files.transfer.clearFinished")}
          </button>
        </div>

        <div className="transfer-list">
          {transfers.length === 0 ? (
            <p className="file-panel-empty">{t("files.transfer.empty")}</p>
          ) : (
            transfers.map((item) => (
              <RemoteFileTransferRow
                item={item}
                key={item.id}
                onCancel={props.onCancel}
                onCopyPath={props.onCopyPath}
                onOpenLocalPath={props.onOpenLocalPath}
                onRemove={props.onRemove}
                onRetry={props.onRetry}
                onRevealLocalPath={props.onRevealLocalPath}
              />
            ))
          )}
        </div>
      </div>
    </section>
  );
}

const RemoteFileTransferRow = memo(function RemoteFileTransferRow({
  item,
  onCancel,
  onCopyPath,
  onRemove,
  onRetry,
  onOpenLocalPath,
  onRevealLocalPath,
}: RemoteFileTransferPanelProps & { item: RemoteFileTransferItem }) {
  const { t } = useI18n();
  const progressValue = clampTransferProgress(item.progress);
  const progressLabel = `${Math.round(progressValue).toString()}%`;
  const progressScale = progressValue / 100;
  const canRemove = item.status !== "queued" && item.status !== "running";
  const typeLabel = transferFileTypeLabel(item);
  const sizeText = transferItemSizeText(item);
  const statusText = transferDisplayStatusLabel(item);
  const fileTypeClass = transferFileTypeClass(item);
  const detailText = [
    t("files.transfer.detail.status", { value: statusText }),
    t("files.transfer.detail.stage", { value: item.stage }),
    t("files.transfer.detail.direction", { value: transferDirectionLabel(item.direction) }),
    t("files.transfer.detail.type", { value: transferKindLabel(item.kind) }),
    t("files.transfer.detail.progress", { value: progressLabel }),
    t("files.transfer.detail.size", { value: sizeText }),
    item.speedText ? t("files.transfer.detail.speed", { value: item.speedText }) : null,
    t("files.transfer.detail.created", { value: formatTransferDetailTime(item.createdAt) }),
    item.error ? t("files.transfer.detail.error", { value: item.error }) : null,
    t("files.transfer.detail.source", { value: transferSourcePath(item) }),
    t("files.transfer.detail.target", { value: transferTargetPath(item) }),
  ].filter(Boolean).join("\n");

  return (
    <article className={`transfer-item ${item.status}`}>
      <Tooltip label={detailText}>
        <div className={`transfer-type-icon ${fileTypeClass}`}>
          {item.kind === "directory" ? (
            <Folder className="ui-icon" aria-hidden="true" />
          ) : fileTypeClass === "archive" ? (
            <Archive className="ui-icon" aria-hidden="true" />
          ) : (
            <FileText className="ui-icon" aria-hidden="true" />
          )}
          {typeLabel ? <span>{typeLabel}</span> : null}
        </div>
      </Tooltip>

      <div className="transfer-item-main">
        <div className="transfer-item-title">
          <strong title={item.name}>{item.name}</strong>
        </div>
        <div className="transfer-item-meta">
          <span className="transfer-tag direction">
            {item.direction === "upload" ? t("files.transfer.direction.upload") : t("files.transfer.direction.download")}
          </span>
          <span className={`transfer-status-dot ${item.status}`} aria-hidden="true" />
          <span className="transfer-size-text" title={sizeText}>
            {sizeText}
          </span>
          {item.speedText ? <span className="transfer-speed-text">{item.speedText}</span> : null}
        </div>
        {item.status === "error" && item.error ? (
          <p className="transfer-item-error" title={item.error}>
            {transferInlineErrorText(item.error)}
          </p>
        ) : null}
      </div>

      <div className="transfer-item-actions">
        <Tooltip label={t("files.transfer.copyPath")}>
          <button
            type="button"
            aria-label={t("files.transfer.copyPathAria", { name: item.name })}
            onClick={() => onCopyPath(item.localPath || item.remotePath)}
          >
            <Clipboard className="ui-icon" aria-hidden="true" />
          </button>
        </Tooltip>
        {item.localPath && item.kind !== "directory" ? (
          <Tooltip label={t("files.transfer.open")}>
            <button
              type="button"
              aria-label={t("files.transfer.openAria", { name: item.name })}
              onClick={() => onOpenLocalPath(item.localPath || "")}
            >
              <ExternalLink className="ui-icon" aria-hidden="true" />
            </button>
          </Tooltip>
        ) : null}
        {item.localPath ? (
          <Tooltip label={t("files.transfer.reveal")}>
            <button
              type="button"
              aria-label={t("files.transfer.revealAria", { name: item.name })}
              onClick={() => onRevealLocalPath(item.localPath || "")}
            >
              <FolderOpen className="ui-icon" aria-hidden="true" />
            </button>
          </Tooltip>
        ) : null}
        {item.status === "error" && item.retry ? (
          <Tooltip label={t("files.transfer.retry")}>
            <button type="button" aria-label={t("files.transfer.retryAria", { name: item.name })} onClick={() => onRetry(item.id)}>
              <RefreshCw className="ui-icon" aria-hidden="true" />
            </button>
          </Tooltip>
        ) : null}
        {item.status === "queued" || item.status === "running" ? (
          <Tooltip label={t("files.transfer.cancel")}>
            <button type="button" aria-label={t("files.transfer.cancelAria", { name: item.name })} onClick={() => onCancel(item.id)}>
              <X className="ui-icon" aria-hidden="true" />
            </button>
          </Tooltip>
        ) : null}
        {canRemove ? (
          <Tooltip label={t("files.transfer.remove")}>
            <button
              type="button"
              aria-label={t("files.transfer.removeAria", { name: item.name })}
              onClick={() => onRemove(item.id)}
            >
              <Trash2 className="ui-icon" aria-hidden="true" />
            </button>
          </Tooltip>
        ) : null}
      </div>

      <div className="transfer-progress-line">
        <div
          className={`transfer-progress ${item.progressIndeterminate ? "indeterminate" : ""}`}
          role="progressbar"
          aria-label={`${item.name} ${item.stage}`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={Math.round(progressValue)}
        >
          <span style={{ transform: `scaleX(${progressScale.toString()})` }} />
        </div>
        <span className="transfer-progress-text">{progressLabel}</span>
        <span className="transfer-progress-status">{statusText}</span>
      </div>
    </article>
  );
});
